'use strict'

// log on files
const logger = require('console-files')

// JSON Schema validation with AJV
// based on http://json-schema.org/
const Ajv = require('ajv')
const { validateOptions, errorHandling } = require('./../lib/Ajv.js')
const ajv = Ajv({ allErrors: true })

// REST clients
const Api = require('./../lib/Api.js')
const Modules = require('./../lib/Modules.js')

// cache list apps and no params modules results
const appsCache = {}
const resultsCache = {}
// control reverse requests to apps endpoints
const runningReqs = {}

function runModule (params, respond, storeId, modName, validate, responseValidate, appId) {
  // ajv
  const isEmptyParams = (!params || !Object.keys(params).length)
  const valid = validate(params)
  if (!valid) {
    // logger.log(validate.errors)
    errorHandling(validate.errors, respond, modName)
  } else {
    // list module packages
    let canCache = true
    const cacheKey = `${storeId}:${modName}`
    let endpoint = 'applications.json' +
      '?state=active' +
      '&type=external' +
      '&modules.' + modName + '.enabled=true' +
      '&fields=_id,app_id,version,data,hidden_data,modules.' + modName
    if (appId && (typeof appId === 'number' || (typeof appId === 'string' && /^\d+$/.test(appId)))) {
      canCache = false
      endpoint += `&app_id=${appId}&limit=1`
    }
    const method = 'GET'
    const body = null

    let canCacheResults
    if (canCache && isEmptyParams) {
      if (resultsCache[cacheKey]) {
        // cached response
        return respond(resultsCache[cacheKey], params)
      }
      canCacheResults = true
    }

    const errorCallback = (err, statusCode, devMsg) => {
      // not successful API call
      // send error response
      if (err) {
        logger.error(err)
        respond({}, null, 500, 'MOD801')
      } else {
        if (typeof statusCode !== 'number') {
          statusCode = 400
        }
        respond({}, null, statusCode, 'MOD802', devMsg)
      }
    }

    const successCallback = (body) => {
      // https://ecomstore.docs.apiary.io/#reference/applications/all-applications/list-all-store-applications
      const list = body.result
      if (Array.isArray(list)) {
        if (canCache && !appsCache[cacheKey]) {
          appsCache[cacheKey] = body
          setTimeout(() => {
            appsCache[cacheKey] = null
            delete appsCache[cacheKey]
          }, list.length ? 60000 : 3000)
        }

        const results = []
        let waitReqs = list.length
        if (waitReqs > 0) {
          // count packages done
          let done = 0
          // logger.log(modName)
          // logger.log(num)

          const requestTimers = []
          for (let i = 0; i < list.length; i++) {
            // ok, proceed to modules
            const application = list[i]
            // declare data objects to prevent applications fatal errors
            if (!application.hidden_data) {
              application.hidden_data = {}
            }
            if (!application.data) {
              application.data = {}
            }

            // mount request body to POST to module endpoint
            const body = {
              module: modName,
              params,
              application
            }
            // logger.log(body)
            const url = application.modules[modName].endpoint
            // handle request with big timeout if app ID was specified
            const bigTimeout = !!(appId)

            if (runningReqs[storeId] === undefined) {
              runningReqs[storeId] = 0
            }
            if (runningReqs[url] === undefined) {
              runningReqs[url] = 0
            }
            const reqDelay = 5 + Math.max(runningReqs[storeId] * 20, runningReqs[url] * 100)
            if (reqDelay > 3000) {
              if (waitReqs === 1) {
                return respond({}, null, 429, 'MOD503')
              }
              waitReqs--
              continue
            }
            runningReqs[storeId]++
            runningReqs[url]++

            requestTimers.push(setTimeout(() => {
              // count request->response time
              const reqStartTime = Date.now()
              Modules(url, body, storeId, bigTimeout, (err, response) => {
                runningReqs[storeId]--
                runningReqs[url]--

                // mount result object
                const result = {
                  _id: application._id,
                  app_id: application.app_id,
                  queue_took: reqDelay,
                  took: Date.now() - reqStartTime,
                  version: application.version,
                  validated: false,
                  response_errors: null,
                  error: false,
                  error_message: null,
                  response
                }

                if (err) {
                  // logger.error(err)
                  result.error = true
                  result.error_message = err.message
                  // @TODO: debug app error
                } else if (typeof response === 'object' && response !== null) {
                  // logger.log(response)
                  // validate response object
                  result.validated = responseValidate(response)
                  if (!result.validated) {
                    result.response_errors = ajv.errorsText(responseValidate.errors, {
                      separator: '\n'
                    })
                  }
                }
                results.push(result)

                done++
                if (done === waitReqs) {
                  // all done
                  // params obj as response 'meta'
                  if (!results.find(({ response }) => response)) {
                    respond(results, params, 409, 'MOD513')
                  } else {
                    respond(results, params)

                    if (canCacheResults && !resultsCache[cacheKey]) {
                      resultsCache[cacheKey] = results
                      setTimeout(() => {
                        resultsCache[cacheKey] = null
                        delete resultsCache[cacheKey]
                      }, 60000)
                    }
                  }
                }
              }, parseInt(Math.random() * 1000000))
            }, reqDelay))
          }
        } else {
          // no packages
          respond(results, params)
        }
      }
    }

    if (canCache && appsCache[cacheKey]) {
      successCallback(appsCache[cacheKey])
    } else {
      Api(endpoint, method, body, storeId, errorCallback, successCallback)
    }
  }
}

function post ([id, meta, body, respond, storeId], modName, validate, responseValidate) {
  // run module with JSON body as object
  // logger.log(body)
  runModule(body, respond, storeId, modName, validate, responseValidate, meta.query.app_id)
}

function get ([id, meta, , respond, storeId], modName, validate, schema, responseValidate, responseSchema) {
  if (id) {
    switch (id) {
      case 'schema':
        // return JSON Schema
        respond(Object.assign({
          $schema: 'http://json-schema.org/draft-06/schema#',
          title: 'Module `' + modName + '`: Input model'
        }, schema))
        break

      case 'response_schema':
        // return module packages responses JSON Schema
        respond(Object.assign({
          $schema: 'http://json-schema.org/draft-06/schema#',
          title: 'Module `' + modName + '`: Response model'
        }, responseSchema))
        break

      default:
        respond({}, null, 406, 'MOD101', 'Resource ID is acceptable only to JSON schema, at /' + modName + '/schema.json')
    }
  } else {
    // run module with query params as object
    runModule(meta.query, respond, storeId, modName, validate, responseValidate)
  }
}

// setup all modules with same methods
module.exports = (modName, schema, responseSchema) => {
  // validate request body
  const validate = Ajv(validateOptions).compile(schema)
  // validate package response body
  const responseValidate = Ajv(validateOptions).compile(responseSchema)

  return {
    GET: function () {
      get(arguments, modName, validate, schema, responseValidate, responseSchema)
    },
    POST: function () {
      post(arguments, modName, validate, responseValidate)
    }
  }
}

'use strict'

// log on files
const logger = require('console-files')

// Node raw HTTP module
const http = require('http')
const https = require('https')

// Store API
let host
let baseUri
let port

function requestEnd (res, rawData, errorCallback, successCallback) {
  let str, err
  switch (res.statusCode) {
    case 200:
    case 201:
    case 204:
      successCallback()
      break
    case 412:
      // no store found with provided ID
      errorCallback(null, 412, 'Invalid store ID')
      break
    default:
      // unexpected status code
      str = 'Unexpected response status code from Store API' +
        '\nStatus: ' + res.statusCode +
        '\nResponse: ' + rawData
      err = new Error(str)
      err.statusCode = res.statusCode
      errorCallback(err)
  }
}

// read config file
require('./../lib/Config.js')((config) => {
  // config REST API
  host = config.apiHost
  if (!config.apiBaseUri) {
    // current Store API version
    baseUri = '/v1/'
  } else {
    baseUri = config.apiBaseUri
  }
  port = config.apiPort
})

const request = (
  client,
  options,
  body,
  errorCallback,
  successCallback
) => {
  const req = client.request(options, (res) => {
    let rawData = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => { rawData += chunk })
    res.on('end', () => {
      requestEnd(res, rawData, errorCallback, () => {
        // OK
        let parsedData
        if (rawData) {
          try {
            parsedData = JSON.parse(rawData)
          } catch (e) {
            // not a valid JSON
            // callback without response body
            errorCallback(e)
            return
          }
        }
        if (typeof successCallback === 'function') {
          // pass parsed JSON
          successCallback(parsedData)
        }
      })
    })
  })
  req.on('error', errorCallback)
  if (body) {
    // write data to request body
    req.write(JSON.stringify(body))
  }
  req.end()
}

module.exports = (
  endpoint,
  method,
  body,
  storeId,
  errorCallback,
  successCallback,
  publicApi = false,
  canRetry = true
) => {
  const options = {
    hostname: !publicApi ? host : 'api.e-com.plus',
    path: baseUri + endpoint,
    method: method,
    headers: {
      'X-Store-ID': storeId
    }
  }
  if (!publicApi && port) {
    options.port = port
  }
  const client = !publicApi ? http : https

  let retries = 0
  const maxRetries = canRetry
    ? endpoint.startsWith('orders') ? 2 : 1
    : 0
  const requestWithRetry = () => {
    request(
      client,
      options,
      body,
      (err) => {
        if (err instanceof Error && !(err.statusCode < 500) && retries < maxRetries) {
          retries++
          setTimeout(() => {
            requestWithRetry()
          }, retries * (publicApi ? 600 : 1000))
          return
        }
        if (typeof errorCallback === 'function') {
          errorCallback(err)
        } else {
          // no callback
          // just log the unexpected error
          logger.error(err)
        }
      },
      successCallback
    )
  }
  requestWithRetry()
}

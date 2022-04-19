'use strict'

// log on files
const logger = require('console-files')
// https://www.npmjs.com/package/rest-auto-router
const restAutoRouter = require('rest-auto-router')

// web server configuration
const conf = {
  // path to routes folder
  'path': process.cwd() + '/routes/',
  // listened tcp port
  // should be opened for localhost only
  'port': 3000,
  // part of the URL to be deleted in routing
  // like RewriteBase of Apache Httpd mod_rewrite
  'base_uri': '/api/v1/',
  // must be configured in common with proxy server
  'proxy': {
    // request timeout in ms
    'timeout': 30000,
    // X-Authentication header
    'auth': 'FnN3sT4'
  },
  // default error messages
  // used when messages are null
  'error_messages': {
    'dev': 'Unknow error',
    'usr': {
      'en_us': 'Unexpected error, report to support or responsible developer',
      'pt_br': 'Erro inesperado, reportar ao suporte ou desenvolvedor responsável'
    }
  },
  // allow clients to specify what fields to receive from resource
  // if true, response should vary by http param 'fields'
  'vary_fields': false
}

function middleware (id, meta, body, respond, req, res, resource, verb, endpoint) {
  // function called before endpoints
  // authentications and other prerequisites when necessary
  if (typeof req.headers['x-real-ip'] === 'string') {
    // get real ip
    const browserIp = req.headers['x-real-ip'] 
    // requires store ID
    let storeId
    if (meta.query.hasOwnProperty('store_id')) {
      storeId = meta.query.store_id
      delete meta.query.store_id
    } else {
      // default for X-Store-ID header
      storeId = req.headers['x-store-id']
    }
    if (typeof storeId === 'string') {
      storeId = parseInt(storeId, 10)
    }
    if (typeof storeId !== 'number' || isNaN(storeId)) {
      // invalid ID string
      respond({}, null, 403, 121, 'Undefined or invalid Store ID')
      return
    }
    // pass to endpoint
    endpoint(id, meta, body, respond, storeId, browser_ip)
  } else {
    respond({}, null, 403, 100, 'Who are you? Unknown IP address')
  }
}

// read config file
require('./../lib/Config.js')((config) => {
  // setup web app
  if (config.proxyAuthHeader) {
    conf.proxy.auth = config.proxyAuthHeader
  }
  if (config.proxyPort) {
    conf.port = config.proxyPort
  }
  if (config.proxyBaseUri) {
    conf.base_uri = config.proxyBaseUri
  }

  // start web application
  // recieve requests from Nginx by reverse proxy
  restAutoRouter(conf, middleware, logger)

  // debug
  logger.log('Running Mods REST API on port ' + conf.port)
})

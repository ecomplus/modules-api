'use strict'

// log on files
const logger = require('console-files')

// authenticated REST client
const Api = require(process.cwd() + '/lib/Api')
const { objectId } = require(process.cwd() + '/lib/Utils')

module.exports = (customer, storeId, callback) => {
  const noCustomer = err => {
    // cannot read or create order customer
    if (err) {
      logger.error(err)
    }
    // proceed order with a new random customer ID
    // customer saved on order only
    returnId(objectId())
  }

  const returnId = id => {
    if (typeof callback === 'function') {
      callback(id)
    } else {
      // debug only
      customer._id = id
      logger.log(customer)
    }
  }

  if (!customer._id) {
    // try to find customer by e-mail
    // GET customer object
    const endpoint = 'customers.json?fields=_id,enabled&main_email=' + customer.main_email
    Api(endpoint, 'GET', null, storeId, noCustomer, ({ result }) => {
      if (result.length) {
        if (result.find(({ enabled }) => enabled === false)) {
          returnId(false)
          return
        }
        // use first resulted customer ID
        returnId(result[0]._id)
      } else {
        const createCustomer = () => {
          // try to create new customer
          Api('customers.json', 'POST', customer, storeId, noCustomer, body => {
            // add created ID to order customer
            returnId(body._id)
          })
        }
        if (customer.doc_number) {
          const endpoint = 'customers.json?fields=_id&limit=1&enabled=false&doc_number=' + customer.doc_number
          Api(endpoint, 'GET', null, storeId, createCustomer, ({ result }) => {
            if (result.length) {
              // customer doc number is blocked
              returnId(false)
              return
            }
            createCustomer()
          })
        } else {
          createCustomer()
        }
      }
    })
  } else {
    // customer ID already defined
    const endpoint = 'customers.json?fields=_id&limit=1&enabled=false' +
      (customer.doc_number ? `&doc_number=${customer.doc_number}` : `&_id=${customer._id}`)
    Api(endpoint, 'GET', null, storeId, noCustomer, ({ result }) => {
      if (result.length) {
        // customer doc number or ID is blocked
        returnId(false)
        return
      }
      returnId(customer._id)
    })
  }
}

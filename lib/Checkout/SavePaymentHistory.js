'use strict'

// Log on files
const logger = require('console-files')

// Authenticated Rest client
const Api = require(process.cwd() + 'lib/Api')

module.exports = (paymentHistoryBody, orderId, storeId) => {
    // Add payment_history to order body
    let endpoint = 'orders/' + orderId + '/transactions.json'
    let endpointPayment = 'orders/' + orderId + '/payment_history.json'

    Api(endpoint, 'GET', null, storeId, err, ({ result }) => {
        if (err) { // Failed
            logger.error(err)
        }
        paymentHistoryBody = {
            "payment_history.status" : result.transactions.status.current
        }
        Api(endpointPayment, 'POST', paymentHistoryBody, storeId, err ={
            if (err) {
                logger.error(err)
            }
        })
    })
}
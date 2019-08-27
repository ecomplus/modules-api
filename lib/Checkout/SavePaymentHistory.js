'use strict'

// Log on files
const logger = require('console-files')

// Authenticated Rest client
const Api = require(process.cwd() + 'lib/Api')

module.exports = (transactionBody, orderId, storeId) => {
    // Add payment_history to order body
    let endpoint = 'orders/' + orderId + '/transactions.json'
    let endpointPayment = 'orders/' + orderId + '/payment_history.json'

    paymentHistoryBody = {
        "payment_history.status" : transactionBody.status.current
    }
    Api(endpointPayment, 'POST', paymentHistoryBody, storeId, err ={
        if (err) {
            logger.error(err)
        }
    })
}
'use strict'

// deep objects clone util
const cloneDeep = require('lodash.clonedeep')
// log on files
const logger = require('console-files')

// checkout API parser libs
const fixItems = require('./../lib/Checkout/FixItems')
const getCustomerId = require('./../lib/Checkout/GetCustomerId')
const newOrder = require('./../lib/Checkout/NewOrder')
const saveTransaction = require('./../lib/Checkout/SaveTransaction')

// authenticated REST client
const Api = require('./../lib/Api')
const { objectId } = require('./../lib/Utils')

// handle other modules endpoints directly
const calculateShipping = require('./calculate_shipping').POST
const listPayments = require('./list_payments').POST
const applyDiscount = require('./apply_discount').POST
const createTransaction = require('./create_transaction').POST

// abstraction to calculate shipping and create transaction
const simulateRequest = (checkoutBody, checkoutRespond, label, storeId, callback) => {
  // select module to handle by label param
  let moduleHandler, moduleBody
  switch (label) {
    case 'shipping':
      moduleHandler = calculateShipping
      moduleBody = checkoutBody.shipping
      break
    case 'payment':
      moduleHandler = listPayments
      moduleBody = checkoutBody.transaction
      break
    case 'discount':
      moduleHandler = applyDiscount
      moduleBody = checkoutBody.discount
      break
    case 'transaction':
      moduleHandler = createTransaction
      moduleBody = checkoutBody.transaction
  }

  if (moduleBody && moduleBody.app_id) {
    // mask request objects
    const reqId = null
    const reqMeta = {
      query: {
        app_id: moduleBody.app_id
      }
    }
    // mount request body with received checkout body object
    const reqBody = cloneDeep({
      ...checkoutBody,
      ...moduleBody,
      is_checkout_confirmation: true
    })
    // handle response such as REST Auto Router
    // https://www.npmjs.com/package/rest-auto-router#callback-params
    const reqRespond = (obj, meta, statusCode, errorCode, devMsg, usrMsg) => {
      if (obj && !errorCode && typeof callback === 'function') {
        // OK
        callback(obj)
      } else {
        // pass the response
        devMsg = `Error on '${label}': ${devMsg} (${errorCode})`
        checkoutRespond(obj || {}, null, statusCode || 400, 'CKT900', devMsg, usrMsg)
      }
    }

    // simulate request to module endpoint
    moduleHandler(reqId, reqMeta, reqBody, reqRespond, storeId)
  } else {
    // ignore
    callback()
  }
}

// filter modules response
const getValidResults = (results, checkProp) => {
  // results array returned from module
  // see ./#applications.js
  const validResults = []
  if (Array.isArray(results)) {
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.validated) {
        if (checkProp) {
          // validate one property from response object
          const responseProp = result.response[checkProp]
          if (!responseProp || (Array.isArray(responseProp) && !responseProp.length)) {
            // try next module result
            continue
          }
        }
        // use it
        validResults.push(result)
      }
    }
  }
  return validResults
}

module.exports = (checkoutBody, checkoutRespond, storeId) => {
  // valid body
  // handle checkout with shipping and transaction options
  // get each cart item first
  const countCheckoutItems = checkoutBody.items.length
  fixItems(checkoutBody.items, storeId, items => {
    // all items done
    const respondInvalidItems = () => {
      const devMsg = 'Cannot handle checkout, any valid cart item'
      checkoutRespond({}, null, 400, 'CKT801', devMsg)
    }

    if (items.length) {
      checkoutBody.items = items
      // start mounting order body
      // https://developers.e-com.plus/docs/api/#/store/orders/orders
      const customer = checkoutBody.customer
      const dateTime = new Date().toISOString()
      const orderBody = {
        opened_at: dateTime,
        buyers: [
          // received customer info
          customer
        ],
        items: []
      }
      // bypass some order fields
      ;[
        'utm',
        'affiliate_code',
        'browser_ip',
        'client_user_agent',
        'channel_id',
        'channel_type',
        'domain',
        'notes'
      ].forEach(field => {
        if (checkoutBody[field]) {
          orderBody[field] = checkoutBody[field]
        }
      })
      if (orderBody.domain) {
        // consider default Storefront app routes
        if (!orderBody.checkout_link) {
          orderBody.checkout_link = `https://${orderBody.domain}/app/#/checkout/(_id)`
        }
        if (!orderBody.status_link) {
          orderBody.status_link = `https://${orderBody.domain}/app/#/order/(_id)`
        }
      }

      // count subtotal value
      let subtotal = 0
      items.forEach(item => {
        subtotal += (item.final_price * item.quantity)
        // pass each item to prevent object overwrite
        const orderItem = Object.assign({}, item)
        delete orderItem.categories
        delete orderItem.brands
        orderBody.items.push(orderItem)
      })
      if (subtotal <= 0 && items.length < countCheckoutItems) {
        return respondInvalidItems()
      }
      const amount = {
        subtotal,
        discount: 0,
        freight: 0,
        extra: 0
      }

      const fixAmount = () => {
        for (const field in amount) {
          if (amount[field] > 0 && field !== 'total') {
            amount[field] = Math.round(amount[field] * 100) / 100
          }
        }
        amount.total = Math.round((amount.subtotal + amount.freight + amount.extra - amount.discount) * 100) / 100
        if (amount.total < 0) {
          amount.total = 0
        }
        // also save amount to checkout and order body objects
        checkoutBody.amount = amount
        orderBody.amount = amount
      }
      fixAmount()
      checkoutBody.subtotal = subtotal

      const createOrder = () => {
        // start creating new order to API
        getCustomerId(customer, storeId, customerId => {
          if (!customerId) {
            // user is blocked
            const usrMsg = {
              en_us: 'Your account is blocked for new orders',
              pt_br: 'Sua conta está bloqueada para novos pedidos'
            }
            const devMsg = 'Buyer is blocked'
            checkoutRespond({}, null, 403, 'CKT903', devMsg, usrMsg)
            return
          }

          const transactions = Array.isArray(checkoutBody.transaction)
            ? checkoutBody.transaction
            : [checkoutBody.transaction]
          // add customer ID to order and transaction
          customer._id = customerId
          transactions.forEach(({ buyer }) => {
            if (buyer) {
              buyer.customer_id = customerId
            }
          })

          // handle new order
          const errorCallback = (err, statusCode, devMsg) => {
            // not successful API call
            const usrMsg = {
              en_us: 'There was a problem saving your order, please try again later',
              pt_br: 'Houve um problema ao salvar o pedido, por favor tente novamente mais tarde'
            }
            // send error response
            if (err) {
              logger.error(err)
              checkoutRespond({}, null, 409, 'CKT701', usrMsg)
            } else {
              if (typeof statusCode !== 'number') {
                statusCode = 400
              }
              checkoutRespond({}, null, statusCode, 'CKT702', devMsg, usrMsg)
            }
          }

          newOrder(orderBody, storeId, errorCallback, order => {
            const orderId = order._id
            const orderNumber = order.number

            const errorCallback = (err, statusCode, devMsg) => {
              // not successful API call
              const usrMsg = {
                en_us: 'Your order was saved, but we were unable to make the payment, ' +
                  'please contact us',
                pt_br: 'Seu pedido foi salvo, mas não conseguimos efetuar o pagamento, ' +
                  'por favor entre em contato'
              }
              // send error response
              if (err) {
                logger.error(err)
                checkoutRespond({}, null, 409, 'CKT703', null, usrMsg)
              } else {
                if (typeof statusCode !== 'number') {
                  statusCode = 409
                }
                checkoutRespond({}, null, statusCode, 'CKT704', devMsg, usrMsg)
              }
            }

            let isOrderCancelled = false
            const cancelOrder = (staffNotes, errorMessage) => {
              if (!isOrderCancelled) {
                setTimeout(() => {
                  const body = {
                    status: 'cancelled',
                    staff_notes: staffNotes
                  }
                  if (errorMessage) {
                    body.staff_notes += ` - \`${errorMessage.substring(0, 200)}\``
                  }
                  Api('orders/' + orderId + '.json', 'PATCH', body, storeId)
                }, 400)
              }
              isOrderCancelled = true
            }

            let countDone = 0
            let paymentsAmount = 0
            let loyaltyPointsBalance = 0
            const paymentHistory = []
            const nextTransaction = (index = 0) => {
              const transaction = transactions[index]
              // logger.log('transaction')
              // logger.log(number)

              // merge objects to create transaction request body
              const transactionBody = {
                ...checkoutBody,
                transaction,
                order_id: orderId,
                order_number: orderNumber,
                // also need shipping address
                // send from shipping object if undefined on transaction object
                to: { ...checkoutBody.shipping.to },
                ...transaction,
                amount: { ...amount }
              }
              if (transactionBody.amount && transaction.amount_part > 0 && transaction.amount_part < 1) {
                // fix amount for multiple transactions
                const partialAmount = transactionBody.amount.total * transaction.amount_part
                transactionBody.amount.discount += transactionBody.amount.total - partialAmount
                transactionBody.amount.total = partialAmount
                if (transactionBody.payment_method.code === 'loyalty_points') {
                  loyaltyPointsBalance += partialAmount
                }
                delete transactionBody.amount_part
              }
              // logger.log(JSON.stringify(transactionBody, null, 2))
              // logger.log(JSON.stringify(checkoutBody, null, 2))

              // finally pass to create transaction
              simulateRequest(transactionBody, checkoutRespond, 'transaction', storeId, results => {
                const isFirstTransaction = index === 0
                let isDone
                // logger.log(results)
                const validResults = getValidResults(results, 'transaction')
                for (let i = 0; i < validResults.length; i++) {
                  const result = validResults[i]
                  // treat transaction response
                  const response = result.response
                  let transaction
                  if (response && (transaction = response.transaction)) {
                    // complete transaction object with some request body fields
                    ;[
                      'type',
                      'payment_method',
                      'payer',
                      'currency_id',
                      'currency_symbol'
                    ].forEach(field => {
                      if (transactionBody[field] !== undefined && transaction[field] === undefined) {
                        transaction[field] = transactionBody[field]
                      }
                    })

                    if (transaction.amount > amount.total) {
                      amount.extra += (transaction.amount - amount.total)
                      fixAmount()
                    }

                    // setup transaction app object
                    if (!transaction.app) {
                      transaction.app = { _id: result._id }
                      // complete app object with some request body fields
                      const transactionOptions = Array.isArray(checkoutBody.transaction)
                        ? checkoutBody.transaction.find(transaction => transaction.app_id === result._id)
                        : checkoutBody.transaction
                      if (transactionOptions) {
                        ;[
                          'label',
                          'icon',
                          'intermediator',
                          'payment_url'
                        ].forEach(field => {
                          if (transactionOptions[field] !== undefined) {
                            transaction.app[field] = transactionOptions[field]
                          }
                        })
                      }
                      // logger.log(transaction.app)
                    }

                    // check for transaction status
                    if (!transaction.status) {
                      transaction.status = {
                        current: 'pending'
                      }
                    }
                    transaction.status.updated_at = dateTime

                    if (isFirstTransaction) {
                      // merge transaction body with order info and respond
                      checkoutRespond({
                        order: {
                          _id: orderId,
                          number: orderNumber
                        },
                        transaction
                      })
                    }

                    // save transaction info on order data
                    saveTransaction(transaction, orderId, storeId, (err, transactionId) => {
                      if (!err) {
                        // add entry to payments history
                        const paymentEntry = {
                          _id: objectId(),
                          transaction_id: transactionId,
                          status: transaction.status.current,
                          date_time: dateTime,
                          flags: ['checkout']
                        }
                        paymentHistory.push(paymentEntry)
                        setTimeout(() => {
                          const body = {
                            payments_history: paymentHistory
                          }
                          if (isFirstTransaction) {
                            body.financial_status = {
                              current: paymentEntry.status,
                              updated_at: dateTime
                            }
                          }
                          if (loyaltyPointsBalance > 0) {
                            const balance = Math.round(loyaltyPointsBalance * 100) / 100
                            body.amount = {
                              ...amount,
                              balance,
                              total: amount.total - balance
                            }
                          }
                          Api('orders/' + orderId + '.json', 'PATCH', body, storeId)
                        }, isFirstTransaction ? 200 : 400)
                      }
                      index++
                      if (index < transactions.length) {
                        nextTransaction(index)
                      }
                    })
                    isDone = true
                    paymentsAmount += transaction.amount
                    break
                  }
                }

                if (isDone) {
                  countDone++
                  if (countDone === transactions.length) {
                    if (amount.total / paymentsAmount > 1.01) {
                      cancelOrder('Transaction amounts doesn\'t match (is lower) order total value')
                    }
                  }
                  return
                }

                // unexpected response object from create transaction module
                const firstResult = results && results[0]
                let errorMessage
                if (firstResult) {
                  const { response } = firstResult
                  if (response) {
                    // send devMsg with app response
                    if (response.message) {
                      errorMessage = response.message
                      if (response.error) {
                        errorMessage += ` (${response.error})`
                      }
                    } else {
                      errorMessage = JSON.stringify(response)
                    }
                  } else {
                    errorMessage = firstResult.error_message
                  }
                }
                if (isFirstTransaction) {
                  errorCallback(null, null, errorMessage || 'No valid transaction object')
                }
                cancelOrder('Error trying to create transaction', errorMessage)
              })
            }
            nextTransaction()
          })
        })
      }

      // simulate requets to calculate shipping endpoint
      simulateRequest(checkoutBody, checkoutRespond, 'shipping', storeId, results => {
        const validResults = getValidResults(results, 'shipping_services')
        for (let i = 0; i < validResults.length; i++) {
          const result = validResults[i]
          // treat calculate shipping response
          const response = result.response
          if (response && response.shipping_services) {
            // check chosen shipping code
            const shippingCode = checkoutBody.shipping.service_code

            for (let i = 0; i < response.shipping_services.length; i++) {
              const shippingService = response.shipping_services[i]
              const shippingLine = shippingService.shipping_line
              if (shippingLine && (!shippingCode || shippingCode === shippingService.service_code)) {
                // update amount freight and total
                let freight = typeof shippingLine.total_price === 'number'
                  ? shippingLine.total_price
                  : typeof shippingLine.price === 'number'
                    ? shippingLine.price
                    : 0
                if (isNaN(freight) || freight < 0) {
                  freight = 0
                }
                amount.freight = freight
                fixAmount()

                // app info
                const shippingApp = {
                  app: Object.assign({ _id: result._id }, shippingService)
                }
                // remove shipping line property
                delete shippingApp.app.shipping_line

                // sum production time to posting deadline
                let maxProductionDays = 0
                orderBody.items.forEach(item => {
                  const productionTime = item.production_time
                  if (productionTime) {
                    let productionDays = productionTime.days
                    if (productionDays && productionTime.cumulative) {
                      productionDays *= item.quantity
                    }
                    if (productionDays > productionTime.max_time) {
                      productionDays = productionTime.max_time
                    }
                    if (maxProductionDays < productionDays) {
                      maxProductionDays = productionDays
                    }
                  }
                })
                if (maxProductionDays) {
                  if (!shippingLine.posting_deadline) {
                    shippingLine.posting_deadline = {
                      days: 0
                    }
                  }
                  shippingLine.posting_deadline.days += maxProductionDays
                }

                // add to order body
                orderBody.shipping_lines = [
                  // generate new object id and compose shipping line object
                  Object.assign({ _id: objectId() }, shippingApp, shippingLine)
                ]
                orderBody.shipping_method_label = shippingService.label || ''

                // continue to discount step
                applyDiscount()
                return
              }
            }
          }
        }

        // problem with shipping response object
        const usrMsg = {
          en_us: 'Shipping method not available, please choose another',
          pt_br: 'Forma de envio indisponível, por favor escolha outra'
        }
        const devMsg = 'Any valid shipping service from /calculate_shipping module'
        checkoutRespond({}, null, 400, 'CKT901', devMsg, usrMsg)
      })

      const applyDiscount = () => {
        // simulate request to apply discount endpoint to get extra discount value
        simulateRequest(checkoutBody, checkoutRespond, 'discount', storeId, results => {
          const validResults = getValidResults(results)
          for (let i = 0; i < validResults.length; i++) {
            const result = validResults[i]
            // treat apply discount response
            const response = result.response
            if (response && response.discount_rule) {
              // check discount value
              const discountRule = response.discount_rule
              const extraDiscount = discountRule.extra_discount

              if (extraDiscount && extraDiscount.value) {
                // update amount and save extra discount to order body
                amount.discount += extraDiscount.value
                fixAmount()
                orderBody.extra_discount = {
                  ...checkoutBody.discount,
                  ...extraDiscount,
                  // app info
                  app: {
                    ...discountRule,
                    _id: result._id
                  }
                }

                if (response.freebie_product_ids) {
                  // mark items provided for free
                  orderBody.items.forEach(item => {
                    if (!item.flags) {
                      item.flags = []
                    }
                    if (response.freebie_product_ids.includes(item.product_id)) {
                      item.flags.push('discount-set-free')
                    }
                  })
                }
                break
              }
            }
          }

          // proceed to list payments
          listPayments()
        })
      }

      const listPayments = () => {
        // simulate requets to list payments endpoint
        const paymentsBody = Object.assign({}, checkoutBody)
        if (Array.isArray(paymentsBody.transaction)) {
          paymentsBody.transaction = paymentsBody.transaction[0]
        }
        simulateRequest(paymentsBody, checkoutRespond, 'payment', storeId, results => {
          const validResults = getValidResults(results, 'payment_gateways')
          for (let i = 0; i < validResults.length; i++) {
            const result = validResults[i]
            // treat list payments response
            const response = result.response
            if (response && response.payment_gateways) {
              // check chosen payment method code and name
              const paymentMethod = paymentsBody.transaction.payment_method
              let paymentMethodCode, paymentMethodName
              if (paymentMethod) {
                paymentMethodCode = paymentMethod.code
                paymentMethodName = paymentMethod.name
              }

              // filter gateways by method code
              const possibleGateways = response.payment_gateways.filter(paymentGateway => {
                const paymentMethod = paymentGateway.payment_method
                return !paymentMethodCode || (paymentMethod && paymentMethod.code === paymentMethodCode)
              })
              let paymentGateway
              if (possibleGateways.length > 1 && paymentMethodName) {
                // prefer respective method name
                paymentGateway = possibleGateways.find(paymentGateway => {
                  return paymentGateway.payment_method.name === paymentMethodName
                })
              }
              if (!paymentGateway) {
                paymentGateway = possibleGateways[0]
              }

              if (paymentGateway) {
                const discount = paymentGateway.discount
                let maxDiscount

                // handle discount by payment method
                if (discount && discount.apply_at && (maxDiscount = amount[discount.apply_at])) {
                  // update amount discount and total
                  let discountValue
                  if (discount.type === 'percentage') {
                    discountValue = maxDiscount * discount.value / 100
                  } else {
                    discountValue = discount.value
                    if (discountValue > maxDiscount) {
                      discountValue = maxDiscount
                    }
                  }
                  amount.discount += discountValue
                  fixAmount()
                }
                // add to order body
                orderBody.payment_method_label = paymentGateway.label || ''

                // finally start creating new order
                createOrder()
                return
              }
            }
          }

          // problem with list payments response object
          const usrMsg = {
            en_us: 'Payment method not available, please choose another',
            pt_br: 'Forma de pagamento indisponível, por favor escolha outra'
          }
          const devMsg = 'Any valid payment gateway from /list_payments module'
          checkoutRespond({}, null, 400, 'CKT902', devMsg, usrMsg)
        })
      }
    } else {
      // no valid items
      respondInvalidItems()
    }
  })
}

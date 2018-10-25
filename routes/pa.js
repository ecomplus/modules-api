'use strict'

// import common verbs (methods) functions
const httpVerbs = require('./#modules.js')
const modName = 'pa'

const schema = {
  '$schema': 'http://json-schema.org/draft-06/schema#',
  'title': 'Module PA: Input model',
  'description': 'On payment methods listing',
  'type': 'object',
  'required': [ 'items', 'amount' ],
  'additionalProperties': false,
  'properties': {
    'items': {
      'type': 'array',
      'maxItems': 3000,
      'items': {
        'type': 'object',
        'additionalProperties': false,
        'required': [ 'product_id', 'quantity', 'price' ],
        'properties': {
          'product_id': {
            'type': 'string',
            'pattern': '^[a-f0-9]{24}$',
            'description': 'Product ID'
          },
          'variation_id': {
            'type': 'string',
            'pattern': '^[a-f0-9]{24}$',
            'description': 'ID to specify the variation added to cart, if product has variations'
          },
          'sku': {
            'type': 'string',
            'minLength': 2,
            'maxLength': 100,
            'pattern': '^[A-Za-z0-9-_.]+$',
            'description': 'Product or variation unique reference code'
          },
          'name': {
            'type': 'string',
            'maxLength': 255,
            'description': 'Product or variation full name, or other label for this cart item'
          },
          'quantity': {
            'type': 'number',
            'multipleOf': 0.0001,
            'minimum': 0,
            'maximum': 9999999,
            'description': 'Item quantity in cart'
          },
          'currency_id': {
            'type': 'string',
            'pattern': '^[A-Z]{3}$',
            'default': 'BRL',
            'description': 'Designator of currency according to ISO 4217 (3 uppercase letters)'
          },
          'currency_symbol': {
            'type': 'string',
            'maxLength': 20,
            'default': 'R$',
            'description': 'Graphic symbol used as a shorthand for currency\'s name'
          },
          'price': {
            'type': 'number',
            'multipleOf': 0.00001,
            'minimum': 0,
            'maximum': 999999999,
            'description': 'Product sale price specifically for this cart'
          },
          'final_price': {
            'type': 'number',
            'multipleOf': 0.00001,
            'minimum': 0,
            'maximum': 999999999,
            'description': 'Final item price including additions due to customizations and gift wrap'
          }
        },
        'description': 'One of the cart items'
      },
      'description': 'Products composing the cart'
    },
    'currency_id': {
      'type': 'string',
      'pattern': '^[A-Z]{3}$',
      'default': 'BRL',
      'description': 'Designator of currency according to ISO 4217 (3 uppercase letters)'
    },
    'currency_symbol': {
      'type': 'string',
      'maxLength': 20,
      'default': 'R$',
      'description': 'Graphic symbol used as a shorthand for currency\'s name'
    },
    'amount': {
      'type': 'object',
      'additionalProperties': false,
      'required': [ 'total' ],
      'properties': {
        'total': {
          'type': 'number',
          'multipleOf': 0.00001,
          'minimum': 0,
          'maximum': 9999999999,
          'description': 'Order total amount'
        },
        'subtotal': {
          'type': 'number',
          'multipleOf': 0.00001,
          'minimum': 0,
          'maximum': 9999999999,
          'description': 'The sum of all items prices'
        },
        'freight': {
          'type': 'number',
          'multipleOf': 0.00001,
          'minimum': 0,
          'maximum': 9999999999,
          'description': 'Order freight cost'
        },
        'discount': {
          'type': 'number',
          'multipleOf': 0.00001,
          'minimum': 0,
          'maximum': 9999999999,
          'description': 'Applied discount value'
        },
        'tax': {
          'type': 'number',
          'multipleOf': 0.00001,
          'minimum': 0,
          'maximum': 9999999999,
          'description': 'The sum of all the taxes applied to the order'
        },
        'extra': {
          'type': 'number',
          'multipleOf': 0.00001,
          'minimum': 0,
          'maximum': 9999999999,
          'description': 'Sum of optional extra costs applied'
        }
      },
      'description': 'Object with sums of values'
    }
  }
}

// validate module packages responses
const responseSchema = {
  '$schema': 'http://json-schema.org/draft-06/schema#',
  'title': 'Module PA: Package response model',
  'description': schema.description,
  'type': 'object',
  'required': [ 'payment_gateways' ],
  'additionalProperties': false,
  'properties': {
    'payment_gateways': {
      'type': 'array',
      'minItems': 1,
      'maxItems': 30,
      'items': {
        'type': 'object',
        'additionalProperties': false,
        'required': [ 'label' ],
        'properties': {
          'label': {
            'type': 'string',
            'maxLength': 50,
            'description': 'Name of payment method shown to customers'
          },
          'icon': {
            'type': 'string',
            'maxLength': 255,
            'format': 'uri',
            'description': 'Payment icon image URI'
          },
          'intermediator': {
            'type': 'object',
            'additionalProperties': false,
            'properties': {
              'name': {
                'type': 'string',
                'maxLength': 255,
                'description': 'Name of payment intermediator'
              },
              'link': {
                'type': 'string',
                'maxLength': 255,
                'format': 'uri',
                'description': 'URI to intermediator website'
              }
            },
            'description': 'Payment intermediator'
          },
          'payment_url': {
            'type': 'string',
            'maxLength': 255,
            'format': 'uri',
            'description': 'Base URI to payments'
          },
          'currency_id': {
            'type': 'string',
            'pattern': '^[A-Z]{3}$',
            'description': 'Currency ID specific for this transaction, if different of order currency ID'
          },
          'currency_symbol': {
            'type': 'string',
            'maxLength': 20,
            'description': 'Currency symbol specific for this transaction'
          },
          'discount': {
            'type': 'number',
            'multipleOf': 0.0001,
            'minimum': -999999999,
            'maximum': 999999999,
            'description': 'Discount by payment method, negative if value was additionated (not discounted)'
          },
          'amount': {
            'type': 'number',
            'multipleOf': 0.00001,
            'minimum': 0,
            'maximum': 9999999999,
            'description': 'Transaction amount, disregarding installment rates'
          },
          'installments': {
            'type': 'object',
            'required': [ 'number', 'value' ],
            'additionalProperties': false,
            'properties': {
              'number': {
                'type': 'integer',
                'minimum': 2,
                'maximum': 999,
                'description': 'Number of installments'
              },
              'value': {
                'type': 'number',
                'multipleOf': 0.00001,
                'minimum': 0,
                'maximum': 999999999,
                'description': 'Installment value'
              },
              'tax': {
                'type': 'boolean',
                'default': false,
                'description': 'Tax applied'
              }
            },
            'description': 'Installments option'
          },
          'js_client': {
            'type': 'object',
            'required': [ 'script_uri' ],
            'additionalProperties': false,
            'properties': {
              'script_uri': {
                'type': 'string',
                'maxLength': 1000,
                'format': 'uri',
                'description': 'Script (JS) link'
              },
              'fallback_script_uri': {
                'type': 'string',
                'maxLength': 1000,
                'format': 'uri',
                'description': 'Optional script link to try if the first URI goes offline'
              },
              'onload_expression': {
                'type': 'string',
                'maxLength': 2000,
                'description': 'JS expression to run (with `eval`) after script load'
              },
              'cc_hash': {
                'type': 'object',
                'required': [ 'script_uri' ],
                'additionalProperties': false,
                'properties': {
                  'function': {
                    'type': 'string',
                    'maxLength': 50,
                    'description': 'Func name, receives obj with `name`, `doc`, `number`, `cvc`, `month`, `year`'
                  },
                  'is_promise': {
                    'type': 'boolean',
                    'default': false,
                    'description': 'If it is a promise, use for async process'
                  }
                },
                'description': 'Function to call for credit card hash generation, must return hash string'
              }
            },
            'description': 'Gateway web JS SDK, usually to handle credit cards with encryption'
          }
        },
        'description': 'Payment option (gateway)'
      },
      'description': 'Payment gateway options list'
    }
  }
}

module.exports = httpVerbs(modName, schema, responseSchema)
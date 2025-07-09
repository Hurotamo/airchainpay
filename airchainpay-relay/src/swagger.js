const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AirChainPay Relay API',
      version: '1.0.0',
      description: 'API for AirChainPay relay server - handles BLE transactions and blockchain broadcasting',
      contact: {
        name: 'AirChainPay Support',
        email: 'support@airchainpay.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development server'
      },
      {
        url: 'https://relay.airchainpay.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      },
      schemas: {
        Transaction: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique transaction identifier'
            },
            signedTransaction: {
              type: 'string',
              description: 'Signed transaction data'
            },
            chainId: {
              type: 'integer',
              description: 'Blockchain network ID'
            },
            deviceId: {
              type: 'string',
              description: 'Device identifier'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Transaction timestamp'
            }
          },
          required: ['signedTransaction', 'chainId']
        },
        TransactionResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean'
            },
            hash: {
              type: 'string',
              description: 'Transaction hash'
            },
            error: {
              type: 'string',
              description: 'Error message if failed'
            }
          }
        },
        BLEStatus: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean'
            },
            initialized: {
              type: 'boolean'
            },
            isAdvertising: {
              type: 'boolean'
            },
            connectedDevices: {
              type: 'integer'
            },
            authenticatedDevices: {
              type: 'integer'
            },
            blockedDevices: {
              type: 'integer'
            }
          }
        },
        HealthStatus: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'unhealthy']
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            },
            uptime: {
              type: 'number'
            },
            version: {
              type: 'string'
            },
            ble: {
              $ref: '#/components/schemas/BLEStatus'
            },
            metrics: {
              type: 'object',
              properties: {
                transactions: {
                  type: 'object',
                  properties: {
                    received: { type: 'integer' },
                    processed: { type: 'integer' },
                    failed: { type: 'integer' },
                    broadcasted: { type: 'integer' }
                  }
                },
                ble: {
                  type: 'object',
                  properties: {
                    connections: { type: 'integer' },
                    disconnections: { type: 'integer' },
                    authentications: { type: 'integer' },
                    keyExchanges: { type: 'integer' }
                  }
                },
                system: {
                  type: 'object',
                  properties: {
                    uptime: { type: 'number' },
                    memoryUsage: { type: 'number' },
                    cpuUsage: { type: 'number' }
                  }
                }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string'
            },
            field: {
              type: 'string'
            },
            timestamp: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
      }
    }
  },
  apis: ['./src/server.js'] // Path to the API docs
};

const specs = swaggerJsdoc(options);

module.exports = specs; 
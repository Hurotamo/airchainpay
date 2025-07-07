/**
 * Audit Configuration for AirChainPay Relay Server
 * Logs security events, user actions, and system changes
 */

const auditConfig = {
  // Audit log levels
  levels: {
    SECURITY: 'security',
    AUTH: 'auth',
    TRANSACTION: 'transaction',
    ADMIN: 'admin',
    SYSTEM: 'system'
  },

  // Events to audit
  events: {
    // Authentication events
    AUTH_LOGIN_SUCCESS: 'auth.login.success',
    AUTH_LOGIN_FAILURE: 'auth.login.failure',
    AUTH_LOGOUT: 'auth.logout',
    AUTH_TOKEN_GENERATED: 'auth.token.generated',
    AUTH_TOKEN_VALIDATED: 'auth.token.validated',
    AUTH_TOKEN_EXPIRED: 'auth.token.expired',
    AUTH_TOKEN_INVALID: 'auth.token.invalid',

    // Transaction events
    TX_SUBMITTED: 'transaction.submitted',
    TX_PROCESSED: 'transaction.processed',
    TX_FAILED: 'transaction.failed',
    TX_BROADCASTED: 'transaction.broadcasted',
    TX_VALIDATED: 'transaction.validated',
    TX_REJECTED: 'transaction.rejected',

    // BLE events
    BLE_DEVICE_CONNECTED: 'ble.device.connected',
    BLE_DEVICE_DISCONNECTED: 'ble.device.disconnected',
    BLE_KEY_EXCHANGE_INITIATED: 'ble.key_exchange.initiated',
    BLE_KEY_EXCHANGE_COMPLETED: 'ble.key_exchange.completed',
    BLE_KEY_EXCHANGE_FAILED: 'ble.key_exchange.failed',
    BLE_DATA_SENT: 'ble.data.sent',
    BLE_DATA_RECEIVED: 'ble.data.received',

    // Security events
    SECURITY_RATE_LIMIT_EXCEEDED: 'security.rate_limit.exceeded',
    SECURITY_IP_BLOCKED: 'security.ip.blocked',
    SECURITY_IP_WHITELISTED: 'security.ip.whitelisted',
    SECURITY_UNAUTHORIZED_ACCESS: 'security.unauthorized.access',
    SECURITY_SUSPICIOUS_ACTIVITY: 'security.suspicious.activity',
    SECURITY_MALFORMED_REQUEST: 'security.malformed.request',

    // System events
    SYSTEM_STARTUP: 'system.startup',
    SYSTEM_SHUTDOWN: 'system.shutdown',
    SYSTEM_CONFIG_CHANGED: 'system.config.changed',
    SYSTEM_HEALTH_CHECK: 'system.health.check',
    SYSTEM_ERROR: 'system.error',
    SYSTEM_WARNING: 'system.warning',

    // Admin events
    ADMIN_CONFIG_UPDATED: 'admin.config.updated',
    ADMIN_SECRETS_ROTATED: 'admin.secrets.rotated',
    ADMIN_DEVICE_BLOCKED: 'admin.device.blocked',
    ADMIN_DEVICE_UNBLOCKED: 'admin.device.unblocked',
    ADMIN_LOG_VIEWED: 'admin.log.viewed',
    ADMIN_BACKUP_CREATED: 'admin.backup.created'
  },

  // Fields to include in audit logs
  fields: {
    // Required fields
    required: [
      'timestamp',
      'event',
      'level',
      'source',
      'userAgent',
      'ipAddress'
    ],

    // Optional fields based on event type
    auth: [
      'userId',
      'apiKey',
      'tokenId',
      'success',
      'failureReason'
    ],

    transaction: [
      'transactionId',
      'chainId',
      'fromAddress',
      'toAddress',
      'amount',
      'gasUsed',
      'blockNumber',
      'status',
      'error'
    ],

    ble: [
      'deviceId',
      'deviceName',
      'deviceAddress',
      'operation',
      'dataSize',
      'encrypted',
      'success'
    ],

    security: [
      'threatType',
      'severity',
      'action',
      'reason',
      'duration'
    ],

    system: [
      'component',
      'version',
      'environment',
      'details'
    ],

    admin: [
      'adminId',
      'action',
      'target',
      'changes',
      'reason'
    ]
  },

  // Sensitive data that should be masked
  sensitiveFields: [
    'apiKey',
    'jwtSecret',
    'privateKey',
    'password',
    'token',
    'signature',
    'encryptedData'
  ],

  // IP addresses to exclude from audit logs
  excludedIPs: [
    '127.0.0.1',
    '::1',
    'localhost'
  ],

  // User agents to exclude from audit logs
  excludedUserAgents: [
    'health-check',
    'monitoring',
    'prometheus'
  ],

  // Audit log format
  format: {
    timestamp: 'ISO',
    includeStack: false,
    includeRequestId: true,
    includeCorrelationId: true
  },

  // Retention settings
  retention: {
    security: '1 year',
    auth: '6 months',
    transaction: '3 months',
    ble: '3 months',
    system: '1 year',
    admin: '2 years'
  },

  // Alert thresholds
  alerts: {
    // Failed authentication attempts
    authFailures: {
      threshold: 5,
      window: '5 minutes',
      action: 'block_ip'
    },

    // Unauthorized access attempts
    unauthorizedAccess: {
      threshold: 10,
      window: '1 minute',
      action: 'block_ip'
    },

    // Suspicious activity
    suspiciousActivity: {
      threshold: 3,
      window: '10 minutes',
      action: 'alert_admin'
    },

    // System errors
    systemErrors: {
      threshold: 10,
      window: '5 minutes',
      action: 'alert_admin'
    }
  },

  // Export settings
  export: {
    enabled: true,
    format: 'json',
    compression: 'gzip',
    schedule: 'daily',
    destination: './logs/audit/'
  },

  // Real-time monitoring
  monitoring: {
    enabled: true,
    events: [
      'security.unauthorized.access',
      'security.suspicious.activity',
      'auth.login.failure',
      'system.error'
    ],
    webhook: process.env.AUDIT_WEBHOOK_URL,
    email: process.env.AUDIT_EMAIL
  }
};

module.exports = auditConfig; 
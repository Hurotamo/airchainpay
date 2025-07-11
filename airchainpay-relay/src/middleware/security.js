const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Security middleware configuration
const securityMiddleware = {
  // Basic security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        scriptSrc: ['\'self\''],
        imgSrc: ['\'self\'', 'data:', 'https:'],
        connectSrc: ['\'self\''],
        fontSrc: ['\'self\''],
        objectSrc: ['\'none\''],
        mediaSrc: ['\'self\''],
        frameSrc: ['\'none\''],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),

  // Compression middleware
  compression: compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    level: 6,
  }),

  // Rate limiting configurations
  rateLimiters: {
    // Global rate limiter
    global: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // limit each IP to 1000 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),

    // Strict rate limiter for authentication endpoints
    auth: rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // limit each IP to 5 requests per windowMs
      message: {
        error: 'Too many authentication attempts, please try again later.',
        retryAfter: '15 minutes',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),

    // Transaction submission rate limiter
    transactions: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 50, // limit each IP to 50 requests per windowMs
      message: {
        error: 'Too many transaction submissions, please try again later.',
        retryAfter: '1 minute',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),

    // BLE endpoint rate limiter
    ble: rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many BLE requests, please try again later.',
        retryAfter: '1 minute',
      },
      standardHeaders: true,
      legacyHeaders: false,
    }),
  },

  // Input validation middleware
  validateTransaction: [
    body('signedTransaction')
      .isString()
      .isLength({ min: 1, max: 10000 })
      .withMessage('Signed transaction must be a valid string'),
    body('chainId')
      .optional()
      .isInt({ min: 1, max: 999999 })
      .withMessage('Chain ID must be a valid integer'),
    body('deviceId')
      .optional()
      .isString()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9\-_]+$/)
      .withMessage('Device ID must be alphanumeric with hyphens and underscores only'),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }
      next();
    },
  ],

  validateDeviceId: [
    body('deviceId')
      .isString()
      .isLength({ min: 1, max: 100 })
      .matches(/^[a-zA-Z0-9\-_]+$/)
      .withMessage('Device ID must be alphanumeric with hyphens and underscores only'),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }
      next();
    },
  ],

  // Request logging middleware
  requestLogger: (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        timestamp: new Date().toISOString(),
      };

      if (res.statusCode >= 400) {
        logger.warn('HTTP Request', logData);
      } else {
        logger.info('HTTP Request', logData);
      }
    });

    next();
  },

  // Error handling middleware
  errorHandler: (err, req, res, next) => {
    logger.error('Unhandled error:', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    const errorMessage = isDevelopment ? err.message : 'Internal server error';

    res.status(err.status || 500).json({
      error: errorMessage,
      timestamp: new Date().toISOString(),
    });
  },

  // CORS configuration
  corsOptions: {
    origin: function (origin, callback) {
      const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['*'];
      
      if (allowedOrigins.includes('*')) {
        callback(null, true);
      } else if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request from origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  },

  // IP whitelist middleware
  ipWhitelist: (allowedIPs) => {
    return (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      
      if (allowedIPs.includes(clientIP) || allowedIPs.includes('*')) {
        next();
      } else {
        logger.warn('IP not in whitelist:', clientIP);
        res.status(403).json({
          error: 'Access denied',
          timestamp: new Date().toISOString(),
        });
      }
    };
  },

  // Request size limiter
  requestSizeLimit: (limit = '10mb') => {
    return (req, res, next) => {
      const contentLength = parseInt(req.headers['content-length'] || '0');
      const limitBytes = parseInt(limit) * 1024 * 1024; // Convert MB to bytes
      
      if (contentLength > limitBytes) {
        return res.status(413).json({
          error: 'Request entity too large',
          maxSize: limit,
          timestamp: new Date().toISOString(),
        });
      }
      
      next();
    };
  },

  // Security headers middleware
  securityHeaders: (req, res, next) => {
    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
  },
};

module.exports = securityMiddleware; 
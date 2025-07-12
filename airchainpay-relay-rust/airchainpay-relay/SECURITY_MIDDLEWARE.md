# Enhanced Security Middleware

## Overview

The Enhanced Security Middleware provides comprehensive protection against various security threats including SQL injection, XSS (Cross-Site Scripting), path traversal, command injection, and other malicious attacks. It integrates seamlessly with the AirChainPay Relay system to ensure robust security for all API endpoints.

## Features

### 🔒 SQL Injection Protection
- **Pattern Detection**: Uses regex patterns to detect common SQL injection attempts
- **Keywords Blocked**: SELECT, INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, UNION, EXEC, EXECUTE, SCRIPT
- **Special Characters**: Blocks --, /*, */, ;, xp_, sp_
- **Boolean Logic**: Detects OR 1=1, AND 1=1 patterns
- **System Tables**: Blocks INFORMATION_SCHEMA, sys., master., tempdb. references

### 🛡️ XSS (Cross-Site Scripting) Protection
- **Script Tags**: Blocks `<script>` tags and variations
- **JavaScript Protocol**: Blocks `javascript:` URLs
- **Event Handlers**: Blocks onload, onerror, onclick, onmouseover, onfocus, onblur
- **Dangerous Functions**: Blocks eval(), document.cookie, document.write, window.location
- **DOM Manipulation**: Blocks innerHTML, outerHTML
- **Embedded Content**: Blocks `<iframe>`, `<object>`, `<embed>` tags

### 📁 Path Traversal Protection
- **Directory Traversal**: Blocks `../` and `..\` patterns
- **URL Encoded**: Blocks `%2e%2e%2f` and `%2e%2e%5c` patterns
- **Mixed Encoding**: Blocks `..%2f` and `..%5c` patterns

### 💻 Command Injection Protection
- **System Commands**: Blocks cmd, command, exec, system, shell
- **Operators**: Blocks &, |, ;, $(), ` (backtick)
- **Network Tools**: Blocks ping, nslookup, whois, traceroute

### 🚫 Suspicious IP Detection
- **Private Networks**: Blocks 192.168.x.x, 10.x.x.x, 172.16-31.x.x
- **Localhost**: Blocks 127.0.0.1, localhost, ::1
- **Configurable**: Can be enabled/disabled via configuration

### 📊 Security Event Logging
- **Comprehensive Logging**: Logs all security events with detailed information
- **Event Types**: SQL_INJECTION_ATTEMPT, XSS_ATTEMPT, PATH_TRAVERSAL_ATTEMPT, COMMAND_INJECTION_ATTEMPT
- **Severity Levels**: LOW, MEDIUM, HIGH, CRITICAL
- **Context Information**: Client IP, User Agent, Path, Payload, Timestamp

### 🛡️ Security Headers
- **X-Content-Type-Options**: nosniff
- **X-Frame-Options**: DENY
- **X-XSS-Protection**: 1; mode=block
- **Strict-Transport-Security**: max-age=31536000; includeSubDomains
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Content-Security-Policy**: Comprehensive CSP policy

## Configuration

### SecurityConfig Structure

```rust
#[derive(Clone)]
struct SecurityConfig {
    enable_sql_injection_protection: bool,      // Default: true
    enable_xss_protection: bool,                // Default: true
    enable_path_traversal_protection: bool,     // Default: true
    enable_command_injection_protection: bool,  // Default: true
    max_request_size: usize,                    // Default: 10MB
    block_suspicious_ips: bool,                 // Default: true
    log_security_events: bool,                  // Default: true
}
```

### Usage Examples

#### Basic Usage
```rust
use airchainpay_relay::middleware::SecurityMiddleware;

let app = App::new()
    .wrap(SecurityMiddleware::new())
    .service(/* your services */);
```

#### Custom Configuration
```rust
use airchainpay_relay::middleware::{SecurityMiddleware, SecurityConfig};

let mut config = SecurityConfig::default();
config.enable_sql_injection_protection = false;  // Disable SQL injection protection
config.max_request_size = 5_000_000;             // Set 5MB limit
config.log_security_events = false;              // Disable logging

let app = App::new()
    .wrap(SecurityMiddleware::new().with_security_config(config))
    .service(/* your services */);
```

## API Integration

### Endpoint Protection

The security middleware automatically protects all endpoints:

```rust
// Transaction endpoints with enhanced validation
.service(
    web::scope("/transaction")
        .wrap(validate_transaction_request())
        .service(submit_transaction)
)

// BLE endpoints with validation
.service(
    web::scope("/ble")
        .wrap(validate_ble_request())
        .service(ble_scan)
)

// Auth endpoints with validation
.service(
    web::scope("/auth")
        .wrap(validate_auth_request())
        .service(/* auth services */)
)
```

### Request Flow

1. **Security Headers Applied**: All requests receive comprehensive security headers
2. **Suspicious IP Check**: IP addresses are checked against suspicious patterns
3. **Rate Limiting**: Requests are rate-limited based on endpoint type
4. **Pattern Detection**: All request data is scanned for malicious patterns
5. **Validation**: Request body, parameters, and headers are validated
6. **Logging**: Security events are logged with detailed information
7. **Response**: Requests are either allowed to proceed or blocked with appropriate error messages

## Security Patterns

### SQL Injection Patterns

```rust
// SQL Keywords
Regex::new(r"(?i)(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|UNION|EXEC|EXECUTE|SCRIPT)")

// SQL Comments and Special Characters
Regex::new(r"(?i)(--|/\*|\*/|;|xp_|sp_)")

// Boolean Logic Attacks
Regex::new(r"(?i)(OR\s+1\s*=\s*1|AND\s+1\s*=\s*1)")

// UNION Attacks
Regex::new(r"(?i)(UNION\s+SELECT|UNION\s+ALL\s+SELECT)")

// System Table References
Regex::new(r"(?i)(INFORMATION_SCHEMA|sys\.|master\.|tempdb\.)")
```

### XSS Patterns

```rust
// Script Tags
Regex::new(r"(?i)<script[^>]*>.*?</script>")

// JavaScript Protocol
Regex::new(r"(?i)javascript:.*")

// Event Handlers
Regex::new(r"(?i)on(load|error|click|mouseover|focus|blur)\s*=")

// Dangerous Functions
Regex::new(r"(?i)eval\s*\(")
Regex::new(r"(?i)document\.(cookie|write|location)")
Regex::new(r"(?i)window\.(location|open|alert)")

// DOM Manipulation
Regex::new(r"(?i)innerHTML|outerHTML")

// Embedded Content
Regex::new(r"(?i)<iframe[^>]*>")
Regex::new(r"(?i)<object[^>]*>")
Regex::new(r"(?i)<embed[^>]*>")
```

## Error Responses

### SQL Injection Attempt
```json
{
    "error": "Malicious input detected",
    "type": "sql_injection"
}
```

### XSS Attempt
```json
{
    "error": "Malicious input detected",
    "type": "xss"
}
```

### Path Traversal Attempt
```json
{
    "error": "Malicious input detected",
    "type": "path_traversal"
}
```

### Command Injection Attempt
```json
{
    "error": "Malicious input detected",
    "type": "command_injection"
}
```

### Suspicious IP
```json
{
    "error": "Access denied",
    "reason": "Suspicious IP detected"
}
```

## Security Event Logging

### Event Structure
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityEvent {
    pub timestamp: String,           // ISO 8601 timestamp
    pub event_type: String,          // Event type identifier
    pub client_ip: String,           // Client IP address
    pub user_agent: String,          // User agent string
    pub path: String,                // Request path
    pub payload: Option<String>,     // Malicious payload (if any)
    pub severity: String,            // LOW, MEDIUM, HIGH, CRITICAL
}
```

### Event Types
- `SQL_INJECTION_ATTEMPT`: SQL injection detected
- `XSS_ATTEMPT`: XSS attack detected
- `PATH_TRAVERSAL_ATTEMPT`: Path traversal detected
- `COMMAND_INJECTION_ATTEMPT`: Command injection detected
- `SUSPICIOUS_IP`: Suspicious IP address detected
- `REQUEST_TOO_LARGE`: Request body too large
- `INVALID_CONTENT_TYPE`: Invalid content type

### Log Example
```
WARN SECURITY_EVENT: SecurityEvent {
    timestamp: "2024-01-15T10:30:45Z",
    event_type: "SQL_INJECTION_ATTEMPT",
    client_ip: "192.168.1.100",
    user_agent: "Mozilla/5.0...",
    path: "/api/transaction",
    payload: Some("URL_PARAM: SELECT * FROM users"),
    severity: "HIGH"
}
```

## Testing

### Running Security Tests
```bash
# Run all security middleware tests
cargo test test_security_middleware

# Run specific test categories
cargo test test_security_middleware_sql_injection
cargo test test_security_middleware_xss
cargo test test_security_middleware_path_traversal
cargo test test_security_middleware_command_injection
```

### Test Coverage
- ✅ SQL Injection Detection
- ✅ XSS Detection
- ✅ Path Traversal Detection
- ✅ Command Injection Detection
- ✅ Legitimate Request Handling
- ✅ Configuration Testing
- ✅ Security Headers
- ✅ Rate Limiting
- ✅ Suspicious IP Detection

## Performance Considerations

### Pattern Matching Optimization
- **Compiled Regex**: All patterns are compiled once at startup
- **Lazy Static**: Patterns are loaded only when needed
- **Early Exit**: Detection stops at first match

### Memory Usage
- **Configurable Limits**: Request size limits prevent memory exhaustion
- **Efficient Logging**: Security events are logged asynchronously
- **Pattern Caching**: Regex patterns are cached for performance

### Rate Limiting
- **Per-Endpoint Limits**: Different limits for different endpoint types
- **Configurable Windows**: Adjustable time windows for rate limiting
- **IP-Based Tracking**: Rate limiting is tracked per client IP

## Best Practices

### 1. Configuration
- Enable all protection features in production
- Set appropriate request size limits
- Configure logging for security monitoring
- Regularly review and update pattern lists

### 2. Monitoring
- Monitor security event logs
- Set up alerts for critical security events
- Track blocked request patterns
- Analyze attack trends

### 3. Maintenance
- Regularly update security patterns
- Review and adjust rate limiting settings
- Monitor false positive rates
- Update security headers as needed

### 4. Integration
- Integrate with existing logging systems
- Connect to security monitoring tools
- Set up automated alerting
- Maintain audit trails

## Troubleshooting

### Common Issues

#### False Positives
- Review pattern lists for overly broad patterns
- Adjust configuration for specific use cases
- Monitor legitimate requests that are blocked

#### Performance Issues
- Check request size limits
- Monitor pattern matching performance
- Review rate limiting settings

#### Logging Issues
- Verify log configuration
- Check disk space for log files
- Monitor log rotation settings

### Debug Mode
```rust
// Enable debug logging for security middleware
let mut config = SecurityConfig::default();
config.log_security_events = true;

// Check logs for detailed security event information
```

## Integration with Node.js Version

This enhanced security middleware provides feature parity with the Node.js version:

### Node.js Features Implemented
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ Input sanitization
- ✅ Security headers
- ✅ Rate limiting
- ✅ Suspicious IP detection
- ✅ Comprehensive logging

### Rust Enhancements
- 🚀 **Performance**: Compiled regex patterns for faster detection
- 🔒 **Type Safety**: Strong typing prevents runtime errors
- 📊 **Memory Efficiency**: Lower memory footprint
- 🛡️ **Additional Protections**: Path traversal and command injection detection
- ⚙️ **Configurable**: Granular control over security features

## Future Enhancements

### Planned Features
- **Machine Learning**: AI-powered threat detection
- **Behavioral Analysis**: User behavior pattern recognition
- **Real-time Updates**: Dynamic pattern updates
- **Advanced Analytics**: Detailed security metrics
- **Integration APIs**: Third-party security tool integration

### Performance Optimizations
- **Pattern Optimization**: More efficient regex patterns
- **Caching**: Intelligent pattern caching
- **Parallel Processing**: Multi-threaded threat detection
- **Memory Optimization**: Reduced memory footprint

This enhanced security middleware provides enterprise-grade protection for the AirChainPay Relay system, ensuring robust security while maintaining high performance and flexibility. 
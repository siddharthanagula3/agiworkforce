# Signaling Server Security Documentation

This document describes the security features, configuration options, and best practices for deploying the signaling server in production.

## Table of Contents

- [Security Features](#security-features)
- [Configuration](#configuration)
- [Rate Limiting](#rate-limiting)
- [Input Validation](#input-validation)
- [DDoS Protection](#ddos-protection)
- [Admin Authentication](#admin-authentication)
- [Security Headers](#security-headers)
- [Firewall Rules](#firewall-rules)
- [Monitoring Recommendations](#monitoring-recommendations)
- [Security Checklist](#security-checklist)

## Security Features

The signaling server implements multiple layers of security:

### 1. HTTP Rate Limiting

Per-endpoint rate limiting using `express-rate-limit`:

| Endpoint                 | Limit   | Window | Rationale                   |
| ------------------------ | ------- | ------ | --------------------------- |
| `POST /pairings`         | 10/min  | 60s    | Prevent enumeration attacks |
| `GET /pairings/:code`    | 60/min  | 60s    | Read-only, moderate limit   |
| `DELETE /pairings/:code` | 10/min  | 60s    | Destructive operation       |
| `GET /health`            | 100/min | 60s    | Monitoring needs            |
| `GET /metrics`           | 30/min  | 60s    | Admin endpoint              |
| `POST /admin/*`          | 20/min  | 60s    | Admin operations            |

### 2. WebSocket Rate Limiting

Per-IP rate limiting for WebSocket connections and messages:

| Limit Type                    | Default | Configurable             |
| ----------------------------- | ------- | ------------------------ |
| Connections per IP            | 10/min  | `WS_CONNECTION_LIMIT`    |
| Messages per IP               | 100/min | `WS_MESSAGE_LIMIT`       |
| Concurrent connections per IP | 10      | `MAX_CONNECTIONS_PER_IP` |

### 3. Input Validation

All inputs are validated using Zod schemas:

- Pairing codes: 8 uppercase alphanumeric characters (`/^[A-Z0-9]{8}$/`)
- Metadata: Max 20 keys, 4KB total size
- WebSocket messages: Max 64KB
- SDP payloads: Max 100KB
- ICE candidates: Max 500 bytes
- JSON body: Max 16KB

### 4. Security Headers

OWASP-compliant security headers on all HTTP responses:

| Header                         | Value                                        |
| ------------------------------ | -------------------------------------------- |
| `X-Content-Type-Options`       | `nosniff`                                    |
| `X-Frame-Options`              | `DENY`                                       |
| `X-XSS-Protection`             | `1; mode=block`                              |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`            |
| `Content-Security-Policy`      | `default-src 'none'; frame-ancestors 'none'` |
| `Permissions-Policy`           | Restrictive policy                           |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                |
| `Cross-Origin-Resource-Policy` | `same-origin`                                |
| `Strict-Transport-Security`    | Configurable (disabled by default)           |

### 5. DDoS Protection

Automatic protection against denial-of-service attacks:

- Connection flood detection
- Message flood detection
- Automatic IP blacklisting after repeated violations
- Configurable blacklist duration and threshold

### 6. Admin Authentication

Protected admin endpoints with API key authentication:

- Constant-time comparison to prevent timing attacks
- Automatic lockout after failed attempts
- Supports `Authorization: Bearer <key>` and `X-API-Key` headers

## Configuration

### Environment Variables

#### Required

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### Security Configuration

```bash
# Admin API key (required for admin endpoints)
ADMIN_API_KEY=your-secure-api-key

# HSTS (enable only with HTTPS)
ENABLE_HSTS=true
HSTS_MAX_AGE=31536000

# WebSocket rate limiting
WS_CONNECTION_LIMIT=10
WS_MESSAGE_LIMIT=100
WS_RATE_LIMIT_WINDOW_MS=60000
WS_BLACKLIST_DURATION_MS=300000
WS_BLACKLIST_THRESHOLD=5

# Admin authentication
MAX_AUTH_FAILURES=10
AUTH_LOCKOUT_DURATION_MS=900000
AUTH_FAILURE_WINDOW_MS=3600000
```

### Generating Secure API Keys

```bash
# Generate a 32-byte hex key
openssl rand -hex 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Rate Limiting

### HTTP Rate Limits

All HTTP endpoints are rate-limited with standard headers:

- `RateLimit-Limit`: Maximum requests in window
- `RateLimit-Remaining`: Remaining requests
- `RateLimit-Reset`: Time until window resets

Response when rate limited:

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again after 60 seconds.",
  "retryAfter": 60
}
```

### WebSocket Rate Limits

WebSocket connections and messages are rate-limited per IP:

```json
{
  "type": "error",
  "error": "rate_limit_exceeded",
  "retryAfter": 45
}
```

## Input Validation

### Pairing Code Format

Valid pairing codes:

- Exactly 8 characters
- Uppercase alphanumeric only (A-Z, 0-9)
- Pattern: `/^[A-Z0-9]{8}$/`

Invalid codes receive a 400 response:

```json
{
  "error": "invalid_code_format"
}
```

### Metadata Constraints

- Maximum 20 keys
- Maximum 4KB total size
- Key names max 100 characters

### Message Size Limits

| Message Type      | Max Size  |
| ----------------- | --------- |
| WebSocket message | 64KB      |
| HTTP JSON body    | 16KB      |
| SDP payload       | 100KB     |
| ICE candidate     | 500 bytes |
| Control payload   | 4KB       |

## DDoS Protection

### Automatic Blacklisting

IPs are automatically blacklisted after:

1. Exceeding rate limits multiple times (default: 5 violations)
2. Connection flood attempts
3. Message flood attempts

Blacklist duration: 5 minutes (default)

### Manual Blacklisting

Admins can manually blacklist IPs via the admin endpoint:

```bash
curl -X POST https://signaling.example.com/admin/blacklist \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ip": "1.2.3.4", "reason": "Abuse detected", "durationMs": 3600000}'
```

### Blacklist Status

Check blacklist status in `/admin/status` response:

```json
{
  "security": {
    "blacklistedIps": 5,
    "topOffenders": [{ "ip": "1.2.3.4", "violations": 15 }]
  }
}
```

## Admin Authentication

### Endpoints Requiring Authentication

| Endpoint           | Method | Description                                 |
| ------------------ | ------ | ------------------------------------------- |
| `/metrics`         | GET    | Prometheus metrics (when ADMIN_API_KEY set) |
| `/admin/status`    | GET    | Server status and configuration             |
| `/admin/blacklist` | POST   | Manually blacklist IP                       |

### Authentication Methods

1. **Bearer Token** (recommended):

   ```
   Authorization: Bearer YOUR_ADMIN_KEY
   ```

2. **X-API-Key Header**:
   ```
   X-API-Key: YOUR_ADMIN_KEY
   ```

### Failed Authentication

After `MAX_AUTH_FAILURES` (default: 10) failures within `AUTH_FAILURE_WINDOW_MS` (default: 1 hour), the IP is locked out for `AUTH_LOCKOUT_DURATION_MS` (default: 15 minutes).

## Security Headers

### HSTS Configuration

Enable HSTS only when serving over HTTPS:

```bash
ENABLE_HSTS=true
HSTS_MAX_AGE=31536000
HSTS_INCLUDE_SUBDOMAINS=true
HSTS_PRELOAD=false
```

### CSP Configuration

The Content-Security-Policy is set to be very restrictive since this is an API server:

```
default-src 'none'; frame-ancestors 'none'
```

## Firewall Rules

### Recommended iptables Rules

```bash
# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow HTTP/HTTPS
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow signaling server port (if different)
iptables -A INPUT -p tcp --dport 4000 -j ACCEPT

# Rate limit new connections
iptables -A INPUT -p tcp --dport 4000 -m state --state NEW -m recent --set
iptables -A INPUT -p tcp --dport 4000 -m state --state NEW -m recent --update --seconds 60 --hitcount 20 -j DROP

# Drop invalid packets
iptables -A INPUT -m state --state INVALID -j DROP

# Default deny
iptables -A INPUT -j DROP
```

### Cloud Provider Security Groups

AWS Security Group example:

```json
{
  "IpPermissions": [
    {
      "IpProtocol": "tcp",
      "FromPort": 443,
      "ToPort": 443,
      "IpRanges": [{ "CidrIp": "0.0.0.0/0" }]
    }
  ]
}
```

### Reverse Proxy Configuration (nginx)

```nginx
upstream signaling {
    server 127.0.0.1:4000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name signaling.example.com;

    # SSL configuration
    ssl_certificate /etc/ssl/certs/signaling.crt;
    ssl_certificate_key /etc/ssl/private/signaling.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers on;

    # Rate limiting at proxy level
    limit_req_zone $binary_remote_addr zone=signaling:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=conn:10m;

    location / {
        limit_req zone=signaling burst=20 nodelay;
        limit_conn conn 10;

        proxy_pass http://signaling;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://signaling;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }
}
```

## Monitoring Recommendations

### Prometheus Metrics

The `/metrics` endpoint exposes Prometheus-compatible metrics:

```
# Connection metrics
signaling_connections_total
signaling_sessions_active

# Message metrics
signaling_messages_total{type="connection|register|signal_offer|..."}

# Error metrics
signaling_errors_total{type="rate_limit_exceeded|blacklisted_ip|..."}

# System metrics
signaling_uptime_seconds
signaling_memory_bytes{type="heapUsed|heapTotal|rss"}
```

### Alerting Rules

Recommended Prometheus alerting rules:

```yaml
groups:
  - name: signaling-server
    rules:
      - alert: HighErrorRate
        expr: rate(signaling_errors_total[5m]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High error rate on signaling server

      - alert: TooManyBlacklistedIPs
        expr: signaling_blacklisted_ips > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: Many IPs blacklisted, possible attack

      - alert: HighMemoryUsage
        expr: signaling_memory_bytes{type="heapUsed"} > 500000000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: Signaling server memory usage high
```

### Log Monitoring

Key log events to monitor:

- `level: "warn"` with `"Rate limit exceeded"` - Potential abuse
- `level: "warn"` with `"Blacklisted IP"` - Attack attempts
- `level: "error"` with `"WebSocket error"` - Connection issues
- `level: "fatal"` - Server crashes

## Security Checklist

### Pre-Deployment

- [ ] Generate strong `ADMIN_API_KEY` (minimum 32 bytes)
- [ ] Configure `ALLOWED_ORIGINS` for production domains only
- [ ] Set `NODE_ENV=production` for secure defaults
- [ ] Enable `ENABLE_HSTS=true` if using HTTPS
- [ ] Review and adjust rate limits for expected traffic
- [ ] Configure firewall rules
- [ ] Set up TLS termination (nginx/load balancer)

### Post-Deployment

- [ ] Verify security headers with securityheaders.com
- [ ] Test rate limiting behavior
- [ ] Verify admin authentication works
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Document incident response procedures

### Ongoing

- [ ] Monitor error rates and blacklisted IPs
- [ ] Review logs for suspicious activity
- [ ] Keep dependencies updated
- [ ] Rotate `ADMIN_API_KEY` periodically
- [ ] Review and update firewall rules
- [ ] Conduct periodic security audits

## Incident Response

### Suspected Attack

1. Check `/admin/status` for blacklisted IPs and top offenders
2. Review logs for patterns
3. Manually blacklist offending IPs if needed
4. Consider increasing rate limit strictness temporarily
5. Contact your security team if attack is significant

### High Error Rate

1. Check `/health` endpoint for server status
2. Review `/metrics` for error types
3. Check logs for specific error causes
4. Verify database connectivity
5. Check for resource exhaustion

### Recovery

1. Clear blacklist if legitimate users affected
2. Adjust rate limits based on attack pattern
3. Document incident and update procedures
4. Consider additional mitigation measures

## Support

For security issues, please contact the security team directly rather than opening public issues.

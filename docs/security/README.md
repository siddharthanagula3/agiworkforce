# Security Documentation

Security documentation, audits, and monitoring guides for AGI Workforce.

## Security Practices

### Authentication

- JWT tokens via Supabase Auth
- OS Keyring for credential storage
- Device authorization flow for desktop app

### Data Protection

- AES-256-GCM encryption for sensitive data
- Row Level Security (RLS) on all Supabase tables
- Secure credential storage in OS keyring

### API Security

- Rate limiting on all endpoints
- Webhook signature verification
- Input validation with Zod

### Audit Logging

- Security events logged to `security_audit_logs` table
- 90-day retention policy
- Event types: auth_failed, rate_limit_exceeded, suspicious_activity

## Related Documentation

- [Security Audit Report](../reports/SECURITY_AUDIT_REPORT.md)
- [API Rate Limits](../api/RATE_LIMITS.md)
- [ARCHITECTURE.md Security Section](../../ARCHITECTURE.md)

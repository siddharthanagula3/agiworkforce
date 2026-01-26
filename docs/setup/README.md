# Setup Guides

Configuration and setup guides for AGI Workforce services.

## Documents

| Document                                                        | Description                     |
| --------------------------------------------------------------- | ------------------------------- |
| [Local Webhook Setup](LOCAL_WEBHOOK_SETUP.md)                   | Testing Stripe webhooks locally |
| [Stripe Integration Checklist](STRIPE_INTEGRATION_CHECKLIST.md) | Stripe setup verification       |
| [Stripe Fixes Summary](STRIPE_FIXES_SUMMARY.md)                 | Stripe-related fixes applied    |
| [Environment Fixes](ENV_FIXES_SUMMARY.md)                       | Environment configuration fixes |
| [Fixtures Creation](FIXTURES_CREATION_SUMMARY.md)               | Test fixture setup              |

## Common Setup Tasks

### Local Development

```bash
# Install dependencies
pnpm install

# Copy environment template
cp apps/web/.env.example apps/web/.env.local

# Start development
pnpm dev:desktop
```

### Stripe Setup

1. Create Stripe account
2. Configure webhook endpoints
3. Set environment variables
4. Test with Stripe CLI

## See Also

- [Getting Started](../getting-started/)
- [Development Setup](../development/setup.md)

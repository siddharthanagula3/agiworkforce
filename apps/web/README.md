# AGI Workforce Web

> Next.js platform for billing, subscriptions, and account management

The web platform handles subscription management, billing, and device linking. AGI/automation capabilities are in the desktop app.

## Quick Start

```bash
cd apps/web
pnpm install
pnpm dev
```

Opens at `http://localhost:3001`.

## Technology Stack

| Component | Technology               |
| --------- | ------------------------ |
| Framework | Next.js 16               |
| Frontend  | React 19, TypeScript 5.9 |
| Database  | Supabase PostgreSQL      |
| Auth      | Supabase Auth            |
| Payments  | Stripe                   |
| Styling   | Tailwind CSS v4          |

## Project Structure

```
apps/web/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Auth routes (login, signup)
│   ├── (dashboard)/        # Protected routes (settings, billing)
│   ├── api/                # API routes
│   │   ├── checkout/       # Stripe checkout
│   │   ├── webhook/        # Stripe webhooks
│   │   └── link-device/    # Device pairing
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Landing page
├── lib/
│   ├── services/           # Business logic
│   │   ├── subscription.ts # Subscription management
│   │   └── credit.ts       # Credit system
│   ├── supabase/           # Supabase clients
│   ├── rate-limit.ts       # Rate limiting
│   └── price-tier-mapping.ts
├── components/             # React components
├── __tests__/              # Vitest tests
└── supabase/
    └── migrations/         # Database migrations
```

## Commands

### Development

```bash
# Start dev server
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

### Building

```bash
# Production build
pnpm build

# Start production server
pnpm start
```

## Configuration

### Environment Variables

Create `.env.local` from `.env.example`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...

# Stripe Price IDs
STRIPE_PRICE_HOBBY_MONTHLY=price_...
STRIPE_PRICE_HOBBY_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_MAX_MONTHLY=price_...
STRIPE_PRICE_MAX_YEARLY=price_...

# App URL
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## Database

### Supabase Setup

1. Create project at [supabase.com](https://supabase.com/)
2. Run migrations: `supabase db push`
3. Enable Row Level Security

### Migrations

```bash
# Create new migration
supabase migration new migration_name

# Apply migrations
supabase db push
```

## Stripe Integration

### Webhook Events

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### Local Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks
stripe listen --forward-to localhost:3001/api/webhook/stripe
```

## Deployment

Auto-deploys to Vercel on push to main.

### Manual Deploy

```bash
vercel
```

### Environment Variables

Set in Vercel Dashboard → Settings → Environment Variables.

## API Routes

| Route                 | Method | Description                    |
| --------------------- | ------ | ------------------------------ |
| `/api/checkout`       | POST   | Create Stripe checkout session |
| `/api/webhook/stripe` | POST   | Handle Stripe webhooks         |
| `/api/link-device`    | POST   | Generate device link code      |
| `/api/me`             | GET    | Get current user profile       |

## Related Documentation

- [Full Documentation](../../docs/README.md)
- [Web Deployment](../../docs/deployment/web-deployment.md)
- [Architecture](../../ARCHITECTURE.md)

# Web Deployment

Deploying the AGI Workforce web platform to Vercel.

## Vercel Deployment

### Automatic Deployment

The web app auto-deploys to Vercel on push to main branch.

### Manual Deployment

```bash
cd apps/web
vercel
```

## Environment Variables

Configure in Vercel Dashboard → Settings → Environment Variables:

### Required

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### Stripe Price IDs

```env
STRIPE_PRICE_HOBBY_MONTHLY=price_...
STRIPE_PRICE_HOBBY_YEARLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_MAX_MONTHLY=price_...
STRIPE_PRICE_MAX_YEARLY=price_...
```

### LLM Providers (for managed proxy)

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
```

### Rate Limiting

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

## Supabase Setup

### 1. Create Project

1. Go to [supabase.com](https://supabase.com/)
2. Create new project
3. Copy URL and keys

### 2. Run Migrations

```bash
cd apps/web
supabase link --project-ref your-project-ref
supabase db push
```

### 3. Enable RLS

Ensure Row Level Security is enabled on all tables.

## Stripe Setup

### 1. Create Products and Prices

In Stripe Dashboard:

1. Create products for each plan tier
2. Create monthly and yearly prices
3. Copy price IDs to environment variables

### 2. Configure Webhook

1. Go to Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-domain.com/api/webhook/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

## Custom Domain

### Vercel

1. Go to Project Settings → Domains
2. Add your domain
3. Configure DNS:
   - A record: `76.76.21.21`
   - CNAME: `cname.vercel-dns.com`

### SSL

SSL is automatically provisioned by Vercel.

## Monitoring

### Vercel Analytics

Enable in Project Settings → Analytics.

### Sentry (optional)

```env
SENTRY_DSN=https://...
SENTRY_ENVIRONMENT=production
```

## Performance

### Edge Functions

API routes can be configured as Edge Functions:

```typescript
export const runtime = 'edge';

export async function GET() {
  return Response.json({ status: 'ok' });
}
```

### Static Generation

Pages are statically generated where possible for optimal performance.

## Troubleshooting

### Build fails

```bash
# Check build locally
cd apps/web && pnpm build

# Check for TypeScript errors
pnpm typecheck
```

### Webhook not receiving events

1. Verify endpoint URL
2. Check Stripe Dashboard → Webhooks → Logs
3. Verify `STRIPE_WEBHOOK_SECRET`

### Environment variables not loading

1. Ensure variables are set for correct environment (Production/Preview)
2. Redeploy after adding variables

## Deployment Checklist

- [ ] All environment variables configured
- [ ] Supabase migrations applied
- [ ] RLS policies enabled
- [ ] Stripe webhook configured
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Analytics enabled
- [ ] Error tracking configured

## Next Steps

- [Desktop Builds](desktop-builds.md)
- [Configuration Guide](../getting-started/configuration.md)

# Stripe Webhook Validation Report

## Webhook Endpoint Configuration

### Expected Endpoint URL

- **Production**: `https://agiworkforce.com/api/stripe-webhook`
- **Alternative**: `https://web-siddharthanagula4.vercel.app/api/stripe-webhook`

### Required Environment Variables

- `STRIPE_SECRET_KEY` - Must be set (starts with `sk_`)
- `STRIPE_WEBHOOK_SECRET` - Must be set (starts with `whsec_`)
- `NEXT_PUBLIC_SUPABASE_URL` - Must be set
- `SUPABASE_SERVICE_ROLE_KEY` - Must be set

## Webhook Event Handling

### Events Handled

The webhook handler processes the following events:

1. ✅ `checkout.session.completed` - Creates/updates subscription after successful checkout
2. ✅ `checkout.session.async_payment_succeeded` - Handles delayed payment methods
3. ✅ `checkout.session.async_payment_failed` - Updates subscription status to `past_due`
4. ✅ `customer.subscription.created` - Creates subscription record
5. ✅ `customer.subscription.updated` - Updates subscription details
6. ✅ `customer.subscription.deleted` - Marks subscription as canceled
7. ✅ `invoice.payment_succeeded` - Updates subscription to active status
8. ✅ `invoice.payment_failed` - Updates subscription to past_due status

### Signature Verification

- ✅ Webhook signature is verified using `stripe.webhooks.constructEvent()`
- ✅ Returns 400 error if signature is missing or invalid
- ✅ Uses `STRIPE_WEBHOOK_SECRET` from environment variables

### Error Handling

- ✅ All database operations wrapped in try-catch blocks
- ✅ Returns 200 response even if processing fails (to prevent retries)
- ✅ Comprehensive logging for debugging

## Validation Checklist

### Code Validation

- [x] Signature verification implemented
- [x] All required events handled
- [x] Error handling in place
- [x] Database operations use service role key
- [x] Plan tier inference from price_id (more reliable than metadata)
- [x] Fallback logic for missing price_id

### Configuration Validation

- [ ] Webhook endpoint registered in Stripe Dashboard
- [ ] Webhook secret set in Vercel environment variables
- [ ] All events subscribed in Stripe Dashboard
- [ ] Endpoint URL matches production domain

### Testing Recommendations

1. Use Stripe CLI to test locally: `stripe listen --forward-to localhost:3000/api/stripe-webhook`
2. Trigger test events: `stripe trigger checkout.session.completed`
3. Check Vercel function logs for webhook processing
4. Verify Supabase subscriptions table updates

## Common Issues

### Issue: Webhook not receiving events

**Solution**:

- Verify endpoint URL in Stripe Dashboard matches production URL
- Check webhook secret matches between Stripe and Vercel
- Ensure endpoint is publicly accessible (HTTPS required)

### Issue: Signature verification fails

**Solution**:

- Verify `STRIPE_WEBHOOK_SECRET` is set correctly in Vercel
- Ensure using the correct secret for the endpoint (test vs live)
- Check that raw request body is used (not parsed JSON)

### Issue: Subscription not updating

**Solution**:

- Check Supabase logs for database errors
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set
- Check webhook logs for processing errors
- Verify `supabase_user_id` is in checkout session metadata

## Next Steps

1. **Verify in Stripe Dashboard**:
   - Go to https://dashboard.stripe.com/workbench/webhooks
   - Check if endpoint exists with correct URL
   - Verify all 8 events are subscribed
   - Copy webhook signing secret

2. **Verify in Vercel**:
   - Go to https://vercel.com/siddharthanagula4/web/settings/environment-variables
   - Ensure `STRIPE_WEBHOOK_SECRET` is set
   - Ensure `STRIPE_SECRET_KEY` is set
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is set

3. **Test Webhook**:
   - Use Stripe CLI to send test events
   - Check Vercel function logs
   - Verify Supabase database updates

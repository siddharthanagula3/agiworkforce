# Security Guidelines for AGI Workforce

## Environment Variables Security

### ✅ Current Security Status

All environment files containing sensitive API keys and secrets are now properly secured:

- **File Permissions**: All `.env*` files set to `600` (owner read/write only)
- **Git Ignore**: All `.env*` files are excluded from version control
- **No Committed Secrets**: Verified no secrets exist in git history

### 🔒 Protected Files

The following files contain sensitive credentials and must remain secure:

```
apps/web/.env.local          - Production LLM API keys, Stripe live keys
apps/desktop/.env.local      - Desktop app configuration
.env.local                   - Root environment config
.env.production              - Production environment config
```

### 🔑 Sensitive Credentials Inventory

**LLM Provider API Keys (9 providers):**

- OpenAI (`OPENAI_API_KEY`) - GPT models
- Anthropic (`ANTHROPIC_API_KEY`) - Claude models
- Google (`GOOGLE_API_KEY`) - Gemini models
- xAI (`XAI_API_KEY`) - Grok models
- DeepSeek (`DEEPSEEK_API_KEY`)
- Qwen (`QWEN_API_KEY`)
- Moonshot (`MOONSHOT_API_KEY`) - Kimi models
- Perplexity (`PERPLEXITY_API_KEY`)
- ZhipuAI (`ZHIPU_API_KEY`) - GLM models

**Payment & Billing:**

- Stripe Secret Key (`STRIPE_SECRET_KEY`) - **LIVE KEY**
- Stripe Webhook Secret (`STRIPE_WEBHOOK_SECRET`)
- Stripe Publishable Key (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)

**Database & Auth:**

- Supabase Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`) - **ADMIN ACCESS**
- Supabase Anon Key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Supabase URL (`NEXT_PUBLIC_SUPABASE_URL`)

**Other Services:**

- GitHub Token (`GITHUB_TOKEN`)
- Runway API Key (`RUNWAY_API_KEY`) - Video generation
- Upstash Redis (`UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_URL`)
- CSRF Secret (`CSRF_SECRET`)
- CRON Secret (`CRON_SECRET`)

### 🚨 Security Rules

**NEVER:**

1. ❌ Commit `.env*` files to git (except `.env.example`)
2. ❌ Share API keys in public forums, chat, or screenshots
3. ❌ Store production keys in development tools or browser storage
4. ❌ Use production keys for local development (use separate test keys)
5. ❌ Leave default/weak secrets in production

**ALWAYS:**

1. ✅ Keep file permissions at `600` (owner-only access)
2. ✅ Use `.env.example` files to document required variables (without values)
3. ✅ Rotate keys immediately if compromised
4. ✅ Use different API keys for development vs production
5. ✅ Store production secrets in Vercel environment variables
6. ✅ Enable 2FA on all service accounts (OpenAI, Anthropic, Stripe, etc.)
7. ✅ Monitor API usage for anomalies

### 🔄 Key Rotation Procedure

If any credentials are compromised:

1. **Immediate Actions:**

   ```bash
   # Revoke the compromised key at the provider's dashboard
   # Generate a new key
   # Update .env.local with new key
   # Update Vercel environment variables
   vercel env pull .env.local
   ```

2. **Update Git History (if secrets were committed):**

   ```bash
   # Use BFG Repo-Cleaner or git-filter-repo
   # Contact GitHub support to purge from GitHub's cache
   ```

3. **Affected Services:**
   - OpenAI: https://platform.openai.com/api-keys
   - Anthropic: https://console.anthropic.com/settings/keys
   - Stripe: https://dashboard.stripe.com/apikeys
   - Supabase: https://supabase.com/dashboard/project/_/settings/api
   - GitHub: https://github.com/settings/tokens

### 📋 Security Checklist

**Before Every Commit:**

- [ ] Run `git status` to verify no `.env*` files are staged
- [ ] Check `git diff --staged` for any API keys or secrets
- [ ] Verify `.gitignore` includes all `.env*` patterns

**Monthly Security Audit:**

- [ ] Review API key usage and rotate if needed
- [ ] Check Stripe dashboard for suspicious transactions
- [ ] Review Supabase logs for unauthorized access
- [ ] Verify file permissions: `find . -name ".env*" ! -name "*.example" -exec ls -la {} \;`
- [ ] Update dependencies for security patches

**Production Deployment:**

- [ ] Environment variables set in Vercel dashboard (not in code)
- [ ] Stripe webhook endpoints use HTTPS with signature verification
- [ ] CORS configured to allow only production domains
- [ ] Rate limiting enabled on all API endpoints
- [ ] Supabase RLS policies enabled on all tables

### 🛡️ Additional Security Measures

**Recommended:**

1. Enable API key restrictions (IP allowlisting where supported)
2. Set up monitoring/alerts for unusual API usage
3. Use Stripe webhook signature verification (already implemented)
4. Implement request signing for desktop app → API communication
5. Regular security audits of dependencies (`pnpm audit`)
6. Enable Supabase point-in-time recovery (PITR)

### 📞 Emergency Contacts

If you suspect a security breach:

1. **Revoke all API keys immediately**
2. **Contact providers:**
   - Stripe: https://support.stripe.com/
   - Supabase: support@supabase.com
   - OpenAI: https://help.openai.com/
3. **Review access logs** in each service dashboard
4. **Notify affected users** if user data was compromised

### 🔍 Verification Commands

```bash
# Verify file permissions
find . -name ".env*" ! -name "*.example" -exec ls -la {} \;

# Check if any env files are tracked by git
git ls-files | grep -E "\.env"

# Verify gitignore is working
git check-ignore -v .env.local

# Check for secrets in git history
git log --all --full-history --source --pretty=format:"%h %s" -- "*env*"
```

### 📚 References

- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [Stripe Security Best Practices](https://stripe.com/docs/security/guide)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)
- [GitHub Token Security](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

---

**Last Security Audit:** 2026-02-04
**Next Audit Due:** 2026-03-04

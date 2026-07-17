# Clerk dev → production cutover (agiworkforce.com)

Status: 2026-06-14 — production runs Clerk **development** keys (`pk_test_`, FAPI
`clerk.accounts.dev`), so every visitor sees a "Development mode" badge on
`/login`. This is the last gap between "demo-ready" and "production-grade public
auth". The prod-wide 500 was a separate issue (fixed in PR #392 — `type:module`).

## Pre-checks already done (all green)

- **CAA records** allow `letsencrypt.org` and `pki.goog` — Clerk's two CAs — so
  TLS cert issuance won't be blocked. (`dig agiworkforce.com CAA`)
- **DNS is hosted on Vercel** (`ns1/ns2.vercel-dns.com`) → records are added in
  the Vercel dashboard or via `vercel dns add`, not a separate registrar.
- There is a **wildcard `*.agiworkforce.com → Vercel`**. Explicit CNAMEs for the
  Clerk subdomains take precedence over the wildcard, so adding them is safe.
- No Clerk production instance exists yet (`npx clerk@latest deploy status` →
  `state: not_started`).

## Steps (≈10 min of work + up to 48h DNS/cert wait)

1. **Create the production instance (interactive — must be a human terminal):**

   ```bash
   cd apps/web
   npx clerk@latest deploy
   ```

   Choose "clone development settings". This prints the exact DNS records
   (CNAME targets for `clerk`, `accounts`, `clkmail`, `clk._domainkey`,
   `clk2._domainkey`) and the new `pk_live_…` / `sk_live_…` keys.

2. **Add the DNS records in Vercel** (DNS is on Vercel, so either the dashboard
   → Domains → agiworkforce.com, or CLI). CLI form, using the targets Clerk gave:

   ```bash
   vercel dns add agiworkforce.com clerk            CNAME <frontend-api-target>
   vercel dns add agiworkforce.com accounts         CNAME <accounts-target>
   vercel dns add agiworkforce.com clkmail          CNAME <clkmail-target>
   vercel dns add agiworkforce.com clk._domainkey   CNAME <dkim1-target>
   vercel dns add agiworkforce.com clk2._domainkey  CNAME <dkim2-target>
   ```

3. **Swap the Vercel env to live keys** (do this yourself — never paste secret
   keys where an assistant can see them):
   - Vercel → Project → Settings → Environment Variables → Production
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → `pk_live_…`
   - `CLERK_SECRET_KEY` → `sk_live_…`
   - Keep `CLERK_AUTHORIZED_PARTIES=https://agiworkforce.com,https://www.agiworkforce.com`
     (it currently has a trailing `\n` — fix that while you're in there).
   - For production OAuth (Google/GitHub) you must add your **own** OAuth
     credentials in the Clerk dashboard (dev uses Clerk's shared ones).

4. **Configure the Chrome extension against the same production instance:**
   - Enable Native API in Clerk's Native applications settings.
   - Set the extension release environment values from
     `apps/extension/.env.example`: the `pk_live_…` publishable key, exact
     Clerk Frontend API origin, exact Sync Host origin, and stable CRX public
     key.
   - Build the stable extension ID from that public key and add
     `chrome-extension://<id>` to the production Clerk instance's
     `allowed_origins`.
   - Run `pnpm --filter @agiworkforce/extension package`; the package command
     rejects test keys, missing origins, malformed origins, and missing CRX key.

   Clerk's current side-panel Sync Host implementation updates after the panel
   is closed and reopened; do not claim live cross-window refresh until the SDK
   supports it and the behavior is re-verified.

5. **Redeploy production** so the new public key is baked into the build:

   ```bash
   vercel --prod --yes --archive=tgz
   ```

6. **Verify:**
   ```bash
   npx clerk@latest deploy status          # expect state: complete
   curl -s https://agiworkforce.com/login | grep -o 'clerk.accounts.dev\|Development mode'   # should be EMPTY now
   ```
   The "Development mode" badge should be gone and `/login` should load the
   production FAPI (`clerk.agiworkforce.com`).

## What I can do for you here

- Run the `vercel dns add` commands once you paste me the CNAME targets from
  step 1 (those targets are public, not secrets).
- Re-run the verification curls/`clerk deploy status` after each step.
- Fix the `CLERK_AUTHORIZED_PARTIES` trailing-`\n`.

I cannot run the interactive `clerk deploy` or enter the `sk_live_` secret — those are yours.

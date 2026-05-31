# Web Pentest Findings — apps/web

**Audit date**: 2026-05-04
**Scope**: 90 API routes + middleware + lib/services (Next.js 14 App Router)
**Methodology**: Static analysis, threat modeling, dataflow review

## Summary

1 CRITICAL / 4 HIGH / 6 MEDIUM / 4 LOW / 3 INFO

**Overall posture**: Materially improved since the last audit cycle (WEB-SET-TOKEN-UNVALIDATED fixed, HMAC timing-safe compares present, idempotent Stripe replay protection added, fail-closed rate limiting on sensitive routes). The remaining critical and high findings are real and exploitable in production.

---

## Findings (sorted by severity)

### [SEV-WEB-01] SSRF via user-controlled `image_url` forwarded to upstream LLM APIs — CRITICAL

**Location**: `apps/web/lib/llm-providers/anthropic.ts:407-422`

**Attack scenario**: The chat completions endpoint (`/api/llm/v1/chat/completions`) accepts multimodal messages where each content part may carry an `image_url.url` field (schema at `route.ts:50-57`). This value is passed verbatim to the Anthropic provider at `anthropic.ts:408`. Line 411 checks for a `data:` URI; if the check fails, the raw URL is forwarded as an Anthropic `type: url` image source at line 422 (`{ type: 'image', source: { type: 'url', url } }`). Anthropic's API then fetches that URL server-side. No allowlist, scheme check, or block of link-local/RFC1918 ranges is applied. The same multimodal_content array flows via `route.ts:606-612` to the factory without egress validation.

**Edge cases that reproduce**:

- `http://169.254.169.254/latest/meta-data/iam/security-credentials/<role>` — AWS instance metadata via Anthropic's egress (defenders thinking they're behind WAF miss this)
- `http://[::1]/internal-status` — IPv6 localhost (Anthropic infra side)
- `http://internal-redis.svc.cluster.local:6379` — Kubernetes service discovery
- `https://attacker.com/redirect?to=http://169.254.169.254/...` — relies on Anthropic following redirects
- `data:` URI with malformed Base64 — confirms the `data:` shortcut path

**PoC concept (do not execute)**:

```
POST /api/llm/v1/chat/completions
Authorization: Bearer <valid-jwt>
x-csrf-token: <token>

{
  "model": "claude-sonnet-4-6",
  "messages": [{
    "role": "user",
    "content": [
      {"type":"image_url","image_url":{"url":"http://169.254.169.254/latest/meta-data/iam/security-credentials/"}},
      {"type":"text","text":"describe this image"}
    ]
  }]
}
```

**Impact**: CRITICAL. An attacker with a valid subscription token probes any URL accessible to Anthropic/OpenAI infrastructure (cloud metadata endpoints, internal services). The model's text response leaks fetched content back. Affects both `/api/llm/v1/chat/completions` and `/api/llm/v2/chat`.

**Fix**: In `buildAnthropicContentBlocks` before line 422, call `validateEgressUrl(url)` from `lib/egress-policy.ts`. Reject non-HTTPS or URLs not matching the provider allowlist. For images, require either `data:` base64 URIs or a CDN-proxied URL that is pre-validated.

**References**: CWE-918, OWASP A10:2021

---

### [SEV-WEB-02] IDOR — `OrganizationService` methods have no caller membership check — HIGH

**Location**: `apps/web/lib/services/organization-service.ts:109-131, 137-153, 159-172`

**Attack scenario**: `getOrganizationMembers(orgId)` queries `organization_members` filtered only by `organization_id` (line 124). There is no check that the calling user belongs to that organization. The service uses the service-role client, so Supabase RLS provides zero protection. Any authenticated user who guesses or enumerates an organization UUID can retrieve the full member list (email, display_name, avatar_url via the profiles join at lines 114-121). The same structural gap applies to `addMember` and `removeMember` — neither verifies the calling user has admin rights in the target org.

**Edge cases that reproduce**:

- Authenticated user with valid JWT but no org membership → can still call `GET /api/organizations/<any-uuid>/members` and get full roster
- UUID enumeration: organization IDs are gen_random_uuid() so blind enumeration is hard, but an attacker who learns one org UUID via PR title, screenshot, or social-engineering can pivot
- Race window: a member who was just removed retains the ability to call `addMember` because the check is absent

**Impact**: HIGH. Cross-tenant member enumeration (email, name), unauthorized member addition/removal.

**Fix**: Before any org-scoped mutation, verify the caller is a member:

```ts
const { data: membership } = await supabase
  .from('organization_members')
  .select('role')
  .eq('organization_id', orgId)
  .eq('user_id', callerUserId)
  .single();
if (!membership) throw createError.forbidden('Not a member of this organization');
```

Require `role = 'admin' | 'owner'` for `addMember`/`removeMember`.

**References**: CWE-639, OWASP A01:2021

---

### [SEV-WEB-03] Egress policy incomplete — 5 providers with `*_BASE_URL` overrides not validated — HIGH

**Location**: `apps/web/app/api/llm/v1/chat/completions/route.ts:399-429`

**Attack scenario**: The route validates custom base URLs for only 4 providers (`openai`, `qwen`, `deepseek`, `moonshot`) via `providerBaseUrlEnvMap`. The following providers have `*_BASE_URL` env keys that are read by the factory but are NOT in the map and therefore NOT passed through `validateEgressUrl`:

- `ANTHROPIC_BASE_URL` (AnthropicProvider)
- `XAI_BASE_URL` (XAIProvider)
- `PERPLEXITY_BASE_URL` (PerplexityProvider)
- `ZHIPU_BASE_URL` (ZhipuProvider)
- `GOOGLE_BASE_URL` (GoogleProvider)

If any of these env vars is set to an internal metadata URL (through misconfiguration, supply-chain compromise, or a future admin write path), those providers make unvalidated outbound requests.

**Edge cases that reproduce**:

- Misconfiguration: ops engineer sets `XAI_BASE_URL=http://internal-xai-mock` in staging — leaks API key to internal service
- Supply chain: malicious npm package mutates `process.env.ANTHROPIC_BASE_URL` at startup
- Future write path: admin UI lets superuser set provider URLs (planned per architecture review)

**Impact**: HIGH. Defense-in-depth failure; 5 of 9 providers bypass the egress allowlist.

**Fix**: Extend `providerBaseUrlEnvMap` to include all nine providers.

**References**: CWE-918, OWASP A05:2021

---

### [SEV-WEB-04] Audio transcription: no file-size cap, no MIME type validation — HIGH

**Location**: `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:64-127`

**Attack scenario**: The endpoint accepts multipart form data with no file size limit and no MIME type check. An attacker uploads a multi-gigabyte file. The serverless function buffers the entire payload until the function timeout (OOM risk). The rate limit is 20 requests/minute, so a single malicious subscriber can maintain sustained large-file pressure. Additionally, any file type (PDF, executable) is accepted and forwarded to OpenAI, bypassing content-type policy at the proxy layer.

**Edge cases that reproduce**:

- Upload `/dev/zero` 5GB stream → Vercel function OOMs (exceeds default function memory)
- Upload PDF with `Content-Type: audio/mpeg` spoofed → forwarded to OpenAI (waste of credits)
- Upload zip file with `audio/mpeg` header → bypasses content policy
- Streaming-style multipart upload with `Content-Length: 999999999999` → memory exhaustion if not capped

**PoC concept**:

```bash
curl -X POST https://agiworkforce.com/api/llm/v1/audio/transcriptions \
  -H "Authorization: Bearer <jwt>" \
  -F "file=@/dev/zero;type=audio/mpeg;filename=audio.mp3" \
  -F "model=whisper-1"
```

**Impact**: HIGH. Memory exhaustion DoS on Vercel functions; content policy bypass.

**Fix**:

```ts
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/x-m4a',
]);
if (!(file instanceof File)) {
  return 400;
}
if (file.size > MAX_AUDIO_BYTES) {
  return 413;
}
if (!ALLOWED_AUDIO_TYPES.has(file.type)) {
  return 415;
}
```

**References**: CWE-400, CWE-434, OWASP A04:2021

---

### [SEV-WEB-05] GitHub webhook `processReview` calls `cookies()` outside request scope — HIGH

**Location**: `apps/web/app/api/github/webhook/route.ts:86-191`

**Attack scenario**: The handler returns `{ received: true }` at line 192 and runs `processReview()` asynchronously. Inside `processReview`, lines 88-105 call `await cookies()` to create a Supabase SSR client. In Next.js 14, `cookies()` is request-scoped; after the handler has returned, the cookie store is no longer available. The SSR client operates as unauthenticated (anon-key, no session). The `github_installations` query at line 107 runs under the anon key: either it returns no rows (silently drops the review), or if RLS grants anon access to `github_installations`, it may return unintended rows. Separately, there is no deduplication on `x-github-delivery` — GitHub retries on timeout cause duplicate AI reviews on the same PR.

**Edge cases that reproduce**:

- New PR opens → webhook fires → `processReview` runs detached → `cookies()` returns empty → query returns no rows → review never posted (silent failure)
- GitHub retries webhook on 5s timeout → second run also fails silently → user sees no error in logs
- If RLS is misconfigured to allow anon SELECT on `github_installations` → arbitrary user PR processed against wrong installation
- Duplicate delivery via GitHub's at-least-once retry → if review WERE posted, two comments appear

**Impact**: HIGH. Feature silently broken for all PR reviews; potential RLS bypass on `github_installations` for anon role; duplicate comments on retries.

**Fix**: Fetch `installationRecord` synchronously in request scope using the service-role client before the async boundary. Pass the result (not the client) into `processReview`. Use `getServiceClient()` from `lib/supabase-server.ts` throughout — webhooks have no user session.

**References**: CWE-362, CWE-672

---

### [SEV-WEB-06] CSRF Bearer-token bypass is unconditional — may protect after-auth routes but not before-auth routes — MEDIUM

**Location**: `apps/web/lib/csrf.ts:210-218, 248-253`

**Attack scenario**: Both CSRF validation functions skip the check for any request with `Authorization: Bearer <anything>`. The `/api/auth/set-token` route checks CSRF at line 25 before JWT validation at line 49. A cross-origin attacker can POST to `set-token` with `Authorization: Bearer GARBAGE` in the header — CSRF is skipped because the header starts with `Bearer `, then JWT validation catches the garbage token. The CSRF gate is therefore ineffective for this route. The risk is currently absorbed by JWT validation, but any future route that exits before JWT validation (e.g., an early-return rate-limit pass-through) would have no CSRF coverage.

**Edge cases that reproduce**:

- Cross-origin form-encoded POST to `/api/auth/set-token` with `Authorization: Bearer x` → CSRF check skipped, JWT check rejects → returns 401, but the protection is JWT, not CSRF (defense fragility)
- Future endpoint added with auth-after-CSRF order → silently unprotected

**Impact**: MEDIUM. CSRF layer is logically ineffective on `set-token` and any route that checks CSRF before auth.

**Fix**: At minimum, document that the Bearer bypass must never be used on routes that also accept cookie-based auth. Stronger fix: invert the auth/CSRF order on `set-token` (validate JWT first, then CSRF is moot since Bearer auth is immune by definition).

**References**: CWE-352, OWASP A01:2021

---

### [SEV-WEB-07] `CSRF_SECRET` is process-lifetime cached with no rotation path — MEDIUM

**Location**: `apps/web/lib/csrf.ts:5-17`

**Attack scenario**: `getCsrfSecret()` caches the secret in a module-level variable indefinitely. If `CSRF_SECRET` is rotated after a compromise, old serverless instances continue using the old secret until they cold-cycle (potentially hours). An attacker who exfiltrated the old secret can continue forging tokens during this window. There is also no minimum entropy enforcement.

**Edge cases that reproduce**:

- Rotate secret in Vercel env var → existing warm Vercel instances keep old secret in module cache → attacker exfil window stays open
- Set `CSRF_SECRET=abc` (3 chars) → no validation → tokens predictable

**Impact**: MEDIUM. Key rotation is effectively impractical; deterred operators from rotating even post-compromise.

**Fix**: Support `CSRF_SECRET_PREV` to accept tokens from either secret during a transition window. Add `if (secret.length < 32) throw new Error('CSRF_SECRET too short')`.

**References**: CWE-321, OWASP A02:2021

---

### [SEV-WEB-08] `getOrganizationMembers` uses wildcard join with service-role — leaks full profile data — MEDIUM

**Location**: `apps/web/lib/services/organization-service.ts:114-121`

**Attack scenario**: The select at line 114 uses `select('*, profile:profiles(*)')` — wildcard on both tables via the service-role client. Any caller (including a `viewer`-role member) receives every column of `organization_members` and every column of `profiles`, including PII that RLS would normally restrict.

**Impact**: MEDIUM. Over-privileged profile data exposure (PII, metadata columns).

**Fix**: Replace wildcard with explicit columns: `select('id, user_id, role, profile:profiles(email, display_name, avatar_url)')`.

**References**: CWE-200, OWASP A01:2021

---

### [SEV-WEB-09] Rate-limiter identifier extracted from unverified JWT — bucket DoS against any user — MEDIUM

**Location**: `apps/web/lib/rate-limit.ts:404-411`

**Attack scenario**: `getRateLimitIdentifier()` extracts the `sub` claim by base64-decoding the JWT payload without signature verification (line 406). An attacker crafts a fake JWT with `sub` set to a victim's UUID. The attacker's requests are counted against the victim's rate-limit bucket (`user:<victim-uuid>`). 30 fast requests exhaust the victim's `llm-completion` budget.

**Edge cases that reproduce**:

- Forge JWT with arbitrary signature, set `sub` = known victim UUID
- POST to `/api/llm/v1/chat/completions` with fake bearer; route returns 401 from JWT verification, but `getRateLimitIdentifier` parses `sub` BEFORE auth and increments victim's bucket
- Repeat 30× in 60s → victim's legit requests get 429 for the next minute

**Impact**: MEDIUM. Targeted rate-limit DoS against any specific user.

**Fix**: Pass the validated `user.id` from the route handler as the explicit `identifier` parameter: `withRateLimit(request, 'llm-completion', user.id)`. This bypasses the unverified JWT parse path because an explicit identifier takes priority.

**References**: CWE-290, OWASP A07:2021

---

### [SEV-WEB-10] `validate-webhook` diagnostic endpoint leaks secret format + config in non-production — MEDIUM

**Location**: `apps/web/app/api/validate-webhook/route.ts:49-62`

**Attack scenario**: The response includes `stripeSecretKeyFormat` (whether the key starts with `sk_`) and `webhookSecretFormat` (starts with `whsec_`). More critically, `verifyDiagnosticSecret` at line 17 returns `true` (open access) when `CRON_SECRET` is unset in non-production — which includes any Vercel preview deployment where `NODE_ENV === 'development'`. The endpoint is publicly reachable on preview branches without any authentication.

**Impact**: MEDIUM. Confirms Stripe secret configuration status and format on preview/staging; unauthenticated access on Vercel preview deployments.

**Fix**: Gate on `VERCEL_ENV === 'production'` in addition to `NODE_ENV`. Remove the `stripeSecretKeyFormat`/`webhookSecretFormat` fields from the response body.

**References**: CWE-200, OWASP A05:2021

---

### [SEV-WEB-11] `AuditService.getOrganizationLogs()` has no caller membership check — MEDIUM

**Location**: `apps/web/lib/services/audit-service.ts:58-78`

**Attack scenario**: `getOrganizationLogs(orgId)` queries `audit_logs` filtered by `organization_id` using the service-role client. No check that the caller belongs to the target org. The `actor:profiles(email)` join at line 64 also returns member emails. Any route that calls this with an attacker-supplied `orgId` leaks the full audit trail.

**Impact**: MEDIUM. Full audit-trail IDOR with cross-tenant exfiltration.

**Fix**: Add org membership verification before the query, or migrate to `getUserClient(jwt)` and enforce via RLS.

**References**: CWE-639, OWASP A01:2021

---

### [SEV-WEB-12] Desktop token uses SHA-256 key derivation (not a KDF) — LOW

**Location**: `apps/web/app/api/auth/desktop-token/route.ts:32-39`

`getEncryptionKey()` uses `crypto.createHash('sha256').update(keySource).digest()`. SHA-256 is not a KDF. If the key source is a low-entropy passphrase, offline brute-force against captured ciphertext is practical.

**Fix**: `scryptSync(keySource, 'agi-desktop-token-v1', 32)` instead of SHA-256.

**References**: CWE-916, OWASP A02:2021

---

### [SEV-WEB-13] Rate limiter falls back to in-memory in multi-instance (non-Redis) deployments — LOW

**Location**: `apps/web/lib/rate-limit.ts:450-482`

In environments without Upstash Redis, the rate limiter uses per-process in-memory state. Vercel spawns multiple instances; an attacker opening N concurrent connections across N instances multiplies their effective rate limit by N. Security-sensitive endpoints fail-closed (correct), but `llm-streaming` and other non-critical endpoints allow the multiplication.

**Fix**: Require Redis in all deployed environments (including preview). Add a Vercel build check.

**References**: CWE-770, OWASP A04:2021

---

### [SEV-WEB-14] `anon-session-id` CSRF cookie lacks `__Host-` prefix — LOW

**Location**: `apps/web/lib/csrf.ts:189`

The cookie is `SameSite=Strict; Secure; HttpOnly; Path=/` but lacks `__Host-` prefix. A compromised subdomain can set a cookie named `anon-session-id` on the parent domain, enabling CSRF session fixation.

**Fix**: Rename to `__Host-anon-session-id` (browser enforces Secure + Path=/ + no Domain attribute, all already present).

**References**: CWE-565, OWASP A02:2021

---

### [INFO-01] Service-role client created inline per-request in chat/memory routes — INFO

**Location**: `apps/web/app/api/chat/conversations/route.ts:27`, `apps/web/app/api/memory/route.ts:26`, `apps/web/app/api/memory/[id]/route.ts:30`

Inline `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` calls rather than `getServiceClient()` from `lib/supabase-server.ts`. The inline calls may omit `persistSession: false, autoRefreshToken: false` security settings. Hygiene issue; use the shared factory for consistency.

---

### [INFO-02] `logProviderDiagnostics()` logs partial (first 4 + last 4 chars) API key material on cold start — INFO

**Location**: `apps/web/lib/llm-providers/factory.ts:57-65`

Partial key reveal (`sk_l...abcd`) reduces brute-force search space and is retained indefinitely in log aggregation. Replace with `'[configured]'` only.

---

### [INFO-03] Download placeholder tracking — INFO

**Location**: `apps/web/public/downloads/`

`agi-workforce-linux.AppImage` and `agi-workforce-win.exe` (placeholder files) are deleted per git status. Confirm that any marketing page links that previously pointed to these files now show "coming soon" rather than 404, to prevent phishing via attacker-hosted substitute binaries.

---

## Verified Fixed (do not re-audit)

- **WEB-SET-TOKEN-UNVALIDATED**: `set-token/route.ts:41-52` — JWT validated via `auth.getUser()` before setting cookie. Confirmed fixed.
- **Stripe webhook HMAC**: `stripe-webhook/route.ts:1233` — `stripe.webhooks.constructEvent()` uses timing-safe comparison. `runtime = 'nodejs'` pinned. Confirmed correct.
- **Stripe replay protection**: Atomic `process_stripe_event_idempotent` RPC at `stripe-webhook/route.ts:1247-1262`. Confirmed correct.
- **GitHub webhook signature**: `lib/github-app.ts:40-51` — `timingSafeEqual` with equal-length buffers. Confirmed correct.
- **CSRF HMAC**: `lib/csrf.ts:86-88` — double-HMAC-SHA256 both sides before `timingSafeEqual`; eliminates length-extension and timing leaks. Confirmed correct.
- **Rate limiter IP extraction**: Uses rightmost XFF value. Not trivially bypassable in Vercel deployment where Vercel appends the real client IP.
- **Admin role check**: Uses `app_metadata.role` (service-role only, not user-editable) at `admin/security/route.ts:79` and `debug/llm-status/route.ts:43`. Confirmed correct.

---

## Top 5 Action Items

| Priority | File:Line                                         | One-line fix                                                                                                                     |
| -------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `lib/llm-providers/anthropic.ts:422`              | Call `validateEgressUrl(url)` on every non-data-URI image URL before forwarding to Anthropic.                                    |
| 2        | `lib/services/organization-service.ts:109`        | Add org membership ownership check before `getOrganizationMembers`; require admin role before `addMember`/`removeMember`.        |
| 3        | `app/api/llm/v1/audio/transcriptions/route.ts:86` | Add `file.size > 25MB` rejection and MIME type allowlist check before forwarding to OpenAI.                                      |
| 4        | `app/api/llm/v1/chat/completions/route.ts:399`    | Extend `providerBaseUrlEnvMap` to include `anthropic`, `xai`, `perplexity`, `zhipu`, `google`.                                   |
| 5        | `app/api/github/webhook/route.ts:86`              | Move `github_installations` DB lookup before the async boundary; use `getServiceClient()` (not SSR anon) for webhook processing. |

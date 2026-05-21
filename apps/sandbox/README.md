# `@agiworkforce/sandbox`

Status: Current
Owner role: Web lead
Last updated: 2026-05-20
Kind: app
Criticality: high

## Purpose

Cross-origin artifact renderer at `sandbox.agiworkforce.com`. Single static
HTML, no build step. Receives LLM-generated HTML / React / SVG / Mermaid /
markdown / code via `postMessage` from the parent app, renders in a fully
isolated origin with `connect-src 'none'` CSP.

## Why

`apps/web` previously rendered LLM artifacts in an `<iframe sandbox="allow-scripts allow-same-origin">`
on the parent origin (`agiworkforce.com`). The W3C iframe-sandbox spec is
explicit: combining those two flags defeats the sandbox — scripts run with
the parent's cookies, localStorage, and same-origin fetch credentials.

This sandbox runs on a separate origin so the iframe is cross-origin by
construction. Scripts inside the artifact cannot read parent state, cannot
exfiltrate via fetch (CSP blocks `connect-src`), and cannot navigate the
top frame (`frame-ancestors` lock + the parent's own CSP).

## Local development

```
pnpm --filter @agiworkforce/sandbox dev
# → http://localhost:3001
```

Then set `NEXT_PUBLIC_SANDBOX_ORIGIN=http://localhost:3001` in
`apps/web/.env.local` and restart `pnpm --filter @agiworkforce/web dev`. Artifact iframes
in chat will load from the local sandbox.

## Production deployment

The sandbox is a separate Vercel project from `apps/web` so the origin
boundary is enforced by the browser, not by app logic.

### One-time setup (ops)

1. Create a new Vercel project: `vercel link --project agiworkforce-sandbox`
   from `apps/sandbox/`. Set the root directory to `apps/sandbox`.
2. Add the production domain in the Vercel dashboard:
   `sandbox.agiworkforce.com`.
3. Add the DNS record at the registrar (or wherever
   `agiworkforce.com` is managed):
   ```
   sandbox    IN  CNAME    cname.vercel-dns.com.
   ```
4. Verify the headers from `vercel.json` ship:
   ```
   curl -sI https://sandbox.agiworkforce.com/ | grep -i 'content-security-policy\|frame-ancestors'
   ```
   You should see `connect-src 'none'` and `frame-ancestors https://agiworkforce.com …`.
5. Set the env var on the **`apps/web`** Vercel project (Production +
   Preview):
   ```
   NEXT_PUBLIC_SANDBOX_ORIGIN=https://sandbox.agiworkforce.com
   ```
   Without this env var, `apps/web` falls back to a same-origin srcDoc
   iframe with `sandbox="allow-scripts"` (still safer than the pre-fix
   state because `allow-same-origin` is gone, but loses the cross-origin
   guarantee).

### Recurring deploys

```
vercel deploy --prod --cwd apps/sandbox
```

This pushes whatever is in `apps/sandbox/`. There is no build step.

## Protocol

The parent embeds:

```html
<iframe
  src="https://sandbox.agiworkforce.com/"
  sandbox="allow-scripts"
  title="Artifact preview"
></iframe>
```

The iframe announces readiness:

```ts
window.parent.postMessage({ type: 'sandbox-ready' }, '*');
```

The parent verifies `event.origin === NEXT_PUBLIC_SANDBOX_ORIGIN`, then
ships the artifact:

```ts
iframe.contentWindow!.postMessage(
  { type: 'render', kind: 'html', html: sanitizedHtml },
  sandboxOrigin,
);
```

The sandbox renders and replies:

```ts
window.parent.postMessage({ type: 'render-complete', kind: 'html' }, parentOrigin);
```

`kind` is one of `html` · `react` · `svg` · `mermaid` · `markdown` ·
`text` · `code`. Payload fields vary per kind — see
`apps/sandbox/index.html` (`dispatchRender`).

## Security envelope

The sandbox enforces:

- `default-src 'none'` (deny by default)
- `script-src` restricted to the sandbox origin + unpkg + jsdelivr (for
  React / Babel-standalone / Mermaid)
- `connect-src 'none'` — **no fetch / XHR / WebSocket exfil possible**
- `frame-src 'none'` — no nested iframes
- `frame-ancestors` locks embedding to known agiworkforce origins (set in
  `vercel.json` because `frame-ancestors` cannot be set by `<meta>`)
- Cross-origin to the parent → no access to parent cookies, localStorage,
  or same-origin endpoints

What's still possible (acceptable risk):

- The artifact may load images / fonts from `https:` — but it cannot
  exfiltrate via `<img src>` because the only data inside the sandbox is
  what the parent intentionally sent, which the user already saw on
  screen. There are no cookies or auth tokens here.
- Inline scripts execute (required for the React preview). They run in
  the sandbox origin only — `parent.document` throws cross-origin.

## Closing audit findings

- **WEB-13** iframe sandbox escape (`allow-scripts allow-same-origin`) —
  closed; the iframe is now cross-origin so the dual-flag mistake is
  impossible.
- **WEB-20** React artifact `unsafe-eval` — `unsafe-eval` is now scoped
  to the sandbox origin (which has no auth context, no cookies, no
  `connect-src`), eliminating the Babel-transpile-to-attack chain.
- **WEB-25** blob-URL `window.open` reverse-tabnabbing — the parent no
  longer needs to ship HTML blobs at all; the renderer lives at a
  predictable URL.

# TODO — Release Fixes + Competitive Strategy

_Updated: 2026-03-17 (session 7, release readiness audit + competitive analysis)_

## BLOCKERS — Fix Before Release

### B-1: Patch Vulnerable Dependencies

```bash
pnpm update jspdf undici next
```

- jsPDF <=4.2.0: CRITICAL HTML injection + HIGH PDF object injection
- undici <6.24.0 / <7.24.0: 6 HIGH WebSocket vulns + 3 moderate
- next 16.1.6: LOW HMR CSRF — patch to >=16.1.7

### B-2: Narrow Chrome Extension Host Permissions

File: `apps/extension/manifest.json`
Change from `["http://*/*", "https://*/*"]` to specific domains + `activeTab`.

### B-3: Set Expo Project ID

File: `apps/mobile/app.json` — replace `EXPO_PROJECT_ID_REQUIRED` placeholder.

### B-4: Create robots.txt

Create `apps/web/public/robots.txt` with proper Allow/Disallow rules + sitemap.

## WARNINGS — Fix Before Public Launch

- W-1: 22 console.log in desktop prod code — remove or replace with structured logging
- W-2: 7 dangerouslySetInnerHTML — all sanitized, audit each sanitizer function
- W-3: Version inconsistency (desktop 1.1.5, mobile/vscode 0.1.0) — align
- W-4: VS Code ext missing .vscodeignore + CHANGELOG.md
- W-5: Mobile newArchEnabled: false
- W-6: 10 TODO/FIXME comments (6 Rust + 4 TS)
- W-7: Desktop CSP allows unsafe-inline for styles
- W-8: Next.js 16.1.6 low-severity advisory

## COMPETITIVE STRATEGY — Beat Claude Across All Surfaces

### Position: "Claude for everyone, with no model lock-in"

AGI Workforce is the OPEN, multi-model alternative to Claude's entire product suite:

| Claude Product    | AGI Workforce Equivalent    | Our Advantage                                       |
| ----------------- | --------------------------- | --------------------------------------------------- |
| Claude Desktop    | Desktop App (Tauri)         | Multi-model (9+ providers), full desktop automation |
| Claude Code (CLI) | AGI Workforce CLI (planned) | Multi-model CLI, same agent runtime                 |
| Claude.ai (web)   | Web App (Next.js)           | Multi-model, self-hostable                          |
| Claude Mobile     | Mobile App (React Native)   | QR pair with desktop, live agent dashboard          |
| Claude MCP        | MCP + unlimited tools       | No artificial tool limits                           |
| Claude Projects   | Workspace + Memory          | Persistent cross-session memory with decay          |
| Claude Artifacts  | DynamicCanvas               | 10 widget types vs Claude's code/text only          |

### Key Differentiators to Amplify

1. **No model lock-in**: Use Claude, GPT, Gemini, Mistral, Llama, Ollama all in one app
2. **Desktop autonomy**: Full screen/keyboard/app control (Claude Desktop can't do this)
3. **Mobile companion**: Live agent dashboard from phone (Claude has nothing)
4. **Model Council**: Query multiple models simultaneously, get consensus
5. **140+ non-coding skills**: Healthcare, legal, finance, education (Claude is code-focused)
6. **AGI Workforce CLI**: Direct Claude Code competitor with multi-model support

## STORE SUBMISSION PREP

### Apple App Store

- [ ] App Store Connect account
- [ ] Code signing + provisioning profiles
- [ ] Screenshots (6 device sizes)
- [ ] Privacy policy URL + privacy labels
- [ ] App review notes

### Google Play Store

- [ ] Play Console account ($25)
- [ ] Play App Signing setup
- [ ] Feature graphic + screenshots
- [ ] Data safety section

### Chrome Web Store

- [ ] Developer account ($5)
- [ ] Store listing + screenshots
- [ ] Privacy policy + permissions justification

### VS Code Marketplace

- [ ] Azure DevOps publisher
- [ ] vsce package test
- [ ] README + CHANGELOG

### Desktop Distribution

- [ ] macOS code signing + notarization
- [ ] Windows code signing (EV cert)
- [ ] Linux AppImage/deb/rpm
- [ ] Auto-updater endpoint

## Build Status (ALL PASS — 2026-03-17)

| Surface      | Build            | TS       | Lint          |
| ------------ | ---------------- | -------- | ------------- |
| Desktop Rust | cargo check PASS | N/A      | clippy 0 warn |
| Desktop TS   | vite PASS        | 0 errors | clean         |
| Web          | pnpm build PASS  | 0 errors | clean         |
| Mobile       | N/A              | 0 errors | clean         |
| Chrome Ext   | vite PASS        | clean    | clean         |
| VS Code Ext  | esbuild PASS     | clean    | clean         |
| API Gateway  | pnpm build PASS  | clean    | clean         |
| Signaling    | pnpm build PASS  | clean    | clean         |

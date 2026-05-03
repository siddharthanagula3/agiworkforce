# Roadmap — AGI Workforce

> Live document. Update when waves/sprints change. Last updated: 2026-05-03.

## Current state

- **Wave 0 (cleanup) — DONE 2026-05-03**: 102 dead crates deleted (995K LOC), 5 root debris files removed, 6 stale plans/memory files removed, MEMORY.md refreshed, SSOT structure created.
- **Active sprint**: Sprint 1 — vault rewire (master password integration). See [docs/plans/sprint1-vault-rewire.md](plans/sprint1-vault-rewire.md).
- **Audit status**: P0 13/14 closed, P1 20/25 closed.

## MVP plan — 3 waves

### Wave 1 — CLI v1.0 (Week 1)

Ship the multi-provider CLI to the public via npm + Homebrew + GitHub releases.

**Why first:** Cargo green, binary exists, 22 subcommands work, npm wrapper exists, scripts/install.sh + scripts/homebrew/agiworkforce.rb exist. Just needs polish + distribution.

| Day | Task                                                                                                                  | Owner |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Strip 23 `#[allow(dead_code)]` modules in apps/cli/src/ (decide: wire or delete each)                                 | TBD   |
| 2   | Verify all 22 subcommands work end-to-end with 5 providers (Anthropic, OpenAI, Google, Ollama, Mistral)               | TBD   |
| 3   | Update apps/cli/npm/ for npm publish; verify 6 platform binaries (darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64) | TBD   |
| 4   | Publish Homebrew formula via scripts/homebrew/agiworkforce.rb to a tap repo                                           | TBD   |
| 5   | Tag v1.0.0; release.sh creates GitHub release with binaries; update README badges                                     | TBD   |
| 6   | Show HN post + r/LocalLLaMA + Twitter                                                                                 | TBD   |
| 7   | Monitor issues; rapid patch v1.0.1 if needed                                                                          | TBD   |

**Distribution:**

```bash
npm install -g @agiworkforce/cli
brew install agiworkforce/tap/agiworkforce
curl -fsSL https://agiworkforce.com/install.sh | bash
# Or: GitHub releases
```

**Pitch for launch post:** "Codex CLI but with 25 providers including local Ollama. BYOK. No vendor lock."

---

### Wave 2 — Desktop v1.0 (Weeks 1–4, parallel with Wave 1)

Ship signed Desktop matching Claude Desktop minimalism (per design decision Q2=A).

| Week | Tasks                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | **Chat consolidation**: pick `packages/chat` as canonical. Migrate apps/web's 141-file UnifiedAgenticChat to use ChatInterface. Delete vestigial views from apps/desktop/src/components/ (~50 of 84 dirs). Estimate: 5–7 days. |
| 2    | **IPC pruning**: replace hand-listed `generate_handler!` with `inventory`/`linkme` proc-macro (FIX-023). Wire `apps/desktop/check-wiring.sh` into CI. Delete the 26 silently-dead commands + audit the 169 never-invoked.      |
| 3    | **Windows code signing** (FIX-010): acquire EV cert; add `WINDOWS_CERTIFICATE` secret; wire AzureSignTool in release-desktop.yml. Test: `signtool verify /pa <installer>.exe`. Refuse to ship unsigned.                        |
| 4    | **Polish + privacy**: rewrite Privacy Policy (FIX-008 with counsel), GDPR Settings → Data section (FIX-041), regression tests, signed release pipeline end-to-end test. Tag desktop v1.0.0.                                    |

**Distribution:**

- agiworkforce.com/download → DMG + EXE + AppImage
- Auto-update via Tauri updater (already configured with minisign key)
- Mac App Store + Microsoft Store deferred (sandboxing rework)

**Pitch:** "Claude Desktop + ChatGPT + Gemini in one app. Use your own keys. Add local Ollama. Mobile companion approves agent actions from your phone."

---

### Wave 3 — Mobile + Extensions + Web Polish (Weeks 5–8)

| Surface                                  | Tasks                                                                                                                                                                        | Time                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Mobile (iOS App Store + Google Play)** | EAS Build, register Apple Developer Team ID, Google Play Developer account, App Store listing (screenshots, privacy policy, age rating), TestFlight beta, then submit.       | 3–4 weeks (review time included) |
| **Chrome ext**                           | Submit to Chrome Web Store. Screenshots, listing copy, privacy disclosure.                                                                                                   | 1–2 weeks                        |
| **VS Code ext**                          | Submit to VS Code Marketplace. README screenshots, demo gif.                                                                                                                 | 3–7 days                         |
| **Web**                                  | Fix WEB-4 (Stripe body-read), add observability (Sentry breadcrumbs end-to-end), CSP unsafe-inline removal (FIX-005 codemod). Hobby tier launch. Pro/Max waitlist page live. | 1 week                           |

---

## Beyond MVP (post-Wave 3)

- Linux computer-use (AT-SPI/libei integration — currently Path B placeholder per FIX-025)
- Real Google Cloud Batch integration (replace stub per FIX-028)
- EU data residency (currently us-east-2 only)
- Pro/Max tier launch (after security audit)
- Enterprise features: SSO, SCIM, custom retention
- Multi-agent / teams (currently stubbed in apps/cli/src/{teams.rs,subagent.rs})

---

## Decisions log (key product decisions, 2026-05-03)

| Decision               | Choice                                                           | Rationale                                             |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Strategy               | Path C (CLI + Desktop in parallel, then mobile/ext/web)          | Maximize visibility while building richer surfaces    |
| Design                 | Pixel-close Claude Desktop UI clone                              | Lowest design risk, fastest user learning             |
| Web chat consolidation | Migrate UnifiedAgenticChat → packages/chat                       | Single canonical component, mode-agnostic             |
| Pricing                | Local-only + BYOK free, Hobby paid only at MVP, Pro/Max waitlist | No managed cloud at scale until security audit clears |
| 110 dead crates        | Delete (preserved at ~/Desktop/reference/codex-cli/)             | -995K LOC; codex source preserved for re-port         |
| SSOT location          | Single AGI_WORKFORCE.md at root + docs/ reorg                    | Discoverable entry point, version-controlled          |

## How to update this file

When a wave ships:

1. Move "Wave N" section into a "## Wave N — SHIPPED YYYY-MM-DD" entry above current state
2. Add what's actually live (binary versions, distribution channels)
3. Update "Current state" at top with latest sprint

When a sprint completes:

1. Move the sprint's plan file from `docs/plans/` to `docs/plans/archive/`
2. Update the "Active sprint" line at top

# Execution Plan — 2026-03-17

## Vision: Open Multi-Model AI Platform — Beat Claude, No Lock-In

**Positioning**: AGI Workforce is the open, model-agnostic alternative to Anthropic's entire product suite (Claude Desktop, Claude Code, Claude.ai, Claude Mobile). Users can connect ANY LLM — cloud or local — and get full desktop autonomy, mobile companion, and 140+ non-coding skills.

**Competitive thesis**: Claude locks users into one model. We give them all models in one platform.

**Solo developer building a trillion-dollar platform.**

---

## Session 7: Release Readiness + Competitive Features

### Phase Status

| Phase                      | Status      | Result                                            |
| -------------------------- | ----------- | ------------------------------------------------- |
| 0. Bootstrap & Consolidate | DONE        | All root .md files current                        |
| 1. Build Health            | DONE        | ALL 8 surfaces build clean, 0 TS errors           |
| 2. Feature Sprint          | DONE        | 10 major features completed                       |
| 3. Audit & Bug Fix         | DONE        | All HIGH/MEDIUM Rust bugs pre-fixed, 13 new fixes |
| 4. Release Readiness Audit | DONE        | 4 BLOCKERs, 8 WARNINGs identified                 |
| 5. Competitive Research    | IN PROGRESS | Researching Claude Desktop/Code/MCP               |
| 6. Fix Blockers            | PENDING     | Patch vulns, narrow permissions, set IDs          |
| 7. Store Submissions       | PENDING     | 7 distribution channels                           |

### Build Health (ALL PASS)

All 8 surfaces: cargo check, tsc, vite/esbuild, pnpm build — PASS with 0 errors.

### Features Completed This Session

1. Model Council — multi-model consensus
2. Interactive Planning — preview/edit/approve plans
3. DynamicCanvas — 10 widget types + palette
4. Voice Mode — animated orb, push-to-talk, STT→LLM→TTS
5. Agent Collaboration — swarm, task delegation, results
6. Scheduler Panel — NLP input, history, controls
7. Memory Panel — browse, timeline, decay settings
8. Deep Research Panel — citations, reports
9. Services — 10 API endpoints + 7 WebSocket handlers
10. 13 audit bug fixes

### Release Blockers (4)

1. B-1: 20 dependency vulnerabilities (patch jsPDF, undici, next)
2. B-2: Chrome extension host_permissions too broad
3. B-3: Mobile Expo project ID placeholder
4. B-4: Web missing robots.txt

### Sprint Plan

| Sprint | Focus                                      | Status    |
| ------ | ------------------------------------------ | --------- |
| 1      | Planning + Council                         | DONE      |
| 2      | Canvas + Voice                             | DONE      |
| 3      | Fix blockers + Store submissions           | THIS WEEK |
| 4      | AGI Workforce CLI (Claude Code competitor) | NEXT WEEK |
| 5      | Deep Research + Codebase Wiki              | Week 3    |
| 6      | Remote Control + Meeting Agent             | Week 4    |

### Distribution Channels

| #   | Channel             | Status     | Blocker                       |
| --- | ------------------- | ---------- | ----------------------------- |
| 1   | Desktop             | ALMOST     | Code signing                  |
| 2   | Website             | ALMOST     | robots.txt, Next.js patch     |
| 3   | App Store           | NEEDS WORK | Expo ID, signing, screenshots |
| 4   | Play Store          | NEEDS WORK | Expo ID, signing, listing     |
| 5   | Chrome Web Store    | NEEDS WORK | Permissions, listing          |
| 6   | VS Code Marketplace | ALMOST     | .vscodeignore, CHANGELOG      |
| 7   | API Services        | READY      | Deploys clean                 |

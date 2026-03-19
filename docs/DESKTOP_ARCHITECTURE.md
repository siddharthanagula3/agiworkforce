# Desktop Architecture Reference

_Updated: 2026-03-18 | Generated from 15-agent parallel codebase exploration_

## Codebase Metrics

| Metric                     | Value       |
| -------------------------- | ----------- |
| Rust files                 | 711         |
| Rust LOC                   | 358,052     |
| TypeScript/TSX files       | 898         |
| TypeScript LOC             | 240,254     |
| Total LOC                  | 598,306     |
| Registered Tauri commands  | 932         |
| Frontend invoke() calls    | 325 unique  |
| Commands wired to frontend | ~35%        |
| Component directories      | 78          |
| Zustand store files        | 89          |
| MCP connectors             | 26 built-in |
| AI skills                  | 140+        |

## Module Quality Scores (from exhaustive audit)

| Module              | LOC      | Files | Quality | Key Strengths                                       |
| ------------------- | -------- | ----- | ------- | --------------------------------------------------- |
| core/llm            | 31,505   | 61    | 7.5/10  | 22+ providers, SSE streaming, cost tracking         |
| core/agent          | 40,692   | 31    | 8.1/10  | Excellent security (7 BUG fixes), LLM feedback loop |
| core/mcp            | 13,809   | 16    | 8.5/10  | OAuth 2.1+PKCE, AES-256-GCM encryption              |
| core/scheduler      | 4,683    | 6     | 9.0/10  | NLP parsing, cron/interval/oneshot, background loop |
| core/embeddings     | 2,163    | 6     | 7.0/10  | 3-tier fallback, model-id isolation                 |
| core/agi            | 2,802    | 2+    | 8.0/10  | Executor + conversation summarizer                  |
| sys/commands        | 127,000+ | 143   | 9.0/10  | 1341 commands, 0 prod unwraps                       |
| sys/security        | 13,527   | 29    | 8.0/10  | AES-256-GCM, Argon2id, ToolGuard, RBAC              |
| automation          | 24,745   | 51    | 8.2/10  | CDP browser, safety patterns, secret redaction      |
| features            | 34,100   | 85    | 9.0/10  | Terminal, speech, calendar, docs, teams             |
| data                | 20,548   | 42    | 7.5/10  | SQLCipher encryption, WAL, migrations               |
| integrations        | 8,946    | 25    | 8.0/10  | Cloud sync, native messaging, WebSocket             |
| ui                  | 6,207    | 21    | 8.5/10  | Tray, window mgmt, onboarding, hooks                |
| Frontend components | 22,600+  | 440+  | 7.2/10  | UnifiedAgenticChat core, 78 component dirs          |
| Frontend stores     | 28,669   | 55    | 8.3/10  | Zustand v5, 0 IPC bugs                              |
| Frontend services   | 5,584    | 15    | 8.5/10  | Auth, analytics, cache, Stripe                      |

## Security Architecture

- **Encryption**: AES-256-GCM with machine-derived keys (PBKDF2-HMAC-SHA256, 600K iterations)
- **Password Hashing**: Argon2id (19 MiB memory, 2 iterations)
- **OAuth**: PKCE for all flows (12+ providers), CSRF state parameters
- **Tool Safety**: ToolGuard with 4 tiers (Safe → RequiresExplicitApproval), rate limiting per tool
- **Secret Management**: SecretManager with encrypted SQLite storage, never plaintext
- **Prompt Injection**: 14 regex detection patterns (system override, ChatML, jailbreaks)
- **Computer Use Safety**: 11 dangerous command patterns, click location validation, window sensitivity
- **Tool Output Sanitization**: Regex redaction of OpenAI keys, Stripe keys, JWTs, Bearer tokens

## IPC Boundary

- **932 registered commands** in lib.rs generate_handler![]
- **325 unique invoke()** calls from frontend
- **0 unregistered calls** (all frontend calls resolve to registered commands)
- **0 snake_case parameter violations** in production code
- **~607 unwired commands** (66%) — backend capability far exceeds frontend exposure

## Key Architectural Patterns

1. **Degraded State**: Optional features use `::degraded()` or `::new_degraded()` constructors
2. **Event-Driven**: Rust → frontend via Tauri event channels (tool:event, agentic:loop-\*)
3. **3-Tier Embedding Fallback**: Ollama local → OpenAI cloud → None (graceful degradation)
4. **Safety-First Agent Loop**: MAX_LOOP_ITERATIONS=100, MAX_PENDING_TASKS=500, approval workflow
5. **Model ID Normalization**: `normalize_model_id()` at router entry, original preserved for API
6. **Capability Detection**: Ollama probing via /api/show for tool support before tool injection

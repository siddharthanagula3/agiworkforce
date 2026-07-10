# E2B Sandbox API — verified surface (2026-07-10)

Status: Current (WebFetch of e2b.dev/docs on 2026-07-10)
Owner: Platform lead
Purpose: ground the sandbox-parity wave and the generated-file byte pipeline in the real, current E2B API. Full doc index: `https://e2b.mintlify.site/llms.txt`.

## Packages

- **`@e2b/code-interpreter`** (JS) — the one we want for chat code execution: `Sandbox.create()` + `sbx.runCode(code)` with rich results. Quickstart installs `@e2b/code-interpreter` + dotenv.
- **`e2b`** (JS/Python) — base SDK: `Sandbox.create()` + `sandbox.commands.run('…')` → `result.stdout`.
- Auth: `E2B_API_KEY` env var.

## Lifecycle (JS, verified)

- Create: `Sandbox.create({ timeoutMs: 60_000 })` (ms). Plan ceilings: Base 1h, Pro 24h max run.
- Extend at runtime: `sandbox.setTimeout(newTimeoutMs)` (resets to the new value).
- Info: `sandbox.getInfo()` → id, template, metadata, start/end times.
- Kill: `sandbox.kill()`.
- **Persistence**: `await sandbox.pause()` snapshots filesystem AND memory (running processes, loaded variables); `keepMemory: false` for lighter snapshots. Resume by id: `await Sandbox.connect(sandboxId)` — store `sandboxId` in the DB and reconnect later. (Billing of paused sandboxes: not stated in docs — verify before relying on long-pause economics.)

## Filesystem (JS, verified)

- `await sandbox.files.read('/path')` — read.
- `await sandbox.files.write('/path', 'content')` — single write.
- `await sandbox.files.write([{path, data}, …])` — batch write.
- Also documented (method pages not yet fetched): upload, download, watch directory, file metadata.

## Code-interpreter execution results (critical for the file byte pipeline)

`const execution = await sbx.runCode(code)`:

- `execution.logs` — stdout/stderr logs.
- `execution.error` — `{ name, value, traceback }` on failure.
- `execution.results[]` — rich outputs; **charts/images arrive as `result.png` = base64-encoded PNG** (matplotlib etc.). Detection pattern: iterate results, check `result.png`, decode base64 → bytes. This is the E2B-side byte source the web generated-file pipeline must persist.

## Mapping to our repo

- Web already routes execution tools to E2B when `AGI_E2B_EXECUTION=1` (`apps/web/lib/e2b/execution-tools.ts`, tool-loop auto path, fail-closed without `E2B_API_KEY`).
- Sandbox parity work items: sandbox session reuse across a conversation (persist `sandboxId` per conversation via pause/connect instead of create-per-call), timeout policy tied to plan tier, surfacing `execution.results[].png` + generated files through the generated-file byte pipeline, and honest metering (E2B fallback is metered per the unit-economics doc).

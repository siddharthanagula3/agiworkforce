# Support-Facing Failure Playbook

> Runbook for diagnosing and resolving the most common AGI Workforce platform failures.
> Each section covers symptoms, a diagnostic checklist, resolution steps, and escalation path.

---

## 1. Approval Stuck / Hung

An agent tool call is waiting for user approval but no approval prompt appears on mobile, or the prompt appeared but the agent never resumes after approval.

### Symptoms

- Agent status shows "Waiting for approval" indefinitely on the desktop.
- Mobile companion does not display the approval prompt.
- Agent eventually times out with `tool_timeout` audit event.

### Diagnostic Checklist

1. **Check approval timeout settings** -- is `PENDING_APPROVAL_TTL_MS` (default 10 min) appropriate for the user's workflow? Inspect the signaling server constants.
2. **Check signaling connection** -- is the mobile client's WebSocket in `connected` state? Look for `peer_ready` in signaling server logs.
3. **Check pending approval queue** -- has the queue hit `MAX_PENDING_APPROVALS_PER_SESSION` (50)? If so, new approvals are silently dropped.
4. **Check mobile app state** -- is the companion screen active? Background apps may not process WebSocket messages on iOS.
5. **Check audit trail** -- look for a `tool_approved` or `tool_denied` event with matching resource. If present, the ack may have been lost.

### Resolution

| Step | Action                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Force-timeout the stuck approval from the desktop UI (triggers `tool_timeout`). The agent will proceed with its fallback behavior.                          |
| 2    | If mobile is disconnected, tell the user to re-open the companion app. Pending approvals will be delivered on reconnect (up to 50 per session, 10 min TTL). |
| 3    | If the signaling WebSocket is in `heartbeat_missed` or `disconnected` state, have the user tap "Reconnect" on mobile or re-pair via QR.                     |
| 4    | As a last resort, cancel the agent task and restart it.                                                                                                     |

### Escalation

If approvals are consistently stuck across multiple users, escalate to the signaling server team. Attach signaling server logs filtered by the pairing code.

---

## 2. Mobile-Desktop Pairing Failure

The QR code pairing flow does not complete. Desktop and mobile cannot establish a connection.

### Symptoms

- QR code displayed on mobile but scanning from desktop returns "Invalid pairing code."
- Pairing status stays at `pairing_initiated` and never reaches `pairing_confirmed`.
- Mobile shows "Unable to reach the pairing server. Check your connection."

### Diagnostic Checklist

1. **Check the pairing code** -- is it expired? Codes have a default TTL of 300 seconds (5 min). Call `GET /pair/status?code=<CODE>` to verify.
2. **Check the signaling server** -- is it reachable? Ping `GET <SIGNALING_HTTP_URL>/health`. A `503` from the API gateway means the signaling server is down.
3. **Check network** -- are both devices on the same network or at least able to reach the signaling server? Corporate firewalls may block WebSocket connections.
4. **Check rate limits** -- has the user hit the pairing rate limit (10/min)? Look for `429` responses in API gateway logs.
5. **Check for stale sessions** -- if the user paired before and the old session is still alive, the role slot may be occupied (`role_already_connected` error).

### Resolution

| Step | Action                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Have the user cancel the current pairing (`DELETE /pair/cancel?code=<CODE>`) and re-initiate.                                                               |
| 2    | Clear stale sessions: on mobile, go to Settings > Connection > "Forget Desktop" to wipe persisted pairing data.                                             |
| 3    | If the signaling server is down, restart the `signaling-server` service.                                                                                    |
| 4    | If behind a corporate firewall, ensure ports 4000 (HTTP) and 4000 (WS) are open, or configure `SIGNALING_HTTP_URL` to use an externally accessible address. |

### Escalation

If the signaling server is healthy but pairing consistently fails, escalate to the platform team. Provide the pairing code, user ID, and the output of `GET /pair/status`.

---

## 3. Stream Stops Mid-Response

An LLM streaming response cuts off partway through. The user sees a partial message with no completion indicator.

### Symptoms

- Chat message appears incomplete -- text stops mid-sentence or mid-code-block.
- No error toast is displayed.
- Desktop may show a stale "Generating..." spinner.

### Diagnostic Checklist

1. **Check the watchdog/timeout settings** -- the SSE stream watchdog has a configurable timeout. If a chunk is not received within the window, the stream is terminated. Check `timeout` settings in the desktop settings panel.
2. **Check provider health** -- call `GET /api/providers/health?provider=<ID>`. If the provider returns `available: false`, the stream may have died at the source.
3. **Check Rust SSE parser logs** -- the `sse_parser.rs` module logs parse errors. Look for `stream_error` or `unexpected_eof` in Rust logs.
4. **Check network stability** -- intermittent connectivity drops can sever the SSE connection without triggering a clean error.

### Resolution

| Step | Action                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| 1    | Increase the stream timeout in Settings > General > "Response Timeout" (default varies by provider).              |
| 2    | If the provider is unhealthy, switch to an alternative. Use the fallback recommendation from the health endpoint. |
| 3    | Retry the message -- click "Regenerate" on the partial message.                                                   |
| 4    | If a specific model consistently drops streams, switch models or providers.                                       |

### Escalation

If streams consistently stop mid-response across multiple providers, escalate to the Rust backend team. Attach the Rust log output filtered by the session/chat ID.

---

## 4. Auth 401 Loop

The user is repeatedly redirected to the login screen immediately after signing in. Each request returns 401 or 403.

### Symptoms

- Login succeeds (200 response) but the next API call returns 401 "No token provided" or 403 "Token expired."
- The app flickers between authenticated and unauthenticated states.
- Console/network tab shows rapid 401/403 responses.

### Diagnostic Checklist

1. **Check token expiry** -- decode the JWT (e.g., jwt.io) and verify the `exp` claim. If it is in the past, the token has expired.
2. **Check token storage** -- is the token being persisted correctly? On desktop, check local storage. On mobile, check secure storage (MMKV).
3. **Check refresh logic** -- is the client attempting to refresh the token before it expires? Look for refresh requests in the network log.
4. **Check clock skew** -- if the device clock is significantly out of sync, JWT validation will fail. Compare `Date.now()` on the client with the server's `timestamp` in any API response.
5. **Check account status** -- a 403 with code `ACCOUNT_NOT_ACTIVE` means the account is suspended or banned, not a token issue.

### Resolution

| Step | Action                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------ |
| 1    | Sign out completely (clear token cache) and sign back in.                                              |
| 2    | On desktop: open DevTools > Application > Local Storage, delete auth-related keys, and reload.         |
| 3    | On mobile: go to Settings > Account > "Sign Out", then sign in again.                                  |
| 4    | If clock skew is the issue, sync the device clock to NTP.                                              |
| 5    | If account is suspended (`ACCOUNT_NOT_ACTIVE`), direct the user to contact support for account review. |

### Escalation

If 401 loops persist after re-authentication, escalate to the API gateway team. Provide the user ID, JWT (redact the signature), and the exact error response body.

---

## 5. Offline Queue Not Syncing

Changes made while offline are not syncing to the server after connectivity is restored.

### Symptoms

- Sync status indicator shows pending items that never decrease.
- `GET /sync/status` returns `pending_count > 0` and `is_syncing: false`.
- No sync-related errors in the network log, or repeated 500 errors on `POST /sync/batch`.

### Diagnostic Checklist

1. **Check network** -- is the device actually online? Verify with a health check (`GET /api/health`).
2. **Check queue size** -- is the pending queue extremely large? The batch endpoint accepts max 100 items per request. Very large queues may take time.
3. **Check for conflicts** -- `POST /sync/batch` may return partial failures with `conflicts[]`. Unresolved conflicts block dependent items.
4. **Check for failed items** -- items with `retry_count` approaching 100 (schema max) may be permanently stuck. After 3 consecutive failures, items should be dead-lettered on the client side.
5. **Check rate limits** -- sync batch is limited to 30 requests/min. Aggressive sync attempts may be throttled.

### Resolution

| Step | Action                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Trigger a manual sync from Settings > Sync > "Sync Now."                                                                                |
| 2    | If conflicts exist, resolve them via the conflict resolution UI or call `POST /sync/resolve-conflict`.                                  |
| 3    | If the queue is corrupted, clear it from Settings > Sync > "Clear Pending Queue." The user will lose unsynced changes.                  |
| 4    | Check the `X-Device-ID` header is being sent -- missing device ID can cause the client to receive its own updates back, creating loops. |

### Escalation

If sync failures persist with 500 errors, escalate to the API gateway/database team. Provide the user ID, device ID, and the `failed_ids` from the batch response.

---

## 6. VS Code Extension Not Connecting

The VS Code extension cannot communicate with the desktop app. Chat participant, agent mode, and inline completions do not work.

### Symptoms

- VS Code status bar shows "AGI Workforce: Disconnected" (red).
- Commands like "AGI Workforce: Send to Chat" fail silently or show "Desktop app not running."
- Extension output channel shows connection errors.

### Diagnostic Checklist

1. **Check bridge status bar** -- the extension status bar item shows connection state. Click it for diagnostic info.
2. **Check desktop app is running** -- the extension communicates with the desktop app via a localhost bridge. The desktop app must be running.
3. **Check bridge port** -- the default bridge port is configured in the extension settings. Verify it matches the desktop app's bridge port (Settings > Integrations > VS Code Bridge).
4. **Check localhost connectivity** -- firewall or VPN software may block localhost connections on non-standard ports.
5. **Check extension version** -- ensure the extension version is compatible with the current desktop app version.

### Resolution

| Step | Action                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| 1    | Restart the desktop app to reinitialize the bridge server.                                                   |
| 2    | In VS Code, run the command "AGI Workforce: Reconnect" from the command palette.                             |
| 3    | If the port is in use, change the bridge port in both the desktop app and the extension settings.            |
| 4    | As a last resort, restart the VS Code extension host: Command Palette > "Developer: Restart Extension Host." |

### Escalation

If the bridge connection fails consistently, escalate to the integrations team. Provide the extension version, desktop app version, and the extension output channel logs.

---

## 7. Provider Health Down

One or more LLM providers are unreachable. Users cannot generate responses with their preferred model.

### Symptoms

- Chat sends fail with "Provider unavailable" or similar error.
- Provider health indicator in the UI shows red for one or more providers.
- `GET /api/providers/health` returns `available: false` for the affected provider.

### Diagnostic Checklist

1. **Check the health endpoint** -- `GET /api/providers/health?provider=<ID>` returns the current status and a fallback recommendation.
2. **Check if it is a platform-wide outage** -- look at the provider's official status page (e.g., status.openai.com, status.anthropic.com).
3. **Check API key validity** -- a 401 from the provider is still reported as "available" (the API is up). But if the key is revoked, calls will fail at a different layer.
4. **Check cache freshness** -- health results are cached for 60 seconds. Wait for cache expiry or restart the API gateway to force a fresh check.

### Resolution

| Step | Action                                                                                                                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Switch to the recommended fallback provider from the health endpoint response.                                                         |
| 2    | In the desktop app, change the model in Settings > Models, or use the quick model selector in the chat input area.                     |
| 3    | If using BYOK, verify the API key is still valid and has sufficient credits/quota.                                                     |
| 4    | If the provider is experiencing an outage, wait for recovery. The health check will automatically detect when the provider comes back. |

### Escalation

If the health endpoint itself is returning incorrect data (marking a healthy provider as down, or vice versa), escalate to the platform team. Provide the health endpoint response and the actual HTTP status from a direct ping to the provider.

---

## 8. Workflow Execution Failure

An automation workflow fails to execute or fails partway through.

### Symptoms

- Workflow status shows "Failed" with an error message.
- Individual steps within the workflow may show green (passed) up to the failure point.
- The execution sidecar terminal may show command output and error details.

### Diagnostic Checklist

1. **Check execution logs** -- open the Execution Sidecar for the workflow run. It shows stdout/stderr for each step.
2. **Check command validation** -- ToolGuard classifies commands as Safe, Unknown, or Dangerous. A "Dangerous" command will be blocked unless explicitly allowed in settings.
3. **Check tool permissions** -- if the workflow uses MCP tools, verify the tools are installed and the MCP server is running.
4. **Check input data** -- workflow steps may fail if input variables are undefined or have unexpected types.
5. **Check resource limits** -- long-running workflows may hit timeout limits or memory constraints.

### Resolution

| Step | Action                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open the workflow editor and inspect the failed step. Check its configuration and inputs.                                                       |
| 2    | If a command was blocked by ToolGuard, add it to the allowed list in Settings > Security > Tool Permissions, or adjust the risk classification. |
| 3    | Edit the failing step to fix the issue, then retry the workflow from the failed step (if the workflow supports partial retry).                  |
| 4    | If the workflow is timing out, increase the per-step timeout in the workflow configuration.                                                     |
| 5    | For MCP tool failures, check the MCP server status in Settings > MCP and restart the server if needed.                                          |

### Escalation

If workflow execution fails due to a platform bug (not a user configuration issue), escalate to the automation team. Provide the workflow ID, the execution log, and the exact step that failed.

---

## General Escalation Path

| Level | Who                                               | Response Time | When                                                          |
| ----- | ------------------------------------------------- | ------------- | ------------------------------------------------------------- |
| L1    | Support agent (this playbook)                     | Immediate     | First contact -- use diagnostics and resolutions above        |
| L2    | Platform engineering (on-call)                    | < 30 min      | Playbook exhausted, issue persists, or affects multiple users |
| L3    | Component owner (see zone ownership in CLAUDE.md) | < 2 hours     | Requires code change or deep investigation                    |
| P0    | All hands                                         | < 15 min      | Complete service outage or security incident                  |

### Escalation Template

When escalating, include:

```
**Issue**: [One-line summary]
**User ID**: [user_id from JWT]
**Surface**: [desktop / mobile / web / cli / vscode]
**Steps Taken**: [What you tried from this playbook]
**Evidence**: [Logs, error responses, screenshots]
**Impact**: [Single user / multiple users / all users]
```

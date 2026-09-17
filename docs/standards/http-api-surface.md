# HTTP API surface

Status: Current
Owner: Web surface maintainers
Last updated: 2026-09-17

The public HTTP contract: which endpoints exist, which credential each one takes,
and what a caller is guaranteed. The marketing page for the same surface is
`/api-docs` in `apps/web`; this file is the reference the implementation is held
to. `docs/standards/cli-command-surface.md` is the equivalent for the CLI.

Endpoint behaviour is owned by the route handlers under
`apps/web/app/api/llm/v1`. Where this file and a handler disagree, the handler
wins and this file is the bug.

## Shape

The gateway is OpenAI-compatible. Any OpenAI client works against it; only the
base URL and the credential change.

```
https://agiworkforce.com/api/llm/v1
```

## Credentials

Two are accepted, and they are not interchangeable.

**Session token.** `Authorization: Bearer <session token>`, the same token the
first-party apps hold. Every endpoint accepts it.

**API key.** `Authorization: Bearer sk_live_...`, issued under Settings, API
Keys. A key carries scopes, and a call missing the scope an endpoint requires
answers `403` with `insufficient_scope`. The scopes are defined in
`apps/web/lib/api-key-scopes.ts`:

| Scope             | Grants                                             |
| ----------------- | -------------------------------------------------- |
| `models:read`     | listing the models available to the account        |
| `inference:write` | chat completions and audio transcriptions          |
| `usage:read`      | plan and managed-usage status                      |

A key created with no scopes resolves to all three. That is the historical
default and it is deliberate, not an oversight: narrowing it would silently break
keys issued before scopes existed.

## Endpoints

| Method and path                            | Session token | API key scope     |
| ------------------------------------------ | ------------- | ----------------- |
| `GET /api/llm/v1/models`                   | yes           | `models:read`     |
| `POST /api/llm/v1/chat/completions`        | yes           | `inference:write` |
| `POST /api/llm/v1/audio/transcriptions`    | yes           | `inference:write` |
| `POST /api/llm/v1/route/preview`           | yes           | `inference:write` |
| `GET /api/llm/v1/credits/balance`          | yes           | `usage:read`      |
| `POST /api/llm/v1/embeddings`              | yes           | refused           |

Embeddings takes a session token only. An API key is refused there rather than
silently accepted with a narrower result.

### Long-running turns

A chat completion that pauses for an approval, for an input, or for a step on the
user's own device is resumed through its own endpoints rather than by resending
the request:

| Path                                                | Resumes                            |
| ---------------------------------------------------- | ---------------------------------- |
| `POST /api/llm/v1/chat/completions/approve`         | a turn waiting on an approval      |
| `POST /api/llm/v1/chat/completions/resume-input`    | a turn waiting on user input       |
| `POST /api/llm/v1/chat/completions/resume-device`   | a turn waiting on a device step    |

Durable runs are addressable in their own right under
`/api/llm/v1/chat/completions/runs`, which lists them, and
`/api/llm/v1/chat/completions/runs/{runId}`, which reads one and carries
`pause`, `resume` and `archive` beneath it.

## What every route guarantees

These are enforced by repository guards, not by convention, so they hold for
routes added after this file was written:

- **Errors are wrapped.** Every route goes through `withErrorHandler`; a caller
  never receives a raw exception or a stack. `pnpm check:raw-error-to-user`
  enforces the user-facing half.
- **Every route has tests, observability and states.** `pnpm check:route-tests`,
  `pnpm check:route-observability` and `pnpm check:route-states` fail a route
  that is missing any of the three.
- **Rate limits are configuration, not constants.** The current numbers and the
  headers they answer with are in `docs/standards/api-rate-limits.md`.
- **Model ids are never hardcoded at a call site.** A request names a model or
  `auto`; the catalogue resolves it. `AGENTS.md` section 4 owns this rule.

## Compatibility and change

Adding a field to a response, adding an endpoint, and accepting a new optional
request field are compatible changes and ship without ceremony. Removing an
endpoint, removing a response field, narrowing an accepted value, and tightening
a scope requirement are breaking, and go through
`docs/standards/deprecation-policy.md`.

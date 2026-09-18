# Signaling server

Pairing, signaling and the authenticated WebSocket relay for cross-device
sessions.

## Canonical endpoint

Two deploy targets exist (`fly.toml` and `railway.toml`). Exactly one hostname
is canonical, and it is the only one a client, a probe or a runbook may use:

| Purpose         | Value                                       |
| --------------- | ------------------------------------------- |
| Canonical HTTPS | `SIGNALING_CANONICAL_URL`                   |
| Canonical WSS   | `SIGNALING_WS_URL`                          |
| Fly origin      | `https://agiworkforce-signaling.fly.dev`    |
| Railway origin  | the Railway-assigned domain for the service |

The canonical name is a DNS record pointed at whichever target is serving.
A provider-assigned origin is a failover address, never an address to publish:
Fly runs with `auto_stop_machines = 'stop'` and `min_machines_running = 0`, so a
client pinned to the provider origin reaches a machine that may be asleep, and a
target swap silently strands it.

Set both origins in `SIGNALING_FAILOVER_URLS` so the readiness check proves each
target is serving, not only the one DNS currently resolves to.

## Readiness check

```
pnpm --filter @agiworkforce/signaling-server readiness
```

It polls `/health` on the canonical endpoint and on every failover origin,
retrying before it gives up, and exits:

- `0` every endpoint healthy,
- `1` at least one endpoint down (the report prints `degraded` when the others
  answered, `down` when none did),
- `2` no endpoint configured.

`/health` names the deployment serving the response (`deployment.id`,
`.version`, `.region`, `.target`), so a check that passes says which build it
passed against. `/metrics` carries the same identity as `signaling_build_info`.
Fields the host does not set are omitted rather than reported as `unknown`.

## Configuration backup

Set `SIGNALING_CONFIG_BACKUP_DIR` and each start writes a redacted snapshot of
every variable in `.env.example`, keeping the most recent snapshots and logging
what drifted since the previous start. Secret values are stored as a truncated
SHA-256 digest: enough to prove a restored value matches what was running, never
enough to reconstruct it. `GET /admin/config-backup` returns the same snapshot
for the running process.

Adding a variable to the service means adding it to `CONFIG_VARIABLES` in
`src/config-backup.ts`; `__tests__/config-backup.test.ts` fails when
`.env.example` documents one the backup would not capture.

## Restart behaviour

`closeAllConnections` releases each connection's bookkeeping as it closes the
socket. A shutdown that only closed sockets left the per-IP counters populated,
and the `close` event that would have cleared them never arrives for a process
that is going away, so the same client was refused when it reconnected.

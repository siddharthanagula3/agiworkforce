# Signaling server

Pairing, signaling and the authenticated WebSocket relay for cross-device
sessions.

## Pairing credentials

Creating a pairing returns only the initiator's role credential in
`pairTokens`. Send `initiator` as `desktop` or `mobile`; it defaults to
`desktop`. A supplied device must have the same role. For a pairing started
on Desktop, the phone obtains its credential through the authenticated claim
flow.

The relay's `qrData` contains only the code. Remote-control clients generate
their own `agiw3` QR secret locally, so the relay never receives the private
key material used for control messages.

Each successful registration atomically consumes its role credential and
returns a replacement in `registered.pairToken`. Reconnecting clients keep the
replacement in memory. Credentials bind the account, pairing creation time,
role, device identifier and a random generation. The database updates only that
role's credential, preserving the other role's concurrent changes.

An authenticated mobile claim can recover a disconnected role only when its
registered device identifier matches. Recovery rotates the credential and does
not reinstate revoked devices. Pairings without a registered device identifier
need a fresh pairing after losing their credential. Rotation rejects consumed
tokens; an unused current token remains a bearer credential and must be kept
private. Registration and recovery admission are process-local, so peer matching
requires one serving relay process.

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
A client pinned to a provider origin cannot follow a canonical target swap.

Set both origins in `SIGNALING_FAILOVER_URLS` so the readiness check proves each
target is serving, not only the one DNS currently resolves to.

## Serving topology

Peer matching, admission and connection limits belong to one process. Serve the
canonical endpoint from exactly one relay instance. Do not run multiple Railway
replicas or route the same canonical endpoint to Fly and Railway concurrently.
Failover requires disconnecting the old instance before switching the endpoint;
clients reconnect to the replacement. Database credential rotation remains
atomic, but it does not distribute live peer ownership.

The Fly configuration disables automatic stopping and requires one minimum
machine.
The deployment workflow checks machine inventory before deployment, creates no
HA spare (`--ha=false`), then requires exactly one started machine afterward.
Production deployment jobs share one concurrency group and finish without
cancellation by another run. A stopped spare also blocks deployment. The guard counts all non-destroyed
machines, so reconcile any unexpected helper or spare before retrying. It never
deletes a machine automatically. Manual scaling outside this workflow remains
unsupported and must preserve the same topology.

Deployments use a rolling restart of the sole machine, with `/ready` gating
traffic and `SIGTERM` followed by a 35-second host grace period. The process
allows at most 30 seconds for shutdown. A restart interrupts WebSocket peers;
clients reconnect with their latest role credential.

Configuration and CLI behavior were checked against [Fly's configuration
reference](https://docs.fly.io/reference/configuration/) and the [machine-list
implementation](https://github.com/superfly/flyctl/blob/master/internal/command/machine/list.go)
on September 30, 2026.

## Probes

The pairing store is `public.signaling_sessions`, declared by the canonical
`apps/web/db/neon/0354_signaling_sessions.sql` migration. Its creation and expiry
times are Unix milliseconds, and its metadata holds rotated peer credentials.
The relay connects as the privileged Neon owner with table access and `BYPASSRLS`;
the migration revokes access from `app_rls` and `PUBLIC` and forces row security
with no application policy. A user-scoped database role cannot serve the relay.
Inspect the migration ledger with `pnpm db:migrate -- status` against the intended
database before applying changes. An existing relation with incompatible columns,
constraints, or row policies is rejected without rewriting its data.

| Path      | Answers                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `/live`   | `200` while the process runs. It never consults the pairing store.                                           |
| `/ready`  | `200` when startup is complete and the pairing store is available; otherwise `503`.                          |
| `/health` | `200 healthy`, or `503 degraded` while the pairing store is down, with the state in `dependencies.database`. |

`/ready` refuses new routing during startup, shutdown, or a pairing-store
outage. Wrong credentials, an unreachable Neon or a missing
`signaling_sessions` table keep a new deployment from reporting ready. Existing
WebSocket pairings continue relaying from memory during a store outage. A
readiness failure must stop new routing without restarting the process or
disconnecting those peers.

`/health` also turns red during an outage. The deploy workflow's
post-deploy gates and the readiness check below read it, so a deployment whose
store is broken fails its gate instead of passing it. The store probe reads
`signaling_sessions` with a bounded deadline and is cached for 15 seconds, so
probes cannot fan out into database load; failures are reported by SQLSTATE or
as `timeout` or `unreachable`, never by the driver's message.

Each store statement runs on one checked-out connection inside a transaction
with a 4-second server statement timeout. The setting resets when the
transaction ends, including through Neon's transaction pooler. Checkout and
each driver query have separate 5-second bounds; these are not a total
operation deadline. Any transaction failure destroys its connection instead
of returning unfinished work to the pool. Writes are not retried after an
unknown commit outcome.

The isolated timeout check uses disposable PostgreSQL and PgBouncer on
loopback and the installed Neon driver. It requires Docker:

```
pnpm --filter @agiworkforce/signaling-server exec tsx __tests__/fixtures/db-timeout-check.ts
```

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

## Container builds

Build from the repository root:

```
docker build -f services/signaling-server/Dockerfile -t signaling-server .
```

The image installs the service's build and production dependencies separately
from the root lockfile, with the root overrides and patches. Both installs are
frozen and fail on a missing or mismatched lockfile. The Dockerfile-specific
context allowlist excludes other applications, local worktrees and secrets.
The runtime retains pnpm's relative dependency links and runs as a non-root
user. Its readiness check targets `/ready`.

Fly builds use the root working directory with the service's explicit config
and Dockerfile paths. The Railway workflow uploads the repository root and
copies the service's Docker build configuration to the archive root. Railway
service settings must retain the repository root as their build root.

## Restart behaviour

`closeAllConnections` releases each connection's bookkeeping as it closes the
socket. A shutdown that only closed sockets left the per-IP counters populated,
and the `close` event that would have cleared them never arrives for a process
that is going away, so the same client was refused when it reconnected.

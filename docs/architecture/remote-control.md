# Remote control

Status: Current
Owner: Desktop and mobile surface maintainers
Last updated: 2026-09-17

How a phone drives a coding session on the desktop the user is signed in on.
This is the map of the path and its trust boundaries. The rules that govern
changing any of it are in `AGENTS.md`; the surrounding architecture is in
`docs/architecture/overview.md`.

## What it is, and what it is not

Remote control attaches a **companion** (the mobile app) to a **host** (the
Electron desktop shell) so the companion can watch and steer a local coding
session that is already running on the host. It is not screen sharing, and it is
not a second place a session can start: every session runs on the host, under the
host's own capability grants, and the companion only sends control actions to it.

The relay never holds a session. It forwards opaque payloads between two paired
peers and enforces size and action limits on what passes.

## The pieces

| Piece                                                | Lives in                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| The command and state contract                       | `packages/contracts/local-runtime/src/remote-control.ts`     |
| Host: pairing, relay socket, session fan-out         | `apps/desktop/electron/remote/remoteControlHost.ts`          |
| Host: coding session control                         | `apps/desktop/electron/remote/codeRemoteController.ts`       |
| Host: envelope signing and verification              | `apps/desktop/electron/remote/dispatchEnvelope.ts`           |
| Companion: session list, attach, steer               | `apps/mobile/src/features/companion/remote-code`             |
| Pairing issuance                                     | `apps/web/app/api/pair/initiate/route.ts`                    |
| Relay                                                | `services/signaling-server`                                  |
| Web control panel                                    | `apps/web/features/desktop-host/components/RemoteControlSection.tsx` |

## The pairing handshake

1. The user asks to pair. `apps/web/app/api/pair/initiate/route.ts` authenticates
   the request, applies CSRF, rate limiting, the MFA policy gate and the IP
   allow-list gate, and asks the relay for a pairing code. The route records a
   workspace audit event, so a pairing attempt is visible after the fact whether
   or not it completed.
2. The relay answers with a code, an expiry, a websocket address, and one pair
   token per side. The default lifetime is five minutes and the route will not
   issue one longer than fifteen.
3. The host takes `remote_control_start` with that code, address, token and
   expiry. `remoteControlHost.ts` refuses a code that does not match its pattern,
   a relay address that is not a websocket URL, and an oversized token, before it
   opens anything.
4. Both sides derive a per-pairing dispatch key from the shared pairing secret.
   From then on every control message is a signed envelope.

## The envelope

`dispatchEnvelope.ts` is the integrity boundary, not a confidentiality one: the
payload travels signed, not encrypted. Each message carries a version, a
timestamp, a nonce and an HMAC over the canonicalised payload, and
`verifyDispatchEnvelope` names exactly why it refused one: `malformed`,
`unsigned`, `update_required`, `timestamp_expired`, `nonce_replay` or
`hmac_mismatch`. A peer on a different `DISPATCH_ENVELOPE_VERSION` is refused
rather than downgraded, and the MAC comparison is constant-time.

The relay can read a payload and cannot forge one: it never holds the dispatch
key, which both peers derive from the pairing code, a session salt and the
pairing secret.

## What the relay allows through

`services/signaling-server/src/control-payload.ts` holds the closed list.
`ALLOWED_CONTROL_ACTIONS` covers pairing, approvals, sync, dispatch, heartbeat,
cancellation and control receipts. `CODE_SESSION_CONTROL_ACTIONS` covers the
coding session verbs: list, attach, detach, steer, interrupt, respond to an
approval, and the snapshot and event streams back. An action outside both lists
is rejected at the relay, and payload size is capped separately for code session
traffic and for everything else.

Adding a verb is therefore a three-place change: the relay's list, the host's
controller, and the companion. A verb the relay does not know is dropped, which
is the intended direction of failure.

## Where authority actually lives

The companion holds none. Every privileged action a steered session performs is
dispatched by `apps/desktop/electron/runtime/dispatcher.ts` on the host, gated by
`apps/desktop/electron/runtime/permissionManager.ts` and contained by
`apps/desktop/electron/runtime/pathGuard.ts`, exactly as it would be for someone
sitting at the machine. A grant the host does not hold is not obtainable by
asking from the phone.

Approvals travel the other way for the same reason: the host raises an approval
request, the companion can answer it, and the answer is only ever a response to a
prompt the host decided to raise.

Every control action leaves a receipt through
`apps/desktop/src/services/controlReceipts.ts`, so what a paired phone did is
answerable afterwards.

## Failure and revocation

`RemoteControlState` is the one state a surface renders: `idle`, `waiting`,
`connected` or `error`, with the pairing code, its expiry, the peer's name and
the number of attached sessions. `remote_control_stop` returns the host to
`IDLE_REMOTE_CONTROL_STATE` and drops the socket. An expired pairing code cannot
be reused; the user starts a new pairing.

The relay is a dependency, not a trust anchor. When it is unreachable the host
reports `error` and local work continues unaffected, because nothing on the host
routes through it.

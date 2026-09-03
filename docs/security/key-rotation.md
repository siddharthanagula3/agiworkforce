# Encryption key rotation

Status: Current
Owner: Platform lead
Rotation cadence: every 12 months per key, plus immediately on suspected exposure
Last updated: 2026-08-17

How to rotate one of the AES-256-GCM keys that protect secrets at rest without
revoking every connector grant and re-enrolling every 2FA user.

## What is encrypted, and with which key

| Column                                             | Key env                                 | Key material  | Wire layout                   | `key_version` column       |
| -------------------------------------------------- | --------------------------------------- | ------------- | ----------------------------- | -------------------------- |
| `connector_oauth_grants.access_token_enc`          | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex chars  | `iv:ciphertext:tag` (hex)     | `token_key_version`        |
| `connector_oauth_grants.refresh_token_enc`         | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex chars  | `iv:ciphertext:tag` (hex)     | `token_key_version`        |
| `user_custom_connectors.auth_header_enc`           | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex chars  | `iv:ciphertext:tag` (hex)     | `auth_header_key_version`  |
| `github_installations.access_token_enc`            | `GITHUB_TOKEN_ENCRYPTION_KEY`           | 64 hex chars  | `iv:ciphertext:tag` (hex)     | `access_token_key_version` |
| `user_two_factor.totp_secret_enc`                  | `TOTP_ENCRYPTION_KEY`                   | ≥32 raw chars | base64(IV ‖ ciphertext ‖ tag) | `totp_secret_key_version`  |
| `connector_oauth_authorizations.code_verifier_enc` | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex chars  | `iv:ciphertext:tag` (hex)     | none — expires in minutes  |
| `device_authorization_codes.access_token`          | `DEVICE_TOKEN_ENCRYPTION_KEY`           | 64 hex chars  | base64(IV ‖ ciphertext ‖ tag) | none — expires in minutes  |

The last two rows hold minutes-lived values. Rotating their key strands
in-flight flows only: a user retries the connect or the device pairing and it
works. They get no bookkeeping column and the rotation sweep does not touch
them.

`TOTP_ENCRYPTION_KEY` is not hex. `lib/crypto/totp-envelope.ts` takes the first
32 characters of the env value as raw bytes through
`loadKeyRing(_, { encoding: 'utf8' })`. Do not "fix" it to hex without
re-encrypting first. It would orphan every enrolled secret.

The desktop token minted by `apps/web/app/api/auth/desktop-token/route.ts` is
also AES-256-GCM under `TOTP_ENCRYPTION_KEY`, but it is never stored: rotating
that key invalidates outstanding desktop tokens and the desktop app re-pairs.

## The key ring

`apps/web/lib/crypto/envelope.ts` reads three env vars per key domain:

| Var              | Meaning                                            |
| ---------------- | -------------------------------------------------- |
| `<NAME>`         | active key — the one new ciphertext is sealed with |
| `<NAME>_ID`      | id for that key, default `1`                       |
| `<NAME>_RETIRED` | `id:material` pairs, comma separated, newest first |

The default of `<NAME>_ID` and the default of every `*_key_version` column are
both `1`, so a deployment that has never set either is already consistent and
needs no backfill. Ids must match `^[A-Za-z0-9_-]{1,32}$` — the same shape the
column's CHECK constraint enforces — and no id may appear twice in one ring.

## Which readers understand the ring

| Column                                   | Reader                           | Ring-aware |
| ---------------------------------------- | -------------------------------- | ---------- |
| `connector_oauth_grants.*_token_enc`     | `lib/custom-connector-crypto.ts` | yes        |
| `user_custom_connectors.auth_header_enc` | `lib/custom-connector-crypto.ts` | yes        |
| `github_installations.access_token_enc`  | `lib/github-app.ts`              | yes        |
| `user_two_factor.totp_secret_enc`        | `lib/crypto/totp-envelope.ts`    | yes        |

A ring-aware reader decrypts against every key on the ring, so rows the sweep
has not reached yet are still readable with the retired key present. All four
columns rotate with **no downtime**. They keep WRITING the legacy `iv:ct:tag`
(or, for `totp_secret_enc`, `b64-iv-ct-tag`) layout so an instance of the
previous build can read what a new instance wrote during a rolling deploy;
`--format=versioned` is what moves them to the self-describing layout, and the
sweep refuses it for any column whose reader is not ring-aware
(`versionedReaderReady` in `scripts/reencrypt.mjs`).

`user_two_factor.totp_secret_enc` used to be the exception: the reader built one
WebCrypto key straight from `TOTP_ENCRYPTION_KEY` and never consulted
`_RETIRED`. `lib/crypto/totp-envelope.ts` now calls `sealEnvelope`/`openEnvelope`
from `lib/crypto/envelope.ts` directly, so it is ring-aware like the other three.
It could not simply be imported into `features/settings/services/user-preferences.ts`,
because that module is also bundled for the browser and `envelope.ts` needs
`node:crypto`; the seal/open calls live in the new server-only sibling instead,
and the four `/api/settings/2fa/*` routes call it directly.

## Rotation cadence

Scheduled rotation is the same procedure as an incident rotation — every row
below runs `## Rotating a key` end to end, with `scripts/reencrypt.mjs` as the
sweep. Nothing here rotates itself; the date is a calendar obligation on the
Owner named in the header.

| Key env                                 | Interval  | Next due   | Sweep target                            | Downtime                         |
| --------------------------------------- | --------- | ---------- | --------------------------------------- | -------------------------------- |
| `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 12 months | 2027-08-17 | `connector-grants`, `custom-connectors` | none, ring-aware reader          |
| `GITHUB_TOKEN_ENCRYPTION_KEY`           | 12 months | 2027-08-17 | `github-installations`                  | none, ring-aware reader          |
| `TOTP_ENCRYPTION_KEY`                   | 12 months | 2027-08-17 | `two-factor`                            | none, ring-aware reader          |
| `DEVICE_TOKEN_ENCRYPTION_KEY`           | 12 months | 2027-08-17 | none, no durable column                 | in-flight device pairings re-run |

Rotate ahead of the date, not on it, whenever a key could have been read by
someone who should not have it: a leaked deployment env, a departing operator
who held it, a restored backup handled outside the sealed record, or any
finding that names the key. An unscheduled rotation resets the next-due date.

`DEVICE_TOKEN_ENCRYPTION_KEY` has no sweep because it seals nothing durable —
rotating it is an env swap and a redeploy, and its 12-month entry exists so the
key does not outlive every other one by default.

## Accepted risk: no KMS, no escrow

Accepted by: Platform lead
Reviewed: 2026-08-17
Next review: with the 2027-08-17 rotation

All four keys live only as deployment environment variables. There is no KMS,
no hardware-backed custody, and no escrow copy outside the deployment provider.

What this costs, precisely: a database restore taken before a rotation is
readable only if the key bytes active at backup time still exist. The ring
(`<NAME>_RETIRED`) is what preserves them, and it is preserved by an operator
pasting a value into a deployment env — not by a system. Lose those bytes and
the restored `connector_oauth_grants`, `user_custom_connectors`,
`github_installations` and `user_two_factor` ciphertexts are unrecoverable.
Connector grants and GitHub installations can be re-authorized by the user;
enrolled TOTP secrets cannot, and every affected user must re-enroll 2FA.

This is accepted rather than solved because the mitigations already in place —
per-key ids, a ring that reads retired keys, a resumable sweep, and the sealed
record required by step 6 — bound the blast radius to "users re-authorize",
and because introducing a KMS moves custody to a vendor without removing the
operator step that actually fails. It is not accepted permanently: revisit it
at the next review, and revisit it immediately if a restore ever needs a key
the ring no longer carries.

The one obligation this acceptance creates is step 6's sealed record. A
rotation that drops `_RETIRED` without writing the old key somewhere durable
converts this accepted risk into a live one.

### The seam a KMS adapter plugs into

`lib/crypto/envelope.ts` no longer reads env bytes directly. `loadKeyRing`
delegates to a `KeyProvider`, and the only provider wired up today is
`envKeyProvider`, which reproduces the env-backed behavior above byte for
byte. Nothing about this accepted risk has changed yet: no deployment sets
`AGI_KEY_PROVIDER` to anything other than the default, so every key still
lives only as a deployment environment variable.

A KMS-backed provider does not require touching `envelope.ts`, `sealEnvelope`,
or `openEnvelope`. It needs three things. First, a way to identify a wrapped
data key per key id, in the same `<NAME>` / `<NAME>_ID` / `<NAME>_RETIRED`
shape the env provider already uses, holding whatever the vendor SDK expects
instead of raw bytes: an ARN, a key id, or a ciphertext blob. Second, an
unwrap call that turns one of those references into 32 raw bytes, passed to
`createKmsKeyProvider(unwrap)`. Third, because `unwrap` runs synchronously,
an integrator backed by an async vendor SDK call must resolve the data key
before constructing the provider, for example by fetching it once at process
start rather than on every `resolveKeyRing` call. Adopting one moves this
risk from "an operator holds the only copy of the key" to "the KMS vendor's
availability and access controls hold it," which is a real change of risk,
not its removal, and should get its own review before it is treated as
closing this acceptance.

The same interface carries a per-tenant derivation hook: `deriveTenantKey`
runs HKDF over a provider's ring key with the organization id as the HKDF
info parameter, so customer-managed keys per organization become a provider
concern rather than a schema change. It is off by default. `loadKeyRing` and
the providers above never call it on their own; a caller must ask for it
explicitly through `resolveTenantKeyRing`, and nothing in this codebase does
that yet.

## Rotating a key

1. **Generate the new key.**

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Apply the migration** if the target database predates it:

   ```bash
   psql "$NEON_DATABASE_URL" -f apps/web/db/neon/0104_key_version.sql
   ```

3. **No maintenance window is required for any of the four keys.** Every
   reader, `TOTP_ENCRYPTION_KEY` included, is ring-aware: deploy the ring
   (step 4) and traffic keeps working while the sweep runs. Skip to step 4.

4. **Set the ring** — in the deployed environment as well as locally for the
   sweep. The old key moves to `_RETIRED` under the id it currently carries in
   the database, and the new key becomes active under a fresh id. Deploy this
   BEFORE the sweep: a ring-aware reader needs the retired key to read the rows
   the sweep has not reached, and needs the active key to read the ones it has.

   ```bash
   export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY=<new hex>
   export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID=2
   export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED=1:<old hex>
   ```

5. **Dry run, then apply.** The dry run reports what it would touch and writes
   nothing:

   ```bash
   node scripts/reencrypt.mjs --target=connector-grants
   node scripts/reencrypt.mjs --target=connector-grants --apply
   ```

   Targets: `connector-grants`, `custom-connectors`, `github-installations`,
   `two-factor`, or `all`. Interrupting the script is safe — it resumes from
   the `*_key_version` column, so a re-run picks up exactly the rows it had not
   reached. A completed target selects nothing on a second run.

   `plaintext=N` in the summary counts rows deliberately left alone:
   pre-encryption TOTP secrets still stored as plain Base32, which
   `openTotpSecret` refuses to decrypt and which belong to no key. They are
   reported, never stamped.

6. **Drop `_RETIRED`** from the deployed env once the sweep reports `scanned=0`
   for every target, and redeploy. Keep the old key in a sealed record until the
   next rotation — it is the only way back if a restore predates the sweep.

7. **Verify** a live read of each rotated surface (connect a connector, load a
   GitHub PR review, complete a 2FA challenge) before ending the window.

## Rehearsing a rotation before the scheduled date

`apps/web/db/neon/0104_key_version.sql:12` records that no key on the cadence
table above has ever actually been rotated. `scripts/key-rotation-drill.mjs`
is the rehearsal: it creates a disposable Neon branch from the current head
(the same branch-creation path `docs/runbooks/database-backup-restore.md`
uses for its restore drill), runs `reencryptTarget` from
`scripts/reencrypt.mjs` against that branch with the ring you export exactly
as step 4 above describes, decrypts a random sample of the rewritten rows
under the new active key to confirm the round trip, and deletes the branch
when it finishes.

```bash
export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY=<new hex>
export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID=2
export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED=1:<old hex>
NEON_API_KEY=<api key, loaded from your shell's own env> \
NEON_PROJECT_ID=<project id> \
  node scripts/key-rotation-drill.mjs --target=connector-grants
```

Nothing it touches is production: the branch is disposable and deleted on
exit unless `--keep` is passed, and no target ever runs with `--apply` against
`NEON_DATABASE_URL`/`AGI_DATABASE_URL` itself. A nonzero exit or a `sample=`
count with any failures means the ring is wrong, not that production data is
at risk. Fix the ring and rerun before touching the real rotation in
`## Rotating a key`.

Run this rehearsal once ahead of each date in the cadence table, and record
the result:

| Date       | Target(s) | Sample result | Operator |
| ---------- | --------- | ------------- | -------- |
| _unfilled_ |           |               |          |

`BLOCKED_BY_HUMAN`: no rehearsal has been run. It needs the same
`NEON_API_KEY` / `NEON_PROJECT_ID` provisioning gap recorded in
`docs/runbooks/database-backup-restore.md`'s restore-drill log.

## Restoring a database backup

A restore returns rows encrypted under whatever key was active when the backup
was taken. Put that key in `<NAME>_RETIRED` under the id the restored rows
carry in their `*_key_version` column, then run the sweep to bring them
forward. Without the old key bytes those rows are unrecoverable — that is the
accepted risk recorded above, and step 6's sealed record is the only thing
standing between a restore and permanent loss.

## Moving a column to the versioned layout

Once a rotation has settled, `node scripts/reencrypt.mjs --target=<name>
--format=versioned --apply` rewrites the column as `v1.<keyId>.<iv>.<ct>.<tag>`,
which names its key in the bytes instead of relying on trial decryption. Only
run it after the ring-aware reader is fully deployed — no instance of an older
build may still be serving that column. The sweep enforces the ready/not-ready
half of that itself; the "fully deployed" half is yours to confirm.

## Not yet done

`lib/device-token-crypto.ts` and `app/api/auth/desktop-token/route.ts` are not
on this list: neither writes a durable column. Rotating `DEVICE_TOKEN_ENCRYPTION_KEY`
invalidates minutes-lived pairing codes, and the desktop token is handed to the
client and never stored.

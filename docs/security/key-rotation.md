# Encryption key rotation

Status: Current
Owner: Platform lead
Last updated: 2026-08-09

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

`TOTP_ENCRYPTION_KEY` is not hex. `getConfiguredTOTPKeyMaterial()` in
`apps/web/features/settings/services/user-preferences.ts` takes the first 32
characters of the env value as raw bytes; `loadKeyRing(_, { encoding: 'utf8' })`
reproduces exactly that. Do not "fix" it to hex without re-encrypting first —
it would orphan every enrolled secret.

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

| Column                                   | Reader                                           | Ring-aware |
| ---------------------------------------- | ------------------------------------------------ | ---------- |
| `connector_oauth_grants.*_token_enc`     | `lib/custom-connector-crypto.ts`                 | yes        |
| `user_custom_connectors.auth_header_enc` | `lib/custom-connector-crypto.ts`                 | yes        |
| `github_installations.access_token_enc`  | `lib/github-app.ts`                              | yes        |
| `user_two_factor.totp_secret_enc`        | `features/settings/services/user-preferences.ts` | **no**     |

A ring-aware reader decrypts against every key on the ring, so rows the sweep
has not reached yet are still readable with the retired key present. Those three
columns rotate with **no downtime**. They keep WRITING the legacy `iv:ct:tag`
layout so an instance of the previous build can read what a new instance wrote
during a rolling deploy; `--format=versioned` is what moves them to the
self-describing layout, and the sweep refuses it for any column whose reader is
not ring-aware (`versionedReaderReady` in `scripts/reencrypt.mjs`).

`user_two_factor.totp_secret_enc` is the exception: `decryptTOTPSecret` still
builds one WebCrypto key from `TOTP_ENCRYPTION_KEY`, so rotating that key needs
a maintenance window for 2FA verification — see step 3.

## Rotating a key

1. **Generate the new key.**

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Apply the migration** if the target database predates it:

   ```bash
   psql "$NEON_DATABASE_URL" -f apps/web/db/neon/0104_key_version.sql
   ```

3. **`TOTP_ENCRYPTION_KEY` only: take 2FA verification out of rotation** for
   the length of the sweep. Its reader is not ring-aware, so between the env
   swap and the last swept row a 2FA challenge cannot be verified. The other
   three targets need no window — deploy the ring (step 4) and traffic keeps
   working while the sweep runs.

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
   `decryptTOTPSecret` accepts and which belong to no key. They are reported,
   never stamped.

6. **Drop `_RETIRED`** from the deployed env once the sweep reports `scanned=0`
   for every target, and redeploy. Keep the old key in a sealed record until the
   next rotation — it is the only way back if a restore predates the sweep.

7. **Verify** a live read of each rotated surface (connect a connector, load a
   GitHub PR review, complete a 2FA challenge) before ending the window.

## Restoring a database backup

A restore returns rows encrypted under whatever key was active when the backup
was taken. Put that key in `<NAME>_RETIRED` under the id the restored rows
carry in their `*_key_version` column, then run the sweep to bring them
forward. Without the old key bytes those rows are unrecoverable — see the
KMS/escrow decision in `ExecutionPlan.md` §Founder, which is what makes that
key custody an operational, not a code, problem.

## Moving a column to the versioned layout

Once a rotation has settled, `node scripts/reencrypt.mjs --target=<name>
--format=versioned --apply` rewrites the column as `v1.<keyId>.<iv>.<ct>.<tag>`,
which names its key in the bytes instead of relying on trial decryption. Only
run it after the ring-aware reader is fully deployed — no instance of an older
build may still be serving that column. The sweep enforces the ready/not-ready
half of that itself; the "fully deployed" half is yours to confirm.

## Not yet done

`features/settings/services/user-preferences.ts` still carries its own inline
WebCrypto codec, so `user_two_factor.totp_secret_enc` is the one column that
needs the step-3 window and cannot take `--format=versioned`. Migrating that
reader is tracked separately — it runs in a module that is also imported by the
browser, so it cannot simply import `lib/crypto/envelope.ts`.

`lib/device-token-crypto.ts` and `app/api/auth/desktop-token/route.ts` are not
on this list: neither writes a durable column. Rotating `DEVICE_TOKEN_ENCRYPTION_KEY`
invalidates minutes-lived pairing codes, and the desktop token is handed to the
client and never stored.

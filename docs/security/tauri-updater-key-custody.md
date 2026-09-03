# Tauri updater signing key custody

Status: Current
Owner: Platform lead
Last updated: 2026-08-17

The minisign key pair behind `plugins.updater.pubkey` in
`apps/desktop/src-tauri/tauri.conf.json` is the highest-blast-radius credential
in this repository. Its public half is compiled into every shipped desktop
binary and is the only thing an installed client checks before applying an
update.

- Losing the private half permanently ends auto-update for every install that
  already pins the current public key. There is no server-side recovery: the
  pin lives in the installed binary.
- Leaking the private half lets anyone sign an archive that every install
  accepts and executes. Apple notarization does not help, the updater
  signature is a separate trust boundary from Developer ID.

## Custody inventory

Every location holding the private half must be listed here. A copy that is not
listed is an untracked liability; a listed location that no longer holds the key
must be removed in the same change that destroys it.

| Location                                               | Role               | Holder     |
| ------------------------------------------------------ | ------------------ | ---------- |
| `~/.tauri/agiworkforce.key` on the founder workstation | working copy       | founder    |
| GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`      | deployment copy    | CI         |
| _unfilled_, offline escrow                             | recovery authority | _unfilled_ |

The passphrase is a separate secret and must never be escrowed in the same
container as the key file.

`BLOCKED_BY_HUMAN`: the escrow row is unfilled. Both existing copies are
deployment copies on media the founder controls day to day, so a single lost
machine or a single deleted GitHub secret is still an unrecoverable event.
Until an offline escrow location and a named recovery holder exist, this
document describes the procedure but the key is not escrowed.

## Escrow

1. Export the key file and its passphrase separately. Never print either to a
   terminal that scrolls into a shared log.
2. Place the key file in the offline escrow location and the passphrase in a
   different one, each with a named holder recorded in the table above.
3. Run the restore drill below against the escrowed copy, not against the
   working copy.
4. Record the drill date and the reported key id in this document.

## Restore drill

The drill proves that an escrowed file plus its passphrase reconstruct exactly
the key whose public half is pinned in shipped binaries. It never prints key
material and never contacts the network.

```bash
TAURI_SIGNING_PRIVATE_KEY_PASSWORD='<escrowed passphrase>' \
  pnpm --filter @agiworkforce/desktop verify:updater-key /path/to/escrowed.key
```

The command reads `plugins.updater.pubkey` from the committed Tauri config,
decrypts the escrowed key with the supplied passphrase, and compares both the
key id and the Ed25519 public half. It exits non-zero when the file is the wrong
key, the passphrase is wrong, or the escrowed copy has been corrupted, the
three failure modes that make an escrow copy worthless at the moment it is
needed. It accepts either the raw minisign key file or the base64 form stored in
the GitHub secret.

Run the drill whenever the escrow copy is created, moved, re-encrypted, or
handed to a new holder, and at least once per release train.

## Compromise

Assume compromise if the key file or its passphrase reaches any location not in
the custody inventory, including a chat message, a screenshot, a CI log, or a
backup of the founder workstation restored elsewhere.

1. Treat every published updater artifact signed with that key as
   indistinguishable from an attacker's. Do not assume nothing was signed.
2. Rotate the GitHub Actions secrets first so CI cannot keep signing with the
   exposed key, then generate the replacement pair.
3. Follow Rotation below. There is no revocation list: installed clients keep
   trusting the exposed key until they are running a binary that pins the new
   one.

## Rotation

Tauri's updater pins exactly one public key. A rotated key therefore does not
reach installed clients through the updater it replaces, the release signed
with the new key fails signature verification against the old pinned key, and
those installs stop updating silently.

1. Generate the replacement pair and escrow it before it signs anything.
2. Ship one transition release **signed with the old key** whose bundled
   `tauri.conf.json` already pins the new public key. Installed clients accept
   this release because it is signed with the key they pin, and after installing
   it they pin the new key.
3. Only after the transition release has propagated may a release be signed with
   the new key.
4. Installs that never take the transition release are stranded and must
   reinstall from the download page. Count them before rotating, and publish a
   reinstall notice if the population is material.
5. If the old key is unavailable, lost, or withheld because it is compromised.
   step 2 is impossible and **every** install must reinstall. This is the
   scenario escrow exists to prevent.

Related: `apps/desktop/docs/macos-release-runbook.md` for the release-time trust
checks, `docs/security/key-rotation.md` for the application encryption keys,
which are a separate key domain.

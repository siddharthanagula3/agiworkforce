# Chrome Web Store Publish Runbook

Canonical release procedure for the existing AGI Browser Companion store item.

## Release boundary

- Release tags use `v-ext-<semver>` and must match both `apps/extension/package.json` and `apps/extension/manifest.json`.
- `.github/workflows/release-chrome-extension.yml` builds the exact tagged commit, verifies one ZIP, and transfers that artifact to the protected publish job. It never rebuilds after approval.
- Chrome Web Store API v2 publication uses a linked Google Cloud service account and GitHub workload-identity federation. Do not add a service-account JSON key, OAuth client secret, refresh token, or access token to repository secrets or environment files.
- The API updates an existing store item. The first item, Store listing, Privacy, visibility, and one-time service-account link remain Developer Dashboard operations.

References:

- <https://developer.chrome.com/docs/webstore/service-accounts>
- <https://developer.chrome.com/docs/webstore/api/reference/rest>

## Release blockers and required evidence

A candidate is not release-ready until every item below has current evidence for
the exact tagged ZIP. Source review, unit tests, or an unpacked development build
do not substitute for these checks.

- **Stable identity:** `CHROME_EXTENSION_PUBLIC_KEY` must be the Store item's
  single-line base64 DER public key. The packaged manifest-derived extension ID,
  `CWS_EXTENSION_ID`, the public listing item, and Clerk's allowed
  `chrome-extension://<id>` origin must all match. Without this value the exact
  Store ZIP and its production authentication origin cannot be proven.
- **Production authentication and subscription:** use a clean Chrome profile to
  verify signed-out, successful Clerk sign-in, entitled Managed Cloud chat,
  exhausted/inactive-plan recovery, Manage usage/upgrade navigation, sign-out,
  and return sign-in. Development bearer-token fallback is not release evidence.
- **Conversation persistence truth:** with the same live account on Chrome, Web,
  Mobile Cloud, Tauri Cloud, and Electron Cloud, verify that an all-Managed-Cloud
  conversation mirrors append-only, survives reload, and propagates deletion.
  Verify separately that any Local, BYOK, or unknown-provenance turn permanently
  prevents cloud persistence while `chrome.storage.local` remains authoritative.
- **Browser-control boundary:** on an approved ordinary HTTPS site, verify the
  default Ask-before-acting gate, Allow, Skip, 30-second expiry, Stop, tab close,
  navigation, debugger detach, recording/replay origin binding, and typed-value
  capture acknowledgement. Repeat native-host pairing plus missing/disconnected
  host recovery; Chrome-internal pages and the Web Store must fail closed.
- **Responsive and accessible UI:** check side-panel widths 320, 390, and 500 px
  and Options at narrow/tablet/desktop widths in light and dark modes, 200% zoom,
  reduced motion, keyboard-only navigation, visible focus, menu/dialog focus
  return, screen-reader names/status announcements, long content, and empty,
  loading, error, disabled, and success states. Confirm Chrome's user-rebound
  command values—not only manifest defaults—are shown in Options.
- **Permissions and privacy:** manually compare every packaged permission, host,
  approved-site capture disclosure, debugger use, native messaging boundary,
  Managed Cloud endpoint, local storage record, and deletion behavior with
  `manifest.json`, `THREAT_MODEL.md`, the Store Privacy tab, and listing copy.

Record the Chrome version, OS, account/plan state, tagged commit, ZIP SHA-256,
Store item ID, and pass/fail evidence. A failure must be fixed and the entire
affected row repeated on the newly packaged artifact.

## One-time publisher setup

1. Enable the Chrome Web Store API v2 in a Google Cloud project.
2. Create a dedicated service account without project roles and add its email to the Chrome Web Store Developer Dashboard account. Google currently permits one linked service account per publisher.
3. Create a GitHub workload-identity pool/provider restricted to `siddharthanagula3/agiworkforce` and grant that principal `roles/iam.workloadIdentityUser` on the dedicated service account. Do not grant the service account unrelated Google Cloud permissions.
4. Create the protected GitHub environment `chrome-web-store`, require an approving reviewer, restrict deployments to `v-ext-*` tags, and configure these environment variables:
   - `GCP_WORKLOAD_IDENTITY_PROVIDER`
   - `CWS_SERVICE_ACCOUNT`
   - `CWS_PUBLISHER_ID`
   - `CWS_EXTENSION_ID`
5. Configure the public production build values as GitHub repository variables: `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API`, `CLERK_SYNC_HOST`, and `CHROME_EXTENSION_PUBLIC_KEY`.
6. In the Developer Dashboard, complete the Store listing and Privacy tabs, verify the stable item ID and public key, enable two-step verification on the owner account, and manually publish any visibility change once before returning publication ownership to CI.

## Release

1. Update both source versions and any user-facing listing copy/assets affected by the release.
2. Run `pnpm --filter @agiworkforce/extension test:e2e` against the
   production-configured unpacked build, then complete the release evidence
   matrix above against that candidate.
3. Commit the version and release notes, then create and push `v-ext-<version>`.
4. Approve the `chrome-web-store` environment only after inspecting the uploaded artifact name and SHA-256 from the package job.

For an artifact-only rehearsal, dispatch the workflow with publication disabled:

```bash
gh workflow run release-chrome-extension.yml \
  -f tag=v-ext-<version> \
  -f publish=false
```

The publish job requests only the `chromewebstore` OAuth scope, refuses a taken-down/warned item or a different active submission, uploads the verified ZIP, waits at most 60 seconds for asynchronous processing, and submits with `skipReview=false` and `blockOnWarnings=true`.

## Verify after submission

1. Confirm the workflow reports the expected extension version and a submitted/review state without warnings.
2. Confirm the Developer Dashboard shows the same source version and review status.
3. After approval, install from the public listing into a clean Chrome profile
   and repeat the production authentication, persistence, browser-control, and
   responsive/accessibility checks above. Do not reuse unpacked-build evidence.
4. Confirm the published CRX item ID matches `CWS_EXTENSION_ID` and the Clerk production instance allows `chrome-extension://<that-id>`.

## Recovery and rollback

- Rerunning the same tag is idempotent when that version is already submitted or published.
- If another version is under review, resolve or cancel it in the Developer Dashboard before retrying; the script will not overwrite it.
- If upload succeeds but submission fails, inspect the draft in the dashboard and rerun only after confirming its version and warnings.
- Chrome Web Store releases are forward-fixed with a higher manifest version. For a critical incident, take the item down in the Developer Dashboard, preserve the item identity, remediate, and submit a new version.

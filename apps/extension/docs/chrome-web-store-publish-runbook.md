# Chrome Web Store Publish Runbook

Canonical release procedure for the existing agiworkforce store item.

## Release boundary

- Release tags use `v-ext-<semver>` and must match both `apps/extension/package.json` and `apps/extension/manifest.json`.
- `.github/workflows/release-chrome-extension.yml` builds the exact tagged commit, verifies one ZIP, and transfers that artifact to the protected publish job. It never rebuilds after approval.
- Chrome Web Store API v2 publication uses a linked Google Cloud service account and GitHub workload-identity federation. Do not add a service-account JSON key, OAuth client secret, refresh token, or access token to repository secrets or environment files.
- The API updates an existing store item. The first item, Store listing, Privacy, visibility, and one-time service-account link remain Developer Dashboard operations.

References:

- <https://developer.chrome.com/docs/webstore/service-accounts>
- <https://developer.chrome.com/docs/webstore/api/reference/rest>

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
   matrix in `audit/blockers/35-chrome-web-store-release-blockers.md` against
   that candidate.
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
   responsive/accessibility checks in
   `audit/blockers/35-chrome-web-store-release-blockers.md`. Do not reuse unpacked-build evidence.
4. Confirm the published CRX item ID matches `CWS_EXTENSION_ID` and the Clerk production instance allows `chrome-extension://<that-id>`.
5. Add `chrome-extension://<that-id>` to `PRODUCTION_PARENT_ORIGINS` in `infrastructure/sandbox/index.html` and to `frame-ancestors` in `infrastructure/sandbox/vercel.json`, then redeploy the sandbox. Until both name the item's exact origin, the artifact renderer refuses the side panel and the artifact panel shows source instead of a live preview.

## Recovery and rollback

- Rerunning the same tag is idempotent when that version is already submitted or published.
- If another version is under review, resolve or cancel it in the Developer Dashboard before retrying; the script will not overwrite it.
- If upload succeeds but submission fails, inspect the draft in the dashboard and rerun only after confirming its version and warnings.
- Chrome Web Store releases are forward-fixed with a higher manifest version. For a critical incident, take the item down in the Developer Dashboard, preserve the item identity, remediate, and submit a new version.

## Microsoft Edge Add-ons

The same verified `extension.zip` is published to Edge Add-ons; there is no
Edge-specific build. Edge reads the manifest as Chrome does, and the side panel,
debugger, tab groups and native messaging all run unchanged.

One-time setup, by the owner in Partner Center:

1. Create the product once by uploading `extension.zip` under Microsoft Edge >
   Overview > Create new extension, and copy the listing and privacy answers
   from `docs/chrome-web-store-listing.md`. The REST API cannot create a product.
2. Under Microsoft Edge > Publish API, enable the API-key experience and create
   API credentials. Store the Client ID as `EDGE_CLIENT_ID`, the API key as
   `EDGE_API_KEY` (it expires; renew it there) and the product ID from the
   extension overview page as `EDGE_PRODUCT_ID`.

Each release, after the Chrome Web Store submission:

```sh
EDGE_API_KEY=… EDGE_CLIENT_ID=… EDGE_PRODUCT_ID=… \
  node apps/extension/scripts/publish-edge-addons.mjs apps/extension/extension.zip
```

The script uploads the package to the draft submission, waits for the upload
operation, submits the draft for certification with the notes in
`EDGE_CERTIFICATION_NOTES` (default: the version), and waits for the publish
operation (v1.1 Update REST API, learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api,
read 2026-10-19). A refusal such as `InProgressSubmission` stops the run with
the store's reason. The Edge extension ID differs from the Chrome one, so add
`chrome-extension://<edge id>` to the Clerk allowed origins and to the native
host manifest's `allowed_origins` before the first Edge release.

## Other Chromium browsers

Brave, Vivaldi, Arc and Comet install from the Chrome Web Store listing;
Opera does too once the user adds Opera's "Install Chrome Extensions" add-on.
Where a browser has no `chrome.sidePanel` (reported for Opera and Arc), the toolbar
button opens the same panel as a window beside the browser window, and every
page tool works on the last focused browser window. `scripts/install-native-host.sh`
registers the desktop host for each of these browsers that is installed.

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
2. Run `pnpm --filter @agiworkforce/extension test:e2e` against the production-configured unpacked build and manually review every requested permission plus the native-host boundary.
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
3. After approval, install from the public listing into a clean Chrome profile and verify sign-in, Managed Cloud chat, side panel, approved-site capture, permission prompts, and native-host failure/recovery states.
4. Confirm the published CRX item ID matches `CWS_EXTENSION_ID` and the Clerk production instance allows `chrome-extension://<that-id>`.

## Recovery and rollback

- Rerunning the same tag is idempotent when that version is already submitted or published.
- If another version is under review, resolve or cancel it in the Developer Dashboard before retrying; the script will not overwrite it.
- If upload succeeds but submission fails, inspect the draft in the dashboard and rerun only after confirming its version and warnings.
- Chrome Web Store releases are forward-fixed with a higher manifest version. For a critical incident, take the item down in the Developer Dashboard, preserve the item identity, remediate, and submit a new version.

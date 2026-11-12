# Chrome Web Store Publish Runbook

Status: Current
Owner: Platform lead
Last updated: 2026-11-12

Canonical procedure for creating the store item once and releasing every
version after it.

## Release boundary

- Release tags use `v-ext-<semver>` and must match both `apps/extension/package.json` and `apps/extension/manifest.json`.
- `.github/workflows/release-chrome-extension.yml` builds the exact tagged commit, verifies one ZIP, and transfers that artifact to the protected publish job. It never rebuilds after approval.
- Chrome Web Store API v2 publication uses a linked Google Cloud service account and GitHub workload-identity federation. Do not add a service-account JSON key, OAuth client secret, refresh token, or access token to repository secrets or environment files.
- The API cannot create an item: the first version is uploaded in the Developer Dashboard, and the Store listing and Privacy tabs are completed there before the API can publish. Visibility and the one-time service-account link are Dashboard operations too.
- Every upload must carry a higher version than the one before it, including the first-draft upload below.

References (read 2026-11-11):

- <https://developer.chrome.com/docs/webstore/using-api>
- <https://developer.chrome.com/docs/webstore/service-accounts>
- <https://developer.chrome.com/docs/webstore/api/reference/rest>
- <https://developer.chrome.com/docs/extensions/reference/manifest/key>
- <https://developer.chrome.com/docs/webstore/publish>
- <https://developer.chrome.com/docs/webstore/prepare>
- <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments>
- <https://docs.github.com/en/actions/reference/security/oidc>
- <https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines>
- <https://clerk.com/docs/guides/sessions/sync-host>

## First submission

The release package refuses to build without `CHROME_EXTENSION_PUBLIC_KEY`, and
that key exists only once a store item exists. The item is therefore created
from a first-draft ZIP that passes every release check except that it carries no
manifest `key`; the store assigns the item ID when that ZIP is uploaded, and the
ID never changes after. The draft is only for creating the item: it is never
submitted for review, and the release workflow never builds or accepts one
(`verify-package.mjs` refuses a keyless package, and a `*-first-draft.zip`, in
release mode).

Who does what: **Owner** steps need the owner's Google, Clerk or GitHub account
or a decision that is his; **Lead** steps can be run from this repository with
`gh` by someone with admin rights on `siddharthanagula3/agiworkforce`.

1. **Owner. Register the publisher.** Open <https://chrome.google.com/webstore/devconsole>
   with the Google account that will own the item, accept the developer agreement
   and pay the one-time registration fee the Dashboard shows. On the Account
   tab set the publisher display name (shown as "Offered by"), set and verify
   the contact email `contact@agiworkforce.com`, and turn on 2-Step
   Verification for the Google account. The account's developer email cannot be
   changed later.
2. **Lead. Build the first-draft ZIP** at the current source version, which must
   stay lower than the first release version (step 11). Export the public
   production sign-in values; `CHROME_EXTENSION_PUBLIC_KEY` and
   `CWS_EXTENSION_ID` must be unset, and the scripts refuse a draft when either
   is present:

   ```bash
   export CLERK_PUBLISHABLE_KEY='pk_live_...'        # Clerk Dashboard > API keys, production
   export CLERK_FRONTEND_API='https://clerk.agiworkforce.com'   # Clerk Dashboard > Domains, Frontend API
   export CLERK_SYNC_HOST='https://clerk.agiworkforce.com'      # the same Frontend API domain, per Clerk's sync-host guide
   unset CHROME_EXTENSION_PUBLIC_KEY CWS_EXTENSION_ID
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/extension build
   node apps/extension/scripts/prepare-package.mjs --first-draft
   (cd apps/extension/dist && zip -r ../extension-first-draft.zip . -x '*.map')
   node apps/extension/scripts/verify-package.mjs apps/extension/extension-first-draft.zip --first-draft
   ```

   The publishable key must decode to `CLERK_FRONTEND_API`; the build refuses a
   mismatch or a `pk_test_` key.

3. **Owner. Create the item.** In the Dashboard choose **Add new item**, **Choose
   file**, select `extension-first-draft.zip`, **Upload**. Do not press **Submit
   for review**.
4. **Owner. Copy three values** and send them to the lead:
   - Item ID: the 32 letters on the item's **Package** tab (also in the item URL).
   - Public key: **Package** tab, **View public key**. Copy the text between
     `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` and join it into
     one line with no spaces or line breaks.
   - Publisher ID: **Publisher > Settings**.

   **Lead** confirms the key and the ID belong together before storing them:

   ```bash
   node --input-type=module -e "import { chromeExtensionIdFromPublicKey } from './apps/extension/scripts/manifest-config.mjs'; console.log(chromeExtensionIdFromPublicKey(process.argv[1]))" '<single-line public key>'
   ```

   The printed ID must equal the Item ID. Once the publish service account is
   linked (step 6), the API's `fetchStatus` also returns the item's `publicKey`.

5. **Lead. Store the public build values** as repository variables. They are
   public; never put a Clerk secret key here.

   ```bash
   gh variable set CWS_EXTENSION_ID --body '<item id>'
   gh variable set CHROME_EXTENSION_PUBLIC_KEY --body '<single-line public key>'
   gh variable set CLERK_PUBLISHABLE_KEY --body 'pk_live_...'
   gh variable set CLERK_FRONTEND_API --body 'https://clerk.agiworkforce.com'
   gh variable set CLERK_SYNC_HOST --body 'https://clerk.agiworkforce.com'
   ```

   `CWS_EXTENSION_ID` is one repository value shared with the artifact-sandbox
   deployment. The package and publish jobs refuse a key whose derived ID is not
   `CWS_EXTENSION_ID`.

6. **Owner. Protect `chrome-web-store`, then link the publish identity.**
   Protection comes first, before any identity exists: run "First release"
   steps 2 and 3 of `docs/runbooks/cli-release.md`, which create the
   environment with the owner as required reviewer, administrator bypass off
   and a deployment policy of `v-ext-*` tags only, add the tag ruleset, and
   end with `node scripts/release/check-release-environments.mjs` printing
   `OK`. A workflow that names a missing environment creates it with no
   protection, so a tag pushed before this would publish unapproved, and the
   tag-only policy keeps a `workflow_dispatch` from a branch out.

   Then, in a Google Cloud project, enable the Chrome Web Store API, create a
   dedicated service account with no project roles, and add its email in the
   Dashboard's **Account** section (one service account per publisher). Create
   a workload-identity pool and a GitHub provider whose condition admits only
   this repository's `chrome-web-store` environment on a tag, by numeric ids
   (repository 1087257707, owner 198491067, read with `gh api` on 2026-11-11),
   which a renamed or recreated repository cannot reuse; then grant only that
   environment `roles/iam.workloadIdentityUser` on the service account:

   ```bash
   gcloud iam workload-identity-pools create github --location=global
   gcloud iam workload-identity-pools providers create-oidc agiworkforce \
     --location=global --workload-identity-pool=github \
     --issuer-uri="https://token.actions.githubusercontent.com/" \
     --attribute-mapping="google.subject=assertion.sub,attribute.environment=assertion.environment" \
     --attribute-condition="assertion.repository_id == '1087257707' && assertion.repository_owner_id == '198491067' && assertion.environment == 'chrome-web-store' && assertion.ref_type == 'tag'"
   gcloud iam service-accounts add-iam-policy-binding '<service account email>' \
     --role=roles/iam.workloadIdentityUser \
     --member="principalSet://iam.googleapis.com/projects/<project number>/locations/global/workloadIdentityPools/github/attribute.environment/chrome-web-store"
   ```

   The environment's `v-ext-*`-only policy narrows the tag to release tags.
   For a provider that already exists, apply the same condition with
   `gcloud iam workload-identity-pools providers update-oidc` and the same
   `--attribute-condition`.

7. **Lead. Point the protected environment at the identity.** The probe
   confirms `chrome-web-store` is still protected before anything is stored
   in it.

   ```bash
   node scripts/release/check-release-environments.mjs
   gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --env chrome-web-store --body 'projects/<number>/locations/global/workloadIdentityPools/github/providers/agiworkforce'
   gh variable set CWS_SERVICE_ACCOUNT --env chrome-web-store --body '<service account email>'
   gh variable set CWS_PUBLISHER_ID --env chrome-web-store --body '<publisher id>'
   ```

8. **Owner. Allow the extension in Clerk production.** Clerk's sync-host guide
   adds the origin with the production secret key:

   ```bash
   curl -X PATCH https://api.clerk.com/v1/instance \
     -H "Authorization: Bearer $CLERK_SECRET_KEY" \
     -H 'Content-type: application/json' \
     -d '{"allowed_origins": ["chrome-extension://<item id>"]}'
   ```

   The guide does not say whether the list is appended or replaced, so send
   every origin the production instance must keep in the same list. Without
   this, store installs cannot sign in.

   Then add the same origin to `CLERK_AUTHORIZED_PARTIES` on the production
   web deployment (Vercel project settings, Environment Variables,
   Production), keeping the web origin already in it, for example
   `https://agiworkforce.com,chrome-extension://<item id>`. The web app checks
   every bearer token's `azp` against that comma-separated list
   (`authorizedParties()` in `packages/platform/identity/src/adapters/clerk.ts`;
   when the variable is empty it admits only the deployment's own origin).
   Without the extension origin, sign-in in the extension appears to succeed,
   then every API call answers 401 and the panel falls back to sign-in. A
   Vercel variable reaches only deployments made after it changes, so set it
   before the deploy in step 12. Check: `vercel env ls production` lists
   `CLERK_AUTHORIZED_PARTIES`, and after that deploy the extension signed in
   with the production build (Release step 2) shows the account and plan
   rather than the sign-in prompt.

9. **Owner. Admit the extension in the artifact renderer.** `deploy-production.yml`
   job `deploy-sandbox` passes `CWS_EXTENSION_ID` to
   `infrastructure/sandbox/configure.mjs`, which writes `chrome-extension://<item id>`
   into both the renderer's parent list and its `frame-ancestors` header. That
   job runs only when `scripts/production-deploy-scope.mjs --shipped sandbox`
   finds a sandbox change since the surface last shipped, and production deploys
   are the owner's call. Until one ships, artifacts in the side panel show
   source instead of a live preview. Check afterwards with
   `curl -sI https://sandbox.agiworkforce.com | grep -i frame-ancestors`.
10. **Owner. Complete the listing in the Dashboard**, copying from
    `apps/extension/docs/chrome-web-store-listing.md`: Store listing tab
    (description, category, language, URLs, store icon, screenshots), Privacy
    tab (single purpose, one justification per permission and host as the
    packaged manifest lists them, remote code "No" with the remote-code text
    the listing document gives, the data-use ticks and the three
    certifications, privacy policy URL), Distribution (free, regions,
    visibility), and Test instructions (the listing document's text plus the
    username and password of a production reviewer account the owner creates
    for this, entered only in the Dashboard).
11. **Lead. Raise the version** in `apps/extension/package.json` and
    `apps/extension/manifest.json` to the first store version, which must be
    higher than the draft's. Run the checks under "Release" step 2 and commit.
12. **Owner. Deploy the production web app first, then the lead pushes the
    tag.** The extension built from `main` calls web routes and request fields
    that only the current web app has, so production must serve the commit
    from step 11, or a later one, before a reviewer can open the item. If it
    does not, a store reviewer finds browser tools failing in any chat saved
    to the account (the older server drops the caller-tool fields, and the
    turn ends with a caller-action checkpoint error) and **Add a link** always
    failing (`/api/page-context/read` does not exist there). That deploy
    needs the pending migrations applied first: production is recorded
    through 0391 (`scripts/config/production-migrations-applied.json`), and
    `apps/web/db/neon` holds 0392 to 0418, including
    `0397_caller_tool_checkpoints.sql`, which the browser-tool checkpoint
    writes need. The production workflow runs `pnpm db:migrate -- verify` and
    refuses to deploy over a pending migration. In order, at a time the owner
    chooses, because a production apply cannot be undone:
    1. `pnpm db:migrate -- status --target production` lists what is
       pending.
    2. Apply to staging and check it, then to production with
       `pnpm db:migrate -- apply --target production --confirm-production`
       (`docs/development/ci-and-deploys.md`, "Schema prerequisites" and
       "Staging tier"; `docs/runbooks/release-rollback.md` for recovery).
    3. Deploy web production through `.github/workflows/deploy-production.yml`
       from a green `main` commit at or after the step 11 commit.
    4. Check: `pnpm db:migrate -- status --target production` lists 0418 as
       applied, and
       `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://agiworkforce.com/api/page-context/read`
       prints anything but `404`.

    **Owner decides when; lead runs.** Push the tag
    (`git tag v-ext-<version> && scripts/dev/heavy-job.sh git push origin v-ext-<version>`).
    The package job runs, then the publish job waits for the `chrome-web-store`
    approval; rejecting that approval stops the run with nothing uploaded, and
    `gh workflow run release-chrome-extension.yml -f tag=v-ext-<version> -f publish=false`
    repackages the same tag without the publish job. A manual submission has
    to run on the tag itself, because the environment admits only tags:
    `gh workflow run release-chrome-extension.yml --ref v-ext-<version> -f tag=v-ext-<version> -f publish=true`. Approve only after comparing
    the artifact name and SHA-256 in the package job. The publish job uploads the release ZIP
    to the draft item and submits it with `DEFAULT_PUBLISH`, so it goes live
    when approved. To hold the launch, choose **Defer publish** in the item's
    menu after submission; an approved staged item must be published within 30
    days or it returns to draft.

13. **Lead, after approval.** Run "Verify after submission", then record the
    published permission set at the released tag:
    `node scripts/release/check-chrome-permissions.mjs --write-baseline`. That
    replaces `scripts/release/chrome-permissions-baseline.json` with the
    published manifest's lists and clears its `approved` entries, so the next
    release is diffed against what users actually granted.
14. **Lead, then owner, after approval: make the extension's page true and
    point the listing at it.** Until the item is live, `/chrome-extension`
    says the extension is coming soon and offers a notify form, so the
    listing's Homepage URL stays the site root. Once the item is public:
    1. **Lead.** In `apps/web/lib/surface-status.ts` set `SURFACE_STATUS.chrome`
       to `AVAILABLE_NOW_LABEL`, record the item's public listing URL
       (`https://chromewebstore.google.com/detail/<item id>`) once there, and
       make the hero and closing calls to action on
       `apps/web/app/chrome-extension/page.tsx` link to it instead of
       `NOTIFY_CTA`, with closing text that no longer says the extension is
       coming soon. Update the notify-page assertions for this page in
       `apps/web/__tests__/surface-page-claims.test.ts` and
       `apps/web/__tests__/distribution-state.test.ts` in the same commit.
    2. **Owner.** Deploy that commit to web production
       (`.github/workflows/deploy-production.yml`), then check that
       `https://agiworkforce.com/chrome-extension` shows the new status and
       its call to action opens the store listing.
    3. **Owner.** In the Dashboard's Store listing tab set Homepage URL to
       `https://agiworkforce.com/chrome-extension` and save, then update the
       Homepage URL row of `apps/extension/docs/chrome-web-store-listing.md`
       to match.

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

The publish job requests only the `chromewebstore` OAuth scope, refuses a taken-down/warned item, a different submission still pending review or staged, and a version the store already rejected, uploads the verified ZIP, waits at most 60 seconds for asynchronous processing, and submits with `skipReview=false` and `blockOnWarnings=true`. An earlier submission that was published, rejected or cancelled does not block a higher version.

## Verify after submission

1. Confirm the workflow reports the expected extension version and a submitted/review state without warnings.
2. Confirm the Developer Dashboard shows the same source version and review status.
3. After approval, install from the public listing into a clean Chrome profile
   and repeat the production authentication, persistence, browser-control, and
   responsive/accessibility checks in
   `audit/blockers/35-chrome-web-store-release-blockers.md`. Do not reuse unpacked-build evidence.
4. Confirm the published CRX item ID matches `CWS_EXTENSION_ID`, the Clerk production instance allows `chrome-extension://<that-id>`, and `CLERK_AUTHORIZED_PARTIES` on the production web deployment lists it (First submission step 8).
5. Confirm the deployed artifact renderer names `chrome-extension://<that-id>` in its `frame-ancestors` header (First submission step 9). Until it does, the artifact panel shows source instead of a live preview.

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
   from `apps/extension/docs/chrome-web-store-listing.md`. The REST API cannot create a product.
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
page tool works on the last focused browser window. `apps/extension/scripts/install-native-host.sh`
registers the desktop host for each of these browsers that is installed.

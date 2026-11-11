# VS Code Marketplace Publish Runbook

Status: Current
Owner: Platform lead
Last updated: 2026-11-11

Canonical procedure for creating the `agiworkforce.agi-workforce` listing once
and releasing every version after it, on the Visual Studio Marketplace and on
Open VSX.

## Release boundary

- Tags use `v-vscode-X.Y.Z` (stable) or `v-vscode-X.Y.Z-<channel>.<n>`
  (pre-release); `apps/extension-vscode/package.json` keeps the plain `X.Y.Z`
  both channels share, because the Marketplace accepts only
  `major.minor.patch` and needs a different version for each channel.
- `.github/workflows/release-vscode-extension.yml` builds the exact tagged
  commit, packages the VSIX for the tag's channel, verifies it, installs it in a
  clean VS Code profile, and hands that one artifact to the publish jobs. It
  never rebuilds after approval.
- The repository-pinned `@vscode/vsce` is authoritative. Do not depend on a
  globally installed `vsce`.
- Global Azure DevOps Personal Access Tokens are retired on **December 1, 2026**.
  Automation uses Microsoft Entra ID workload identity and
  `vsce publish --azure-credential`; never add a long-lived Marketplace token to
  GitHub secrets.
- Marketplace version numbers are one-way: a published version cannot be
  published again, and a removed extension name can never be reused.

References (read 2026-11-11):

- <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>
- <https://code.visualstudio.com/api/references/extension-manifest>
- <https://code.visualstudio.com/api/extension-guides/workspace-trust>
- <https://code.visualstudio.com/api/extension-guides/telemetry>
- <https://github.com/eclipse/openvsx/wiki/Publishing-Extensions>
- `ovsx` 1.3.0 package README (Trusted Publishing section)

## What the package job enforces

- `pnpm --filter agi-workforce package` cleans `out/`, builds production
  bundles without source maps, and refuses any compiled file outside the four
  runtime outputs, any source map, script, tsconfig or test configuration.
- `apps/extension-vscode/scripts/verify-vsix.mjs` re-reads the archive: safe
  paths and sizes, no `.env`, source, scripts or maps, the four runtime files,
  the manifest identity and engine, the icon, README and license, and the
  release channel in `extension.vsixmanifest` (`--pre-release` or `--stable`).
- `scripts/release/scan-release-artifact.mjs` scans the unpacked VSIX for
  secrets and development endpoints.
- `pnpm --filter agi-workforce test:integration:vsix` installs that exact VSIX
  into a clean VS Code profile and activates it.
- `pnpm --filter agi-workforce lint` includes the theme-token check, and
  `src/__tests__/marketplaceReadme.test.ts` holds the README to absolute
  `https` links, no SVG, and only commands and settings the manifest
  contributes. vsce resolves a relative README link against the repository
  root, not `apps/extension-vscode/`, so a relative link would break on the
  listing.

## Before the first submission

These are decisions or dependencies outside this workflow. Publishing before
they are settled lists an extension that cannot do its main job or contradicts
a published policy.

1. **Owner. Publish the AGI CLI first.** Chat, agent runs and history run
   through the local `agi` binary, and **Code: Install AGI CLI** installs it from
   `https://agiworkforce.com/install.sh`, which accepts only a signed release.
   Until the first signed CLI release exists
   (`audit/blockers/14-desktop-and-vscode-need-unpublished-cli.md`), a
   Marketplace install has no working chat.
2. **Listing name.** The Marketplace requires a unique display name, and an
   extension already lists as `code` (`lixinyu.codexxy`, Marketplace search
   2026-11-11). The manifest's `displayName` is therefore `AGI Code`: the
   store-facing rule in `scripts/check-product-names.mjs` is the copyright name
   plus the product name, which the Chrome item follows with `AGI Extension`,
   and it is the name the README, Activity Bar and chat participant already
   use. The owner may choose another name before the first upload; it is that
   one manifest field, and the guard fails until the registry agrees.
3. **Owner, with counsel. Update the privacy policy.** `/privacy` still says
   the VS Code extension and VS Code BYOK are coming soon, while the README
   describes Local, provider-key and Managed Cloud paths, account memory,
   feedback and opt-in usage events. The README links to
   <https://agiworkforce.com/privacy>.

## First submission

Who does what: **Owner** steps need the owner's Microsoft, Azure, Eclipse or
GitHub account; **Lead** steps run from this repository with `gh` and admin
rights on `siddharthanagula3/agiworkforce`.

1. **Owner. Create the publisher.** Sign in at
   <https://marketplace.visualstudio.com/manage> with the Microsoft account that
   will own the listing, choose **Create publisher**, and set ID `agiworkforce`
   (it cannot be changed later) and the display name shown as the publisher.
   If `agiworkforce` is taken, stop: the manifest `publisher` and every URL in
   this runbook use it.
2. **Owner. Create the publish identity.** In the Azure portal, under Microsoft
   Entra ID, create an app registration (or a user-assigned managed identity)
   used only for Marketplace publication. Add a federated credential for
   GitHub Actions with organization `siddharthanagula3`, repository
   `agiworkforce`, entity type **Environment**, environment
   `vscode-marketplace` (subject
   `repo:siddharthanagula3/agiworkforce:environment:vscode-marketplace`). Give it
   no Azure subscription roles and no client secret.
3. **Owner. Admit the identity to the publisher.** On the publisher's
   management page, add the identity as a member by its ID with the
   **Contributor** role.
4. **Lead. Create the protected environment before any `v-vscode-*` tag
   exists.** A workflow that references a missing environment creates it with
   no protection.

   ```bash
   REVIEWER_ID=$(gh api users/siddharthanagula3 --jq .id)
   printf '{"reviewers":[{"type":"User","id":%s}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' "$REVIEWER_ID" \
     | gh api -X PUT repos/siddharthanagula3/agiworkforce/environments/vscode-marketplace --input -
   gh api -X POST repos/siddharthanagula3/agiworkforce/environments/vscode-marketplace/deployment-branch-policies \
     -f name='v-vscode-*' -f type=tag
   gh variable set VSCODE_MARKETPLACE_AZURE_CLIENT_ID --env vscode-marketplace --body '<application (client) ID>'
   gh variable set VSCODE_MARKETPLACE_AZURE_TENANT_ID --env vscode-marketplace --body '<directory (tenant) ID>'
   ```

   Leave "Prevent self-review" off while the owner is the only reviewer. The
   publish job refuses to run without both variables.

5. **Owner decides the first version; lead sets it.** Raise `version` in
   `apps/extension-vscode/package.json` (the Marketplace suggests even minor
   numbers for stable and odd for pre-release, for example `0.2.0` stable and
   `0.3.0` pre-release), commit, and run "Each release" below.
6. **Owner. Approve the publish job** only after comparing the VSIX name and
   SHA-256 in the package job's artifact with the tag. Without the identity
   (steps 2 and 3), run the workflow with `publish=false`, download the
   artifact, and upload the `.vsix` at
   <https://marketplace.visualstudio.com/manage/publishers/agiworkforce>; never
   create a temporary token instead.

### Open VSX (VSCodium, Cursor, Windsurf, Gitpod)

The `publish-open-vsx` job is off until `OPEN_VSX_PUBLISH` is `true`, and it
needs `ovsx` as a pinned development dependency of `apps/extension-vscode`.

1. **Owner.** Create an Eclipse account at
   <https://accounts.eclipse.org/user/register> with the GitHub username that
   signs in to open-vsx.org, sign in at <https://open-vsx.org>, and sign the
   Publisher Agreement from the profile page.
2. **Owner.** Create a one-time token at
   <https://open-vsx.org/user-settings/tokens>, create the namespace with
   `npx ovsx create-namespace agiworkforce -p <token>`, then delete the token
   and claim verified ownership through the namespace-access request the wiki
   describes.
3. **Owner.** Under <https://open-vsx.org/user-settings/trusted-publishers>,
   register repository `siddharthanagula3/agiworkforce`, workflow
   `release-vscode-extension.yml`, environment `open-vsx`.
4. **Lead.** Create the protected `open-vsx` environment the same way as step 4
   above (tag policy `v-vscode-*`, no variables), then
   `gh variable set OPEN_VSX_PUBLISH --body true`.

## Each release

1. Update `version`, the README, and listing claims for anything the release
   changed; record the user-facing change in the root `CHANGELOG.md`.
2. Run the surface checks:

   ```bash
   pnpm --filter agi-workforce typecheck
   pnpm --filter agi-workforce lint
   pnpm --filter agi-workforce test
   pnpm --filter agi-workforce test:webview
   pnpm --filter agi-workforce package
   pnpm --filter agi-workforce verify:package --stable
   ```

3. Commit, then push the tag (`git tag v-vscode-<version>`, then
   `scripts/dev/heavy-job.sh git push origin v-vscode-<version>`). A
   pre-release uses `v-vscode-<version>-beta.<n>`.
4. Approve `vscode-marketplace` (and `open-vsx`, when enabled) after checking
   the artifact name and SHA-256.

A rehearsal packages and verifies a tag without publishing:

```bash
gh workflow run release-vscode-extension.yml \
  -f tag=v-vscode-<version> \
  -f publish=false
```

The publish job authenticates with GitHub OIDC and consumes the verified VSIX:

```bash
cd apps/extension-vscode
pnpm exec vsce publish --azure-credential \
  --packagePath "$GITHUB_WORKSPACE/$VSIX_PATH" \
  --no-dependencies
```

Pre-release tags add `--pre-release`; vsce rejects that flag for a package that
was not built as pre-release, which is why the package job sets the channel.

## Verify after publication

1. Open <https://marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce>
   and confirm the version, channel, display name, description, icon, Preview
   badge, categories, README rendering and links, and the Free label.
2. Install into a clean profile:

   ```bash
   code --profile agi-release-smoke --install-extension agiworkforce.agi-workforce
   ```

3. With the published CLI installed, verify activation, a local developer
   session, resume, approval, diff, terminal, and the signed-out and
   CLI-missing states. Opening a window must not call AGI Cloud until the AGI
   view or a command is used.
4. When Open VSX is enabled, confirm
   <https://open-vsx.org/extension/agiworkforce/agi-workforce> shows the same
   version.

## Rollback

Marketplace version deletion is not a reusable rollback: the latest version
cannot be deleted, and a deleted version number cannot be republished. Ship a
tested forward patch with a new version. For a critical security incident,
unpublish from the publisher management page, keep the publisher and
extension identifiers, remediate, and publish a newer version.

| Field           | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| Publisher ID    | `agiworkforce`                                                                   |
| Extension ID    | `agi-workforce`                                                                  |
| Marketplace URL | <https://marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce> |
| Open VSX URL    | <https://open-vsx.org/extension/agiworkforce/agi-workforce>                      |

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
- <https://docs.github.com/en/actions/reference/security/oidc> and
  <https://learn.microsoft.com/en-us/cli/azure/ad/app/federated-credential>

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

1. **Owner. Protect `vscode-marketplace` and `open-vsx` before any publish
   identity exists.** Run "First release" steps 2 and 3 of
   `docs/runbooks/cli-release.md`: they create all four release environments
   with the owner as required reviewer, administrator bypass off and a
   deployment policy of `v-vscode-*` tags only, add the tag ruleset, and end
   with `node scripts/release/check-release-environments.mjs` printing `OK`.
   A workflow that names a missing environment creates it with no protection,
   so a tag pushed before this step would publish unapproved; and because the
   policy admits only tags, a `workflow_dispatch` from a branch never reaches
   either environment.
2. **Owner. Create the publisher.** Sign in at
   <https://marketplace.visualstudio.com/manage> with the Microsoft account that
   will own the listing, choose **Create publisher**, and set ID `agiworkforce`
   (it cannot be changed later) and the display name shown as the publisher.
   If `agiworkforce` is taken, stop: the manifest `publisher` and every URL in
   this runbook use it.
3. **Owner. Create the publish identity.** In the Azure portal, under Microsoft
   Entra ID, create an app registration (or a user-assigned managed identity)
   used only for Marketplace publication. Add a federated credential for
   GitHub Actions with organization `siddharthanagula3`, repository
   `agiworkforce`, entity type **Environment**, environment
   `vscode-marketplace` (subject
   `repo:siddharthanagula3/agiworkforce:environment:vscode-marketplace`). Give it
   no Azure subscription roles and no client secret. From the Azure CLI:

   ```bash
   gh api repos/siddharthanagula3/agiworkforce/actions/oidc/customization/sub
   az ad app federated-credential create --id '<application (client) ID>' --parameters '{
     "name": "agiworkforce-vscode-marketplace",
     "issuer": "https://token.actions.githubusercontent.com",
     "subject": "repo:siddharthanagula3/agiworkforce:environment:vscode-marketplace",
     "audiences": ["api://AzureADTokenExchange"]
   }'
   ```

   The first command must show `"use_immutable_subject":false` and the prefix
   `repo:siddharthanagula3/agiworkforce` (true on 2026-11-11). If immutable
   subjects are ever turned on, the subject gains the owner and repository ids
   and the credential has to be updated to match. A job that declares an
   environment presents that environment, not its ref, as the subject (GitHub
   OIDC reference, read 2026-11-11), so the tag binding comes from the
   environment's `v-vscode-*`-only policy (step 1). Entra matches the subject
   exactly, so no other environment, branch or pull request can use it.

4. **Owner. Admit the identity to the publisher.** On the publisher's
   management page, add the identity as a member by its ID with the
   **Contributor** role.
5. **Lead. Point the protected environment at the identity.** The
   environment already exists from step 1; the probe confirms it is still
   protected before anything is stored in it.

   ```bash
   node scripts/release/check-release-environments.mjs
   gh variable set VSCODE_MARKETPLACE_AZURE_CLIENT_ID --env vscode-marketplace --body '<application (client) ID>'
   gh variable set VSCODE_MARKETPLACE_AZURE_TENANT_ID --env vscode-marketplace --body '<directory (tenant) ID>'
   ```

   The publish job refuses to run without both variables.

6. **Owner decides the first version; lead sets it.** Raise `version` in
   `apps/extension-vscode/package.json` (the Marketplace suggests even minor
   numbers for stable and odd for pre-release, for example `0.2.0` stable and
   `0.3.0` pre-release), commit, and run "Each release" below.
7. **Owner. Approve the publish job** only after comparing the VSIX name and
   SHA-256 in the package job's artifact with the tag. A manual publish has to
   run on the tag itself, because the environment admits only tags:
   `gh workflow run release-vscode-extension.yml --ref v-vscode-<version> -f tag=v-vscode-<version> -f publish=true`. Without the identity
   (steps 3 and 4), run the workflow with `publish=false`, download the
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
3. **Owner.** Only after "First submission" step 1 shows `open-vsx` protected, register
   repository `siddharthanagula3/agiworkforce`, workflow
   `release-vscode-extension.yml`, environment `open-vsx` under
   <https://open-vsx.org/user-settings/trusted-publishers>. The environment's
   `v-vscode-*`-only policy is what binds that trust to release tags.
4. **Lead.** Run `node scripts/release/check-release-environments.mjs`, then
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

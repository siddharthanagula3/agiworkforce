# agiworkforce

Managed Cloud chat, approved-site browser context, and automation for AGI,
packaged as a Manifest V3 Chrome extension. See
[`docs/threat-model.md`](docs/threat-model.md) for the full trust boundary and
data flow reference.

## Closing finished tabs

Open **More → Close tabs…**, select the tabs you have finished using, then choose
**Close selected tabs**. Active and pinned tabs are kept; a tab that changed
since selection is also kept. This action stays in Chrome, without reading page
contents, requesting site access or calling a model.

## Error reporting

Unhandled errors and rejections from the background service worker and the
side panel can be reported for crash diagnosis. Reporting is off by default
and requires the "Share crash reports" toggle in the options
page. Every report is scrubbed before it leaves the browser: message text,
file names, and URLs are dropped, leaving only the error's type name and the
bare function names from its stack. See
[`src/features/observability`](src/features/observability) and the
`connect-src` note in the threat model for the allowlisted vendor host.

## Local artifact previews

Keep account/API authentication at `http://localhost:3000`. Set
`VITE_ARTIFACT_SANDBOX_ORIGIN=http://127.0.0.1:3002` in the extension's
`.env.local`, then rebuild and reload the unpacked extension. The different
hostname keeps generated scripts away from localhost account cookies; changing
only the port would share those cookies.

From the repository root, start the existing isolated renderer with the ID shown
in Chrome's extension manager:

```sh
node infrastructure/sandbox/dev.mjs --extension-id <extension-id> --port 3002
```

This serves only the renderer document on loopback. It uses the same exact
extension parent in its framing header and renderer message gate. It serves no
authentication. The extension continues to load its own scripts only from the
package and declares no sandbox page.

Production uses the existing sandbox origin. The sandbox deployment configures
both parent checks from the shared public `CWS_EXTENSION_ID` repository variable.
The Chrome Web Store item ID must match the stable extension public key used by
the release package. See the [publisher runbook](../../docs/runbooks/chrome-web-store-publish.md).

# AGI Browser Companion

Managed Cloud chat, approved-site browser context, and automation for AGI,
packaged as a Manifest V3 Chrome extension. See
[`docs/threat-model.md`](docs/threat-model.md) for the full trust boundary and
data flow reference.

## Error reporting

Unhandled errors and rejections from the background service worker and the
side panel can be reported for crash diagnosis. Reporting is off by default
and requires the "Share crash and usage telemetry" toggle in the options
page. Every report is scrubbed before it leaves the browser: message text,
file names, and URLs are dropped, leaving only the error's type name and the
bare function names from its stack. See
[`src/features/observability`](src/features/observability) and the
`connect-src` note in the threat model for the allowlisted vendor host.

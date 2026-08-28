<!-- GENERATED FILE — do not edit.
     Source: packages/ai/model-registry/catalog/harnesses.json
     Render: node scripts/generate-doc-matrices.mjs
     Verify: pnpm check:doc-matrices -->

# Trust mode and surface matrix

Rendered from `packages/ai/model-registry/catalog/harnesses.json` — 14 runtime profiles.

This table reports what the harness catalog says is **implemented**. It is
not policy. The invariants that govern these surfaces — which trust modes may
exist, and what may never cross between them — are stated in
`docs/architecture/trust-boundaries.md`, and that document wins. Where a cell
here disagrees with it, one of the two is a bug; decide which before changing
either.

Legend: ✅ implemented · ◐ partial · — unwired · · planned

| Surface | Trust mode | Status | codeExecution | imageGeneration | memory | toolDiscovery | webSearch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `chrome/browser-task` | local | ✅ | — | — | — | — | — |
| `chrome/managed-chat` | managed_cloud | ✅ | — | — | — | — | ✅ |
| `cli/byok-chat` | byok | ✅ | — | — | — | — | — |
| `cli/local-chat` | local | ◐ | — | — | — | — | — |
| `cli/managed-chat` | managed_cloud | ✅ | — | — | — | — | — |
| `desktop/byok-chat` | byok | ✅ | — | — | — | — | — |
| `desktop/cloud-chat` | managed_cloud | ✅ | ◐ | ✅ | ◐ | ◐ | ✅ |
| `desktop/local-chat` | local | ◐ | — | — | — | — | — |
| `mobile/cloud-chat` | managed_cloud | ✅ | — | ✅ | ◐ | — | ✅ |
| `mobile/local-chat` | on_device | ◐ | — | — | — | — | — |
| `vscode/byok-chat` | byok | — | — | — | — | — | — |
| `vscode/local-chat` | local | — | — | — | — | — | — |
| `vscode/managed-chat` | managed_cloud | ✅ | — | — | — | — | — |
| `web/cloud-chat` | managed_cloud | ✅ | ◐ | ✅ | ◐ | ✅ | ✅ |

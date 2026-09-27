# The product definition's P0 gaps

Lifted on 2026-09-27 from the "P0 Gap List" of `docs/product/definition.md`, which named them the highest-risk gaps before v1 can be called competitive. None is yet a blocker file of its own; the ledger (`audit/ledger/`) and the `audit/partial/` and `audit/missing/` files carry the item-level detail. Delete a bullet when its gap is closed and its ledger cells are `done`, and delete this file when no bullet is left.

- **Desktop AGI Work and AGI Code.** The AGI Work subpanels need demo-path verification, and AGI Code must be mounted into the V3 shell or clearly gated before a demo.
- **Desktop settings information architecture.** Settings must match the locked IA: General, Account, Privacy, Billing, Usage, Capabilities, Connectors, AGI Code, AGI in Chrome, Extensions, Developer.
- **One chat flow with files.** Normal chat plus selected files and reference files must work without forcing users into separate chat experiences.
- **Local to BYOK fork.** The fork flow must work end to end on every surface where it appears: context selection, secret scan, payload preview, provider label, consent, and a preserved Local original.
- **Model selection from metadata.** Model selection must use catalog and provider capability metadata everywhere; remove the scattered hardcoded current-model assumptions.
- **Memory.** Memory must support view and manage, reference-chat search, memory generated from history, and importing a prompt or workflow from other AI providers.
- **Connectors, apps and plugins.** They must support a directory, categories, search, OAuth and custom MCP, per-tool permissions, per-conversation loading, and admin controls.
- **Artifacts.** Artifacts must support creation, the side panel, a source and preview switch, versions and history, copy, download and export, multi-artifact selection, an error-fix loop, publish and share controls, and gating for AI-powered and MCP-backed artifacts.
- **Global search.** Search must cover chats, projects, artifacts, files, connectors, settings, and developer sessions where allowed.
- **Domain convergence.** Web, Mobile Cloud, Desktop Cloud, and provenance-eligible Chrome Managed Cloud must converge inside the account domain. Desktop Code, CLI and VS Code must converge inside the host-owned developer domain. Crossing between the two domains requires an explicit handoff.
- **Managed Free controls keep pace.** Managed Free is a public alpha, enabled after sign-in (founder decision, 2026-06-27); paid upgrades stay waitlist or access-code gated. Metering, billing, abuse, retention, deletion and provider-term controls must keep pace with Free usage, and they gate the paid launch. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as an incident-response kill switch.
- **UI verification on all six surfaces.** Launch-critical flows need screenshot or end-to-end UI verification on every surface, not only typecheck and build.
- **Visual design workspace.** Parity is not yet specified in code: the canvas, artboards, layers, assets and files, properties panel, prototype and deck preview, versioning, export and trust labels must be designed before parity with local reference design-workspace patterns is claimed.

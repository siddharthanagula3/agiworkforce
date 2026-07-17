# Volume 14 — Artifacts

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 14)
Authority: this manual, `docs/strategy/02-gap-analysis.md` §2 (artifacts polish), `docs/strategy/10-oss-corpus-port-plan.md` §6 (`defineToolCallRenderer`), `docs/agent-context/repo-map.json` (sandbox renderer), `docs/agent-context/risk-map.json` (artifact-rendering), `packages/contracts/types/src/suite-contracts.ts`.

## Philosophy & Cloud/Local stance

Artifacts are the most "wow" surface in a demo and deserve disproportionate polish (`docs/strategy/02` §2). An artifact is a first-class, versioned, addressable output — a document, code file, markdown, HTML, React component, canvas, diagram, image, PDF, slide deck, or table — that the user can view, edit, diff, restore, publish, and share. The clean mental model (from `docs/strategy/10` §6, CopilotKit `defineToolCallRenderer`): **an artifact is a named tool whose render returns a panel that fills as args stream**, with a status discriminated union (`InProgress → Executing → Complete`) and a wildcard renderer for model-generated artifacts.

Cloud/Local sets where an artifact is stored and rendered. **Rendering is always isolated in a sandbox iframe** regardless of mode — untrusted generated HTML/React/JS must never execute in the app origin (risk-map `artifact-rendering`). Local artifacts stay on-device; Managed artifacts follow retention/deletion. **AI-powered artifacts** (artifacts that call models or tools) are gated by capability + trust + auth — they only run where the trust boundary, model capability, and entitlement all permit, and never silently cross a boundary.

## Binding rules

1. **Every artifact has a manifest.** Checksum, MIME type, TTL/retention, owner, and privacy/provider mode are recorded on creation (Vol 39). No artifact without a manifest.
2. **Rendering is sandboxed.** All artifact rendering (HTML/React/JS/canvas/SVG) runs in the isolated sandbox renderer (`apps/sandbox`), receiving content via `postMessage` only — never executed in the app origin.
3. **Artifacts are versioned.** Each edit creates a version; diff between versions and restore any version are first-class operations.
4. **AI-powered artifacts are triple-gated.** Capability (model supports it per `models.json`) + trust (the active boundary permits it) + auth/entitlement. Hidden, not faked, where unsupported.
5. **Trust labels travel with the artifact.** An artifact records the trust mode and provider that produced it; display copy comes from `suite-contracts.ts`.
6. **Publish/share is consented and scoped.** Publishing produces a shareable, sandboxed view with explicit owner consent, secret stripping, and a revoke control; respects privacy mode.
7. **Multi-artifact selection works.** Users can select multiple artifacts (source-of-truth P0 #8) for batch operations and cross-artifact context.
8. **Error-fix loop is built in.** A failing code/render artifact offers an in-place fix loop (source-of-truth P0 #8), running in the artifact's trust boundary.
9. **The renderer model is one contract.** Use a single `defineToolCallRenderer`-style contract with a `name:"*"` wildcard; do not scatter ad-hoc renderers per artifact type.
10. **Local artifacts stay local; Managed honors retention.** No silent upload of Local artifacts; Managed artifacts follow retention/deletion + DSAR (Vol 25/30).

## Repository map

- Desktop artifact workbench: `apps/desktop/src/features/artifacts/` — `ArtifactPanel.tsx`, `ArtifactsGallery.tsx`, `ArtifactRendererView.tsx`, `ArtifactVersionHistory.tsx`, `VersionHistoryDialog.tsx`, `ShareArtifactDialog.tsx`, `InlineArtifactEditor.tsx`, `ArtifactToolbar.tsx`, `publishAdapter.ts`.
- In-chat artifact rendering: `apps/desktop/src/features/chat/ArtifactRenderer.tsx`, `ArtifactsView.tsx`.
- Sandbox renderer (isolation): `apps/sandbox` (static `index.html`, `postMessage`-only, deployed to sandbox.agiworkforce.com — see `docs/agent-context/repo-map.json` + risk-map `artifact-rendering`).
- Web artifact surface: `apps/web/features/chat/` (artifact/tool timelines) + `apps/web/features/media/`.
- Canvas/visual artifacts (direction): `apps/desktop/src/features/{canvas,dynamic-canvas}/` (visual design workspace is **Missing/Gated** — see source-of-truth P0 #13).
- Manifest/trust contracts: `packages/contracts/types/src/` (Vol 38), `packages/contracts/types/src/suite-contracts.ts`.
- Renderer-tool pattern reference: CopilotKit `defineToolCallRenderer` (`docs/strategy/10` §6, MIT `packages/*` only).

## Competitor notes

Per `docs/strategy/01` / `02` and source-of-truth Competitive Baseline: Claude ships artifacts with a sidebar, editing/versioning/export, AI-powered artifacts, artifact MCP, and artifact storage — a mature, novel distribution channel; ChatGPT ships Canvas. AGI is **Partial** (web sidecar + desktop workbench exist; versioning/publish/AI-powered/MCP-backed incomplete — gap analysis §3). AGI's divergence: **manifest-tracked, trust-labeled, sandbox-isolated artifacts** with AI-powered gating by trust boundary — incumbents render in their single cloud zone, while AGI can produce a Local artifact that never leaves the device and a Managed artifact under retention policy. The visual design workspace (Claude Design-style canvas, reference-only) is net-new scope; defer unless it becomes a wedge (gap analysis §2). Match capabilities; never copy Claude/ChatGPT artifact UI, assets, or naming.

## Checklists

### Build — lifecycle & versioning

- [ ] Create artifacts for each type: document, code, markdown, HTML, React, canvas, diagram, image, PDF, slides, table.
- [ ] Write a manifest (checksum, MIME, TTL/retention, owner, privacy/provider mode) on every artifact.
- [ ] Version on edit; implement diff between versions and restore any version.
- [ ] Source/preview switch and an artifact side panel (source-of-truth P0 #8).
- [ ] Copy/download/export per type.
- [ ] Multi-artifact selection for batch operations.
- [ ] In-place error-fix loop for failing code/render artifacts.

### Build — rendering & renderer contract

- [ ] All rendering runs in the `apps/sandbox` iframe via `postMessage`; nothing executes in the app origin.
- [ ] One `defineToolCallRenderer`-style contract with status union and a `name:"*"` wildcard; no per-type ad-hoc renderers.
- [ ] Panel fills as tool/artifact args stream (Vol 24 streaming).

### Build — publish/share & AI-powered

- [ ] Publish/share produces a sandboxed view with consent, secret stripping, and revoke.
- [ ] AI-powered artifacts gated by capability (`models.json`) + trust boundary + auth/entitlement; hidden where unsupported.
- [ ] Artifact records and renders its trust/provider label (`suite-contracts.ts`).

### Review & security

- [ ] No artifact HTML/React/JS path executes in the app origin (verify sandbox isolation against risk-map `artifact-rendering`).
- [ ] Local artifacts never upload silently; Managed artifacts honor retention/deletion + DSAR.
- [ ] Published artifacts strip secrets and respect privacy mode before leaving the account/device.
- [ ] AI-powered artifact runs never silently cross a trust boundary.
- [ ] Manifest checksum/MIME validated on load; untrusted MIME never rendered as executable.

## Definition of Done

Artifacts of every listed type are creatable, manifest-tracked (checksum/MIME/TTL/owner/privacy mode), versioned with diff+restore, and rendered exclusively in the sandbox iframe via `postMessage`. Source/preview switch, copy/download/export, multi-select, and the error-fix loop work. Publish/share is consented, secret-stripped, revocable, and privacy-mode-aware. AI-powered artifacts are gated by capability + trust + auth and hidden where unsupported. Local artifacts stay local; Managed honors retention/deletion. Sandbox isolation is verified against risk-map `artifact-rendering`; the artifact flow has e2e/visual verification (not build-only).

## Anti-patterns

- Rendering generated HTML/React/JS in the app origin instead of the sandbox iframe.
- Artifacts without a manifest, or with unvalidated MIME rendered as executable.
- Scattering ad-hoc renderers per artifact type instead of one renderer-tool contract.
- AI-powered artifacts shown (and faked) where the model/trust/auth doesn't support them.
- Publishing/sharing without consent, secret stripping, or a revoke control.
- Silently uploading Local artifacts or ignoring Managed retention/deletion.
- Claiming artifacts parity while versioning/publish/AI-powered remain stubbed (gap analysis §3).

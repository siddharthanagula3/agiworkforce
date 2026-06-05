# IP Provenance And License Disclosure

Status: Draft
Owner: Founder
Created: 2026-05-31

## Notice

This is a business disclosure draft, not legal advice. Counsel should convert this into formal disclosure schedules for any NDA, LOI, or asset purchase agreement.

## Ownership Summary

AGI Workforce is currently represented in the repo as proprietary software:

- Root `LICENSE`: proprietary and confidential.
- Root `package.json`: `PROPRIETARY`.
- Public brand: `AGI`.
- Formal platform/repo name: `AGI Workforce`.

Before any sale, confirm:

- Whether the selling party is the founder personally or AGI Automation LLC / another entity.
- That all founder-created code/docs are assigned to the selling party.
- That contractors, collaborators, or bot-authored contributions do not create unresolved ownership issues.
- That GitHub, domain, package, app-store, and marketplace accounts can be assigned or transferred.

## AI-Assisted Development Disclosure

The founder states that AGI Workforce was built using LLM-assisted development. Buyer-facing disclosure should say:

> AGI Workforce was developed through an AI-assisted software-development workflow directed by the founder. The founder controlled product direction, repo organization, code review, verification commands, and integration decisions. The repo includes guardrails, tests, typechecks, source-of-truth docs, and provenance notes where third-party code was adapted.

Recommended additional diligence:

- Review Git history for generated commits and bot accounts.
- Confirm terms of the LLM tools used during development, especially whether outputs can be commercially assigned.
- Identify any pasted proprietary reference material and exclude it from sale assets unless counsel approves.
- Keep all prompts/secrets/API keys out of the buyer data room unless explicitly requested and cleared.

## Third-Party Code Disclosure

Current root disclosure file:

- `THIRD_PARTY_LICENSES.md`

Currently disclosed adapted code:

- OpenClaw / MIT
- Imported/adapted into `packages/llm-normalize`, `packages/types`, `packages/mcp`, `packages/skills`, and `packages/apply-patch`

Before diligence:

1. Re-scan for copied/adapted source.
2. Confirm all third-party licenses are compatible with sale and proprietary distribution.
3. Preserve required copyright notices.
4. Separate package-dependency licenses from source-code-derived licenses.
5. Ask counsel whether any dependency license creates distribution obligations.

## Competitive Reference Material

Repo docs reference competitive products and local reference archives, including Claude/OpenAI-style parity references.

Buyer disclosure:

> AGI Workforce uses ChatGPT, Claude, Codex, Claude Code, and other AI products as competitive references for feature parity and workflow analysis. The product rules explicitly prohibit copying proprietary code, private assets, protected branding, or pixel-perfect layouts. Reference folders and audit artifacts are research evidence, not owned product assets, and should be excluded from source-code asset transfer unless counsel approves.

Relevant current rules:

- `docs/current/source-of-truth.md` says parity means user-capability and workflow parity, not copying proprietary code, assets, or branding.
- `docs/current/agi-product-requirements.md` says OpenAI and Anthropic are competitive references, not sources of proprietary implementation, visual assets, or copy.
- `docs/current/parity-implementation-matrix.md` warns not to copy proprietary source, screenshots, icons, text, or layouts exactly.

Recommended pre-sale cleanup:

- Move or exclude competitor screenshot/reference archives from sale export unless buyer requests them as research material.
- Clearly mark them as excluded assets in the asset schedule.
- Ensure buyer-facing demos show AGI-owned UI, names, and assets.

## Brand And Trademark Risk

Public brand is `AGI`, formal name is `AGI Workforce`.

Risks to review:

- `AGI` is generic/descriptive and may be difficult to protect.
- `AGI Workforce` may need trademark clearance.
- App-store and marketplace names should be reviewed before assignment.
- Buyer may prefer asset purchase without adopting the brand.

## Disclosure Schedule Draft

| Category | Disclosure |
| --- | --- |
| Proprietary code | AGI Workforce monorepo and docs, subject to third-party disclosures. |
| Open-source adapted code | OpenClaw MIT-derived/adapted code listed in `THIRD_PARTY_LICENSES.md`. |
| Package dependencies | npm/Cargo dependencies; buyer should run license scan before close. |
| AI-assisted development | Founder used LLM-assisted development; outputs integrated and verified through repo workflows. |
| Reference materials | Competitive reference docs/screenshots/audits exist and should be excluded or separately disclosed. |
| Secrets | No secrets should be included in source export; buyer must provision own credentials. |
| Trademarks | Brand/name clearance not complete unless counsel confirms. |

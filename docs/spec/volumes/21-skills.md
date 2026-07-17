# Volume 21 — Skills

Status: Canonical (depth expansion of `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 21)
Authority: this manual · `docs/strategy/10-oss-corpus-port-plan.md` §5 (SkillSpector, packaging conventions, `.skillignore`) · `docs/strategy/09-reference-codebases.md` (progressive disclosure, paths-conditional activation) · `packages/client/desktop-command-client/src/skills.ts` · `services/api-gateway/src/services/skillsCatalog.ts`

## Philosophy & Cloud/Local stance

A skill is a reusable, model-invoked procedure packaged as a `SKILL.md` (YAML frontmatter + body) plus optional assets. Its defining mechanic is **progressive disclosure**: only `name`, `description`, and `whenToUse` load at startup; the body loads on invocation (`docs/strategy/09`). A skill declares `allowed-tools` (its tool envelope) and per-skill permissions, and can be `paths:`-conditional (fires only when a matching file is touched). Skills are how AGI turns repeated workflows into shareable capabilities — installed from a marketplace or authored locally as custom skills.

The trust posture is the product: a third-party skill is **untrusted code/instructions** and must pass a **vetting gate before install** plus a **rug-pull re-scan on update** (`docs/strategy/10` §5, SkillSpector). Cloud/Local/Hybrid changes where a skill runs, never its safety contract. A Local skill runs against local tools and context; it never silently invokes a hosted capability. MCP-sourced skills may not shell-inject (Vol 19). `.skillignore` keeps secrets out of the shipped bundle (`docs/strategy/10` §5). A skill's `allowed-tools` is a ceiling enforced by the Vol 18 permission pipeline — a skill cannot grant itself a tool the active trust boundary forbids.

## Binding rules

1. A skill is `SKILL.md` (YAML frontmatter) + progressive disclosure: name/description/whenToUse preload, body loads on invoke.
2. Every skill declares `allowed-tools`; that set is a ceiling enforced by the fail-closed permission pipeline (Vol 18) within the active trust boundary.
3. Third-party skills pass the vetting gate (SkillSpector: prompt-injection, exfiltration, dangerous-exec, declared-vs-actual permission diff) before install; `DO_NOT_INSTALL` is blocked.
4. Skill updates trigger a rug-pull re-scan against the last-approved manifest; added permissions after approval are blocked pending re-consent.
5. `.skillignore` excludes secrets/local files from the bundle; submit-time lint validates frontmatter/manifest (`docs/strategy/10` §5).
6. A Local skill never silently invokes a hosted capability; boundary crossings use the explicit fork.
7. MCP-sourced skills may not shell-inject or execute arbitrary commands (Vol 19, `docs/strategy/09`).
8. Findings (category/severity/remediation) are shown to the user before install — a visible trust signal, not a silent pass.

## Repository map

- Skill API + lifecycle: `packages/client/desktop-command-client/src/skills.ts`; catalog service: `services/api-gateway/src/services/skillsCatalog.ts`.
- Skill capability gating + settings surface: `packages/contracts/types/src/capabilities.ts` (skills toggle), settings IA in `packages/contracts/types/src/design-system/settings-ia.ts` (Capabilities → skills).
- Execution under the tool/permission layer: `crates/agiworkforce-execpolicy/`, `apps/cli/src/features/exec/` (CLI), `packages/client/desktop-command-client/src/toolConfirmation.ts` (consent UI).
- Skills delivered inside plugins: `crates/agiworkforce-plugin-runtime/` (manifest declares bundled skills) — Vol 22.
- Packaging conventions to standardize on (`docs/strategy/10` §5): `SKILL.md` frontmatter, `allowed-tools:` per skill, `.skillignore`, `.claude-plugin/marketplace.json`-style catalog (AGI uses `.agiworkforce-plugin/` — Vol 22).
- Vetting scanner integration (adopt SkillSpector wholesale, Apache-2.0): wire its model IDs to `packages/contracts/types/src/models.json` (do not hardcode).

## Competitor notes

Claude Code ships skills as progressive-disclosure `SKILL.md` with `allowed-tools`, source precedence, and `paths:`-conditional activation; MCP-sourced skills are barred from shell injection (study only, `docs/strategy/09`). Codex ships skills/plugins in its app/CLI ecosystem (`docs/strategy/01`). AGI adopts the progressive-disclosure mechanic and the packaging conventions from license-clean references (`agent-skills` MIT, `last30days-skill` for `allowed-tools`/`.skillignore`) and adds the differentiator no competitor markets: a **pre-install security scanner with visible findings + rug-pull re-scan** (SkillSpector, `docs/strategy/10` §5). AGI's marketplace is a _vetted_ marketplace — the trust gate is the feature. Parity is the skill capability and authoring workflow, never copied skill content.

## Checklists

### Authoring (custom skills)

- [ ] `SKILL.md` has valid YAML frontmatter (name, description, whenToUse, `allowed-tools`).
- [ ] Body is concise and loads only on invoke (progressive disclosure honored).
- [ ] `paths:`-conditional activation set where the skill is file-scoped.
- [ ] `.skillignore` excludes secrets/local artifacts; submit-time lint passes.

### Vetting gate (before install)

- [ ] SkillSpector scan runs; `DO_NOT_INSTALL` blocked, `CAUTION` surfaced to the user.
- [ ] Declared-vs-actual permission diff enforced (skill does no more than it declares).
- [ ] Prompt-injection / exfiltration / dangerous-exec analyzers pass or are shown.
- [ ] Scanner model IDs read from `models.json` (no hardcoded IDs).

### Permissions & execution

- [ ] `allowed-tools` is a ceiling; the permission pipeline denies anything outside it.
- [ ] No skill grants itself a tool forbidden by the active trust boundary.
- [ ] Destructive tool use inside a skill is still confirmation-gated (Vol 18).
- [ ] Findings shown before install; user consents explicitly.

### Lifecycle (update / rug-pull)

- [ ] Update re-scans against last-approved manifest; new permissions block pending re-consent.
- [ ] Version/source pinned; updates are explicit, not silent.
- [ ] Disable/uninstall fully removes the skill and its tool grants.

### Trust boundary

- [ ] A Local skill does not invoke a hosted capability without the fork (test-asserted).
- [ ] MCP-sourced skill cannot shell-inject; command execution from remote content blocked (Vol 19).

### Marketplace

- [ ] Installs only from an allowlisted/vetted catalog.
- [ ] Catalog entry shows author, scopes, and last scan result.

## Definition of Done

Skills are `SKILL.md` with progressive disclosure and declared `allowed-tools` enforced as a ceiling; third-party skills pass a SkillSpector vetting gate with visible findings before install and a rug-pull re-scan on update; `.skillignore` keeps secrets out of bundles; MCP-sourced skills cannot shell-inject; and a trust-boundary test proves a Local skill cannot silently reach a hosted capability. Scanner model IDs come from `models.json`. Verified per Operating Law 4.

## Anti-patterns

- Loading full skill bodies at startup instead of progressive disclosure.
- Installing third-party skills without a vetting scan or skipping the rug-pull re-scan.
- Treating `allowed-tools` as advisory instead of an enforced ceiling.
- Shipping secrets in a skill bundle (missing `.skillignore`).
- Letting a Local skill silently invoke a hosted capability.
- Allowing MCP-sourced skills to shell out; hardcoding scanner model IDs.

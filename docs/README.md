# docs

Durable repository knowledge. `AGENTS.md` §11 maps every kind of knowledge to
exactly one home; this directory holds the rows that live under `docs/`.

| Tier             | Holds                                           |
| ---------------- | ----------------------------------------------- |
| `product/`       | What the product is and must do                 |
| `architecture/`  | How the system is built and why                 |
| `development/`   | How to work in the repository                   |
| `standards/`     | Rules the code follows                          |
| `security/`      | One security document: `security/security.md`   |
| `compliance/`    | Verified platform and legal obligations         |
| `decisions/`     | Architecture decision records                   |
| `runbooks/`      | Operational procedures                          |
| `research/`      | Dated external research                         |
| `specs/`         | Feature and change specifications               |
| `generated/`     | Rendered from the repository, never hand-edited |
| `work/`          | Temporary operational work                      |
| `agent-context/` | Machine-readable context that checks consume    |

Documentation describes current reality unless it is explicitly historical. If a
new document does not fit a tier, settle ownership before writing it.

## September 21, 2026 baseline

The current product baseline is not reconstructed from dated work logs. Start
with `product/definition.md`, `product/requirements.md`, `product/suite.md`,
`product/commercial.md`, `architecture/overview.md`,
`architecture/trust-boundaries.md`, and `decisions/README.md`.
`product/competitive-guidance.md` owns the standing competitor-evidence and
parity workflow; it does not override those product and architecture owners.

Those owners define one account and effective entitlement across the suite,
Managed Free after sign-in, waitlist/access-code-gated new paid acquisition,
an Account Cloud continuity domain for eligible consumer clients, a Host
Developer continuity domain for Desktop Code/CLI/VS Code, and explicit handoff
between them. The September 21 competitor and continuity research under
`research/` explains the evidence behind that direction but does not prove the
repository implements it. Current implementation and release state live in
`work/implementation-status.md`, `ACTIVE_ISSUES.md`, and the active surface
release audit.

## Precedence

Code, guards and tests outrank every document here, see `AGENTS.md` §2 for the
full order. Within this directory:

- Research under `research/` records what was observed on a date. It never
  overrides code, current official documentation, or a locked decision.
- `work/` is expected to go stale and never settles a question.
- When two documents conflict, fix both and record the ruling in `decisions/`.

There is no archive directory and one must not be created. History lives in git;
material worth keeping belongs in the tier that owns it.

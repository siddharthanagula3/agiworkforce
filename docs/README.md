# docs

Durable repository knowledge. `AGENTS.md` §11 maps every kind of knowledge to
exactly one home; this directory holds the rows that live under `docs/`.

| Tier             | Holds                                           |
| ---------------- | ----------------------------------------------- |
| `product/`       | What the product is and must do                 |
| `architecture/`  | How the system is built and why                 |
| `development/`   | How to work in the repository                   |
| `standards/`     | Rules the code follows                          |
| `security/`      | Security model, threat models, reviews          |
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

## Precedence

Code, guards and tests outrank every document here, see `AGENTS.md` §2 for the
full order. Within this directory:

- Research under `research/` records what was observed on a date. It never
  overrides code, current official documentation, or a locked decision.
- `work/` is expected to go stale and never settles a question.
- When two documents conflict, fix both and record the ruling in `decisions/`.

There is no archive directory and one must not be created. History lives in git;
material worth keeping belongs in the tier that owns it.

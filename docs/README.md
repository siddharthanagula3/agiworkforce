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

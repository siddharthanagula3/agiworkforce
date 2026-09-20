# Held-out evaluation suites for the semantic decision service

Six suites, one per decision the ranking in `.jev-work/RANKING.md` proposes to move
onto a semantic decision service. Each suite exists to answer one question that the
existing 20-case development set in `../fixtures.json` cannot answer: how well does
the decision do on inputs that were not written while looking at the question text.

`docs/specs/semantic-decisions/audit.md` states the problem with that development set
plainly: author-written labels, question vocabulary that matches the case vocabulary,
two repetitions counted as 40 examples, and no held-out split. These suites keep the
author labels (there is one author, and that is recorded), but remove the other three.

## Layout

```
suites/
  README.md                 this file
  split.mts                 the deterministic split, and the CLI that stamps it
  server-only-noop.ts       empty module so a baseline script can import server code
  tsconfig.baseline.json    path mapping used by every baseline.mts
  <suite>/
    README.md               the decision, its call site, the cost of each error, sourcing
    cases.json              inputs only, no labels
    labels.author.json      one label and one rationale per case
    baseline.mts            runs the real production function over cases.json
    baseline.json           what the production function answered, per case
```

Three suites carry a shared input corpus too, because the same catalog, memory set or
page is reused across many cases and duplicating it per case would make the files
unreadable and the inputs inconsistent:

- `connector_tool_shortlist/catalog.json`
- `memory_relevance/memory-sets.json`
- `element_resolution/pages.json`

A case names its corpus entry by id. A runner assembles the production input from the
two halves; each suite README gives the exact assembly and the production call site it
mirrors.

## cases.json

```json
{
  "suite": "<name>",
  "meta": { "...": "decision, call site, split rule, counts, tag counts" },
  "cases": [{ "id": "...", "input": {}, "meta": { "tags": [] } }]
}
```

`input` is the whole of what a classifier may see. `meta` is for slicing results after
a run: **a runner must never put `meta` in the state it sends.** That rule is what lets
`meta.tags` carry `ambiguous` without leaking the answer into the decision itself.

## The split

`split.mts` assigns every case to `calibration` or `heldout`:

```
sha256(`${suite}:${id}`) -> first 8 hex characters -> integer -> % 100
  < 40  calibration
  >= 40 heldout
```

The suite name is in the hash so that two suites reusing an id cannot correlate. The
assignment is a pure function of the id, so it is reproducible, it does not move when
cases are added, and it cannot be quietly re-rolled until a threshold looks good.

`calibration` is where thresholds get chosen and where a question can be rewritten
after seeing a wrong answer. `heldout` is scored once, after the questions and the
thresholds are frozen. Every suite README repeats this because it is the only part of
the method that a second look can destroy.

Run `pnpm exec tsx tools/evals/semantic-decisions/suites/split.mts <suite-dir>` to
stamp `meta.split` on every case and refresh the counts. Run it with `--check` in CI
to prove no split was edited by hand.

## Tags

The same vocabulary across all six suites, so a failure pattern is comparable between
decisions:

| tag                    | what it marks                                                            |
| ---------------------- | ------------------------------------------------------------------------ |
| `plain`                | the straightforward form of the decision, either polarity                |
| `near_miss`            | shares vocabulary with the other answer and is not that answer           |
| `negation`             | the answer turns on a not, a no longer, a stop or an except              |
| `indirect`             | the fact is implied by a second hop, never stated                        |
| `non_english`          | the input is not in English                                              |
| `cjk`                  | Chinese, Japanese or Korean script                                       |
| `embedded_instruction` | the input contains text addressed to the classifier                      |
| `long_irrelevant`      | the decision turns on a small part of a large input                      |
| `ambiguous`            | two answers are defensible; scored separately, never counted as an error |
| `typo`                 | misspellings, missing capitals, phone-keyboard text                      |
| `numeric`              | the answer depends on reading a number, a date or a count                |

No tag names a polarity. `plain` covers a plain positive and a plain negative alike,
and the polarity lives only in `labels.author.json`, so a tag string cannot be used as
a shortcut to the label.

## Labels

```json
{
  "suite": "<name>",
  "labeller": "single author, one pass, not independently reviewed",
  "labels": { "<id>": { "label": "...", "rationale": "one line" } }
}
```

An `ambiguous` label carries `alternatives`, the two answers a careful reader could
defend. Those cases are reported as their own bucket. Counting them as errors would
make a suite punish a decision for the suite's own vagueness; hiding them would make
the accuracy number look cleaner than the decision is.

These labels are the author's. They are not independent review, and the audit's
requirement for independently reviewed sets is not met by this directory. What is met
is the rest of it: held-out split, inputs that do not share vocabulary with the
question, measured baselines rather than assumed ones.

## Baselines

Every `baseline.mts` imports the real production function and runs it over
`cases.json`. Nothing is reimplemented unless the suite README says so and says why.
Run one with:

```
pnpm exec tsx --tsconfig tools/evals/semantic-decisions/suites/tsconfig.baseline.json \
  tools/evals/semantic-decisions/suites/<suite>/baseline.mts
```

`tsconfig.baseline.json` maps `@/*` to `apps/web/*` and maps `server-only` to an empty
module, which is what lets a plain node process import a route-level module. Nothing
else about the imported code is changed, and no network call, database or provider is
touched: every function these scripts call is pure.

Two suites have no deterministic production baseline:

- `review_security_gate`: production runs the security pass on every chunk. That
  constant is recorded as the baseline, alongside the path-only rule the ranking
  proposes to run first, so both are measured rather than asserted.
- `element_resolution`: production has no resolver at all, the index is chosen by a
  model on the next round trip. A lexical floor is recorded and labelled as a floor,
  so a decision that does not beat it is known to be worthless rather than assumed
  to be an improvement.

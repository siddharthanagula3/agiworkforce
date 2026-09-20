# turn_signals

## The decision

One battery per managed chat turn, five answers:

| field                  | question                                                                         |
| ---------------------- | -------------------------------------------------------------------------------- |
| `family`               | which task family, from the router's own vocabulary                              |
| `needs_current_info`   | does a correct answer depend on information that may have changed since training |
| `needs_external_tools` | does answering require an action outside the chat                                |
| `needs_code`           | must code be executed, not merely written                                        |
| `complexity`           | trivial, simple, medium, difficult, frontier                                     |

`family` uses `RoutingTaskType` from `packages/contracts/types/src/runtime.ts`, restricted
to the eight members `classifyTaskLocally` can reach from text: `coding`, `reasoning`,
`research`, `creative_writing`, `image_generation`, `agentic`, `simple_chat`, `general`.
`multimodal`, `computer-use` and `long_context` are left out on purpose. Each of those
is decided in code from attachments or the cumulative token count, never from the
words, and a semantic decision must not be given the chance to override a guard that
already has the right input.

`needs_code` is deliberately narrower than "is this a coding turn". It asks whether the
answer requires a **run**: a computed result the model cannot produce reliably by
reading. That keeps it separable from `family: coding`, and it is the question the
production `code_execution` flag is actually trying to answer.

## Production call sites

- `family`: `classifyTaskLocally` in `packages/ai/routing/src/classify.ts:99`, a
  priority-ordered list of eleven regexes with a length-and-word-count fallback.
- `needs_current_info`: `resolveWebSearchRequirement` in
  `apps/web/lib/web-search/required-search.ts:109`, which combines the explicit-intent
  phrase lists in `packages/ai/search/src/explicit-search-intent.ts` with 26 freshness
  phrases, 10 volatile subjects and a year pattern.
- `needs_external_tools` and `needs_code`: `applyImplicitManagedToolIntent` in
  `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:516`, four regex
  pairs setting `web_search`, `web_fetch`, `office_creation` and `code_execution`.
- `complexity`: nothing. No production component produces it.

`baseline.mts` imports and calls all three real functions, with `researchTask` derived
from the classifier exactly as `request-processor.ts:4049` derives it. No regex was
copied into the script.

## What a wrong answer costs

**`family` wrong** routes the turn to the wrong model tier. Wrong downwards, the answer
is worse than the user paid for; wrong upwards, the turn costs several times what it
needed to. Neither is visible to the user as an error, which is why it goes unnoticed.

**`needs_current_info` false negative** is the expensive one: the model answers a
question about now from training data, confidently and without sources. That is the
exact failure `REQUIRED_SEARCH_SYSTEM_NUDGE` exists to prevent. **False positive** buys
a search API call and several thousand result tokens for a turn that did not need them.

**`needs_external_tools` false positive** attaches tool schemas the turn will not use,
and can force a tool choice; **false negative** leaves the model to claim it cannot do
something it can.

**`needs_code` false positive** spends a sandbox run on a turn that needed one
multiplication. **False negative** produces the failure that
`explicit-execution-intent.ts` documents in its own header comment: a code block, an
invented result, and no execution.

## How the cases were sourced

Written for this suite. None were adapted from `../fixtures.json` or from the router's
tests, because both were written against the regexes and would measure them back to
themselves. The development fixture's intent cases contain the trigger words: "Prove
that...", "Search the web for...", "Write a poem...". Real turns do not reliably
contain them, so this suite deliberately does not.

The groups:

- **Plain**, 42 cases spread over all eight families, phrased the way people phrase
  them rather than the way the regex expects. "Implement a stable topological sort"
  never says `function`; "Who won the constructors championship" never says `search`.
- **Near miss**, 12 cases carrying the vocabulary of the wrong answer: a poem about a
  function, a question about what a code review is, "the current version of the README
  I pasted", "run the numbers", "explain how to run the test suite".
- **Negation**, 15 cases where the answer turns on a refusal: "Don't search the web",
  "Without running anything", "I don't want an image, I want the CSS".
- **Indirect**, 16 cases where the signal is one hop away, including four follow-up
  turns whose whole meaning is in `previousUserMessage` ("Do it.", "now in Python").
- **Non-English**, 14 cases in nine languages (Spanish, German, French, Japanese,
  Chinese, Korean, Portuguese, Russian, Arabic, Hindi), four of them CJK. Every English
  phrase list scores zero on all of them by construction.
- **Embedded instruction**, 6 cases that address the classifier directly and assert a
  field value, three of them asserting the opposite of the correct answer.
- **Long irrelevant**, 5 cases of 600 to 900 characters where the decision turns on one
  clause: an incident narrative ending in "which log do I read first", a config paste
  ending in a request for four sentences on a leaving card.
- **Ambiguous**, 5 cases. Ambiguity is per field: `ts-097` is definitely `coding` and
  genuinely undecidable on `needs_code`, so only `needs_code` is excluded from scoring
  for that case.

Names, companies and figures are invented. No real personal data.

## Split

39 calibration, 63 heldout, by `sha256("turn_signals:<id>") % 100`. Thresholds and
question wording are chosen on calibration. Held-out is scored once.

## Measured baseline

| field                  | scored | correct | accuracy     | always-answer-the-majority |
| ---------------------- | ------ | ------- | ------------ | -------------------------- |
| `family`               | 97     | 28      | **28.9%**    | 22.7% (`coding`)           |
| `needs_current_info`   | 101    | 82      | **81.2%**    | **81.2%** (`false`)        |
| `needs_external_tools` | 101    | 67      | **66.3%**    | **69.3%** (`false`)        |
| `needs_code`           | 101    | 98      | **97.0%**    | **97.0%** (`false`)        |
| `complexity`           | 0      | n/a     | not measured | n/a                        |

Calibration and held-out agree closely on every field (`family` 29.7% against 28.3%,
`needs_current_info` 74.4% against 85.5%), so the split is not hiding a difference in
difficulty between the halves.

Three of those rows say the same thing: **the production signal is worth no more than a
constant.** `needs_code` matches the always-false rate to three decimal places,
`needs_current_info` matches it exactly, and `needs_external_tools` is three points
_below_ it. A decision service that reproduced the current behaviour perfectly would
add cost and buy nothing; only a decision that moves the confusion counts is worth
anything here.

The confusion counts, which are the numbers to report rather than the accuracies:

- `needs_current_info`: 4 true positives, 15 false negatives, 4 false positives. The
  misses are ordinary live questions with no trigger phrase: the last central bank
  meeting, a CVE fix, a flight during a strike, and every non-English case. The false
  positives are the year `2026` inside a question about an anachronism, the words
  `current version` about pasted text, and a turn that says "don't search the web".
- `needs_external_tools`: 3 true positives, 28 false negatives. Four of those misses
  are structural rather than a defect: image rendering is decided by the family route,
  not by a tool flag, so the composite cannot see it. Excluding the four
  `image_generation` cases the figure is 69.1%, still below the always-false rate.
- `needs_code`: the single false positive is `ts-001`, "Implement a stable topological
  sort in TypeScript". `sort` is a computation verb and `TypeScript` is a runtime
  subject, so `detectExplicitCodeExecutionIntent` returns `computation` for a turn that
  asks for an algorithm to be written. The two misses are both real computations over a
  pasted table, one of them in Hindi.
- `family`: the top confusions are `coding` read as `general` (11), `research` read as
  `simple_chat` (10), `coding` read as `simple_chat` (8), `creative_writing` read as
  `simple_chat` (7). 41 of 102 turns fall all the way through to `simple_chat` because
  they are under 80 characters and under 15 words, which is what a real short request
  looks like.

`complexity` has no baseline at all. It is recorded as `not-measured` for every case
rather than compared against an invented default, so a later claim that the decision
improved complexity estimation has to stand on the labels alone.

The development set in `../fixtures.json` scored this same classifier at 75% on intent.
The difference between 75% and 28.9% is not a different classifier. It is cases that
do not contain the regex trigger words.

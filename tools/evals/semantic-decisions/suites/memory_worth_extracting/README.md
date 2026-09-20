# memory_worth_extracting

## The decision

Does one user message state a durable fact about the speaker, a fact still true next
week?

"Durable" is not the suite's own invention. It is the definition the downstream
extraction prompt already uses, `MEMORY_FACT_EXTRACTION_SYSTEM_PROMPT` in
`packages/ai/agent-core/src/memory.ts`: identity, role, employer, location, language,
preferences, constraints, ongoing projects, and decisions the user has already made.
Questions, one-off task details and anything about the assistant are excluded there,
so they are excluded here.

## Production call site

`isMemoryExtractionWorthwhile(message)` in `packages/ai/agent-core/src/memory.ts:384`.
It gates the per-turn generative extraction in
`packages/ai/agent-core/src/model-memory-extraction.ts:161`. The gate is three rules:

1. trimmed length at least 8 characters,
2. at least one sentence that does not end in a question mark, and
3. that sentence contains an English self-reference pronoun (`i`, `me`, `my`, `we`,
   `us`, ...) or one of four intent phrases (`remember`, `note that`,
   `for future reference`, `keep in mind`, `call me`).

The input to a case is therefore one string, which is exactly the argument the
production function receives. No history, no attachments, no system state.

## What a wrong answer costs

**False negative (gate says no, the message did state a durable fact).** The memory is
never written. Nothing in the product retries: the turn passes, the extraction call
never runs, and the fact is gone. The user finds out weeks later when the assistant
does not know they are vegetarian. This is the expensive direction and it is silent.

**False positive (gate says yes, nothing durable was said).** One extraction call is
spent on a turn with nothing in it. The call is post-turn, so no user-visible latency
is added; the cost is provider spend and the small chance the extractor invents a
memory from a transient statement. Recoverable, cheap, noisy.

The asymmetry is the whole reason this decision is a candidate. A cheap decision that
is better in the false-negative direction is worth paying for even if it fires more
often overall.

## How the cases were sourced

Written for this suite, none adapted from an existing test, because the existing tests
were written against the regex and would measure the regex back to itself.

Each group targets one thing the gate cannot see, or one thing the ranking in
`.jev-work/RANKING.md` claims about it:

- **The documented miss.** `mwe-001` is the exact example the ranking cites,
  "I just moved to Berlin". The gate passes it; it is the pattern extractor in
  `extractCandidateMemoryFacts` that has no rule for it. `rows[].extra.patternFacts` in
  `baseline.json` records what the extractor finds per case, so the two failures are
  not confused with each other.
- **Self-reference without an English pronoun.** `mwe-002`, `mwe-087`, `mwe-088` use
  `im` and `u`, which the pronoun list does not contain. Fourteen non-English cases do
  the same thing in nine languages, and none of them can match an English pronoun.
- **Pronoun without a durable fact.** Twenty-three `near_miss` cases are first person,
  not questions, and state nothing that survives the week: an incident, a reading
  position, an intention for the next ten minutes.
- **Durable fact in a question.** The gate drops any sentence ending in `?`, so a fact
  offered as a question is invisible to it.
- **First person that is not the speaker.** Quoted speech, role-play, fiction, and a
  pasted handbook clause, all of which supply the pronoun and none of which supply a
  fact about the user.
- **Injection.** Seven cases carry text addressed at the classifier, four of them
  attached to a message whose correct answer is the opposite of what the injection
  asks for, so a decision that obeys them is measurably worse rather than merely
  impolite.
- **Ambiguity.** Four cases have two defensible readings and are labelled `ambiguous`
  with both listed. `mwe-043` is the interesting one: "Don't store this anywhere: my
  flat number is 12B" does state a durable fact and does forbid keeping it, and a gate
  that answers the literal question hands the suppression decision to a layer that may
  not make one.

Names, employers, addresses and numbers are invented. No real personal data.

## Split

40 calibration, 48 heldout, assigned by `sha256("memory_worth_extracting:<id>") % 100`.
Choose thresholds and rewrite question text against the calibration half only. The
held-out half is scored once, after both are frozen.

## Measured baseline

`baseline.mts` calls the real `isMemoryExtractionWorthwhile`. Nothing is
reimplemented.

| slice         | scored | correct | accuracy |
| ------------- | ------ | ------- | -------- |
| all           | 84     | 52      | 61.9%    |
| calibration   | 39     | 24      | 61.5%    |
| heldout       | 45     | 28      | 62.2%    |
| `plain`       | 27     | 25      | 92.6%    |
| `near_miss`   | 21     | 3       | 14.3%    |
| `non_english` | 14     | 7       | 50.0%    |
| `indirect`    | 8      | 4       | 50.0%    |

Four ambiguous cases are excluded from every figure above; the gate answered all four
with one of the two defensible options.

Read the tag rows rather than the headline. 92.6% on `plain` and 14.3% on `near_miss`
is one behaviour, not two: the gate fires on an English first-person pronoun, so it is
right whenever the pronoun and the fact coincide and wrong whenever they come apart.
Every non-English positive is a false negative for the same reason, and `mwe-025`
("Give me ten names for a sourdough starter") is a false positive produced by the word
`me` in a request that says nothing about the user at all.

A candidate decision that only matches 62% has bought nothing. One that fixes the
`near_miss` and `non_english` rows without losing the `plain` row is the result worth
shipping, and the false-negative count is the number to report, not the accuracy.

# Routing by activity

Starting points for the coordinator. Each row gives the family and effort to try first and the signal that should move the work. "Profile" is the agent definition in `~/.claude/agents/`; pass `model` and `effort` on the Agent call to override its defaults.

## Contents

- Defaults by activity
- When to move up, down or sideways
- When Fable is the right call
- Effort
- Reuse before routing
- Worked examples

## Defaults by activity

| Activity                                                                           | First choice    | Effort                                     | Profile                                                      | Notes                                                                                                      |
| ---------------------------------------------------------------------------------- | --------------- | ------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Reading** named files or sources and reporting what they say                     | Haiku           | medium                                     | `orch-scout`                                                 | Ask for paths, lines and quotes.                                                                           |
| **Exploration**: where is X, who calls Y, how is Z wired                           | Haiku           | medium                                     | `orch-scout` or a built-in explorer                          | Give the search area and the stop point. If the question is "how should this work", it is not exploration. |
| **Web search** for a specific fact, price, version or page                         | Haiku           | medium                                     | `orch-scout`                                                 | Ask for the URL, the quoted line and the date read.                                                        |
| **Research** across several sources that must be weighed                           | Sonnet          | medium                                     | `orch-builder`                                               | Opus when sources conflict or the synthesis is the deliverable.                                            |
| **Extraction and log summaries**                                                   | Haiku           | medium                                     | `orch-scout`                                                 | Sonnet when the log needs diagnosis, not a summary.                                                        |
| **Simple edits**: rename, reword, apply a known change in known places             | Haiku           | medium                                     | `orch-builder` with `model: haiku`, or do it directly        | `orch-scout` cannot edit. Usually cheaper to do directly than to brief.                                    |
| **Editing** prose for clarity and correctness                                      | Sonnet          | medium                                     | `orch-builder`                                               | Opus when voice, argument or structure is the work.                                                        |
| **Writing** a substantive document, proposal, explanation                          | Opus            | medium, high when the argument is the work | `orch-principal`                                             | Sonnet for a templated or factual write-up.                                                                |
| **Coding**: a scoped feature, script or refactor with a clear check                | Sonnet          | medium                                     | `orch-builder`                                               | Opus when it crosses components or the requirements are open.                                              |
| **Coding**: a feature across components, or a change with design decisions in it   | Opus            | medium, high when the design is open       | `orch-principal`                                             | Split out the mechanical parts to Sonnet only if they are separable.                                       |
| **Tests**: write or extend tests for defined behaviour                             | Sonnet          | medium                                     | `orch-builder`                                               | Ask for a mutation check on anything important.                                                            |
| **Debugging**, localised and reproducible                                          | Sonnet          | medium, high if it resists                 | `orch-builder`                                               |                                                                                                            |
| **Debugging**, intermittent, cross-component, or cause unknown                     | Opus            | high                                       | `orch-principal`                                             | Fable if a serious first attempt stalled and a different approach is wanted.                               |
| **Planning and architecture**                                                      | Opus            | high                                       | `orch-principal`                                             | Usually the coordinator's own work; delegate when the reading needed would crowd your context.             |
| **Auditing** against an explicit checklist                                         | Haiku           | medium                                     | `orch-scout`                                                 | One check per finding, with evidence and coverage.                                                         |
| **Auditing** that needs interpretation (security, correctness, compliance meaning) | Opus            | high                                       | `orch-principal`                                             |                                                                                                            |
| **Review** of a routine change                                                     | Sonnet          | medium                                     | `orch-builder` told not to edit, or an existing review skill |                                                                                                            |
| **Review** of a consequential or high-risk change                                  | Opus or Fable   | high                                       | `orch-assessor`                                              | Must be an agent that did not write the change. Give it the diff, not your opinion.                        |
| **Integration** of several workers' output into one deliverable                    | The coordinator |                                            |                                                              | Do not delegate this.                                                                                      |

## When to move up, down or sideways

Move **up** (Haiku to Sonnet, Sonnet to Opus) when:

- the worker reports that the question needs judgment, or returns conflicting evidence;
- the requirements turn out to be ambiguous, or the work crosses components it was not briefed on;
- a properly briefed attempt failed for lack of reasoning depth, not lack of context.

Move **down** when:

- the work turned out to be mechanical or fully specified;
- the result is cheap to check, so a miss costs little;
- there are many similar bounded items (then also consider running them in parallel).

Split a **Haiku** assignment into batches, before any move up, when its material would take the worker's context past 100K tokens. Each request is priced on its whole prompt, so a long-running Haiku worker pays five times the rate on every turn after it crosses the line. Rough sizing: one Haiku batch reads up to about 20 source files or 15 fetched pages in excerpts, or about 4,000 lines in total, and returns before it starts summarising work it has not read. Run the batches in parallel with disjoint search areas and merge their evidence yourself. Move the work to Sonnet at medium instead when it cannot be partitioned (one large file that must be read whole, one trace that crosses every batch) or when the answer needs judgment across all of it; on price alone Haiku over 100K is still about a quarter of Sonnet.

Move **sideways** (same family, different setup) before moving up when the failure was a thin brief, missing context, the wrong scope, or a tool the worker lacked. Changing the model does not fix any of these.

Never route the same task through each family in turn as a matter of course. One well-chosen worker plus a check costs less and tells you more.

## When Fable is the right call

Choose Fable when you can state the reason in one sentence, for example:

- "This decision is expensive to reverse and I want an assessment from a model that did not produce the plan."
- "Two serious attempts took the same approach and stalled; I want a different one."
- "The evidence file or my own observed outcomes show Fable is better at this specific kind of task."

"It is hard" is not a reason on its own: Opus is the default for hard work. If you cannot write the sentence, use Opus.

## Effort

Effort is chosen with the model, per assignment. Within one family, the spread from low to max is about as large as the gap to the next family, so effort is half the route.

| Level  | Use for                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| low    | Trivial lookups and mechanical edits on Sonnet or Opus. Avoid on Haiku for anything with several steps: it may skip a search or a check.                       |
| medium | The starting point for Haiku and Sonnet workers, and for ordinary Opus coding and writing.                                                                     |
| high   | Design, synthesis, difficult debugging, consequential review; Sonnet on long or hard tasks; Haiku on a bounded task that fell short at medium.                 |
| xhigh  | One step up after a high-effort attempt fell short for lack of depth, or for a decision that is costly to reverse. Expect a long wait before the first output. |
| max    | Rare. A single hard question where time and cost matter less than getting it right, after lower levels were tried.                                             |

Two crossovers from the evidence file decide most close calls:

- **Haiku at high is about level with Sonnet at low, for much less.** For bounded, checkable work, raise Haiku's effort before changing family.
- **Sonnet above high costs more than Opus at medium for the same result.** When Sonnet at high is not enough, move to Opus at medium; do not push Sonnet to xhigh or max.

Higher effort costs time and tokens on every turn the worker takes, so it multiplies on long tasks. Raise it for the part that needs it, not for the whole job. A family that does not support a level falls back to the highest level it does support at or below the one requested.

## Reuse before routing

Before choosing a general profile, check for something that already fits:

- a specialist skill for the domain (design, documents, a framework, a review procedure);
- a built-in or project agent (an explorer, a planner, a code reviewer, a security reviewer);
- a tool that answers the question directly (a documentation lookup, a language server, a database or API tool);
- a finding already verified in this conversation. Pass it to the worker as a given; do not pay to rediscover it.

## Worked examples

**"Find every place we read the feature flag and tell me which ones have no default."** Direct if a search shows a dozen hits. Otherwise one `orch-scout` (Haiku, low): search area, the definition of "no default", reply with path and line for each, and coverage.

**"Add CSV export to the reports page, with tests."** One `orch-builder` (Sonnet, medium) that plans and delivers it. The coordinator reads the diff and runs the tests. No planner in front of it, no reviewer behind it unless the change touches money, access or data loss.

**"Our checkout intermittently double-charges. Find out why."** The coordinator frames it. Two `orch-scout` runs in parallel gather facts (the logs for the failing requests; every write path to the charge table). One `orch-principal` (Opus, high) takes the evidence and finds the cause. Because the fix touches payments, an `orch-assessor` reviews the proposed change before it is applied.

**"Write the migration guide for v3."** One `orch-principal` (Opus, high) writes it from the changelog and the code. A `orch-scout` checks every command and path in the draft against the repository.

**"Audit the 40 API routes for missing auth checks."** A checklist audit over independent items: several `orch-scout` runs in parallel, each with a fixed list of routes and the same evidence format. The coordinator opens the lines for every reported gap, then sends the ambiguous ones to one Sonnet or Opus worker.

**"Should we move the queue from Redis to Postgres?"** The coordinator or an `orch-principal` writes the recommendation. Because it is costly to reverse, an `orch-assessor` gets the material and the question (not the recommendation) and assesses it independently.

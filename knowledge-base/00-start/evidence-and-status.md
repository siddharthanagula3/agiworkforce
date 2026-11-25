---
id: 'REF-evidence-and-status'
type: 'reference'
title: 'Evidence labels and status words'
last_reviewed: '2026-11-24'
---

# Evidence labels and status words

Every statement in this knowledge base says how it is known. Read the label before relying on the statement.

## Evidence labels

| Label                              | Meaning                                                                                              | What backs it                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Seen in a real run (`executed`)    | A person, or a model controlling the app like a person, did it in the running app and saw the result | A result sheet line, a scorecard row or a ledger live result, with screenshots |
| Read in the code (`code`)          | Someone read the code and it says so. Nobody ran it                                                  | A file and line: `apps/web/x.ts:120`                                           |
| Stated requirement (`requirement`) | A project document or the owner states it must be so                                                 | The document path, or the capability ledger item (`S13.10`)                    |
| Competitor evidence (`competitor`) | An official Claude or ChatGPT page says their product does it                                        | The web address and the review date                                            |
| Inferred (`inferred`)              | Reasoned from the code or from competitor parity; nobody stated it                                   | The reasoning, and what it was inferred from                                   |
| Proposed (`proposed`)              | A suggestion by the writer. Not a requirement                                                        | None needed; it is an idea                                                     |
| Unknown (`unknown`)                | Looked for and not established                                                                       | What was searched                                                              |

A passing automated test is evidence that the tested code path behaves as the test expects. It is recorded under "Existing tests" on a feature page and never counted as "seen in a real run".

## Implementation status (is the code there)

Per feature and per app, from the project's capability ledger.

| Word           | Meaning                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| built          | Every requirement item of the feature is implemented on that app, according to the code audit |
| partly built   | Some items are implemented, some are partial or missing                                       |
| not built      | None of the items is implemented on that app                                                  |
| does not apply | The feature has no meaning on that app                                                        |

For a single requirement item the ledger's own words are used: `done`, `partial`, `missing`, `unverified`, `n/a`.

## Verification status (has a person seen it work)

| Words                | Meaning                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| seen working         | Every built item of the feature on that app has a passing result from a real run |
| partly seen (n of m) | Some built items have a passing result                                           |
| seen failing         | At least one item failed or was partial in a real run                            |
| not seen by a person | No real run is recorded                                                          |

The two statuses are independent. Code can be built and never seen working; that is the usual case today.

## Kinds of requirement

| Kind        | Meaning                                                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Established | Stated by the owner or by a project document. Includes the five product principles and the acceptance criterion of each capability ledger item |
| Inferred    | Needed to match Claude and ChatGPT, or implied by the code, but not written down by the owner                                                  |
| Proposed    | A suggested improvement                                                                                                                        |

## Dates and revisions

Each page header carries `last_reviewed` and the project commit it was checked against (`revision`). Competitor evidence carries its own review date. A page is stale when the code it cites has changed since its revision; the maintenance guide says how to find those pages.

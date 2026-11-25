---
id: 'META-maintenance-guide'
type: 'meta'
title: 'Maintenance guide'
last_reviewed: '2026-11-24'
---

# Maintenance guide

How to keep this knowledge base true when the code or the product changes.

## How it is built

Pages are of two kinds.

| Kind            | Examples                                                                                                                                                           | How to change one                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Built from data | Feature pages, area pages, requirement items, competitor traces, system pages, test plans, gap register, indexes, relationship map, coverage                       | Change the data, then re-run the script. Never edit the page by hand: the next build overwrites it |
| Written by hand | `README.md` (its State table is rewritten by the build), `00-start/evidence-and-status.md`, `10-requirements/principles.md`, this guide, `70-qa/start-here/*`, `70-qa/setup/web.md`, `70-qa/setup/accounts.md` | Edit the page                                                                                      |

Data lives in `data/raw/` (what the authoring runs returned, one JSON file each), in `20-features/registry.json` (feature identifiers) and, for requirement items and implementation status, in the project's own capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`.

## The build, in order

```bash
cd knowledge-base
python3 -I tools/01_build_registry.py      # feature identifiers (keeps existing ones)
python3 -I tools/02_render_features.py     # 20-features
python3 -I tools/03_render_pages.py        # 40-systems, 30-surfaces, 60-engineering, glossary, 50-competitors, requirement items
python3 -I 70-qa/tools/build_plans.py      # 70-qa test plans, result sheets, code status
python3 -I tools/05_add_metadata.py        # metadata header on any page without one
python3 -I tools/04_build_indexes.py       # 80-gaps, graph, index, coverage, checks
node tools/06_finalize.mjs                 # model names, home folder paths, line endings
```

Every script can be re-run at any time. Result sheets keep what testers filled in. Feature identifiers never change once assigned.

## What to update when something changes

| What changed                                        | Update                                                                                                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code of a feature                                   | Re-read the feature (re-run its authoring job, or correct its entry in `data/raw/features-deep-*.json`), then run steps 2, 5 and 6. Set the page's reviewed revision by rebuilding                |
| A feature was added                                 | Add its requirement items to the capability ledger (the project's own process), re-run the area's authoring job, then the whole build. The new feature gets the next free identifier in its area  |
| A feature was removed                               | Remove its items from the ledger through the project's process. Keep its identifier retired in `registry.json`; never reuse it                                                                    |
| A requirement or owner decision                     | Record it in its project document first (`docs/product`, `docs/decisions`), then re-run the page `10-requirements/established-requirements.md` and correct `principles.md` if a principle changed |
| A capability's status in the code                   | Change the ledger cell through the project's process, then run steps 1 to 6                                                                                                                       |
| A hands-on test result                              | Fill the line in `70-qa/results/<app>/results.csv`; copy passing and failing results into the ledger's live result; run step 6                                                                    |
| A defect was fixed                                  | Remove its line from the source list (`70-qa/defects/*.csv`, or the project's `audit/registers/known-flaws.md`) only after a person has seen the fix work; run step 6                             |
| Competitor products changed                         | Save the current official pages again, rebuild the feature catalogue of the leaders, re-run the competitor trace, and write the new review date                                                   |
| A subsystem (providers, subscription, sign-in, ...) | Re-run that page's authoring job in `tools/workflows/foundations.js`, then steps 3 and 6                                                                                                          |
| Names of products, plans or labels                  | Re-run the glossary page                                                                                                                                                                          |

## Two status readings

Each feature shows two readings of the code per app: the page's own (from `data/raw/status-from-pages.json`, derived from the page's text by a cheaper pass and not validated item by item) and the capability ledger's. The ledger decides whether a feature applies to an app at all and is the status shown everywhere, except where the two disagree on whether the feature exists: there the page's reading is shown (`data/status-policy.json`; in a 20-case spot-check the page was right 14 times, the ledger 5). Those cases are listed in `ledger-corrections.md`. After re-reading a feature, re-run `tools/workflows/status-from-pages.js` for its pages, then the build. Correct the ledger through the project's own process, and the difference disappears on the next build.

## Finding stale pages

- Each page header has `last_reviewed` and `revision`: the date and project commit its content was read against. They come from `data/authored.json` and do **not** change on a rebuild. Change that file only after the data behind the pages has been re-read against a newer commit; the index and coverage files carry `built_on` for the date of the last rebuild.
- So: `git diff --name-only <revision>..HEAD` lists files changed since. A page whose cited files are in that list needs a re-read.
- `90-meta/checks.json` lists links that do not resolve and cited project files that no longer exist. Fix those first.
- `70-qa/code-status/summary.md` shows, per app, how many requirement items cite code that is no longer where the ledger says.

## Checks to run before trusting a change

`python3 -I tools/04_build_indexes.py` prints: broken links, cited files not found, duplicate identifiers, pages without metadata. All four must be zero or explained in `90-meta/checks.json`.

## Rules for writers, human or LLM

1. Read the code or the document before writing. Cite the file and line.
2. Label every statement: seen in a real run, read in the code, stated requirement, competitor evidence, inferred, proposed, unknown.
3. Keep implementation status and verification status apart.
4. One home per fact. Link, do not copy. The project's own documents stay the home of what they already hold.
5. Record open product choices as open. Do not decide them.
6. Configuration by name and purpose only. Never a secret value. No specific model identifiers: point to the catalog.
7. Plain words. Each section must make sense when read alone.

## Where this folder sits

`knowledge-base/` is a tracked folder at the root of the repository, registered in `scripts/check-repo-organization.mjs` and in the documentation table of `AGENTS.md` section 11. The repository's checks read it like any other folder. Three of their rules shape what may be written here:

| Rule | What it means here | Who enforces it |
| --- | --- | --- |
| No model name or model identifier outside the model catalog | `tools/06_finalize.mjs` replaces each with `(model name)`. To say which model, point to the catalog | `pnpm check:model-id-literals` |
| No trailing spaces, no Windows line endings, one newline at the end of a file | `tools/06_finalize.mjs` cleans every text file | the push check |
| No long dash in text | Write a comma, a colon or two sentences | `scripts/check-em-dash-in-copy.mjs` on commit |

The folder is listed in `.prettierignore`: the build scripts own the layout of the pages they write, so the formatter does not touch them.

Not in the repository, by `.gitignore` in this folder:

- `70-qa/evidence/`: screenshots, recordings and server logs from hands-on runs. They stay on the computer where the run was done.
- `50-competitors/data/leader-pages-saved`: a link to saved copies of third-party pages.
- `50-competitors/data/reverse-engineer-extra.csv` and its readable list: leads from studying the leaders' apps. They never enter the repository.

`90-meta/no-interference.json` records a check made on 2026-11-24, before the folder was tracked. It no longer describes how the checks treat the folder.

After any change here, run the last build step and then `pnpm check:model-id-literals` before committing.

## Outdated project documents

Pages that found a project document out of date list it at their end; the full list is `data/built/outdated-documents.json`. The project's own place for such findings is `audit/doc-corrections/contradictions-register.md`. Corrections to project documents are made on a branch and reviewed by the owner before they are pushed.

---
id: 'META-audiences'
type: 'meta'
title: 'How each team uses this knowledge base'
last_reviewed: '2026-11-24'
---

# How each team uses this knowledge base

The same pages serve every team. Feature identifiers (`F013-02`) connect the views.

## Engineering

| Question                                         | Where                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| How does this feature work and where is the code | Feature page, sections 3, 5 and 6                                                     |
| What depends on this file                        | `graph/edges.jsonl`: `implemented_by` edges pointing at `file:<path>`, read backwards |
| What does this feature depend on                 | Feature page "Depends on"; `depends_on`, `uses_provider`, `stores_data_in` edges      |
| How does a subsystem work                        | [40-systems](../40-systems/)                                                          |
| How do I build, test, deploy, release            | [60-engineering](../60-engineering/)                                                  |
| Where can I extend it                            | System pages, "Implementation map"; app pages, "Folder map and entry points"          |
| Which project documents are wrong                | `data/built/outdated-documents.json`, and the end of each system page                 |

## QA

| Question                               | Where                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What should happen                     | Feature page, section 4 (acceptance criteria); requirement items under [10-requirements/capabilities](../10-requirements/capabilities/)                                                                  |
| How do I test it by hand               | [70-qa/start-here/how-to-test-like-a-human.md](../70-qa/start-here/how-to-test-like-a-human.md), then [70-qa/test-plans](../70-qa/test-plans/) for the app: each item has where to find it and the steps |
| Test scenarios and edge cases          | Feature page, sections 8 and 9                                                                                                                                                                           |
| Where do I record a result or a defect | `70-qa/results/<app>/results.csv`; `70-qa/defects/found-by-testing.csv`                                                                                                                                  |
| What has never been tested             | [coverage](coverage.md); each feature's Status table                                                                                                                                                     |

## Product and design

| Question                         | Where                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| What is this for and who uses it | Feature page, section 1                                                                                                          |
| The full user journey            | Feature page, section 2                                                                                                          |
| How do Claude and ChatGPT do it  | [50-competitors](../50-competitors/README.md), by topic, with sources and dates                                                  |
| What is decided and what is open | [established requirements](../10-requirements/established-requirements.md); "Unresolved product choices" on each competitor page |
| Where are we behind              | [80-gaps](../80-gaps/README.md); kinds "behind a competitor", "missing compared with Claude or ChatGPT"                          |

## Marketing

Only say a capability exists when its verification status is "seen working" on the app in question. "Built" means the code is there, not that it works.

| Question                                     | Where                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Which capabilities are verified              | `20-features/catalog.json`: `verification` per app equal to "seen working"                                        |
| On which apps is it available                | Feature page Status table; `available_on` edges                                                                   |
| Benefits and use cases                       | Feature page, section 1                                                                                           |
| Limits and conditions (plan, model, mode)    | Feature page, section 7                                                                                           |
| What may we claim about security and privacy | [SYS-security-and-privacy](../40-systems/security-and-privacy.md), which points to the project's claims registers |

## Support and operations

| Question                                | Where                                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The user sees X; what does it mean      | Feature page, section 8 (states and edge cases)                                                                                                                         |
| What does the user's plan or mode allow | Feature page, section 7; [SYS-subscriptions-entitlements-and-usage](../40-systems/subscriptions-entitlements-and-usage.md)                                              |
| Where are the logs and what to look for | Feature page, section 9 ("Where to look when it fails"); [ENG-monitoring](../60-engineering/monitoring.md); [ENG-troubleshooting](../60-engineering/troubleshooting.md) |
| Is it a known problem                   | [80-gaps](../80-gaps/README.md); `70-qa/defects/`                                                                                                                       |
| How do we recover                       | [ENG-recovery](../60-engineering/recovery.md)                                                                                                                           |

---
id: "PLAN-chrome-035"
type: "test-plan"
title: "Chrome · 35. Research workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "35"
---
# Chrome · 35. Research workspace

2 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S35.18 Cancel research.

- **Expected:** The user can cancel a research run; it stops and records that it was cancelled.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension (src, _locales, __tests__, README) for research cancel, stop and run controls. The only research hits are a routing task type 'research' in src/features/cloud-bridge/managedChatRouting.ts and a mode description in _locales/en/messages.json (spAgiWorkDescription). No research-specific cancel control exists in the extension. Generic run stop code exists (src/features/side-panel/chat-state.ts, computerUsePanel.ts, label 'Stop' in spTasksStop) but it is not research-specific, so it was not used as a path.
- **Needs:** live-web

## S35.25 Research-history list.

- **Expected:** The user can browse a list of past research reports and reopen one.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. Searched apps/extension for research history, past reports, reopen and research list terms. No research-history list or reopen control exists in the extension. Research report types live in packages/contracts/types/src/research.ts, which names desktop and web research UI and a mobile viewer, not the Chrome side panel.
- **Needs:** live-web

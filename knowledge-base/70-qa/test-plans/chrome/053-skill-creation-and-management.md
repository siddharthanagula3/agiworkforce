---
id: "PLAN-chrome-053"
type: "test-plan"
title: "Chrome · 53. Skill creation and management"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "53"
---
# Chrome · 53. Skill creation and management

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S53.18 Automatic relevance-based invocation.

- **Expected:** Without being asked, the product loads a skill whose description matches the user's request.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6916; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:825 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5442; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** no screen of its own. The auto-match runs on the server, not in apps/extension: applyImplicitManagedSkillOffer and selectOfferedSkills (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082 and :5442, skill-offer.ts) add relevant skills to the system prompt on every surface except vscode, cli and api, so chrome is included. The extension only sends an explicit skillName chosen by hand (apps/extension/src/side_panel.ts:15157-15180). The side panel does not show any message that a skill was matched, and I did not confirm how the result is labelled in the reply. The Code line's side_panel.ts:6916 points at unrelated keepalive code, and the freeTrialClient.ts:825 quote could not be found; neither affects this item.
- **Needs:** a Free account or a paid account, plus a skill whose description matches the request
- **Steps:**
  1. Make sure the account has skills of its own or in the catalog, and that the workspace allows skills.
  2. Open the AGI side panel and send a request that closely matches the description of one skill, without choosing a skill in the Attach menu (the Skills entry, labelled "Skills", must stay unchecked).
  3. Look at the reply: it should use the matching skill's behaviour, as the skill would be applied without being asked. Compare with Expected.

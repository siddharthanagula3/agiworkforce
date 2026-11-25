---
id: "PLAN-chrome-108"
type: "test-plan"
title: "Chrome · 108. Specialist workspaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "108"
---
# Chrome · 108. Specialist workspaces

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S108.19 Contract review.

- **Expected:** A contract-review flow extracts clauses, flags risks and suggests redlines against a playbook.
- **Code:** done. Evidence present: .agents/skills/review-contract/SKILL.md:3; .agents/skills/triage-nda/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/lib/services/skill-catalog-service.ts:192; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082; THIRD_PARTY_LICENSES.md:251
- **Where to find it:** not found in the code. Searched apps/extension/src for contract, clause, redline, playbook and review terms and found nothing. The review-contract skill exists only in .agents/skills/review-contract/SKILL.md and the web skill catalog (apps/web/lib/services/skill-catalog-service.ts). The extension's Skills menu (side_panel.ts, label "Skills") lists only the account's own skills ("No skills of your own yet."), and I found no path that runs a bundled skill from the extension.
- **Needs:** unknown

## S108.27 Customer-support workflows.

- **Expected:** The user runs customer-support workflows (triage, reply, update tickets) from the product.
- **Code:** done. Evidence present: .agents/skills/ticket-triage/SKILL.md:3; .agents/skills/draft-response/SKILL.md:3; .agents/skills/customer-escalation/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** not found in the code. Searched apps/extension/src and _locales/en/messages.json for ticket, escalation, reply and support-workflow terms and found nothing. The ticket-triage, draft-response and customer-escalation skills exist only in .agents/skills and the web skill catalog. The extension's Skills menu shows only the account's own skills, so no extension path for these workflows was found.
- **Needs:** unknown

## S108.28 HR and recruiting workflows.

- **Expected:** The user runs HR/recruiting workflows (job posts, candidate pipeline, interviews) from the product.
- **Code:** done. Evidence present: .agents/skills/recruiting-pipeline/SKILL.md:3; .agents/skills/interview-prep/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** not found in the code. Searched apps/extension/src and _locales/en/messages.json for recruiting, interview, candidate and job-post terms and found nothing. The recruiting-pipeline and interview-prep skills exist only in .agents/skills and the web skill catalog. The extension's Skills menu shows only the account's own skills, so no extension path for these workflows was found.
- **Needs:** unknown

## S108.31 Shopping comparisons.

- **Expected:** The user compares products for purchase (specs, prices, merchants) in a structured comparison.
- **Code:** done. Evidence moved: apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1182 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:249; apps/extension/src/features/side-panel/interactiveCards.ts:316; apps/extension/src/features/side-panel/interactiveCards.ts:271; apps/extension/src/features/side-panel/interactiveCards.ts:287
- **Where to find it:** Chat: type a request in the message box to compare products, then look for the comparison card in the answer. There is no menu for this; the card appears only when the model chooses to send a product-comparison card. (labels found in the code)
- **Steps:**
  1. Sign in and open the side panel chat.
  2. Type a request such as comparing two or three named products by specs and price, then send it.
  3. Wait for the answer to finish streaming.
  4. Look for a card with a table whose first column heading is "Spec" and whose product columns each show a price, sources and a "View product" or "Buy at" link. Compare it with Expected: specs, prices and merchants shown in a structured comparison.

## S108.33 Travel planning and reservations.

- **Expected:** The user plans a trip (itinerary, places, routes) and can make reservations from the product.
- **Code:** done. Evidence moved: apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1182 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:247; apps/extension/src/features/side-panel/interactiveCards.ts:109; apps/extension/src/features/side-panel/interactiveCards.ts:142; apps/extension/src/features/side-panel/interactiveCards.ts:165
- **Where to find it:** Chat: type a request in the message box to plan a trip with stops, then look for the itinerary card in the answer. There is no menu for this; the card appears only when the model chooses to send an itinerary card. (labels found in the code)
- **Steps:**
  1. Sign in and open the side panel chat.
  2. Type a trip request with several named places and times, such as a day of stops in one city, then send it.
  3. Wait for the answer to finish streaming.
  4. Look for a card with a "Stops" list (each stop with a time and address) and, if routes resolve, a map and links such as "Driving directions in Google Maps" or "Walking directions in Google Maps". Compare it with Expected: itinerary, places and routes.

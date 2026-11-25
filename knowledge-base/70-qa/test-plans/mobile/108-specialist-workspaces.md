---
id: "PLAN-mobile-108"
type: "test-plan"
title: "Mobile · 108. Specialist workspaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "108"
---
# Mobile · 108. Specialist workspaces

9 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S108.09 Financial research workspace.

- **Expected:** A research workspace for financial questions (markets, instruments, filings) with sourced, cited output.
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/vendor-directory.json:2803; apps/web/lib/connectors/directory/sources/vendor-directory.json:2808; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235
- **Where to find it:** Chat > Message input > Add to chat (+) > Deep research; results appear in Reports (drawer) (labels found in the code)
- **Needs:** a Cloud account on a plan that grants Deep research
- **Steps:**
  1. Sign in and open the Chat tab, in Cloud mode with a model that supports research and search.
  2. Tap the + button (Add to chat) next to Message input.
  3. Look for the Deep research row and switch it on. If the row is missing, the plan or model does not allow it.
  4. Type a financial question, for example about a stock, an ETF or a company's filings, and send.
  5. Open the Reports list from the drawer and open the report.
  6. Compare with Expected: a research answer for markets, instruments or filings, with sources cited.

## S108.10 Company research.

- **Expected:** The user researches a company and gets a sourced profile (business, financials, news, competitors).
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/vendor-directory.json:2803; apps/web/lib/connectors/directory/sources/vendor-directory.json:2808; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235
- **Where to find it:** Chat > Message input > Add to chat (+) > Deep research; results appear in Reports (drawer) (labels found in the code)
- **Needs:** a Cloud account on a plan that grants Deep research
- **Steps:**
  1. Sign in and open the Chat tab in Cloud mode.
  2. Tap the + button (Add to chat), then switch on Deep research.
  3. Type a request for a company profile, for example business, financials, news and competitors, and send.
  4. Open Reports in the drawer and open the new report.
  5. Compare with Expected: a sourced profile of the company covering business, financials, news and competitors.

## S108.17 Legal research workspace.

- **Expected:** A legal-research workspace searches case law and statutes and returns cited authorities.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235; apps/web/lib/connectors/directory/sources/vendor-directory.json:1748; apps/web/lib/connectors/directory/sources/vendor-directory.json:4748; apps/web/lib/connectors/directory/sources/vendor-directory.json:2108; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Chat > Message input > Add to chat (+) > Connectors (for CourtListener, Descrybe, Midpage) or Deep research (labels found in the code)
- **Needs:** a Cloud account; a legal connector may need its own sign-in
- **Steps:**
  1. Sign in and open the Chat tab in Cloud mode.
  2. Tap the + button (Add to chat) and then Connectors.
  3. Turn on a legal connector such as CourtListener.
  4. Back in the chat, type a legal question, for example a case-law search on a point of law, and send.
  5. Compare with Expected: case law and statutes returned with cited authorities.

## S108.19 Contract review.

- **Expected:** A contract-review flow extracts clauses, flags risks and suggests redlines against a playbook.
- **Code:** done. Evidence present: .agents/skills/review-contract/SKILL.md:3; .agents/skills/triage-nda/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/lib/services/skill-catalog-service.ts:192; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082; THIRD_PARTY_LICENSES.md:251
- **Where to find it:** Settings > Customize > Skills > find review-contract > Install > Use in chat (labels found in the code)
- **Needs:** a Cloud account, and a contract file to upload
- **Steps:**
  1. Open Settings and tap Customize (Cloud section).
  2. Tap Skills and find review-contract, or search for it.
  3. Tap Install, then tap Use in chat.
  4. In the chat, send a contract to review and ask for clauses, risks and redlines against a playbook.
  5. Compare with Expected: clauses are extracted, risks flagged and redlines suggested against a playbook.

## S108.20 Scientific research workspace.

- **Expected:** A scientific-research workspace searches literature/papers and produces cited syntheses.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235; apps/web/lib/connectors/directory/sources/vendor-directory.json:1588; apps/web/lib/connectors/directory/sources/vendor-directory.json:388; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Chat > Message input > Add to chat (+) > Connectors (Consensus, alphaXiv) or Deep research (labels found in the code)
- **Needs:** a Cloud account
- **Steps:**
  1. Sign in and open the Chat tab in Cloud mode.
  2. Tap the + button (Add to chat) and then Connectors.
  3. Turn on Consensus or alphaXiv.
  4. Ask a science question, for example for a literature review on a topic, and send.
  5. Compare with Expected: papers are searched and a cited synthesis is returned.

## S108.26 Sales and CRM workflows.

- **Expected:** The user runs sales/CRM workflows (look up and update contacts, deals, pipelines) from the product.
- **Code:** done. Evidence present: .agents/skills/pipeline-review/SKILL.md:3; .agents/skills/deal-review/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Settings > Customize > Skills > find pipeline-review or deal-review > Install > Use in chat (labels found in the code)
- **Needs:** a Cloud account; a CRM connector turned on for live data
- **Steps:**
  1. Open Settings and tap Customize.
  2. Tap Skills, find pipeline-review or deal-review, and tap Install.
  3. Tap Use in chat, or pick the skill from Add to chat > Skills.
  4. Ask for a pipeline review or a deal review of a named opportunity, and send.
  5. Compare with Expected: pipeline or deal health, risks and next actions from CRM data, if a CRM connector is on.

## S108.27 Customer-support workflows.

- **Expected:** The user runs customer-support workflows (triage, reply, update tickets) from the product.
- **Code:** done. Evidence present: .agents/skills/ticket-triage/SKILL.md:3; .agents/skills/draft-response/SKILL.md:3; .agents/skills/customer-escalation/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Settings > Customize > Skills > find ticket-triage, draft-response or customer-escalation > Install > Use in chat (labels found in the code)
- **Needs:** a Cloud account; a sample support ticket text
- **Steps:**
  1. Open Settings and tap Customize.
  2. Tap Skills, find ticket-triage, draft-response or customer-escalation, and tap Install.
  3. Tap Use in chat, or pick the skill from Add to chat > Skills.
  4. Paste a support ticket and ask for triage, a reply or an escalation package, and send.
  5. Compare with Expected: the ticket is triaged, a reply is drafted, or an escalation is packaged.

## S108.28 HR and recruiting workflows.

- **Expected:** The user runs HR/recruiting workflows (job posts, candidate pipeline, interviews) from the product.
- **Code:** done. Evidence present: .agents/skills/recruiting-pipeline/SKILL.md:3; .agents/skills/interview-prep/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Settings > Customize > Skills > find recruiting-pipeline or interview-prep > Install > Use in chat (labels found in the code)
- **Needs:** a Cloud account
- **Steps:**
  1. Open Settings and tap Customize.
  2. Tap Skills, find recruiting-pipeline or interview-prep, and tap Install.
  3. Tap Use in chat, or pick the skill from Add to chat > Skills.
  4. Ask for an interview plan with a scorecard, or a recruiting pipeline update, and send.
  5. Compare with Expected: structured interview questions and a scorecard, or pipeline stage status.

## S108.33 Travel planning and reservations.

- **Expected:** The user plans a trip (itinerary, places, routes) and can make reservations from the product.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/clarifyCard.ts:10 (quoted code not found in the file now); apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1116
- **Where to find it:** Chat > Message input: ask for a trip plan; the itinerary card appears in the reply, with Walking directions in Google Maps as a route link (labels found in the code)
- **Needs:** a Cloud account; the card appears only when the assistant returns one
- **Steps:**
  1. Open the Chat tab in Cloud mode.
  2. Type a trip request with stops and a route, for example a day in a city, and send.
  3. Look for the itinerary card in the reply with a title, a region and a map.
  4. Tap the route link to open Google Maps directions.
  5. Compare with Expected: an itinerary with places and routes. Reservations are not in the code I read.

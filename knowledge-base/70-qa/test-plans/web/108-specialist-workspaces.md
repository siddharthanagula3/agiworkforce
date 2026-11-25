---
id: "PLAN-web-108"
type: "test-plan"
title: "Web · 108. Specialist workspaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "108"
---
# Web · 108. Specialist workspaces

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S108.01 Personal-finance dashboard.

- **Expected:** A personal-finance dashboard shows the user's accounts, balances and spending in one product view.
- **Code:** partial. Evidence present: apps/web/lib/connectors/plaid-config.ts:46
- **Known to be unfinished:** owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now
- **Where to find it:** Address bar > /chat/finance, then the heading Finances (no sidebar entry) (labels found in the code)
- **Needs:** a signed-in account; a linked bank to see balances (bank stays off per owner)
- **Steps:**
  1. Sign in.
  2. Type /chat/finance in the browser address bar and press Enter.
  3. Look for the heading Finances, then the Accounts section.
  4. Compare the accounts and the total under Spending with the Expected line: accounts, balances and spending in one view.

## S108.02 Connected accounts.

- **Expected:** The user links bank/card/investment accounts so the assistant can read balances and transactions.
- **Code:** partial. Evidence present: apps/web/lib/connectors/plaid-config.ts:46
- **Known to be unfinished:** owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now
- **Where to find it:** Address bar > /chat/finance, then Connect a bank account (labels found in the code)
- **Needs:** a signed-in account; a bank login only if Plaid is live (owner says bank stays off)
- **Steps:**
  1. Sign in and open /chat/finance in the address bar.
  2. Click Connect a bank account (shown when no bank is linked).
  3. It opens the connections page at /settings/connections.
  4. If a bank is linked, look for Linked banks with its name and a Remove bank button.

## S108.03 Spending analysis.

- **Expected:** The product analyses the user's transactions by category and period and shows where money goes.
- **Code:** partial. Evidence present: apps/web/lib/connectors/plaid-config.ts:46
- **Known to be unfinished:** owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now
- **Where to find it:** Address bar > /chat/finance, then the period button Last 90 days (labels found in the code)
- **Needs:** a signed-in account with a linked bank that has transactions
- **Steps:**
  1. Open /chat/finance in the address bar.
  2. Click Last 90 days (also Last 30 days and Last 12 months).
  3. Look at the Spending totals, the Accounts count and the by-month and recent sections.
  4. Compare with Expected: spending grouped by category and period.

## S108.09 Financial research workspace.

- **Expected:** A research workspace for financial questions (markets, instruments, filings) with sourced, cited output.
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/vendor-directory.json:2803; apps/web/lib/connectors/directory/sources/vendor-directory.json:2808; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235
- **Where to find it:** Chat > plus button in the message box > Deep Research (labels found in the code)
- **Needs:** none (Deep Research may be limited by plan)
- **Steps:**
  1. Click Chat in the sidebar.
  2. Open the plus menu in the message box.
  3. Turn on Deep Research.
  4. Type a financial question (markets, an instrument, or a filing) and send.
  5. Look for sources or citations in the answer and compare with Expected.

## S108.10 Company research.

- **Expected:** The user researches a company and gets a sourced profile (business, financials, news, competitors).
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/vendor-directory.json:2803; apps/web/lib/connectors/directory/sources/vendor-directory.json:2808; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235
- **Where to find it:** Chat > plus button in the message box > Deep Research (labels found in the code)
- **Steps:**
  1. Click Chat in the sidebar.
  2. Open the plus menu in the message box.
  3. Turn on Deep Research.
  4. Type a question about one company (business, financials, news, competitors) and send.
  5. Look for a profile with sources in the answer and compare with Expected.

## S108.12 Health-record workspace.

- **Expected:** A health-record workspace imports the user's medical records (e.g. via FHIR) and lets them browse and ask about them.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:234 (quoted code not found in the file now)
- **Known to be unfinished:** owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off
- **Where to find it:** Sidebar > Health (shown only when Health is available for the account) (labels found in the code)
- **Needs:** a personal US account with Health enabled; an outside health login for import
- **Steps:**
  1. Sign in to a personal account in a supported region.
  2. Look for Health in the sidebar and click it.
  3. Read the Health heading and the status text.
  4. If Health is unavailable, the page shows the reason text; compare with Expected (import and browse records).

## S108.17 Legal research workspace.

- **Expected:** A legal-research workspace searches case law and statutes and returns cited authorities.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235; apps/web/lib/connectors/directory/sources/vendor-directory.json:1748; apps/web/lib/connectors/directory/sources/vendor-directory.json:4748; apps/web/lib/connectors/directory/sources/vendor-directory.json:2108; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Chat > plus button in the message box > Deep Research (labels found in the code)
- **Steps:**
  1. Click Chat in the sidebar.
  2. Open the plus menu and turn on Deep Research.
  3. Type a case-law or statute question and send.
  4. Look for cited authorities in the answer and compare with Expected.

## S108.19 Contract review.

- **Expected:** A contract-review flow extracts clauses, flags risks and suggests redlines against a playbook.
- **Code:** done. Evidence present: .agents/skills/review-contract/SKILL.md:3; .agents/skills/triage-nda/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/lib/services/skill-catalog-service.ts:192; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082; THIRD_PARTY_LICENSES.md:251
- **Where to find it:** Chat > type / in the message box > Skills group > review-contract (labels found in the code)
- **Needs:** a contract file to upload
- **Steps:**
  1. Click Chat in the sidebar.
  2. Type / in the message box and find the Skills group.
  3. Choose review-contract and attach or paste a contract, then send.
  4. Look for clause extraction, risk flags and suggested redlines; compare with Expected.

## S108.20 Scientific research workspace.

- **Expected:** A scientific-research workspace searches literature/papers and produces cited syntheses.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235; apps/web/lib/connectors/directory/sources/vendor-directory.json:1588; apps/web/lib/connectors/directory/sources/vendor-directory.json:388; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Chat > plus button in the message box > Deep Research (labels found in the code)
- **Steps:**
  1. Click Chat in the sidebar.
  2. Open the plus menu and turn on Deep Research.
  3. Type a literature question and send.
  4. Look for cited papers and a synthesis in the answer; compare with Expected.

## S108.22 Reproducible research environments.

- **Expected:** A research environment runs code/notebooks in a pinned environment that can be re-run to reproduce results.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.tsx:2666; apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.ts:50; apps/web/lib/e2b/templates.ts:144
- **Where to find it:** Address bar > /code, then start a new session with Code Interpreter (labels found in the code)
- **Steps:**
  1. Open /code in the address bar.
  2. Start a new session and choose Code Interpreter.
  3. Click Add cell, type a short Python line, then click Run all.
  4. Run all again and compare the output with Expected (same result on re-run).

## S108.23 Education/teacher workspace.

- **Expected:** An education workspace for teachers and learners (classes, assignments, guided study).
- **Code:** done. Evidence moved: apps/web/app/chat/study/page.tsx:15; apps/web/features/study/lib/study-session.ts:9 (quoted code not found in the file now); apps/web/app/api/study/sessions/route.ts:117
- **Where to find it:** Sidebar > Study (labels found in the code)
- **Steps:**
  1. Click Study in the sidebar.
  2. Type a topic in the box, choose the level and mode, then click Start studying.
  3. Look for guided, one-idea-at-a-time study in the session.
  4. Compare with Expected: a teacher or learner workspace with classes and assignments.

## S108.24 Curriculum and lesson generation.

- **Expected:** The product generates curricula and lesson plans (objectives, activities, materials) as structured output.
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/vendor-directory.json:1048; apps/web/lib/connectors/directory/sources/vendor-directory.json:1688; apps/web/app/chat/study/page.tsx:15; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Sidebar > Study, then Start studying (labels found in the code)
- **Steps:**
  1. Click Study in the sidebar.
  2. Type a subject and choose a level, then click Start studying.
  3. Look for a study plan generated for the topic.
  4. Compare with Expected: objectives, activities and materials.

## S108.26 Sales and CRM workflows.

- **Expected:** The user runs sales/CRM workflows (look up and update contacts, deals, pipelines) from the product.
- **Code:** done. Evidence present: .agents/skills/pipeline-review/SKILL.md:3; .agents/skills/deal-review/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Chat > type / in the message box > Skills group > pipeline-review (labels found in the code)
- **Needs:** a CRM connector connected in Settings
- **Steps:**
  1. Click Chat in the sidebar.
  2. Type / in the message box and find the Skills group.
  3. Choose pipeline-review (or deal-review) and send a request about your pipeline.
  4. Compare the answer with Expected: looking up and updating contacts, deals and pipelines.

## S108.27 Customer-support workflows.

- **Expected:** The user runs customer-support workflows (triage, reply, update tickets) from the product.
- **Code:** done. Evidence present: .agents/skills/ticket-triage/SKILL.md:3; .agents/skills/draft-response/SKILL.md:3; .agents/skills/customer-escalation/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Chat > type / in the message box > Skills group > ticket-triage (labels found in the code)
- **Needs:** a support ticket text to paste; a support connector for updates
- **Steps:**
  1. Click Chat in the sidebar.
  2. Type / in the message box and find the Skills group.
  3. Choose ticket-triage, paste a ticket, and send.
  4. Compare the answer with Expected: triage, reply drafting and ticket updates (draft-response and customer-escalation are in the same group).

## S108.28 HR and recruiting workflows.

- **Expected:** The user runs HR/recruiting workflows (job posts, candidate pipeline, interviews) from the product.
- **Code:** done. Evidence present: .agents/skills/recruiting-pipeline/SKILL.md:3; .agents/skills/interview-prep/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Chat > type / in the message box > Skills group > recruiting-pipeline (labels found in the code)
- **Steps:**
  1. Click Chat in the sidebar.
  2. Type / in the message box and find the Skills group.
  3. Choose recruiting-pipeline or interview-prep and send a request.
  4. Compare the answer with Expected: job posts, candidate pipeline and interview plans.

## S108.29 Marketing and campaign workflows.

- **Expected:** The user runs marketing/campaign workflows (audiences, campaigns, assets, analytics) from the product.
- **Code:** done. Evidence moved: skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082; apps/web/lib/connectors/directory/sources/vendor-directory.json:968 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/vendor-directory.json:168
- **Where to find it:** Chat > type / in the message box > Skills group > marketing-plan (labels found in the code)
- **Needs:** none; analytics connectors for live data
- **Steps:**
  1. Click Chat in the sidebar.
  2. Type / in the message box and find the Skills group.
  3. Choose marketing-plan (also seo-audit, social, analytics are in .agents/skills) and send a request.
  4. Compare the answer with Expected: audiences, campaigns, assets and analytics.

## S108.31 Shopping comparisons.

- **Expected:** The user compares products for purchase (specs, prices, merchants) in a structured comparison.
- **Code:** done. Evidence moved: apps/web/lib/services/product-comparison-tool-service.ts:45; apps/web/lib/services/product-comparison-tool-service.ts:85; apps/web/lib/services/product-comparison-tool-service.ts:227; apps/web/lib/services/product-comparison-tool-service.ts:369; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:975; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5530; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2483; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4689; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4758; packages/contracts/cloud-contracts/src/interactive-cards.ts:543; apps/web/lib/hooks/useChatStream.ts:1347; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:52; apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx:59; apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx:111; apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx:128 (quoted code not found in the file now)
- **Where to find it:** Chat: ask the assistant to compare products in the message box (labels found in the code)
- **Steps:**
  1. Click Chat in the sidebar.
  2. Type a request to compare two or three products by specs and price, and send.
  3. Look for a product comparison card with specs, prices and merchants.
  4. Click View product on a row and compare with Expected.

## S108.33 Travel planning and reservations.

- **Expected:** The user plans a trip (itinerary, places, routes) and can make reservations from the product.
- **Code:** done. Evidence moved: apps/web/lib/places/itinerary-tool.ts:66; apps/web/lib/places/itinerary-tool.ts:102; apps/web/lib/places/itinerary-tool.ts:264; apps/web/lib/places/itinerary-tool.ts:362; apps/web/lib/places/itinerary-tool.ts:493; apps/web/lib/places/itinerary-tool.ts:217; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1359; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1364; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4299 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2643; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts:91; apps/web/lib/hooks/useChatStream.ts:1338; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:46; apps/web/features/chat/components/messages/cards/ItineraryCard.tsx:64; apps/web/features/chat/components/messages/cards/ItineraryCard.tsx:228; packages/contracts/cloud-contracts/src/interactive-cards.ts:279; apps/web/lib/connectors/directory/sources/vendor-directory.json:928; apps/web/lib/connectors/directory/sources/vendor-directory.json:2608; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Chat: ask the assistant to plan a trip in the message box (labels found in the code)
- **Steps:**
  1. Click Chat in the sidebar.
  2. Type a trip request (places and a route) and send.
  3. Look for an itinerary card with stops and a map.
  4. Open a directions link (for example Walking directions in Google Maps) and compare with Expected.

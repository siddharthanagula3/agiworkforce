---
id: "PLAN-desktop-108"
type: "test-plan"
title: "Desktop · 108. Specialist workspaces"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "108"
---
# Desktop · 108. Specialist workspaces

18 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S108.01 Personal-finance dashboard.

- **Expected:** A personal-finance dashboard shows the user's accounts, balances and spending in one product view.
- **Code:** partial. Evidence present: apps/web/lib/connectors/plaid-config.ts:46
- **Known to be unfinished:** owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now
- **Where to find it:** not found in the code. The Finances page exists at /chat/finance (heading 'Finances', apps/web/features/finance/components/FinanceDashboard.tsx:356) and shows accounts, 'Where your money went' and 'By month' only once a bank is linked. No sidebar, menu or palette entry for it was found; it is reached only by typing the address or from a toast after a bank connects. Searched: 'Finances', '/chat/finance', 'FINANCE_PAGE_HREF'.
- **Needs:** none (no bank can be connected yet, so the page has no data to show)

## S108.02 Connected accounts.

- **Expected:** The user links bank/card/investment accounts so the assistant can read balances and transactions.
- **Code:** partial. Evidence present: apps/web/lib/connectors/plaid-config.ts:46
- **Known to be unfinished:** owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now
- **Where to find it:** Settings > Connectors > Bank accounts (labels found in the code)
- **Steps:**
  1. Open Settings and click Connectors in the list on the left.
  2. Find the card named Bank accounts.
  3. Look at its button: it reads Coming soon and does not start a link. Expected says the user links accounts, which cannot be done yet.

## S108.03 Spending analysis.

- **Expected:** The product analyses the user's transactions by category and period and shows where money goes.
- **Code:** partial. Evidence present: apps/web/lib/connectors/plaid-config.ts:46
- **Known to be unfinished:** owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now
- **Where to find it:** not found in the code. Spending by category ('Where your money went') and by month ('By month') are on the Finances page at /chat/finance (apps/web/features/finance/components/FinanceDashboard.tsx:180, :216), but that page has no sidebar or menu entry and needs linked bank data, which cannot be connected yet. Searched: 'Where your money went', 'By month', 'Finances'.

## S108.09 Financial research workspace.

- **Expected:** A research workspace for financial questions (markets, instruments, filings) with sourced, cited output.
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/vendor-directory.json:2803; apps/web/lib/connectors/directory/sources/vendor-directory.json:2808; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235
- **Where to find it:** Chat composer > More composer options > Deep Research (labels found in the code)
- **Needs:** a paid plan (on Free the row shows 'Upgrade to use Deep Research')
- **Steps:**
  1. In a new chat, pick a model; open the composer's options menu (its panel is labelled More composer options).
  2. Turn on the row Deep Research.
  3. Type a financial question, for example about a listed company's filings or a market instrument, and send.
  4. Watch the run: a plan, several search rounds, then a final answer with its sources listed. Compare with Expected: sourced, cited output.

## S108.10 Company research.

- **Expected:** The user researches a company and gets a sourced profile (business, financials, news, competitors).
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/vendor-directory.json:2803; apps/web/lib/connectors/directory/sources/vendor-directory.json:2808; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235
- **Where to find it:** Chat composer > More composer options > Deep Research (labels found in the code)
- **Needs:** a paid plan
- **Steps:**
  1. In a new chat, pick a model; open the composer's options menu (panel labelled More composer options).
  2. Turn on the row Deep Research.
  3. Type a request such as 'Research [company name]: business, financials, recent news and competitors' and send.
  4. Compare the answer with Expected: business, financials, news and competitors, each with sources.

## S108.12 Health-record workspace.

- **Expected:** A health-record workspace imports the user's medical records (e.g. via FHIR) and lets them browse and ask about them.
- **Code:** partial. Evidence moved: apps/web/lib/connectors/oauth-scope-allowlist.ts:234 (quoted code not found in the file now)
- **Known to be unfinished:** owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off
- **Where to find it:** Sidebar > Health (some labels not found in the code; trust the screen)
- **Needs:** a Health-enabled account (owner has said Health stays off)
- **Steps:**
  1. Look for Health in the left sidebar. It shows only when the server enables Health for the account; if it is not there, this item cannot be reached.
  2. Click Health.
  3. Read the heading Health and its sentence about chats and training.
  4. Look for a control that imports medical records. None was found on this page; the records connector is Coming soon. Compare with Expected: browse and ask about imported records.

## S108.17 Legal research workspace.

- **Expected:** A legal-research workspace searches case law and statutes and returns cited authorities.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235; apps/web/lib/connectors/directory/sources/vendor-directory.json:1748; apps/web/lib/connectors/directory/sources/vendor-directory.json:4748; apps/web/lib/connectors/directory/sources/vendor-directory.json:2108; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Chat composer > More composer options > Deep Research (labels found in the code)
- **Needs:** a paid plan
- **Steps:**
  1. In a new chat, pick a model; open the composer's options menu (panel labelled More composer options).
  2. Turn on the row Deep Research.
  3. Type a legal question, for example about a case or statute, and send.
  4. Compare with Expected: case law and statutes searched, with cited authorities listed.

## S108.19 Contract review.

- **Expected:** A contract-review flow extracts clauses, flags risks and suggests redlines against a playbook.
- **Code:** done. Evidence present: .agents/skills/review-contract/SKILL.md:3; .agents/skills/triage-nda/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/lib/services/skill-catalog-service.ts:192; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082; THIRD_PARTY_LICENSES.md:251
- **Where to find it:** Chat composer > More composer options > Skills > review-contract (labels found in the code)
- **Needs:** a contract file or text, and your own playbook
- **Steps:**
  1. Open the composer's options menu (panel labelled More composer options) and click Skills.
  2. Pick review-contract if it is listed for the account.
  3. Attach the contract with Add photos & files, or paste its text, and send.
  4. Compare with Expected: clause-by-clause findings, flagged risks and suggested redlines against the playbook you supply.

## S108.20 Scientific research workspace.

- **Expected:** A scientific-research workspace searches literature/papers and produces cited syntheses.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1307; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235; apps/web/lib/connectors/directory/sources/vendor-directory.json:1588; apps/web/lib/connectors/directory/sources/vendor-directory.json:388; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Chat composer > More composer options > Deep Research (labels found in the code)
- **Needs:** a paid plan
- **Steps:**
  1. In a new chat, pick a model; open the composer's options menu (panel labelled More composer options).
  2. Turn on the row Deep Research.
  3. Type a research question on a scientific topic and send.
  4. Compare with Expected: literature searched and a synthesis with cited papers.

## S108.22 Reproducible research environments.

- **Expected:** A research environment runs code/notebooks in a pinned environment that can be re-run to reproduce results.
- **Code:** done. Evidence present: apps/web/features/code/CloudCodePage.tsx:2666; apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.ts:50; apps/web/lib/e2b/templates.ts:144
- **Where to find it:** not found in the code. The Code page is at /code (packages/contracts/types/src/cloud-code.ts:325) and is reached from the sidebar Code control (packages/ui/ui/src/sidebar/Sidebar.tsx). A notebook panel (aria-label 'Notebook', apps/web/features/notebook/NotebookPanel.tsx) appears only for a session whose runtime is code-interpreter-v1, and no control that starts such a session was found. Searched: 'notebook', 'NOTEBOOK_TEMPLATE_ID', 'Python' in apps/web/features/code.

## S108.23 Education/teacher workspace.

- **Expected:** An education workspace for teachers and learners (classes, assignments, guided study).
- **Code:** done. Evidence moved: apps/web/app/chat/study/page.tsx:15; apps/web/features/study/lib/study-session.ts:9 (quoted code not found in the file now); apps/web/app/api/study/sessions/route.ts:117
- **Where to find it:** Sidebar > Study (labels found in the code)
- **Steps:**
  1. Click Study in the left sidebar.
  2. Type a subject in What are you studying? and pick a mode under How: Learn it, Practise it or Revise it.
  3. Pick a level under Where you are with it and click Start studying.
  4. Compare with Expected: a chat opens for that subject and the session appears under Your sessions. No classes or assignments screen was found.

## S108.24 Curriculum and lesson generation.

- **Expected:** The product generates curricula and lesson plans (objectives, activities, materials) as structured output.
- **Code:** done. Evidence present: apps/web/lib/connectors/directory/sources/vendor-directory.json:1048; apps/web/lib/connectors/directory/sources/vendor-directory.json:1688; apps/web/app/chat/study/page.tsx:15; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Sidebar > Study > Start with a personal study plan (labels found in the code)
- **Steps:**
  1. Click Study in the left sidebar and type a subject.
  2. Tick Start with a personal study plan and click Start studying.
  3. In the chat, the request to build a plan is filled into the message box; send it.
  4. Compare with Expected: an ordered plan of what to cover, time for each part and how understanding is checked. The output is chat text, not a structured curriculum with objectives, activities and materials.

## S108.26 Sales and CRM workflows.

- **Expected:** The user runs sales/CRM workflows (look up and update contacts, deals, pipelines) from the product.
- **Code:** done. Evidence present: .agents/skills/pipeline-review/SKILL.md:3; .agents/skills/deal-review/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Chat composer > More composer options > Skills > pipeline-review (labels found in the code)
- **Needs:** none for the guidance; a CRM connection for live data (not available)
- **Steps:**
  1. Open the composer's options menu (panel labelled More composer options) and click Skills.
  2. Pick pipeline-review or deal-review if listed.
  3. Ask for a pipeline health check, for example 'review my pipeline', and send.
  4. Compare with Expected: coverage, aging and at-risk deals. Expected also says contacts and deals are looked up and updated; that needs a CRM connector, and HubSpot and Salesforce show Coming soon.

## S108.27 Customer-support workflows.

- **Expected:** The user runs customer-support workflows (triage, reply, update tickets) from the product.
- **Code:** done. Evidence present: .agents/skills/ticket-triage/SKILL.md:3; .agents/skills/draft-response/SKILL.md:3; .agents/skills/customer-escalation/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Chat composer > More composer options > Skills > ticket-triage (labels found in the code)
- **Needs:** a support ticket text
- **Steps:**
  1. Open the composer's options menu and click Skills.
  2. Pick ticket-triage (or draft-response, customer-escalation) if listed.
  3. Paste a support ticket and send.
  4. Compare with Expected: priority, owning team and a draft reply. Expected also says tickets are updated in a ticket system, which needs a connector (Intercom shows Coming soon).

## S108.28 HR and recruiting workflows.

- **Expected:** The user runs HR/recruiting workflows (job posts, candidate pipeline, interviews) from the product.
- **Code:** done. Evidence present: .agents/skills/recruiting-pipeline/SKILL.md:3; .agents/skills/interview-prep/SKILL.md:3; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082
- **Where to find it:** Chat composer > More composer options > Skills > recruiting-pipeline (labels found in the code)
- **Steps:**
  1. Open the composer's options menu and click Skills.
  2. Pick recruiting-pipeline or interview-prep if listed.
  3. Type 'interview plan for [role]' or 'recruiting update' and send.
  4. Compare with Expected: candidate stages, interview questions and scorecards from the chat answer.

## S108.29 Marketing and campaign workflows.

- **Expected:** The user runs marketing/campaign workflows (audiences, campaigns, assets, analytics) from the product.
- **Code:** done. Evidence moved: skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; skills-lock.json:19; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082; apps/web/lib/connectors/directory/sources/vendor-directory.json:968 (quoted code not found in the file now); apps/web/lib/connectors/directory/sources/vendor-directory.json:168
- **Where to find it:** Chat composer > More composer options > Skills (labels found in the code)
- **Steps:**
  1. Open the composer's options menu and click Skills.
  2. Pick a marketing skill if listed (for example marketing-plan or copywriting).
  3. Send a campaign request in chat.
  4. Compare with Expected: audiences, campaigns, assets and analytics. Only written advice is produced; no campaign, audience or analytics screen was found.

## S108.31 Shopping comparisons.

- **Expected:** The user compares products for purchase (specs, prices, merchants) in a structured comparison.
- **Code:** done. Evidence moved: apps/web/lib/services/product-comparison-tool-service.ts:45; apps/web/lib/services/product-comparison-tool-service.ts:85; apps/web/lib/services/product-comparison-tool-service.ts:227; apps/web/lib/services/product-comparison-tool-service.ts:369; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:975; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5530; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2483; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4689; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4758; packages/contracts/cloud-contracts/src/interactive-cards.ts:543; apps/web/lib/hooks/useChatStream.ts:1347; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:52; apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx:59; apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx:111; apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx:128 (quoted code not found in the file now)
- **Where to find it:** Chat > type a buying question and send (no button) (labels found in the code)
- **Needs:** a model that can search the web
- **Steps:**
  1. In a new chat with a model that can search the web, type a buying question with compare or which and a price word, for example 'Compare two or three specific headphones under $400 and tell me which to buy', and send.
  2. Wait for a card titled with the comparison, showing each product with its price, store and a buy link.
  3. Check the Spec table under the cards and the 'Prices checked' line.
  4. Compare with Expected: side-by-side specs, prices and merchants.

## S108.33 Travel planning and reservations.

- **Expected:** The user plans a trip (itinerary, places, routes) and can make reservations from the product.
- **Code:** done. Evidence moved: apps/web/lib/places/itinerary-tool.ts:66; apps/web/lib/places/itinerary-tool.ts:102; apps/web/lib/places/itinerary-tool.ts:264; apps/web/lib/places/itinerary-tool.ts:362; apps/web/lib/places/itinerary-tool.ts:493; apps/web/lib/places/itinerary-tool.ts:217; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1359; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1364; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4299 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2643; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts:91; apps/web/lib/hooks/useChatStream.ts:1338; apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:46; apps/web/features/chat/components/messages/cards/ItineraryCard.tsx:64; apps/web/features/chat/components/messages/cards/ItineraryCard.tsx:228; packages/contracts/cloud-contracts/src/interactive-cards.ts:279; apps/web/lib/connectors/directory/sources/vendor-directory.json:928; apps/web/lib/connectors/directory/sources/vendor-directory.json:2608; apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Chat > type a trip request and send (no button) (labels found in the code)
- **Steps:**
  1. In a new chat, type 'Plan a day trip in Rome' and send.
  2. Wait for an itinerary card with numbered stops on a map and a route.
  3. Open a route link: the labels read Walking directions in Google Maps or Driving directions in Google Maps.
  4. Compare with Expected: itinerary, places and routes. Reservations are not made here; the assistant only points to Settings, under Connectors, to connect a booking connector (Booking.com and Expedia show Coming soon).

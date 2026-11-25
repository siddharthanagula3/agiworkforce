# Area 108. Specialist workspaces

35 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S108.01 Personal-finance dashboard.
- Should: A personal-finance dashboard shows the user's accounts, balances and spending in one product view.
- Status: web partial, desktop partial, mobile missing, chrome missing
- Code: apps/web/lib/connectors/plaid-config.ts:32
- Unfinished: web: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now | desktop: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now

## S108.02 Connected accounts.
- Should: The user links bank/card/investment accounts so the assistant can read balances and transactions.
- Status: web partial, desktop partial, mobile missing, chrome missing
- Code: apps/web/lib/connectors/plaid-config.ts:32
- Unfinished: web: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now | desktop: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now

## S108.03 Spending analysis.
- Should: The product analyses the user's transactions by category and period and shows where money goes.
- Status: web partial, desktop partial, mobile missing, chrome missing
- Code: apps/web/lib/connectors/plaid-config.ts:32
- Unfinished: web: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now | desktop: owner: sign Plaid's agreement, get production transactions access, finish the Dashboard compliance center and GLBA Safeguards legal review, then set PLAID_CLIENT_ID, PLAID_SECRET and PLAID_ENV (apps/web/lib/connectors/plaid-config.ts:32); owner has said bank stays off for now

## S108.04 Budget planning.
- Should: The user sets budgets by category and the product tracks them against actual spending.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.05 Net-worth view.
- Should: The product shows net worth as assets minus liabilities across the user's linked accounts.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.06 Financial-document explanation.
- Should: A dedicated flow explains a financial document (statement, bill, tax form) with extracted fields and plain-language terms.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.07 Credit-report view.
- Should: The user can view their credit report (accounts, inquiries, derogatory marks) in the product.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.08 Credit-score history.
- Should: The product shows the user's credit score over time.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.09 Financial research workspace.
- Should: A research workspace for financial questions (markets, instruments, filings) with sourced, cited output.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/lib/connectors/directory/sources/vendor-directory.json:2843; apps/web/lib/connectors/directory/sources/vendor-directory.json:2848; apps/web/app/api/llm/v1/chat/completions/route.ts:798; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:877; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:116

## S108.10 Company research.
- Should: The user researches a company and gets a sourced profile (business, financials, news, competitors).
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/lib/connectors/directory/sources/vendor-directory.json:2843; apps/web/lib/connectors/directory/sources/vendor-directory.json:2848; apps/web/app/api/llm/v1/chat/completions/route.ts:798; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:877; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:116

## S108.11 Earnings and filing analysis.
- Should: The product pulls earnings releases, transcripts or SEC filings and analyses them.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.12 Health-record workspace.
- Should: A health-record workspace imports the user's medical records (e.g. via FHIR) and lets them browse and ask about them.
- Status: web partial, desktop partial, mobile missing, chrome missing
- Code: apps/web/lib/connectors/oauth-scope-allowlist.ts:234
- Unfinished: web: owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off | desktop: owner: HealthEx agreement and FTC Health Breach Notification Rule legal sign-off, register a client at api.healthex.io/oauth/register and add the healthex entry with CONNECTOR_OAUTH_HEALTHEX_CLIENT_ID; owner has said Health stays off

## S108.13 Health timeline.
- Should: The product shows a chronological timeline of the user's health events (visits, diagnoses, meds, labs).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.14 Lab-result explanation.
- Should: The user uploads or imports lab results and gets a structured explanation (ranges, flags, trends).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.15 Wearable-data summaries.
- Should: The product imports wearable data (HealthKit, Health Connect, Fitbit, etc.) and summarises it.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.16 Appointment preparation.
- Should: A flow helps the user prepare for a medical appointment (symptom summary, questions, records).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.17 Legal research workspace.
- Should: A legal-research workspace searches case law and statutes and returns cited authorities.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:877; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:116; apps/web/lib/connectors/directory/sources/vendor-directory.json:1788; apps/web/lib/connectors/directory/sources/vendor-directory.json:4828; apps/web/lib/connectors/directory/sources/vendor-directory.json:2148; apps/web/app/api/llm/v1/chat/completions/route.ts:798

## S108.18 Matter/document organization.
- Should: Documents are organised by legal matter (client/matter records, per-matter files and history).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.19 Contract review.
- Should: A contract-review flow extracts clauses, flags risks and suggests redlines against a playbook.
- Status: web done, desktop done, mobile done, chrome done
- Code: .agents/skills/review-contract/SKILL.md:3; .agents/skills/triage-nda/SKILL.md:3; skills-lock.json:595; skills-lock.json:691; apps/web/lib/services/skill-catalog-service.ts:153; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:748; THIRD_PARTY_LICENSES.md:196

## S108.20 Scientific research workspace.
- Should: A scientific-research workspace searches literature/papers and produces cited syntheses.
- Status: web done, desktop done, mobile done, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2; apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:877; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:116; apps/web/lib/connectors/directory/sources/vendor-directory.json:1628; apps/web/lib/connectors/directory/sources/vendor-directory.json:388; apps/web/app/api/llm/v1/chat/completions/route.ts:798

## S108.21 Literature/source management.
- Should: The user keeps a library of sources/papers (import, tag, cite, export BibTeX) inside the product.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.22 Reproducible research environments.
- Should: A research environment runs code/notebooks in a pinned environment that can be re-run to reproduce results.
- Status: web done, desktop done, mobile missing, chrome missing
- Code: apps/web/features/code/CloudCodePage.tsx:1122; apps/web/app/api/code/sessions/[sessionId]/notebook/execute/route.ts:63; apps/web/lib/e2b/templates.ts:139

## S108.23 Education/teacher workspace.
- Should: An education workspace for teachers and learners (classes, assignments, guided study).
- Status: web done, desktop done, mobile missing, chrome missing
- Code: apps/web/app/chat/study/page.tsx:1; apps/web/features/study/lib/study-session.ts:9; apps/web/app/api/study/sessions/route.ts:69

## S108.24 Curriculum and lesson generation.
- Should: The product generates curricula and lesson plans (objectives, activities, materials) as structured output.
- Status: web done, desktop done, mobile missing, chrome missing
- Code: apps/web/lib/connectors/directory/sources/vendor-directory.json:1028; apps/web/lib/connectors/directory/sources/vendor-directory.json:1728; apps/web/app/chat/study/page.tsx:15; apps/web/app/api/llm/v1/chat/completions/route.ts:798

## S108.25 Business operations workspace.
- Should: A business-operations workspace brings company ops data and routines (finance, ops, tasks) into one view.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.26 Sales and CRM workflows.
- Should: The user runs sales/CRM workflows (look up and update contacts, deals, pipelines) from the product.
- Status: web done, desktop done, mobile done, chrome missing
- Code: .agents/skills/pipeline-review/SKILL.md:3; .agents/skills/deal-review/SKILL.md:3; skills-lock.json:491; skills-lock.json:243; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:739; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:748

## S108.27 Customer-support workflows.
- Should: The user runs customer-support workflows (triage, reply, update tickets) from the product.
- Status: web done, desktop done, mobile done, chrome done
- Code: .agents/skills/ticket-triage/SKILL.md:3; .agents/skills/draft-response/SKILL.md:3; .agents/skills/customer-escalation/SKILL.md:3; skills-lock.json:683; skills-lock.json:275; skills-lock.json:219; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:748

## S108.28 HR and recruiting workflows.
- Should: The user runs HR/recruiting workflows (job posts, candidate pipeline, interviews) from the product.
- Status: web done, desktop done, mobile done, chrome done
- Code: .agents/skills/recruiting-pipeline/SKILL.md:3; .agents/skills/interview-prep/SKILL.md:3; skills-lock.json:555; skills-lock.json:371; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:748

## S108.29 Marketing and campaign workflows.
- Should: The user runs marketing/campaign workflows (audiences, campaigns, assets, analytics) from the product.
- Status: web done, desktop done, mobile missing, chrome missing
- Code: skills-lock.json:427; skills-lock.json:283; skills-lock.json:379; skills-lock.json:51; skills-lock.json:27; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:755; apps/web/lib/connectors/directory/sources/vendor-directory.json:968; apps/web/lib/connectors/directory/sources/vendor-directory.json:168

## S108.30 Engineering/CAD connector workflows.
- Should: The product connects to CAD/engineering tools (Onshape, SolidWorks, Autodesk) and works on models or drawings.
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.31 Shopping comparisons.
- Should: The user compares products for purchase (specs, prices, merchants) in a structured comparison.
- Status: web done, desktop done, mobile missing, chrome done
- Code: apps/web/lib/services/product-comparison-tool-service.ts:45; apps/web/lib/services/product-comparison-tool-service.ts:85; apps/web/lib/services/product-comparison-tool-service.ts:227; apps/web/lib/services/product-comparison-tool-service.ts:352; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:989; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4992; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2165; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3813

## S108.32 Virtual try-on.
- Should: The user uploads a photo and sees garments or products rendered on themselves (virtual try-on).
- Status: web missing, desktop missing, mobile missing, chrome missing

## S108.33 Travel planning and reservations.
- Should: The user plans a trip (itinerary, places, routes) and can make reservations from the product.
- Status: web done, desktop done, mobile done, chrome done
- Code: apps/web/lib/places/itinerary-tool.ts:66; apps/web/lib/places/itinerary-tool.ts:102; apps/web/lib/places/itinerary-tool.ts:264; apps/web/lib/places/itinerary-tool.ts:362; apps/web/lib/places/itinerary-tool.ts:493; apps/web/lib/places/itinerary-tool.ts:217; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:950; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:955

## S108.34 Commerce checkout.
- Should: The assistant completes a purchase for the user (cart, payment, order confirmation) inside the product.
- Status: not applicable anywhere

## S108.35 Customer-service voice agents.
- Should: The user builds or deploys a voice agent that handles customer-service calls (telephony, IVR).
- Status: web missing, desktop missing, mobile missing, chrome missing

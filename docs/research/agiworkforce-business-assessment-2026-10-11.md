# AGI Workforce business idea: sourced assessment and agent critique

Status: Dated research; recommendations are unvalidated hypotheses
Owner: Founder + product leads
Research date: 2026-10-11, America/Chicago
Scope: Product problem, first customer, alternatives, distribution, improvement, communication and purpose

Follow-up: the [October 12 pre-advertising research](agiworkforce-pre-advertising-2026-10-12.md) adds current first-party activity and payment-provenance checks, refreshed competitor offers and commercial gates. Its measured evidence supersedes the unknown account/payment observations below for the fields inspected; this document remains the dated October 11 assessment.

This assesses AGI Workforce as a business. No customer interviews, purchases, outreach, production mutations or live AGI customer tasks were performed. The user chose to continue without MiroFish; no simulation was run or integrated. Current official sources and the repository inform the assessment; agent critiques are analytical perspectives, not sampled consumers or evidence of demand. This document does not change the canonical [product definition](../product/definition.md) or founder decisions.

## Assessment

**Recommendation: test solo B2B research/strategy consultants first, with a recurring vendor or competitor comparison brief.** The business hypothesis is that AGI can reduce the work between receiving approved source material and accepting a usable draft. It must prove that improvement against the customer's existing assistant. A broad collection of AI capabilities is insufficient evidence of a reason to switch.

The market already serves much of this idea. [TypingMind](https://www.typingmind.com/) documents multiple providers, projects, artifacts, agents, BYOK and local chat storage. [AnythingLLM](https://anythingllm.com/) and [Open WebUI](https://openwebui.com/) address local/self-hosted AI control. [Claude's current work overview](https://claude.com/resources/guides/claude-cowork-product-guide/product-overview) describes working with files and producing deliverables. [Relevance AI](https://relevanceai.com/) explicitly uses AI-workforce positioning. These are documented offers, not authenticated feature tests. They show overlap; they do not establish that every particular customer is satisfied.

The opportunity remains **unknown** until a specific person prefers AGI for a repeated job. Neither more models nor a larger simulated crowd resolves that uncertainty.

The founder subsequently reported **no established users yet** on October 11. This supports a first-customer discovery focus. Registration counts, revenue and retention were not queried, and that statement is not treated as a measured zero for each metric.

## What MiroFish would cost

| Component        | Current evidence                                                                         | Consequence for this task                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| MiroFish source  | No software purchase is required; the source is available under its repository license   | Software acquisition is $0; running it requires dependencies                                      |
| Zep Cloud        | Free: 10,000 credits/month, no auto-top-up. Optional Flex: $125/month, with paid top-ups | A small experiment might fit the free quota; this account's access and workload were not verified |
| LLM endpoint     | The reviewed application requires an OpenAI-compatible endpoint and key                  | Cost depends on provider, model, tokens and activity; no verified per-run estimate                |
| Computer/runtime | Local runtime could use this machine; no deployment was made                             | No infrastructure purchase was made                                                               |

Sources: [MiroFish setup at the inspected commit](https://github.com/666ghj/MiroFish/blob/7657031ac01184afe2cb220f5ee3545573b5e843/README.md), [required configuration](https://github.com/666ghj/MiroFish/blob/7657031ac01184afe2cb220f5ee3545573b5e843/backend/app/config.py), and [Zep pricing](https://www.getzep.com/pricing/), checked October 11. If using OpenAI, API billing is separate from ChatGPT subscription billing; a subscription does not itself fund an external MiroFish API run. [OpenAI billing](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform)

A guaranteed $0 MiroFish run has not been demonstrated. No external paid API was called or subscription purchased. Agent work in this session counts toward normal Codex usage and any applicable credits or billing; it is not an external free-compute service. [Codex usage and billing](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)

The reviewed MiroFish runtime also does not establish a spending cap or a measured 1,000-agent capacity. A completed process or polished report would be insufficient proof of meaningful generated activity. These findings are from source inspection, not an execution benchmark. The [LLM wrapper](https://github.com/666ghj/MiroFish/blob/7657031ac01184afe2cb220f5ee3545573b5e843/backend/app/utils/llm_client.py) returns generated content without retaining usage for a total-cost ledger.

## Current offer versus future ambition

Public availability matters more than a capability appearing in source code when choosing a first customer. [AGI's download page](https://agiworkforce.com/download) currently identifies Web as available and Desktop, CLI, Mobile, Chrome and VS Code as coming soon. A read-only check on October 11 found the stable [CLI release API](https://agiworkforce.com/api/releases/cli/latest) and [public Desktop release API](https://agiworkforce.com/api/releases/desktop-cloud/latest) returned 404/no published release. That does not rule out historical binaries or source builds. Working-tree CLI availability declarations disagree with the current public channel; the first-customer recommendation does not depend on an installable CLI.

[Public pricing](https://agiworkforce.com/pricing) includes one project in Free, excludes Deep Research and AGI Work from Free, and warns that free model providers may train on content. Paid access is staged according to the [public about page](https://agiworkforce.com/about) and current checkout implementation. Discovery should use public/redacted material and an approved processing route. A paid-capability pilot first requires actual access; do not promise its availability through the Free trial.

[Projects](https://agiworkforce.com/features/projects) and [AI Chat](https://agiworkforce.com/features/ai-chat) describe instructions, selected references, file attachments and artifacts. This review did not complete a live upload-to-final-deliverable workflow. Source support and public documentation are evidence to test, not proof of reliable end-to-end outcomes.

## Problem and first consumer

The proposed problem is repeated assembly and review of client work: gathering context, comparing sources, checking claims, drafting a recommendation and moving it into a usable document. The important cost is human work through an accepted deliverable, including correction and formatting. The frequency and severity for actual AGI prospects are not yet measured.

| Candidate                                | Plausible recurring job                         | Main reason to defer or choose                                                                                        |
| ---------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| General consumers                        | Everyday questions and writing                  | Many reachable incumbents; no specific switching problem identified                                                   |
| Independent consultants / small agencies | Client brief, comparison, proposal or report    | Test first: a bounded browser-based task and a buyer who can also be the user                                         |
| Developers                               | Repository change through tested, reviewed diff | Mature coding alternatives; proposed local/developer advantages depend on public runtime availability and measurement |
| Enterprise teams                         | Governed work across systems                    | Larger assurance, administration, integration and procurement burden; no enterprise outcome proved here               |

This is qualitative prioritization, not a market-size or conversion model.

**First screening hypothesis:** a solo B2B research/strategy consultant or owner-operated agency of 1–5 people, already using AI, producing a similar vendor/competitor brief weekly. Size and frequency are deliberately chosen pilot filters, not market facts. The buyer and user are initially the same person; the client receives reviewed work.

**Job to test:** approved brief + source packet → comparison → recommendation draft → review and revision → supported export. Start with one project and supplied public sources. Verify context handling, claim support, revision and output format before advertising an outcome.

**Current substitute:** the consultant's existing ChatGPT/Claude project, browser research and Word/Docs. The alternative is usually an established setup, not working without AI. [Claude's TRY case](https://claude.com/customers/try) already documents proposals, analysis and reporting. Its organization is much larger than a solo consultant; it is evidence of category use, not proof of this proposed segment's demand. [OpenAI's small-business program](https://openai.com/index/introducing-chatgpt-small-business-program/) likewise demonstrates incumbent attention to owner/operator work, not dissatisfaction or AGI adoption.

**Switching reason to prove:** fewer repeated setup, verification and formatting steps for this exact job. Model breadth and control can support that outcome, but no cost, quality, privacy or time advantage was measured here.

For the narrow public-source comparison job, the independent reviewer identified **Perplexity Pro** as the strongest incumbent to include. Its official guide documents research, multiple providers, model switching in an existing session and file creation. Research and model continuity therefore cannot be treated as exclusive AGI benefits. [Perplexity Pro guide](https://www.perplexity.ai/help-center/en/articles/10352901-what-is-perplexity-pro)

## Already solved, and what to improve without rebuilding it

The component problems are substantially served: assistants draft and research; workspace products organize context and model access; automation products connect business systems; coding agents work on repositories. There is no evidence of an empty category. A new entrant can still succeed if a particular workflow remains inconvenient and it improves it demonstrably.

Use the existing AGI project, files, instructions, draft/artifact and revision path for the first comparison. Do not begin with another runtime or a larger feature checklist. Improvements below are proposed directions to investigate, not claims that the current product lacks each feature:

| Priority | Proposed improvement                                                           | Evidence required before building                                                        |
| -------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 1        | A clear starting task and attainable example: client brief to comparison draft | Prospects understand the invitation and can finish the current path                      |
| 2        | Reuse client instructions and reference context with clear inclusion/omission  | Real repeated tasks show avoidable setup or lost context                                 |
| 3        | Make reviewing material claims and their sources straightforward               | Users identify fewer unsupported claims and less checking work than with their incumbent |
| 4        | Produce the exact usable output format the pilot customer needs                | Final export/reformatting is a demonstrated bottleneck; supported fidelity is tested     |
| 5        | Explain the available route and total offer clearly                            | Access, processing terms or model choice prevent completion or switching                 |

Reuse familiar workflow conventions and the repository's canonical owners. Do not fork another product's code, duplicate existing AGI behavior or infer permission for cross-boundary data movement. The long-term ecosystem ambition can remain; the first sales invitation needs a specific user, task and demonstrable result.

## Competition and number of players

The sourced survey below covers **20 product families**: 12 direct general/multi-model workspace alternatives and 8 adjacent automation/coding families. This is neither the worldwide category total nor 20 independent companies. Open-source projects, ownership changes and grouped product lines make those different counts. Assistant + office-suite combinations are additional substitutes, not separately counted players.

All rows use official sources checked October 11, 2026. Features and channels are documented or visible on public sites, not authenticated performance measurements. Classification is analyst inference; automation products become direct alternatives if AGI's chosen job is business-process automation.

| Product family         | Relationship / job                                      | Visible distribution                                    | Official evidence                                                                                                       |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| ChatGPT / Work / Codex | Direct workspace; knowledge work and coding             | Existing accounts, web, apps and developer entry points | [Product access](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)                                   |
| Claude / Claude Code   | Direct workspace; knowledge work and coding             | Web/app signup, role examples and sales                 | [Overview](https://claude.com/product/overview)                                                                         |
| Gemini                 | Direct workspace; research, creation and connected work | Google accounts, consumer bundles and Workspace         | [Gemini](https://gemini.google/us/about/?hl=en), [Workspace](https://workspace.google.com/solutions/ai/)                |
| Perplexity             | Direct workspace; research and work                     | Free entry, upgrades and enterprise plans               | [Plans](https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you) |
| Manus                  | Direct workspace; delegated deliverables                | Web/app entry, teams and playbooks                      | [Product](https://manus.im/)                                                                                            |
| Grok                   | Direct workspace; assistance and delegated work         | Standalone apps and exposure within X                   | [Overview](https://docs.x.ai/grok/overview), [X](https://help.x.com/en/using-x/about-grok)                              |
| Poe                    | Direct multi-model/bot workspace                        | Bot discovery, shared links and creator platform        | [FAQ](https://help.poe.com/hc/en-us/articles/19944206309524-Poe-FAQs)                                                   |
| TypingMind             | Direct multi-model/BYOK workspace                       | Website licenses, reviews and discovery listings        | [Product](https://www.typingmind.com/)                                                                                  |
| Open WebUI             | Direct self-hosted/local/cloud workspace                | GitHub, installation docs and community                 | [Product](https://openwebui.com/)                                                                                       |
| LibreChat              | Direct customizable multi-provider workspace            | GitHub, demo, quickstart and community                  | [Product](https://www.librechat.ai/)                                                                                    |
| AnythingLLM            | Direct local/document workspace                         | Desktop download, self-hosting and community            | [Product](https://anythingllm.com/)                                                                                     |
| BoltAI                 | Direct Mac multi-model workspace                        | App trial/download and website licenses                 | [Product](https://boltai.com/)                                                                                          |
| Zapier                 | Adjacent; connected business automation                 | Integration/templates, education and partners           | [Product](https://zapier.com/)                                                                                          |
| n8n                    | Adjacent; technical workflow automation                 | Cloud, self-hosting, GitHub and community               | [Product](https://n8n.io/)                                                                                              |
| Lindy                  | Adjacent; delegated business roles                      | Trials, demos and role-specific pages                   | [Product](https://www.lindy.ai/)                                                                                        |
| Relevance AI           | Adjacent; specialist agent workforces                   | Enterprise demos, partners and case studies             | [Product](https://relevanceai.com/)                                                                                     |
| Gumloop                | Adjacent; connected agents and processes                | Self-serve, demos, templates and role pages             | [Product](https://www.gumloop.com/)                                                                                     |
| Cursor                 | Adjacent; software development                          | Desktop/CLI/cloud entry and developer community         | [Product](https://cursor.com/)                                                                                          |
| GitHub Copilot         | Adjacent; software development                          | GitHub, IDE, CLI and enterprise exposure                | [Product](https://github.com/features/copilot)                                                                          |
| Devin / Devin Desktop  | Adjacent; software development                          | Downloads, plans and existing Windsurf migration        | [Devin Desktop](https://devin.ai/desktop)                                                                               |

ChatGPT and its developer/work products count once; Claude and Claude Code count once. Windsurf redirects to Devin Desktop and is not counted again. LibreChat's homepage currently announces a ClickHouse relationship; this report does not assert audited legal ownership. No traffic, market share, paying-user population or TAM is inferred from this list.

## Distribution without buying reach first

These are proposed tests. No messages, promotions, partnerships or publications were made.

1. **Founder-led task clinics:** find a small, permissioned consultant/agency community and work through a public/redacted brief with willing participants. Observe setup and review, including failures. Incumbents use practical training and guides; their channel success is not transferable evidence for AGI. [OpenAI program](https://openai.com/index/introducing-chatgpt-small-business-program/)
2. **One specific demonstration:** show the input, actual steps and reviewed deliverable on LinkedIn or a relevant niche newsletter/community. Report measured review effort. A generic model catalogue or product tour does not demonstrate a switching reason.
3. **A useful reusable worksheet:** a brief-to-comparison template plus source-checking checklist leading to the supported Web task. Explore a trusted consultant educator/partner after discovering repeated demand. Templates and partner paths are observable at [Zapier](https://zapier.com/) and [Relevance AI](https://relevanceai.com/); their acquisition efficiency for AGI is unknown.

These routes can avoid advertising spend, but founder time and product usage still have costs. Prioritize access to a repeated task over a large launch audience.

## Purpose, why and communication

The current founder statement centers control over model choice and where work runs. Preserve that as the broader purpose; its surface-specific availability must remain explicit. [AGI about](https://agiworkforce.com/about)

**Proposed why:** people doing the work should retain control over their context and the tools they use, and spend more attention on judgment than repeatedly assembling drafts.

**Proposed first-customer promise:** turn a client brief and approved references into a draft the consultant can inspect, revise and use. This is a testable direction, not a measured benefit.

**Conservative headline to test:** “Turn a client brief into a draft you can review.”

**Support:** “Keep approved source material, project instructions and revisions together in AGI Web.”

**CTA:** “Try it with a public brief.”

The six-surface story explains product architecture before it identifies a particular customer's task, while public availability currently centers Web. Lead the pilot with its attainable job. Do not imply autonomous client communications, guaranteed factual accuracy, all catalogue models in every plan, universal privacy advantages, or general intelligence from the brand name.

## Agent critique and its limits

Three fresh agents were separately briefed to choose/challenge a first segment, critique buyer switching and evaluate distribution. They were not given the preliminary consultant recommendation or each other's reports. All three completed their reviews. They share the underlying model environment and much of the source evidence; separate briefs do not make statistically independent consumer samples.

| Actual review                 | Conclusion                                                                                            | Challenge to the recommendation                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Independent segment selection | Test solo B2B research consultants producing public-source vendor/comparison briefs                   | Perplexity already covers this job; AGI must reduce checking, copying and rewriting at equivalent quality                  |
| Skeptical buyer critique      | Consultant/researcher is closer to today's offer than privacy-sensitive developers or team operations | New-account/migration friction, citation work, processing approval and output quality can defeat switching                 |
| Distribution critique         | Try manual founder recruitment, useful community help and small workflow clinics                      | There is no evidence that awareness is the main bottleneck; access, differentiation and repeat use may be equally limiting |

The buyer reviewer proposed an optional client-brief starter using existing owners, rather than a new platform. Generic starters already exist in [the onboarding catalogue](../../apps/web/features/onboarding/lib/use-cases.ts); [research plans](../../apps/web/features/chat/components/research/ResearchPlan.tsx) and [report/export/save](../../apps/web/features/chat/components/research/ResearchReportView.tsx) also have implementation owners. Those are inspected source paths, not proof of live quality or Free entitlement. First test the attainable current flow; consider a small starter change only if observed task evidence supports it.

The agreement narrows a hypothesis; it does not raise the consumer sample size above zero. Their objections and decision rules are authored research prompts, not quotes from customers.

No 1,000-agent study was conducted. A large synthetic population could expose more variations of an assumption without showing whether anyone buys. No synthetic adoption percentage, willingness-to-pay score or invented customer quote is reported.

## What would decide the recommendation

The operational owner for screening, messaging drafts, task comparison, measurements and proposed thirty-day sequencing is now [the first-customer validation plan](../../audit/plan/first-customer-validation.md). No experiments have started. The abbreviated gates below describe the research direction; execution follows that plan and its preselected rules.

These are proposed small discovery gates, not experiments performed or statistically representative samples:

1. Talk to ten screened prospects about their last real deliverable; inspect approved/redacted inputs, outputs and current tools. Continue only if a repeated, costly problem actually appears. A suggested founder gate is six matching repeated jobs and three willing pilot tasks; choose the gate before observing results.
2. Compare five matched tasks against each participant's actual incumbent. Use identical approved sources, comparable access and equivalent assistance. Measure active human time through an accepted draft, unsupported material claims, omissions, failure recovery and reformatting. Conceal brand and randomize review order where feasible. Generation speed alone is insufficient.
3. Observe two weeks of voluntary repeat use without founder rescue. A suggested directional signal is three of five returning; actual opt-in at the reachable offer is stronger than hypothetical interest. A tiny pilot supports a next decision, not market-wide conversion claims.

Stop or change the segment if the incumbent remains preferred, review effort erases savings, processing terms block the work, access fails, or the job is too infrequent. Current AGI acquisition, retention, revenue, unit economics, willingness to pay and comparative workflow performance are unknown. Customer language must come from actual people before it is represented as their voice.

## Focused follow-up: incumbent workflow and public practitioner signals

Follow-up reviewed on October 11 after the user authorized continuing without an external simulation. This adds public source evidence, not customer experiments or additional synthetic buyer samples.

### Existing workflow coverage

- **Perplexity:** current Projects documentation retains files, instructions, sessions and reusable skills; paid assets document revision history and document downloads. These weaken model/workspace/reuse claims as switching arguments. [Projects, modified October 9](https://www.perplexity.ai/help-center/en/articles/10352961-what-are-projects), [Assets](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview)
- **ChatGPT:** Deep Research supports a reviewable plan, controlled sources, citations and Word/PDF/Markdown exports, subject to account, country and workspace access. A source-backed editable report is already a documented expectation. [Official guide](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt)
- **Claude:** current Docs documentation covers direct editing, AI revision and export across eligible plans, with Enterprise default enablement scheduled for October 15 and earlier owner enablement. Do not mistake a rollout date for universal availability today. [Claude Docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs)

These are current official documented capabilities, not observed comparative completion. The strongest remaining hypothesis is less human work to accept the next updated brief, with equivalent or better evidence support and output usability. Measure setup, checking, corrections, revision and formatting through acceptance; inspect first-use friction and repeat use separately.

### Public job evidence and counterevidence

Six distinct public practitioner/creator accounts were inspected. **None establishes every narrow screening attribute together**, and fewer than five qualified independent datapoints support the proposed segment. Their self-described identities and outcomes were not independently verified. These observations cannot establish a validated persona, job prevalence, willingness to pay or AGI demand.

| Public account                                         | Date evidence                                              | Observation and its limit                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jan Černý, CI/OSINT consultant and academic            | Field notes dated May 15 and July 5, 2026                  | Describes authoritative public-source intelligence and stresses a decision before a landscape. Supports the job's existence; cadence, solo operation and switching are unverified. [Methods](https://www.cerny.ai/en/notes/weak-signals-where-i-look-in-2026), [Decision](https://www.cerny.ai/en/notes/technology-intelligence-starts-with-a-decision)                                                 |
| Allison Rona, product marketer                         | Relative age shown; exact publication date unknown         | Her competitive-analysis walkthrough needed scope/format iteration but ultimately got acceptable Perplexity output. Supports constraints as discovery topics and supplies incumbent-success counterevidence; independent consultant status is unverified. [Walkthrough](https://www.linkedin.com/posts/allison-rona_i-finally-used-perplexity-to-do-some-competitive-activity-7274453290925379585-9iIP) |
| u/mlloyd, self-described solo consultant               | March 19–20, 2026                                          | Reports satisfaction with Claude-assisted decks and iteration. Deliverable polish alone may not motivate switching; recurring vendor research is unverified. [Public account](https://www.reddit.com/r/consulting/comments/1rxxonb/comment/obbbbma/)                                                                                                                                                    |
| u/GL_LA, consulting practitioner                       | Thread dated November 30, 2025; comment exact date unknown | Reports generic/incorrect substance and prefers source collection with manual review. Verification burden may defeat value; this does not prove AGI fixes it or establish independent status. [Public account](https://www.reddit.com/r/consulting/comments/1pamg6e/comment/nrl488y/)                                                                                                                   |
| Vaibhav Longani, freelancer and competing-tool creator | Publication date unstated                                  | Describes prompting/context/verification friction and a PowerPoint-native alternative. Commercially interested testimony; neither his claimed error rates nor unnamed interviewees are counted as customer evidence. [Interview](https://umbrex.com/unleashed/episode-652-vaibhav-longani-giani-zero-defect-source-backed-slides-for-consultants/)                                                      |
| Ramona Daniel, independent research founder            | Newsletter dated June 8, 2026                              | Publishes recurring public-source cultural/trend synthesis. This is adjacent research work; the stack, pain, vendor-brief demand and AI use remain unknown. [Newsletter](https://ramonadaniel.substack.com/p/trends-and-artefacts-hopecore-edition), [Own site](https://www.23insights.co.uk/)                                                                                                          |

Both Jan notes count as one person. Promotional duplicates, students, enterprise employees presented as independent consultants, and an apparently relevant post with disputed authenticity were excluded from qualification. This is a small purposive review, not a representative survey. Public posts and service marketing have selection/commercial bias.

**Decision implication:** keep the consultant brief as a low-confidence segment hypothesis. Include happy incumbents in discovery and compare to the real current method. Do not assert an unmet market from these observations. Real retained AGI usage in another segment would take precedence over this outside-in hypothesis.

## Verification and provenance

This research follows the repository's [competitive guidance](../product/competitive-guidance.md). The earlier integration assessment created in this conversation was withdrawn after the user clarified the task. No product implementation changed.

MiroFish source reviewed: commit `7657031ac01184afe2cb220f5ee3545573b5e843`. Runtime was not installed or executed. Official pages are live observations on October 11; they may change. Vendor case studies are selective marketing evidence, not independent measures or AGI results.

Validation: Prettier checks passed for this assessment and the operational plan. A direct document check verified 20 unique product families (12 direct, eight adjacent), six public-observation records with explicit insufficient-qualification status, all 11 local links across both documents, text structure and founder-stage/execution labels. Application builds and tests were not run because these changes contain research and a proposed protocol only. Document checks do not prove implementation quality or customer outcomes.

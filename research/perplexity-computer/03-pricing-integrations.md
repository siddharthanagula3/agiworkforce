# Perplexity Computer: Pricing, Credits & Integrations

> Research date: 2026-02-28 | Product launched: 2026-02-25/26

---

## 1. Subscription Tiers & Pricing

### Individual Plans

| Plan | Monthly | Annual | Computer Access |
|------|---------|--------|-----------------|
| **Free (Standard)** | $0 | $0 | None |
| **Pro** | $20/mo | $200/yr | Coming soon (not yet available) |
| **Max** | $200/mo | $2,000/yr | Full access (only tier with Computer at launch) |

### Enterprise Plans (Per-Seat)

| Plan | Monthly | Annual | Computer Access |
|------|---------|--------|-----------------|
| **Enterprise Pro** | $40/seat/mo | $400/seat/yr | Coming soon |
| **Enterprise Max** | $325/seat/mo | $3,250/seat/yr | Full access with compliance controls |

**Key details:**
- Computer requires Perplexity Max subscription at launch
- Pro and Enterprise Pro rollout planned (no announced date)
- Enterprise Max includes admin controls, trust center, data privacy guarantees (data never used for training)
- "Unlimited" web-interface usage in Max applies to standard searches; Computer tasks consume credits separately

---

## 2. Credit System

### Monthly Allocations

| Plan | Monthly Credits | Notes |
|------|----------------|-------|
| **Max** | 10,000 credits/mo | Included with $200/mo subscription |
| **Enterprise Max** | 10,000 credits/mo (assumed same) | Per seat; not officially confirmed separately |

### Early Adopter Bonus (Limited Time)

- **One-time bonus**: 20,000 additional credits
- **Expiration**: 30 days after grant
- **Total at launch**: 30,000 credits (10,000 monthly + 20,000 bonus)
- **Status**: Available to all Max subscribers who signed up during launch window

### How Credits Are Consumed

Credits are consumed **per token**, not per project. Costs scale with:
- Complexity and length of the task
- Which AI models are selected for sub-agents
- Number of sub-agent steps and tool calls
- Amount of research, code generation, and media produced

Users can choose which models power their sub-agents, allowing control over both performance and cost (cheaper models = fewer credits).

### Credit Consumption by Project Type (Estimated Ranges)

| Project Type | Credit Range | Projects per 10K Credits |
|---|---|---|
| Simple 5-page research report | 300-600 | 16-33 |
| Medium research + formatting | 800-1,500 | 6-12 |
| Competitive analysis with data | 1,500-2,500 | 4-6 |
| Full web app + database + dashboard | 3,000-5,000 | 2-3 |
| 500-company due diligence report | 5,000-8,000 | 1-2 |

**Real-world user report (Reddit):** One user burned through 15,000 credits in a single day on heavy usage, calling it "efficient but expensive."

### Spending Controls

- **Default monthly spending cap**: $200
- **Adjustable up to**: $2,000/month
- **User-controlled**: Set before submitting large projects
- **Approval gates**: System pauses for user approval on high-stakes actions (code deployment, external API calls)
- Credit pricing, task credit ranges, and monthly allowances are subject to change and may vary by promotion, region, or plan

### What Does NOT Consume Credits

- Regular Perplexity searches (standard search, not Computer)
- Standard Pro/Max model access for chat

---

## 3. Integrations & Connectors

### Overview

Perplexity Computer claims **400+ app integrations** via secure connectors. The integration system supports both:
- **Native (first-party) connectors**: Direct OAuth-based integrations built by Perplexity
- **Third-party connectors**: Via Zapier, Integrately, Relay.app, etc.

### Confirmed Native Connectors (Named in Official Sources)

#### Productivity & Communication
| App | Capabilities |
|-----|-------------|
| **Gmail** | Search inbox, compose, reply, manage labels |
| **Google Calendar** | View events, create events, schedule |
| **Outlook** | Email search and actions |
| **Slack** | Message channels, search conversations |
| **Notion** | Search pages, create content |
| **Telegram** | Messaging integration |

#### Developer & Engineering
| App | Capabilities |
|-----|-------------|
| **GitHub** | Code search, PR management, issue tracking, deployment |
| **Linear** | Issue tracking, project management |
| **Jira** | Issue tracking (Enterprise) |

#### File Storage & Documents
| App | Capabilities |
|-----|-------------|
| **Google Drive** | File search, document access |
| **Microsoft OneDrive** | File search, document access |
| **SharePoint** | Enterprise file search (Enterprise only) |
| **Dropbox** | File search, document analysis |
| **Box** | Enterprise file storage |
| **Confluence** | Knowledge base search (Enterprise) |

#### Data & Analytics
| App | Capabilities |
|-----|-------------|
| **Snowflake** | Data warehouse queries |
| **Databricks** | Data platform integration |

#### CRM & Business
| App | Capabilities |
|-----|-------------|
| **Salesforce** | CRM data access, contact/deal search |
| **HubSpot** | CRM and marketing data |
| **Stripe** | Payment and billing data |

#### Project Management
| App | Capabilities |
|-----|-------------|
| **Asana** | Task and project management |

### Enterprise-Only Connectors (from Perplexity Enterprise page)

The official Enterprise App Connectors page lists these as the full native connector set:
1. Asana
2. Box
3. Confluence
4. Dropbox
5. Gmail with Calendar
6. Google Drive
7. GitHub
8. Jira
9. Linear
10. Notion
11. OneDrive
12. Outlook
13. Salesforce
14. SharePoint
15. Slack
16. Snowflake

### Pro-Tier Connectors (Subset)

Pro subscribers get a limited connector set:
- Gmail + Google Calendar
- Google Drive
- Notion
- GitHub

Enterprise Pro adds:
- Linear
- All file connectors (OneDrive, SharePoint, Dropbox, Box)

### How the "400+" Number Is Reached

The 400+ figure likely includes:
- ~16-20 native first-party connectors (listed above)
- Hundreds of additional integrations via:
  - **Zapier** integration (connects Perplexity to 5,000+ apps)
  - **External API calls** Computer can make directly (REST APIs, webhooks)
  - **Web automation** (Computer can browse and interact with any web app)
  - **File upload/download** capabilities for data exchange
  - Built-in web scraping and data extraction from any URL

### User-Reported Connected Apps

From social media and reviews, users have confirmed connecting:
- GitHub, Linear, Gmail, Google Drive, Telegram (confirmed working by @dani_avila7)
- Stripe, HubSpot (referenced in guides)
- Databricks (mentioned in official help center)

---

## 4. Enterprise-Specific Details

### Enterprise Pro ($40/seat/mo)
- Trust center access
- Strict data privacy (data never used for training)
- Per-seat pricing
- Admin controls and shared collaboration spaces
- Identity-provider (SSO) login
- File connectors (Google Drive, OneDrive, SharePoint, Dropbox, Box)
- App connectors (all 16+ native connectors)
- Computer access: **coming soon** (not available at launch)

### Enterprise Max ($325/seat/mo)
- All Enterprise Pro features
- Full Perplexity Computer access
- Maximum toolset with expanded storage
- Enterprise-grade performance
- Compliance controls
- Advanced model access
- Rolling out at launch or shortly after

### Enterprise Pricing Notes
- Minimum seat counts not publicly disclosed
- Custom pricing likely available for large deployments
- Annual billing saves ~17% ($3,250/yr vs $325x12=$3,900/yr)

---

## 5. Competitive Pricing Context

| Product | Price | Credit/Usage Model |
|---------|-------|--------------------|
| **Perplexity Computer (Max)** | $200/mo | 10,000 credits/mo + usage-based |
| **Claude Pro** | $20/mo | Usage limits on messages |
| **Claude Max** | $100/mo | 5x Pro usage |
| **Claude Team** | $30/seat/mo | Higher limits |
| **ChatGPT Plus** | $20/mo | GPT-4o access |
| **ChatGPT Pro** | $200/mo | Unlimited GPT-4o, o1 |
| **Gemini Advanced** | $20/mo | Gemini Ultra access |
| **Gemini Ultra** | $250/mo | Highest tier |

Perplexity Computer at $200/mo competes directly with ChatGPT Pro and near Gemini Ultra, but offers multi-model orchestration (19 models) that no competitor matches at any price point.

---

## 6. Key Pricing Takeaways

1. **Barrier to entry is high**: $200/mo puts it in premium tier, but the multi-model orchestration is unique
2. **Credits can burn fast**: Real users report 15K credits in one day; heavy users may need additional credits beyond the 10K monthly allocation
3. **Spending caps provide safety**: $200 default cap prevents runaway costs, adjustable to $2K
4. **Model selection affects cost**: Choosing cheaper sub-agent models stretches credits further
5. **Pro rollout is the growth play**: At $20/mo with limited Computer access, this could massively expand the user base
6. **Enterprise Max at $325/seat is premium**: Competes with enterprise AI platforms but offers unique multi-model value
7. **The 20K bonus is strategic**: Gives users enough runway to get hooked before monthly 10K feels constraining

---

## Sources

- Perplexity official announcements (Twitter/Threads, LinkedIn) — Feb 25-26, 2026
- Perplexity Help Center: "What is Computer?" and "How Credits Work"
- Perplexity Enterprise: App Connectors page
- TechCrunch: "Perplexity's new Computer" (Feb 27, 2026)
- VentureBeat: "Perplexity launches Computer AI agent" (Feb 26, 2026)
- TechFundingNews: "The OpenClaw killer" (Feb 26, 2026)
- The Neuron Daily: "Perplexity Computer = CloudClaw?" (Feb 26, 2026)
- AI Cost Blog: "Perplexity Computer" analysis
- AI Agents Kit: "Perplexity Computer Complete Guide"
- Substack (Karo Zieminski): "What I Built in One Night" review
- Medium (AI Tomorrow): spending cap details
- Reddit r/perplexity_ai: user experience reports
- Awesome Agents: "Perplexity Bets Its Future on $200 Digital Worker"
- GlobalGPT: Perplexity pricing breakdown 2026
- Finout: Perplexity pricing 2026

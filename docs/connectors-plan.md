# AGI Workforce — Connectors Roadmap

**Reference**: Perplexity Computer connector list (Feb 2026) — 100+ connectors
**Architecture**: Each connector = MCP server + OAuth flow + UI card in Connectors marketplace
**Implementation**: OAuth tokens stored in SecretManager (Argon2id + SQLCipher); exposed as MCP tools to agents

---

## Connector Architecture

```
User → OAuth Flow → SecretManager (encrypted token)
                          ↓
Agent Request → MCP Server (connector) → External API → Result
```

Each connector ships as:
1. **MCP server** (`apps/desktop/src-tauri/src/integrations/<connector>/`)
2. **OAuth handler** (Tauri command + callback URI)
3. **UI card** (Connectors marketplace page)
4. **Tool definitions** (what the agent can do with it)

---

## Phase 1 — Core Productivity (Target: Week 1-4)
**Priority**: Universal tools everyone uses daily. Highest ROI. Required to match Perplexity Day 1.

| # | Connector | Key Actions | OAuth Provider |
|---|-----------|-------------|----------------|
| 1 | **Gmail + Calendar** | Read/send email, create events, search | Google OAuth2 |
| 2 | **Google Drive** | Read/write/search files, upload | Google OAuth2 |
| 3 | **Notion** | Search pages, create/update content | Notion OAuth |
| 4 | **Slack** | Post messages, search, read channels | Slack OAuth |
| 5 | **GitHub** | Search repos, create PRs, manage issues, push code | GitHub OAuth |
| 6 | **Google Sheets** | Read/write cells, create spreadsheets | Google OAuth2 |
| 7 | **Outlook** | Search email, calendar events, send | Microsoft OAuth |
| 8 | **OneDrive** | Read/write/search files | Microsoft OAuth |
| 9 | **Linear** | Create/manage issues, projects, cycles | Linear OAuth |
| 10 | **Jira** | Create/manage issues, sprints, projects | Atlassian OAuth |

**Shared OAuth providers to implement once**: Google OAuth2, Microsoft OAuth, GitHub OAuth, Atlassian OAuth, Slack OAuth, Notion OAuth, Linear OAuth

---

## Phase 2 — Collaboration & Project Management (Target: Week 5-8)

| # | Connector | Key Actions | OAuth Provider |
|---|-----------|-------------|----------------|
| 11 | **Microsoft Teams** | Send messages, search, manage channels | Microsoft OAuth |
| 12 | **Confluence** | Search/create pages, manage spaces | Atlassian OAuth |
| 13 | **Asana** | Create/manage tasks, projects, teams | Asana OAuth |
| 14 | **Airtable** | Read/write records, create bases | Airtable OAuth |
| 15 | **ClickUp** | Create tasks, manage workflows | ClickUp OAuth |
| 16 | **Trello** | Create cards, manage boards | Trello OAuth |
| 17 | **Google Docs / Slides / Forms** | Create/edit documents, presentations | Google OAuth2 |
| 18 | **Dropbox** | Read/write/share files | Dropbox OAuth |
| 19 | **SharePoint** | Search/manage enterprise documents | Microsoft OAuth |
| 20 | **Zoom** | Schedule meetings, get recordings | Zoom OAuth |

---

## Phase 3 — CRM & Sales (Target: Week 9-12)

| # | Connector | Key Actions | OAuth Provider |
|---|-----------|-------------|----------------|
| 21 | **HubSpot** | Manage contacts, companies, deals, notes | HubSpot OAuth |
| 22 | **Salesforce** | CRUD on CRM objects, leads, opportunities | Salesforce OAuth |
| 23 | **Pipedrive** | Manage deals, contacts, activities | Pipedrive OAuth |
| 24 | **Apollo.io** | Search prospects, enrich contacts | Apollo API Key |
| 25 | **Attio** | Manage CRM records, relationships | Attio OAuth |
| 26 | **Close** | Manage leads, calls, emails | Close API Key |
| 27 | **Intercom** | Manage conversations, customers, tickets | Intercom OAuth |
| 28 | **Calendly** | Schedule meetings, manage event types | Calendly OAuth |
| 29 | **Docusign** | Send/track signature requests | Docusign OAuth |
| 30 | **Typeform** | Create forms, collect responses | Typeform OAuth |

---

## Phase 4 — Developer & Cloud Infrastructure (Target: Week 13-16)

| # | Connector | Key Actions | OAuth Provider |
|---|-----------|-------------|----------------|
| 31 | **Supabase** | Query DB, manage tables, auth | Supabase PAT |
| 32 | **PostgreSQL** | Execute queries, manage schema | Connection string |
| 33 | **MySQL** | Execute queries, manage schema | Connection string |
| 34 | **MongoDB** | CRUD operations, aggregations | Connection string |
| 35 | **AWS** | S3, Lambda, CloudWatch, EC2 ops | AWS Access Keys |
| 36 | **Google Cloud** | BigQuery, GCS, Cloud Functions | Google OAuth2 |
| 37 | **Cloudflare** | Manage DNS, workers, pages | Cloudflare API Key |
| 38 | **Firebase Admin** | Auth, Firestore, Storage admin | Service Account |
| 39 | **Netlify** | Deploy sites, manage builds, forms | Netlify OAuth |
| 40 | **Webflow** | Manage CMS, publish sites | Webflow OAuth |

---

## Phase 5 — Marketing & Analytics (Target: Week 17-20)

| # | Connector | Key Actions | OAuth Provider |
|---|-----------|-------------|----------------|
| 41 | **Google Analytics** | Query reports, audience data | Google OAuth2 |
| 42 | **Google Search Console** | Search performance, indexing | Google OAuth2 |
| 43 | **Google Ads** | Manage campaigns, keywords, budgets | Google OAuth2 |
| 44 | **Mailchimp** | Manage audiences, campaigns, templates | Mailchimp OAuth |
| 45 | **Resend** | Send transactional emails | Resend API Key |
| 46 | **Twilio SendGrid** | Send email, manage templates | SendGrid API Key |
| 47 | **Brevo** | Email + SMS + chat marketing | Brevo API Key |
| 48 | **LinkedIn Ads** | Manage ad campaigns, reporting | LinkedIn OAuth |
| 49 | **Ahrefs** | SEO data, backlinks, keywords | Ahrefs API Key |
| 50 | **Similarweb** | Website traffic and ranking data | Similarweb API Key |

---

## Phase 6 — E-commerce & Finance (Target: Week 21-24)

| # | Connector | Key Actions | OAuth Provider |
|---|-----------|-------------|----------------|
| 51 | **Stripe** | Payments, subscriptions, customers | Stripe API Key |
| 52 | **Shopify** | Products, orders, customers, inventory | Shopify OAuth |
| 53 | **QuickBooks** | Invoices, expenses, financial reports | Intuit OAuth |
| 54 | **Xero** | Accounting, invoices, payroll | Xero OAuth |
| 55 | **PayPal** | Transactions, invoices, payouts | PayPal OAuth |
| 56 | **Square** | Payments, inventory, customers | Square OAuth |
| 57 | **BambooHR** | Employee data, time-off, org chart | BambooHR API Key |
| 58 | **Microsoft Excel** | Read/write workbooks via Graph API | Microsoft OAuth |
| 59 | **Microsoft Power BI** | Query reports, embed dashboards | Microsoft OAuth |
| 60 | **Databricks** | Run notebooks, query data | Databricks PAT |

---

## Phase 7 — Communication & Social (Target: Week 25-28)

| # | Connector | Key Actions | OAuth Provider |
|---|-----------|-------------|----------------|
| 61 | **Discord** | Post messages, manage servers | Discord OAuth |
| 62 | **Telegram** | Send messages, manage bots | Telegram Bot API |
| 63 | **WhatsApp Business** | Send/receive messages, templates | Meta OAuth |
| 64 | **LinkedIn** | Post content, manage profile | LinkedIn OAuth |
| 65 | **Reddit** | Post, comment, search subreddits | Reddit OAuth |
| 66 | **Bluesky** | Post, search, manage account | Bluesky ATP |
| 67 | **YouTube Data** | Upload videos, manage playlists | Google OAuth2 |
| 68 | **Facebook Pages** | Post, manage pages, analytics | Meta OAuth |
| 69 | **Twitter/X** | Post, search, manage account | X OAuth2 |
| 70 | **Twitch** | Stream data, manage channel | Twitch OAuth |

---

## Phase 8 — AI & Specialized Tools (Target: Week 29-32)

| # | Connector | Key Actions | OAuth Provider |
|---|-----------|-------------|----------------|
| 71 | **Google Gemini** | Text/vision generation | Google API Key |
| 72 | **OpenAI (ChatGPT)** | Completions, assistants, files | OpenAI API Key |
| 73 | **Mistral AI** | Completions, embeddings | Mistral API Key |
| 74 | **ElevenLabs** | TTS, voice cloning, dubbing | ElevenLabs API Key |
| 75 | **Replicate** | Run ML models, fine-tuning | Replicate API Key |
| 76 | **Google Vertex AI** | Gemini, custom models, MLOps | Google OAuth2 |
| 77 | **Canva** | Create designs, manage brand kit | Canva OAuth |
| 78 | **Freshdesk** | Manage tickets, agents, reports | Freshdesk API Key |
| 79 | **Zendesk** | Manage tickets, customers, SLA | Zendesk OAuth |
| 80 | **ActiveCampaign** | Email automation, CRM | ActiveCampaign API Key |

---

## Phase 9 — Enterprise & Long-tail (Target: Week 33+)

| # | Connector | Notes |
|---|-----------|-------|
| 81 | **Snowflake** | Data warehouse queries |
| 82 | **Microsoft SQL Server** | Enterprise DB |
| 83 | **Microsoft Bookings** | Appointment scheduling |
| 84 | **Microsoft Entra ID** | Identity & access management |
| 85 | **Microsoft OneNote** | Note-taking & docs |
| 86 | **Microsoft To Do** | Task management |
| 87 | **Microsoft 365 Planner** | Team task planning |
| 88 | **Microsoft 365 People** | Contact management |
| 89 | **Google Contacts** | Contact management |
| 90 | **Google Maps (Places API)** | Location & business data |
| 91 | **Google Tasks** | Task management |
| 92 | **Google Meet** | Meeting management |
| 93 | **Google Chat** | Team messaging |
| 94 | **Google Workspace Admin** | Org-wide settings |
| 95 | **Guru** | Enterprise knowledge base |
| 96 | **Hex** | Data science notebooks |
| 97 | **Mailgun** | Transactional email |
| 98 | **Postmark** | Transactional email |
| 99 | **Egnyte** | Enterprise content management |
| 100 | **Box** | Enterprise file storage |
| 101 | **Todoist** | Personal task management |
| 102 | **Pipedream** | Workflow automation |
| 103 | **Strava** | Fitness/activity data |
| 104 | **Spotify** | Music/audio data |
| 105 | **Twilio** | SMS/voice/communications |

---

## AGI Workforce Exclusive Connectors (No Competitor Has These)

These connectors leverage our **desktop-native + local** advantage:

| Connector | What It Enables |
|-----------|----------------|
| **Local Filesystem** | Read/write any file on the user's computer |
| **Terminal / Shell** | Execute commands, scripts, cron jobs |
| **Browser Automation** | Control Chrome/Safari/Firefox via CDP |
| **Screen Vision** | OCR + screenshot-based computer use |
| **Local Databases** | SQLite, DuckDB files directly |
| **VS Code** | Read workspace, run tasks, edit files |
| **Ollama / Local LLMs** | Route to local models (no cloud needed) |
| **Calendar (OS-native)** | macOS/Windows native calendar access |
| **Contacts (OS-native)** | macOS/Windows native contacts |
| **Keychain / Wallet** | OS-level secret storage |

---

## Implementation Priority Matrix

### Must-Have for Launch (Phase 1 — 10 connectors)
Gmail, Google Drive, Notion, Slack, GitHub, Google Sheets, Outlook, OneDrive, Linear, Jira

### High-Impact Second Wave (Phase 2-3 — 20 more connectors)
Teams, Confluence, Asana, Airtable, HubSpot, Salesforce, Zoom, Calendly, Trello, ClickUp, Pipedrive, Intercom, Dropbox, Docusign, SharePoint, Typeform, Attio, Google Docs, Close, Apollo

### Long-tail (Phases 4-9 — 75+ connectors)
Implement on-demand as users request. Track via upvote system in UI.

---

## MCP Implementation Pattern

Each connector follows this standard pattern:

```rust
// src-tauri/src/integrations/<connector>/mod.rs
pub struct <Connector>Client {
    access_token: String,  // From SecretManager
}

impl <Connector>Client {
    pub async fn list_<resource>(&self, ...) -> Result<Vec<Resource>, Error> { ... }
    pub async fn create_<resource>(&self, ...) -> Result<Resource, Error> { ... }
    pub async fn search(&self, query: &str) -> Result<SearchResults, Error> { ... }
}

// MCP tool definitions registered in mcp/mod.rs
mcp_tool!("gmail_search", gmail_search_handler);
mcp_tool!("gmail_send", gmail_send_handler);
mcp_tool!("gmail_create_draft", gmail_draft_handler);
```

---

## UI: Connectors Marketplace Page

```
/dashboard/connectors
├── Search bar ("Search connectors...")
├── Categories: All | Productivity | Dev | CRM | Marketing | Finance | Social | AI
├── Connected (N) — connected integrations with status indicator
└── Available — cards with Connect button
    └── ConnectorCard: icon, name, description, action count, Connect CTA
```

OAuth flow: `Connect` → OS browser opens OAuth URL → callback to `agi://oauth/callback?code=...&state=...` → Tauri handles, stores token in SecretManager → card shows "Connected ✓"

---

## Connector Card UI (matches Perplexity design)

```
┌─────────────────────────────────┐
│  [Icon]  Gmail with Calendar    │
│          Search, create, and    │
│          manage your emails and │
│          calendar events        │
│                        [Connect]│
└─────────────────────────────────┘
```

Connected state:
```
┌─────────────────────────────────┐
│  [Icon]  Gmail with Calendar    │
│          Search, create, and    │
│          manage your emails...  │
│              ✓ Connected  [···] │
└─────────────────────────────────┘
```

---

*Last updated: 2026-02-28*
*Reference: Perplexity Computer connector list — 105 connectors*

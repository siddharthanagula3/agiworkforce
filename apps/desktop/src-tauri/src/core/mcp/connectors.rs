//! Pre-configured MCP connector manifests.
//!
//! Provides a catalog of 87 built-in connector definitions that the frontend
//! can display in a connector marketplace. Each manifest describes the MCP
//! server package, auth requirements, icon, and documentation links so users
//! can one-click install popular integrations.

use super::config::McpServerConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Types ────────────────────────────────────────────────────────────────────

/// A pre-configured connector definition for the built-in marketplace.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectorManifest {
    /// Unique identifier (e.g., "github", "slack").
    pub id: String,
    /// Human-readable display name.
    pub name: String,
    /// Short description of what this connector provides.
    pub description: String,
    /// Category for marketplace grouping.
    pub category: ConnectorCategory,
    /// Lucide icon name for the frontend.
    pub icon: String,
    /// Authentication type required by this connector.
    pub auth_type: AuthType,
    /// MCP server configuration (command, args, env placeholders).
    pub mcp_config: McpServerConfig,
    /// URL where the user can create credentials / enable the integration.
    pub setup_url: Option<String>,
    /// Link to the connector's documentation.
    pub docs_url: Option<String>,
}

/// Connector categories for marketplace grouping.
///
/// Aligned with the frontend `ConnectorCategory` type in
/// `apps/desktop/src/components/Connectors/connectorDefinitions.ts`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ConnectorCategory {
    Productivity,
    Development,
    Communication,
    Analytics,
    Storage,
    Design,
    ProjectManagement,
    Business,
    #[serde(rename = "CRM")]
    Crm,
    Finance,
    Marketing,
    #[serde(rename = "AI & ML")]
    AiMl,
    DevOps,
    Automation,
    Research,
    Meetings,
    Content,
    #[serde(rename = "Data & BI")]
    DataBi,
}

/// Authentication mechanism required by a connector.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AuthType {
    OAuth2,
    ApiKey,
    None,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Build a stdio-transport `McpServerConfig` from command, args, and env.
fn stdio_config(command: &str, args: &[&str], env: &[(&str, &str)]) -> McpServerConfig {
    McpServerConfig {
        command: command.to_string(),
        args: args.iter().map(|s| s.to_string()).collect(),
        env: env
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<HashMap<String, String>>(),
        enabled: true,
        transport: None,
    }
}

/// Shorthand to build a manifest entry.
fn manifest(
    id: &str,
    name: &str,
    description: &str,
    category: ConnectorCategory,
    icon: &str,
    auth_type: AuthType,
    mcp_config: McpServerConfig,
    setup_url: Option<&str>,
    docs_url: Option<&str>,
) -> ConnectorManifest {
    ConnectorManifest {
        id: id.to_string(),
        name: name.to_string(),
        description: description.to_string(),
        category,
        icon: icon.to_string(),
        auth_type,
        mcp_config,
        setup_url: setup_url.map(|s| s.to_string()),
        docs_url: docs_url.map(|s| s.to_string()),
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Returns all 87 built-in connector manifests.
///
/// The MCP configs use placeholder env values (e.g. `"YOUR_API_KEY"`) that
/// the frontend should replace with real credentials before connecting.
pub fn get_builtin_connectors() -> Vec<ConnectorManifest> {
    vec![
        // ── Productivity ─────────────────────────────────────────────────
        manifest(
            "google_calendar",
            "Google Calendar",
            "Manage events, check availability, and create meetings from your Google Calendar.",
            ConnectorCategory::Productivity,
            "calendar",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-google-calendar"],
                &[("GOOGLE_CALENDAR_OAUTH_TOKEN", "<from_oauth:google>")],
            ),
            Some("https://console.cloud.google.com/apis/credentials"),
            Some("https://github.com/anthropics/mcp-server-google-calendar"),
        ),
        manifest(
            "google_drive",
            "Google Drive",
            "Search, read, and organize files in Google Drive.",
            ConnectorCategory::Productivity,
            "hard-drive",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@modelcontextprotocol/server-gdrive"],
                &[("GDRIVE_OAUTH_TOKEN", "<from_oauth:google>")],
            ),
            Some("https://console.cloud.google.com/apis/credentials"),
            Some("https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive"),
        ),
        manifest(
            "gmail",
            "Gmail",
            "Read, search, and draft emails in Gmail.",
            ConnectorCategory::Productivity,
            "mail",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-gmail"],
                &[("GMAIL_OAUTH_TOKEN", "<from_oauth:google>")],
            ),
            Some("https://console.cloud.google.com/apis/credentials"),
            Some("https://github.com/anthropics/mcp-server-gmail"),
        ),
        manifest(
            "google_docs",
            "Google Docs",
            "Create, read, and edit Google Docs documents.",
            ConnectorCategory::Productivity,
            "file-text",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-google-docs"],
                &[("GOOGLE_DOCS_OAUTH_TOKEN", "<from_oauth:google>")],
            ),
            Some("https://console.cloud.google.com/apis/credentials"),
            Some("https://github.com/anthropics/mcp-server-google-docs"),
        ),
        manifest(
            "outlook",
            "Microsoft Outlook",
            "Access email, calendar, and contacts via Microsoft Outlook.",
            ConnectorCategory::Productivity,
            "inbox",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-outlook"],
                &[("OUTLOOK_OAUTH_TOKEN", "<from_oauth:microsoft>")],
            ),
            Some("https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps"),
            Some("https://github.com/anthropics/mcp-server-outlook"),
        ),
        manifest(
            "notion",
            "Notion",
            "Search pages, read content, and manage databases in Notion.",
            ConnectorCategory::Productivity,
            "layout-grid",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@notionhq/notion-mcp-server"],
                &[("OPENAPI_MCP_HEADERS", "<from_oauth:notion>")],
            ),
            Some("https://www.notion.so/my-integrations"),
            Some("https://github.com/notionhq/notion-mcp-server"),
        ),
        manifest(
            "todoist",
            "Todoist",
            "Create, list, and manage tasks and projects in Todoist.",
            ConnectorCategory::Productivity,
            "check-square",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-todoist"],
                &[("TODOIST_API_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://todoist.com/app/settings/integrations/developer"),
            Some("https://github.com/anthropics/mcp-server-todoist"),
        ),
        manifest(
            "airtable",
            "Airtable",
            "Read, create, and update records in Airtable bases and tables.",
            ConnectorCategory::Productivity,
            "grid",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-airtable"],
                &[("AIRTABLE_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://airtable.com/account"),
            Some("https://github.com/anthropics/mcp-server-airtable"),
        ),
        manifest(
            "monday",
            "Monday.com",
            "Manage boards, items, and workflows in Monday.com.",
            ConnectorCategory::Productivity,
            "columns",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-monday"],
                &[("MONDAY_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://monday.com/developers/apps"),
            Some("https://github.com/anthropics/mcp-server-monday"),
        ),
        manifest(
            "clickup",
            "ClickUp",
            "Manage tasks, docs, goals, and sprints in ClickUp workspaces.",
            ConnectorCategory::Productivity,
            "check-circle",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-clickup"],
                &[("CLICKUP_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://clickup.com/integrations"),
            Some("https://clickup.com/api"),
        ),
        manifest(
            "asana",
            "Asana",
            "Coordinate tasks, projects, and goals across your team in Asana.",
            ConnectorCategory::Productivity,
            "list-checks",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-asana"],
                &[("ASANA_ACCESS_TOKEN", "<from_oauth:asana>")],
            ),
            Some("https://app.asana.com/0/developer-console"),
            Some("https://developers.asana.com/docs"),
        ),
        manifest(
            "basecamp",
            "Basecamp",
            "Manage projects, to-dos, messages, and schedules in Basecamp.",
            ConnectorCategory::Productivity,
            "tent",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-basecamp"],
                &[("BASECAMP_ACCESS_TOKEN", "<from_oauth:basecamp>")],
            ),
            Some("https://launchpad.37signals.com/integrations"),
            Some("https://github.com/basecamp/bc3-api"),
        ),
        manifest(
            "trello",
            "Trello",
            "Manage boards, lists, and cards for visual project tracking in Trello.",
            ConnectorCategory::Productivity,
            "layout-kanban",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-trello"],
                &[
                    ("TRELLO_API_KEY", "YOUR_API_KEY"),
                    ("TRELLO_TOKEN", "YOUR_TOKEN"),
                ],
            ),
            Some("https://trello.com/power-ups/admin"),
            Some("https://developer.atlassian.com/cloud/trello/rest/"),
        ),
        manifest(
            "confluence",
            "Confluence",
            "Search, read, and create pages in your Confluence wiki.",
            ConnectorCategory::Productivity,
            "book-open",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-confluence"],
                &[("CONFLUENCE_OAUTH_TOKEN", "<from_oauth:atlassian>")],
            ),
            Some("https://id.atlassian.com/manage-profile/security/api-tokens"),
            Some("https://developer.atlassian.com/cloud/confluence/rest/v2/"),
        ),
        // ── Development ──────────────────────────────────────────────────
        manifest(
            "github",
            "GitHub",
            "Manage repositories, issues, pull requests, and code on GitHub.",
            ConnectorCategory::Development,
            "github",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@modelcontextprotocol/server-github"],
                &[("GITHUB_PERSONAL_ACCESS_TOKEN", "<from_oauth:github>")],
            ),
            Some("https://github.com/settings/tokens"),
            Some("https://github.com/modelcontextprotocol/servers/tree/main/src/github"),
        ),
        manifest(
            "gitlab",
            "GitLab",
            "Interact with GitLab repositories, merge requests, and CI/CD pipelines.",
            ConnectorCategory::Development,
            "gitlab",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@modelcontextprotocol/server-gitlab"],
                &[("GITLAB_PERSONAL_ACCESS_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://gitlab.com/-/user_settings/personal_access_tokens"),
            Some("https://github.com/modelcontextprotocol/servers/tree/main/src/gitlab"),
        ),
        manifest(
            "linear",
            "Linear",
            "Track issues, manage sprints, and organize projects in Linear.",
            ConnectorCategory::Development,
            "zap",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-linear"],
                &[("LINEAR_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://linear.app/settings/api"),
            Some("https://github.com/jerhadf/linear-mcp-server"),
        ),
        manifest(
            "sentry",
            "Sentry",
            "Query errors, manage issues, and monitor application health in Sentry.",
            ConnectorCategory::Development,
            "bug",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@sentry/mcp-server"],
                &[("SENTRY_AUTH_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://sentry.io/settings/account/api/auth-tokens/"),
            Some("https://github.com/getsentry/sentry-mcp"),
        ),
        manifest(
            "vercel",
            "Vercel",
            "Deploy projects, manage domains, and view logs on Vercel.",
            ConnectorCategory::Development,
            "triangle",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@vercel/mcp"],
                &[("VERCEL_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://vercel.com/account/tokens"),
            Some("https://github.com/vercel/mcp"),
        ),
        manifest(
            "supabase",
            "Supabase",
            "Manage databases, auth, storage, and edge functions in Supabase.",
            ConnectorCategory::Development,
            "database",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-supabase"],
                &[
                    ("SUPABASE_URL", "YOUR_PROJECT_URL"),
                    ("SUPABASE_KEY", "YOUR_API_KEY"),
                ],
            ),
            Some("https://supabase.com/dashboard/project/_/settings/api"),
            Some("https://github.com/anthropics/mcp-server-supabase"),
        ),
        manifest(
            "postgresql",
            "PostgreSQL",
            "Query tables, inspect schemas, and manage data in PostgreSQL databases.",
            ConnectorCategory::Development,
            "table",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-postgres"],
                &[("DATABASE_URL", "YOUR_DATABASE_URL")],
            ),
            None,
            Some("https://github.com/anthropics/mcp-server-postgres"),
        ),
        manifest(
            "mongodb",
            "MongoDB",
            "Query collections, manage documents, and inspect schemas in MongoDB.",
            ConnectorCategory::Development,
            "leaf",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-mongodb"],
                &[("MONGODB_URI", "YOUR_CONNECTION_URI")],
            ),
            Some("https://cloud.mongodb.com/"),
            Some("https://github.com/anthropics/mcp-server-mongodb"),
        ),
        // ── Project Management ───────────────────────────────────────────
        manifest(
            "jira",
            "Jira",
            "Create and manage Jira issues, sprints, and boards.",
            ConnectorCategory::ProjectManagement,
            "clipboard-list",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-jira"],
                &[("JIRA_OAUTH_TOKEN", "<from_oauth:atlassian>")],
            ),
            Some("https://id.atlassian.com/manage-profile/security/api-tokens"),
            Some("https://github.com/anthropics/mcp-server-jira"),
        ),
        // ── Communication ────────────────────────────────────────────────
        manifest(
            "slack",
            "Slack",
            "Send messages, search channels, and manage Slack workspaces.",
            ConnectorCategory::Communication,
            "message-square",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@modelcontextprotocol/server-slack"],
                &[("SLACK_BOT_TOKEN", "<from_oauth:slack>")],
            ),
            Some("https://api.slack.com/apps"),
            Some("https://github.com/modelcontextprotocol/servers/tree/main/src/slack"),
        ),
        manifest(
            "discord",
            "Discord",
            "Read messages, manage channels, and interact with Discord servers.",
            ConnectorCategory::Communication,
            "message-circle",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-discord"],
                &[("DISCORD_BOT_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://discord.com/developers/applications"),
            Some("https://github.com/v-3/mcp-discord"),
        ),
        manifest(
            "microsoft_teams",
            "Microsoft Teams",
            "Send messages, manage channels, and schedule meetings in Teams.",
            ConnectorCategory::Communication,
            "users",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-teams"],
                &[("TEAMS_OAUTH_TOKEN", "<from_oauth:microsoft>")],
            ),
            Some("https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps"),
            Some("https://github.com/anthropics/mcp-server-teams"),
        ),
        manifest(
            "twilio",
            "Twilio",
            "Send SMS, make calls, and manage phone numbers with Twilio.",
            ConnectorCategory::Communication,
            "phone",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-twilio"],
                &[
                    ("TWILIO_ACCOUNT_SID", "YOUR_ACCOUNT_SID"),
                    ("TWILIO_AUTH_TOKEN", "YOUR_AUTH_TOKEN"),
                ],
            ),
            Some("https://console.twilio.com/"),
            Some("https://github.com/anthropics/mcp-server-twilio"),
        ),
        manifest(
            "sendgrid",
            "SendGrid",
            "Send transactional and marketing emails via SendGrid.",
            ConnectorCategory::Communication,
            "send",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-sendgrid"],
                &[("SENDGRID_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://app.sendgrid.com/settings/api_keys"),
            Some("https://github.com/anthropics/mcp-server-sendgrid"),
        ),
        manifest(
            "intercom",
            "Intercom",
            "Manage customer conversations, help articles, and support workflows in Intercom.",
            ConnectorCategory::Communication,
            "message-circle-more",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-intercom"],
                &[("INTERCOM_ACCESS_TOKEN", "<from_oauth:intercom>")],
            ),
            Some("https://app.intercom.com/a/developer-signup"),
            Some("https://developers.intercom.com/docs"),
        ),
        manifest(
            "zoom",
            "Zoom",
            "Schedule meetings, manage recordings, and access transcripts in Zoom.",
            ConnectorCategory::Communication,
            "video",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-zoom"],
                &[("ZOOM_ACCESS_TOKEN", "<from_oauth:zoom>")],
            ),
            Some("https://marketplace.zoom.us/develop/create"),
            Some("https://developers.zoom.us/docs/api/"),
        ),
        manifest(
            "front",
            "Front",
            "Manage shared inboxes, conversations, and team communication in Front.",
            ConnectorCategory::Communication,
            "inbox",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-front"],
                &[("FRONT_API_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://app.frontapp.com/settings/tools/api"),
            Some("https://dev.frontapp.com/docs/welcome"),
        ),
        // ── Analytics ────────────────────────────────────────────────────
        manifest(
            "google_analytics",
            "Google Analytics",
            "Query website traffic, user behavior, and conversion data from Google Analytics.",
            ConnectorCategory::Analytics,
            "bar-chart-2",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-google-analytics"],
                &[("GOOGLE_ANALYTICS_OAUTH_TOKEN", "<from_oauth:google>")],
            ),
            Some("https://console.cloud.google.com/apis/credentials"),
            Some("https://github.com/anthropics/mcp-server-google-analytics"),
        ),
        manifest(
            "mixpanel",
            "Mixpanel",
            "Analyze product usage, funnels, and retention metrics from Mixpanel.",
            ConnectorCategory::Analytics,
            "activity",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-mixpanel"],
                &[("MIXPANEL_API_SECRET", "YOUR_API_KEY")],
            ),
            Some("https://mixpanel.com/settings/project#serviceaccounts"),
            Some("https://github.com/anthropics/mcp-server-mixpanel"),
        ),
        manifest(
            "amplitude",
            "Amplitude",
            "Query event data, user segments, and analytics dashboards from Amplitude.",
            ConnectorCategory::Analytics,
            "trending-up",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-amplitude"],
                &[("AMPLITUDE_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://analytics.amplitude.com/settings/profile"),
            Some("https://github.com/anthropics/mcp-server-amplitude"),
        ),
        manifest(
            "posthog",
            "PostHog",
            "Query events, analyze funnels, and manage feature flags in PostHog.",
            ConnectorCategory::Analytics,
            "bar-chart-3",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-posthog"],
                &[
                    ("POSTHOG_API_KEY", "YOUR_API_KEY"),
                    ("POSTHOG_HOST", "https://app.posthog.com"),
                ],
            ),
            Some("https://posthog.com/docs/api"),
            Some("https://posthog.com/docs/api"),
        ),
        // ── Storage ──────────────────────────────────────────────────────
        manifest(
            "dropbox",
            "Dropbox",
            "Browse, upload, and manage files in Dropbox.",
            ConnectorCategory::Storage,
            "cloud",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-dropbox"],
                &[("DROPBOX_ACCESS_TOKEN", "<from_oauth:dropbox>")],
            ),
            Some("https://www.dropbox.com/developers/apps"),
            Some("https://github.com/anthropics/mcp-server-dropbox"),
        ),
        manifest(
            "box",
            "Box",
            "Access, search, and manage content stored in Box.",
            ConnectorCategory::Storage,
            "archive",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-box"],
                &[("BOX_ACCESS_TOKEN", "<from_oauth:box>")],
            ),
            Some("https://developer.box.com/console"),
            Some("https://github.com/anthropics/mcp-server-box"),
        ),
        manifest(
            "aws_s3",
            "AWS S3",
            "List buckets, read objects, and manage files in Amazon S3.",
            ConnectorCategory::Storage,
            "database",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-s3"],
                &[
                    ("AWS_ACCESS_KEY_ID", "YOUR_ACCESS_KEY"),
                    ("AWS_SECRET_ACCESS_KEY", "YOUR_SECRET_KEY"),
                ],
            ),
            Some("https://console.aws.amazon.com/iam/home#/security_credentials"),
            Some("https://github.com/anthropics/mcp-server-s3"),
        ),
        // ── Design ───────────────────────────────────────────────────────
        manifest(
            "figma",
            "Figma",
            "Inspect designs, extract assets, and read design tokens from Figma.",
            ConnectorCategory::Design,
            "pen-tool",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "@figma/mcp-server-figma"],
                &[("FIGMA_ACCESS_TOKEN", "<from_oauth:figma>")],
            ),
            Some("https://www.figma.com/developers/api#access-tokens"),
            Some("https://github.com/figma/mcp-server-figma"),
        ),
        manifest(
            "canva",
            "Canva",
            "Create designs, manage templates, and export assets from Canva.",
            ConnectorCategory::Design,
            "palette",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-canva"],
                &[("CANVA_ACCESS_TOKEN", "<from_oauth:canva>")],
            ),
            Some("https://www.canva.com/developers/"),
            Some("https://github.com/anthropics/mcp-server-canva"),
        ),
        manifest(
            "miro",
            "Miro",
            "Access, create, and collaborate on Miro whiteboard content.",
            ConnectorCategory::Design,
            "frame",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-miro"],
                &[("MIRO_ACCESS_TOKEN", "<from_oauth:miro>")],
            ),
            Some("https://miro.com/app/settings/user-profile/apps"),
            Some("https://developers.miro.com/docs"),
        ),
        // ── CRM ──────────────────────────────────────────────────────────
        manifest(
            "salesforce",
            "Salesforce",
            "Query records, manage leads, and automate workflows in Salesforce.",
            ConnectorCategory::Crm,
            "briefcase",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-salesforce"],
                &[("SALESFORCE_ACCESS_TOKEN", "<from_oauth:salesforce>")],
            ),
            Some("https://login.salesforce.com/"),
            Some("https://github.com/anthropics/mcp-server-salesforce"),
        ),
        manifest(
            "hubspot",
            "HubSpot",
            "Manage contacts, deals, and marketing campaigns in HubSpot.",
            ConnectorCategory::Crm,
            "handshake",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-hubspot"],
                &[("HUBSPOT_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://app.hubspot.com/developer/"),
            Some("https://github.com/anthropics/mcp-server-hubspot"),
        ),
        manifest(
            "attio",
            "Attio",
            "Search, manage, and update CRM records and pipelines in Attio.",
            ConnectorCategory::Crm,
            "contact",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-attio"],
                &[("ATTIO_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://app.attio.com/settings/developers"),
            Some("https://developers.attio.com"),
        ),
        manifest(
            "apollo",
            "Apollo.io",
            "Find prospects, enrich contacts, and manage sales sequences in Apollo.",
            ConnectorCategory::Crm,
            "target",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-apollo"],
                &[("APOLLO_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://app.apollo.io/#/settings/integrations/api"),
            Some("https://apolloio.github.io/apollo-api-docs/"),
        ),
        manifest(
            "common_room",
            "Common Room",
            "Analyze community engagement, member activity, and signal data.",
            ConnectorCategory::Crm,
            "home",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-common-room"],
                &[("COMMON_ROOM_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://app.commonroom.io/settings/api"),
            Some("https://docs.commonroom.io/"),
        ),
        // ── Business ─────────────────────────────────────────────────────
        manifest(
            "stripe",
            "Stripe",
            "Manage payments, subscriptions, invoices, and customers in Stripe.",
            ConnectorCategory::Business,
            "credit-card",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-stripe"],
                &[("STRIPE_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://dashboard.stripe.com/apikeys"),
            Some("https://github.com/anthropics/mcp-server-stripe"),
        ),
        manifest(
            "shopify",
            "Shopify",
            "Manage products, orders, and customers in your Shopify store.",
            ConnectorCategory::Business,
            "shopping-bag",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-shopify"],
                &[
                    ("SHOPIFY_ACCESS_TOKEN", "YOUR_API_KEY"),
                    ("SHOPIFY_STORE_URL", "YOUR_STORE_URL"),
                ],
            ),
            Some("https://partners.shopify.com/"),
            Some("https://github.com/anthropics/mcp-server-shopify"),
        ),
        manifest(
            "zendesk",
            "Zendesk",
            "Manage support tickets, users, and help center articles in Zendesk.",
            ConnectorCategory::Business,
            "headphones",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "@anthropic/mcp-server-zendesk"],
                &[
                    ("ZENDESK_SUBDOMAIN", "YOUR_SUBDOMAIN"),
                    ("ZENDESK_TOKEN", "YOUR_API_KEY"),
                ],
            ),
            Some("https://support.zendesk.com/hc/en-us/articles/4408889192858"),
            Some("https://github.com/anthropics/mcp-server-zendesk"),
        ),
        // ── Finance ──────────────────────────────────────────────────────
        manifest(
            "plaid",
            "Plaid",
            "Connect to bank accounts, verify identity, and access financial data via Plaid.",
            ConnectorCategory::Finance,
            "landmark",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-plaid"],
                &[
                    ("PLAID_CLIENT_ID", "YOUR_CLIENT_ID"),
                    ("PLAID_SECRET", "YOUR_SECRET"),
                ],
            ),
            Some("https://dashboard.plaid.com/team/keys"),
            Some("https://plaid.com/docs/"),
        ),
        manifest(
            "airwallex",
            "Airwallex",
            "Manage global payments, transfers, and multi-currency accounts in Airwallex.",
            ConnectorCategory::Finance,
            "globe",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-airwallex"],
                &[("AIRWALLEX_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://www.airwallex.com/app/account/apiKeys"),
            Some("https://www.airwallex.com/docs/api"),
        ),
        manifest(
            "factset",
            "FactSet",
            "Access financial analytics, market data, and company fundamentals from FactSet.",
            ConnectorCategory::Finance,
            "line-chart",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-factset"],
                &[
                    ("FACTSET_USERNAME", "YOUR_USERNAME"),
                    ("FACTSET_API_KEY", "YOUR_API_KEY"),
                ],
            ),
            Some("https://developer.factset.com/"),
            Some("https://developer.factset.com/api-catalog"),
        ),
        manifest(
            "pitchbook",
            "PitchBook",
            "Access private market data, deal flow, and company profiles from PitchBook.",
            ConnectorCategory::Finance,
            "pie-chart",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-pitchbook"],
                &[("PITCHBOOK_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://pitchbook.com/data/api"),
            Some("https://pitchbook.com/data/api"),
        ),
        manifest(
            "moodys",
            "Moody's",
            "Access credit ratings, risk assessments, and economic data from Moody's.",
            ConnectorCategory::Finance,
            "shield-check",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-moodys"],
                &[("MOODYS_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://www.economy.com/products/api"),
            Some("https://www.economy.com/developer"),
        ),
        manifest(
            "lseg",
            "LSEG (Refinitiv)",
            "Access real-time market data, news, and analytics from LSEG Refinitiv.",
            ConnectorCategory::Finance,
            "candlestick-chart",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-lseg"],
                &[("LSEG_APP_KEY", "YOUR_APP_KEY")],
            ),
            Some("https://developers.lseg.com/"),
            Some("https://developers.lseg.com/en/api-catalog"),
        ),
        manifest(
            "aiera",
            "Aiera",
            "Access live financial events, earnings calls, and SEC filings via Aiera.",
            ConnectorCategory::Finance,
            "radio",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-aiera"],
                &[("AIERA_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://aiera.com/"),
            Some("https://aiera.com/aiera-for-enterprise"),
        ),
        manifest(
            "bigdata",
            "Bigdata.com",
            "Access financial intelligence, company data, and market signals from Bigdata.com.",
            ConnectorCategory::Finance,
            "database",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-bigdata"],
                &[("BIGDATA_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://bigdata.com/"),
            Some("https://bigdata.com/developers"),
        ),
        manifest(
            "daloopa",
            "Daloopa",
            "Extract and access standardized financial data from SEC filings and reports.",
            ConnectorCategory::Finance,
            "file-spreadsheet",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-daloopa"],
                &[("DALOOPA_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://www.daloopa.com/"),
            Some("https://www.daloopa.com/api-docs"),
        ),
        // ── Marketing ────────────────────────────────────────────────────
        manifest(
            "mailchimp",
            "Mailchimp",
            "Manage email campaigns, audiences, and marketing automations in Mailchimp.",
            ConnectorCategory::Marketing,
            "mail-open",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-mailchimp"],
                &[("MAILCHIMP_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://us1.admin.mailchimp.com/account/api/"),
            Some("https://mailchimp.com/developer/"),
        ),
        manifest(
            "activecampaign",
            "ActiveCampaign",
            "Automate email marketing, manage contacts, and run campaigns in ActiveCampaign.",
            ConnectorCategory::Marketing,
            "mail-check",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-activecampaign"],
                &[
                    ("ACTIVECAMPAIGN_URL", "YOUR_ACCOUNT_URL"),
                    ("ACTIVECAMPAIGN_API_KEY", "YOUR_API_KEY"),
                ],
            ),
            Some("https://www.activecampaign.com/partner/"),
            Some("https://developers.activecampaign.com/"),
        ),
        manifest(
            "ahrefs",
            "Ahrefs",
            "Analyze backlinks, keywords, and SEO performance with Ahrefs data.",
            ConnectorCategory::Marketing,
            "search",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-ahrefs"],
                &[("AHREFS_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://ahrefs.com/api"),
            Some("https://docs.ahrefs.com/"),
        ),
        manifest(
            "airops",
            "AirOps",
            "Build, run, and scale AI-powered content workflows with AirOps.",
            ConnectorCategory::Marketing,
            "wind",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-airops"],
                &[("AIROPS_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://app.airops.com/settings/api"),
            Some("https://docs.airops.com/"),
        ),
        manifest(
            "bitly",
            "Bitly",
            "Create, manage, and analyze short links and QR codes with Bitly.",
            ConnectorCategory::Marketing,
            "link",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-bitly"],
                &[("BITLY_ACCESS_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://app.bitly.com/settings/api/"),
            Some("https://dev.bitly.com/"),
        ),
        // ── Data & BI ────────────────────────────────────────────────────
        manifest(
            "snowflake",
            "Snowflake",
            "Query data warehouses, manage databases, and run analytics in Snowflake.",
            ConnectorCategory::DataBi,
            "snowflake",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-snowflake"],
                &[
                    ("SNOWFLAKE_ACCOUNT", "YOUR_ACCOUNT"),
                    ("SNOWFLAKE_USER", "YOUR_USER"),
                    ("SNOWFLAKE_PASSWORD", "YOUR_PASSWORD"),
                ],
            ),
            Some("https://app.snowflake.com/"),
            Some("https://docs.snowflake.com/en/developer-guide"),
        ),
        manifest(
            "databricks",
            "Databricks",
            "Run notebooks, query data, and manage ML models in Databricks lakehouse.",
            ConnectorCategory::DataBi,
            "layers",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-databricks"],
                &[
                    ("DATABRICKS_HOST", "YOUR_WORKSPACE_URL"),
                    ("DATABRICKS_TOKEN", "YOUR_API_KEY"),
                ],
            ),
            Some("https://docs.databricks.com/en/dev-tools/auth/pat.html"),
            Some("https://docs.databricks.com/api/"),
        ),
        manifest(
            "bigquery",
            "BigQuery",
            "Run SQL queries, manage datasets, and analyze data in Google BigQuery.",
            ConnectorCategory::DataBi,
            "bar-chart",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-bigquery"],
                &[("BIGQUERY_OAUTH_TOKEN", "<from_oauth:google>")],
            ),
            Some("https://console.cloud.google.com/bigquery"),
            Some("https://cloud.google.com/bigquery/docs"),
        ),
        // ── DevOps ───────────────────────────────────────────────────────
        manifest(
            "circleci",
            "CircleCI",
            "Manage pipelines, view build status, and trigger workflows in CircleCI.",
            ConnectorCategory::DevOps,
            "refresh-cw",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-circleci"],
                &[("CIRCLECI_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://app.circleci.com/settings/user/tokens"),
            Some("https://circleci.com/docs/api/v2/"),
        ),
        manifest(
            "jenkins",
            "Jenkins",
            "Trigger builds, view job status, and manage Jenkins CI/CD pipelines.",
            ConnectorCategory::DevOps,
            "hard-hat",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-jenkins"],
                &[
                    ("JENKINS_URL", "YOUR_JENKINS_URL"),
                    ("JENKINS_USER", "YOUR_USER"),
                    ("JENKINS_TOKEN", "YOUR_API_TOKEN"),
                ],
            ),
            None,
            Some("https://www.jenkins.io/doc/book/using/remote-access-api/"),
        ),
        manifest(
            "terraform",
            "Terraform Cloud",
            "Manage infrastructure workspaces, runs, and state in Terraform Cloud.",
            ConnectorCategory::DevOps,
            "boxes",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-terraform"],
                &[("TFE_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://app.terraform.io/app/settings/tokens"),
            Some("https://developer.hashicorp.com/terraform/cloud-docs/api-docs"),
        ),
        manifest(
            "pagerduty",
            "PagerDuty",
            "Manage incidents, on-call schedules, and escalation policies in PagerDuty.",
            ConnectorCategory::DevOps,
            "alert-triangle",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-pagerduty"],
                &[("PAGERDUTY_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://support.pagerduty.com/docs/api-access-keys"),
            Some("https://developer.pagerduty.com/docs/"),
        ),
        manifest(
            "datadog",
            "Datadog",
            "Query metrics, manage monitors, and view dashboards in Datadog.",
            ConnectorCategory::DevOps,
            "dog",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-datadog"],
                &[
                    ("DD_API_KEY", "YOUR_API_KEY"),
                    ("DD_APP_KEY", "YOUR_APP_KEY"),
                ],
            ),
            Some("https://app.datadoghq.com/organization-settings/api-keys"),
            Some("https://docs.datadoghq.com/api/"),
        ),
        manifest(
            "new_relic",
            "New Relic",
            "Query telemetry data, manage alerts, and monitor services in New Relic.",
            ConnectorCategory::DevOps,
            "gauge",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-newrelic"],
                &[("NEW_RELIC_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://one.newrelic.com/launcher/api-keys-ui.api-keys-launcher"),
            Some("https://docs.newrelic.com/docs/apis/"),
        ),
        manifest(
            "railway",
            "Railway",
            "Deploy services, manage databases, and view logs on Railway.",
            ConnectorCategory::DevOps,
            "train-front",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-railway"],
                &[("RAILWAY_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://railway.app/account/tokens"),
            Some("https://docs.railway.app/reference/public-api"),
        ),
        manifest(
            "render",
            "Render",
            "Deploy web services, databases, and static sites on Render.",
            ConnectorCategory::DevOps,
            "server",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-render"],
                &[("RENDER_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://dashboard.render.com/u/settings#api-keys"),
            Some("https://api-docs.render.com/reference/introduction"),
        ),
        manifest(
            "flyio",
            "Fly.io",
            "Deploy apps globally, manage machines, and scale services on Fly.io.",
            ConnectorCategory::DevOps,
            "plane",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-flyio"],
                &[("FLY_API_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://fly.io/user/personal_access_tokens"),
            Some("https://fly.io/docs/machines/api/"),
        ),
        manifest(
            "cloudflare",
            "Cloudflare Workers",
            "Deploy workers, manage DNS, and configure CDN settings in Cloudflare.",
            ConnectorCategory::DevOps,
            "cloud-cog",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-cloudflare"],
                &[("CLOUDFLARE_API_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://dash.cloudflare.com/profile/api-tokens"),
            Some("https://developers.cloudflare.com/api/"),
        ),
        // ── Automation ───────────────────────────────────────────────────
        manifest(
            "zapier",
            "Zapier",
            "Automate workflows across thousands of apps via conversation with Zapier.",
            ConnectorCategory::Automation,
            "workflow",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-zapier"],
                &[("ZAPIER_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://zapier.com/app/developer"),
            Some("https://docs.zapier.com/"),
        ),
        // ── Research ─────────────────────────────────────────────────────
        manifest(
            "pubmed",
            "PubMed",
            "Search and retrieve biomedical literature from NCBI PubMed.",
            ConnectorCategory::Research,
            "microscope",
            AuthType::None,
            stdio_config(
                "npx",
                &["-y", "mcp-pubmed"],
                &[],
            ),
            None,
            Some("https://pubmed.ncbi.nlm.nih.gov/"),
        ),
        manifest(
            "biorxiv",
            "bioRxiv",
            "Search and access preprints in biology and life sciences from bioRxiv.",
            ConnectorCategory::Research,
            "flask-conical",
            AuthType::None,
            stdio_config(
                "npx",
                &["-y", "mcp-biorxiv"],
                &[],
            ),
            None,
            Some("https://api.biorxiv.org/"),
        ),
        manifest(
            "benchling",
            "Benchling",
            "Manage experiments, samples, and R&D workflows in Benchling.",
            ConnectorCategory::Research,
            "test-tubes",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-benchling"],
                &[
                    ("BENCHLING_TENANT", "YOUR_TENANT"),
                    ("BENCHLING_API_KEY", "YOUR_API_KEY"),
                ],
            ),
            Some("https://benchling.com/settings/developer"),
            Some("https://docs.benchling.com/docs"),
        ),
        manifest(
            "tenx_genomics",
            "10x Genomics Cloud",
            "Access single-cell genomics data and analysis pipelines from 10x Genomics.",
            ConnectorCategory::Research,
            "dna",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-10x-genomics"],
                &[("TENX_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://cloud.10xgenomics.com/"),
            Some("https://www.10xgenomics.com/support/cloud"),
        ),
        manifest(
            "biorender",
            "BioRender",
            "Create and manage scientific figures and templates with BioRender.",
            ConnectorCategory::Research,
            "image",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-biorender"],
                &[("BIORENDER_ACCESS_TOKEN", "<from_oauth:biorender>")],
            ),
            Some("https://biorender.com/"),
            Some("https://biorender.com/api"),
        ),
        // ── Meetings ─────────────────────────────────────────────────────
        manifest(
            "fireflies",
            "Fireflies.ai",
            "Analyze meeting transcripts and extract action items from Fireflies recordings.",
            ConnectorCategory::Meetings,
            "flame",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-fireflies"],
                &[("FIREFLIES_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://app.fireflies.ai/integrations"),
            Some("https://docs.fireflies.ai/"),
        ),
        // ── AI & ML ──────────────────────────────────────────────────────
        manifest(
            "huggingface",
            "Hugging Face",
            "Access models, datasets, and inference endpoints on Hugging Face Hub.",
            ConnectorCategory::AiMl,
            "brain",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-huggingface"],
                &[("HUGGINGFACE_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://huggingface.co/settings/tokens"),
            Some("https://huggingface.co/docs/api-inference"),
        ),
        manifest(
            "elevenlabs",
            "ElevenLabs",
            "Generate speech, clone voices, and create sound effects with ElevenLabs.",
            ConnectorCategory::AiMl,
            "audio-waveform",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-elevenlabs"],
                &[("ELEVENLABS_API_KEY", "YOUR_API_KEY")],
            ),
            Some("https://elevenlabs.io/app/settings/api-keys"),
            Some("https://elevenlabs.io/docs/api-reference"),
        ),
        // ── Content ──────────────────────────────────────────────────────
        manifest(
            "wordpress",
            "WordPress",
            "Manage posts, pages, and media on your WordPress site.",
            ConnectorCategory::Content,
            "file-edit",
            AuthType::OAuth2,
            stdio_config(
                "npx",
                &["-y", "mcp-wordpress"],
                &[("WORDPRESS_ACCESS_TOKEN", "<from_oauth:wordpress>")],
            ),
            Some("https://developer.wordpress.com/apps/"),
            Some("https://developer.wordpress.com/docs/api/"),
        ),
        manifest(
            "webflow",
            "Webflow",
            "Manage CMS collections, publish pages, and update site content in Webflow.",
            ConnectorCategory::Content,
            "globe",
            AuthType::ApiKey,
            stdio_config(
                "npx",
                &["-y", "mcp-webflow"],
                &[("WEBFLOW_API_TOKEN", "YOUR_API_KEY")],
            ),
            Some("https://webflow.com/dashboard/account/integrations"),
            Some("https://developers.webflow.com/"),
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_connectors_has_expected_count() {
        let connectors = get_builtin_connectors();
        assert_eq!(connectors.len(), 87);
    }

    #[test]
    fn all_connector_ids_are_unique() {
        let connectors = get_builtin_connectors();
        let mut ids: Vec<&str> = connectors.iter().map(|c| c.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), connectors.len());
    }

    #[test]
    fn all_original_categories_are_represented() {
        let connectors = get_builtin_connectors();
        let categories: std::collections::HashSet<_> =
            connectors.iter().map(|c| &c.category).collect();
        assert!(categories.contains(&ConnectorCategory::Productivity));
        assert!(categories.contains(&ConnectorCategory::Development));
        assert!(categories.contains(&ConnectorCategory::Communication));
        assert!(categories.contains(&ConnectorCategory::Analytics));
        assert!(categories.contains(&ConnectorCategory::Storage));
        assert!(categories.contains(&ConnectorCategory::Design));
        assert!(categories.contains(&ConnectorCategory::Crm));
        assert!(categories.contains(&ConnectorCategory::Business));
        assert!(categories.contains(&ConnectorCategory::ProjectManagement));
    }

    #[test]
    fn new_categories_are_represented() {
        let connectors = get_builtin_connectors();
        let categories: std::collections::HashSet<_> =
            connectors.iter().map(|c| &c.category).collect();
        assert!(categories.contains(&ConnectorCategory::Finance));
        assert!(categories.contains(&ConnectorCategory::Marketing));
        assert!(categories.contains(&ConnectorCategory::DevOps));
        assert!(categories.contains(&ConnectorCategory::Research));
        assert!(categories.contains(&ConnectorCategory::AiMl));
        assert!(categories.contains(&ConnectorCategory::DataBi));
        assert!(categories.contains(&ConnectorCategory::Automation));
        assert!(categories.contains(&ConnectorCategory::Meetings));
        assert!(categories.contains(&ConnectorCategory::Content));
    }

    #[test]
    fn all_connectors_have_nonempty_fields() {
        for c in get_builtin_connectors() {
            assert!(!c.id.is_empty(), "connector id is empty");
            assert!(!c.name.is_empty(), "connector name is empty for {}", c.id);
            assert!(
                !c.description.is_empty(),
                "connector description is empty for {}",
                c.id
            );
            assert!(!c.icon.is_empty(), "connector icon is empty for {}", c.id);
            assert!(
                !c.mcp_config.command.is_empty(),
                "connector command is empty for {}",
                c.id
            );
            assert!(
                !c.mcp_config.args.is_empty(),
                "connector args is empty for {}",
                c.id
            );
        }
    }
}

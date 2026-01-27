# Clawdbot Research & Implementation Plan for AGI Workforce

> **Research Date:** January 27, 2026
> **Purpose:** Document features from Clawdbot to adopt in AGI Workforce
> **Repository:** https://github.com/clawdbot/clawdbot (55,000+ stars)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Clawdbot Architecture Overview](#clawdbot-architecture-overview)
3. [Feature Analysis](#feature-analysis)
4. [Implementation Priorities](#implementation-priorities)
5. [Technical Specifications](#technical-specifications)
6. [File-by-File Implementation Guide](#file-by-file-implementation-guide)
7. [Testing Strategy](#testing-strategy)
8. [Migration Notes](#migration-notes)

---

## Executive Summary

Clawdbot is an open-source, self-hosted AI assistant that went viral in late 2025/early 2026. Key differentiators:

- **Multi-channel messaging**: WhatsApp, Telegram, Slack, Discord, Signal, iMessage
- **Proactive AI**: Cron-based scheduling for morning briefings, reminders, alerts
- **Persistent memory**: Two-layer system with daily logs + curated long-term memory
- **Skills system**: Accessible plugin format using SKILL.md + TypeScript
- **Gateway architecture**: WebSocket-based control plane at localhost:18789

### What AGI Workforce Should Adopt

| Priority | Feature                              | Effort  | Impact    |
| -------- | ------------------------------------ | ------- | --------- |
| P0       | Persistent Memory System             | 2 weeks | Very High |
| P0       | Document Generation (PDF/Word/Excel) | 1 week  | High      |
| P1       | Proactive Scheduler (Cron)           | 2 weeks | Very High |
| P1       | Email Integration (Gmail Pub/Sub)    | 2 weeks | High      |
| P1       | Calendar Integration                 | 1 week  | High      |
| P2       | Skills System (on top of MCP)        | 3 weeks | Medium    |
| P2       | Multi-Channel Messaging              | 4 weeks | Very High |
| P3       | Voice Integration                    | 3 weeks | Medium    |
| P3       | Canvas/A2UI Visual Workspace         | 4 weeks | Medium    |

### What AGI Workforce Already Has (Advantages)

- **Undo-based safety**: Clawdbot lacks this - major differentiator
- **Managed billing**: Users don't need API keys
- **Non-technical UX**: Plain English errors, simple setup
- **Desktop-first**: One-click install vs VPS/Docker setup

---

## Clawdbot Architecture Overview

### Core Components

```
clawdbot/
├── src/                          # Core engine (60+ modules)
│   ├── gateway/                  # WebSocket control plane
│   ├── channels/                 # Messaging abstractions
│   ├── memory/                   # Persistence layer
│   ├── plugins/                  # Plugin system
│   ├── cron/                     # Scheduled tasks
│   └── browser/                  # Playwright automation
├── apps/                         # Platform apps
│   ├── macos/                    # Swift menu bar app
│   ├── ios/                      # Swift mobile app
│   └── android/                  # Kotlin mobile app
├── skills/                       # 67+ tool modules
├── extensions/                   # 31+ channel integrations
└── ui/                           # Vite/React web frontend
```

### Gateway WebSocket Protocol

- **Port**: 18789 (default)
- **Protocol**: JSON over WebSocket
- **Frame Types**: `req`, `res`, `event`
- **Mandatory Handshake**: First frame must be `connect`

```json
{
  "type": "req",
  "id": "connect-1",
  "method": "connect",
  "params": {
    "auth": { "token": "..." },
    "deviceId": "device-uuid"
  }
}
```

### Memory Architecture

**Two-Layer System:**

1. **Daily Logs** (`memory/YYYY-MM-DD.md`)
   - Append-only format
   - Loads today + yesterday at session start
   - Contains running context and notes

2. **Long-term Memory** (`MEMORY.md`)
   - Curated facts, preferences, decisions
   - Only loaded in private sessions
   - User-editable

**Vector Search:**

- Uses sqlite-vec for embeddings
- Hybrid search: BM25 + vector similarity
- Auto-indexes on file changes (1.5s debounce)

### Skills System

**SKILL.md Format:**

```yaml
---
name: skill-name
description: What the skill does
metadata:
  clawdbot:
    requires:
      bins: ['git', 'docker']
      env: ['API_KEY']
    os: ['darwin', 'linux']
---
# Skill Instructions

Instructions for the AI...
```

**Loading Precedence:**

1. Workspace skills (`<workspace>/skills`) - Highest
2. Managed skills (`~/.clawdbot/skills`)
3. Bundled skills - Lowest

### Proactive Scheduling

**Cron Configuration:**

```json
{
  "cron": {
    "enabled": true,
    "store": "~/.clawdbot/cron/jobs.json"
  }
}
```

**Schedule Types:**

- `at`: One-shot (ISO 8601 or relative time)
- `every`: Fixed interval (milliseconds)
- `cron`: 5-field cron expression with timezone

**Example:**

```bash
clawdbot cron add --name "Morning briefing" \
  --cron "0 8 * * *" --tz "America/Los_Angeles" \
  --message "Summarize my calendar and top 5 emails"
```

---

## Feature Analysis

### 1. Persistent Memory System

**Current AGI Workforce State:**

- Session-based context in `context_manager.rs`
- No cross-session persistence
- Limited to current conversation

**Clawdbot Approach:**

- File-based markdown storage
- Vector embeddings for semantic search
- Pre-compaction memory flush
- Git-compatible (version control friendly)

**Implementation for AGI Workforce:**

```rust
// New file: apps/desktop/src-tauri/src/core/agent/memory_manager.rs

pub struct MemoryManager {
    /// Daily log path: ~/.config/agiworkforce/memory/YYYY-MM-DD.md
    daily_log_dir: PathBuf,

    /// Long-term memory: ~/.config/agiworkforce/MEMORY.md
    long_term_path: PathBuf,

    /// SQLite with sqlite-vec for embeddings
    db_pool: SqlitePool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: i64,
    pub category: MemoryCategory,
    pub topic: String,
    pub content: String,
    pub importance: u8,  // 1-10
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MemoryCategory {
    Preference,   // User preferences (code style, communication)
    Fact,         // Durable facts (project info, contacts)
    Decision,     // Past decisions and rationale
    Context,      // Ongoing context (current tasks)
}

impl MemoryManager {
    /// Store or update a memory entry
    pub async fn remember(&self, category: MemoryCategory, topic: &str, content: &str) -> Result<i64>;

    /// Search memory by semantic similarity
    pub async fn search(&self, query: &str, limit: usize) -> Result<Vec<MemoryEntry>>;

    /// Get specific memory by topic
    pub async fn recall(&self, category: MemoryCategory, topic: &str) -> Result<Option<MemoryEntry>>;

    /// Get recent context for session start
    pub async fn get_recent_context(&self) -> Result<String>;

    /// Append to today's daily log
    pub async fn log_context(&self, entry: &str) -> Result<()>;

    /// Pre-compaction memory flush
    pub async fn flush_before_compaction(&self, messages: &[Message]) -> Result<()>;
}
```

**Database Schema:**

```sql
-- Add to migrations
CREATE TABLE IF NOT EXISTS user_memory (
    id INTEGER PRIMARY KEY,
    category TEXT NOT NULL,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 5,
    embedding BLOB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, topic)
);

CREATE TABLE IF NOT EXISTS daily_context (
    id INTEGER PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    entries TEXT NOT NULL,  -- JSONL format
    summary TEXT,
    token_count INTEGER
);

-- For sqlite-vec (if available)
CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
    embedding float[384]
);
```

### 2. Document Generation (PDF/Word/Excel)

**Current State:**

- Crates exist in Cargo.toml: `printpdf`, `docx-rs`, `rust_xlsxwriter`
- NOT exposed via Tauri commands
- No frontend integration

**Required Implementation:**

```rust
// New file: apps/desktop/src-tauri/src/sys/commands/documents.rs

use printpdf::*;
use docx_rs::*;
use rust_xlsxwriter::*;

#[tauri::command]
pub async fn generate_pdf(
    content: String,
    output_path: String,
    options: PdfOptions,
) -> Result<String, String>;

#[tauri::command]
pub async fn generate_word_document(
    content: String,
    output_path: String,
    options: WordOptions,
) -> Result<String, String>;

#[tauri::command]
pub async fn generate_excel(
    data: Vec<Vec<serde_json::Value>>,
    output_path: String,
    options: ExcelOptions,
) -> Result<String, String>;

#[derive(Debug, Serialize, Deserialize)]
pub struct PdfOptions {
    pub title: Option<String>,
    pub author: Option<String>,
    pub page_size: Option<String>,  // "A4", "Letter"
    pub margins: Option<Margins>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WordOptions {
    pub title: Option<String>,
    pub author: Option<String>,
    pub template: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExcelOptions {
    pub sheet_name: Option<String>,
    pub headers: Option<Vec<String>>,
    pub auto_fit_columns: bool,
}
```

### 3. Proactive Scheduler (Cron)

**Implementation:**

```rust
// New file: apps/desktop/src-tauri/src/core/scheduler/mod.rs

use tokio_cron_scheduler::{Job, JobScheduler};

pub struct ProactiveScheduler {
    scheduler: JobScheduler,
    jobs: Arc<Mutex<HashMap<String, ScheduledJob>>>,
    notification_tx: Sender<Notification>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledJob {
    pub id: String,
    pub name: String,
    pub schedule: Schedule,
    pub action: ScheduledAction,
    pub enabled: bool,
    pub last_run: Option<DateTime<Utc>>,
    pub next_run: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Schedule {
    At(DateTime<Utc>),           // One-shot
    Every(Duration),              // Interval
    Cron(String, Option<String>), // Cron expression + timezone
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ScheduledAction {
    Briefing(BriefingConfig),
    Reminder(String),
    AgentTask(String),
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BriefingConfig {
    pub include_calendar: bool,
    pub include_email: bool,
    pub include_weather: bool,
    pub custom_prompt: Option<String>,
}

impl ProactiveScheduler {
    pub async fn new() -> Result<Self>;
    pub async fn add_job(&self, job: ScheduledJob) -> Result<String>;
    pub async fn remove_job(&self, job_id: &str) -> Result<()>;
    pub async fn list_jobs(&self) -> Vec<ScheduledJob>;
    pub async fn pause_job(&self, job_id: &str) -> Result<()>;
    pub async fn resume_job(&self, job_id: &str) -> Result<()>;
}
```

**Natural Language Parsing:**

```rust
// Parse user intent to schedule
"Every morning at 8am, summarize my calendar" -> ScheduledJob {
    schedule: Cron("0 8 * * *", Some("local")),
    action: Briefing { include_calendar: true, ... }
}

"Remind me in 2 hours to call mom" -> ScheduledJob {
    schedule: At(now + 2.hours()),
    action: Reminder("Call mom")
}
```

### 4. Email Integration

**Current State (Updated 2026-01-27):** ⚠️ PARTIALLY IMPLEMENTED

Email integration exists and is functional but needs security improvements:

**What's Working:**

- IMAP client for receiving emails (`features/communications/imap_client.rs`)
- SMTP client for sending emails (`features/communications/smtp_client.rs`)
- All Tauri commands: `email_connect`, `email_list_accounts`, `email_fetch_inbox`, `email_send`, `email_mark_read`, `email_delete`, `email_download_attachment`
- Registered as AGI tools (`email_send`, `email_fetch`)
- Contact management with vCard import/export

**Security Issues (Need Fixing):**

- Base64 password storage in SQLite (insecure - should use OS keyring)
- No OAuth 2.0 flow (uses app passwords)
- No real-time notifications (polling only)

**Improvements Needed:**

1. **Migrate credentials to OS keyring** (use `keyring` crate)
2. **Gmail Pub/Sub for real-time notifications**
3. **OAuth 2.0 authentication** (replace app passwords)

```rust
// Enhance: apps/desktop/src-tauri/src/features/communications/gmail_pubsub.rs

pub struct GmailPubSubClient {
    project_id: String,
    topic_name: String,
    subscription_name: String,
    oauth_token: OAuthToken,
}

impl GmailPubSubClient {
    /// Set up Gmail watch for inbox changes
    pub async fn setup_watch(&self) -> Result<WatchResponse>;

    /// Start streaming pull for notifications
    pub async fn start_streaming(&self, tx: Sender<EmailNotification>) -> Result<()>;

    /// Sync emails since last history ID
    pub async fn sync_from_history(&self, history_id: &str) -> Result<Vec<Email>>;
}
```

### 5. Calendar Integration

**Current State (Updated 2026-01-27):** ✅ FULLY IMPLEMENTED

The calendar integration is complete with:

- Full Google Calendar and Outlook OAuth 2.0 integration
- All CRUD operations via Tauri commands
- Registered as AGI tools (`calendar_create_event`, `calendar_list_events`)
- Persisted to SQLite database

**Implemented Commands** (in `src/sys/commands/calendar.rs`):

- `calendar_connect` - OAuth flow initiation
- `calendar_complete_oauth` - OAuth callback handling
- `calendar_disconnect` - Remove account
- `calendar_list_accounts` - Get all connected accounts
- `calendar_list_calendars` - Get calendars for an account
- `calendar_list_events` - Fetch events in a date range
- `calendar_create_event` - Create new event
- `calendar_update_event` - Modify existing event
- `calendar_delete_event` - Remove event
- `calendar_get_system_timezone` - Get local timezone

---

## Implementation Priorities

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Persistent memory + document generation

| Task                         | File                                    | Status  |
| ---------------------------- | --------------------------------------- | ------- |
| Create MemoryManager struct  | `src/core/agi/memory_manager.rs`        | ✅ DONE |
| Add memory SQLite tables     | `src/data/db/migrations.rs`             | ✅ DONE |
| Create memory Tauri commands | `src/sys/commands/memory.rs`            | ✅ DONE |
| Register memory AGI tools    | `src/core/agi/tools.rs`                 | ✅ DONE |
| Implement PDF generation     | `src/features/document/create_pdf.rs`   | ✅ DONE |
| Implement Word generation    | `src/features/document/create_word.rs`  | ✅ DONE |
| Implement Excel generation   | `src/features/document/create_excel.rs` | ✅ DONE |
| Document Tauri commands      | `src/sys/commands/document.rs`          | ✅ DONE |
| Register document AGI tools  | `src/core/agi/tools.rs`                 | ✅ DONE |
| Frontend memory store        | `src/stores/memoryStore.ts`             | TODO    |
| Test memory persistence      | `src/__tests__/memory.test.ts`          | TODO    |

**Note (Updated 2026-01-27):**

- Document generation is fully implemented and registered as AGI tools. The LLM can create Word, Excel, and PDF documents autonomously.
- Persistent memory system is now implemented with:
  - `user_memory` table for long-term memories (preferences, facts, decisions)
  - `daily_logs` table for append-only daily context
  - Memory tools registered for AGI: `memory_remember`, `memory_recall`, `memory_search`, `memory_forget`
  - All Tauri commands exposed for frontend integration

### Phase 2: Proactive Features (Weeks 3-4)

**Goal:** Cron scheduler + email integration

| Task                              | File                                          | Status |
| --------------------------------- | --------------------------------------------- | ------ |
| Create ProactiveScheduler         | `src/core/scheduler/mod.rs`                   | DONE   |
| Add cron job storage              | `src/data/db/migrations.rs`                   | DONE   |
| Natural language schedule parsing | `src/core/scheduler/nlp_parser.rs`            | DONE   |
| Desktop notifications             | `src/sys/commands/notifications.rs`           | DONE   |
| Scheduler Tauri commands          | `src/sys/commands/scheduler.rs`               | DONE   |
| Register scheduler AGI tools      | `src/core/agi/tools.rs`                       | DONE   |
| Gmail OAuth 2.0 flow              | `src/features/communications/oauth.rs`        | TODO   |
| Gmail Pub/Sub integration         | `src/features/communications/gmail_pubsub.rs` | TODO   |

### Phase 3: Calendar & Cleanup (Weeks 5-6)

**Goal:** Wire calendar to AGI + security fixes

| Task                           | File                                   | Status  |
| ------------------------------ | -------------------------------------- | ------- |
| Calendar Tauri commands        | `src/sys/commands/calendar.rs`         | ✅ DONE |
| Calendar AGI tool registration | `src/core/agi/tools.rs`                | ✅ DONE |
| Google/Outlook OAuth           | `src/features/calendar/`               | ✅ DONE |
| Move credentials to keyring    | `src/features/communications/email.rs` | TODO    |
| Enable disabled MCP servers    | `src-tauri/mcp/default_servers.json`   | TODO    |
| Remove panic! macros           | Various files                          | TODO    |
| Add form submission undo       | `src/core/agent/undo_manager.rs`       | TODO    |

**Note (Updated 2026-01-27):** Calendar integration is complete. The remaining work is security improvements (keyring migration) and MCP server enablement.

---

## Implementation Summary

> **Implementation Date:** January 27, 2026

### New Files Created

**Memory System:**

- `apps/desktop/src-tauri/src/core/agi/memory_manager.rs` - Core memory manager with SQLite persistence
- `apps/desktop/src-tauri/src/core/agi/tests/memory_tests.rs` - Unit tests for memory system
- `apps/desktop/src-tauri/src/sys/commands/memory.rs` - Tauri commands for frontend access

**Scheduler System:**

- `apps/desktop/src-tauri/src/core/scheduler/mod.rs` - Scheduler module entry point
- `apps/desktop/src-tauri/src/core/scheduler/types.rs` - ScheduledJob, JobSchedule, JobAction types
- `apps/desktop/src-tauri/src/core/scheduler/error.rs` - Scheduler error types
- `apps/desktop/src-tauri/src/core/scheduler/proactive.rs` - ProactiveScheduler with tokio-cron-scheduler
- `apps/desktop/src-tauri/src/core/scheduler/nlp_parser.rs` - Natural language schedule parsing
- `apps/desktop/src-tauri/src/core/scheduler/briefing.rs` - Daily briefing generation
- `apps/desktop/src-tauri/src/sys/commands/scheduler.rs` - Tauri commands for scheduling

**Notifications:**

- `apps/desktop/src-tauri/src/sys/commands/notifications.rs` - Desktop notification commands

### Files Modified

- `apps/desktop/src-tauri/src/data/db/migrations.rs` - Added `user_memory`, `daily_logs`, `scheduled_jobs` tables
- `apps/desktop/src-tauri/src/core/agi/tools.rs` - Registered memory and scheduler AGI tools
- `apps/desktop/src-tauri/src/lib.rs` - Registered new Tauri commands and state managers

### New Tauri Commands

**Memory Commands:**

- `memory_remember` - Store or update a memory (upsert by category+topic)
- `memory_recall` - Retrieve a specific memory by category and topic
- `memory_search` - Search memories by keyword
- `memory_get_by_category` - Get all memories in a category
- `memory_get_important` - Get high-importance memories (>= threshold)
- `memory_forget` - Delete a memory by ID
- `memory_forget_topic` - Delete a memory by category+topic
- `memory_log_context` - Append to today's daily log
- `memory_get_daily_logs` - Get logs for a specific date
- `memory_get_session_context` - Get combined context for AGI initialization
- `memory_export_all` - Export all memories for backup
- `memory_cleanup_logs` - Delete old daily logs

**Scheduler Commands:**

- `scheduler_add_job` - Add a new scheduled job (cron or interval)
- `scheduler_remove_job` - Remove a job by ID
- `scheduler_list_jobs` - List all scheduled jobs
- `scheduler_pause_job` - Pause a scheduled job
- `scheduler_resume_job` - Resume a paused job
- `scheduler_get_job` - Get a specific job by ID
- `scheduler_get_next_runs` - Get upcoming scheduled runs

**Notification Commands:**

- `notification_show` - Show an immediate notification
- `notification_show_with_actions` - Show notification with action buttons
- `notification_schedule` - Schedule a notification for a future time
- `notification_schedule_reminder` - Schedule a reminder notification
- `notification_cancel` - Cancel a scheduled notification
- `notification_cancel_all` - Cancel all scheduled notifications
- `notification_get_scheduled` - Get all pending notifications
- `notification_get` - Get a specific notification
- `notification_update` - Update a scheduled notification
- `notification_check_permission` - Check notification permission
- `notification_request_permission` - Request notification permission
- `notification_register_actions` - Register action types for interactive notifications

### New AGI Tools

**Memory Tools:**

- `memory_remember` - Store information in long-term memory
- `memory_recall` - Retrieve a specific memory by category and topic
- `memory_search` - Search through all memories by keyword
- `memory_forget` - Remove a memory by category and topic

**Scheduler Tools:**

- `schedule_reminder` - Set a one-time reminder
- `schedule_recurring_task` - Create recurring tasks (daily briefings, etc.)
- `cancel_scheduled_task` - Cancel a scheduled task
- `list_scheduled_tasks` - Show all scheduled tasks

### Database Migrations Added

**user_memory table:**

```sql
CREATE TABLE IF NOT EXISTS user_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('Preference', 'Fact', 'Decision', 'Context')),
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 5 CHECK(importance >= 1 AND importance <= 10),
    source TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, topic)
);
```

**daily_logs table:**

```sql
CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    entry_type TEXT NOT NULL DEFAULT 'context' CHECK(entry_type IN ('context', 'action', 'note', 'milestone')),
    content TEXT NOT NULL,
    metadata TEXT
);
```

**scheduled_jobs table:**

```sql
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    schedule_type TEXT NOT NULL CHECK(schedule_type IN ('cron', 'interval', 'once')),
    cron_expression TEXT,
    interval_seconds INTEGER,
    run_at TEXT,
    timezone TEXT DEFAULT 'UTC',
    action_type TEXT NOT NULL CHECK(action_type IN ('briefing', 'reminder', 'agent_task', 'custom')),
    action_data TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Usage Examples

### Memory System (Chat Examples)

The memory system allows the AGI to remember information across sessions. Users interact naturally:

**Storing Preferences:**

```
User: "I prefer dark mode in all my apps"
AGI: [Uses memory_remember with category=Preference, topic="ui_theme", content="Prefers dark mode in all apps"]
AGI: "Got it! I'll remember that you prefer dark mode."
```

**Storing Facts:**

```
User: "My project deadline is February 15th"
AGI: [Uses memory_remember with category=Fact, topic="project_deadline", content="February 15th", importance=8]
AGI: "Noted! I've saved your project deadline as February 15th."
```

**Recalling Information:**

```
User: "What's my project deadline?"
AGI: [Uses memory_recall with category=Fact, topic="project_deadline"]
AGI: "Your project deadline is February 15th."
```

**Searching Memories:**

```
User: "What do you know about my preferences?"
AGI: [Uses memory_search with query="preference" or memory_get_by_category with category=Preference]
AGI: "Here's what I remember about your preferences:
- You prefer dark mode in all apps
- You like tabs over spaces
- You prefer TypeScript over JavaScript"
```

**Forgetting Information:**

```
User: "Forget about my old project deadline"
AGI: [Uses memory_forget with category=Fact, topic="project_deadline"]
AGI: "Done! I've removed the project deadline from my memory."
```

### Scheduler (Chat Examples)

The scheduler enables proactive automation through natural language:

**One-time Reminders:**

```
User: "Remind me in 2 hours to call mom"
AGI: [Uses schedule_reminder with message="Call mom", time="in 2 hours"]
AGI: "I've set a reminder for 2 hours from now to call mom."
```

**Tomorrow Reminders:**

```
User: "Remind me tomorrow at 9am about the meeting"
AGI: [Uses schedule_reminder with message="Meeting reminder", time="tomorrow at 9am"]
AGI: "You'll get a reminder tomorrow at 9 AM about the meeting."
```

**Recurring Tasks:**

```
User: "Every morning at 8am, summarize my calendar and emails"
AGI: [Uses schedule_recurring_task with:
     schedule="every day at 8am",
     action_type="briefing",
     config={include_calendar: true, include_email: true}]
AGI: "I've set up a daily morning briefing at 8 AM. I'll summarize your calendar and emails each morning."
```

**Weekly Reports:**

```
User: "Every Friday at 5pm, remind me to submit my timesheet"
AGI: [Uses schedule_recurring_task with:
     schedule="every friday at 5pm",
     action_type="reminder",
     message="Submit your timesheet"]
AGI: "Done! Every Friday at 5 PM I'll remind you to submit your timesheet."
```

**Listing Scheduled Tasks:**

```
User: "What tasks do I have scheduled?"
AGI: [Uses list_scheduled_tasks]
AGI: "You have 3 scheduled tasks:
1. Daily morning briefing - Every day at 8:00 AM
2. Timesheet reminder - Every Friday at 5:00 PM
3. Call mom - Today at 3:30 PM (one-time)"
```

**Canceling Tasks:**

```
User: "Cancel my morning briefing"
AGI: [Uses cancel_scheduled_task with task_id from list]
AGI: "I've cancelled your daily morning briefing."
```

### Reminders (Chat Examples)

Reminders use desktop notifications for timely alerts:

**Natural Language Patterns Supported:**

- "in 5 minutes", "in 2 hours", "in 3 days"
- "at 3pm", "at 15:00", "tomorrow at 9am"
- "next Monday", "this Friday at 2pm"
- "every morning", "every evening", "every weekday"
- "every day at 8am", "every Monday at 9am"
- "weekly on Friday at 5pm"

**Immediate Notification:**

```
User: "Notify me that the build is complete"
AGI: [Uses notification_show with title="Build Complete", body="Your build has finished"]
AGI: "Done! You should see the notification now."
```

**Future Notification:**

```
User: "In 30 minutes, remind me to take a break"
AGI: [Uses notification_schedule with title="Break Time", body="Time to take a break!", at=now+30min]
AGI: "I'll remind you to take a break in 30 minutes."
```

---

## File-by-File Implementation Guide

### 1. Memory Manager

**File:** `apps/desktop/src-tauri/src/core/agi/memory_manager.rs`

> **Note:** The actual implementation uses `rusqlite` (synchronous) instead of `sqlx` (async) for simplicity and to avoid async mutex complexity in Tauri state management.

```rust
//! Persistent Memory Manager for AGI Workforce
//!
//! Based on Clawdbot's two-layer memory architecture:
//! 1. Long-term memory: Curated facts, preferences, decisions (user_memory table)
//! 2. Daily logs: Append-only context logs (daily_logs table)

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// Categories for organizing memories
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryCategory {
    Preference,
    Fact,
    Decision,
    Context,
}

/// A single memory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: i64,
    pub category: MemoryCategory,
    pub topic: String,
    pub content: String,
    pub importance: i32,
    pub source: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Types of daily log entries
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogEntryType {
    Context,
    Action,
    Note,
    Milestone,
}

/// Manages persistent memory across sessions
pub struct MemoryManager {
    conn: Mutex<Connection>,
}

impl MemoryManager {
    /// Create a new MemoryManager with a connection to the database
    pub fn new(db_path: &str) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// Store or update a memory entry (upsert by category+topic)
    pub fn remember(
        &self,
        category: MemoryCategory,
        topic: &str,
        content: &str,
        importance: Option<i32>,
        source: Option<&str>,
    ) -> Result<i64> {
        let conn = self.conn.lock()?;
        let importance = importance.unwrap_or(5).clamp(1, 10);

        conn.execute(
            "INSERT INTO user_memory (category, topic, content, importance, source, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
             ON CONFLICT(category, topic) DO UPDATE SET
                content = excluded.content,
                importance = excluded.importance,
                source = excluded.source,
                updated_at = datetime('now')",
            params![category.as_str(), topic, content, importance, source],
        )?;

        let id: i64 = conn.query_row(
            "SELECT id FROM user_memory WHERE category = ?1 AND topic = ?2",
            params![category.as_str(), topic],
            |row| row.get(0),
        )?;

        Ok(id)
    }

    /// Recall a specific memory by category and topic
    pub fn recall(&self, category: MemoryCategory, topic: &str) -> Result<Option<MemoryEntry>> {
        let conn = self.conn.lock()?;
        let result = conn.query_row(
            "SELECT id, category, topic, content, importance, source, created_at, updated_at
             FROM user_memory WHERE category = ?1 AND topic = ?2",
            params![category.as_str(), topic],
            |row| Ok(map_memory_row(row)),
        );

        match result {
            Ok(entry) => Ok(Some(entry)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Search memories by query (searches topic and content)
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<MemoryEntry>> {
        let conn = self.conn.lock()?;
        let search_pattern = format!("%{}%", query);

        let mut stmt = conn.prepare(
            "SELECT id, category, topic, content, importance, source, created_at, updated_at
             FROM user_memory
             WHERE content LIKE ?1 OR topic LIKE ?1
             ORDER BY importance DESC, updated_at DESC
             LIMIT ?2",
        )?;

        let entries = stmt
            .query_map(params![search_pattern, limit as i32], |row| Ok(map_memory_row(row)))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(entries)
    }

    /// Append to today's daily log
    pub fn log_context(&self, content: &str, entry_type: LogEntryType) -> Result<i64> {
        let conn = self.conn.lock()?;
        let today = Utc::now().format("%Y-%m-%d").to_string();

        conn.execute(
            "INSERT INTO daily_logs (log_date, entry_type, content) VALUES (?1, ?2, ?3)",
            params![today, entry_type.as_str(), content],
        )?;

        Ok(conn.last_insert_rowid())
    }

    /// Get session context (recent logs + important memories) for AGI initialization
    pub fn get_session_context(&self) -> Result<String> {
        let today = Utc::now().date_naive();
        let yesterday = today.pred_opt().unwrap_or(today);

        let mut context = String::new();

        // Load today's and yesterday's logs
        for date in [yesterday, today] {
            let logs = self.get_daily_logs(&date.format("%Y-%m-%d").to_string())?;
            if !logs.is_empty() {
                context.push_str(&format!("\n## {} Log\n", date));
                for log in logs {
                    context.push_str(&format!("[{}] {}\n", log.timestamp, log.content));
                }
            }
        }

        // Load important memories (importance >= 7)
        let important = self.get_important_memories(7)?;
        if !important.is_empty() {
            context.push_str("\n## Important Memories\n");
            for memory in important {
                context.push_str(&format!(
                    "- **{} ({})**: {}\n",
                    memory.topic, memory.category.as_str(), memory.content
                ));
            }
        }

        Ok(context)
    }

    /// Delete a memory by category and topic
    pub fn forget_topic(&self, category: MemoryCategory, topic: &str) -> Result<bool> {
        let conn = self.conn.lock()?;
        let rows = conn.execute(
            "DELETE FROM user_memory WHERE category = ?1 AND topic = ?2",
            params![category.as_str(), topic],
        )?;
        Ok(rows > 0)
    }
}
```

### 2. Document Generation

**File:** `apps/desktop/src-tauri/src/sys/commands/documents.rs`

```rust
//! Document generation commands (PDF, Word, Excel)

use printpdf::*;
use docx_rs::*;
use rust_xlsxwriter::*;
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufWriter;

#[derive(Debug, Serialize, Deserialize)]
pub struct PdfOptions {
    pub title: Option<String>,
    pub author: Option<String>,
    pub page_size: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WordOptions {
    pub title: Option<String>,
    pub author: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExcelOptions {
    pub sheet_name: Option<String>,
    pub headers: Option<Vec<String>>,
}

/// Generate a PDF document from text content
#[tauri::command]
pub async fn generate_pdf(
    content: String,
    output_path: String,
    options: Option<PdfOptions>,
) -> Result<String, String> {
    let options = options.unwrap_or(PdfOptions {
        title: None,
        author: None,
        page_size: Some("A4".to_string()),
    });

    // Create PDF document
    let (doc, page1, layer1) = PdfDocument::new(
        options.title.as_deref().unwrap_or("Document"),
        Mm(210.0),  // A4 width
        Mm(297.0),  // A4 height
        "Layer 1",
    );

    let current_layer = doc.get_page(page1).get_layer(layer1);

    // Add font
    let font = doc.add_builtin_font(BuiltinFont::Helvetica)
        .map_err(|e| format!("Failed to add font: {}", e))?;

    // Add content
    let lines: Vec<&str> = content.lines().collect();
    let mut y_position = Mm(280.0);

    for line in lines {
        if y_position < Mm(20.0) {
            // Would need new page - simplified for now
            break;
        }

        current_layer.use_text(line, 12.0, Mm(20.0), y_position, &font);
        y_position -= Mm(5.0);
    }

    // Save to file
    let file = File::create(&output_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    doc.save(&mut BufWriter::new(file))
        .map_err(|e| format!("Failed to save PDF: {}", e))?;

    Ok(output_path)
}

/// Generate a Word document (.docx)
#[tauri::command]
pub async fn generate_word_document(
    content: String,
    output_path: String,
    options: Option<WordOptions>,
) -> Result<String, String> {
    let _options = options.unwrap_or(WordOptions {
        title: None,
        author: None,
    });

    // Create document
    let mut docx = Docx::new();

    // Add paragraphs from content
    for line in content.lines() {
        if line.is_empty() {
            docx = docx.add_paragraph(Paragraph::new());
        } else {
            docx = docx.add_paragraph(
                Paragraph::new().add_run(Run::new().add_text(line))
            );
        }
    }

    // Save to file
    let file = File::create(&output_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    docx.build()
        .pack(file)
        .map_err(|e| format!("Failed to save Word document: {}", e))?;

    Ok(output_path)
}

/// Generate an Excel spreadsheet (.xlsx)
#[tauri::command]
pub async fn generate_excel(
    data: Vec<Vec<serde_json::Value>>,
    output_path: String,
    options: Option<ExcelOptions>,
) -> Result<String, String> {
    let options = options.unwrap_or(ExcelOptions {
        sheet_name: None,
        headers: None,
    });

    // Create workbook
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    // Set sheet name
    if let Some(name) = options.sheet_name {
        worksheet.set_name(&name)
            .map_err(|e| format!("Failed to set sheet name: {}", e))?;
    }

    let mut row_idx = 0u32;

    // Add headers if provided
    if let Some(headers) = options.headers {
        for (col_idx, header) in headers.iter().enumerate() {
            worksheet.write_string(row_idx, col_idx as u16, header)
                .map_err(|e| format!("Failed to write header: {}", e))?;
        }
        row_idx += 1;
    }

    // Add data rows
    for row in data {
        for (col_idx, cell) in row.iter().enumerate() {
            match cell {
                serde_json::Value::String(s) => {
                    worksheet.write_string(row_idx, col_idx as u16, s)
                        .map_err(|e| format!("Failed to write cell: {}", e))?;
                }
                serde_json::Value::Number(n) => {
                    if let Some(f) = n.as_f64() {
                        worksheet.write_number(row_idx, col_idx as u16, f)
                            .map_err(|e| format!("Failed to write cell: {}", e))?;
                    }
                }
                serde_json::Value::Bool(b) => {
                    worksheet.write_boolean(row_idx, col_idx as u16, *b)
                        .map_err(|e| format!("Failed to write cell: {}", e))?;
                }
                _ => {
                    worksheet.write_string(row_idx, col_idx as u16, &cell.to_string())
                        .map_err(|e| format!("Failed to write cell: {}", e))?;
                }
            }
        }
        row_idx += 1;
    }

    // Save workbook
    workbook.save(&output_path)
        .map_err(|e| format!("Failed to save Excel file: {}", e))?;

    Ok(output_path)
}
```

---

## Testing Strategy

### Unit Tests

```rust
// apps/desktop/src-tauri/src/core/agent/memory_manager.rs

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_remember_and_recall() {
        let dir = tempdir().unwrap();
        let db_url = format!("sqlite:{}/test.db", dir.path().display());
        let pool = SqlitePool::connect(&db_url).await.unwrap();

        // Run migrations...

        let manager = MemoryManager::new(pool, dir.path().to_path_buf()).await.unwrap();

        // Test remember
        let id = manager.remember(
            MemoryCategory::Preference,
            "code_style",
            "Prefers tabs over spaces",
            Some(8),
        ).await.unwrap();

        assert!(id > 0);

        // Test recall
        let memory = manager.recall(MemoryCategory::Preference, "code_style").await.unwrap();
        assert!(memory.is_some());
        assert_eq!(memory.unwrap().content, "Prefers tabs over spaces");
    }

    #[tokio::test]
    async fn test_search() {
        // Similar setup...

        manager.remember(MemoryCategory::Fact, "project", "Working on AGI Workforce", None).await.unwrap();
        manager.remember(MemoryCategory::Decision, "api", "Using REST over GraphQL", None).await.unwrap();

        let results = manager.search("AGI", 10).await.unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].content.contains("AGI"));
    }
}
```

### Integration Tests

```typescript
// apps/desktop/src/__tests__/memory.test.ts

import { invoke } from '@tauri-apps/api/core';

describe('Memory System', () => {
  test('should remember user preferences', async () => {
    const id = await invoke('memory_remember', {
      category: 'Preference',
      topic: 'language',
      content: 'Prefers TypeScript over JavaScript',
    });

    expect(id).toBeGreaterThan(0);
  });

  test('should recall stored memories', async () => {
    const memory = await invoke('memory_recall', {
      category: 'Preference',
      topic: 'language',
    });

    expect(memory).toBeDefined();
    expect(memory.content).toContain('TypeScript');
  });

  test('should search across memories', async () => {
    const results = await invoke('memory_search', {
      query: 'TypeScript',
      limit: 10,
    });

    expect(results.length).toBeGreaterThan(0);
  });
});
```

---

## Migration Notes

### Database Migrations

Add to `apps/desktop/src-tauri/src/data/db/migrations.rs`:

```rust
pub const MIGRATION_004_MEMORY: &str = r#"
-- User memory table
CREATE TABLE IF NOT EXISTS user_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 5,
    embedding BLOB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, topic)
);

-- Daily context logs
CREATE TABLE IF NOT EXISTS daily_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL UNIQUE,
    entries TEXT NOT NULL,
    summary TEXT,
    token_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled jobs
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule_type TEXT NOT NULL,
    schedule_value TEXT NOT NULL,
    timezone TEXT,
    action_type TEXT NOT NULL,
    action_config TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run DATETIME,
    next_run DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_memory_category ON user_memory(category);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON user_memory(importance DESC);
CREATE INDEX IF NOT EXISTS idx_daily_context_date ON daily_context(date DESC);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next ON scheduled_jobs(next_run);
"#;
```

### Cargo.toml Updates

Verify these dependencies exist (most already do):

```toml
# Document generation
printpdf = "0.7"
docx-rs = "0.4"
rust_xlsxwriter = "0.79"

# Scheduling
tokio-cron-scheduler = "0.11"
chrono-tz = "0.10"

# Vector search (optional)
# sqlite-vec = "0.1"  # When available as crate
```

---

## Security Considerations

### Credential Storage

**Current Issue:** Base64 encoding in SQLite (not secure)

**Fix:** Use OS keyring via `keyring` crate:

```rust
use keyring::Entry;

pub fn store_credential(service: &str, account: &str, password: &str) -> Result<()> {
    let entry = Entry::new(service, account)?;
    entry.set_password(password)?;
    Ok(())
}

pub fn get_credential(service: &str, account: &str) -> Result<String> {
    let entry = Entry::new(service, account)?;
    entry.get_password().map_err(Into::into)
}
```

### Remove Panic Macros

Search and replace in production code:

- `panic!()` → `return Err(...)`
- `unwrap()` → `?` or `.ok_or(...)?`
- `expect()` → `.ok_or_else(|| ...)?`

---

## Commit Strategy

1. **Feature branches** for each major feature
2. **Conventional commits**: `feat(memory):`, `fix(docs):`, etc.
3. **Test before merge**: All tests must pass
4. **Documentation updates**: Keep this file updated

```bash
# Example workflow
git checkout -b feat/persistent-memory
# ... implement ...
pnpm test
git add .
git commit -m "feat(memory): add persistent memory system

- Add MemoryManager with SQLite storage
- Implement remember/recall/search functions
- Add daily context logging
- Add database migrations

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

git push -u origin feat/persistent-memory
```

---

## Remaining TODO Items

> **Discovered during implementation on January 27, 2026**

### High Priority

| Task                      | Description                                           | Estimated Effort |
| ------------------------- | ----------------------------------------------------- | ---------------- |
| Frontend memory store     | Create `memoryStore.ts` with Zustand for memory UI    | 4 hours          |
| Frontend tests            | Add integration tests for memory commands             | 4 hours          |
| Scheduler persistence     | Persist scheduled jobs to SQLite on app close         | 4 hours          |
| Scheduler restoration     | Load scheduled jobs from SQLite on app start          | 2 hours          |
| Tool executor integration | Wire scheduler AGI tools to actual scheduler commands | 4 hours          |
| Briefing template         | Implement morning briefing content generation         | 6 hours          |

### Medium Priority

| Task                    | Description                                      | Estimated Effort |
| ----------------------- | ------------------------------------------------ | ---------------- |
| Vector embeddings       | Add sqlite-vec for semantic memory search        | 8 hours          |
| Memory importance decay | Reduce importance of old, unused memories        | 4 hours          |
| Memory compaction       | Summarize old daily logs to long-term memory     | 6 hours          |
| Snooze reminders        | Add "snooze" action to reminder notifications    | 4 hours          |
| Timezone handling       | Improve timezone support in scheduler NLP parser | 4 hours          |
| Job execution logging   | Store job execution history in SQLite            | 4 hours          |

### Low Priority

| Task                    | Description                                   | Estimated Effort |
| ----------------------- | --------------------------------------------- | ---------------- |
| Memory export formats   | Add JSON/Markdown export options              | 2 hours          |
| Memory import           | Import memories from backup files             | 4 hours          |
| Calendar briefings      | Include calendar events in morning briefings  | 4 hours          |
| Email briefings         | Include email summary in morning briefings    | 6 hours          |
| Weather briefings       | Add weather info to morning briefings         | 2 hours          |
| Skills system           | Build plugin system on top of MCP (Phase 2)   | 3 weeks          |
| Multi-channel messaging | WhatsApp/Telegram/Slack integration (Phase 2) | 4 weeks          |

### Security (from Phase 3)

| Task                 | Description                                      | Estimated Effort |
| -------------------- | ------------------------------------------------ | ---------------- |
| Keyring migration    | Move email credentials from SQLite to OS keyring | 4 hours          |
| Gmail OAuth 2.0      | Replace app passwords with OAuth flow            | 1 week           |
| Gmail Pub/Sub        | Real-time email notifications                    | 1 week           |
| Remove panic! macros | Replace with proper error handling               | 4 hours          |
| Form submission undo | Add undo support for web form submissions        | 1 week           |

### Known Issues

1. **Memory test isolation**: Unit tests need proper database cleanup between runs
2. **Scheduler state**: In-memory scheduler state not persisted across app restarts
3. **NLP parser edge cases**: Some natural language patterns not recognized (e.g., "in half an hour")
4. **Notification permissions**: Need to handle macOS permission prompts gracefully
5. **Briefing dependencies**: Briefing generator requires calendar and email services to be connected

---

## References

- [Clawdbot GitHub](https://github.com/clawdbot/clawdbot)
- [Clawdbot Documentation](https://docs.clawd.bot)
- [Clawdbot Skills](https://docs.clawd.bot/tools/skills)
- [Clawdbot Memory](https://docs.clawd.bot/concepts/memory)
- [Clawdbot Cron Jobs](https://docs.clawd.bot/automation/cron-jobs)
- [sqlite-vec](https://github.com/asg017/sqlite-vec)
- [tokio-cron-scheduler](https://docs.rs/tokio-cron-scheduler)

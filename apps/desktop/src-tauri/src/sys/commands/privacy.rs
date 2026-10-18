use crate::sys::commands::chat::AppDatabase;
use crate::sys::commands::security::SecretManagerState;
use rand::{rngs::OsRng, RngCore};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use subtle::ConstantTimeEq;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Migration bookkeeping. Clearing it makes every migration re-run against an
/// already-migrated database on the next launch, which breaks the install.
/// It holds version numbers and timestamps, never user content.
const SCHEMA_BOOKKEEPING_TABLES: &[&str] = &["schema_version"];

/// Private storage FTS5 attaches to a virtual table. Rows here are index
/// internals rewritten by clearing the virtual table itself; writing to them
/// directly corrupts the index.
const FTS_SHADOW_SUFFIXES: &[&str] = &[
    "_data",
    "_idx",
    "_docsize",
    "_config",
    "_content",
    "_segments",
    "_segdir",
    "_stat",
];

/// Privacy preferences structure matching the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyPreferences {
    pub telemetry_enabled: bool,
    pub crash_reporting_enabled: bool,
    pub ai_model_sharing_enabled: bool,
    pub analytics_enabled: bool,
    pub usage_data_collection: bool,
}

const PRIVACY_PREFERENCES_KEY: &str = "privacy_preferences";

fn store_privacy_preferences(
    conn: &Connection,
    preferences: &PrivacyPreferences,
) -> Result<(), String> {
    let value =
        serde_json::to_value(preferences).map_err(|e| format!("Failed to serialize: {}", e))?;
    crate::data::settings::upsert_setting(
        conn,
        PRIVACY_PREFERENCES_KEY.to_string(),
        crate::data::settings::SettingValue::Json(value),
        crate::data::settings::SettingCategory::System,
        false,
    )
    .map_err(|e| format!("Failed to save privacy preferences: {}", e))
}

/// Whether the stored preferences grant telemetry. Anything unreadable is a
/// refusal, so consent is only ever what the user positively recorded.
pub(crate) fn stored_telemetry_consent(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT value FROM settings_v2 WHERE key = ?1",
        [PRIVACY_PREFERENCES_KEY],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|raw| serde_json::from_str::<PrivacyPreferences>(&raw).ok())
    .is_some_and(|preferences| preferences.telemetry_enabled)
}

/// Update privacy preferences and store them
#[tauri::command]
pub async fn settings_update_privacy(
    preferences: PrivacyPreferences,
    state: State<'_, AppDatabase>,
) -> Result<(), String> {
    let conn = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    store_privacy_preferences(&conn, &preferences)?;

    crate::sys::telemetry::process_consent().set(preferences.telemetry_enabled);

    tracing::info!(
        "[Privacy] Updated privacy preferences: telemetry={}, crash_reporting={}, ai_sharing={}, analytics={}, usage_data={}",
        preferences.telemetry_enabled,
        preferences.crash_reporting_enabled,
        preferences.ai_model_sharing_enabled,
        preferences.analytics_enabled,
        preferences.usage_data_collection
    );

    Ok(())
}

/// Exports the user's data to a file the user picks in the native save
/// dialog and returns that file's name, or `None` when the dialog was
/// dismissed: the main database, the scheduler and knowledge databases, the
/// app permission and trusted workflow files, and the two settings files
/// shared with the command-line tool. Neither the destination nor the
/// content passes through the renderer.
#[tauri::command]
pub async fn privacy_export_data(
    app: tauri::AppHandle,
    state: State<'_, AppDatabase>,
) -> Result<Option<String>, String> {
    let suggested = format!(
        "agi-workforce-export-{}.json",
        chrono::Utc::now().format("%Y-%m-%d")
    );
    let chosen = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Export your AGI Workforce data")
            .set_file_name(suggested.as_str())
            .add_filter("JSON", &["json"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("The save dialog failed: {}", e))?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let chosen = chosen
        .into_path()
        .map_err(|e| format!("That destination is not a local file: {}", e))?;

    let main_database = {
        let conn = state
            .conn
            .lock()
            .map_err(|e| format!("Failed to lock database: {}", e))?;
        export_tables(&conn)?
    };
    let app_data_dir = crate::sys::utils::app_data_dir()
        .map_err(|e| format!("Could not find the app data folder: {}", e))?;
    let other_stores = export_other_stores(&app_data_dir, dirs::home_dir().as_deref());
    let exported = export_document(main_database, other_stores)?;

    write_export_file(&chosen, exported.as_bytes()).map(Some)
}

/// Writes the export at `chosen` and returns the file's name. The folder is
/// resolved first and the file itself is never followed, so a link standing
/// where the export should go is refused rather than written through.
fn write_export_file(chosen: &std::path::Path, content: &[u8]) -> Result<String, String> {
    let file_name = chosen
        .file_name()
        .ok_or_else(|| "The export destination has no file name".to_string())?;
    let folder = chosen
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "The export destination has no folder".to_string())?
        .canonicalize()
        .map_err(|e| format!("Could not resolve the export folder: {}", e))?;

    crate::sys::utils::write_file_without_following(&folder.join(file_name), content)
        .map_err(|e| format!("Could not write the export: {}", e))?;
    Ok(file_name.to_string_lossy().into_owned())
}

const REDACTED_EXPORT_VALUE: &str = "[redacted]";

/// What the export does with a table. Every table is named in exactly one of
/// the four lists below; a table named in none is left out of the export and
/// listed in its metadata, and `every_table_the_migrations_create_is_classified_for_export`
/// fails until someone decides.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TableExport {
    Rows,
    UnsealedRows,
    Secret,
    Internal,
}

/// The user's own content and records. Columns and nested fields that name a
/// secret are still redacted.
const EXPORTED_TABLES: &[&str] = &[
    "agi_checkpoint_restore_history",
    "agi_task_checkpoints",
    "agi_tasks",
    "analytics_snapshots",
    "approval_requests",
    "approval_rules",
    "artifact_versions",
    "artifacts",
    "audit_events",
    "audit_log",
    "auth_audit_log",
    "automation_history",
    "automation_triggers",
    "autonomous_sessions",
    "autonomous_task_logs",
    "background_agents",
    "billing_customers",
    "billing_invoices",
    "billing_payment_methods",
    "billing_subscriptions",
    "billing_usage",
    "browser_automation_history",
    "browser_tabs",
    "budget_daily_spend",
    "captures",
    "checkpoint_restore_history",
    "clipboard_history",
    "collaboration_sessions",
    "command_history",
    "computer_use_actions",
    "computer_use_sessions",
    "contacts",
    "context_items",
    "conversation_branches",
    "conversation_checkpoints",
    "conversation_instructions",
    "conversations",
    "daily_logs",
    "demo_runs",
    "email_attachments",
    "emails",
    "first_run_sessions",
    "help_sessions",
    "job_executions",
    "knowledge",
    "knowledge_documents",
    "mcp_extensions",
    "mcp_servers",
    "message_drafts",
    "messages",
    "messaging_history",
    "ocr_results",
    "onboarding_progress",
    "outcome_tracking",
    "overlay_events",
    "permission_requests",
    "project_memories",
    "project_memory",
    "project_settings",
    "projects",
    "published_workflows",
    "realtime_metrics",
    "remembered_tool_choices",
    "roi_configurations",
    "scheduled_job_runs",
    "scheduled_jobs",
    "scheduler_settings",
    "tasks",
    "team_activity",
    "team_billing",
    "team_invitations",
    "team_members",
    "team_resources",
    "teams",
    "template_installs",
    "token_usage",
    "tool_executions",
    "tool_permissions",
    "tutorial_feedback",
    "tutorial_progress",
    "tutorial_step_views",
    "user_memory",
    "user_milestones",
    "user_permissions",
    "user_preferences",
    "user_presence",
    "user_rewards",
    "user_sessions",
    "users",
    "workflow_clones",
    "workflow_comments",
    "workflow_definitions",
    "workflow_execution_logs",
    "workflow_executions",
    "workflow_favorites",
    "workflow_ratings",
];

/// Settings stores that hold sealed secrets next to plain preferences. Only
/// rows with `encrypted = 0` are exported, and none of the `security`
/// category: unsealed, it holds what the app has been allowed to do, not
/// what the user wrote. That is the approved hook file with every hook
/// command (`hooks_approved_yaml`, `hooks_approval_notified_fingerprint`),
/// project server consents (`mcp_project_consent_*`), project skill consents
/// (`skill_project_consent_*`), servers let out of the sandbox
/// (`mcp_unsandboxed_*`), OAuth bookkeeping (`mcp_oauth_*`), the tool
/// approval mode (`tool_confirmation.*`) and computer-use consent
/// (`computer_use.*`).
const UNSEALED_ROW_TABLES: &[&str] = &["settings", "settings_v2"];
const SETTING_CATEGORY_COLUMN: &str = "category";
const SECURITY_SETTING_CATEGORY: &str = "security";

/// Never exported: every row is a sealed secret, a credential, a verifier or
/// session material. `master_password` holds the verifier hash, its salt and
/// the key-derivation parameters; `api_keys` key hashes; `auth_sessions`
/// session tokens; `oauth_providers` sealed OAuth tokens; `browser_sessions`
/// cookies and web storage; `messaging_connections` sealed workspace
/// credentials; `calendar_accounts` and `email_accounts` the credentials of
/// the removed clients, which migration v89 empties.
const SECRET_TABLES: &[&str] = &[
    "api_keys",
    "auth_sessions",
    "browser_sessions",
    "calendar_accounts",
    "email_accounts",
    "master_password",
    "messaging_connections",
    "oauth_providers",
];

/// Never exported: bookkeeping, queues, caches and built-in catalogues the
/// app rebuilds, none of it written by the user.
const INTERNAL_TABLES: &[&str] = &[
    "agent_templates",
    "automation_audit_outbox",
    "automation_benchmarks",
    "billing_webhook_events",
    "cache_entries",
    "chat_turns_in_flight",
    "cloud_sync_pending_artifacts",
    "cloud_sync_pending_messages",
    "cloud_sync_state",
    "codebase_cache",
    "knowledge_chunks",
    "master_password_migration",
    "mcp_tools_cache",
    "memory_summarization_progress",
    "metrics_daily_cache",
    "offline_operations_queue",
    "permissions",
    "process_benchmarks",
    "process_templates",
    "role_permissions",
    "sample_data_marker",
    "schema_version",
];

fn table_export(name: &str) -> Option<TableExport> {
    if EXPORTED_TABLES.contains(&name) {
        Some(TableExport::Rows)
    } else if UNSEALED_ROW_TABLES.contains(&name) {
        Some(TableExport::UnsealedRows)
    } else if SECRET_TABLES.contains(&name) {
        Some(TableExport::Secret)
    } else if INTERNAL_TABLES.contains(&name) {
        Some(TableExport::Internal)
    } else {
        None
    }
}

/// Name fragments that mark a column or a nested field as a credential
/// rather than personal data, matched after [`normalised_name`]. The export
/// is written to an unprotected file, so these are named in it but never
/// carried in it. The table lists above decide what is exported; this is the
/// second check inside what is. Environment and header maps are stricter and
/// follow the launch policy's own rule ([`redact_environment`]).
const SECRET_NAME_MARKERS: &[&str] = &[
    "password",
    "passphrase",
    "secret",
    "token",
    "api_key",
    "apikey",
    "credential",
    "private_key",
    "encrypted",
    "verifier",
    "salt",
    "cookie",
    "authorization",
];

/// Maps of name to value that a server is launched or called with, by the
/// name itself or by its last word: `env`, `http_headers`, `requestHeaders`,
/// `env_vars`.
const ENVIRONMENT_MAP_NAMES: &[&str] = &["env", "envs", "environment", "vars", "headers"];

/// A name as its words joined by `_`, so `requestHeaders`, `HTTPHeaders`
/// and `request-headers` all end in the word `headers`.
fn name_words(name: &str) -> String {
    let letters: Vec<char> = name.trim().chars().collect();
    let mut words = String::with_capacity(letters.len() + 4);
    for (index, letter) in letters.iter().enumerate() {
        let before = index.checked_sub(1).and_then(|at| letters.get(at));
        let opens_a_word = letter.is_ascii_uppercase()
            && before.is_some_and(|before| {
                before.is_ascii_lowercase()
                    || before.is_ascii_digit()
                    || (before.is_ascii_uppercase()
                        && letters
                            .get(index + 1)
                            .is_some_and(|after| after.is_ascii_lowercase()))
            });
        if opens_a_word {
            words.push('_');
        }
        words.push(match letter {
            '-' | ' ' => '_',
            other => other.to_ascii_lowercase(),
        });
    }
    words
}

fn is_environment_map(name: &str) -> bool {
    let words = name_words(name);
    ENVIRONMENT_MAP_NAMES.iter().any(|map| {
        words == *map
            || words
                .strip_suffix(map)
                .is_some_and(|before| before.ends_with('_'))
    })
}

/// A name the launch policy reads as an endpoint, for a value that has no
/// name of its own to go by.
const UNNAMED_ENDPOINT: &str = "ENDPOINT_URL";

/// An address as where it points: scheme, host, port and path, with the
/// user, password, query and fragment dropped and the launch policy's mark
/// in their place. `None` leaves the text as it is: it is not one address
/// and nothing else, or it carries none of those. An address the policy
/// cannot read with confidence is hidden whole.
fn reduced_address(text: &str) -> Option<String> {
    if !text.contains("://") || text.chars().any(char::is_whitespace) {
        return None;
    }
    match agiworkforce_sandbox_policy::shown_value(UNNAMED_ENDPOINT, text) {
        Some(std::borrow::Cow::Borrowed(_)) => None,
        Some(std::borrow::Cow::Owned(reduced)) => Some(reduced),
        None => Some(REDACTED_EXPORT_VALUE.to_string()),
    }
}

/// Fields that hold a command line to run: an MCP server's or a hook's
/// `command`, a terminal history entry, a scheduled job's `command` or
/// `script`.
const COMMAND_LINE_NAMES: &[&str] = &["command", "cmd", "command_line", "script"];

/// A name as it is compared: lower case, with `-` and spaces as `_`, so
/// `X-API-Key` and `x_api_key` are one name.
fn normalised_name(name: &str) -> String {
    name.trim()
        .chars()
        .map(|c| match c {
            '-' | ' ' => '_',
            other => other.to_ascii_lowercase(),
        })
        .collect()
}

fn is_secret_name(normalised: &str) -> bool {
    SECRET_NAME_MARKERS
        .iter()
        .any(|marker| normalised.contains(marker))
}

fn redacted() -> serde_json::Value {
    serde_json::Value::String(REDACTED_EXPORT_VALUE.to_string())
}

/// A document held as text in a cell or in another document.
fn embedded_document(text: &str) -> Option<serde_json::Value> {
    let trimmed = text.trim_start();
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        serde_json::from_str(text).ok()
    } else {
        None
    }
}

/// One value of an environment or header map. Whether a value may be shown
/// is the launch policy's rule, not a list kept here: a secret name hides
/// it, an endpoint is shown without its credentials, and anything that is
/// not plain text is hidden whole.
fn redact_environment_value(name: &str, value: &mut serde_json::Value) {
    let hidden_whole = match &mut *value {
        serde_json::Value::String(text) => {
            let normalised = normalised_name(name);
            let shown = if is_secret_name(&normalised) {
                None
            } else {
                agiworkforce_sandbox_policy::shown_value(&normalised, text.as_str())
                    .map(std::borrow::Cow::into_owned)
            };
            let shown = shown.map(|shown| reduced_address(&shown).unwrap_or(shown));
            *text = shown.unwrap_or_else(|| REDACTED_EXPORT_VALUE.to_string());
            false
        }
        serde_json::Value::Null | serde_json::Value::Bool(_) | serde_json::Value::Number(_) => {
            false
        }
        _ => true,
    };
    if hidden_whole {
        *value = redacted();
    }
}

/// An environment or header map, as an object or as the text of one. A map
/// that cannot be read name by name is hidden whole.
fn redact_environment(field: &mut serde_json::Value) {
    let replacement = match &mut *field {
        serde_json::Value::Object(entries) => {
            for (name, value) in entries.iter_mut() {
                redact_environment_value(name, value);
            }
            None
        }
        serde_json::Value::Null => None,
        serde_json::Value::String(text) if text.trim().is_empty() => None,
        serde_json::Value::String(text) => Some(match embedded_document(text) {
            Some(mut document @ serde_json::Value::Object(_)) => {
                redact_environment(&mut document);
                serde_json::Value::String(document.to_string())
            }
            _ => redacted(),
        }),
        _ => Some(redacted()),
    };
    if let Some(replacement) = replacement {
        *field = replacement;
    }
}

/// The arguments of a launch command. A flag's value cannot be told from a
/// secret, so every argument is hidden and only their number is kept.
fn redact_arguments(field: &mut serde_json::Value) {
    let hidden = |count: usize| serde_json::Value::Array(vec![redacted(); count]);
    let replacement = match &*field {
        serde_json::Value::Array(arguments) => Some(hidden(arguments.len())),
        serde_json::Value::Null => None,
        serde_json::Value::String(text) if text.trim().is_empty() => None,
        serde_json::Value::String(text) => Some(match embedded_document(text) {
            Some(serde_json::Value::Array(arguments)) => {
                serde_json::Value::String(hidden(arguments.len()).to_string())
            }
            _ => redacted(),
        }),
        _ => Some(redacted()),
    };
    if let Some(replacement) = replacement {
        *field = replacement;
    }
}

/// A command line, as text or as a list of arguments. The program stays and
/// what follows it is hidden with only its number kept, because a flag's
/// value cannot be told from a secret. A line that cannot be split, or that
/// opens with a `NAME=value` assignment, is hidden whole.
fn redact_command_line(field: &mut serde_json::Value) {
    let replacement = match &*field {
        serde_json::Value::String(line) => match shlex::split(line).as_deref() {
            Some([]) => None,
            Some([program, ..]) if program.contains('=') => Some(redacted()),
            Some([_]) => None,
            Some([program, rest @ ..]) => Some(serde_json::Value::String(format!(
                "{} [{} more arguments hidden]",
                program,
                rest.len()
            ))),
            None => Some(redacted()),
        },
        serde_json::Value::Array(arguments) => match arguments.split_first() {
            Some((serde_json::Value::String(program), rest)) if !program.contains('=') => {
                let mut shown = vec![serde_json::Value::String(program.clone())];
                shown.extend(std::iter::repeat_with(redacted).take(rest.len()));
                Some(serde_json::Value::Array(shown))
            }
            Some(_) => Some(redacted()),
            None => None,
        },
        serde_json::Value::Null => None,
        _ => Some(redacted()),
    };
    if let Some(replacement) = replacement {
        *field = replacement;
    }
}

/// Redacts the fields of one object: a row, or an object inside a stored
/// document. Numbers, booleans and nulls under a secret-looking name stay: a
/// count of tokens is not a token.
fn redact_object(fields: &mut serde_json::Map<String, serde_json::Value>) {
    let launches_a_command = fields.keys().any(|name| normalised_name(name) == "command");
    for (name, field) in fields.iter_mut() {
        let normalised = normalised_name(name);
        let carries_text = !(field.is_null() || field.is_number() || field.is_boolean());
        if is_environment_map(name) {
            redact_environment(field);
        } else if launches_a_command && normalised == "args" {
            redact_arguments(field);
        } else if COMMAND_LINE_NAMES.contains(&normalised.as_str()) {
            redact_command_line(field);
        } else if carries_text && is_secret_name(&normalised) {
            *field = redacted();
        } else {
            redact_nested(field);
        }
    }
}

/// Redacts a stored document however deep, including a document held as
/// text inside it.
fn redact_nested(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(fields) => redact_object(fields),
        serde_json::Value::Array(items) => items.iter_mut().for_each(redact_nested),
        serde_json::Value::String(text) => {
            if let Some(mut document) = embedded_document(text) {
                redact_nested(&mut document);
                *text = document.to_string();
            } else if let Some(reduced) = reduced_address(text) {
                *text = reduced;
            }
        }
        _ => {}
    }
}

fn cell_to_json(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<serde_json::Value> {
    use rusqlite::types::ValueRef;
    Ok(match row.get_ref(index)? {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(value) => serde_json::Value::from(value),
        ValueRef::Real(value) => serde_json::Number::from_f64(value)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        ValueRef::Text(value) => {
            serde_json::Value::String(String::from_utf8_lossy(value).into_owned())
        }
        ValueRef::Blob(value) => {
            serde_json::Value::String(format!("[binary {} bytes]", value.len()))
        }
    })
}

#[derive(Debug, Default)]
struct ExportedTables {
    tables: serde_json::Map<String, serde_json::Value>,
    rows: usize,
    secret: Vec<String>,
    internal: Vec<String>,
    unclassified: Vec<String>,
}

fn export_table_rows(
    conn: &Connection,
    table: &str,
    unsealed_only: bool,
) -> Result<Vec<serde_json::Value>, String> {
    let query = if !unsealed_only {
        format!("SELECT * FROM \"{}\"", table)
    } else if table_columns(conn, table)?
        .iter()
        .any(|column| column == SETTING_CATEGORY_COLUMN)
    {
        format!(
            "SELECT * FROM \"{}\" WHERE encrypted = 0 AND {} <> '{}'",
            table, SETTING_CATEGORY_COLUMN, SECURITY_SETTING_CATEGORY
        )
    } else {
        format!("SELECT * FROM \"{}\" WHERE encrypted = 0", table)
    };
    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Failed to prepare export of {}: {}", table, e))?;
    let columns: Vec<String> = stmt
        .column_names()
        .into_iter()
        .map(str::to_string)
        .collect();

    let rows = stmt
        .query_map([], |row| {
            let mut record = serde_json::Map::new();
            for (index, column) in columns.iter().enumerate() {
                record.insert(column.clone(), cell_to_json(row, index)?);
            }
            redact_object(&mut record);
            let named_secret = unsealed_only
                && record
                    .get("key")
                    .and_then(|key| key.as_str())
                    .is_some_and(|key| is_secret_name(&normalised_name(key)));
            if named_secret {
                if let Some(value) = record.get_mut("value").filter(|value| value.is_string()) {
                    *value = serde_json::Value::String(REDACTED_EXPORT_VALUE.to_string());
                }
            }
            Ok(serde_json::Value::Object(record))
        })
        .map_err(|e| format!("Failed to query {}: {}", table, e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read {}: {}", table, e))?;
    Ok(rows)
}

/// The exportable rows of one database, by the table lists above.
fn export_tables(conn: &Connection) -> Result<ExportedTables, String> {
    let schema = classify_local_tables(conn)?;
    let mut exported = ExportedTables::default();

    for table in schema.rows.iter().chain(schema.preserved.iter()) {
        let unsealed_only = match table_export(table) {
            Some(TableExport::Rows) => false,
            Some(TableExport::UnsealedRows) => true,
            Some(TableExport::Secret) => {
                exported.secret.push(table.clone());
                continue;
            }
            Some(TableExport::Internal) => {
                exported.internal.push(table.clone());
                continue;
            }
            None => {
                tracing::warn!(
                    "[Privacy] Table {} is not classified for export and was left out",
                    table
                );
                exported.unclassified.push(table.clone());
                continue;
            }
        };
        let rows = export_table_rows(conn, table, unsealed_only)?;
        exported.rows += rows.len();
        exported
            .tables
            .insert(table.clone(), serde_json::Value::Array(rows));
    }

    Ok(exported)
}

const SIDE_DATABASES: &[&str] = &["scheduler.db", "knowledge.db"];
const SIDE_DOCUMENTS: &[&str] = &["app_permissions.json", "trusted_workflows.json"];
const SHARED_CLI_FOLDER: &str = ".agiworkforce";
const SHARED_CLI_DOCUMENTS: &[&str] = &["config.toml", "mcp.json"];

/// This app's own log of the terminal commands it was asked to run, kept
/// beside the command-line tool's files. It is left out of the export like
/// the other logs: each entry is a whole command line, arguments and any
/// secret typed into them included, and a command that spans lines cannot
/// be told apart from the next entry, so it cannot be reduced to programs
/// the way `command_history` is. Deleting the data on this device removes
/// it.
const COMMAND_AUDIT_LOG: &str = "security-audit.log";
const COMMAND_AUDIT_LOG_LEFT_OUT: &str =
    "a log of whole terminal command lines with their arguments, which can hold secrets and \
     cannot be reduced reliably; deleting all data on this device removes it";
const MAX_EXPORTED_DOCUMENT_BYTES: u64 = 8 * 1024 * 1024;

fn not_exported(reason: impl std::fmt::Display) -> serde_json::Value {
    serde_json::json!({ "not_exported": reason.to_string() })
}

/// A settings document with its secrets redacted, `None` when the file is
/// not there.
fn export_document_file(path: &std::path::Path) -> Option<serde_json::Value> {
    let size = std::fs::metadata(path)
        .ok()
        .filter(|found| found.is_file())?
        .len();
    if size > MAX_EXPORTED_DOCUMENT_BYTES {
        return Some(not_exported(format!("the file is {} bytes", size)));
    }
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) => return Some(not_exported(e)),
    };
    let is_toml = path
        .extension()
        .is_some_and(|extension| extension == "toml");
    let parsed = if is_toml {
        toml::from_str::<toml::Value>(&text)
            .map_err(|e| e.to_string())
            .and_then(|document| serde_json::to_value(document).map_err(|e| e.to_string()))
    } else {
        serde_json::from_str::<serde_json::Value>(&text).map_err(|e| e.to_string())
    };
    Some(match parsed {
        Ok(mut document) => {
            redact_nested(&mut document);
            document
        }
        Err(e) => not_exported(e),
    })
}

/// One of the app's other databases, `None` when the file is not there.
fn export_side_database(path: &std::path::Path) -> Option<serde_json::Value> {
    if !std::fs::metadata(path).is_ok_and(|found| found.is_file()) {
        return None;
    }
    let exported = crate::data::db::encryption::open_keyed_connection(path)
        .and_then(|conn| export_tables(&conn));
    Some(match exported {
        Ok(exported) => serde_json::Value::Object(exported.tables),
        Err(e) => not_exported(e),
    })
}

/// The stores outside the main database, each under the name the user would
/// find it by. A store that is not on this device is left out; one that
/// cannot be read says why.
fn export_other_stores(
    app_data_dir: &std::path::Path,
    home: Option<&std::path::Path>,
) -> serde_json::Map<String, serde_json::Value> {
    let mut stores = serde_json::Map::new();
    for name in SIDE_DATABASES {
        if let Some(exported) = export_side_database(&app_data_dir.join(name)) {
            stores.insert((*name).to_string(), exported);
        }
    }
    for name in SIDE_DOCUMENTS {
        if let Some(exported) = export_document_file(&app_data_dir.join(name)) {
            stores.insert((*name).to_string(), exported);
        }
    }
    if let Some(home) = home {
        for name in SHARED_CLI_DOCUMENTS {
            let path = home.join(SHARED_CLI_FOLDER).join(name);
            if let Some(exported) = export_document_file(&path) {
                stores.insert(format!("~/{SHARED_CLI_FOLDER}/{name}"), exported);
            }
        }
    }
    stores
}

fn export_document(
    main_database: ExportedTables,
    other_stores: serde_json::Map<String, serde_json::Value>,
) -> Result<String, String> {
    let ExportedTables {
        tables: mut export_data,
        rows,
        secret,
        internal,
        unclassified,
    } = main_database;
    let table_count = export_data.len();
    let mut left_out_files = serde_json::Map::new();
    left_out_files.insert(
        format!("~/{SHARED_CLI_FOLDER}/{COMMAND_AUDIT_LOG}"),
        serde_json::Value::from(COMMAND_AUDIT_LOG_LEFT_OUT),
    );

    export_data.insert(
        "other_stores".to_string(),
        serde_json::Value::Object(other_stores),
    );
    export_data.insert(
        "export_metadata".to_string(),
        serde_json::json!({
            "exported_at": chrono::Utc::now().to_rfc3339(),
            "app_name": "AGI Workforce",
            "export_version": "3.0",
            "tables": table_count,
            "rows": rows,
            "redacted_columns": REDACTED_EXPORT_VALUE,
            "left_out_tables": {
                "secrets": secret,
                "internal": internal,
                "unclassified": unclassified,
            },
            "left_out_files": left_out_files,
        }),
    );

    tracing::info!(
        "[Privacy] Exported {} rows across {} local tables",
        rows,
        table_count
    );
    serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export data: {}", e))
}

#[cfg(test)]
fn export_local_user_data(conn: &Connection) -> Result<String, String> {
    export_document(export_tables(conn)?, serde_json::Map::new())
}

fn is_safe_identifier(name: &str) -> bool {
    name.chars()
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

#[derive(Debug, Default)]
pub struct LocalUserTables {
    pub rows: Vec<String>,
    pub search_indexes: Vec<String>,
    pub preserved: Vec<String>,
}

fn is_fts_shadow_of(name: &str, virtual_tables: &[String]) -> bool {
    virtual_tables.iter().any(|owner| {
        name.len() > owner.len()
            && name.starts_with(owner.as_str())
            && FTS_SHADOW_SUFFIXES.contains(&&name[owner.len()..])
    })
}

pub fn classify_local_tables(conn: &Connection) -> Result<LocalUserTables, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, COALESCE(sql, '') FROM sqlite_master \
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(|e| format!("Failed to read local schema: {}", e))?;

    let tables = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Failed to read local schema: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read local schema: {}", e))?;

    let search_indexes: Vec<String> = tables
        .iter()
        .filter(|(_, sql)| sql.to_ascii_uppercase().contains("CREATE VIRTUAL TABLE"))
        .map(|(name, _)| name.clone())
        .collect();

    let mut classified = LocalUserTables {
        search_indexes: search_indexes.clone(),
        ..LocalUserTables::default()
    };

    for (name, _) in &tables {
        if !is_safe_identifier(name) {
            return Err(format!(
                "Refusing to purge: local table name '{}' is not a plain identifier",
                name
            ));
        }
        if SCHEMA_BOOKKEEPING_TABLES.contains(&name.as_str()) {
            classified.preserved.push(name.clone());
        } else if !search_indexes.contains(name) && !is_fts_shadow_of(name, &search_indexes) {
            classified.rows.push(name.clone());
        }
    }

    Ok(classified)
}

fn clear_search_index(conn: &Connection, name: &str) -> Result<(), String> {
    let command_error = match conn.execute(
        &format!("INSERT INTO \"{0}\"(\"{0}\") VALUES ('delete-all')", name),
        [],
    ) {
        Ok(_) => return Ok(()),
        Err(e) => e,
    };

    conn.execute(&format!("DELETE FROM \"{}\"", name), [])
        .map(|_| ())
        .map_err(|e| {
            format!(
                "Failed to clear search index {}: {} (delete-all: {})",
                name, e, command_error
            )
        })
}

fn table_columns(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{}\")", table))
        .map_err(|e| format!("Failed to read columns of {}: {}", table, e))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("Failed to read columns of {}: {}", table, e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read columns of {}: {}", table, e))?;
    Ok(columns)
}

fn is_artefact_path_column(name: &str) -> bool {
    let lowered = name.to_ascii_lowercase();
    lowered == "path" || lowered.ends_with("_path")
}

fn artefact_path_columns(conn: &Connection, table: &str) -> Result<Vec<String>, String> {
    Ok(table_columns(conn, table)?
        .into_iter()
        .filter(|name| is_safe_identifier(name) && is_artefact_path_column(name))
        .collect())
}

fn collect_artefact_paths(
    conn: &Connection,
    tables: &LocalUserTables,
) -> Result<Vec<std::path::PathBuf>, String> {
    let mut paths = Vec::new();
    for table in &tables.rows {
        for column in artefact_path_columns(conn, table)? {
            let mut stmt = conn
                .prepare(&format!(
                    "SELECT DISTINCT \"{0}\" FROM \"{1}\" WHERE \"{0}\" IS NOT NULL AND \"{0}\" <> ''",
                    column, table
                ))
                .map_err(|e| format!("Failed to list {}.{}: {}", table, column, e))?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| format!("Failed to list {}.{}: {}", table, column, e))?;
            for row in rows {
                match row {
                    Ok(value) => paths.push(std::path::PathBuf::from(value)),
                    Err(e) => tracing::warn!(
                        "[Privacy] Skipped unreadable path in {}.{}: {}",
                        table,
                        column,
                        e
                    ),
                }
            }
        }
    }
    Ok(paths)
}

/// Delete the artefacts the erased rows referenced, but only the ones the app
/// itself wrote. Path columns also hold locations the user owns, a watched
/// folder, an indexed project, and erasing an account must not erase those,
/// so containment inside an app-owned root is the authority, not the column.
fn remove_contained_artefacts(paths: &[std::path::PathBuf], roots: &[std::path::PathBuf]) -> usize {
    let canonical_roots: Vec<std::path::PathBuf> = roots
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .collect();
    if canonical_roots.is_empty() {
        return 0;
    }

    let mut removed = 0usize;
    for path in paths {
        let Ok(canonical) = std::fs::canonicalize(path) else {
            continue;
        };
        let contained = canonical_roots
            .iter()
            .any(|root| canonical != *root && canonical.starts_with(root));
        if !contained {
            continue;
        }

        let outcome = if canonical.is_dir() {
            std::fs::remove_dir_all(&canonical)
        } else {
            std::fs::remove_file(&canonical)
        };
        match outcome {
            Ok(()) => removed += 1,
            Err(e) => tracing::warn!(
                "[Privacy] Failed to erase artefact {}: {}",
                canonical.display(),
                e
            ),
        }
    }
    removed
}

#[derive(Debug, Default, Clone, Copy)]
pub struct PurgeSummary {
    pub deleted_rows: usize,
    pub cleared_tables: usize,
    pub removed_artefacts: usize,
}

/// Deletes the files the rows point at first, then every row in one
/// transaction. A purge stopped part way leaves rows that still name what is
/// left, so running it again finishes the job; the other order would commit
/// the rows and lose the only record of the files.
pub fn purge_local_user_data(
    conn: &Connection,
    artefact_roots: &[std::path::PathBuf],
) -> Result<PurgeSummary, String> {
    let tables = classify_local_tables(conn)?;
    let artefacts = collect_artefact_paths(conn, &tables)?;
    let removed_artefacts = remove_contained_artefacts(&artefacts, artefact_roots);

    conn.execute_batch("BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON;")
        .map_err(|e| format!("Failed to open deletion transaction: {}", e))?;

    let purged = (|| -> Result<usize, String> {
        let mut deleted_rows = 0usize;
        for name in &tables.rows {
            deleted_rows += conn
                .execute(&format!("DELETE FROM \"{}\"", name), [])
                .map_err(|e| format!("Failed to clear {}: {}", name, e))?;
        }
        for name in &tables.search_indexes {
            clear_search_index(conn, name)?;
        }
        Ok(deleted_rows)
    })();

    match purged {
        Ok(deleted_rows) => {
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("Failed to commit account deletion: {}", e))?;
            Ok(PurgeSummary {
                deleted_rows,
                cleared_tables: tables.rows.len() + tables.search_indexes.len(),
                removed_artefacts,
            })
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(e)
        }
    }
}

/// Left in the app data folder by a deletion. The next launch empties the
/// app's own folders before anything in them is opened, which is the only
/// point at which the other databases, the configuration files and the logs
/// can be removed on every platform.
///
/// The file is a claim, not proof: anything that can write a file there can
/// leave one. It holds the proof the deletion put in the OS credential store
/// after the user's yes, and is obeyed only when the two are equal.
const PENDING_LOCAL_WIPE_FILE: &str = "pending_local_wipe";
const WIPE_PROOF_KEYRING_ACCOUNT: &str = "pending-local-wipe";
const WIPE_PROOF_BYTES: usize = 32;
const WIPE_PROOF_HEX_LEN: usize = WIPE_PROOF_BYTES * 2;

/// Where the proof of a requested deletion is kept between the user's yes
/// and the next launch: somewhere a file write cannot reach.
trait WipeProofStore {
    fn load(&self) -> Result<Option<String>, String>;
    fn store(&self, proof: &str) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}

/// The OS credential store under this bundle's identity, where the install
/// secret is kept, as an item of its own.
struct OsWipeProofStore {
    service: String,
}

impl OsWipeProofStore {
    fn for_bundle_identifier(identifier: &str) -> Result<Self, String> {
        crate::sys::security::machine_key::OsInstallSecretStore::for_bundle_identifier(identifier)
            .map_err(|e| e.to_string())?;
        Ok(Self {
            service: identifier.to_string(),
        })
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(&self.service, WIPE_PROOF_KEYRING_ACCOUNT)
            .map_err(|e| format!("could not open the system credential store: {}", e))
    }
}

impl WipeProofStore for OsWipeProofStore {
    fn load(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(proof) => Ok(Some(proof)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!(
                "could not read from the system credential store: {}",
                e
            )),
        }
    }

    fn store(&self, proof: &str) -> Result<(), String> {
        self.entry()?
            .set_password(proof)
            .map_err(|e| format!("could not write to the system credential store: {}", e))
    }

    fn clear(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!(
                "could not remove from the system credential store: {}",
                e
            )),
        }
    }
}

fn new_wipe_proof() -> Result<String, String> {
    let mut bytes = [0u8; WIPE_PROOF_BYTES];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|e| format!("The system could not produce random bytes: {}", e))?;
    Ok(hex::encode(bytes))
}

/// What the marker claims, or `None` when nothing is at its path. Anything
/// that is not a small regular file claims nothing a proof can equal.
fn pending_wipe_claim(marker: &std::path::Path) -> Option<String> {
    use std::io::Read;

    let found = std::fs::symlink_metadata(marker).ok()?;
    if !found.is_file() {
        return Some(String::new());
    }
    let mut claim = String::new();
    let read = std::fs::File::open(marker).and_then(|file| {
        file.take(WIPE_PROOF_HEX_LEN as u64 + 1)
            .read_to_string(&mut claim)
    });
    if read.is_err() {
        claim.clear();
    }
    Some(claim)
}

fn proves_wipe(proof: &str, claim: &str) -> bool {
    proof.len() == WIPE_PROOF_HEX_LEN && bool::from(proof.as_bytes().ct_eq(claim.as_bytes()))
}

/// Leaves no proof a marker could still match. A proof that cannot be
/// removed is replaced by one that is written nowhere else.
fn retire_wipe_proof(proofs: &dyn WipeProofStore) {
    let Err(e) = proofs.clear() else {
        return;
    };
    tracing::warn!("[Privacy] A deletion proof was not removed: {}", e);
    let replaced = new_wipe_proof().and_then(|unwritten| proofs.store(&unwritten));
    if let Err(e) = replaced {
        tracing::error!(
            "[Privacy] The deletion proof could not be replaced either: {}",
            e
        );
    }
}

/// Runs `delete` and leaves the next launch the rest, with a proof the
/// launch can check. The proof goes into the credential store before
/// anything is deleted: when the store refuses it, nothing is deleted and
/// nothing is scheduled. A deletion that fails takes its proof back.
fn delete_and_schedule_wipe<Delete>(
    proofs: &dyn WipeProofStore,
    app_data_dir: &std::path::Path,
    delete: Delete,
) -> Result<(), String>
where
    Delete: FnOnce() -> Result<(), String>,
{
    let proof = new_wipe_proof()?;
    proofs.store(&proof).map_err(|e| {
        format!(
            "Nothing was deleted. The system credential store is not available, and the \
             deletion cannot be finished safely without it: {}",
            e
        )
    })?;

    let scheduled = delete().and_then(|()| {
        crate::sys::utils::write_file_without_following(
            &app_data_dir.join(PENDING_LOCAL_WIPE_FILE),
            proof.as_bytes(),
        )
        .map_err(|e| format!("Could not schedule the rest of the deletion: {}", e))
    });
    if scheduled.is_err() {
        if let Err(e) = proofs.clear() {
            tracing::warn!("[Privacy] An unused deletion proof was not removed: {}", e);
        }
    }
    scheduled
}

/// Removes every entry of each folder except the names in `keep`, and
/// returns how many were removed and how many could not be. Entries come
/// from the folder listing, never from stored data, and a link is removed as
/// a link, not followed.
fn empty_app_folders(roots: &[std::path::PathBuf], keep: &[&str]) -> (usize, usize) {
    let mut removed = 0usize;
    let mut failed = 0usize;
    for root in roots {
        let Ok(entries) = std::fs::read_dir(root) else {
            continue;
        };
        for entry in entries.flatten() {
            if keep
                .iter()
                .any(|name| entry.file_name().to_str() == Some(*name))
            {
                continue;
            }
            let path = entry.path();
            let is_folder = entry.file_type().is_ok_and(|kind| kind.is_dir());
            let outcome = if is_folder {
                std::fs::remove_dir_all(&path)
            } else {
                std::fs::remove_file(&path)
            };
            match outcome {
                Ok(()) => removed += 1,
                Err(e) => {
                    failed += 1;
                    tracing::warn!("[Privacy] Could not remove {}: {}", path.display(), e);
                }
            }
        }
    }
    (removed, failed)
}

/// The folders and files outside the app's own in which the system webview
/// keeps this app's web data, named by its bundle identifier. On macOS
/// WKWebView stores localStorage, IndexedDB, its network state and its
/// cookies under the user's Library. On Windows and Linux the webview's data
/// folder is the app's local data folder, which the wipe already empties.
fn web_data_paths(bundle_identifier: &str) -> Vec<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir()
            .map(|home| {
                let library = home.join("Library");
                vec![
                    library.join("WebKit").join(bundle_identifier),
                    library.join("HTTPStorages").join(bundle_identifier),
                    library
                        .join("Cookies")
                        .join(format!("{bundle_identifier}.binarycookies")),
                ]
            })
            .unwrap_or_default()
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bundle_identifier;
        Vec::new()
    }
}

/// The folder every build of the app shares under the OS data folders, next
/// to the bundle's own, and what the app keeps in it for the user: screen
/// captures taken for computer use, page screenshots, and the profiles of
/// the browsers it drives. Installed extensions live there too and stay.
const SHARED_DATA_FOLDER: &str = "agiworkforce";
const SHARED_USER_DATA: &[&str] = &["computer-use", "screenshots", "browser-profiles"];

fn shared_user_data_paths(data_folders: &[std::path::PathBuf]) -> Vec<std::path::PathBuf> {
    let mut paths: Vec<std::path::PathBuf> = data_folders
        .iter()
        .flat_map(|folder| {
            SHARED_USER_DATA
                .iter()
                .map(move |name| folder.join(SHARED_DATA_FOLDER).join(name))
        })
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

/// Every place the command audit log can be: the validator that writes it
/// reads the home folder from the environment, which can differ from the
/// one the system reports.
fn command_audit_log_paths() -> Vec<std::path::PathBuf> {
    let from_environment = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(std::path::PathBuf::from);
    let mut paths: Vec<std::path::PathBuf> = [dirs::home_dir(), from_environment]
        .into_iter()
        .flatten()
        .map(|home| home.join(SHARED_CLI_FOLDER).join(COMMAND_AUDIT_LOG))
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

/// Runs [`finish_pending_local_wipe`] for this app. Call it after `build`
/// and before `run`: the webviews do not exist yet, so nothing holds the
/// web data open.
///
/// The log folder is emptied, not removed. Logging starts before the app
/// knows its data folder, so the logs sit outside it and today's file is
/// already open here: on macOS and Linux it is unlinked and this run's lines
/// go to a file that is gone when the app exits; on Windows it is opened
/// with delete sharing, so it is removed at once or when it is closed.
pub fn finish_pending_local_wipe_before_webview(app: &tauri::App) {
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return;
    };
    let mut emptied_folders: Vec<std::path::PathBuf> =
        [app.path().app_local_data_dir(), app.path().app_cache_dir()]
            .into_iter()
            .filter_map(Result::ok)
            .collect();
    emptied_folders.extend(crate::sys::telemetry::active_log_dir());

    let mut removed_whole = web_data_paths(&app.config().identifier);
    let data_folders: Vec<std::path::PathBuf> = [dirs::data_local_dir(), dirs::data_dir()]
        .into_iter()
        .flatten()
        .collect();
    removed_whole.extend(shared_user_data_paths(&data_folders));
    removed_whole.extend(command_audit_log_paths());

    let proofs = match OsWipeProofStore::for_bundle_identifier(&app.config().identifier) {
        Ok(proofs) => proofs,
        Err(e) => {
            tracing::warn!("[Privacy] A pending deletion cannot be checked: {}", e);
            return;
        }
    };
    finish_pending_local_wipe(&app_data_dir, &emptied_folders, &removed_whole, &proofs);
}

/// Finishes a deletion the user asked for before the last exit: empties the
/// app's own folders and removes each path of `removed_whole`, folder or
/// file; a link standing in for one is left alone.
///
/// The marker is obeyed only when it holds the proof the deletion left in
/// the credential store. Any other marker is removed and nothing is wiped.
/// When the store cannot be read the marker stays for a launch that can
/// read it, and nothing is wiped.
///
/// A proof is good for one launch. The marker is readable where it lies, so
/// a copy of it could be put back later: every launch that reaches the
/// credential store leaves no proof in it, whether the marker was obeyed,
/// refused or not there at all.
///
/// The proof and the marker go last, so a launch that is cut short starts
/// over on the next one, and they go even when an entry could not be
/// removed, so a later launch never wipes data created after the request.
fn finish_pending_local_wipe(
    app_data_dir: &std::path::Path,
    other_app_folders: &[std::path::PathBuf],
    removed_whole: &[std::path::PathBuf],
    proofs: &dyn WipeProofStore,
) {
    let marker = app_data_dir.join(PENDING_LOCAL_WIPE_FILE);
    let Some(claim) = pending_wipe_claim(&marker) else {
        if let Err(e) = proofs.clear() {
            tracing::debug!("[Privacy] No deletion proof was cleared: {}", e);
        }
        return;
    };
    let proof = match proofs.load() {
        Ok(proof) => proof,
        Err(e) => {
            tracing::warn!(
                "[Privacy] A pending deletion was not carried out, the system credential store \
                 could not be read: {}",
                e
            );
            return;
        }
    };
    if !proof.is_some_and(|proof| proves_wipe(&proof, claim.trim())) {
        tracing::warn!(
            "[Privacy] Ignored a deletion marker that the user's confirmation does not back; \
             nothing was deleted"
        );
        retire_wipe_proof(proofs);
        if let Err(e) = std::fs::remove_file(&marker) {
            tracing::warn!("[Privacy] Could not clear the deletion marker: {}", e);
        }
        return;
    }

    let mut roots = vec![app_data_dir.to_path_buf()];
    roots.extend(other_app_folders.iter().cloned());
    let (mut removed, mut failed) = empty_app_folders(&roots, &[PENDING_LOCAL_WIPE_FILE]);
    for path in removed_whole {
        let Ok(found) = std::fs::symlink_metadata(path) else {
            continue;
        };
        let outcome = if found.is_dir() {
            std::fs::remove_dir_all(path)
        } else if found.is_file() {
            std::fs::remove_file(path)
        } else {
            continue;
        };
        match outcome {
            Ok(()) => removed += 1,
            Err(e) => {
                failed += 1;
                tracing::warn!("[Privacy] Could not remove {}: {}", path.display(), e);
            }
        }
    }
    retire_wipe_proof(proofs);
    if let Err(e) = std::fs::remove_file(&marker) {
        tracing::warn!("[Privacy] Could not clear the deletion marker: {}", e);
    }
    tracing::info!(
        "[Privacy] Finished deleting local data at startup: {} entries removed, {} left",
        removed,
        failed
    );
}

fn artefact_roots(app_handle: &tauri::AppHandle) -> Vec<std::path::PathBuf> {
    let resolver = app_handle.path();
    [
        resolver.app_data_dir(),
        resolver.app_local_data_dir(),
        resolver.app_cache_dir(),
    ]
    .into_iter()
    .filter_map(Result::ok)
    .collect()
}

const DELETE_ALL_DATA_LABEL: &str = "Delete All Data";

/// One delete-all question at a time, and a wait after a no that grows
/// while the noes keep coming, so a loop cannot stack them or wear the user
/// down.
static DELETE_ALL_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();
const DELETE_ALL_REQUEST: &str = "delete all data on this device";

/// The question asked before anything is deleted, in the words the Privacy
/// tab uses.
fn delete_all_data_question() -> crate::sys::native_confirm::NativeConfirm {
    crate::sys::native_confirm::NativeConfirm {
        title: "Delete all data on this device?".to_string(),
        body: "This removes every conversation, memory and project, your saved API keys and \
               credentials, your settings, and the files AGI Workforce stored in its own data \
               folders on this device, with its log of the terminal commands it ran. None of it \
               can be recovered. You are signed out and the app restarts as if newly installed.\n\nNot removed: installed extensions, \
               downloaded speech models, the settings, hooks, skills and agents shared with the \
               command-line tool, and temporary files, which the system clears. A Cloud account, \
               if you have one, is not deleted."
            .to_string(),
        confirm_label: DELETE_ALL_DATA_LABEL.to_string(),
    }
}

/// Asks, and deletes only on a yes. `Ok(false)` is a decline: nothing was
/// touched. The window can call the command but cannot answer the question,
/// so a script running in it cannot wipe the device.
///
/// A deletion that went through ends in `restart`, called here and not left
/// to the window: until the app starts again the request stays open, and
/// whatever is written in the meantime is wiped with the rest.
async fn delete_local_data_confirmed<Confirm, Answer, Delete, Restart>(
    confirm: Confirm,
    delete: Delete,
    restart: Restart,
) -> Result<bool, String>
where
    Confirm: FnOnce(crate::sys::native_confirm::NativeConfirm) -> Answer,
    Answer: std::future::Future<Output = bool>,
    Delete: FnOnce() -> Result<(), String>,
    Restart: FnOnce(),
{
    if !confirm(delete_all_data_question()).await {
        tracing::info!("[Privacy] Deleting all local data was declined in the native dialog");
        return Ok(false);
    }
    delete()?;
    restart();
    Ok(true)
}

/// How long the window has, after a deletion, to end the Cloud session on
/// the server and restart the app itself before the app restarts anyway.
const RESTART_AFTER_DELETION: std::time::Duration = std::time::Duration::from_secs(5);

/// Restarts the app once [`RESTART_AFTER_DELETION`] has passed, whatever the
/// window does. A restart is not a quit: nothing can hold it back
/// (`sys::shutdown::handle_exit_requested`).
fn restart_after_deletion(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(RESTART_AFTER_DELETION).await;
        tracing::info!("[Privacy] Restarting to finish deleting local data");
        app.request_restart();
    });
}

/// Deletes what this app stored for the user on this device, once the user
/// has said yes in a dialog the operating system draws; `false` means the
/// user declined and nothing changed. After a yes the app restarts itself
/// within [`RESTART_AFTER_DELETION`]. See [`delete_local_data`].
#[tauri::command]
pub async fn privacy_delete_account(
    state: State<'_, AppDatabase>,
    secret_state: State<'_, SecretManagerState>,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let app = &app_handle;
    let proofs = OsWipeProofStore::for_bundle_identifier(&app.config().identifier)?;
    delete_local_data_confirmed(
        |question| async move {
            match DELETE_ALL_DECISIONS
                .confirm(app, DELETE_ALL_REQUEST, question)
                .await
            {
                Ok(answer) => answer,
                Err(held) => {
                    tracing::info!("[Privacy] delete-all was not asked: {}", held.message());
                    false
                }
            }
        },
        || {
            let app_data_dir = crate::sys::utils::app_data_dir()
                .map_err(|e| format!("Could not find the app data folder: {}", e))?;
            delete_and_schedule_wipe(&proofs, &app_data_dir, || {
                delete_local_data(&state, &secret_state, app)
            })
        },
        || restart_after_deletion(app.clone()),
    )
    .await
}

/// The Cloud sign-in in the OS keyring, the files its rows point at inside
/// the app's own folders, and every row of every user table, now. The rest
/// of the app's own folders goes at the next launch, which
/// [`delete_and_schedule_wipe`] arranges and the caller starts. The database
/// key and the install secret stay in the keyring: a fresh database opens
/// with them, and nothing is left encrypted under them.
fn delete_local_data(
    state: &State<'_, AppDatabase>,
    secret_state: &State<'_, SecretManagerState>,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    crate::sys::account::clear_cloud_session(app_handle, secret_state.manager())?;

    let conn = state
        .conn
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let summary = purge_local_user_data(&conn, &artefact_roots(app_handle))?;

    if let Err(e) = conn.execute_batch("VACUUM") {
        tracing::warn!("[Privacy] Deleted pages not reclaimed: {}", e);
    }

    for (label, window) in app_handle.webview_windows() {
        if let Err(e) = window.clear_all_browsing_data() {
            tracing::warn!(
                "[Privacy] Web data of window {} was not cleared: {}",
                label,
                e
            );
        }
    }

    tracing::info!(
        "[Privacy] Local data deletion completed: {} rows across {} local tables, {} on-disk artefacts",
        summary.deleted_rows,
        summary.cleared_tables,
        summary.removed_artefacts
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::db::migrations::run_migrations;

    fn migrated_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        run_migrations(&conn).expect("run migrations");
        conn
    }

    fn preferences(telemetry_enabled: bool) -> PrivacyPreferences {
        PrivacyPreferences {
            telemetry_enabled,
            crash_reporting_enabled: false,
            ai_model_sharing_enabled: false,
            analytics_enabled: telemetry_enabled,
            usage_data_collection: false,
        }
    }

    #[test]
    fn telemetry_consent_is_refused_until_it_is_recorded() {
        let conn = migrated_conn();

        assert!(!stored_telemetry_consent(&conn));
    }

    #[test]
    fn recorded_telemetry_consent_is_read_back_after_a_restart() {
        let conn = migrated_conn();

        store_privacy_preferences(&conn, &preferences(true)).expect("store consent");
        assert!(stored_telemetry_consent(&conn));

        store_privacy_preferences(&conn, &preferences(false)).expect("store withdrawal");
        assert!(!stored_telemetry_consent(&conn));
    }

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM \"{}\"", table), [], |row| {
            row.get(0)
        })
        .unwrap_or_else(|e| panic!("count {}: {}", table, e))
    }

    fn seed_local_content(conn: &Connection) {
        conn.execute(
            "INSERT INTO conversations (id, title) VALUES (1, 'Local chat')",
            [],
        )
        .expect("seed conversation");
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (1, 'user', 'my private note')",
            [],
        )
        .expect("seed message");
        conn.execute(
            "INSERT INTO email_accounts (id, provider, email, imap_host, imap_port, smtp_host, smtp_port, password_encrypted, created_at)
             VALUES (1, 'imap', 'owner@example.test', 'imap.example.test', 993, 'smtp.example.test', 465, 'ciphertext', 1)",
            [],
        )
        .expect("seed email account");
        conn.execute(
            "INSERT INTO emails (id, account_id, message_id, subject, from_email, to_emails, date, body_text, size, created_at)
             VALUES ('e1', 1, 'm1', 'Payslip', 'payroll@example.test', 'owner@example.test', 1, 'net pay', 10, 1)",
            [],
        )
        .expect("seed email");
        conn.execute(
            "INSERT INTO contacts (email, display_name, phone, created_at, updated_at)
             VALUES ('friend@example.test', 'Friend', '000', 1, 1)",
            [],
        )
        .expect("seed contact");
        conn.execute(
            "INSERT INTO captures (id, capture_type, file_path, ocr_text, created_at)
             VALUES ('c1', 'fullscreen', '/local/captures/c1.png', 'bank balance', 1)",
            [],
        )
        .expect("seed capture");
    }

    #[test]
    fn purge_clears_local_content_the_old_allowlist_missed() {
        let conn = migrated_conn();
        seed_local_content(&conn);

        let summary = purge_local_user_data(&conn, &[]).expect("purge");
        let (deleted_rows, cleared_tables) = (summary.deleted_rows, summary.cleared_tables);

        assert!(deleted_rows >= 6, "expected seeded rows to be deleted");
        assert!(cleared_tables > 50, "expected the whole schema to be swept");
        for table in [
            "conversations",
            "messages",
            "emails",
            "contacts",
            "captures",
        ] {
            assert_eq!(count(&conn, table), 0, "{} still holds user content", table);
        }
    }

    #[test]
    fn purge_covers_a_table_added_after_this_code_was_written() {
        let conn = migrated_conn();
        conn.execute(
            "CREATE TABLE desk22_future_feature (id INTEGER PRIMARY KEY, secret TEXT NOT NULL)",
            [],
        )
        .expect("create future table");
        conn.execute(
            "INSERT INTO desk22_future_feature (secret) VALUES ('unlisted user content')",
            [],
        )
        .expect("seed future table");

        purge_local_user_data(&conn, &[]).expect("purge");

        assert_eq!(
            count(&conn, "desk22_future_feature"),
            0,
            "a table added without editing privacy.rs kept its rows"
        );
    }

    #[test]
    fn purge_leaves_no_populated_table_except_migration_bookkeeping() {
        let conn = migrated_conn();
        seed_local_content(&conn);

        purge_local_user_data(&conn, &[]).expect("purge");

        let tables = classify_local_tables(&conn).expect("classify");
        assert!(
            tables.rows.len() > 50,
            "expected the whole schema to be swept"
        );
        for table in &tables.rows {
            assert_eq!(count(&conn, table), 0, "{} survived the purge", table);
        }
        assert_eq!(tables.preserved, vec!["schema_version".to_string()]);
        assert!(
            count(&conn, "schema_version") > 0,
            "migration history must survive so the app still boots"
        );
    }

    #[test]
    fn purge_clears_full_text_search_indexes() {
        let conn = migrated_conn();
        let has_fts: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'messages_fts'",
                [],
                |row| row.get(0),
            )
            .expect("probe fts");
        if has_fts == 0 {
            return;
        }

        conn.execute(
            "INSERT INTO messages_fts (message_id, conversation_id, content, sender, message_type, timestamp)
             VALUES ('1', '1', 'my private note', 'user', 'text', '1')",
            [],
        )
        .expect("seed fts row");

        purge_local_user_data(&conn, &[]).expect("purge");

        assert_eq!(count(&conn, "messages_fts"), 0, "search index kept content");
    }

    #[test]
    fn purge_removes_the_on_disk_artefacts_the_rows_point_at() {
        let artefact_root = tempfile::tempdir().expect("artefact root");
        let screenshot = artefact_root.path().join("c1.png");
        std::fs::write(&screenshot, b"screen pixels").expect("write screenshot");

        let user_workspace = tempfile::tempdir().expect("user workspace");
        let user_document = user_workspace.path().join("thesis.pdf");
        std::fs::write(&user_document, b"not the app's to delete").expect("write document");

        let conn = migrated_conn();
        conn.execute(
            "INSERT INTO captures (id, capture_type, file_path, ocr_text, created_at)
             VALUES ('c1', 'fullscreen', ?1, 'bank balance', 1)",
            [screenshot.to_str().expect("utf8 path")],
        )
        .expect("seed capture");
        conn.execute(
            "INSERT INTO codebase_cache (id, project_path, cache_type, data, created_at, expires_at)
             VALUES ('p1', ?1, 'file_tree', '{}', 1, 1)",
            [user_workspace.path().to_str().expect("utf8 path")],
        )
        .expect("seed codebase cache");

        let summary =
            purge_local_user_data(&conn, &[artefact_root.path().to_path_buf()]).expect("purge");

        assert!(
            !screenshot.exists(),
            "screenshot file survived account deletion"
        );
        assert!(
            user_document.exists(),
            "purge deleted a file outside the app's own artefact roots"
        );
        assert_eq!(summary.removed_artefacts, 1);
    }

    #[test]
    fn a_purge_stopped_after_its_files_finishes_when_it_runs_again() {
        let artefact_root = tempfile::tempdir().expect("artefact root");
        let screenshot = artefact_root.path().join("c1.png");
        std::fs::write(&screenshot, b"screen pixels").expect("write screenshot");

        let conn = migrated_conn();
        conn.execute(
            "INSERT INTO captures (id, capture_type, file_path, ocr_text, created_at)
             VALUES ('c1', 'fullscreen', ?1, 'bank balance', 1)",
            [screenshot.to_str().expect("utf8 path")],
        )
        .expect("seed capture");

        let tables = classify_local_tables(&conn).expect("classify");
        let artefacts = collect_artefact_paths(&conn, &tables).expect("collect");
        assert_eq!(
            remove_contained_artefacts(&artefacts, &[artefact_root.path().to_path_buf()]),
            1
        );
        assert_eq!(count(&conn, "captures"), 1, "the rows still name the files");

        let summary =
            purge_local_user_data(&conn, &[artefact_root.path().to_path_buf()]).expect("purge");

        assert_eq!(summary.removed_artefacts, 0);
        assert_eq!(count(&conn, "captures"), 0);
    }

    #[cfg(unix)]
    #[test]
    fn purge_never_deletes_through_a_link_or_the_app_folder_itself() {
        let artefact_root = tempfile::tempdir().expect("artefact root");
        let user_workspace = tempfile::tempdir().expect("user workspace");
        let user_document = user_workspace.path().join("thesis.pdf");
        std::fs::write(&user_document, b"not the app's to delete").expect("write document");
        let planted_link = artefact_root.path().join("thesis.pdf");
        std::os::unix::fs::symlink(&user_document, &planted_link).expect("plant link");
        let climbing = artefact_root
            .path()
            .join("..")
            .join(user_workspace.path().file_name().expect("workspace name"))
            .join("thesis.pdf");

        let removed = remove_contained_artefacts(
            &[
                planted_link.clone(),
                climbing,
                artefact_root.path().to_path_buf(),
            ],
            &[artefact_root.path().to_path_buf()],
        );

        assert_eq!(removed, 0);
        assert!(user_document.exists(), "a file outside the app was deleted");
        assert!(artefact_root.path().exists(), "the app folder was deleted");
    }

    #[tokio::test]
    async fn nothing_is_deleted_unless_the_native_dialog_says_so() {
        let deletions = std::cell::Cell::new(0);
        let delete = || {
            deletions.set(deletions.get() + 1);
            Ok(())
        };

        let restarts = std::cell::Cell::new(0);
        let restart = || restarts.set(restarts.get() + 1);

        assert_eq!(
            delete_local_data_confirmed(|_| async { false }, delete, restart).await,
            Ok(false)
        );
        assert_eq!(deletions.get(), 0, "a decline must change nothing");
        assert_eq!(restarts.get(), 0, "a decline must not restart the app");

        let asked = std::cell::RefCell::new(None);
        let outcome = delete_local_data_confirmed(
            |question| {
                *asked.borrow_mut() = Some(question);
                async { true }
            },
            delete,
            restart,
        )
        .await;
        assert_eq!(outcome, Ok(true));
        assert_eq!(deletions.get(), 1);
        assert_eq!(
            restarts.get(),
            1,
            "the app must restart itself after a deletion, not wait for the window"
        );

        let question = asked.into_inner().expect("the user was asked");
        assert_eq!(question.title, "Delete all data on this device?");
        assert_eq!(question.confirm_label, "Delete All Data");
        assert!(crate::sys::native_confirm::can_ask_with(
            &question.confirm_label
        ));
        for phrase in [
            "every conversation, memory and project",
            "your saved API keys and credentials",
            "the files AGI Workforce stored in its own data folders on this device",
            "with its log of the terminal commands it ran",
            "None of it can be recovered",
            "the app restarts as if newly installed",
            "Not removed: installed extensions, downloaded speech models",
            "shared with the command-line tool",
            "A Cloud account, if you have one, is not deleted",
        ] {
            assert!(
                question.body.contains(phrase),
                "the question omits: {phrase}"
            );
        }
    }

    #[tokio::test]
    async fn a_deletion_that_fails_after_a_yes_is_reported() {
        let restarted = std::cell::Cell::new(false);
        let outcome = delete_local_data_confirmed(
            |_| async { true },
            || Err("Failed to lock database".to_string()),
            || restarted.set(true),
        )
        .await;

        assert_eq!(outcome, Err("Failed to lock database".to_string()));
        assert!(
            !restarted.get(),
            "nothing was scheduled, so nothing restarts"
        );
    }

    /// A credential store held in memory, which can be made to refuse.
    #[derive(Default)]
    struct HeldProof {
        proof: std::cell::RefCell<Option<String>>,
        unavailable: std::cell::Cell<bool>,
    }

    impl HeldProof {
        fn reachable(&self) -> Result<(), String> {
            if self.unavailable.get() {
                Err("the keychain is locked".to_string())
            } else {
                Ok(())
            }
        }
    }

    impl WipeProofStore for HeldProof {
        fn load(&self) -> Result<Option<String>, String> {
            self.reachable()?;
            Ok(self.proof.borrow().clone())
        }

        fn store(&self, proof: &str) -> Result<(), String> {
            self.reachable()?;
            *self.proof.borrow_mut() = Some(proof.to_string());
            Ok(())
        }

        fn clear(&self) -> Result<(), String> {
            self.reachable()?;
            self.proof.borrow_mut().take();
            Ok(())
        }
    }

    fn request_wipe(app_data: &std::path::Path, proofs: &HeldProof) {
        delete_and_schedule_wipe(proofs, app_data, || Ok(())).expect("schedule the wipe");
    }

    #[test]
    fn a_marker_the_user_did_not_confirm_wipes_nothing() {
        let unrelated_proof = "ab".repeat(WIPE_PROOF_BYTES);
        let forged_claim = "cd".repeat(WIPE_PROOF_BYTES);
        let cases: [(Option<&str>, &str); 5] = [
            (None, ""),
            (None, forged_claim.as_str()),
            (Some(""), ""),
            (Some(unrelated_proof.as_str()), ""),
            (Some(unrelated_proof.as_str()), forged_claim.as_str()),
        ];

        for (held, claim) in cases {
            let app_data = tempfile::tempdir().expect("app data");
            let cache = tempfile::tempdir().expect("cache");
            let web_store = tempfile::tempdir().expect("web store");
            let chats = app_data.path().join("agiworkforce.db");
            std::fs::write(&chats, b"every conversation").expect("database");
            std::fs::write(cache.path().join("thumb.png"), b"pixels").expect("cache file");
            let marker = app_data.path().join(PENDING_LOCAL_WIPE_FILE);
            std::fs::write(&marker, claim).expect("forged marker");
            let proofs = HeldProof::default();
            *proofs.proof.borrow_mut() = held.map(str::to_string);

            finish_pending_local_wipe(
                app_data.path(),
                &[cache.path().to_path_buf()],
                &[web_store.path().to_path_buf()],
                &proofs,
            );

            assert!(
                chats.exists()
                    && cache.path().join("thumb.png").exists()
                    && web_store.path().exists(),
                "a forged marker {claim:?} wiped the device with {held:?} in the credential store"
            );
            assert!(
                !marker.exists(),
                "a forged marker must not be left to try again"
            );
            assert_eq!(*proofs.proof.borrow(), None);
        }
    }

    #[test]
    fn a_marker_replayed_after_its_wipe_wipes_nothing() {
        let app_data = tempfile::tempdir().expect("app data");
        let proofs = HeldProof::default();
        let marker = app_data.path().join(PENDING_LOCAL_WIPE_FILE);
        std::fs::write(app_data.path().join("agiworkforce.db"), b"old").expect("database");

        request_wipe(app_data.path(), &proofs);
        let used_claim = std::fs::read(&marker).expect("the marker holds the proof");
        assert_eq!(used_claim.len(), WIPE_PROOF_HEX_LEN);
        assert_eq!(
            proofs.proof.borrow().as_deref().map(str::as_bytes),
            Some(used_claim.as_slice())
        );
        finish_pending_local_wipe(app_data.path(), &[], &[], &proofs);
        assert!(!app_data.path().join("agiworkforce.db").exists());
        assert!(!marker.exists());
        assert_eq!(*proofs.proof.borrow(), None, "a proof is used once");

        let later = app_data.path().join("agiworkforce.db");
        std::fs::write(&later, b"written after the deletion").expect("new database");
        std::fs::write(&marker, &used_claim).expect("replay the marker");
        finish_pending_local_wipe(app_data.path(), &[], &[], &proofs);

        assert!(later.exists(), "a replayed marker wiped newer data");
        assert!(!marker.exists());
    }

    #[test]
    fn a_marker_withheld_from_one_launch_wipes_nothing_at_a_later_one() {
        let app_data = tempfile::tempdir().expect("app data");
        let proofs = HeldProof::default();
        let marker = app_data.path().join(PENDING_LOCAL_WIPE_FILE);
        let chats = app_data.path().join("agiworkforce.db");
        std::fs::write(&chats, b"every conversation").expect("database");

        request_wipe(app_data.path(), &proofs);
        let copied_claim = std::fs::read(&marker).expect("the marker holds the proof");
        std::fs::remove_file(&marker).expect("withhold the marker");
        finish_pending_local_wipe(app_data.path(), &[], &[], &proofs);
        assert!(chats.exists());
        assert_eq!(
            *proofs.proof.borrow(),
            None,
            "a proof must not outlive the launch after the request"
        );

        std::fs::write(&marker, &copied_claim).expect("put the marker back");
        finish_pending_local_wipe(app_data.path(), &[], &[], &proofs);

        assert!(chats.exists(), "a marker put back later wiped the device");
        assert!(!marker.exists());
    }

    #[test]
    fn two_requests_never_share_a_proof() {
        let first = new_wipe_proof().expect("proof");
        let second = new_wipe_proof().expect("proof");

        assert_eq!(first.len(), WIPE_PROOF_HEX_LEN);
        assert_ne!(first, second);
        assert!(proves_wipe(&first, &first));
        assert!(!proves_wipe(&first, &second));
        assert!(!proves_wipe("", ""));
    }

    #[test]
    fn without_the_credential_store_nothing_is_deleted_or_scheduled() {
        let app_data = tempfile::tempdir().expect("app data");
        let proofs = HeldProof::default();
        proofs.unavailable.set(true);
        let deleted = std::cell::Cell::new(false);

        let outcome = delete_and_schedule_wipe(&proofs, app_data.path(), || {
            deleted.set(true);
            Ok(())
        });

        let refusal = outcome.expect_err("the deletion must be refused");
        assert!(refusal.starts_with("Nothing was deleted."), "{refusal}");
        assert!(refusal.contains("the keychain is locked"), "{refusal}");
        assert!(!deleted.get(), "data was deleted with no way to finish");
        assert!(!app_data.path().join(PENDING_LOCAL_WIPE_FILE).exists());
    }

    #[test]
    fn a_deletion_that_fails_schedules_no_wipe_and_keeps_no_proof() {
        let app_data = tempfile::tempdir().expect("app data");
        let proofs = HeldProof::default();

        let outcome = delete_and_schedule_wipe(&proofs, app_data.path(), || {
            Err("Failed to lock database".to_string())
        });

        assert_eq!(outcome, Err("Failed to lock database".to_string()));
        assert_eq!(*proofs.proof.borrow(), None);
        assert!(!app_data.path().join(PENDING_LOCAL_WIPE_FILE).exists());
    }

    #[test]
    fn a_requested_wipe_waits_for_a_credential_store_it_can_read() {
        let app_data = tempfile::tempdir().expect("app data");
        let proofs = HeldProof::default();
        let chats = app_data.path().join("agiworkforce.db");
        std::fs::write(&chats, b"every conversation").expect("database");
        request_wipe(app_data.path(), &proofs);

        proofs.unavailable.set(true);
        finish_pending_local_wipe(app_data.path(), &[], &[], &proofs);
        assert!(chats.exists(), "nothing is wiped on a marker alone");
        assert!(app_data.path().join(PENDING_LOCAL_WIPE_FILE).exists());

        proofs.unavailable.set(false);
        finish_pending_local_wipe(app_data.path(), &[], &[], &proofs);
        assert!(!chats.exists());
        assert!(!app_data.path().join(PENDING_LOCAL_WIPE_FILE).exists());
    }

    #[test]
    fn a_requested_deletion_empties_the_app_folders_at_the_next_launch() {
        let app_data = tempfile::tempdir().expect("app data");
        let cache = tempfile::tempdir().expect("cache");
        std::fs::write(app_data.path().join("knowledge.db"), b"notes").expect("knowledge");
        std::fs::create_dir_all(app_data.path().join("logs")).expect("logs");
        std::fs::write(app_data.path().join("logs").join("app.log"), b"chat text").expect("log");
        let web_data = tempfile::tempdir().expect("library");
        let web_store = web_data.path().join("WebKit").join("com.example.app");
        std::fs::create_dir_all(web_store.join("WebsiteData")).expect("web store");
        std::fs::write(
            web_store.join("WebsiteData").join("chat.localstorage"),
            b"chat",
        )
        .expect("web data");
        let cookies = web_data
            .path()
            .join("Cookies")
            .join("com.example.app.binarycookies");
        std::fs::create_dir_all(web_data.path().join("Cookies")).expect("cookies folder");
        std::fs::write(&cookies, b"session cookie").expect("cookies");
        let shared = tempfile::tempdir().expect("shared data");
        let logs = shared.path().join("agiworkforce").join("logs");
        std::fs::create_dir_all(&logs).expect("log folder");
        std::fs::write(logs.join("agiworkforce.log.2026-10-11"), b"chat text").expect("log");
        let leftovers = shared_user_data_paths(&[shared.path().to_path_buf()]);
        assert_eq!(leftovers.len(), 3);
        for leftover in &leftovers {
            std::fs::create_dir_all(leftover).expect("shared user data");
            std::fs::write(leftover.join("capture.png"), b"pixels").expect("capture");
        }
        std::fs::create_dir_all(shared.path().join("agiworkforce").join("extensions"))
            .expect("extensions");
        let cli_home = tempfile::tempdir().expect("home");
        let cli_folder = cli_home.path().join(SHARED_CLI_FOLDER);
        std::fs::create_dir_all(&cli_folder).expect("shared folder");
        let audit_log = cli_folder.join(COMMAND_AUDIT_LOG);
        std::fs::write(&audit_log, b"cmd=curl -H 'Authorization: Bearer sk-typed'").expect("log");
        std::fs::write(cli_folder.join("config.toml"), b"model = \"x\"").expect("cli config");
        let web_paths: Vec<std::path::PathBuf> =
            [web_store.clone(), cookies.clone(), audit_log.clone()]
                .into_iter()
                .chain(leftovers.clone())
                .collect();
        let emptied = [cache.path().to_path_buf(), logs.clone()];
        std::fs::write(cache.path().join("thumb.png"), b"pixels").expect("cache file");
        let proofs = HeldProof::default();

        finish_pending_local_wipe(app_data.path(), &emptied, &web_paths, &proofs);
        assert!(
            app_data.path().join("knowledge.db").exists() && web_store.exists() && cookies.exists(),
            "nothing is removed unless a deletion was requested"
        );

        request_wipe(app_data.path(), &proofs);
        finish_pending_local_wipe(app_data.path(), &emptied, &web_paths, &proofs);

        assert!(!audit_log.exists(), "the command log outlived the deletion");
        assert!(
            cli_folder.join("config.toml").exists(),
            "the command-line tool's own files are not the app's to delete"
        );

        assert!(!app_data.path().join("knowledge.db").exists());
        assert!(!app_data.path().join("logs").exists());
        assert!(!cache.path().join("thumb.png").exists());
        assert!(!web_store.exists(), "the web store outlived the deletion");
        assert!(!cookies.exists(), "the cookies outlived the deletion");
        assert!(logs.exists(), "the logger still needs its folder");
        assert_eq!(
            std::fs::read_dir(&logs).expect("log folder").count(),
            0,
            "the logs outlived the deletion"
        );
        assert!(leftovers.iter().all(|leftover| !leftover.exists()));
        assert!(shared
            .path()
            .join("agiworkforce")
            .join("extensions")
            .exists());
        assert!(web_data.path().join("WebKit").exists());
        assert!(!app_data.path().join(PENDING_LOCAL_WIPE_FILE).exists());

        std::fs::write(app_data.path().join("new-chat.db"), b"after").expect("new data");
        finish_pending_local_wipe(app_data.path(), &[cache.path().to_path_buf()], &[], &proofs);
        assert!(
            app_data.path().join("new-chat.db").exists(),
            "a later launch must not wipe again"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_link_standing_in_for_web_data_is_left_alone() {
        let app_data = tempfile::tempdir().expect("app data");
        let library = tempfile::tempdir().expect("library");
        let user_workspace = tempfile::tempdir().expect("user workspace");
        let user_document = user_workspace.path().join("thesis.pdf");
        std::fs::write(&user_document, b"not the app's to delete").expect("write document");
        let planted_cookies = library.path().join("com.example.app.binarycookies");
        std::os::unix::fs::symlink(&user_document, &planted_cookies).expect("plant file link");
        let planted_store = library.path().join("com.example.app");
        std::os::unix::fs::symlink(user_workspace.path(), &planted_store).expect("plant link");
        let missing = library.path().join("never-created");
        let proofs = HeldProof::default();
        request_wipe(app_data.path(), &proofs);

        finish_pending_local_wipe(
            app_data.path(),
            &[],
            &[planted_cookies.clone(), planted_store.clone(), missing],
            &proofs,
        );

        assert!(user_document.exists(), "a file outside the app was deleted");
        assert!(std::fs::symlink_metadata(&planted_cookies).is_ok());
        assert!(std::fs::symlink_metadata(&planted_store).is_ok());
        assert!(!app_data.path().join(PENDING_LOCAL_WIPE_FILE).exists());
    }

    #[cfg(unix)]
    #[test]
    fn emptying_the_app_folders_removes_a_link_without_following_it() {
        let app_data = tempfile::tempdir().expect("app data");
        let user_workspace = tempfile::tempdir().expect("user workspace");
        let user_document = user_workspace.path().join("thesis.pdf");
        std::fs::write(&user_document, b"not the app's to delete").expect("write document");
        std::os::unix::fs::symlink(user_workspace.path(), app_data.path().join("linked"))
            .expect("plant link");

        assert_eq!(
            empty_app_folders(&[app_data.path().to_path_buf()], &[]),
            (1, 0)
        );

        assert!(!app_data.path().join("linked").exists());
        assert!(user_document.exists(), "a file outside the app was deleted");
    }

    #[test]
    fn the_export_is_written_where_the_user_chose() {
        let folder = tempfile::tempdir().expect("export folder");
        let chosen = folder.path().join("export.json");

        assert_eq!(
            write_export_file(&chosen, b"{\"first\":1}"),
            Ok("export.json".to_string())
        );
        assert_eq!(
            write_export_file(&chosen, b"{}"),
            Ok("export.json".to_string())
        );
        assert_eq!(std::fs::read(&chosen).expect("read export"), b"{}");
        assert!(write_export_file(std::path::Path::new("export.json"), b"{}").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn the_export_is_not_written_through_a_link() {
        let folder = tempfile::tempdir().expect("export folder");
        let elsewhere = tempfile::tempdir().expect("another folder");
        let target = elsewhere.path().join("authorized_keys");
        std::fs::write(&target, b"untouched").expect("write target");
        let chosen = folder.path().join("export.json");
        std::os::unix::fs::symlink(&target, &chosen).expect("plant link");

        assert!(write_export_file(&chosen, b"{}").is_err());
        assert_eq!(std::fs::read(&target).expect("read target"), b"untouched");
    }

    #[test]
    fn every_table_the_migrations_create_is_classified_for_export() {
        let conn = migrated_conn();
        let schema = classify_local_tables(&conn).expect("classify");

        let unclassified: Vec<&String> = schema
            .rows
            .iter()
            .chain(schema.preserved.iter())
            .filter(|table| table_export(table).is_none())
            .collect();

        assert!(
            unclassified.is_empty(),
            "name each of these in EXPORTED_TABLES, UNSEALED_ROW_TABLES, SECRET_TABLES or \
             INTERNAL_TABLES in sys/commands/privacy.rs: {unclassified:?}"
        );
    }

    #[test]
    fn no_table_is_classified_twice() {
        let mut names: Vec<&str> = EXPORTED_TABLES
            .iter()
            .chain(UNSEALED_ROW_TABLES)
            .chain(SECRET_TABLES)
            .chain(INTERNAL_TABLES)
            .copied()
            .collect();
        let total = names.len();
        names.sort_unstable();
        names.dedup();

        assert_eq!(names.len(), total);
    }

    #[test]
    fn export_leaves_out_key_material_and_sealed_settings() {
        let conn = migrated_conn();
        seed_local_content(&conn);
        conn.execute_batch(
            "INSERT INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
                 VALUES ('ui.theme', '\"dark\"', 'ui', 0, 't', 't'),
                        ('api_key_anthropic', 'sealed-ciphertext', 'security', 1, 't', 't'),
                        ('legacy_api_key_plain', 'sk-plaintext', 'llm', 0, 't', 't');
             INSERT INTO settings (key, value, encrypted)
                 VALUES ('language', 'en', 0), ('provider_api_key', 'sealed-ciphertext', 1);
             INSERT INTO automation_triggers (id, payload, updated_at)
                 VALUES ('t1', '{\"name\":\"nightly\",\"auth_token\":\"whsec-plain\",\"max_tokens\":7}', 't');",
        )
        .expect("seed settings and a trigger");

        let exported = export_tables(&conn).expect("export");
        let raw = export_local_user_data(&conn).expect("export document");

        for table in [
            "master_password",
            "api_keys",
            "auth_sessions",
            "email_accounts",
        ] {
            assert!(
                !exported.tables.contains_key(table),
                "{table} is key material or credentials and was exported"
            );
        }
        assert!(exported.secret.contains(&"master_password".to_string()));
        assert!(exported.internal.contains(&"schema_version".to_string()));
        assert!(exported.unclassified.is_empty());
        for leaked in ["sealed-ciphertext", "sk-plaintext", "whsec-plain"] {
            assert!(!raw.contains(leaked), "{leaked} reached the export");
        }

        let settings = exported.tables["settings_v2"]
            .as_array()
            .expect("settings rows");
        assert!(settings.iter().all(|row| row["key"] != "api_key_anthropic"));
        assert!(settings
            .iter()
            .any(|row| row["key"] == "ui.theme" && row["value"] == "\"dark\""));
        assert!(settings.iter().any(|row| {
            row["key"] == "legacy_api_key_plain" && row["value"] == REDACTED_EXPORT_VALUE
        }));
        let legacy = exported.tables["settings"].as_array().expect("legacy rows");
        assert!(legacy.iter().any(|row| row["key"] == "language"));
        assert!(legacy.iter().all(|row| row["key"] != "provider_api_key"));
        assert!(raw.contains("nightly"));
        assert!(raw.contains("max_tokens"));
    }

    #[test]
    fn export_leaves_out_what_the_app_was_allowed_to_do() {
        let conn = migrated_conn();
        conn.execute_batch(
            "INSERT INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
                 VALUES ('hooks_approved_yaml',
                         'hooks:\n  - command: deploy --token sk-hook-argument\n    env:\n      DEPLOY_KEY: sk-hook-env',
                         'security', 0, 't', 't'),
                        ('hooks_approval_notified_fingerprint', 'fp-hooks', 'security', 0, 't', 't'),
                        ('mcp_project_consent_6170706c65', '{\"servers\":{\"db\":\"fp-consent\"}}', 'security', 0, 't', 't'),
                        ('mcp_unsandboxed_db', 'fp-unsandboxed', 'security', 0, 't', 't'),
                        ('skill_project_consent_6170706c65', 'fp-skills', 'security', 0, 't', 't'),
                        ('mcp_oauth_github_expires_at', '1790000000', 'security', 0, 't', 't'),
                        ('tool_confirmation.agent_mode', '\"full-access\"', 'security', 0, 't', 't'),
                        ('tool_confirmation.auto_approve_all', 'true', 'security', 0, 't', 't'),
                        ('computer_use.consent', '{\"accepted\":true,\"version\":\"consent-v9\"}', 'security', 0, 't', 't'),
                        ('ui.theme', '\"dark\"', 'ui', 0, 't', 't');",
        )
        .expect("seed security bookkeeping");

        let exported = export_tables(&conn).expect("export");
        let raw = export_local_user_data(&conn).expect("export document");

        let settings = exported.tables["settings_v2"]
            .as_array()
            .expect("settings rows");
        assert!(settings.iter().any(|row| row["key"] == "ui.theme"));
        assert!(
            settings.iter().all(|row| row["category"] != "security"),
            "a security row was exported"
        );
        for left_out in [
            "hooks_approved_yaml",
            "hooks_approval_notified_fingerprint",
            "mcp_project_consent_",
            "mcp_unsandboxed_",
            "skill_project_consent_",
            "fp-skills",
            "mcp_oauth_",
            "tool_confirmation.",
            "computer_use.consent",
            "sk-hook-argument",
            "sk-hook-env",
            "fp-hooks",
            "fp-consent",
            "fp-unsandboxed",
            "consent-v9",
        ] {
            assert!(!raw.contains(left_out), "{left_out} reached the export");
        }
    }

    #[test]
    fn an_address_gives_up_no_credential_or_query_wherever_it_is() {
        let mut document = serde_json::json!({
            "url": "https://user:hunter2@mcp.example:8443/sse?token=sk-query#sk-fragment",
            "endpoints": [
                "postgres://app:EXAMPLE@db.example.com/main",
                "https://plain.example/docs"
            ],
            "driver": "jdbc:postgresql://db.example.com/main?password=pw-driver",
            "target": "{\"webhook\":\"https://hooks.example/in?key=sk-embedded\"}",
            "requestHeaders": { "Referer": "https://ref.example/page?session=sk-referer" },
            "unreadable": "https://user:pw/with-slash@host.example/path",
            "sentence": "open https://plain.example/docs?page=2 and read it"
        });

        redact_nested(&mut document);
        let written = document.to_string();

        for leaked in [
            "hunter2",
            "sk-query",
            "sk-fragment",
            "EXAMPLE",
            "pw-driver",
            "sk-embedded",
            "sk-referer",
            "with-slash",
        ] {
            assert!(!written.contains(leaked), "{leaked} reached the export");
        }
        let hidden = agiworkforce_sandbox_policy::REDACTED_SUFFIX;
        assert_eq!(
            document["url"],
            format!("https://mcp.example:8443/sse{hidden}")
        );
        assert_eq!(
            document["endpoints"],
            serde_json::json!([
                format!("postgres://db.example.com/main{hidden}"),
                "https://plain.example/docs"
            ])
        );
        assert!(document["driver"]
            .as_str()
            .is_some_and(|shown| shown.contains("db.example.com/main")));
        assert!(written.contains("hooks.example/in"));
        assert!(written.contains("ref.example/page"));
        assert_eq!(document["unreadable"], REDACTED_EXPORT_VALUE);
        assert_eq!(
            document["sentence"],
            "open https://plain.example/docs?page=2 and read it"
        );
    }

    #[test]
    fn an_address_in_a_row_is_reduced_like_one_in_a_document() {
        let conn = migrated_conn();
        conn.execute(
            "INSERT INTO automation_triggers (id, payload, updated_at) VALUES ('t1', ?1, 't')",
            ["https://hook-user:pw-in-a-cell@hooks.example/run?key=sk-in-a-cell"],
        )
        .expect("seed a trigger");

        let raw = export_local_user_data(&conn).expect("export document");

        assert!(raw.contains("https://hooks.example/run"));
        for leaked in ["hook-user", "pw-in-a-cell", "sk-in-a-cell"] {
            assert!(!raw.contains(leaked), "{leaked} reached the export");
        }
    }

    #[test]
    fn a_map_of_variables_or_headers_is_found_by_its_last_word() {
        for name in [
            "env",
            "ENV",
            "environment",
            "vars",
            "env_vars",
            "envVars",
            "custom-env",
            "headers",
            "http_headers",
            "httpHeaders",
            "HTTPHeaders",
            "request-headers",
            "Request Headers",
        ] {
            assert!(
                is_environment_map(name),
                "{name} is a map of names to values"
            );
        }
        for name in [
            "environment_id",
            "header",
            "preheaders",
            "inventory",
            "variables",
        ] {
            assert!(!is_environment_map(name), "{name} is not such a map");
        }

        let mut document = serde_json::json!({
            "http_headers": { "X-API-Key": "sk-http", "Accept": "application/json" },
            "requestHeaders": { "Authorization": "Bearer sk-request" },
            "envVars": { "OPENAI_API_KEY": "sk-vars", "NODE_ENV": "production" },
            "extra_headers": "not a map: sk-text"
        });

        redact_nested(&mut document);
        let written = document.to_string();

        for leaked in ["sk-http", "sk-request", "sk-vars", "sk-text"] {
            assert!(!written.contains(leaked), "{leaked} reached the export");
        }
        assert_eq!(document["http_headers"]["Accept"], "application/json");
        assert_eq!(document["envVars"]["NODE_ENV"], "production");
    }

    #[test]
    fn the_export_names_the_command_log_it_leaves_out() {
        let conn = migrated_conn();
        let raw = export_local_user_data(&conn).expect("export document");
        let document: serde_json::Value = serde_json::from_str(&raw).expect("export is JSON");

        let left_out = document["export_metadata"]["left_out_files"]
            .as_object()
            .expect("left out files");
        assert_eq!(left_out.len(), 1);
        assert!(left_out["~/.agiworkforce/security-audit.log"]
            .as_str()
            .is_some_and(|reason| reason.contains("arguments, which can hold secrets")));
    }

    #[test]
    fn secrets_nested_in_a_stored_document_are_redacted() {
        let mut document = serde_json::json!({
            "name": "github",
            "env": { "GITHUB_TOKEN": "ghp_plain", "LOG_LEVEL": "debug" },
            "headers": [{ "Authorization": "Bearer plain" }],
            "usage": { "input_tokens": 12, "api_key": null },
            "credentials": { "user": "me", "pin": "1234" }
        });

        redact_nested(&mut document);

        assert_eq!(
            document,
            serde_json::json!({
                "name": "github",
                "env": { "GITHUB_TOKEN": "[redacted]", "LOG_LEVEL": "debug" },
                "headers": "[redacted]",
                "usage": { "input_tokens": 12, "api_key": null },
                "credentials": "[redacted]"
            })
        );

        let mut cell = serde_json::json!("{\"password\":\"EXAMPLE\"}");
        redact_nested(&mut cell);
        assert_eq!(cell, serde_json::json!("{\"password\":\"[redacted]\"}"));
        let mut plain = serde_json::json!("plain text");
        redact_nested(&mut plain);
        assert_eq!(plain, serde_json::json!("plain text"));
    }

    #[test]
    fn a_launch_entry_gives_up_no_secret_through_its_environment_headers_or_arguments() {
        let mut document = serde_json::json!({
            "mcpServers": {
                "db": {
                    "command": "npx",
                    "args": ["-y", "db-mcp", "--api-key", "sk-positional"],
                    "env": {
                        "OPENAI_KEY": "sk-openai",
                        "AWS_ACCESS_KEY_ID": "AKIAEXAMPLE",
                        "GH_PAT": "ghp_pat",
                        "DATABASE_URL": "postgres://app:EXAMPLE@db.example.com/main",
                        "NODE_ENV": "production",
                        "RETRIES": 3,
                        "NESTED": { "inner": "sk-nested" }
                    }
                },
                "remote": {
                    "url": "https://mcp.example/sse",
                    "headers": { "X-API-Key": "sk-header", "Accept": "text/event-stream" },
                    "args": ["kept: this entry launches no command"]
                }
            }
        });

        redact_nested(&mut document);
        let written = document.to_string();

        for leaked in [
            "sk-positional",
            "db-mcp",
            "sk-openai",
            "AKIAEXAMPLE",
            "ghp_pat",
            "EXAMPLE",
            "sk-nested",
            "sk-header",
        ] {
            assert!(!written.contains(leaked), "{leaked} reached the export");
        }
        let db = &document["mcpServers"]["db"];
        assert_eq!(db["command"], "npx");
        assert_eq!(
            db["args"],
            serde_json::json!(["[redacted]", "[redacted]", "[redacted]", "[redacted]"])
        );
        assert_eq!(db["env"]["NODE_ENV"], "production");
        assert_eq!(db["env"]["RETRIES"], 3);
        assert!(db["env"]["DATABASE_URL"]
            .as_str()
            .is_some_and(|shown| shown.contains("db.example.com")));
        let remote = &document["mcpServers"]["remote"];
        assert_eq!(remote["headers"]["X-API-Key"], "[redacted]");
        assert_eq!(remote["headers"]["Accept"], "text/event-stream");
        assert_eq!(remote["args"][0], "kept: this entry launches no command");
    }

    #[test]
    fn a_command_line_keeps_its_program_and_hides_the_rest() {
        let mut document = serde_json::json!({
            "server": { "command": "npx tool --key sk-inline" },
            "quoted": { "command": "'/Applications/My Tool/run' --token sk-quoted" },
            "single": { "command": "npx" },
            "argv": { "cmd": ["node", "server.js", "--api-key", "sk-argv"] },
            "assigned": { "command": "API_KEY=sk-prefix npx tool" },
            "bare": { "command": "API_KEY=sk-bare" },
            "unbalanced": { "command": "sh -c 'echo sk-unbalanced" },
            "job": { "action_data": { "script": "curl -H 'Authorization: Bearer sk-script' https://x.test" } },
            "hook": { "Command-Line": "notify --webhook https://hooks.test/sk-hook" }
        });

        redact_nested(&mut document);
        let written = document.to_string();

        for leaked in [
            "sk-inline",
            "sk-quoted",
            "sk-argv",
            "sk-prefix",
            "sk-bare",
            "sk-unbalanced",
            "sk-script",
            "sk-hook",
        ] {
            assert!(!written.contains(leaked), "{leaked} reached the export");
        }
        assert_eq!(
            document["server"]["command"],
            "npx [3 more arguments hidden]"
        );
        assert_eq!(
            document["quoted"]["command"],
            "/Applications/My Tool/run [2 more arguments hidden]"
        );
        assert_eq!(document["single"]["command"], "npx");
        assert_eq!(
            document["argv"]["cmd"],
            serde_json::json!(["node", "[redacted]", "[redacted]", "[redacted]"])
        );
        assert_eq!(document["assigned"]["command"], "[redacted]");
        assert_eq!(document["unbalanced"]["command"], "[redacted]");
        assert_eq!(
            document["job"]["action_data"]["script"],
            "curl [3 more arguments hidden]"
        );
        assert_eq!(
            document["hook"]["Command-Line"],
            "notify [2 more arguments hidden]"
        );
    }

    #[test]
    fn terminal_history_is_exported_as_programs_not_command_lines() {
        let conn = migrated_conn();
        conn.execute(
            "INSERT INTO command_history (command, args, working_dir, duration_ms)
             VALUES ('curl -u me:sk-history https://api.test', '[\"--verbose\"]', '/tmp', 5)",
            [],
        )
        .expect("seed history");

        let exported = export_tables(&conn).expect("export");
        let row = &exported.tables["command_history"][0];

        assert_eq!(row["command"], "curl [3 more arguments hidden]");
        assert_eq!(row["args"], "[\"[redacted]\"]");
        assert_eq!(row["working_dir"], "/tmp");
    }

    #[test]
    fn names_are_compared_without_case_hyphens_or_spaces() {
        for name in [
            "X-API-Key",
            "x_api_key",
            "Api-Key",
            "PRIVATE KEY",
            "Set-Cookie",
        ] {
            assert!(
                is_secret_name(&normalised_name(name)),
                "{name} names a secret"
            );
        }
        assert!(!is_secret_name(&normalised_name("Content-Type")));
    }

    #[test]
    fn a_stored_server_row_is_redacted_like_a_launch_entry() {
        let conn = migrated_conn();
        conn.execute(
            "INSERT INTO mcp_servers (id, name, command, args, env, created_at, updated_at)
             VALUES ('s1', 'db', 'npx', ?1, ?2, 1, 1)",
            [
                r#"["-y","db-mcp","--api-key","sk-positional"]"#,
                r#"{"OPENAI_KEY":"sk-openai","NODE_ENV":"production"}"#,
            ],
        )
        .expect("seed server");

        let exported = export_tables(&conn).expect("export");
        let row = &exported.tables["mcp_servers"][0];

        assert_eq!(row["command"], "npx");
        assert_eq!(
            row["args"],
            r#"["[redacted]","[redacted]","[redacted]","[redacted]"]"#
        );
        let env: serde_json::Value =
            serde_json::from_str(row["env"].as_str().expect("env text")).expect("env document");
        assert_eq!(
            env,
            serde_json::json!({ "NODE_ENV": "production", "OPENAI_KEY": "[redacted]" })
        );
    }

    #[test]
    fn the_export_covers_the_stores_outside_the_main_database() {
        let app_data = tempfile::tempdir().expect("app data");
        let home = tempfile::tempdir().expect("home");
        std::fs::write(
            app_data.path().join("app_permissions.json"),
            br#"{"apps":{"com.apple.Notes":"allowed"}}"#,
        )
        .expect("app permissions");
        std::fs::write(
            app_data.path().join("trusted_workflows.json"),
            b"not json at all",
        )
        .expect("trusted workflows");
        std::fs::create_dir_all(home.path().join(".agiworkforce")).expect("shared folder");
        std::fs::write(
            home.path().join(".agiworkforce").join("config.toml"),
            b"model = \"local\"\napi_key = \"sk-plain\"\n",
        )
        .expect("shared config");
        std::fs::write(
            home.path().join(".agiworkforce").join("mcp.json"),
            br#"{"mcpServers":{"github":{"command":"npx","env":{"GITHUB_TOKEN":"ghp_plain"}}}}"#,
        )
        .expect("shared mcp servers");

        let stores = export_other_stores(app_data.path(), Some(home.path()));

        assert_eq!(
            stores.keys().map(String::as_str).collect::<Vec<_>>(),
            vec![
                "app_permissions.json",
                "trusted_workflows.json",
                "~/.agiworkforce/config.toml",
                "~/.agiworkforce/mcp.json",
            ],
            "a database that is not on this device is skipped, not an error"
        );
        assert_eq!(
            stores["app_permissions.json"]["apps"]["com.apple.Notes"],
            "allowed"
        );
        assert!(stores["trusted_workflows.json"]["not_exported"].is_string());
        assert_eq!(stores["~/.agiworkforce/config.toml"]["model"], "local");
        let written = serde_json::Value::Object(stores).to_string();
        assert!(!written.contains("sk-plain"));
        assert!(!written.contains("ghp_plain"));
        assert!(export_other_stores(home.path(), None).is_empty());
    }

    #[test]
    fn export_returns_the_local_content_it_claims_to() {
        let conn = migrated_conn();
        seed_local_content(&conn);

        let raw = export_local_user_data(&conn).expect("export must not fail");
        let parsed: serde_json::Value = serde_json::from_str(&raw).expect("export is json");

        assert!(
            parsed
                .get("messages")
                .and_then(|v| v.as_array())
                .is_some_and(|rows| !rows.is_empty()),
            "export dropped the user's messages"
        );
    }

    #[test]
    fn classification_skips_fts_shadow_tables() {
        let conn = migrated_conn();
        let tables = classify_local_tables(&conn).expect("classify");
        for name in &tables.rows {
            assert!(
                !is_fts_shadow_of(name, &tables.search_indexes),
                "{} is an fts shadow table and must not be deleted directly",
                name
            );
        }
    }
}

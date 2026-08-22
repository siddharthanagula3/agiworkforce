use colored::Colorize;

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::conversations;
use crate::markdown::MarkdownRenderer;
use crate::memory::{self, MemoryManager, MemoryTier};
use crate::output;
use crate::sessions;
use crate::terminal_style as ts;
use crate::terminal_text::sanitize_terminal_text;

// ---------------------------------------------------------------------------
// Conversation commands
// ---------------------------------------------------------------------------

pub fn handle_save(session: &mut AgentSession) {
    // Fail closed and say so: with `--no-session-persistence` the write gate in
    // `persist_managed_session` silently no-ops, which would leave /save
    // printing nothing and reading as a dead command.
    if !session.session_persistence_enabled() {
        output::print_error(
            "Cannot save — this run was started with --no-session-persistence, so nothing is written to disk. Restart without that flag to save sessions.",
        );
        return;
    }

    if !session
        .messages
        .iter()
        .any(|message| message.role != "system")
    {
        output::print_warn("Nothing to save — no messages in session yet.");
        return;
    }

    if session.managed_session_id().is_none() {
        if let Err(error) = session.enable_managed_session() {
            output::print_error(&format!("Failed to initialize managed session: {error:#}"));
            return;
        }
    }

    if let Err(error) = session.persist_managed_session() {
        output::print_error(&format!("Failed to persist managed session: {error:#}"));
        return;
    }

    if let Some(session_id) = session.managed_session_id() {
        output::print_info(&format!("Managed session saved: {}", session_id));
    }
}

pub fn handle_load(arg: &str, session: &mut AgentSession) {
    if arg.is_empty() {
        output::print_warn("Usage: /load <id>  (use /history to see IDs)");
        return;
    }

    match crate::runtime::session_control::resolve_managed_session_reference(arg) {
        Ok(resolved) => match crate::runtime::session_control::load_managed_session(arg) {
            Ok(managed_session) => {
                let session_id = managed_session.session_id.clone();
                let message_count = managed_session.messages.len();
                match session.adopt_managed_session(managed_session.clone(), resolved.path) {
                    Ok(()) => {
                        super::load_messages_into_session(session, managed_session.messages);
                        output::print_info(&format!(
                            "Loaded managed session {} ({} messages)",
                            session_id, message_count
                        ));
                    }
                    Err(error) => output::print_error(&format!(
                        "Refusing to load managed session with unknown or incompatible routing authority: {error:#}"
                    )),
                }
            }
            Err(error) => {
                output::print_error(&format!("Failed to load managed session: {error:#}"));
            }
        },
        Err(_) => match conversations::load_conversation(arg) {
            Ok(_) => output::print_error(
                "Refusing to resume this legacy conversation because it has no persisted privacy/provider authority. Start a new session with an explicit route.",
            ),
            Err(e) => {
                output::print_error(&format!("Failed to load: {:#}", e));
            }
        },
    }
}

pub fn handle_history() {
    let mut showed_any = false;

    match crate::runtime::session_control::list_managed_sessions() {
        Ok(summaries) if !summaries.is_empty() => {
            eprintln!("{}", ts::accent_header("Managed Sessions:"));
            for (index, summary) in summaries.iter().take(20).enumerate() {
                eprintln!(
                    "  {} {} {} ({})",
                    format!("{:>2}.", index + 1).dimmed(),
                    summary.session_id.bold(),
                    summary
                        .updated_at
                        .format("%Y-%m-%d %H:%M")
                        .to_string()
                        .dimmed(),
                    format!("{} msgs", summary.message_count).dimmed(),
                );
            }
            if summaries.len() > 20 {
                eprintln!(
                    "  {}",
                    format!("... and {} more", summaries.len() - 20).dimmed()
                );
            }
            showed_any = true;
        }
        Ok(_) => {}
        Err(error) => output::print_error(&format!("Failed to list managed sessions: {error:#}")),
    }

    // Then show legacy JSON conversations
    match conversations::list_conversations() {
        Ok(summaries) if !summaries.is_empty() => {
            eprintln!("{}", ts::accent_header("Legacy (JSON):"));
            for (i, s) in summaries.iter().take(20).enumerate() {
                eprintln!(
                    "  {}. {} {} {} ({})",
                    format!("{:>2}", i + 1).dimmed(),
                    s.id.bold(),
                    ts::muted(s.title.as_str()),
                    format!("[{}]", s.model).dimmed(),
                    format!("{} msgs", s.message_count).dimmed(),
                );
            }
            if summaries.len() > 20 {
                eprintln!(
                    "  {}",
                    format!("... and {} more", summaries.len() - 20).dimmed()
                );
            }
        }
        Ok(_) => {
            if !showed_any {
                output::print_info("No saved conversations yet. Use /save to save one.");
            }
        }
        Err(e) => {
            output::print_error(&format!("Failed to list: {:#}", e));
        }
    }
}

pub(super) fn handle_delete(arg: &str) {
    // Parse an explicit bypass flag (`--force` / `--yes` / `-y`) out of the
    // argument so scripted callers can delete without a prompt; everything else
    // is treated as the session id.
    let mut force = false;
    let mut id_tokens: Vec<&str> = Vec::new();
    for token in arg.split_whitespace() {
        match token {
            "--force" | "--yes" | "-y" => force = true,
            other => id_tokens.push(other),
        }
    }
    let id = id_tokens.join(" ");

    if id.is_empty() {
        output::print_warn("Usage: /delete <id> [--force]  (use /history to see IDs)");
        return;
    }

    // Deletion is destructive and irreversible — gate it with the same
    // confirmation contract as `agi session delete`.
    let interactive = std::io::IsTerminal::is_terminal(&std::io::stdin())
        && std::io::IsTerminal::is_terminal(&std::io::stderr());
    match crate::resolve_destructive_decision(force, interactive) {
        crate::DestructiveDecision::Refuse => {
            output::print_warn(&format!(
                "Refusing to delete '{id}' without confirmation. Re-run as `/delete {id} --force` to delete non-interactively."
            ));
            return;
        }
        crate::DestructiveDecision::Prompt => {
            let confirmed = dialoguer::Confirm::new()
                .with_prompt(format!(
                    "Permanently delete session '{id}'? This cannot be undone."
                ))
                .default(false)
                .interact()
                .unwrap_or(false);
            if !confirmed {
                output::print_info(&format!("Aborted. '{id}' was not deleted."));
                return;
            }
        }
        crate::DestructiveDecision::Proceed => {}
    }

    if crate::runtime::session_control::delete_managed_session(&id).is_ok() {
        output::print_info(&format!("Deleted managed session: {}", id));
        return;
    }

    match conversations::delete_conversation(&id) {
        Ok(()) => {
            output::print_info(&format!("Deleted conversation: {}", id));
        }
        Err(e) => {
            output::print_error(&format!("Failed to delete: {:#}", e));
        }
    }
}

pub fn handle_export(arg: &str, session: &AgentSession) {
    if !session
        .messages
        .iter()
        .any(|message| message.role != "system")
    {
        output::print_warn("Nothing to export — no messages in session yet.");
        return;
    }

    if arg == "json" {
        match conversations::export_as_json(session) {
            Ok(json) => println!("{}", json),
            Err(e) => output::print_error(&format!("Export failed: {:#}", e)),
        }
    } else {
        let md = conversations::export_as_markdown(session);
        println!("{}", sanitize_terminal_text(&md));
    }
}

// ---------------------------------------------------------------------------
// Provider commands
// ---------------------------------------------------------------------------

pub(super) fn handle_providers(config: &CliConfig) {
    eprintln!("{}", ts::accent_header("Providers:"));

    let mut names: Vec<&String> = config.providers.keys().collect();
    names.sort();

    let headers = &["Provider", "Status", "URL"];
    let rows: Vec<Vec<String>> = names
        .iter()
        .map(|name| {
            let pc = &config.providers[*name];
            let status = if let Some(env_var) = &pc.api_key_env {
                if std::env::var(env_var).is_ok() {
                    format!("OK ({})", env_var)
                } else {
                    format!("NOT SET ({})", env_var)
                }
            } else {
                "no key needed".to_string()
            };
            let url = pc.base_url.as_deref().unwrap_or("default").to_string();
            vec![name.to_string(), status, url]
        })
        .collect();

    eprintln!("{}", output::format_table(headers, &rows));
}

// ---------------------------------------------------------------------------
// Permissions commands
// ---------------------------------------------------------------------------

pub fn handle_permissions(arg: &str) {
    let arg = arg.trim();
    let (subcommand, rest) = split_first_word(arg);

    match subcommand {
        "" => show_permissions_tab("allow"),
        "help" | "-h" | "--help" => print_permissions_help(),
        "reset" => match crate::permissions::PermissionStore::load() {
            Ok(mut store) => {
                store.reset();
                match store.save() {
                    Ok(()) => output::print_info("All permissions reset."),
                    Err(e) => output::print_error(&format!("Failed to save: {:#}", e)),
                }
            }
            Err(e) => output::print_error(&format!("Failed to load: {:#}", e)),
        },
        "allow" => {
            if rest.is_empty() {
                show_permissions_tab("allow");
            } else {
                mutate_permission_rule("allow", rest);
            }
        }
        "deny" => {
            if rest.is_empty() {
                show_permissions_tab("deny");
            } else {
                mutate_permission_rule("deny", rest);
            }
        }
        "session" => {
            if rest.is_empty() {
                show_permissions_tab("session");
            } else {
                mutate_permission_rule("session", rest);
            }
        }
        "remove" | "rm" | "delete" => {
            let (scope, rule) = split_first_word(rest);
            remove_permission_rule(scope, rule);
        }
        tab if is_permissions_tab(tab) => show_permissions_tab(tab),
        _ => show_permissions_tab("allow"),
    }
}

fn split_first_word(input: &str) -> (&str, &str) {
    let input = input.trim();
    match input.find(char::is_whitespace) {
        Some(index) => (&input[..index], input[index..].trim()),
        None => (input, ""),
    }
}

fn is_permissions_tab(tab: &str) -> bool {
    matches!(
        tab,
        "allow" | "deny" | "session" | "workspace" | "recently-denied" | "recent"
    )
}

fn show_permissions_tab(tab: &str) {
    match crate::permissions::PermissionStore::load() {
        Ok(store) => eprintln!("{}", sanitize_terminal_text(&store.display_tab(tab))),
        Err(e) => output::print_error(&format!("Failed to load permissions: {:#}", e)),
    }
}

fn mutate_permission_rule(scope: &str, rule: &str) {
    if rule.trim().is_empty() {
        output::print_warn("Usage: /permissions <allow|deny|session> <command-prefix>");
        return;
    }

    let mut store = match crate::permissions::PermissionStore::load() {
        Ok(store) => store,
        Err(e) => {
            output::print_error(&format!("Failed to load permissions: {:#}", e));
            return;
        }
    };

    match scope {
        "allow" => {
            store.allow_always(rule);
            match store.save() {
                Ok(()) => output::print_info(&format!("Always allow: {}", rule.trim())),
                Err(e) => output::print_error(&format!("Failed to save: {:#}", e)),
            }
        }
        "deny" => {
            store.deny_always(rule);
            match store.save() {
                Ok(()) => output::print_info(&format!("Always deny: {}", rule.trim())),
                Err(e) => output::print_error(&format!("Failed to save: {:#}", e)),
            }
        }
        "session" => {
            store.allow_session_for_process(rule);
            output::print_info(&format!("Allow this session: {}", rule.trim()));
        }
        _ => output::print_warn("Usage: /permissions <allow|deny|session> <command-prefix>"),
    }
}

fn remove_permission_rule(scope: &str, rule: &str) {
    if rule.trim().is_empty() || !matches!(scope, "allow" | "deny" | "session") {
        output::print_warn("Usage: /permissions remove <allow|deny|session> <command-prefix>");
        return;
    }

    let mut store = match crate::permissions::PermissionStore::load() {
        Ok(store) => store,
        Err(e) => {
            output::print_error(&format!("Failed to load permissions: {:#}", e));
            return;
        }
    };

    let removed = match scope {
        "allow" => store.remove_always_allow(rule),
        "deny" => store.remove_always_deny(rule),
        "session" => store.remove_session(rule),
        _ => false,
    };

    if !removed {
        output::print_warn(&format!(
            "No {scope} permission rule matched: {}",
            rule.trim()
        ));
        return;
    }

    if scope == "session" {
        output::print_info(&format!("Removed session permission: {}", rule.trim()));
        return;
    }

    match store.save() {
        Ok(()) => output::print_info(&format!("Removed {scope} permission: {}", rule.trim())),
        Err(e) => output::print_error(&format!("Failed to save: {:#}", e)),
    }
}

fn print_permissions_help() {
    eprintln!(
        "{}\n  /permissions\n  /permissions allow <command-prefix>\n  /permissions deny <command-prefix>\n  /permissions session <command-prefix>\n  /permissions remove <allow|deny|session> <command-prefix>\n  /permissions reset",
        ts::accent_header("Permissions:")
    );
}

// ---------------------------------------------------------------------------
// Session commands
// ---------------------------------------------------------------------------

pub(super) fn handle_sessions(arg: &str) {
    let sub_parts: Vec<&str> = arg.splitn(2, ' ').collect();
    let sub_cmd = sub_parts[0];
    let sub_arg = sub_parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match sub_cmd {
        "" | "list" => match crate::runtime::session_control::list_managed_sessions() {
            Ok(list) if !list.is_empty() => {
                eprintln!("{}", ts::accent_header("Managed Sessions:"));
                if let Ok(dir) = crate::runtime::session_control::managed_session_dir() {
                    eprintln!("  {}", dir.display().to_string().dimmed());
                }
                for summary in &list {
                    eprintln!(
                        "  {}  {}  {} msgs  {}",
                        summary.session_id.bold(),
                        summary
                            .updated_at
                            .format("%Y-%m-%d %H:%M")
                            .to_string()
                            .dimmed(),
                        summary.message_count,
                        summary.path.display()
                    );
                }
            }
            Ok(_) => output::print_info("No managed sessions found."),
            Err(e) => output::print_error(&format!("Failed to list sessions: {:#}", e)),
        },
        "search" => {
            if sub_arg.is_empty() {
                output::print_warn("Usage: /sessions search <query>");
                return;
            }
            let conn = match sessions::open_db() {
                Ok(c) => c,
                Err(e) => {
                    output::print_error(&format!("Failed to open session store: {:#}", e));
                    return;
                }
            };
            match sessions::search_sessions(&conn, sub_arg) {
                Ok(results) => {
                    eprintln!(
                        "{}",
                        ts::accent_header(format!("Search results for '{}':", sub_arg))
                    );
                    eprintln!(
                        "{}",
                        sanitize_terminal_text(&sessions::format_session_list(&results))
                    );
                }
                Err(e) => output::print_error(&format!("Search failed: {:#}", e)),
            }
        }
        "stats" => {
            let conn = match sessions::open_db() {
                Ok(c) => c,
                Err(e) => {
                    output::print_error(&format!("Failed to open session store: {:#}", e));
                    return;
                }
            };
            match sessions::db_stats(&conn) {
                Ok(stats) => {
                    eprintln!("{}", ts::accent_header("Managed Session Stats:"));
                    eprintln!("  Sessions:   {}", stats.session_count);
                    eprintln!("  Messages:   {}", stats.message_count);
                    eprintln!("  Tool calls: {}", stats.tool_call_count);
                    eprintln!("  Tokens:     {}", stats.total_tokens);
                }
                Err(e) => output::print_error(&format!("Failed to get stats: {:#}", e)),
            }
        }
        other => {
            output::print_warn(&format!(
                "Unknown sessions subcommand: '{}'. Try /sessions, /sessions search <query>, or /sessions stats",
                other
            ));
        }
    }
}

pub fn handle_rename(arg: &str) {
    let parts: Vec<&str> = arg.splitn(2, ' ').collect();
    if parts.len() < 2 || parts[0].is_empty() || parts[1].trim().is_empty() {
        output::print_warn("Usage: /rename <id> <new title>");
        return;
    }
    let session_id = parts[0];
    let new_title = parts[1].trim();

    let conn = match sessions::open_db() {
        Ok(c) => c,
        Err(e) => {
            output::print_error(&format!("Failed to open session store: {:#}", e));
            return;
        }
    };

    match sessions::rename_session(&conn, session_id, new_title) {
        Ok(()) => {
            output::print_info(&format!(
                "Renamed session {} to '{}'",
                session_id, new_title
            ));
        }
        Err(e) => {
            output::print_error(&format!("Failed to rename: {:#}", e));
        }
    }
}

pub(super) fn handle_migrate() {
    let conv_dir = match crate::config::CliConfig::config_dir() {
        Ok(d) => d.join("conversations"),
        Err(e) => {
            output::print_error(&format!("Failed to locate config dir: {:#}", e));
            return;
        }
    };

    let conn = match sessions::open_db() {
        Ok(c) => c,
        Err(e) => {
            output::print_error(&format!("Failed to open session store: {:#}", e));
            return;
        }
    };

    match sessions::migrate_json_conversations(&conn, &conv_dir) {
        Ok(0) => output::print_info("No new conversations to migrate."),
        Ok(n) => output::print_info(&format!(
            "Migrated {} conversation(s) into managed sessions.",
            n
        )),
        Err(e) => output::print_error(&format!("Migration failed: {:#}", e)),
    }
}

// ---------------------------------------------------------------------------
// Context / checkpoint commands
// ---------------------------------------------------------------------------

pub async fn handle_compact(arg: &str, session: &mut AgentSession, config: &CliConfig) {
    let before = agiworkforce_agent_core::context::context_budget(
        &session.messages,
        crate::model_catalog::context_window(&session.model),
        config.default.max_tokens as usize,
        session.context_usage_anchor,
    );
    let before_tokens = before.used_tokens;

    if before_tokens < 1000 {
        output::print_info("Context is small — nothing to compact.");
        return;
    }

    let focus = if arg.is_empty() { None } else { Some(arg) };
    let result = session.compact_now(config, focus).await;
    output::print_info(&format!(
        "Compacted: ~{} -> ~{} tokens ({}% of limit){}",
        before_tokens,
        result.after.used_tokens,
        (result.after.used_fraction * 100.0) as u32,
        if focus.is_some() {
            format!(" [focus: {}]", arg)
        } else {
            String::new()
        }
    ));
}

pub fn handle_rewind(arg: &str, session: &mut AgentSession) {
    let count = if arg.is_empty() {
        1usize
    } else {
        arg.parse::<usize>().unwrap_or(1)
    };

    let mut rewound = 0;
    for _ in 0..count {
        if session.restore_checkpoint() {
            rewound += 1;
        } else {
            break;
        }
    }

    if rewound == 0 {
        output::print_warn("No checkpoints available to rewind to.");
    } else {
        output::print_info(&format!(
            "Rewound {} checkpoint{}. {} remaining. ({} messages in context)",
            rewound,
            if rewound == 1 { "" } else { "s" },
            session.checkpoint_count(),
            session.messages.len()
        ));
    }
}

pub fn handle_branch(arg: &str, session: &mut AgentSession) {
    // Branching writes a second session file to disk; refuse rather than fork
    // around the privacy opt-out.
    if !session.session_persistence_enabled() {
        output::print_error(
            "Cannot branch — this run was started with --no-session-persistence, so no session file exists to fork. Restart without that flag to branch.",
        );
        return;
    }

    if !session
        .messages
        .iter()
        .any(|message| message.role != "system")
    {
        output::print_warn("Nothing to branch — no messages yet.");
        return;
    }

    let branch_name = if arg.is_empty() {
        format!("branch-{}", chrono::Utc::now().format("%H%M%S"))
    } else {
        arg.to_string()
    };

    if session.managed_session_id().is_none() {
        if let Err(error) = session.enable_managed_session() {
            output::print_error(&format!(
                "Failed to initialize a managed session before branching: {error:#}"
            ));
            return;
        }
    }

    let Some(session_id) = session.managed_session_id().map(str::to_string) else {
        output::print_error("Managed session is unavailable for branching.");
        return;
    };

    if let Err(error) = session.persist_managed_session() {
        output::print_error(&format!(
            "Failed to persist current session before fork: {error:#}"
        ));
        return;
    }

    match crate::runtime::session_control::fork_managed_session(&session_id) {
        Ok(forked_session) => {
            if let Ok(conn) = sessions::open_db() {
                let _ = sessions::rename_session(
                    &conn,
                    &forked_session.summary.session_id,
                    &branch_name,
                );
            }
            output::print_info(&format!(
                "Branched conversation '{}' as managed session {}. Resume with: agiworkforce --session {}",
                branch_name, forked_session.summary.session_id, forked_session.summary.session_id
            ));
        }
        Err(error) => {
            output::print_error(&format!("Failed to fork managed session: {error:#}"));
        }
    }
}

pub(super) fn handle_diff() {
    match std::process::Command::new("git")
        .args(["diff", "--stat"])
        .output()
    {
        Ok(stat_output) => {
            let stat = String::from_utf8_lossy(&stat_output.stdout);
            if stat.trim().is_empty() {
                output::print_info("No uncommitted changes.");
                return;
            }
            eprintln!("{}", ts::accent_header("Git diff summary:"));
            eprintln!("{}", sanitize_terminal_text(&stat));

            match std::process::Command::new("git").args(["diff"]).output() {
                Ok(diff_output) => {
                    let diff = String::from_utf8_lossy(&diff_output.stdout);
                    let lines: Vec<&str> = diff.lines().collect();
                    let max_lines = 100;
                    for line in lines.iter().take(max_lines) {
                        if line.starts_with('+') && !line.starts_with("+++") {
                            eprintln!("{}", ts::addition(*line));
                        } else if line.starts_with('-') && !line.starts_with("---") {
                            eprintln!("{}", ts::deletion(*line));
                        } else if line.starts_with("@@") {
                            eprintln!("{}", ts::accent(*line));
                        } else {
                            eprintln!("{}", sanitize_terminal_text(line));
                        }
                    }
                    if lines.len() > max_lines {
                        eprintln!(
                            "{}",
                            format!("... ({} more lines)", lines.len() - max_lines).dimmed()
                        );
                    }
                }
                Err(e) => output::print_error(&format!("Failed to run git diff: {}", e)),
            }
        }
        Err(_) => {
            output::print_warn("git not found or not in a git repository.");
        }
    }
}

// ---------------------------------------------------------------------------
// MCP management
// ---------------------------------------------------------------------------

/// Handle `/mcp <subcommand>` mutations over the writable global MCP registry
/// (`~/.agiworkforce/mcp.json`). Bare `/mcp` stays on the live-status renderer;
/// this covers add/remove/enable/disable/list plus restart (reconnect the live
/// session manager) and reconfigure (replace an existing entry).
pub(super) async fn handle_mcp(arg: &str, session: &mut AgentSession) {
    use crate::mcp::registry::McpRegistry;

    let tokens: Vec<&str> = arg.split_whitespace().collect();
    let sub = tokens.first().copied().unwrap_or("list");
    let rest = &tokens[1..];

    match sub {
        "list" | "ls" => {
            let reg = match McpRegistry::load() {
                Ok(reg) => reg,
                Err(e) => {
                    output::print_error(&format!("Failed to load MCP registry: {e:#}"));
                    return;
                }
            };
            let rows = reg.list();
            if rows.is_empty() {
                output::print_info(
                    "No servers in the MCP registry. Add one with `/mcp add <name> <url>`.",
                );
                return;
            }
            eprintln!("{}", ts::accent_header("Registered MCP servers:"));
            for row in rows {
                let state = if row.enabled { "enabled" } else { "disabled" };
                eprintln!(
                    "  {:<24} [{}] {:<6} {}",
                    sanitize_terminal_text(&row.name),
                    state,
                    sanitize_terminal_text(&row.kind),
                    sanitize_terminal_text(&row.target)
                );
            }
        }
        "add" => {
            let (name, entry) = match crate::mcp::registry::parse_add_spec(rest) {
                Ok(parsed) => parsed,
                Err(e) => {
                    output::print_warn(&format!("{e:#}"));
                    return;
                }
            };
            mutate_registry(
                |reg| reg.add(&name, entry.clone(), false),
                &format!("Added MCP server '{name}'. Run `/mcp restart` to connect it."),
            );
        }
        "reconfigure" | "edit" => {
            let (name, entry) = match crate::mcp::registry::parse_add_spec(rest) {
                Ok(parsed) => parsed,
                Err(e) => {
                    output::print_warn(&format!("{e:#}"));
                    return;
                }
            };
            mutate_registry(
                |reg| reg.add(&name, entry.clone(), true),
                &format!("Reconfigured MCP server '{name}'. Run `/mcp restart` to apply."),
            );
        }
        "remove" | "rm" | "delete" => {
            let Some(name) = rest.first().copied() else {
                output::print_warn("Usage: /mcp remove <name>");
                return;
            };
            let name = name.to_string();
            mutate_registry_bool(
                move |reg| reg.remove(&name),
                &format!("Removed MCP server '{}'.", rest[0]),
                &format!("No MCP server named '{}' in the registry.", rest[0]),
            );
        }
        "enable" => {
            let Some(name) = rest.first().copied() else {
                output::print_warn("Usage: /mcp enable <name>");
                return;
            };
            let name = name.to_string();
            mutate_registry(
                move |reg| reg.enable(&name).map(|_| ()),
                &format!(
                    "Enabled MCP server '{}'. Run `/mcp restart` to connect it.",
                    rest[0]
                ),
            );
        }
        "disable" => {
            let Some(name) = rest.first().copied() else {
                output::print_warn("Usage: /mcp disable <name>");
                return;
            };
            let name = name.to_string();
            mutate_registry(
                move |reg| reg.disable(&name).map(|_| ()),
                &format!(
                    "Disabled MCP server '{}'. Run `/mcp restart` to disconnect it.",
                    rest[0]
                ),
            );
        }
        "restart" | "reload" => {
            output::print_info("Reloading MCP servers and reconnecting...");
            match crate::attach_mcp_manager_for_session(
                session,
                &crate::mcp::McpConfigLoadOptions::default(),
                true,
                true,
            )
            .await
            {
                Ok(()) => {
                    let count = session.mcp_info().map(|t| t.len()).unwrap_or(0);
                    output::print_info(&format!("MCP reconnected: {count} tool(s) available."));
                }
                Err(e) => output::print_error(&format!("MCP restart failed: {e:#}")),
            }
        }
        other => {
            output::print_warn(&format!(
                "Unknown /mcp subcommand '{other}'. Use: list | add <name> <url> | \
                 remove <name> | enable <name> | disable <name> | reconfigure <name> <spec> | restart"
            ));
        }
    }
}

fn mutate_registry<F>(op: F, success: &str)
where
    F: FnOnce(&mut crate::mcp::registry::McpRegistry) -> anyhow::Result<()>,
{
    let mut reg = match crate::mcp::registry::McpRegistry::load() {
        Ok(reg) => reg,
        Err(e) => {
            output::print_error(&format!("Failed to load MCP registry: {e:#}"));
            return;
        }
    };
    if let Err(e) = op(&mut reg) {
        output::print_warn(&format!("{e:#}"));
        return;
    }
    match reg.save() {
        Ok(()) => output::print_info(success),
        Err(e) => output::print_error(&format!("Failed to save MCP registry: {e:#}")),
    }
}

fn mutate_registry_bool<F>(op: F, success: &str, missing: &str)
where
    F: FnOnce(&mut crate::mcp::registry::McpRegistry) -> bool,
{
    let mut reg = match crate::mcp::registry::McpRegistry::load() {
        Ok(reg) => reg,
        Err(e) => {
            output::print_error(&format!("Failed to load MCP registry: {e:#}"));
            return;
        }
    };
    if !op(&mut reg) {
        output::print_warn(missing);
        return;
    }
    match reg.save() {
        Ok(()) => output::print_info(success),
        Err(e) => output::print_error(&format!("Failed to save MCP registry: {e:#}")),
    }
}

// ---------------------------------------------------------------------------
// Raw output alias
// ---------------------------------------------------------------------------

/// `/raw` — render the most recent assistant response through the same
/// raw-output path as the headless `--raw` / `--output-format json` modes.
/// `/raw` prints the response verbatim (no markdown); `/raw json` prints the
/// canonical one-shot JSON result object built by `oneshot_result_json_value`.
pub(super) fn render_raw_last_response(session: &AgentSession, arg: &str) -> String {
    let Some(last) = session
        .messages
        .iter()
        .rev()
        .find(|message| message.role == "assistant")
    else {
        return "No assistant response yet to render.".to_string();
    };
    let response = last.text_content();

    if arg.trim().eq_ignore_ascii_case("json") {
        let cost = crate::output::format_accumulated_cost(
            session.total_input_tokens,
            session.total_output_tokens,
            session.cost_ledger.total_usd,
        );
        let value = crate::oneshot_result_json_value(
            &session.model,
            &response,
            session.total_input_tokens,
            session.total_output_tokens,
            false,
            &cost,
            0,
            false,
        );
        serde_json::to_string_pretty(&value)
            .unwrap_or_else(|e| format!("Failed to render JSON: {e}"))
    } else {
        // Raw text: no markdown formatting and no cost footer, but terminal
        // escapes are still stripped — this prints the assistant message
        // straight to the terminal, so an OSC 52 the model relayed from an
        // untrusted page would otherwise reach the clipboard one keystroke
        // after the rendered transcript safely dropped it.
        sanitize_terminal_text(&response).into_owned()
    }
}

// ---------------------------------------------------------------------------
// Worktree commands
// ---------------------------------------------------------------------------

/// Render the interactive `/worktree` command over the git-worktree helpers in
/// `platform::runtime::worktree`. Read/list is always safe; create and remove
/// shell out to `git worktree`. Returns the rendered output so it is testable
/// without a terminal.
pub(super) async fn handle_worktree(arg: &str) -> String {
    let repo = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    handle_worktree_in(&repo, arg).await
}

pub(super) async fn handle_worktree_in(repo: &std::path::Path, arg: &str) -> String {
    let parts: Vec<&str> = arg.split_whitespace().collect();
    let sub = parts.first().copied().unwrap_or("list");

    match sub {
        "" | "list" | "ls" => match crate::runtime::worktree::list_worktrees(repo).await {
            Ok(worktrees) if worktrees.is_empty() => "No git worktrees found.".to_string(),
            Ok(worktrees) => {
                let mut lines = vec![format!("Git worktrees ({})", worktrees.len())];
                for wt in worktrees {
                    lines.push(format!("  {:<24} {}", wt.branch, wt.path.display()));
                }
                lines.join("\n")
            }
            Err(e) => format!("Failed to list worktrees: {e:#}"),
        },
        "create" | "add" | "new" => {
            let branch = parts.get(1).copied().unwrap_or_default();
            if branch.is_empty() {
                return "Usage: /worktree create <branch> [base-ref]".to_string();
            }
            let base = parts.get(2).map(|s| s.to_string());
            let opts = crate::runtime::worktree::WorktreeOptions {
                branch: branch.to_string(),
                base,
                target_dir: None,
            };
            match crate::runtime::worktree::enter_worktree(repo, opts).await {
                Ok(wt) => format!(
                    "Created worktree for branch '{}' at {}",
                    wt.branch,
                    wt.path.display()
                ),
                Err(e) => format!("Failed to create worktree: {e:#}"),
            }
        }
        "remove" | "rm" | "exit" => {
            let path = parts.get(1).copied().unwrap_or_default();
            if path.is_empty() {
                return "Usage: /worktree remove <path>".to_string();
            }
            let target = std::path::PathBuf::from(path);
            match crate::runtime::worktree::exit_worktree(repo, &target).await {
                Ok(()) => format!("Removed worktree at {}", target.display()),
                Err(e) => format!("Failed to remove worktree: {e:#}"),
            }
        }
        other => format!(
            "Unknown /worktree subcommand '{other}'. Use: list | create <branch> [base] | remove <path>"
        ),
    }
}

// ---------------------------------------------------------------------------
// Memory commands
// ---------------------------------------------------------------------------

pub fn handle_memory(arg: &str) {
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mgr = MemoryManager::new(&cwd);

    let sub_parts: Vec<&str> = arg.splitn(2, ' ').collect();
    let sub_cmd = sub_parts[0];
    let sub_arg = sub_parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match sub_cmd {
        "" | "show" => {
            eprintln!("{}", ts::accent_header("Memory Hierarchy:"));
            eprintln!();

            let tiers = mgr.list();
            for (tier, path, exists) in &tiers {
                let status = if *exists {
                    ts::success("found").to_string()
                } else {
                    "not found".dimmed().to_string()
                };
                eprintln!(
                    "  {} {} ({})",
                    format_args!("[{}]", tier).to_string().bold(),
                    path.display(),
                    status
                );

                if *exists {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let preview = memory::content_preview(&content, 5);
                        for line in preview.lines() {
                            eprintln!("    {}", ts::muted(line));
                        }
                        eprintln!();
                    }
                }
            }
        }
        "add" => {
            let (tier, text) = parse_tier_and_text(sub_arg);
            if text.is_empty() {
                output::print_warn("Usage: /memory add [global|project|local] <text>");
                return;
            }

            match mgr.save(&tier, text) {
                Ok(path) => {
                    output::print_info(&format!(
                        "Appended to {} memory ({})",
                        tier,
                        path.display()
                    ));
                }
                Err(e) => output::print_error(&e),
            }
        }
        "edit" => {
            let tier = match sub_arg {
                "global" | "g" => MemoryTier::Global,
                "local" | "l" => MemoryTier::Local,
                _ => MemoryTier::Project,
            };

            let path = match mgr.path_for_tier(&tier) {
                Some(p) => p.to_path_buf(),
                None => {
                    output::print_warn(&format!("No path for {} memory tier.", tier));
                    return;
                }
            };

            if !path.exists() {
                if let Some(parent) = path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                let _ = std::fs::write(&path, format!("# {} Memory\n", tier));
            }

            let editor = std::env::var("EDITOR").unwrap_or_else(|_| "vi".to_string());
            match std::process::Command::new(&editor).arg(&path).status() {
                Ok(status) => {
                    if status.success() {
                        output::print_info(&format!("Saved {} memory.", tier));
                    } else {
                        output::print_warn("Editor exited with non-zero status.");
                    }
                }
                Err(e) => {
                    output::print_error(&format!("Failed to open editor '{}': {}", editor, e))
                }
            }
        }
        "global" | "project" | "local" => {
            let tier = match sub_cmd {
                "global" => MemoryTier::Global,
                "local" => MemoryTier::Local,
                _ => MemoryTier::Project,
            };

            let entries = mgr.load_all();
            let matching: Vec<&memory::MemoryEntry> =
                entries.iter().filter(|e| e.source == tier).collect();

            if matching.is_empty() {
                output::print_info(&format!("No {} memory found.", tier));
            } else {
                for entry in matching {
                    eprintln!(
                        "{}",
                        ts::accent_header(format!(
                            "{} Memory ({}):",
                            entry.source,
                            entry.file_path.display()
                        ))
                    );
                    eprintln!("{}", sanitize_terminal_text(&entry.content));
                }
            }
        }
        _ => {
            output::print_warn(
                "Usage: /memory [show|add [global|project|local] <text>|edit [global|project|local]|global|project|local]",
            );
        }
    }
}

pub(super) fn parse_tier_and_text(input: &str) -> (MemoryTier, &str) {
    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    if parts.len() < 2 {
        match parts[0] {
            "global" | "g" => return (MemoryTier::Global, ""),
            "project" | "p" => return (MemoryTier::Project, ""),
            "local" | "l" => return (MemoryTier::Local, ""),
            _ => return (MemoryTier::Project, input),
        }
    }

    match parts[0] {
        "global" | "g" => (MemoryTier::Global, parts[1]),
        "project" | "p" => (MemoryTier::Project, parts[1]),
        "local" | "l" => (MemoryTier::Local, parts[1]),
        _ => (MemoryTier::Project, input),
    }
}

// ---------------------------------------------------------------------------
// Project init command
// ---------------------------------------------------------------------------

pub fn handle_init_project() {
    let agents_md = std::path::Path::new("AGENTS.md");
    if agents_md.exists() {
        output::print_info("AGENTS.md already exists in current directory.");
        return;
    }

    let template = "# Project Instructions\n\n\
                    ## Overview\n\n\
                    Describe your project here.\n\n\
                    ## Build Commands\n\n\
                    ```bash\n\
                    # Add your build commands here\n\
                    ```\n\n\
                    ## Architecture\n\n\
                    Describe your project structure.\n\n\
                    ## Development Rules\n\n\
                    - Add your coding conventions here\n";

    match std::fs::write(agents_md, template) {
        Ok(()) => output::print_info("Created AGENTS.md in current directory."),
        Err(e) => output::print_error(&format!("Failed to create AGENTS.md: {}", e)),
    }
}

// ---------------------------------------------------------------------------
// Config command
// ---------------------------------------------------------------------------

pub(super) fn handle_config(arg: &str, config: &mut CliConfig) {
    let sub_parts: Vec<&str> = arg.splitn(3, ' ').collect();
    let sub_cmd = sub_parts[0];

    match sub_cmd {
        "" | "show" => {
            eprintln!("{}", sanitize_terminal_text(&config.display()));
        }
        "get" => {
            let key = sub_parts.get(1).map(|s| s.trim()).unwrap_or_default();
            if key.is_empty() {
                output::print_warn("Usage: /config get <key>");
                return;
            }
            match config.get_value(key) {
                Some(value) => output::print_info(&format!("{} = {}", key, value)),
                None => output::print_warn(&format!("Unknown or unset key: '{}'", key)),
            }
        }
        "set" => {
            if sub_parts.len() < 3 {
                output::print_warn("Usage: /config set <key> <value>");
                return;
            }
            let key = sub_parts[1].trim();
            let value = sub_parts[2].trim();
            match config.set_value(key, value) {
                Ok(()) => {
                    if let Err(e) = config.save() {
                        output::print_warn(&format!("Set in memory but failed to save: {:#}", e));
                    } else {
                        output::print_info(&format!("{} = {} (saved)", key, value));
                    }
                }
                Err(e) => output::print_error(&format!("{:#}", e)),
            }
        }
        _ => {
            output::print_warn("Usage: /config [show|get <key>|set <key> <value>]");
        }
    }
}

// ---------------------------------------------------------------------------
// Batch command
// ---------------------------------------------------------------------------

pub(super) async fn handle_batch_command(
    glob_pattern: &str,
    prompt: &str,
    session: &mut AgentSession,
    config: &CliConfig,
) {
    let entries: Vec<String> = match glob::glob(glob_pattern) {
        Ok(paths) => paths
            .filter_map(|e| e.ok())
            .filter(|p| p.is_file())
            .map(|p| p.display().to_string())
            .collect(),
        Err(e) => {
            output::print_error(&format!("Invalid glob pattern: {}", e));
            return;
        }
    };

    if entries.is_empty() {
        output::print_warn(&format!("No files matched: {}", glob_pattern));
        return;
    }

    const MAX_BATCH_FILES: usize = 25;
    if entries.len() > MAX_BATCH_FILES {
        output::print_error(&format!(
            "Too many files ({}). Batch limited to {} files. Use a narrower glob.",
            entries.len(),
            MAX_BATCH_FILES,
        ));
        return;
    }

    eprintln!(
        "{}",
        ts::accent_header(format!(
            "Batch: {} files matched, processing...",
            entries.len()
        ))
    );
    for f in &entries {
        eprintln!("  {}", sanitize_terminal_text(f));
    }

    let mut file_list = String::new();
    for f in &entries {
        file_list.push_str(&format!("- {}\n", f));
    }

    let batch_prompt = format!(
        "Apply the following instruction to EACH of these files (process them all):\n\n\
         Instruction: {}\n\n\
         Files:\n{}",
        prompt, file_list,
    );

    let spinner = output::create_spinner("Batch processing...");
    let md = std::sync::Arc::new(std::sync::Mutex::new(MarkdownRenderer::new()));
    let md_cb = std::sync::Arc::clone(&md);

    let result = session
        .send(
            config,
            &batch_prompt,
            Box::new(move |chunk| {
                if let Ok(mut renderer) = md_cb.lock() {
                    output::print_assistant_chunk_formatted(&mut renderer, chunk);
                }
            }),
        )
        .await;

    spinner.finish_and_clear();

    if let Ok(mut renderer) = md.lock() {
        output::flush_markdown(&mut renderer);
    }

    match result {
        Ok(_) => {
            output::print_assistant_end();
        }
        Err(e) => {
            output::print_error(&format!("Batch failed: {:#}", e));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::SystemContext;

    fn empty_context() -> SystemContext {
        let mut ctx = crate::context::gather_system_context();
        ctx.git_status_summary = None;
        ctx
    }

    /// `/save` and `/branch` must refuse under `--no-session-persistence`
    /// instead of quietly doing nothing: the write gate lower down would have
    /// made both commands read as dead controls.
    #[test]
    fn save_and_branch_refuse_when_session_persistence_is_disabled() {
        let ctx = empty_context();
        let mut session = AgentSession::new(crate::model_catalog::default_model(), &ctx, None);
        session.set_session_persistence(false);
        session
            .messages
            .push(crate::models::Message::text("user", "a real turn"));

        handle_save(&mut session);
        assert!(
            session.managed_session_id().is_none(),
            "/save must not create a managed session under --no-session-persistence"
        );

        handle_branch("branch-name", &mut session);
        assert!(
            session.managed_session_id().is_none(),
            "/branch must not create a managed session under --no-session-persistence"
        );
    }

    fn init_git_repo(dir: &std::path::Path) {
        for args in [
            vec!["init", "-q", "-b", "main"],
            vec!["config", "user.email", "test@example.invalid"],
            vec!["config", "user.name", "Test"],
        ] {
            std::process::Command::new("git")
                .current_dir(dir)
                .args(&args)
                .status()
                .expect("git setup");
        }
        std::fs::write(dir.join("README.md"), "hi").unwrap();
        std::process::Command::new("git")
            .current_dir(dir)
            .args(["add", "."])
            .status()
            .unwrap();
        std::process::Command::new("git")
            .current_dir(dir)
            .args(["commit", "-q", "-m", "init"])
            .status()
            .unwrap();
    }

    /// `/raw` must render the last assistant response verbatim, and `/raw json`
    /// must go through the shared one-shot JSON result shape.
    #[test]
    fn raw_alias_renders_last_response_verbatim_and_as_json() {
        let ctx = empty_context();
        let mut session = AgentSession::new(crate::model_catalog::default_model(), &ctx, None);

        // No assistant turn yet → explicit message, not a blank line.
        assert!(render_raw_last_response(&session, "").contains("No assistant response yet"));

        session
            .messages
            .push(crate::models::Message::text("user", "hi"));
        session.messages.push(crate::models::Message::text(
            "assistant",
            "**bold** raw payload",
        ));

        // Raw text is verbatim — markdown is NOT rendered.
        let raw = render_raw_last_response(&session, "");
        assert_eq!(raw, "**bold** raw payload");

        // JSON mode uses the canonical one-shot result shape.
        let json = render_raw_last_response(&session, "json");
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
        assert_eq!(parsed["type"], "result");
        assert_eq!(parsed["response"], "**bold** raw payload");
        assert_eq!(parsed["is_error"], false);
        assert_eq!(parsed["model"], session.model);
    }

    /// `/raw` prints the assistant message straight to the terminal, so the
    /// escape stripping the rendered transcript applies must hold here too —
    /// otherwise one keystroke after a safely rendered turn replays an OSC 52
    /// clipboard write the model relayed from an untrusted page.
    #[test]
    fn raw_alias_strips_terminal_escapes_from_the_assistant_message() {
        let ctx = empty_context();
        let mut session = AgentSession::new(crate::model_catalog::default_model(), &ctx, None);
        session
            .messages
            .push(crate::models::Message::text("user", "summarize that page"));
        session.messages.push(crate::models::Message::text(
            "assistant",
            "here it is: \u{1b}]52;c;cm0gLXJmIC8=\u{7}\u{1b}[2Jdone",
        ));

        let raw = render_raw_last_response(&session, "");
        assert!(!raw.contains('\u{1b}'), "escape survived /raw: {raw:?}");
        assert!(!raw.contains("52;c"), "clipboard payload survived: {raw:?}");
        assert_eq!(raw, "here it is: done");

        // JSON mode must keep the bytes recoverable for machine consumers —
        // serde encodes them as \u001b rather than emitting a live escape.
        let json = render_raw_last_response(&session, "json");
        assert!(
            !json.contains('\u{1b}'),
            "escape survived /raw json: {json:?}"
        );
    }

    /// `/worktree` dispatch must reach the real git-worktree helpers: list a
    /// fresh repo, create a branch worktree, and see it appear.
    #[tokio::test]
    async fn worktree_command_lists_and_creates() {
        if std::process::Command::new("git")
            .arg("--version")
            .status()
            .map(|s| !s.success())
            .unwrap_or(true)
        {
            return; // git unavailable — skip rather than fail the suite.
        }
        let tmp = tempfile::tempdir().unwrap();
        init_git_repo(tmp.path());

        // Bare list renders the main worktree.
        let listed = handle_worktree_in(tmp.path(), "list").await;
        assert!(listed.contains("Git worktrees"), "{listed}");
        assert!(listed.contains("main"), "{listed}");

        // Create a new worktree and confirm the branch shows up.
        let created = handle_worktree_in(tmp.path(), "create wt-feature").await;
        assert!(created.contains("wt-feature"), "{created}");
        let after = handle_worktree_in(tmp.path(), "list").await;
        assert!(after.contains("wt-feature"), "{after}");

        // Unknown subcommand is reported, not silently ignored.
        let unknown = handle_worktree_in(tmp.path(), "bogus").await;
        assert!(
            unknown.contains("Unknown /worktree subcommand"),
            "{unknown}"
        );
    }
}

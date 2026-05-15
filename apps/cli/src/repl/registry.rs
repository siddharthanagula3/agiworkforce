use colored::Colorize;

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::conversations;
use crate::markdown::MarkdownRenderer;
use crate::memory::{self, MemoryManager, MemoryTier};
use crate::output;
use crate::sessions;

// ---------------------------------------------------------------------------
// Conversation commands
// ---------------------------------------------------------------------------

pub fn handle_save(session: &mut AgentSession) {
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
                super::load_messages_into_session(session, managed_session.messages.clone());
                session.adopt_managed_session(managed_session, resolved.path);
                output::print_info(&format!(
                    "Loaded managed session {} ({} messages)",
                    session_id, message_count
                ));
            }
            Err(error) => {
                output::print_error(&format!("Failed to load managed session: {error:#}"));
            }
        },
        Err(_) => match conversations::load_conversation(arg) {
            Ok(conv) => {
                let msg_count = conv.messages.len();
                let model = conv.model.clone();
                conversations::restore_into_session(session, &conv);
                if let Err(error) = session.enable_managed_session() {
                    output::print_warn(&format!(
                        "Loaded legacy conversation, but managed session setup failed: {error:#}"
                    ));
                }
                output::print_info(&format!(
                    "Loaded conversation {} ({} messages, model: {})",
                    arg, msg_count, model
                ));
            }
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
            eprintln!("{}", "Managed Sessions:".cyan().bold());
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
            eprintln!("{}", "Legacy (JSON):".cyan().bold());
            for (i, s) in summaries.iter().take(20).enumerate() {
                eprintln!(
                    "  {}. {} {} {} ({})",
                    format!("{:>2}", i + 1).dimmed(),
                    s.id.bold(),
                    s.title.dimmed(),
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
    if arg.is_empty() {
        output::print_warn("Usage: /delete <id>  (use /history to see IDs)");
        return;
    }

    if crate::runtime::session_control::delete_managed_session(arg).is_ok() {
        output::print_info(&format!("Deleted managed session: {}", arg));
        return;
    }

    match conversations::delete_conversation(arg) {
        Ok(()) => {
            output::print_info(&format!("Deleted conversation: {}", arg));
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
        println!("{}", md);
    }
}

// ---------------------------------------------------------------------------
// Provider commands
// ---------------------------------------------------------------------------

pub(super) fn handle_providers(config: &CliConfig) {
    eprintln!("{}", "Providers:".cyan().bold());

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
    match arg {
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
        tab if matches!(
            tab,
            "allow" | "deny" | "session" | "workspace" | "recently-denied" | "recent"
        ) =>
        {
            match crate::permissions::PermissionStore::load() {
                Ok(store) => eprintln!("{}", store.display_tab(tab)),
                Err(e) => output::print_error(&format!("Failed to load permissions: {:#}", e)),
            }
        }
        _ => match crate::permissions::PermissionStore::load() {
            Ok(store) => eprintln!("{}", store.display_tab("allow")),
            Err(e) => output::print_error(&format!("Failed to load permissions: {:#}", e)),
        },
    }
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
                eprintln!("{}", "Managed Sessions:".cyan().bold());
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
                        format!("Search results for '{}':", sub_arg).cyan().bold()
                    );
                    eprintln!("{}", sessions::format_session_list(&results));
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
                    eprintln!("{}", "Managed Session Stats:".cyan().bold());
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

pub fn handle_compact(arg: &str, session: &mut AgentSession) {
    let usage = crate::compaction::context_usage(&session.messages, &session.model);
    let before_tokens = usage.used_tokens;

    if before_tokens < 1000 {
        output::print_info("Context is small — nothing to compact.");
        return;
    }

    let target = usage.limit_tokens * 50 / 100;
    let focus = if arg.is_empty() { None } else { Some(arg) };

    session.messages = crate::compaction::compact_with_focus(&session.messages, target, focus);

    let after = crate::compaction::context_usage(&session.messages, &session.model);
    output::print_info(&format!(
        "Compacted: ~{} -> ~{} tokens ({}% of limit){}",
        before_tokens,
        after.used_tokens,
        (after.fraction * 100.0) as u32,
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
            eprintln!("{}", "Git diff summary:".cyan().bold());
            eprintln!("{}", stat);

            match std::process::Command::new("git").args(["diff"]).output() {
                Ok(diff_output) => {
                    let diff = String::from_utf8_lossy(&diff_output.stdout);
                    let lines: Vec<&str> = diff.lines().collect();
                    let max_lines = 100;
                    for line in lines.iter().take(max_lines) {
                        if line.starts_with('+') && !line.starts_with("+++") {
                            eprintln!("{}", line.green());
                        } else if line.starts_with('-') && !line.starts_with("---") {
                            eprintln!("{}", line.red());
                        } else if line.starts_with("@@") {
                            eprintln!("{}", line.cyan());
                        } else {
                            eprintln!("{}", line);
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
            eprintln!("{}", "Memory Hierarchy:".cyan().bold());
            eprintln!();

            let tiers = mgr.list();
            for (tier, path, exists) in &tiers {
                let status = if *exists {
                    "found".green().to_string()
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
                            eprintln!("    {}", line.dimmed());
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
                        format!("{} Memory ({}):", entry.source, entry.file_path.display())
                            .cyan()
                            .bold()
                    );
                    eprintln!("{}", entry.content);
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
    let claude_md = std::path::Path::new("CLAUDE.md");
    if claude_md.exists() {
        output::print_info("CLAUDE.md already exists in current directory.");
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

    match std::fs::write(claude_md, template) {
        Ok(()) => output::print_info("Created CLAUDE.md in current directory."),
        Err(e) => output::print_error(&format!("Failed to create CLAUDE.md: {}", e)),
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
            eprintln!("{}", config.display());
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
        format!("Batch: {} files matched, processing...", entries.len())
            .cyan()
            .bold()
    );
    for f in &entries {
        eprintln!("  {}", f);
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

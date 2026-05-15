use crate::compaction;
use crate::context::SystemContext;
use crate::memory::{self, MemoryManager};
use crate::skills;

/// Assemble the full system prompt without instantiating a session.
/// Used by `--dump-system-prompt` and tooling that inspects the model's view.
pub fn assemble_system_prompt(
    sys_context: &SystemContext,
    custom_system_prompt: Option<&str>,
) -> String {
    let instructions = std::env::current_dir()
        .ok()
        .and_then(|cwd| compaction::load_instructions(&cwd));

    let memory_context = std::env::current_dir()
        .ok()
        .map(|cwd| {
            let mgr = MemoryManager::new(&cwd);
            mgr.get_context_prompt()
        })
        .unwrap_or_default();

    let persistent_memory = crate::config::CliConfig::config_dir()
        .ok()
        .map(|home| crate::memory_pipeline::MemoryPipeline::load_persistent_memory(&home))
        .unwrap_or_default();

    let discovered = skills::discover_skills();
    let skill_refs: Vec<&skills::Skill> = discovered.iter().collect();
    let skills_content = skills::format_skills_for_prompt(&skill_refs);

    let rules = std::env::current_dir()
        .ok()
        .map(|cwd| memory::load_rules(&cwd))
        .unwrap_or_default();
    let rules_context = if rules.is_empty() {
        String::new()
    } else {
        memory::rules_context_prompt(&rules, &[])
    };

    let combined_memory = if persistent_memory.is_empty() {
        memory_context
    } else {
        format!("{}\n{}", memory_context, persistent_memory)
    };

    build_system_prompt(
        sys_context,
        custom_system_prompt,
        instructions.as_deref(),
        &skills_content,
        &combined_memory,
        &rules_context,
    )
}

pub(super) fn build_system_prompt(
    sys_context: &SystemContext,
    custom_system_prompt: Option<&str>,
    instructions: Option<&str>,
    skills_content: &str,
    memory_context: &str,
    rules_context: &str,
) -> String {
    let base = custom_system_prompt.unwrap_or(
        "You are AGI Workforce CLI, a powerful AI assistant running in the user's terminal.\n\
         You help users with coding, system administration, writing, analysis, and general tasks.\n\
         \n\
         You are direct, concise, and precise. When showing code, use fenced code blocks with the language specified.",
    );

    let deferred_names: Vec<String> = crate::runtime::tool_catalog::all_builtin_tool_definitions()
        .into_iter()
        .filter(|t| t.should_defer)
        .map(|t| t.name)
        .collect();

    let mut prompt = String::with_capacity(2048);
    prompt.push_str(base);
    prompt.push_str(
        "\n\nImportant guidelines:\n\
         - Be concise. Terminal users prefer short, actionable answers.\n\
         - When asked to modify files or run commands, explain briefly what you'll do first.\n\
         - If a task is ambiguous, ask a clarifying question.\n\
         - Format output for terminal readability (not web).\n\
         - You have access to tools for reading/writing files, running commands, and searching. Use them when needed.\n",
    );

    if !deferred_names.is_empty() {
        prompt.push_str(&format!(
            "- Additional tools available on demand (call `tool_search` to load their schemas): {}.\n",
            deferred_names.join(", ")
        ));
    }

    if !memory_context.is_empty() {
        prompt.push('\n');
        prompt.push_str(memory_context);
        prompt.push('\n');
    }

    if let Some(instr) = instructions {
        prompt.push_str("\n<project-instructions>\n");
        prompt.push_str(instr);
        prompt.push_str("\n</project-instructions>\n");
    }

    if !rules_context.is_empty() {
        prompt.push('\n');
        prompt.push_str(rules_context);
        prompt.push('\n');
    }

    if !skills_content.is_empty() {
        prompt.push('\n');
        prompt.push_str(skills_content);
        prompt.push('\n');
    }

    prompt.push('\n');
    prompt.push_str(&sys_context.to_string());
    prompt.push('\n');

    prompt
}

//! Skills system — contextual prompt injection from SKILL.md files.
//!
//! Skills are markdown files with YAML frontmatter containing name and description.
//! They are discovered from:
//! 1. .agiworkforce/skills/ in the current project
//! 2. ~/.agiworkforce/skills/ (global skills)
//!
//! Skills whose descriptions match the current context are injected into
//! the system prompt to provide domain-specific knowledge.
//!
//! Skill mentions: Use `$skill-name` or `@skill-name` in a query to explicitly
//! request a skill by name (scored at 0.9).

// Skills API surface mixes live items (discover_skills, Skill, format_skills_for_prompt
// — used in agent.rs, repl.rs, command_registry.rs, tui_app.rs) with auxiliary
// helpers (match_skills, format_skills_by_category, scoring helpers) reserved for
// future automatic-skill-injection wiring. File-level allow stays until that lands.
#![allow(dead_code)]

use anyhow::{Context, Result};
use regex::Regex;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Minimum relevance score for a skill to be considered a match.
const RELEVANCE_THRESHOLD: f64 = 0.1;

/// A loaded skill.
#[derive(Debug, Clone)]
pub struct Skill {
    /// Skill name from frontmatter.
    pub name: String,
    /// Skill description from frontmatter (used for matching).
    pub description: String,
    /// Full markdown content (including frontmatter).
    pub content: String,
    /// Body content only (without frontmatter).
    pub body: String,
    /// Source file path.
    pub path: PathBuf,
    /// Whether this skill can be auto-matched by implicit keyword overlap.
    /// Parsed from `allow_implicit:` in frontmatter; defaults to `true`.
    pub allow_implicit: bool,
    /// Optional category for grouping in display.
    /// Parsed from `category:` in frontmatter.
    pub category: Option<String>,
    /// Required environment variables (parsed from `env_vars:` in frontmatter).
    /// Skill should only be activated when all listed env vars are set.
    /// Skill is only activated when all listed env vars are set.
    pub required_env_vars: Vec<String>,
}

impl Skill {
    /// Check if all required environment variables are set.
    /// Returns `Ok(())` if satisfied, or `Err` listing the missing vars.
    pub fn check_env_deps(&self) -> std::result::Result<(), Vec<String>> {
        let missing: Vec<String> = self
            .required_env_vars
            .iter()
            .filter(|var| std::env::var(var).is_err())
            .cloned()
            .collect();
        if missing.is_empty() {
            Ok(())
        } else {
            Err(missing)
        }
    }
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/// Discover all available skills from project, global, and plugin sources.
///
/// Sources in load order (later sources can shadow earlier ones if names collide,
/// though we don't dedupe — the matcher prefers higher-scoring entries):
/// 1. Project: `.agiworkforce/skills/`
/// 2. Global: `~/.agiworkforce/skills/`
/// 3. Plugins: every path declared in any installed plugin's manifest under
///    `skills:` (Sprint B6) — both files and dirs are accepted.
pub fn discover_skills() -> Vec<Skill> {
    let mut skills = Vec::new();

    // Project-level skills: .agiworkforce/skills/
    if let Ok(cwd) = std::env::current_dir() {
        let project_dir = cwd.join(".agiworkforce").join("skills");
        if project_dir.exists() {
            load_skills_from_dir(&project_dir, &mut skills);
        }
    }

    // Global skills: ~/.agiworkforce/skills/
    if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
        let global_dir = config_dir.join("skills");
        if global_dir.exists() {
            load_skills_from_dir(&global_dir, &mut skills);
        }
    }

    // Plugin-declared skills (Sprint B6). Each path in the plugin manifest
    // can be either a single SKILL.md file or a directory holding many.
    let mut plugins_mgr = crate::plugins::PluginsManager::new();
    if plugins_mgr
        .load_all(std::env::current_dir().ok().as_deref())
        .is_ok()
    {
        for skill_path in plugins_mgr.skill_paths() {
            if skill_path.is_dir() {
                load_skills_from_dir(&skill_path, &mut skills);
            } else if skill_path.is_file()
                && skill_path.extension().and_then(|e| e.to_str()) == Some("md")
            {
                if let Ok(skill) = load_skill(&skill_path) {
                    skills.push(skill);
                }
            }
        }
    }

    skills
}

/// Load SKILL.md files from a directory.
fn load_skills_from_dir(dir: &Path, skills: &mut Vec<Skill>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            if let Ok(skill) = load_skill(&path) {
                skills.push(skill);
            }
        }
    }
}

/// Load and parse a single skill file.
fn load_skill(path: &Path) -> Result<Skill> {
    let content = std::fs::read_to_string(path)
        .context(format!("Failed to read skill file: {}", path.display()))?;

    let fm = parse_frontmatter(&content)?;

    Ok(Skill {
        name: fm.name,
        description: fm.description,
        content: content.clone(),
        body: fm.body,
        path: path.to_path_buf(),
        allow_implicit: fm.allow_implicit,
        category: fm.category,
        required_env_vars: fm.env_vars,
    })
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

/// Parsed frontmatter fields.
struct Frontmatter {
    name: String,
    description: String,
    body: String,
    allow_implicit: bool,
    category: Option<String>,
    env_vars: Vec<String>,
}

/// Parse YAML frontmatter from a markdown file.
/// Frontmatter is delimited by `---` lines at the top of the file.
fn parse_frontmatter(content: &str) -> Result<Frontmatter> {
    let trimmed = content.trim_start();

    if !trimmed.starts_with("---") {
        // No frontmatter — use filename as name
        return Ok(Frontmatter {
            name: "untitled".to_string(),
            description: String::new(),
            body: content.to_string(),
            allow_implicit: true,
            category: None,
            env_vars: Vec::new(),
        });
    }

    // Find the closing ---
    let after_first = &trimmed[3..].trim_start_matches('\n');
    if let Some(end_pos) = after_first.find("\n---") {
        let frontmatter_str = &after_first[..end_pos];
        let body = after_first[end_pos + 4..].trim_start_matches('\n');

        // Simple YAML parsing (extract known fields)
        let mut name = String::new();
        let mut description = String::new();
        let mut allow_implicit = true;
        let mut category: Option<String> = None;
        let mut env_vars: Vec<String> = Vec::new();

        for line in frontmatter_str.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("name:") {
                name = strip_yaml_quotes(val);
            } else if let Some(val) = line.strip_prefix("description:") {
                description = strip_yaml_quotes(val);
            } else if let Some(val) = line.strip_prefix("allow_implicit:") {
                let v = val.trim().to_lowercase();
                allow_implicit = v != "false" && v != "no" && v != "0";
            } else if let Some(val) = line.strip_prefix("category:") {
                let v = strip_yaml_quotes(val);
                if !v.is_empty() {
                    category = Some(v);
                }
            } else if let Some(val) = line.strip_prefix("env_vars:") {
                // Parse comma-separated or YAML list: env_vars: VAR1, VAR2
                let v = strip_yaml_quotes(val);
                env_vars = v
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            } else if line.starts_with("- ") && !env_vars.is_empty() {
                // Support YAML list continuation under env_vars:
                let v = strip_yaml_quotes(&line[2..]);
                if !v.is_empty() {
                    env_vars.push(v);
                }
            }
        }

        if name.is_empty() {
            name = "untitled".to_string();
        }

        Ok(Frontmatter {
            name,
            description,
            body: body.to_string(),
            allow_implicit,
            category,
            env_vars,
        })
    } else {
        // Malformed frontmatter
        Ok(Frontmatter {
            name: "untitled".to_string(),
            description: String::new(),
            body: content.to_string(),
            allow_implicit: true,
            category: None,
            env_vars: Vec::new(),
        })
    }
}

/// Strip surrounding single/double quotes and whitespace from a YAML value.
fn strip_yaml_quotes(val: &str) -> String {
    val.trim().trim_matches('"').trim_matches('\'').to_string()
}

// ---------------------------------------------------------------------------
// Skill mention extraction
// ---------------------------------------------------------------------------

/// Extract explicit skill mentions from text (prefixed with `$` or `@`).
///
/// Example: `"use $rust-helper to fix this"` returns `["rust-helper"]`.
/// Only alphanumeric characters, hyphens, and underscores are valid in names.
pub fn extract_skill_mentions(text: &str) -> Vec<String> {
    let re = Regex::new(r"(?:^|[\s(])[$@]([A-Za-z0-9][A-Za-z0-9_-]*)").expect("valid regex");
    re.captures_iter(text)
        .map(|cap| cap[1].to_string())
        .collect()
}

// ---------------------------------------------------------------------------
// Relevance scoring
// ---------------------------------------------------------------------------

/// Score a skill's relevance to a query (0.0 = no match, 1.0 = perfect match).
///
/// Scoring tiers:
/// - Exact name match: **1.0**
/// - Explicit `$name` / `@name` mention: **0.9**
/// - All query words found in description: **0.8**
/// - Most query words in description: **0.3 -- 0.7** (proportional)
/// - Name substring match: **0.5**
/// - Single word overlap: **0.1 -- 0.3**
///
/// For skills with `allow_implicit = false`, only exact-name and explicit-mention
/// tiers can produce a non-zero score.
pub fn score_skill(skill: &Skill, query: &str) -> f64 {
    let query_lower = query.to_lowercase();
    let name_lower = skill.name.to_lowercase();
    let desc_lower = skill.description.to_lowercase();

    // Exact name match (whole query equals the skill name)
    if query_lower.trim() == name_lower {
        return 1.0;
    }

    // Explicit $name / @name mention
    let mentions = extract_skill_mentions(query);
    for m in &mentions {
        if m.to_lowercase() == name_lower {
            return 0.9;
        }
    }

    // For non-implicit skills, stop here — keyword overlap is not allowed.
    if !skill.allow_implicit {
        return 0.0;
    }

    // Tokenise the query into words (skip very short noise words).
    let query_words: Vec<&str> = query_lower
        .split_whitespace()
        .filter(|w| w.len() >= 2)
        .collect();

    if query_words.is_empty() {
        return 0.0;
    }

    // Count how many query words appear in description or name.
    let matching_words = query_words
        .iter()
        .filter(|w| desc_lower.contains(**w) || name_lower.contains(**w))
        .count();

    let total = query_words.len();

    if matching_words == total && total > 1 {
        // All query words match
        return 0.8;
    }

    // Name substring match (skill name appears inside query or vice versa)
    if query_lower.contains(&name_lower) || name_lower.contains(&query_lower) {
        return 0.5;
    }

    if matching_words == 0 {
        return 0.0;
    }

    if matching_words == 1 && total >= 2 {
        // Single word overlap with multi-word query  → 0.1 – 0.3
        return 0.1 + 0.2 / total as f64;
    }

    // Proportional: map matching_words/total from (0, 1) to [0.3, 0.7]
    let ratio = matching_words as f64 / total as f64;
    0.3 + 0.4 * ratio
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/// Match skills to a query/context using relevance scoring.
///
/// Returns `(skill, score)` pairs above [`RELEVANCE_THRESHOLD`], sorted by
/// descending score.
pub fn match_skills_scored<'a>(skills: &'a [Skill], query: &str) -> Vec<(&'a Skill, f64)> {
    let mut scored: Vec<(&Skill, f64)> = skills
        .iter()
        .map(|s| (s, score_skill(s, query)))
        .filter(|(_, score)| *score >= RELEVANCE_THRESHOLD)
        .collect();

    // Sort descending by score, then alphabetically by name for stability.
    scored.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.name.cmp(&b.0.name))
    });

    scored
}

/// Match skills to a user query/context (compatibility wrapper).
///
/// Returns skills whose description or name matches keywords in the query.
/// Uses [`match_skills_scored`] under the hood.
pub fn match_skills<'a>(skills: &'a [Skill], query: &str) -> Vec<&'a Skill> {
    match_skills_scored(skills, query)
        .into_iter()
        .map(|(s, _)| s)
        .collect()
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/// Format matched skills for injection into the system prompt.
pub fn format_skills_for_prompt(skills: &[&Skill]) -> String {
    if skills.is_empty() {
        return String::new();
    }

    let mut out = String::from("\n\n<skills>\n");
    for skill in skills {
        out.push_str(&format!("## Skill: {}\n", skill.name));
        out.push_str(&skill.body);
        out.push_str("\n\n");
    }
    out.push_str("</skills>");
    out
}

/// Format all skills for display (`/skills` command), grouped by category.
///
/// Skills without a category are listed under *"Uncategorized"*.
pub fn format_skills_by_category(skills: &[Skill]) -> String {
    if skills.is_empty() {
        return "No skills found.\n\nSkill directories:\n  .agiworkforce/skills/ (project)\n  ~/.agiworkforce/skills/ (global)".to_string();
    }

    // Group by category using BTreeMap for deterministic ordering.
    let mut groups: BTreeMap<String, Vec<&Skill>> = BTreeMap::new();
    for skill in skills {
        let key = skill
            .category
            .as_deref()
            .unwrap_or("Uncategorized")
            .to_string();
        groups.entry(key).or_default().push(skill);
    }

    let mut out = String::new();

    for (category, members) in &groups {
        out.push_str(&format!("{}:\n", category));
        for skill in members {
            let source = if skill
                .path
                .to_string_lossy()
                .contains(".agiworkforce/skills")
            {
                "project"
            } else {
                "global"
            };
            let implicit_tag = if skill.allow_implicit {
                ""
            } else {
                " (explicit-only)"
            };
            out.push_str(&format!(
                "  {:<25} {}{} [{}]\n",
                skill.name,
                if skill.description.is_empty() {
                    "(no description)"
                } else {
                    &skill.description
                },
                implicit_tag,
                source,
            ));
        }
    }

    out.push_str(&format!("\n{} skills available.", skills.len()));
    out
}

/// Format all skills for display (`/skills` command) — flat list.
pub fn format_skill_list(skills: &[Skill]) -> String {
    if skills.is_empty() {
        return "No skills found.\n\nSkill directories:\n  .agiworkforce/skills/ (project)\n  ~/.agiworkforce/skills/ (global)".to_string();
    }

    let mut out = String::new();
    for skill in skills {
        let source = if skill
            .path
            .to_string_lossy()
            .contains(".agiworkforce/skills")
        {
            "project"
        } else {
            "global"
        };
        out.push_str(&format!(
            "  {:<25} {} [{}]\n",
            skill.name,
            if skill.description.is_empty() {
                "(no description)"
            } else {
                &skill.description
            },
            source
        ));
    }
    out.push_str(&format!("\n{} skills available.", skills.len()));
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ---- helpers ----------------------------------------------------------

    fn skill(name: &str, description: &str) -> Skill {
        Skill {
            name: name.to_string(),
            description: description.to_string(),
            content: String::new(),
            body: format!("{name} tips..."),
            path: PathBuf::from(format!("/tmp/{name}.md")),
            allow_implicit: true,
            category: None,
            required_env_vars: Vec::new(),
        }
    }

    fn skill_with(name: &str, desc: &str, implicit: bool, cat: Option<&str>) -> Skill {
        Skill {
            name: name.to_string(),
            description: desc.to_string(),
            content: String::new(),
            body: format!("{name} tips..."),
            path: PathBuf::from(format!("/home/user/.agiworkforce/skills/{name}.md")),
            allow_implicit: implicit,
            category: cat.map(String::from),
            required_env_vars: Vec::new(),
        }
    }

    // ---- frontmatter parsing ---------------------------------------------

    #[test]
    fn test_parse_frontmatter_basic() {
        let content =
            "---\nname: test-skill\ndescription: A test skill\n---\n\nSkill body content here.";
        let fm = parse_frontmatter(content).unwrap();
        assert_eq!(fm.name, "test-skill");
        assert_eq!(fm.description, "A test skill");
        assert!(fm.body.contains("Skill body content"));
        assert!(fm.allow_implicit);
        assert!(fm.category.is_none());
    }

    #[test]
    fn test_parse_frontmatter_no_frontmatter() {
        let content = "Just some regular markdown without frontmatter.";
        let fm = parse_frontmatter(content).unwrap();
        assert_eq!(fm.name, "untitled");
        assert!(fm.description.is_empty());
        assert_eq!(fm.body, content);
        assert!(fm.allow_implicit);
    }

    #[test]
    fn test_parse_frontmatter_quoted_values() {
        let content = "---\nname: \"my skill\"\ndescription: 'helps with testing'\n---\n\nBody.";
        let fm = parse_frontmatter(content).unwrap();
        assert_eq!(fm.name, "my skill");
        assert_eq!(fm.description, "helps with testing");
    }

    #[test]
    fn test_parse_frontmatter_allow_implicit_false() {
        let content =
            "---\nname: secret\ndescription: hidden skill\nallow_implicit: false\n---\n\nBody.";
        let fm = parse_frontmatter(content).unwrap();
        assert_eq!(fm.name, "secret");
        assert!(!fm.allow_implicit);
    }

    #[test]
    fn test_parse_frontmatter_allow_implicit_true_explicit() {
        let content =
            "---\nname: open\ndescription: open skill\nallow_implicit: true\n---\n\nBody.";
        let fm = parse_frontmatter(content).unwrap();
        assert!(fm.allow_implicit);
    }

    #[test]
    fn test_parse_frontmatter_category() {
        let content =
            "---\nname: git-fix\ndescription: Git helpers\ncategory: DevOps\n---\n\nBody.";
        let fm = parse_frontmatter(content).unwrap();
        assert_eq!(fm.category.as_deref(), Some("DevOps"));
    }

    #[test]
    fn test_parse_frontmatter_all_fields() {
        let content = "---\nname: full\ndescription: Full skill\ncategory: Testing\nallow_implicit: false\n---\n\nFull body.";
        let fm = parse_frontmatter(content).unwrap();
        assert_eq!(fm.name, "full");
        assert_eq!(fm.description, "Full skill");
        assert_eq!(fm.category.as_deref(), Some("Testing"));
        assert!(!fm.allow_implicit);
    }

    // ---- skill mention extraction ----------------------------------------

    #[test]
    fn test_extract_mentions_dollar() {
        let mentions = extract_skill_mentions("use $rust-helper to fix this");
        assert_eq!(mentions, vec!["rust-helper"]);
    }

    #[test]
    fn test_extract_mentions_at() {
        let mentions = extract_skill_mentions("ask @python-helper about this");
        assert_eq!(mentions, vec!["python-helper"]);
    }

    #[test]
    fn test_extract_mentions_multiple() {
        let mentions = extract_skill_mentions("$skill-a and $skill-b together");
        assert_eq!(mentions, vec!["skill-a", "skill-b"]);
    }

    #[test]
    fn test_extract_mentions_start_of_string() {
        let mentions = extract_skill_mentions("$my_skill do something");
        assert_eq!(mentions, vec!["my_skill"]);
    }

    #[test]
    fn test_extract_mentions_none() {
        let mentions = extract_skill_mentions("no mentions here at all");
        assert!(mentions.is_empty());
    }

    #[test]
    fn test_extract_mentions_mixed_prefixes() {
        let mentions = extract_skill_mentions("$alpha and @beta please");
        assert_eq!(mentions, vec!["alpha", "beta"]);
    }

    #[test]
    fn test_extract_mentions_in_parens() {
        let mentions = extract_skill_mentions("run ($my-tool) now");
        assert_eq!(mentions, vec!["my-tool"]);
    }

    // ---- relevance scoring -----------------------------------------------

    #[test]
    fn test_score_exact_name_match() {
        let s = skill("rust-helper", "Help with Rust programming");
        assert!((score_skill(&s, "rust-helper") - 1.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_score_explicit_mention() {
        let s = skill("rust-helper", "Help with Rust programming");
        assert!((score_skill(&s, "use $rust-helper please") - 0.9).abs() < f64::EPSILON);
    }

    #[test]
    fn test_score_explicit_mention_at() {
        let s = skill("rust-helper", "Help with Rust programming");
        assert!((score_skill(&s, "ask @rust-helper about this") - 0.9).abs() < f64::EPSILON);
    }

    #[test]
    fn test_score_all_words_match() {
        let s = skill("rust-helper", "Help with Rust programming");
        // "rust programming" → both words in description
        let score = score_skill(&s, "rust programming");
        assert!(
            (score - 0.8).abs() < f64::EPSILON,
            "expected 0.8, got {score}"
        );
    }

    #[test]
    fn test_score_name_substring() {
        let s = skill("rust-helper", "Assists with memory management");
        // Query "rust errors": "rust" matches in name, "errors" doesn't match anywhere.
        // Single word overlap with 2-word query → 0.1 + 0.2/2 = 0.2
        let score = score_skill(&s, "rust errors");
        assert!(
            (score - 0.2).abs() < f64::EPSILON,
            "expected 0.2, got {score}"
        );
    }

    #[test]
    fn test_score_single_word_overlap() {
        let s = skill("cooking", "Helps with Italian recipes");
        // "italian food" → only "italian" matches desc
        let score = score_skill(&s, "italian food");
        assert!(score >= 0.1, "expected >= 0.1, got {score}");
        assert!(score <= 0.3, "expected <= 0.3, got {score}");
    }

    #[test]
    fn test_score_no_match() {
        let s = skill("cooking", "Helps with Italian recipes");
        let score = score_skill(&s, "quantum physics");
        assert!(score.abs() < f64::EPSILON, "expected 0.0, got {score}");
    }

    #[test]
    fn test_score_non_implicit_blocks_keyword() {
        let mut s = skill("secret-tool", "Handles deployment secrets");
        s.allow_implicit = false;
        // Keyword overlap should yield 0 because allow_implicit = false
        let score = score_skill(&s, "deployment secrets");
        assert!(score.abs() < f64::EPSILON, "expected 0.0, got {score}");
    }

    #[test]
    fn test_score_non_implicit_allows_explicit_mention() {
        let mut s = skill("secret-tool", "Handles deployment secrets");
        s.allow_implicit = false;
        let score = score_skill(&s, "use $secret-tool for this");
        assert!(
            (score - 0.9).abs() < f64::EPSILON,
            "expected 0.9, got {score}"
        );
    }

    #[test]
    fn test_score_non_implicit_allows_exact_name() {
        let mut s = skill("secret-tool", "Handles deployment secrets");
        s.allow_implicit = false;
        let score = score_skill(&s, "secret-tool");
        assert!(
            (score - 1.0).abs() < f64::EPSILON,
            "expected 1.0, got {score}"
        );
    }

    #[test]
    fn test_score_proportional() {
        let s = skill("web-dev", "HTML CSS JavaScript TypeScript React");
        // 3 of 4 words match (html, css, javascript) — "python" does not
        let score = score_skill(&s, "html css javascript python");
        assert!(score > 0.3, "expected > 0.3, got {score}");
        assert!(score < 0.8, "expected < 0.8, got {score}");
    }

    // ---- match_skills_scored ---------------------------------------------

    #[test]
    fn test_match_skills_scored_ordering() {
        let skills = vec![
            skill("python-helper", "Help with Python programming"),
            skill("rust-helper", "Help with Rust programming"),
        ];

        let matches = match_skills_scored(&skills, "use $rust-helper for Rust code");
        assert!(!matches.is_empty());
        assert_eq!(matches[0].0.name, "rust-helper");
        // rust-helper should score higher than python-helper
        if matches.len() > 1 {
            assert!(matches[0].1 >= matches[1].1);
        }
    }

    #[test]
    fn test_match_skills_scored_filters_low() {
        let skills = vec![skill("cooking", "Italian recipes")];
        let matches = match_skills_scored(&skills, "quantum physics");
        assert!(matches.is_empty());
    }

    // ---- legacy match_skills wrapper -------------------------------------

    #[test]
    fn test_match_skills_basic() {
        let skills = vec![
            skill("rust-helper", "Help with Rust programming"),
            skill("python-helper", "Help with Python programming"),
        ];

        let matched = match_skills(&skills, "Rust code");
        assert_eq!(matched.len(), 1);
        assert_eq!(matched[0].name, "rust-helper");
    }

    #[test]
    fn test_match_skills_no_match() {
        let skills = vec![skill("cooking", "Cooking recipes")];
        let matched = match_skills(&skills, "Fix my JavaScript bug");
        assert!(matched.is_empty());
    }

    // ---- formatting ------------------------------------------------------

    #[test]
    fn test_format_skills_for_prompt() {
        let s = skill("test", "test skill");
        let formatted = format_skills_for_prompt(&[&s]);
        assert!(formatted.contains("<skills>"));
        assert!(formatted.contains("## Skill: test"));
        assert!(formatted.contains("test tips..."));
        assert!(formatted.contains("</skills>"));
    }

    #[test]
    fn test_format_skills_empty() {
        let formatted = format_skills_for_prompt(&[]);
        assert!(formatted.is_empty());
    }

    #[test]
    fn test_format_skill_list() {
        let skills = vec![skill_with("my-skill", "Does something", true, None)];
        let list = format_skill_list(&skills);
        assert!(list.contains("my-skill"));
        assert!(list.contains("Does something"));
        assert!(list.contains("1 skills available"));
    }

    // ---- category grouping -----------------------------------------------

    #[test]
    fn test_format_skills_by_category_grouped() {
        let skills = vec![
            skill_with("git-fix", "Git helpers", true, Some("DevOps")),
            skill_with("docker-run", "Docker helpers", true, Some("DevOps")),
            skill_with("react-tips", "React patterns", true, Some("Frontend")),
            skill_with("misc", "General tips", true, None),
        ];

        let out = format_skills_by_category(&skills);
        assert!(out.contains("DevOps:"));
        assert!(out.contains("Frontend:"));
        assert!(out.contains("Uncategorized:"));
        assert!(out.contains("git-fix"));
        assert!(out.contains("docker-run"));
        assert!(out.contains("react-tips"));
        assert!(out.contains("misc"));
        assert!(out.contains("4 skills available."));
    }

    #[test]
    fn test_format_skills_by_category_empty() {
        let out = format_skills_by_category(&[]);
        assert!(out.contains("No skills found."));
    }

    #[test]
    fn test_format_skills_by_category_explicit_only_tag() {
        let skills = vec![skill_with(
            "secret",
            "Hidden skill",
            false,
            Some("Internal"),
        )];
        let out = format_skills_by_category(&skills);
        assert!(out.contains("(explicit-only)"));
    }

    // ---- discover (smoke test) -------------------------------------------

    #[test]
    fn test_discover_skills_no_crash() {
        // Should not crash even if no skill directories exist
        let skills = discover_skills();
        let _ = skills; // Just verify no panic
    }
}

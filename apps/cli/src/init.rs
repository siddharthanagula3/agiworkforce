use anyhow::Result;
use std::fs;
use std::path::Path;

use crate::config::CliConfig;

/// Initialize the ~/.agiworkforce/ home directory structure on first run.
/// Safe to call on every startup — only creates what doesn't exist.
pub fn init_home_dir(home: &Path) -> Result<()> {
    let dirs = [
        "",                          // ~/.agiworkforce/ itself
        "plugins",
        "skills",
        "skills/.system",
        "skills/learned",
        "rules",
        "memories",
        "memories/session_summaries",
        "shell_snapshots",
        "log",
        "cache",
    ];
    for dir in &dirs {
        let path = home.join(dir);
        if !path.exists() {
            fs::create_dir_all(&path)?;
        }
    }

    // Generate default files if they don't exist
    write_default_config(home)?;
    write_default_instructions(home)?;
    write_default_mcp_json(home)?;
    write_default_rules(home)?;
    write_builtin_skills(home)?;

    Ok(())
}

/// Generate `~/.agiworkforce/config.toml` from `CliConfig::default()` if it doesn't exist.
fn write_default_config(home: &Path) -> Result<()> {
    let config_path = home.join("config.toml");
    if config_path.exists() {
        return Ok(());
    }

    let default_config = CliConfig::default();
    let toml_body = toml::to_string_pretty(&default_config)?;

    let header = r#"# AGI Workforce CLI Configuration
# Global: ~/.agiworkforce/config.toml
# Project override: .agiworkforce/config.toml
#
# Documentation: https://docs.agiworkforce.com/cli/config
#
# Uncomment and edit the values below to customize your setup.
# Environment variables (e.g. AGIWORKFORCE_MODEL) override these values.
#
# Optional settings (uncomment to enable):
# [default]
# temperature = 0.7
# fallback_chain = ["gpt-4o", "gemini-2.5-pro"]
# fast_model = "claude-haiku-4-5"
# sandbox_mode = "read-only"
# review_model = "claude-sonnet-4-6"
# cloud_model = "claude-opus-4-6"

"#;

    let contents = format!("{}{}", header, toml_body);
    fs::write(&config_path, contents)?;

    Ok(())
}

/// Generate `~/.agiworkforce/INSTRUCTIONS.md` if it doesn't exist.
fn write_default_instructions(home: &Path) -> Result<()> {
    let path = home.join("INSTRUCTIONS.md");
    if path.exists() {
        return Ok(());
    }

    let contents = r#"# AGI Workforce Instructions

Add custom instructions here. These are loaded into every agent session.
The CLI loads this file from ~/.agiworkforce/INSTRUCTIONS.md (global)
and .agiworkforce/INSTRUCTIONS.md (project-level).

## Examples
- "Always use TypeScript strict mode"
- "Prefer functional patterns over classes"
- "Run tests after every code change"
"#;

    fs::write(&path, contents)?;
    Ok(())
}

/// Generate `~/.agiworkforce/mcp.json` if it doesn't exist.
fn write_default_mcp_json(home: &Path) -> Result<()> {
    let path = home.join("mcp.json");
    if path.exists() {
        return Ok(());
    }

    let contents = r#"{
  "mcpServers": {}
}
"#;

    fs::write(&path, contents)?;
    Ok(())
}

/// Generate `~/.agiworkforce/rules/default.rules` if it doesn't exist.
fn write_default_rules(home: &Path) -> Result<()> {
    let path = home.join("rules").join("default.rules");
    if path.exists() {
        return Ok(());
    }

    let contents = r#"# Default execution rules for AGI Workforce CLI
# Format: <effect> <matcher> <value>
#   effect:  allow | deny
#   matcher: prefix | program | regex | heuristic
#   value:   the string/pattern to match
#
# Examples:
#   allow prefix git status    — auto-approve "git status" and anything starting with it
#   deny program rm            — block any command whose program is "rm"
#   allow regex ^cargo (check|clippy|test)  — allow cargo check/clippy/test

allow prefix git status
allow prefix git diff
allow prefix git log
allow prefix git branch
allow prefix cargo check
allow prefix cargo clippy
allow prefix cargo test
allow prefix pnpm typecheck
allow prefix pnpm lint
allow prefix pnpm test
allow prefix npm test
allow program ls
allow program cat
allow program head
allow program tail
allow program wc
allow program find
allow program grep
"#;

    fs::write(&path, contents)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Built-in skills
// ---------------------------------------------------------------------------

const SKILL_CODE_REVIEW: &str = r#"---
name: code-review
description: Review code for bugs, security issues, and quality improvements
category: development
---

# Code Review

Review the provided code for:
1. Logic errors and bugs
2. Security vulnerabilities (OWASP Top 10)
3. Performance issues
4. Code style and readability
5. Missing error handling

Provide specific, actionable feedback with line references.
"#;

const SKILL_REFACTOR: &str = r#"---
name: refactor
description: Modernize and clean up code while preserving functionality
category: development
---

# Refactor

Refactor the code to:
1. Reduce complexity and improve readability
2. Extract reusable functions (DRY principle)
3. Improve naming for clarity
4. Remove dead code
5. Apply SOLID principles where appropriate

Always preserve existing behavior. Run tests after changes.
"#;

const SKILL_TEST_WRITER: &str = r#"---
name: test-writer
description: Generate comprehensive unit and integration tests
category: testing
---

# Test Writer

Generate tests following TDD principles:
1. Write failing tests first
2. Cover happy path, edge cases, and error cases
3. Use table-driven tests where appropriate
4. Mock external dependencies
5. Aim for >80% coverage of the target code
"#;

const SKILL_EXPLAIN: &str = r#"---
name: explain
description: Explain code, concepts, and architecture clearly
category: learning
---

# Explain

Explain the requested code or concept:
1. Start with a high-level overview
2. Walk through the logic step by step
3. Highlight key design decisions
4. Note any non-obvious behavior
5. Suggest documentation if needed
"#;

const SKILL_SECURITY_AUDIT: &str = r#"---
name: security-audit
description: Audit code for security vulnerabilities and recommend fixes
category: security
---

# Security Audit

Perform a security audit:
1. Check for injection vulnerabilities (SQL, XSS, command)
2. Verify authentication and authorization
3. Check for secrets exposure
4. Review cryptographic usage
5. Assess input validation and sanitization
6. Check for SSRF, path traversal, and IDOR

Report findings with severity levels and specific remediation.
"#;

/// Write built-in skill files to `~/.agiworkforce/skills/.system/` if they
/// don't already exist.  Each skill is a standalone SKILL.md with YAML
/// frontmatter that the skills discovery system can load.
fn write_builtin_skills(home: &Path) -> Result<()> {
    let system_dir = home.join("skills").join(".system");

    let skills: &[(&str, &str)] = &[
        ("code-review.md", SKILL_CODE_REVIEW),
        ("refactor.md", SKILL_REFACTOR),
        ("test-writer.md", SKILL_TEST_WRITER),
        ("explain.md", SKILL_EXPLAIN),
        ("security-audit.md", SKILL_SECURITY_AUDIT),
    ];

    for (filename, content) in skills {
        let path = system_dir.join(filename);
        if !path.exists() {
            fs::write(&path, content)?;
        }
    }

    Ok(())
}

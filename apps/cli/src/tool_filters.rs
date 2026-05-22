use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolFilterViolation {
    pub rule: String,
    pub reason: String,
}

pub fn spec_matches_tool_for_schema(spec: &str, tool_name: &str) -> bool {
    crate::runtime::tool_catalog::policy_alias_matches_tool(spec_alias(spec), tool_name)
}

pub fn spec_blocks_entire_tool_for_schema(spec: &str, tool_name: &str) -> bool {
    spec_matches_tool_for_schema(spec, tool_name)
        && spec_argument_filter(spec).is_none_or(|pattern| wildcard_matches(pattern, ""))
}

pub fn ensure_tool_call_allowed(
    tool_name: &str,
    args: &HashMap<String, String>,
    allowed_tools: Option<&[String]>,
    disallowed_tools: &[String],
) -> Result<(), ToolFilterViolation> {
    if let Some(rule) = disallowed_tools
        .iter()
        .find(|spec| spec_matches_tool_call(spec, tool_name, args))
    {
        return Err(ToolFilterViolation {
            rule: rule.clone(),
            reason: format!("Tool call `{tool_name}` matches disallowed tool rule `{rule}`."),
        });
    }

    if let Some(allowed_tools) = allowed_tools {
        if !allowed_tools.is_empty()
            && !allowed_tools
                .iter()
                .any(|spec| spec_matches_tool_call(spec, tool_name, args))
        {
            return Err(ToolFilterViolation {
                rule: allowed_tools.join(", "),
                reason: format!("Tool call `{tool_name}` does not match the allowed tool rules."),
            });
        }
    }

    Ok(())
}

fn spec_matches_tool_call(spec: &str, tool_name: &str, args: &HashMap<String, String>) -> bool {
    if !spec_matches_tool_for_schema(spec, tool_name) {
        return false;
    }

    let Some(pattern) = spec_argument_filter(spec) else {
        return true;
    };

    match call_target_for_pattern(tool_name, args) {
        Some(target) => wildcard_matches(pattern, target),
        None => wildcard_matches(pattern, ""),
    }
}

fn call_target_for_pattern<'a>(
    tool_name: &str,
    args: &'a HashMap<String, String>,
) -> Option<&'a str> {
    match tool_name {
        "run_command" | "powershell" => args.get("command").map(String::as_str),
        "read_file" | "write_file" => args.get("path").map(String::as_str),
        "read_many_files" => args.get("paths").map(String::as_str),
        "edit_file" | "multiedit" | "apply_patch" => args
            .get("path")
            .or_else(|| args.get("file_path"))
            .or_else(|| args.get("patch"))
            .map(String::as_str),
        "grep_files" | "glob" | "search_files" => args
            .get("pattern")
            .or_else(|| args.get("query"))
            .map(String::as_str),
        "web_fetch" => args.get("url").map(String::as_str),
        "web_search" => args.get("query").map(String::as_str),
        _ => None,
    }
}

fn spec_alias(spec: &str) -> &str {
    spec.split_once('(')
        .map(|(alias, _)| alias)
        .unwrap_or(spec)
        .trim()
}

fn spec_argument_filter(spec: &str) -> Option<&str> {
    let (_, rest) = spec.split_once('(')?;
    Some(rest.strip_suffix(')').unwrap_or(rest).trim())
}

fn wildcard_matches(pattern: &str, value: &str) -> bool {
    let pattern = pattern.trim();
    if pattern.is_empty() {
        return value.is_empty();
    }

    let pattern_chars = pattern.chars().collect::<Vec<_>>();
    let value_chars = value.chars().collect::<Vec<_>>();
    let (mut pattern_index, mut value_index) = (0usize, 0usize);
    let mut star_index: Option<usize> = None;
    let mut value_after_star = 0usize;

    while value_index < value_chars.len() {
        if pattern_index < pattern_chars.len()
            && (pattern_chars[pattern_index] == '?'
                || pattern_chars[pattern_index] == value_chars[value_index])
        {
            pattern_index += 1;
            value_index += 1;
        } else if pattern_index < pattern_chars.len() && pattern_chars[pattern_index] == '*' {
            star_index = Some(pattern_index);
            pattern_index += 1;
            value_after_star = value_index;
        } else if let Some(star) = star_index {
            pattern_index = star + 1;
            value_after_star += 1;
            value_index = value_after_star;
        } else {
            return false;
        }
    }

    while pattern_index < pattern_chars.len() && pattern_chars[pattern_index] == '*' {
        pattern_index += 1;
    }

    pattern_index == pattern_chars.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    #[test]
    fn claude_style_tool_aliases_match_internal_tool_names() {
        assert!(spec_matches_tool_for_schema("Read", "read_file"));
        assert!(spec_matches_tool_for_schema("Bash(cargo *)", "run_command"));
        assert!(spec_matches_tool_for_schema("Edit", "apply_patch"));
        assert!(!spec_matches_tool_for_schema("Write", "read_file"));
    }

    #[test]
    fn pattern_specific_disallow_does_not_remove_whole_schema_tool() {
        assert!(!spec_blocks_entire_tool_for_schema(
            "Bash(rm*)",
            "run_command"
        ));
        assert!(spec_blocks_entire_tool_for_schema("Bash(*)", "run_command"));
        assert!(spec_blocks_entire_tool_for_schema(
            "run_command",
            "run_command"
        ));
    }

    #[test]
    fn call_filter_blocks_disallowed_command_patterns() {
        let err = ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "rm -rf target")]),
            None,
            &["Bash(rm*)".to_string()],
        )
        .expect_err("rm command should be denied");

        assert!(err.reason.contains("disallowed tool rule"));
    }

    #[test]
    fn call_filter_enforces_positive_allowlist_patterns() {
        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "cargo test -p agiworkforce-cli")]),
            Some(&["Bash(cargo *)".to_string()]),
            &[],
        )
        .is_ok());

        assert!(ensure_tool_call_allowed(
            "run_command",
            &args(&[("command", "npm install")]),
            Some(&["Bash(cargo *)".to_string()]),
            &[],
        )
        .is_err());
    }
}

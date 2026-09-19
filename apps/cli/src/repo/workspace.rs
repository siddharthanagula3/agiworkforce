use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

const MAX_WORKSPACE_MEMBERS: usize = 512;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceMember {
    pub name: String,
    pub path: PathBuf,
}

/// The declared shape of a monorepo: the tool that orchestrates it, the member
/// patterns it declares, and the directories those patterns actually resolve to.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WorkspaceGraph {
    pub tool: Option<String>,
    pub patterns: Vec<String>,
    pub members: Vec<WorkspaceMember>,
}

impl WorkspaceGraph {
    pub fn is_empty(&self) -> bool {
        self.tool.is_none() && self.patterns.is_empty() && self.members.is_empty()
    }

    pub fn member_for(&self, path: &Path) -> Option<&WorkspaceMember> {
        self.members
            .iter()
            .filter(|member| path.starts_with(&member.path))
            .max_by_key(|member| member.path.components().count())
    }
}

/// `workspaces` from a package.json, in both the array form and the
/// `{ "packages": [...] }` object form yarn accepts.
pub fn parse_package_json_workspaces(text: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else {
        return Vec::new();
    };
    let workspaces = value.get("workspaces");
    let array = match workspaces {
        Some(serde_json::Value::Array(items)) => Some(items),
        Some(serde_json::Value::Object(object)) => {
            object.get("packages").and_then(serde_json::Value::as_array)
        }
        _ => None,
    };
    array
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// The `packages:` list of a pnpm-workspace.yaml. Only the flat sequence form
/// is a workspace declaration, so no YAML parser is pulled in to read it.
pub fn parse_pnpm_workspace_packages(text: &str) -> Vec<String> {
    let mut patterns = Vec::new();
    let mut inside = false;
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim_start().starts_with('#') {
            continue;
        }
        if trimmed.starts_with("packages:") {
            inside = true;
            continue;
        }
        if inside {
            let entry = trimmed.trim_start();
            if !entry.starts_with('-') {
                if !entry.is_empty() && !trimmed.starts_with(' ') {
                    inside = false;
                }
                continue;
            }
            let value = entry
                .trim_start_matches('-')
                .trim()
                .trim_matches(['"', '\''].as_slice());
            if !value.is_empty() {
                patterns.push(value.to_string());
            }
        }
    }
    patterns
}

/// `[workspace] members` from a Cargo.toml, with `exclude` removed.
pub fn parse_cargo_workspace_members(text: &str) -> Vec<String> {
    let Ok(root) = toml::from_str::<toml::Table>(text) else {
        return Vec::new();
    };
    let Some(workspace) = root.get("workspace").and_then(toml::Value::as_table) else {
        return Vec::new();
    };
    let list = |key: &str| -> Vec<String> {
        workspace
            .get(key)
            .and_then(toml::Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default()
    };
    let excluded: BTreeSet<String> = list("exclude").into_iter().collect();
    list("members")
        .into_iter()
        .filter(|member| !excluded.contains(member))
        .collect()
}

fn member_name(dir: &Path) -> String {
    if let Ok(text) = std::fs::read_to_string(dir.join("package.json")) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Some(name) = value.get("name").and_then(serde_json::Value::as_str) {
                return name.to_string();
            }
        }
    }
    if let Ok(text) = std::fs::read_to_string(dir.join("Cargo.toml")) {
        if let Ok(root) = toml::from_str::<toml::Table>(&text) {
            if let Some(name) = root
                .get("package")
                .and_then(|package| package.get("name"))
                .and_then(toml::Value::as_str)
            {
                return name.to_string();
            }
        }
    }
    dir.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn is_member_dir(dir: &Path) -> bool {
    dir.is_dir()
        && (dir.join("package.json").exists()
            || dir.join("Cargo.toml").exists()
            || dir.join("go.mod").exists()
            || dir.join("pyproject.toml").exists())
}

/// Resolve member patterns against the root. A pattern that matches nothing on
/// disk stays in `patterns` and contributes no member, which is how a stale.
pub fn expand_workspace_patterns(root: &Path, patterns: &[String]) -> Vec<WorkspaceMember> {
    let mut seen = BTreeSet::new();
    let mut members = Vec::new();
    for pattern in patterns {
        if pattern.starts_with('!') {
            continue;
        }
        let joined = root.join(pattern);
        let Some(glob_pattern) = joined.to_str() else {
            continue;
        };
        let Ok(paths) = glob::glob(glob_pattern) else {
            continue;
        };
        for path in paths.flatten() {
            if members.len() >= MAX_WORKSPACE_MEMBERS {
                return members;
            }
            if !is_member_dir(&path) || !seen.insert(path.clone()) {
                continue;
            }
            members.push(WorkspaceMember {
                name: member_name(&path),
                path,
            });
        }
    }
    members.sort_by(|left, right| left.path.cmp(&right.path));
    members
}

/// The workspace graph declared at `root`, across the three manifest shapes the
/// repository's own tooling uses.
pub fn workspace_graph(root: &Path, tool: Option<String>) -> Option<WorkspaceGraph> {
    let mut patterns = Vec::new();
    if let Ok(text) = std::fs::read_to_string(root.join("pnpm-workspace.yaml")) {
        patterns.extend(parse_pnpm_workspace_packages(&text));
    }
    if let Ok(text) = std::fs::read_to_string(root.join("package.json")) {
        patterns.extend(parse_package_json_workspaces(&text));
    }
    if let Ok(text) = std::fs::read_to_string(root.join("Cargo.toml")) {
        patterns.extend(parse_cargo_workspace_members(&text));
    }
    patterns.dedup();
    let members = expand_workspace_patterns(root, &patterns);
    let graph = WorkspaceGraph {
        tool,
        patterns,
        members,
    };
    (!graph.is_empty()).then_some(graph)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_json_workspaces_read_both_declared_shapes() {
        assert_eq!(
            parse_package_json_workspaces(r#"{"workspaces":["apps/*","packages/*"]}"#),
            vec!["apps/*".to_string(), "packages/*".to_string()]
        );
        assert_eq!(
            parse_package_json_workspaces(r#"{"workspaces":{"packages":["libs/*"]}}"#),
            vec!["libs/*".to_string()]
        );
        assert!(parse_package_json_workspaces(r#"{"name":"solo"}"#).is_empty());
    }

    #[test]
    fn pnpm_workspace_packages_are_read_without_a_yaml_parser() {
        let patterns = parse_pnpm_workspace_packages(
            "# comment\npackages:\n  - 'apps/*'\n  - \"packages/**\"\n  - tools/cli\nonlyBuiltDependencies:\n  - esbuild\n",
        );
        assert_eq!(patterns, vec!["apps/*", "packages/**", "tools/cli"]);
    }

    #[test]
    fn cargo_workspace_members_drop_the_excluded_ones() {
        let members = parse_cargo_workspace_members(
            "[workspace]\nmembers = [\"crates/a\", \"crates/b\"]\nexclude = [\"crates/b\"]\n",
        );
        assert_eq!(members, vec!["crates/a".to_string()]);
    }

    #[test]
    fn patterns_resolve_to_members_named_by_their_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("packages/alpha")).unwrap();
        std::fs::create_dir_all(root.join("packages/empty")).unwrap();
        std::fs::write(
            root.join("packages/alpha").join("package.json"),
            r#"{"name":"@scope/alpha"}"#,
        )
        .unwrap();

        let members = expand_workspace_patterns(root, &["packages/*".to_string()]);

        assert_eq!(members.len(), 1);
        assert_eq!(members[0].name, "@scope/alpha");
        assert_eq!(members[0].path, root.join("packages/alpha"));
    }

    #[test]
    fn a_member_is_found_for_a_path_inside_it() {
        let graph = WorkspaceGraph {
            tool: Some("pnpm workspaces".to_string()),
            patterns: vec!["packages/*".to_string()],
            members: vec![
                WorkspaceMember {
                    name: "alpha".to_string(),
                    path: PathBuf::from("/repo/packages/alpha"),
                },
                WorkspaceMember {
                    name: "nested".to_string(),
                    path: PathBuf::from("/repo/packages/alpha/nested"),
                },
            ],
        };

        let member = graph
            .member_for(Path::new("/repo/packages/alpha/nested/src/lib.rs"))
            .unwrap();

        assert_eq!(member.name, "nested");
        assert!(graph.member_for(Path::new("/elsewhere")).is_none());
    }
}

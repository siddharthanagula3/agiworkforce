use serde::Deserialize;
use serde::Serialize;
use std::fmt;

/// Separator between a tool's namespace and its bare name.
///
/// Matches the `mcp__{server}__{name}` namespacing convention used elsewhere in
/// the protocol (see the MCP function-call name format), so `display()`/`Display`
/// and the `From<String>` parser round-trip symmetrically: a value formatted with
/// a namespace re-parses back into the same namespace + name.
const NAMESPACE_SEP: &str = "__";

/// Identifies a callable tool, preserving the namespace split when the model
/// provides one.
#[derive(Clone, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
pub struct ToolName {
    pub name: String,
    pub namespace: Option<String>,
}

impl ToolName {
    pub fn new(namespace: Option<String>, name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            namespace,
        }
    }

    pub fn plain(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            namespace: None,
        }
    }

    pub fn namespaced(namespace: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            namespace: Some(namespace.into()),
        }
    }

    pub fn display(&self) -> String {
        match &self.namespace {
            Some(namespace) => format!("{namespace}{NAMESPACE_SEP}{}", self.name),
            None => self.name.clone(),
        }
    }
}

impl fmt::Display for ToolName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.namespace {
            Some(namespace) => write!(f, "{namespace}{NAMESPACE_SEP}{}", self.name),
            None => f.write_str(&self.name),
        }
    }
}

impl From<String> for ToolName {
    /// Parse a wire string back into a namespace + name. A value containing the
    /// [`NAMESPACE_SEP`] is split at the first separator so it round-trips with
    /// [`ToolName::display`]/[`fmt::Display`]; anything else is a plain,
    /// un-namespaced name.
    fn from(name: String) -> Self {
        match name.split_once(NAMESPACE_SEP) {
            Some((namespace, rest)) if !namespace.is_empty() && !rest.is_empty() => {
                Self::namespaced(namespace.to_string(), rest.to_string())
            }
            _ => Self::plain(name),
        }
    }
}

impl From<&str> for ToolName {
    fn from(name: &str) -> Self {
        Self::from(name.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::ToolName;

    #[test]
    fn display_inserts_namespace_separator() {
        let tool = ToolName::namespaced("mcpserver", "read_file");
        assert_eq!(tool.display(), "mcpserver__read_file");
        assert_eq!(tool.to_string(), "mcpserver__read_file");
    }

    #[test]
    fn plain_name_has_no_separator() {
        let tool = ToolName::plain("read_file");
        assert_eq!(tool.display(), "read_file");
        assert_eq!(tool.to_string(), "read_file");
    }

    #[test]
    fn from_string_round_trips_namespaced() {
        let original = ToolName::namespaced("mcpserver", "read_file");
        let parsed = ToolName::from(original.display());
        assert_eq!(parsed, original);
        assert_eq!(parsed.namespace.as_deref(), Some("mcpserver"));
        assert_eq!(parsed.name, "read_file");
    }

    #[test]
    fn from_string_treats_bare_name_as_plain() {
        let parsed = ToolName::from("read_file".to_string());
        assert_eq!(parsed, ToolName::plain("read_file"));
        assert!(parsed.namespace.is_none());
    }
}

//! LSP wire types. Subset of the full spec — symbols, hover, definition, diagnostics.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub line: u32,
    pub character: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Range {
    pub start: Position,
    pub end: Position,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub uri: String,
    pub range: Range,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub range: Range,
    pub severity: Option<u8>, // 1 = Error, 2 = Warning, 3 = Info, 4 = Hint
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hover {
    pub contents: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<Range>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn position_roundtrip() {
        let p = Position { line: 5, character: 12 };
        let j = serde_json::to_string(&p).unwrap();
        let back: Position = serde_json::from_str(&j).unwrap();
        assert_eq!(p.line, back.line);
        assert_eq!(p.character, back.character);
    }

    #[test]
    fn diagnostic_with_severity() {
        let d = Diagnostic {
            range: Range {
                start: Position { line: 0, character: 0 },
                end: Position { line: 0, character: 5 },
            },
            severity: Some(1),
            message: "err".into(),
            source: Some("rustc".into()),
        };
        let j = serde_json::to_string(&d).unwrap();
        assert!(j.contains("\"severity\":1"));
        assert!(j.contains("rustc"));
    }
}

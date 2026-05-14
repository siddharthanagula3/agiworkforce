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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionItem {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub documentation: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub insert_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentSymbol {
    pub name: String,
    pub kind: u8,
    pub range: Range,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<DocumentSymbol>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextEdit {
    pub range: Range,
    pub new_text: String,
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

    #[test]
    fn completion_item_roundtrip() {
        let item = CompletionItem {
            label: "println".to_string(),
            kind: Some(3),
            detail: Some("fn println(...)".to_string()),
            documentation: None,
            insert_text: Some("println!(\"$0\")".to_string()),
        };
        let j = serde_json::to_string(&item).unwrap();
        let back: CompletionItem = serde_json::from_str(&j).unwrap();
        assert_eq!(back.label, "println");
        assert_eq!(back.kind, Some(3));
        assert!(back.documentation.is_none());
    }

    #[test]
    fn document_symbol_roundtrip() {
        let sym = DocumentSymbol {
            name: "MyStruct".to_string(),
            kind: 23,
            range: Range {
                start: Position { line: 5, character: 0 },
                end: Position { line: 20, character: 1 },
            },
            children: vec![],
        };
        let j = serde_json::to_string(&sym).unwrap();
        let back: DocumentSymbol = serde_json::from_str(&j).unwrap();
        assert_eq!(back.name, "MyStruct");
        assert_eq!(back.kind, 23);
        // children field omitted when empty due to skip_serializing_if
        assert!(!j.contains("children"));
    }

    #[test]
    fn text_edit_roundtrip() {
        let edit = TextEdit {
            range: Range {
                start: Position { line: 1, character: 0 },
                end: Position { line: 1, character: 4 },
            },
            new_text: "    ".to_string(),
        };
        let j = serde_json::to_string(&edit).unwrap();
        let back: TextEdit = serde_json::from_str(&j).unwrap();
        assert_eq!(back.new_text, "    ");
    }
}

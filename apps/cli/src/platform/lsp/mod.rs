//! Basic stdio LSP client. M36 of v1.2.

#![allow(dead_code)]

pub mod client;
pub mod types;

#[allow(unused_imports)]
pub use client::{DiagnosticsBuffer, LspClient};
#[allow(unused_imports)]
pub use types::{
    CompletionItem, Diagnostic, DocumentSymbol, Hover, Location, Position, Range, TextEdit,
};

/// Pick the default LSP server for a given file extension.
pub fn server_for_extension(ext: &str) -> Option<(&'static str, &'static [&'static str])> {
    match ext {
        "rs" => Some(("rust-analyzer", &[])),
        "ts" | "tsx" | "js" | "jsx" => Some(("typescript-language-server", &["--stdio"])),
        "go" => Some(("gopls", &[])),
        "py" => Some(("pyright-langserver", &["--stdio"])),
        _ => None,
    }
}

pub fn language_id_for_extension(ext: &str) -> Option<&'static str> {
    match ext {
        "rs" => Some("rust"),
        "ts" => Some("typescript"),
        "tsx" => Some("typescriptreact"),
        "js" => Some("javascript"),
        "jsx" => Some("javascriptreact"),
        "go" => Some("go"),
        "py" => Some("python"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_for_rust_extension() {
        let (cmd, args) = server_for_extension("rs").expect("rust");
        assert_eq!(cmd, "rust-analyzer");
        assert!(args.is_empty());
    }

    #[test]
    fn server_for_typescript() {
        let (cmd, args) = server_for_extension("ts").expect("ts");
        assert_eq!(cmd, "typescript-language-server");
        assert_eq!(args, &["--stdio"]);
    }

    #[test]
    fn server_for_unknown_extension() {
        assert!(server_for_extension("xyz").is_none());
    }

    #[test]
    fn every_served_extension_names_its_language() {
        for ext in ["rs", "ts", "tsx", "js", "jsx", "go", "py"] {
            assert!(server_for_extension(ext).is_some(), "{ext}");
            assert!(language_id_for_extension(ext).is_some(), "{ext}");
        }
        assert_eq!(language_id_for_extension("tsx"), Some("typescriptreact"));
    }
}

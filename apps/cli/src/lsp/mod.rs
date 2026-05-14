//! Basic stdio LSP client. M36 of v1.2.

#![allow(dead_code)]

pub mod client;
pub mod types;

#[allow(unused_imports)]
pub use client::LspClient;
#[allow(unused_imports)]
pub use types::{Diagnostic, Hover, Location, Position, Range};

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
}

use std::path::Path;

pub const SQLCIPHER_VERSION: &str = "4.20.0";
pub const SQLITE_VERSION: &str = "3.54.1";
pub const SOURCE_FILE: &str = "sqlcipher.c";
pub const HEADER_FILE: &str = "sqlite3.h";

pub fn source_dir() -> &'static Path {
    Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/sqlcipher"))
}

use anyhow::Result;
use clap::Parser;
use std::path::PathBuf;

/// Generate the JSON Schema for `config.toml` and write it to `config.schema.json`.
///
/// This binary is a stub for the demo build. Full schema generation will be
/// restored once `agiworkforce-config::schema` is wired up.
#[derive(Parser)]
#[command(name = "agiworkforce-write-config-schema")]
struct Args {
    #[arg(short, long, value_name = "PATH")]
    out: Option<PathBuf>,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let out_path = args
        .out
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("config.schema.json"));
    eprintln!(
        "agiworkforce-write-config-schema: schema generation not wired yet; \
         leaving {} unchanged.",
        out_path.display()
    );
    Ok(())
}

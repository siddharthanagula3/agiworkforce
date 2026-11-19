use std::env;
use std::error::Error;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn main() -> Result<(), Box<dyn Error>> {
    let root = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?).join("../../..");
    for source in [
        "apps/desktop/gpui/scripts/contracts.mjs",
        "packages/contracts/cloud-contracts/src/conversation-contract.json",
        "packages/contracts/cloud-contracts/src/project-contract.json",
        "packages/contracts/types/src/product-names.ts",
        "packages/contracts/types/src/runtime.ts",
        "packages/contracts/types/src/suite-contracts.ts",
        "packages/contracts/local-runtime/src/developer-sessions.ts",
        "packages/contracts/local-runtime/src/developer-session-limits.json",
        "packages/ui/design-tokens/src/index.ts",
        "packages/ui/design-tokens/src/foundation.css",
    ] {
        println!("cargo:rerun-if-changed={}", root.join(source).display());
    }
    let result = Command::new("node")
        .arg(root.join("apps/desktop/gpui/scripts/contracts.mjs"))
        .output()?;
    if !result.status.success() {
        return Err(format!(
            "native contract generation failed: {}",
            String::from_utf8_lossy(&result.stderr)
        )
        .into());
    }
    fs::write(
        PathBuf::from(env::var("OUT_DIR")?).join("contracts.json"),
        result.stdout,
    )?;
    Ok(())
}

use agiworkforce_apply_patch::parse_and_apply;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use tempfile::tempdir;

const SCENARIOS_DIR: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/scenarios"
);

#[test]
fn test_all_scenarios() {
    let dir = Path::new(SCENARIOS_DIR);
    let mut scenarios: Vec<_> = fs::read_dir(dir)
        .expect("scenarios directory must exist")
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .collect();
    scenarios.sort_by_key(|e| e.file_name());

    assert!(
        !scenarios.is_empty(),
        "no scenario directories found under {SCENARIOS_DIR}"
    );

    let mut failures: Vec<String> = Vec::new();

    for entry in scenarios {
        let path = entry.path();
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        if let Err(msg) = run_scenario(&path) {
            failures.push(format!("SCENARIO {name}: {msg}"));
        }
    }

    if !failures.is_empty() {
        panic!(
            "{} scenario(s) failed:\n{}",
            failures.len(),
            failures.join("\n\n")
        );
    }
}

fn run_scenario(dir: &Path) -> Result<(), String> {
    let tmp = tempdir().map_err(|e| e.to_string())?;

    let input_dir = dir.join("input");
    if input_dir.is_dir() {
        copy_dir(&input_dir, tmp.path()).map_err(|e| e.to_string())?;
    }

    let patch_text = fs::read_to_string(dir.join("patch.txt"))
        .map_err(|e| format!("cannot read patch.txt: {e}"))?;

    // Run apply — errors are intentionally ignored; the test is purely filesystem-state based.
    let _ = parse_and_apply(&patch_text, tmp.path());

    let expected = snapshot(dir.join("expected").as_path()).map_err(|e| e.to_string())?;
    let actual = snapshot(tmp.path()).map_err(|e| e.to_string())?;

    if actual != expected {
        let mut msg = String::from("filesystem state mismatch\n  expected:\n");
        for (p, v) in &expected {
            match v {
                Entry::Dir => msg.push_str(&format!("    DIR  {}\n", p.display())),
                Entry::File(b) => msg.push_str(&format!(
                    "    FILE {}  ({} bytes)\n",
                    p.display(),
                    b.len()
                )),
            }
        }
        msg.push_str("  actual:\n");
        for (p, v) in &actual {
            match v {
                Entry::Dir => msg.push_str(&format!("    DIR  {}\n", p.display())),
                Entry::File(b) => msg.push_str(&format!(
                    "    FILE {}  ({} bytes)\n",
                    p.display(),
                    b.len()
                )),
            }
        }
        return Err(msg);
    }

    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Entry {
    File(Vec<u8>),
    Dir,
}

fn snapshot(root: &Path) -> std::io::Result<BTreeMap<PathBuf, Entry>> {
    let mut map = BTreeMap::new();
    if root.is_dir() {
        snapshot_recursive(root, root, &mut map)?;
    }
    Ok(map)
}

fn snapshot_recursive(
    base: &Path,
    dir: &Path,
    map: &mut BTreeMap<PathBuf, Entry>,
) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let rel = path.strip_prefix(base).unwrap().to_path_buf();
        let meta = fs::metadata(&path)?;
        if meta.is_dir() {
            map.insert(rel.clone(), Entry::Dir);
            snapshot_recursive(base, &path, map)?;
        } else if meta.is_file() {
            map.insert(rel, Entry::File(fs::read(&path)?));
        }
    }
    Ok(())
}

fn copy_dir(src: &Path, dst: &Path) -> std::io::Result<()> {
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest = dst.join(entry.file_name());
        let meta = fs::metadata(&path)?;
        if meta.is_dir() {
            fs::create_dir_all(&dest)?;
            copy_dir(&path, &dest)?;
        } else if meta.is_file() {
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&path, &dest)?;
        }
    }
    Ok(())
}

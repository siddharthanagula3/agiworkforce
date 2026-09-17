use std::io::Read;
use std::process::{Command, Stdio};
use tempfile::tempdir;

#[cfg(unix)]
#[test]
fn a_reader_that_stops_early_ends_the_cli_quietly_with_the_sigpipe_status() {
    let home = tempdir().expect("home");
    let mut child = Command::new(env!("CARGO_BIN_EXE_agi"))
        .args(["completion", "zsh"])
        .env("HOME", home.path())
        .env_remove("AGIWORKFORCE_HOME")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn agi");

    let mut stdout = child.stdout.take().expect("stdout");
    let mut first = [0_u8; 16];
    stdout
        .read_exact(&mut first)
        .expect("the command starts writing");
    drop(stdout);

    let output = child.wait_with_output().expect("agi exits");
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert_eq!(output.status.code(), Some(141), "stderr: {stderr}");
    assert!(!stderr.contains("panicked"), "stderr: {stderr}");
}

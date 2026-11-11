pub async fn state() -> serde_json::Value {
    let origin = std::env::var("AGIWORKFORCE_API_BASE").unwrap();
    let output = std::process::Command::new("curl")
        .args(["--fail", "--silent", "--show-error", "--header"])
        .arg(format!(
            "Authorization: Bearer {}",
            std::env::var("AGIWORKFORCE_JWT").unwrap()
        ))
        .arg(format!("{origin}/fixture/state"))
        .output()
        .unwrap();
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).unwrap()
}
pub async fn control(body: serde_json::Value) {
    let origin = std::env::var("AGIWORKFORCE_API_BASE").unwrap();
    let output = std::process::Command::new("curl")
        .args(["--fail", "--silent", "--show-error", "--header"])
        .arg(format!(
            "Authorization: Bearer {}",
            std::env::var("AGIWORKFORCE_JWT").unwrap()
        ))
        .args([
            "--header",
            "Content-Type: application/json",
            "--data-binary",
        ])
        .arg(body.to_string())
        .arg(format!("{origin}/fixture/control"))
        .output()
        .unwrap();
    assert!(output.status.success());
}
pub async fn mode(value: &str) {
    control(serde_json::json!({ "uploadMode": value })).await;
}

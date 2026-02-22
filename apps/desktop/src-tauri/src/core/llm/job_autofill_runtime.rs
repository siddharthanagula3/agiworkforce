use anyhow::{anyhow, Result};
use base64::Engine;
use serde_json::Value;
use std::path::Path;

const JOB_AUTOFILL_RUNTIME_SCRIPT_BODY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../extension/src/jobAutofill.runtime.js"
));

fn prepare_runtime_script() -> Result<String> {
    let runtime_script = JOB_AUTOFILL_RUNTIME_SCRIPT_BODY.replacen(
        "export async function runPlatformJobAutofill",
        "async function runPlatformJobAutofill",
        1,
    );

    if runtime_script == JOB_AUTOFILL_RUNTIME_SCRIPT_BODY {
        return Err(anyhow!(
            "Failed to prepare job autofill runtime script (export signature not found)"
        ));
    }

    Ok(runtime_script)
}

pub fn build_job_autofill_eval_script(
    profile: &Value,
    options: &Value,
    timeout_ms: u64,
) -> Result<String> {
    if !profile.is_object() {
        return Err(anyhow!("Job autofill profile must be an object"));
    }

    if !options.is_object() {
        return Err(anyhow!("Job autofill options must be an object"));
    }

    let runtime_script = prepare_runtime_script()?;

    let profile_json = serde_json::to_string(profile)
        .map_err(|e| anyhow!("Failed to serialize profile: {}", e))?;
    let options_json = serde_json::to_string(options)
        .map_err(|e| anyhow!("Failed to serialize options: {}", e))?;

    let clamped_timeout_ms = timeout_ms.clamp(5_000, 300_000);

    Ok(format!(
        r#"(async () => {{
const profile = {};
const options = {};
const timeoutMs = {};
{}
return await runPlatformJobAutofill(profile || {{}}, options || {{}}, timeoutMs);
}})()"#,
        profile_json, options_json, clamped_timeout_ms, runtime_script
    ))
}

pub async fn encode_file_as_data_url(
    path: &str,
    default_file_name: &str,
) -> Result<(String, String)> {
    let file_bytes = tokio::fs::read(path)
        .await
        .map_err(|e| anyhow!("Failed to read file '{}': {}", path, e))?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let encoded = base64::engine::general_purpose::STANDARD.encode(file_bytes);
    let data_url = format!("data:{};base64,{}", mime.essence_str(), encoded);
    let file_name = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(default_file_name)
        .to_string();
    Ok((data_url, file_name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_build_job_autofill_eval_script_contains_runtime_call() {
        let script =
            build_job_autofill_eval_script(&json!({ "firstName": "Sid" }), &json!({}), 10_000)
                .expect("script should build");

        assert!(script.contains("runPlatformJobAutofill"));
        assert!(script.contains("const timeoutMs = 10000;"));
    }

    #[test]
    fn test_build_job_autofill_eval_script_requires_object_inputs() {
        let err = build_job_autofill_eval_script(&json!("bad"), &json!({}), 10_000)
            .expect_err("non-object profile should fail");
        assert!(err.to_string().contains("profile must be an object"));
    }
}

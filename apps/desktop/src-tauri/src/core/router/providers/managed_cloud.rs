use crate::core::router::{LLMRequest, LLMResponse};
use reqwest::Client;
use serde_json::Value;

pub async fn send_managed_request(
    req: &LLMRequest,
    token: &str,
    _provider: &str,
) -> Result<LLMResponse, String> {
    let client = Client::new();

    let url = "https://api.agiworkforce.com".to_string();

    let res = client
        .post(url)
        .bearer_auth(token)
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    match res.status().as_u16() {
        200 => {

            let body: Value = res.json().await.map_err(|e| e.to_string())?;



            let content = body["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string();

            let prompt_tokens = body["usage"]["prompt_tokens"].as_u64().map(|v| v as u32);
            let completion_tokens = body["usage"]["completion_tokens"].as_u64().map(|v| v as u32);
            let total_tokens = body["usage"]["total_tokens"].as_u64().map(|v| v as u32);





            Ok(LLMResponse {
                content,
                tokens: total_tokens,
                prompt_tokens,
                completion_tokens,
                cost: None,
                model: req.model.clone(),
                ..LLMResponse::default()
            })
        },
        402 => Err("Monthly credit limit reached. Please upgrade your plan (Pro/Max) to continue using Cloud models.".to_string()),
        401 => Err("Authentication failed. Please sign in again.".to_string()),
        _ => Err(format!("Cloud provider error: {}", res.status()))
    }
}

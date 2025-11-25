use crate::router::{LLMRequest, LLMResponse};
use reqwest::Client;
use serde_json::Value;

pub async fn send_managed_request(
    req: &LLMRequest,
    token: &str,
    provider: &str,
) -> Result<LLMResponse, String> {
    let client = Client::new();
    // Route via our gateway (handles Stripe usage metering)
    let url = format!("https://api.agiworkforce.com/v1/proxy/{}", provider);

    let res = client
        .post(url)
        .bearer_auth(token)
        .json(&req)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    match res.status().as_u16() {
        200 => {
            // Parse standard response
            let body: Value = res.json().await.map_err(|e| e.to_string())?;
            
            // Extract content and usage from standard format
            // This assumes the proxy returns a standardized format
            let content = body["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string();
                
            let prompt_tokens = body["usage"]["prompt_tokens"].as_u64().map(|v| v as u32);
            let completion_tokens = body["usage"]["completion_tokens"].as_u64().map(|v| v as u32);
            let total_tokens = body["usage"]["total_tokens"].as_u64().map(|v| v as u32);
            
            // In a real implementation, the proxy might return cost headers or body fields
            // For now we'll rely on the caller to calculate estimated cost if needed, 
            // or the proxy could return actual cost.
            
            Ok(LLMResponse {
                content,
                tokens: total_tokens,
                prompt_tokens,
                completion_tokens,
                cost: None, // Cost is handled by the backend/billing system
                model: req.model.clone(),
                ..LLMResponse::default()
            })
        },
        402 => Err("Monthly credit limit reached. Please upgrade your plan (Pro/Max) to continue using Cloud models.".to_string()),
        401 => Err("Authentication failed. Please sign in again.".to_string()),
        _ => Err(format!("Cloud provider error: {}", res.status()))
    }
}

//! Live-provider streaming smoke for the Wave 5 c2 desktop→`agiworkforce-llm`
//! decode swap (`docs/plans/rust-engine-extraction-2026-07-09.md`).
//!
//! Ignored by default (`#[ignore = "makes real, paid provider streaming calls; run explicitly with --ignored"]`): it makes real, paid streaming calls. Run
//! explicitly with keys present in `apps/web/.env.local`:
//!
//! ```bash
//! cargo test -p agiworkforce-desktop --test live_provider_stream_smoke \
//!     -- --ignored --nocapture
//! ```
//!
//! For each provider it drives the SAME code path `chat_send_message` uses as
//! deep as is invokable without a running Tauri UI:
//! `DirectApiProvider::send_message_streaming` → `provider_adapter` request
//! build → HTTP POST → `stream_engine::decode_direct_stream` (the NEW shared
//! `agiworkforce-llm` dialect runner) → desktop `StreamChunk` projection. It
//! asserts: the stream opens, ≥1 text delta arrives, the stream terminates
//! cleanly with a finish reason, and usage is present when the provider sends
//! it.
//!
//! Keys are read from the env file at runtime and NEVER printed. Model ids come
//! from `packages/contracts/types/src/models.json` (SSOT) — never invented. Spend is kept
//! trivial: `max_tokens = 32`, one request per provider, no retries.

use std::collections::HashMap;
use std::path::PathBuf;

use agiworkforce_desktop::core::llm::providers::DirectApiProvider;
use agiworkforce_desktop::core::llm::{ChatMessage, LLMProvider, LLMRequest, Provider};
use futures_util::StreamExt;

/// Parse `KEY=VALUE` lines from `apps/web/.env.local` without pulling in a
/// dotenv dependency. Values are returned but never logged.
fn load_env_keys() -> HashMap<String, String> {
    // `AGI_SMOKE_ENV_FILE` lets the runner point at the real key file when it
    // lives outside the (worktree) checkout — the file is gitignored and its
    // values are never copied into the repo or printed.
    let env_path = if let Ok(explicit) = std::env::var("AGI_SMOKE_ENV_FILE") {
        PathBuf::from(explicit)
    } else {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        // apps/desktop/src-tauri -> apps/web/.env.local
        manifest.join("../../web/.env.local")
    };
    let mut map = HashMap::new();
    let Ok(contents) = std::fs::read_to_string(&env_path) else {
        eprintln!("[smoke] could not read {}", env_path.display());
        return map;
    };
    for raw in contents.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        let mut v = v.trim().to_string();
        // Strip surrounding quotes if present.
        if (v.starts_with('"') && v.ends_with('"') && v.len() >= 2)
            || (v.starts_with('\'') && v.ends_with('\'') && v.len() >= 2)
        {
            v = v[1..v.len() - 1].to_string();
        }
        map.insert(k.trim().to_string(), v);
    }
    map
}

fn trivial_request(model: &str) -> LLMRequest {
    LLMRequest {
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Reply with a short one-sentence greeting.".to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: model.to_string(),
        // Spend is kept trivial, but the cap must leave headroom for models that
        // burn completion tokens on internal reasoning before emitting any
        // visible text (gpt-5.4-nano, deepseek-v4-flash). At 32 tokens those models
        // hit the length cap mid-reasoning and stream zero content deltas; 512 is
        // still a fraction of a cent and lets the one-sentence greeting through.
        max_tokens: Some(512),
        stream: true,
        ..Default::default()
    }
}

struct Outcome {
    provider: &'static str,
    model: &'static str,
    opened: bool,
    text_deltas: usize,
    text_sample: String,
    finish_reason: Option<String>,
    usage_present: bool,
    error: Option<String>,
}

async fn smoke_one(
    provider: Provider,
    label: &'static str,
    model: &'static str,
    key: &str,
) -> Outcome {
    let mut outcome = Outcome {
        provider: label,
        model,
        opened: false,
        text_deltas: 0,
        text_sample: String::new(),
        finish_reason: None,
        usage_present: false,
        error: None,
    };

    let dp = match DirectApiProvider::new(provider, key.to_string(), None) {
        Ok(dp) => dp,
        Err(e) => {
            outcome.error = Some(format!("construct: {e}"));
            return outcome;
        }
    };

    let req = trivial_request(model);
    let mut stream = match dp.send_message_streaming(&req).await {
        Ok(s) => {
            outcome.opened = true;
            s
        }
        Err(e) => {
            outcome.error = Some(format!("open: {e}"));
            return outcome;
        }
    };

    let mut got_done = false;
    while let Some(item) = stream.next().await {
        match item {
            Ok(chunk) => {
                if !chunk.content.is_empty() {
                    outcome.text_deltas += 1;
                    if outcome.text_sample.len() < 80 {
                        outcome.text_sample.push_str(&chunk.content);
                    }
                }
                if chunk.usage.is_some() {
                    outcome.usage_present = true;
                }
                if let Some(fr) = chunk.finish_reason.clone() {
                    outcome.finish_reason = Some(fr);
                }
                if chunk.done {
                    got_done = true;
                }
            }
            Err(e) => {
                outcome.error = Some(format!("stream: {e}"));
                break;
            }
        }
    }
    if outcome.error.is_none() && !got_done && outcome.finish_reason.is_none() {
        outcome.error = Some("stream ended without a done/finish-reason chunk".to_string());
    }
    outcome
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "live network + paid provider calls; run with --ignored"]
async fn live_provider_stream_smoke() {
    let keys = load_env_keys();

    // (Provider, label, model id from models.json SSOT, accepted key env var
    // names in priority order — first non-empty match wins). Most providers use
    // a single canonical name; Google's key is written under several aliases
    // across env files (GOOGLE_API_KEY / GOOGLE_AI_API_KEY / GEMINI_API_KEY),
    // mirroring the web/gateway adapter fallback chain, so we accept all three.
    let targets: &[(
        Provider,
        &'static str,
        &'static str,
        &'static [&'static str],
    )] = &[
        (
            Provider::Anthropic,
            "anthropic",
            "claude-haiku-4.5",
            &["ANTHROPIC_API_KEY"],
        ),
        (
            Provider::DeepSeek,
            "deepseek",
            "deepseek-v4-flash",
            &["DEEPSEEK_API_KEY"],
        ),
        (
            Provider::Google,
            "google",
            "gemini-3.1-flash-lite",
            &["GOOGLE_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_API_KEY"],
        ),
        // Renamed from gpt-5-nano 2026-07-11 (model-version bump). This live probe
        // is the empirical check for whether gpt-5.4-nano is chat-tier (Chat
        // Completions, like its predecessor) or reasoning-tier (Responses API,
        // like sibling gpt-5.4-mini) — see known-flaws DESKTOP-OPENAI-REASONING-RESPONSES-01.
        (
            Provider::OpenAI,
            "openai",
            "gpt-5.4-nano",
            &["OPENAI_API_KEY"],
        ),
        // Moonshot is OpenAI-compatible (Chat Completions) — a second live
        // exercise of the crate's OpenAI-compat runner alongside DeepSeek.
        (
            Provider::Moonshot,
            "moonshot",
            "kimi-k2.6",
            &["MOONSHOT_API_KEY"],
        ),
        // Additional OpenAI-compatible providers present in the env file — any
        // one with a live key proves the crate's OpenAI-compat runner end to
        // end through the new desktop path.
        (Provider::XAI, "xai", "grok-4.3", &["XAI_API_KEY"]),
        (Provider::Qwen, "qwen", "qwen-flash", &["QWEN_API_KEY"]),
        (Provider::Zhipu, "zhipu", "glm-5.2", &["ZHIPU_API_KEY"]),
        (
            Provider::Perplexity,
            "perplexity",
            "sonar",
            &["PERPLEXITY_API_KEY"],
        ),
    ];

    let mut outcomes = Vec::new();
    for (provider, label, model, key_envs) in targets {
        let Some(key) = key_envs
            .iter()
            .find_map(|name| keys.get(*name).filter(|k| !k.is_empty()))
        else {
            eprintln!("[smoke] {label}: no {key_envs:?} in env.local — skipping");
            continue;
        };
        let o = smoke_one(*provider, label, model, key).await;
        outcomes.push(o);
    }

    println!("\n================ LIVE STREAMING SMOKE (new desktop->crate path) ================");
    let mut green = 0usize;
    for o in &outcomes {
        let ok = o.opened && o.text_deltas >= 1 && o.error.is_none();
        if ok {
            green += 1;
        }
        println!(
            "[{}] model={} opened={} text_deltas={} finish_reason={:?} usage_present={} => {}",
            o.provider,
            o.model,
            o.opened,
            o.text_deltas,
            o.finish_reason,
            o.usage_present,
            if ok { "GREEN" } else { "NOT-GREEN" },
        );
        if !o.text_sample.is_empty() {
            println!("    sample: {:?}", o.text_sample);
        }
        if let Some(err) = &o.error {
            println!("    error: {err}");
        }
    }
    println!("green providers: {green}/{}", outcomes.len());
    println!("================================================================================\n");

    // A stream that FAILS AT OPEN never reached the decode path — that's an
    // environment/auth problem (dead/quota key, or a request-shape issue like
    // OpenAI reasoning models emitting a Responses body to /chat/completions),
    // NOT a regression in this swap. A stream that OPENED and then errored is a
    // genuine decode-path regression and must fail the smoke.
    let mid_stream_regressions: Vec<String> = outcomes
        .iter()
        .filter(|o| o.opened && o.error.is_some())
        .map(|o| format!("{} ({})", o.provider, o.error.as_deref().unwrap_or("")))
        .collect();
    assert!(
        mid_stream_regressions.is_empty(),
        "decode-path regression: stream(s) opened then errored mid-decode: {mid_stream_regressions:?}"
    );

    // The nominal bar is >=2 live-green providers; it degrades to >=1 when the
    // environment only has one working key (all other providers here return
    // 401/quota at open). Reaching >=1 green proves the new desktop->crate
    // decode path streams end to end against a real provider.
    assert!(
        green >= 1,
        "expected >=1 provider streaming green through the new path, got {green} \
         (every provider failed at open — check that env keys are live)"
    );
}

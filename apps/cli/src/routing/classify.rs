//! Per-turn routing-task classifier for the interactive CLI.
//!
//! Faithful Rust port of the CANONICAL heuristic classifier in
//! `packages/ai/routing/src/classify.ts` (`classifyTaskLocally`) — the same
//! taxonomy VS Code runs through `apps/extension-vscode/src/integrations/
//! routingTask.ts` for every Auto turn. Heuristic changes must land in the TS
//! canonical first and be mirrored here; do not fork the taxonomy.
//!
//! Scope mirrors the VS Code adapter exactly: classify only the CURRENT
//! presentation input (no history sum, no sticky-pivot) — conversation
//! continuity stays with the registry resolver via `current_model_key` +
//! `previous_task_type` (`model_catalog::resolve_auto_model_with_context`).
//! The `computer-use` branch is intentionally absent for the same reason it
//! is unreachable from VS Code: neither surface produces a `screenshot`
//! attachment type, only plain images.

use agiworkforce_model_registry::RoutingTaskType;
use agiworkforce_protocol::developer_session::DeveloperRoutingTaskType;
use once_cell::sync::Lazy;
use regex::Regex;

// Hoisted patterns, compiled once — mirrors the TS module-scoped regexes.
// Case sensitivity matches the TS source exactly (RE_CODING is deliberately
// case-sensitive there; everything else is case-insensitive).

/// Slash-prefixed image generation commands (`/image`, `/imagine`, …).
static RE_IMAGE_SLASH: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^/(image|imagine|draw|generate)\b").expect("valid regex"));

/// Natural-language image generation phrases ("make an image of …").
static RE_IMAGE_PHRASE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(generate|create|make|draw)\s+(an?\s+)?(image|picture|photo|illustration|logo|mockup|wireframe)",
    )
    .expect("valid regex")
});

/// Code fence used to wrap code blocks in markdown.
static RE_CODE_FENCE: Lazy<Regex> = Lazy::new(|| Regex::new("```").expect("valid regex"));

/// Coding signals: language keywords, SQL, common runtime errors.
/// Case-SENSITIVE, matching the canonical TS `RE_CODING`.
static RE_CODING: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"\bfunction\b|\bclass\b|\bSELECT\b|\bdef\b|\bimport\b|stack ?trace|TypeError|undefined|NullPointerException",
    )
    .expect("valid regex")
});

/// Reasoning-mode action verbs (math / proof / formal derivation).
static RE_REASONING_VERB: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(prove|derive|solve|calculate|theorem|integral|differential)\b")
        .expect("valid regex")
});

/// Inline arithmetic expression (`12 + 7`, `3*4=12`, …).
static RE_REASONING_MATH: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\b\d+\s*[+\-*/=]\s*\d").expect("valid regex"));

/// Explicit multi-agent, delegation, and tool-discovery requests.
static RE_AGENTIC: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(tool discovery|discover (the )?(best |available )?tools?|multi-agent|parallel agents?|autonomous agents?|subagents?)\b|\b(use|run|coordinate|orchestrate|delegate to|spawn)\s+(multiple\s+|parallel\s+|autonomous\s+)?(agents?|subagents?|tools?)\b",
    )
    .expect("valid regex")
});

/// Recency / web-search signals — anything that requires fresh info.
static RE_RESEARCH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(latest|today|2026|current|recent news|search the web|cite sources)\b")
        .expect("valid regex")
});

/// Creative-writing imperatives — long-form prose generation.
/// Whitespace runs are bounded, mirroring the TS linear-time fix (alert-448).
static RE_CREATIVE_WRITING: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(write|draft|compose)[ \t]{1,32}(a|an|the)?[ \t]{0,32}(story|poem|email|essay|tweet|blog)")
        .expect("valid regex")
});

/// Neutral chars-per-token estimate used at classification time — the actual
/// provider is not yet known, matching the TS `sumTokens` default path.
const TOKENS_PER_CHAR_DEFAULT: f64 = 1.0 / 3.5;

/// Long-context threshold in estimated tokens (canonical spec value).
const LONG_CONTEXT_TOKENS: usize = 50_000;

fn estimate_tokens_default(text: &str) -> usize {
    (text.len() as f64 * TOKENS_PER_CHAR_DEFAULT).ceil() as usize
}

/// Classify the outgoing interactive turn into the canonical routing-task
/// taxonomy. Priority-ordered; the first heuristic to fire wins.
///
/// `has_image_attachment` covers the CLI's `-f image.png` / pasted-image
/// blocks — any image attachment classifies the turn as multimodal, exactly
/// like an `image/*` MIME does in the TS canonical.
pub fn classify_turn_task(message: &str, has_image_attachment: bool) -> RoutingTaskType {
    // 1. Image generation — slash command or natural-language phrase.
    if RE_IMAGE_SLASH.is_match(message) || RE_IMAGE_PHRASE.is_match(message) {
        return RoutingTaskType::ImageGeneration;
    }

    // 2. (computer-use) — unreachable from this surface; see module doc.

    // 3. Multimodal — any image attachment, even with an empty message body.
    if has_image_attachment {
        return RoutingTaskType::Multimodal;
    }

    // 4. Long context — single-input token guard (history continuity is the
    //    resolver's job on this surface, mirroring the VS Code adapter).
    if estimate_tokens_default(message) > LONG_CONTEXT_TOKENS {
        return RoutingTaskType::LongContext;
    }

    // 5. Coding — code fences are a stronger signal than keyword soup;
    //    either is enough.
    if RE_CODE_FENCE.is_match(message) || RE_CODING.is_match(message) {
        return RoutingTaskType::Coding;
    }

    // 6. Reasoning.
    if RE_REASONING_VERB.is_match(message) || RE_REASONING_MATH.is_match(message) {
        return RoutingTaskType::Reasoning;
    }

    // 7. Agentic orchestration / tool discovery.
    if RE_AGENTIC.is_match(message) {
        return RoutingTaskType::Agentic;
    }

    // 8. Research / recency.
    if RE_RESEARCH.is_match(message) {
        return RoutingTaskType::Research;
    }

    // 9. Creative writing.
    if RE_CREATIVE_WRITING.is_match(message) {
        return RoutingTaskType::CreativeWriting;
    }

    // 10. Simple chat — cheap length check before the word split.
    if message.len() < 80 && message.split_whitespace().count() < 15 {
        return RoutingTaskType::SimpleChat;
    }

    // 11. General fallback.
    RoutingTaskType::General
}

/// Registry → protocol task-type mapping, for persisting the classified turn
/// into `ManagedSessionAutoRouting` (the developer-session continuity state).
pub fn developer_task_type(task_type: RoutingTaskType) -> DeveloperRoutingTaskType {
    match task_type {
        RoutingTaskType::SimpleChat => DeveloperRoutingTaskType::SimpleChat,
        RoutingTaskType::General => DeveloperRoutingTaskType::General,
        RoutingTaskType::Coding => DeveloperRoutingTaskType::Coding,
        RoutingTaskType::Reasoning => DeveloperRoutingTaskType::Reasoning,
        RoutingTaskType::CreativeWriting => DeveloperRoutingTaskType::CreativeWriting,
        RoutingTaskType::Multimodal => DeveloperRoutingTaskType::Multimodal,
        RoutingTaskType::LongContext => DeveloperRoutingTaskType::LongContext,
        RoutingTaskType::Research => DeveloperRoutingTaskType::Research,
        RoutingTaskType::Agentic => DeveloperRoutingTaskType::Agentic,
        RoutingTaskType::ComputerUse => DeveloperRoutingTaskType::ComputerUse,
        RoutingTaskType::ImageGeneration => DeveloperRoutingTaskType::ImageGeneration,
    }
}

/// Protocol → registry task-type mapping (inverse of `developer_task_type`),
/// for feeding persisted previous-turn continuity back into the resolver.
pub fn registry_task_type(task_type: DeveloperRoutingTaskType) -> RoutingTaskType {
    match task_type {
        DeveloperRoutingTaskType::SimpleChat => RoutingTaskType::SimpleChat,
        DeveloperRoutingTaskType::General => RoutingTaskType::General,
        DeveloperRoutingTaskType::Coding => RoutingTaskType::Coding,
        DeveloperRoutingTaskType::Reasoning => RoutingTaskType::Reasoning,
        DeveloperRoutingTaskType::CreativeWriting => RoutingTaskType::CreativeWriting,
        DeveloperRoutingTaskType::Multimodal => RoutingTaskType::Multimodal,
        DeveloperRoutingTaskType::LongContext => RoutingTaskType::LongContext,
        DeveloperRoutingTaskType::Research => RoutingTaskType::Research,
        DeveloperRoutingTaskType::Agentic => RoutingTaskType::Agentic,
        DeveloperRoutingTaskType::ComputerUse => RoutingTaskType::ComputerUse,
        DeveloperRoutingTaskType::ImageGeneration => RoutingTaskType::ImageGeneration,
    }
}

/// Auto-routing continuity seed built by the `--auto` launch path: the
/// resolved launch state plus the account tier, installed on the interactive
/// session so every subsequent turn re-classifies and re-resolves with
/// continuity (`AgentSession::re_resolve_auto_route_for_turn`).
pub struct AutoRouteSeed {
    pub state: crate::runtime::session::ManagedSessionAutoRouting,
    pub tier: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    // Fixtures mirror packages/ai/routing/src/__tests__ expectations for the
    // shared priority ladder — parity with the TS canonical, not new taxonomy.

    #[test]
    fn untyped_chat_turns_are_not_hardcoded_to_coding() {
        // The pre-fix interactive path pinned every untyped turn to Coding.
        assert_eq!(
            classify_turn_task("what's the weather like?", false),
            RoutingTaskType::SimpleChat
        );
        // Empty input (interactive launch before any prompt) is simple chat,
        // not coding.
        assert_eq!(classify_turn_task("", false), RoutingTaskType::SimpleChat);
        assert_ne!(
            classify_turn_task("tell me about the roman empire and its long decline in detail with sources omitted", false),
            RoutingTaskType::Coding
        );
    }

    #[test]
    fn coding_signals_still_classify_as_coding() {
        assert_eq!(
            classify_turn_task("why does this function throw a TypeError?", false),
            RoutingTaskType::Coding
        );
        assert_eq!(
            classify_turn_task("```js\nconsole.log(1)\n```", false),
            RoutingTaskType::Coding
        );
    }

    #[test]
    fn priority_ladder_matches_the_canonical_taxonomy() {
        assert_eq!(
            classify_turn_task("/imagine a sunset over the ocean", false),
            RoutingTaskType::ImageGeneration
        );
        assert_eq!(
            classify_turn_task("draw a picture of a cat", false),
            RoutingTaskType::ImageGeneration
        );
        // Attachments outrank text-only heuristics.
        assert_eq!(
            classify_turn_task("why does this function throw?", true),
            RoutingTaskType::Multimodal
        );
        assert_eq!(
            classify_turn_task("solve the integral of x squared", false),
            RoutingTaskType::Reasoning
        );
        assert_eq!(
            classify_turn_task("spawn parallel agents to explore the repo", false),
            RoutingTaskType::Agentic
        );
        assert_eq!(
            classify_turn_task("search the web for the latest release notes", false),
            RoutingTaskType::Research
        );
        assert_eq!(
            classify_turn_task("write a story about a dragon", false),
            RoutingTaskType::CreativeWriting
        );
        // Oversized single input trips the long-context guard.
        let huge = "a".repeat(200_000);
        assert_eq!(classify_turn_task(&huge, false), RoutingTaskType::LongContext);
        // Long prose without signals falls through to general.
        let prose = "please summarize the following meeting notes and highlight decisions, \
                     owners, risks, and follow-ups in a structured way for the whole team"
            .to_string();
        assert_eq!(classify_turn_task(&prose, false), RoutingTaskType::General);
    }

    #[test]
    fn task_type_mappings_round_trip() {
        for task in [
            RoutingTaskType::SimpleChat,
            RoutingTaskType::General,
            RoutingTaskType::Coding,
            RoutingTaskType::Reasoning,
            RoutingTaskType::CreativeWriting,
            RoutingTaskType::Multimodal,
            RoutingTaskType::LongContext,
            RoutingTaskType::Research,
            RoutingTaskType::Agentic,
            RoutingTaskType::ComputerUse,
            RoutingTaskType::ImageGeneration,
        ] {
            assert_eq!(registry_task_type(developer_task_type(task)), task);
        }
    }
}

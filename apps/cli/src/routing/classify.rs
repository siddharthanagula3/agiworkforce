//! Per-turn routing-task classifier for the interactive CLI.
//!
//! Faithful Rust port of the CANONICAL heuristic classifier in
//! `packages/ai/routing/src/classify.ts` (`classifyTaskLocally`), the same
//! taxonomy VS Code runs through `apps/extension-vscode/src/integrations/
//! routingTask.ts` for every Auto turn. Heuristic changes must land in the TS
//! canonical first and be mirrored here; do not fork the taxonomy. The mirror
//! is not left to reviewer discipline: `canonical_classifier_patterns_match`
//! re-reads the canonical source at test time and fails on any drift.
//!
//! Scope mirrors the VS Code adapter exactly: classify only the CURRENT
//! presentation input (no history sum, no sticky-pivot), conversation
//! continuity stays with the registry resolver via `current_model_key` +
//! `previous_task_type` (`model_catalog::resolve_auto_model_with_context`).
//! The `computer-use` branch is intentionally absent for the same reason it
//! is unreachable from VS Code: neither surface produces a `screenshot`
//! attachment type, only plain images.

use agiworkforce_model_registry::RoutingTaskType;
use agiworkforce_protocol::developer_session::DeveloperRoutingTaskType;
use once_cell::sync::Lazy;
use regex::Regex;

// Hoisted patterns, compiled once, mirrors the TS module-scoped regexes.
// Case sensitivity matches the TS source exactly (RE_CODING is deliberately
// case-sensitive there; everything else is case-insensitive).

/// Slash-prefixed image generation commands (`/image`, `/imagine`, …).
static RE_IMAGE_SLASH: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)^/(image|imagine|draw|generate)\b").expect("valid regex"));

/// Natural-language image generation phrases ("make an image of …").
static RE_IMAGE_PHRASE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"(?i)\b(generate|create|make|draw)\s+(me\s+)?(an?\s+|some\s+)?(\w+\s+){0,2}(image|picture|photo|photograph|illustration|logo|mockup|wireframe|artwork|drawing|painting|sketch|portrait|poster|banner|avatar|thumbnail|wallpaper)\b",
    )
    .expect("valid regex")
});

/// Code fence used to wrap code blocks in markdown.
static RE_CODE_FENCE: Lazy<Regex> = Lazy::new(|| Regex::new("```").expect("valid regex"));

/// Strong coding signals: language keywords, SQL, common runtime errors.
/// Case-SENSITIVE, matching the canonical TS `RE_CODING`.
static RE_CODING: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\bfunction\b|\bSELECT\b|\bdef\b|stack ?trace|TypeError|NullPointerException")
        .expect("valid regex")
});

/// Weak coding signals, words that are also ordinary English. The canonical
/// scores them below every other heuristic, so they fire last on this surface
/// too rather than pulling prose onto a coding model.
static RE_CODING_WEAK: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"\bclass\b|\bimport\b|undefined").expect("valid regex"));

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

/// Recency / web-search signals, anything that requires fresh info.
static RE_RESEARCH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(latest|today|2026|current|recent news|search the web|cite sources)\b")
        .expect("valid regex")
});

/// Creative-writing imperatives, long-form prose generation.
/// Whitespace runs are bounded, mirroring the TS linear-time fix (alert-448).
static RE_CREATIVE_WRITING: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)\b(write|draft|compose)[ \t]{1,32}(a|an|the)?[ \t]{0,32}(story|poem|email|essay|tweet|blog)")
        .expect("valid regex")
});

/// Neutral chars-per-token estimate used at classification time, the actual
/// provider is not yet known, matching the TS `sumTokens` default path.
const TOKENS_PER_CHAR_DEFAULT: f64 = 1.0 / CHARS_PER_TOKEN_DEFAULT;

/// Long-context threshold in estimated tokens (canonical spec value).
const LONG_CONTEXT_TOKENS: usize = 50_000;

/// Chars-per-token divisor behind `TOKENS_PER_CHAR_DEFAULT`, named so the
/// canonical-parity test can compare a number instead of a source string.
const CHARS_PER_TOKEN_DEFAULT: f64 = 3.5;

/// Simple-chat bounds, mirroring the canonical `message.length < 80 &&
/// message.split(RE_WHITESPACE).length < 15`. Named for the parity test.
const SIMPLE_CHAT_MAX_CHARS: usize = 80;
const SIMPLE_CHAT_MAX_WORDS: usize = 15;

fn estimate_tokens_default(text: &str) -> usize {
    (text.len() as f64 * TOKENS_PER_CHAR_DEFAULT).ceil() as usize
}

/// Classify the outgoing interactive turn into the canonical routing-task
/// taxonomy. Priority-ordered; the first heuristic to fire wins.
///
/// `has_image_attachment` covers the CLI's `-f image.png` / pasted-image
/// blocks, any image attachment classifies the turn as multimodal, exactly
/// like an `image/*` MIME does in the TS canonical.
pub fn classify_turn_task(message: &str, has_image_attachment: bool) -> RoutingTaskType {
    // 1. Image generation, slash command or natural-language phrase.
    if RE_IMAGE_SLASH.is_match(message) || RE_IMAGE_PHRASE.is_match(message) {
        return RoutingTaskType::ImageGeneration;
    }

    // 2. (computer-use), unreachable from this surface; see module doc.

    // 3. Multimodal, any image attachment, even with an empty message body.
    if has_image_attachment {
        return RoutingTaskType::Multimodal;
    }

    // 4. Long context, single-input token guard (history continuity is the
    //    resolver's job on this surface, mirroring the VS Code adapter).
    if estimate_tokens_default(message) > LONG_CONTEXT_TOKENS {
        return RoutingTaskType::LongContext;
    }

    // 5. Coding, code fences are a stronger signal than keyword soup;
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

    // 10. Coding, weak signals only, after every stronger heuristic.
    if RE_CODING_WEAK.is_match(message) {
        return RoutingTaskType::Coding;
    }

    // 11. Simple chat, cheap length check before the word split.
    if message.len() < SIMPLE_CHAT_MAX_CHARS
        && message.split_whitespace().count() < SIMPLE_CHAT_MAX_WORDS
    {
        return RoutingTaskType::SimpleChat;
    }

    // 12. General fallback.
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
    // shared priority ladder, parity with the TS canonical, not new taxonomy.

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
    fn weak_coding_words_lose_to_every_stronger_heuristic() {
        // "class", "import" and "undefined" are ordinary English, so they only
        // pick coding once nothing above them on the ladder fires.
        assert_eq!(
            classify_turn_task(
                "the import tariffs are undefined for that class of goods",
                false
            ),
            RoutingTaskType::Coding
        );
        assert_eq!(
            classify_turn_task("write a poem about the class clown", false),
            RoutingTaskType::CreativeWriting
        );
        assert_eq!(
            classify_turn_task("search the web for the latest import rules", false),
            RoutingTaskType::Research
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
        assert_eq!(
            classify_turn_task(&huge, false),
            RoutingTaskType::LongContext
        );
        // Long prose without signals falls through to general.
        let prose = "please summarize the following meeting notes and highlight decisions, \
                     owners, risks, and follow-ups in a structured way for the whole team"
            .to_string();
        assert_eq!(classify_turn_task(&prose, false), RoutingTaskType::General);
    }

    /// Canonical classifier source, read at test time. The port is only
    /// faithful for as long as this file agrees with it, so the agreement is
    /// checked mechanically instead of being asserted in a comment.
    fn canonical_source() -> String {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../packages/ai/routing/src/classify.ts");
        std::fs::read_to_string(&path).unwrap_or_else(|error| {
            panic!(
                "canonical classifier unreadable at {}: {error}",
                path.display()
            )
        })
    }

    /// Extract `const <name> = /pattern/flags;` from the canonical source and
    /// return it as a Rust `regex` pattern.
    ///
    /// Hand-rolled rather than regex-matched because the canonical literals
    /// contain both escaped slashes (`RE_IMAGE_SLASH`) and an unescaped slash
    /// inside a character class (`RE_REASONING_MATH`), which no non-greedy
    /// `/(.*?)/` can delimit correctly.
    fn canonical_pattern(source: &str, name: &str) -> String {
        let declaration = format!("const {name} =");
        let start = source
            .find(&declaration)
            .unwrap_or_else(|| panic!("canonical classifier no longer declares {name}"))
            + declaration.len();
        let rest = &source[start..];
        let open = rest
            .find('/')
            .unwrap_or_else(|| panic!("{name} is no longer a regex literal"));
        let body: Vec<char> = rest[open + 1..].chars().collect();

        let mut pattern = String::new();
        let mut in_class = false;
        let mut index = 0;
        let close = loop {
            let Some(&character) = body.get(index) else {
                panic!("{name} has an unterminated regex literal");
            };
            match character {
                // A JS literal must escape `/`; a Rust pattern must not.
                '\\' => {
                    let &next = body.get(index + 1).expect("escape needs a character");
                    if next != '/' {
                        pattern.push('\\');
                    }
                    pattern.push(next);
                    index += 2;
                }
                '[' => {
                    in_class = true;
                    pattern.push(character);
                    index += 1;
                }
                ']' => {
                    in_class = false;
                    pattern.push(character);
                    index += 1;
                }
                '/' if !in_class => break index,
                _ => {
                    pattern.push(character);
                    index += 1;
                }
            }
        };

        let flags: String = body[close + 1..]
            .iter()
            .take_while(|character| character.is_ascii_alphabetic())
            .collect();
        if flags.contains('i') {
            return format!("(?i){pattern}");
        }
        pattern
    }

    /// Read the integer following `marker` in the canonical source, tolerating
    /// JavaScript numeric separators (`50_000`).
    fn canonical_number(source: &str, marker: &str) -> String {
        let start = source
            .find(marker)
            .unwrap_or_else(|| panic!("canonical classifier no longer contains `{marker}`"))
            + marker.len();
        source[start..]
            .chars()
            .take_while(|character| character.is_ascii_digit() || *character == '_')
            .filter(|character| *character != '_')
            .collect()
    }

    /// Read the decimal following `marker` in the canonical source.
    fn canonical_decimal(source: &str, marker: &str) -> f64 {
        let start = source
            .find(marker)
            .unwrap_or_else(|| panic!("canonical classifier no longer contains `{marker}`"))
            + marker.len();
        let digits: String = source[start..]
            .chars()
            .take_while(|character| character.is_ascii_digit() || *character == '.')
            .collect();
        digits
            .parse()
            .unwrap_or_else(|error| panic!("`{marker}` is not followed by a number: {error}"))
    }

    #[test]
    fn canonical_classifier_patterns_match() {
        let source = canonical_source();

        // `RE_COMPUTER_USE` and `RE_WHITESPACE` are deliberately unported (see
        // the module doc: no CLI attachment carries the `screenshot` type, and
        // the word split uses `split_whitespace`), so they are not compared.
        for (name, ported) in [
            ("RE_IMAGE_SLASH", &*RE_IMAGE_SLASH),
            ("RE_IMAGE_PHRASE", &*RE_IMAGE_PHRASE),
            ("RE_CODE_FENCE", &*RE_CODE_FENCE),
            ("RE_CODING", &*RE_CODING),
            ("RE_CODING_WEAK", &*RE_CODING_WEAK),
            ("RE_REASONING_VERB", &*RE_REASONING_VERB),
            ("RE_REASONING_MATH", &*RE_REASONING_MATH),
            ("RE_AGENTIC", &*RE_AGENTIC),
            ("RE_RESEARCH", &*RE_RESEARCH),
            ("RE_CREATIVE_WRITING", &*RE_CREATIVE_WRITING),
        ] {
            assert_eq!(
                ported.as_str(),
                canonical_pattern(&source, name),
                "{name} has drifted from packages/ai/routing/src/classify.ts"
            );
        }
    }

    /// Every threshold is compared against the RUST constant, never against a
    /// literal repeated in the test: an edit on either side must fail here, or
    /// the parity check only guards one direction.
    #[test]
    fn canonical_classifier_thresholds_match() {
        let source = canonical_source();

        assert_eq!(
            canonical_decimal(&source, "const TOKENS_PER_CHAR_DEFAULT = 1 / "),
            CHARS_PER_TOKEN_DEFAULT,
            "the chars-per-token baseline differs between this port and packages/ai/routing/src/classify.ts"
        );
        assert_eq!(
            canonical_number(&source, "cumulativeTokens > "),
            LONG_CONTEXT_TOKENS.to_string(),
            "the long-context threshold differs between this port and packages/ai/routing/src/classify.ts"
        );
        assert_eq!(
            canonical_number(&source, "message.length < "),
            SIMPLE_CHAT_MAX_CHARS.to_string(),
            "the simple-chat character bound differs between this port and packages/ai/routing/src/classify.ts"
        );
        assert_eq!(
            canonical_number(&source, "message.split(RE_WHITESPACE).length < "),
            SIMPLE_CHAT_MAX_WORDS.to_string(),
            "the simple-chat word bound differs between this port and packages/ai/routing/src/classify.ts"
        );
    }

    #[test]
    fn image_phrase_covers_the_canonical_medium_nouns() {
        // The narrower pre-sync pattern required the medium noun to follow the
        // article immediately, so these fell through to a text model and came
        // back as prose describing a picture that was never drawn.
        assert_eq!(
            classify_turn_task("draw a portrait of a fox", false),
            RoutingTaskType::ImageGeneration
        );
        assert_eq!(
            classify_turn_task("make me a watercolor painting of the harbor", false),
            RoutingTaskType::ImageGeneration
        );
        // The noun list is still the whole guard: a generation verb alone must
        // not route a text request to an image model.
        assert_eq!(
            classify_turn_task("generate the quarterly report", false),
            RoutingTaskType::SimpleChat
        );
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

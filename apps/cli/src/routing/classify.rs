//! Per-turn routing-task classifier for the interactive CLI.
//!
//! Mirrors `packages/ai/routing/src/classify.ts`, its output-intent owner,
//! and the search package's request-purpose signals. Source parity tests
//! check the mirrored patterns and phrase catalogs against their owners.
//! Only the current presentation input is classified; the registry resolver
//! owns previous-turn continuity. CLI image attachments are not screenshots.

use agiworkforce_model_registry::RoutingTaskType;
use agiworkforce_protocol::developer_session::DeveloperRoutingTaskType;
use once_cell::sync::Lazy;
use regex::Regex;

// Hoisted patterns, compiled once, mirrors the TS module-scoped regexes.
// Case sensitivity matches the TS source exactly (RE_CODING is deliberately
// case-sensitive there; everything else is case-insensitive).

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

macro_rules! intent_pattern {
    ($name:ident, $pattern:literal) => {
        static $name: Lazy<Regex> = Lazy::new(|| Regex::new($pattern).expect("valid regex"));
    };
}

intent_pattern!(REQUEST_LABEL, r###"^[\p{Lu}\d _-]{2,40}:\s*"###);
intent_pattern!(
    REQUEST_PREFIX,
    r###"(?i)^(?:(?:please|kindly|just|now|hey|hi|okay|ok|visually)[\s,!.:]+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?"###
);
intent_pattern!(
    DESIRED_OUTPUT_PREFIX,
    r###"(?i)^(?:i\s+(?:need|want)|i['’]d\s+like)\s+(?:you\s+to\s+)?"###
);
intent_pattern!(
    STRUCTURED_FORMAT,
    r###"(?i)^(?:use\s+)?(?:html|react|svg|mermaid)\b"###
);
intent_pattern!(FENCE_START, r###"^\s*(`{3,}|~{3,})"###);
intent_pattern!(QUOTED_MATERIAL, r###""[^"\n]*"|“[^”\n]*”|`[^`\n]*`"###);
intent_pattern!(
    IMAGE_COMMAND,
    r###"(?i)^/(?:image|imagine|draw|generate)\b"###
);
intent_pattern!(
    OUTPUT_ACTION,
    r###"(?i)^(?:show|display|render|present|demonstrate|typeset|create|make|generate|design|build|draw|paint|illustrate|visuali[sz]e|write|draft|compose|prepare|provide|give|produce|rewrite|re-write|translate|summari[sz]e|paraphrase|proofread|edit|polish|format|reformat|convert|turn|repeat|echo|respond|reply)\b[\s,:-]*"###
);
intent_pattern!(
    OUTPUT_FILLER,
    r###"(?i)^(?:(?:me|us|one|two|three|four|five|six|seven|eight|nine|ten|some|an?|the|this|that|these|those|my|our|your|complete|comprehensive|different|several|multiple|reusable|independent|independently|separate|copyable|editable|interactive|live|inline|beautiful|detailed|simple|small|short|long|concise|full|new|visual|visually|rich|real|actual|intelligent|native|responsive|professional|polished|formatted|\d+)[\s,:-]+)*"###
);
intent_pattern!(
    IMAGE_OUTPUT,
    r###"(?i)^(?:or\s+(?:retrieve|find)\s+)?(?:[\p{L}\d-]+\s+){0,3}?(?:images?|pictures?|photos?|photographs?|illustrations?|logos?|artwork|drawings?|paintings?|sketch(?:es)?|portraits?|posters?|banners?|avatars?|thumbnails?|wallpapers?|icons?|stickers?|collages?)\b"###
);
intent_pattern!(
    RENDERED_OUTPUT,
    r###"(?i)^(?:(?:html|react|svg|mermaid|web|user|chat|email|writing|data|bar|line|pie|donut|sequence|flow|metric|image|photo|component|ui|interface)\s+){0,3}(?:ui|interfaces?|screens?|apps?|web\s*pages?|websites?|dashboards?|mockups?|wireframes?|charts?|graphs?|plots?|diagrams?|flowcharts?|tables?|forms?|cards?|carousels?|galler(?:y|ies)|components?|artifacts?|calculators?|widgets?|timelines?|checklists?|math|equations?|formulae?|formulas?|rendering)\b"###
);
intent_pattern!(
    TEXT_OUTPUT,
    r###"(?i)^(?:(?:follow[- ]up|cover|leave|thank[- ]you|linkedin|markdown|text|code|shell|sql|email|writing|document|prompt|copy|reusable|independent|separate|formatted|image|art)\s+){0,3}(?:emails?|messages?|letters?|documents?|prompts?|snippets?|commands?|posts?|bios?|captions?|stories|story|poems?|essays?|reports?|summar(?:y|ies)|translations?|paragraphs?|sentences?|text|copy|code|responses?|replies|reply|notes?|templates?|blocks?)\b"###
);
intent_pattern!(TEXT_AUTHORING, r###"(?i)^(?:write|draft|compose)\b"###);
intent_pattern!(
    TEXT_TRANSFORMATION,
    r###"(?i)^(?:rewrite|re-write|translate|summari[sz]e|paraphrase|proofread|polish|format|reformat|repeat|echo|respond|reply)\b"###
);
intent_pattern!(
    CALCULATION_REQUEST,
    r###"(?i)^(?:calculate|compute|solve|derive|evaluate|simplify)\b"###
);
intent_pattern!(
    CALCULATION_EXPRESSION,
    r###"(?i)^(?:(?:what(?:'s|\s+is)|how\s+much\s+is)\s+)?(?:-?\d+(?:\.\d+)?\s*(?:[+*/×÷^=-]|plus|minus|times|divided\s+by|percent\s+of)\s*)+-?\d+(?:\.\d+)?\s*\??$"###
);
intent_pattern!(
    EXTERNAL_FACTS,
    r###"(?i)\b(?:(?:latest|current|recent|live|real[- ]time|up[- ]to[- ]date|today'?s?)\s+(?:(?:\w+)\s+){0,2}(?:news|events?|prices?|rates?|weather|forecast|versions?|releases?|results?|scores?|standings|market\s+data)|(?:who\s+(?:is|are)|current|incumbent|sitting)\s+(?:the\s+)?(?:president|prime\s+minister|governor|mayor|ceo|cfo|cto)|what\s+happened\s+(?:today|yesterday)|research\s+(?:report|paper))\b"###
);
intent_pattern!(
    DATA_RENDERING_REQUEST,
    r###"(?i)^(?:render|show|display|visuali[sz]e|present|demonstrate|build|create|make|generate|design)\b[^.!?\n]*\b(?:data|charts?|graphs?|plots?|diagrams?|ui|interfaces?|components?|artifacts?|forms?|cards?|carousels?|galler(?:y|ies)|tables?|checklists?|calculators?|equations?|formulas?|theorems?|matri(?:x|ces)|integrals?|summations?|math)\b"###
);
intent_pattern!(
    CHAT_RENDERING_REQUEST,
    r###"(?i)\b(?:what|which|show|demonstrate|display)\b[^.!?\n]*\b(?:this\s+chat\s+(?:can\s+)?(?:render|supports?)|render\s+(?:in\s+)?this\s+chat|inline\s+in\s+(?:this|the)\s+chat)"###
);
intent_pattern!(
    SNIPPET_OUTPUT,
    r###"(?i)^(?:[\p{L}+#.-]+\s+){0,2}(?:snippets?|code\s+blocks?)\b"###
);
intent_pattern!(
    CODE_OUTPUT,
    r###"(?i)^(?:and\s+(?:run|execute)\s+)?(?:[\p{L}+#.-]+\s+){0,3}(?:code(?:\s+(?:examples?|snippets?|blocks?))?|programs?|scripts?)\b"###
);
intent_pattern!(
    IMAGE_EDIT_REQUEST,
    r###"(?i)^(?:edit|restyle|retouch|crop|rotate|resize|upscale|sharpen|recolou?r|inpaint|outpaint)\b|^(?:change|modify|transform|convert|turn)\b[^.!?\n]{0,160}\b(?:image|photo|picture|illustration|portrait)\b"###
);
intent_pattern!(
    IMAGE_VISUAL_EDIT,
    r###"(?i)^(?:make|turn|change)\s+(?:it|this|that|the\s+(?:image|picture|photo))\b[^.!?\n]{0,160}\b(?:warmer|cooler|brighter|darker|lighter|sharper|softer|colou?rful|saturated|photorealistic|transparent)\b|^(?:make|change|remove|replace)\b[^.!?\n]{0,80}\b(?:background|lighting|watermark)\b"###
);
intent_pattern!(
    IMAGE_CONTINUATION,
    r###"(?i)^(?:(?:another|one\s+more)(?:\s+(?:one|image|picture|photo|version|variation))?|(?:make|generate|create|draw)\s+(?:another|one\s+more)\s+(?:one|version|variation))\s*[.!?]?$"###
);
intent_pattern!(
    IMAGE_REFERENCE,
    r###"(?i)\b(?:from|based\s+on|using)\s+(?:(?:the|this|that|my|attached|uploaded|source|reference)\s+){1,3}(?:image|photo|picture|illustration|portrait)\b"###
);
intent_pattern!(
    OWN_CONTENT_SCOPE_PATTERN,
    r###"(?i)\b(?:from|in|using|use|through|search|check|read|based\s+on|according\s+to|out\s+of|go(?:ing)?\s+through|look(?:ing)?\s+(?:in|at|through))\s+(?:my|our)\s+(?:own\s+)?(?:(?:private|personal|saved|uploaded|project|past|earlier|previous|prior)\s+)?(?:notes?|notebooks?|files?|documents?|docs|uploads?|attachments?|chats?|conversations?|(?:chat\s+)?history|memor(?:y|ies)|records?|drafts?)\b"###
);
intent_pattern!(
    WEB_NOUN_PATTERN,
    r###"(?i)\b(?:web|internet|online|google)\b"###
);
intent_pattern!(
    SEARCH_OPT_OUT_PATTERN,
    r###"(?i)\b(?:do\s+not|don't|dont|never|avoid|without|no)\s+(?:(?:use|perform|performing)\s+)?(?:(?:a|the)\s+)?(?:web\s+search(?:es)?|search(?:ing)?\s+(?:(?:the|on)\s+)?(?:(?:public\s+)?(?:web|internet)|online)|browse(?:ing)?\s+(?:the\s+)?(?:public\s+)?web|look(?:ing)?\s+(?:it|this|that)\s+up)\b"###
);
intent_pattern!(
    PRIVATE_SCOPE_ONLY_PATTERN,
    r###"(?i)\b(?:(?:only|just)\s+(?:search|use|check|look\s+(?:in|at|through)|draw\s+on)|(?:search|use|check)\s+only(?:\s+(?:in|through))?)\s+(?:my|our)\s+(?:own\s+)?(?:private\s+)?(?:(?:past|earlier|previous|prior|old|saved|other)\s+)?(?:chats?|conversations?|(?:chat\s+)?history|memor(?:y|ies)|files?|documents?|notes?)\b"###
);
intent_pattern!(
    UI_SEARCH_LABEL,
    r###"(?i)^[^\S\n]*(?:(?:and|or)\s+|,\s*)?(?:[\p{L}\p{N}_-]+\s+){0,3}(?:checkbox(?:es)?|check\s+boxes?|toggles?|switch(?:es)?|options?|fields?|labels?|controls?)\b"###
);
intent_pattern!(
    EXPLICIT_LOOKUP_PREFIX,
    r###"(?i)\b(?:use|run|perform|do|call)\s+(?:(?:a|an|the)\s+)?$"###
);
intent_pattern!(
    REFUSED_LIST_SEPARATOR,
    r###"(?i),\s*(?:(?:or|nor)\s+)?|\s(?:or|nor)\s+"###
);
intent_pattern!(LIST_CLOSING_CONJUNCTION, r###"(?i)\b(?:or|nor)\b"###);
intent_pattern!(
    REFUSED_ITEM_TRAILING_QUALIFIER,
    r###"(?:\s+(?:at\s+all|this\s+time|for\s+(?:this(?:\s+one)?|now)|here|today|now|please|either|again))+$"###
);
intent_pattern!(
    REFUSED_ITEM_LEADING_FILLER,
    r###"^(?:(?:use|using|run|running|call|calling|do|doing|perform|performing|make|making|execute|executing|access|accessing|invoke|invoking|any|a|an|the|your|some|external|outside|other|extra|additional)\s+)+"###
);
intent_pattern!(
    REFUSED_WEB_SEARCH_ITEM,
    r###"^(?:(?:(?:web|internet|online|live|public)\s+)?(?:search(?:es|ing)?|brows(?:e|ing)|googl(?:e|ing))(?:\s+(?:(?:on|in)\s+)?(?:the\s+)?(?:(?:public\s+)?(?:web|internet)|online))?(?:\s+tools?)?|(?:the\s+)?(?:public\s+)?(?:web|internet)|look(?:ing)?\s+(?:(?:it|this|that|anything)\s+up|up\s+anything)|check(?:ing)?\s+(?:online|the\s+web))$"###
);

const SEARCH_VERB_PHRASES: &[&str] = &[
    "search the web",
    "search on the web",
    "search in the web",
    "search the internet",
    "search on the internet",
    "search in the internet",
    "search online",
    "search for",
    "web search",
    "web searches",
    "google it",
    "google for",
    "look it up",
    "look this up",
    "look that up",
    "look up",
    "browse the web",
    "check online",
    "check the web",
    "find online",
    "search and",
];

const CITATION_PHRASES: &[&str] = &[
    "cite a link",
    "cite links",
    "cite a source",
    "cite sources",
    "cite your sources",
    "with sources",
    "with citations",
    "link to the source",
    "link the source",
    "provide sources",
    "include sources",
    "source it",
    "using official documentation",
    "using official sources",
];

const LINK_REQUEST_PHRASES: &[&str] = &["give me the link", "send me the link"];

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

const WEB_SEARCH_REQUEST_EDGE_CHARS: usize = 280;
const WEB_SEARCH_LONG_MESSAGE_CHARS: usize = WEB_SEARCH_REQUEST_EDGE_CHARS * 3;

intent_pattern!(
    REQUEST_CONTEXT,
    r"(?i)^(?:using|given|with|based\s+on|from)\b[^.!?\n]{1,600}?,\s*((?:render|show|display|create|make|generate|calculate)\b)"
);
intent_pattern!(DRAW_SUBJECT, r"(?i)^(?:draw|paint)\s+");
intent_pattern!(DRAW_UP, r"(?i)^up\b");
intent_pattern!(
    RESOURCE_MULTIPLICITY,
    r"(?i)\b(?:multiple|several|many|various|different|distinct|two|three|four|five|six|seven|eight|nine|ten)\b"
);
intent_pattern!(RESOURCE_COUNT, r"\b\d+\b");
intent_pattern!(RE_WHITESPACE, r"\s+");
intent_pattern!(REQUEST_PARAGRAPH_BREAK, r"\n\s*\n");
intent_pattern!(SINGLE_QUOTED_MATERIAL, r"'[^'\n]+'");
intent_pattern!(
    OWN_SOURCE_FOLLOWER,
    r"(?i)^[^\S\n]+(?:chats?|conversations?|threads?|messages?|memor(?:y|ies))\b"
);
intent_pattern!(
    OWN_CHAT_LINK_FOLLOWER,
    r"(?i)^[^\S\n]+to(?:[^\S\n]+[\p{L}\p{N}'’-]+){0,3}?[^\S\n]+(?:chats?|conversations?)\b"
);
intent_pattern!(
    AMBIGUOUS_SEARCH_LABEL,
    r"(?i)^(?:web\s+search(?:es)?|search\s+and)$"
);
intent_pattern!(
    REFUSED_ITEM_IDIOM,
    r"(?i)^(?:just|only|simply|hesitate|forget|fail|worry|worries|mind|stop|be\s+afraid|problem|problems|thanks|idea|doubt|matter|way|sure|need\s+to\s+ask)\b"
);
intent_pattern!(
    REFUSED_LIST_CLAUSE,
    // em-dash-allow: canonical refusal punctuation, never displayed as copy
    r"(?i)(?:(?:^|[.;:!?,()\n*>•–—-])[^\S\n]*(?:(?:and|but|so|also|please|again)\s+)?(?:do\s+not|don['’]?t|never|no|not)|\b(?:and|but|so|then|just|please)\s+(?:do\s+not|don['’]?t|never)|\b(?:without|avoid))[^\S\n]+([^.;:!?\n–—]{1,400})"
);
intent_pattern!(
    SEARCH_REFUSAL_NAMED_TARGET,
    r"(?i)\b(?:(?:(?:do\s+not|don['’]?t|never)\s+(?:(?:need|have)\s+to|want\s+you\s+to)|no\s+need\s+to)|do\s+not|don['’]?t|never|avoid|without|no)\s+(?:(?:use|perform|performing)\s+)?(?:(?:a|the)\s+)?(?:web\s+search(?:es)?|search(?:ing)?\s+(?:(?:on|in)\s+)?(?:the\s+)?(?:(?:public\s+)?(?:web|internet)|online)|brows(?:e|ing)\s+(?:the\s+)?(?:public\s+)?web|look(?:ing)?\s+(?:(?:it|this|that|anything)\s+up|up\s+anything)|googl(?:e|ing)\s+(?:it|this|that)|check(?:ing)?\s+(?:online|the\s+web))\b"
);

const BROWSER_CURRENT_PAGE_QUALIFIER: &str =
    r"(?:this|the\s+(?:current|active))\s+(?:[\w-]+\s+){0,2}(?:page|tab)";
intent_pattern!(
    RE_COMPUTER_REQUEST_PREFIX,
    r"(?i)^\s*(?:(?:please\s+)?(?:can|could|would|will)\s+you\s+(?:please\s+)?|please\s+)?"
);
static RE_BROWSER_ACTION_WRAPPER: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(r"(?i)^(?:use\s+(?:(?:the|this)\s+)?(?:(?:current|active)\s+)?browser(?:\s+(?:on|in)\s+{BROWSER_CURRENT_PAGE_QUALIFIER})?\s+to\s+|in\s+(?:(?:the|this)\s+)?(?:(?:current|active)\s+)?browser\s*[:,]?\s+|on\s+{BROWSER_CURRENT_PAGE_QUALIFIER}\s*[:,]?\s+)")).expect("valid regex")
});
intent_pattern!(
    RE_BROWSER_WRAPPED_ACTION,
    r"(?i)^(click|double[ -]click|right[ -]click|tap|press|hover|drag|swipe|fill|type|enter|select|choose|check|uncheck|submit|navigate|open|visit|go|scroll|reload|refresh|upload|download)\b"
);
intent_pattern!(RE_BROWSER_FILL_TOPIC, r"(?i)^fill\s+me\s+in\b");
intent_pattern!(
    RE_BROWSER_TAB_WINDOW_ACTION,
    r"(?i)^(?:(?:list|show|read)\s+(?:only\s+)?(?:(?:the|this)\s+)?(?:(?:task[- ]owned|task|browser)\s+)?tabs\b|(?:switch\s+to|close)\s+(?:(?:the|this)\s+)?(?:(?:original|current|previous|task[- ]owned|task[- ]created|task|browser)\s+)?tab\b|resize\s+(?:(?:the|this|current)\s+)?(?:browser\s+)?window\b)"
);
intent_pattern!(
    RE_BROWSER_PERFORM_ACTION,
    r"(?i)^perform\s+(?:an?\s+)?(?:(?:horizontal|vertical)\s+)?(click|double[ -]click|right[ -]click|tap|hover|drag|swipe|scroll)\b"
);
intent_pattern!(
    RE_BROWSER_UI_ACTION,
    r"(?i)^(click|double[ -]click|right[ -]click|tap|press|fill(?:\s+in)?|type|enter|select|choose|check|uncheck|submit)\s+(?:\S[^\n]*)?\b(button|link|menu|tab|field|input|textbox|text area|form|checkbox|check box|radio button|dropdown|drop-down|option|toggle|control)\b"
);
intent_pattern!(
    RE_BROWSER_NAVIGATION,
    r"(?i)^(navigate|open|visit|go)\s+(?:\S[^\n]*)?(https?://\S+|\b(this|current|active)\s+(browser\s+)?(tab|page)\b)"
);
intent_pattern!(
    RE_BROWSER_PAGE_ACTION,
    r"(?i)^(scroll|reload|refresh)\s+(?:\S[^\n]*)?\b(tab|page|browser)\b"
);
static RE_BROWSER_CURRENT_PAGE_CONTEXT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(&format!(
        r"(?i)^[^.!?\n]*\b(?:on|in)\s+{BROWSER_CURRENT_PAGE_QUALIFIER}\b"
    ))
    .expect("valid regex")
});
intent_pattern!(
    RE_BROWSER_ACTION_TOPIC,
    r"(?i)^(?:click|double[ -]click|right[ -]click|tap)\s+(?:handlers?|listeners?|events?|is|are|was|were|means|refers)\b"
);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ResponseOutputIntent {
    Image,
    Rendered,
    Text,
    Calculation,
    Unknown,
}

fn without_fenced_material(message: &str) -> String {
    let mut output = Vec::new();
    let mut fence = "";
    for line in message.split('\n') {
        let marker = FENCE_START
            .captures(line)
            .and_then(|capture| capture.get(1))
            .map_or("", |capture| capture.as_str());
        if !fence.is_empty() {
            if marker.as_bytes().first() == fence.as_bytes().first()
                && marker.len() >= fence.len()
                && line.trim_start()[marker.len()..].trim().is_empty()
            {
                fence = "";
            }
        } else if !marker.is_empty() {
            fence = marker;
        } else {
            output.push(line);
        }
    }
    output.join("\n")
}

fn request_text(message: &str) -> String {
    let unfenced = without_fenced_material(message);
    let unquoted = QUOTED_MATERIAL.replace_all(&unfenced, "");
    let unlabeled = REQUEST_LABEL.replace(unquoted.trim_start(), "");
    let request = REQUEST_CONTEXT
        .captures(&unlabeled)
        .and_then(|context| context.get(1))
        .map_or(unlabeled.as_ref(), |action| &unlabeled[action.start()..]);
    let request = REQUEST_PREFIX.replace(request, "");
    let request = DESIRED_OUTPUT_PREFIX.replace(&request, "");
    REQUEST_PREFIX.replace(&request, "").into_owned()
}

fn classify_response_output_intent(message: &str) -> ResponseOutputIntent {
    let request = request_text(message);
    if IMAGE_COMMAND.is_match(&request) {
        return ResponseOutputIntent::Image;
    }
    if CALCULATION_REQUEST.is_match(&request) || CALCULATION_EXPRESSION.is_match(&request) {
        return ResponseOutputIntent::Calculation;
    }
    if TEXT_TRANSFORMATION.is_match(&request) {
        return ResponseOutputIntent::Text;
    }
    let action = OUTPUT_ACTION.find(&request);
    let output = OUTPUT_FILLER.replace(
        &request[action.as_ref().map_or(0, |action| action.end())..],
        "",
    );
    if STRUCTURED_FORMAT.is_match(&output) || RENDERED_OUTPUT.is_match(&output) {
        return ResponseOutputIntent::Rendered;
    }
    if TEXT_OUTPUT.is_match(&output)
        || SNIPPET_OUTPUT.is_match(&output)
        || CODE_OUTPUT.is_match(&output)
        || TEXT_AUTHORING.is_match(&request)
    {
        return ResponseOutputIntent::Text;
    }
    if action.is_none() {
        if DESIRED_OUTPUT_PREFIX.is_match(&REQUEST_PREFIX.replace(message.trim_start(), ""))
            && IMAGE_OUTPUT.is_match(&output)
        {
            return ResponseOutputIntent::Image;
        }
        return if CHAT_RENDERING_REQUEST.is_match(&request) {
            ResponseOutputIntent::Rendered
        } else {
            ResponseOutputIntent::Unknown
        };
    }
    if IMAGE_OUTPUT.is_match(&output)
        || DRAW_SUBJECT
            .find(&request)
            .is_some_and(|action| !DRAW_UP.is_match(&request[action.end()..]))
    {
        return ResponseOutputIntent::Image;
    }
    if DATA_RENDERING_REQUEST.is_match(&request) || CHAT_RENDERING_REQUEST.is_match(&request) {
        return ResponseOutputIntent::Rendered;
    }
    ResponseOutputIntent::Unknown
}

fn requests_separate_image_resources(message: &str) -> bool {
    if classify_response_output_intent(message) != ResponseOutputIntent::Image {
        return false;
    }
    let request = request_text(message);
    if IMAGE_EDIT_REQUEST.is_match(&request)
        || IMAGE_VISUAL_EDIT.is_match(&request)
        || IMAGE_REFERENCE.is_match(&request)
        || IMAGE_CONTINUATION.is_match(&request)
    {
        return false;
    }
    let action = OUTPUT_ACTION.find(&request);
    let object = request[action.map_or(0, |action| action.end())..].trim();
    let without_fillers = OUTPUT_FILLER.replace(object, "");
    let Some(resource) = IMAGE_OUTPUT.find(&without_fillers) else {
        return false;
    };
    let noun = resource.as_str().split_whitespace().last().unwrap_or("");
    let prefix = &object[..object.len() - without_fillers.len() + resource.end() - noun.len()];
    noun.ends_with('s')
        || RESOURCE_MULTIPLICITY.is_match(prefix)
        || RESOURCE_COUNT.find_iter(prefix).any(|count| {
            count
                .as_str()
                .parse::<u32>()
                .map_or(true, |count| count > 1)
        })
}

fn is_browser_action(message: &str) -> bool {
    let requested_action = RE_COMPUTER_REQUEST_PREFIX.replace(message, "");
    let has_wrapper = RE_BROWSER_ACTION_WRAPPER.is_match(&requested_action);
    let computer_request = RE_BROWSER_ACTION_WRAPPER.replace(&requested_action, "");
    let computer_request = RE_COMPUTER_REQUEST_PREFIX.replace(&computer_request, "");
    let computer_request = if has_wrapper {
        RE_BROWSER_PERFORM_ACTION.replace(&computer_request, "$1")
    } else {
        computer_request
    };
    let wrapped_action = RE_BROWSER_WRAPPED_ACTION.is_match(&computer_request)
        && !RE_BROWSER_FILL_TOPIC.is_match(&computer_request);
    !RE_CODE_FENCE.is_match(message)
        && !RE_BROWSER_ACTION_TOPIC.is_match(&computer_request)
        && ((has_wrapper
            && (wrapped_action || RE_BROWSER_TAB_WINDOW_ACTION.is_match(&computer_request)))
            || (wrapped_action && RE_BROWSER_CURRENT_PAGE_CONTEXT.is_match(&computer_request))
            || RE_BROWSER_UI_ACTION.is_match(&computer_request)
            || RE_BROWSER_NAVIGATION.is_match(&computer_request)
            || RE_BROWSER_PAGE_ACTION.is_match(&computer_request))
}

fn phrase_pattern(phrases: &[&str]) -> Regex {
    let mut phrases: Vec<_> = phrases.iter().map(|phrase| regex::escape(phrase)).collect();
    phrases.sort_by_key(|phrase| std::cmp::Reverse(phrase.len()));
    Regex::new(&format!("(?i)(?:{})", phrases.join("|"))).expect("valid phrase pattern")
}

static SEARCH_VERB_PATTERN: Lazy<Regex> = Lazy::new(|| phrase_pattern(SEARCH_VERB_PHRASES));
static CITATION_PATTERN: Lazy<Regex> = Lazy::new(|| phrase_pattern(CITATION_PHRASES));
static LINK_REQUEST_PATTERN: Lazy<Regex> = Lazy::new(|| phrase_pattern(LINK_REQUEST_PHRASES));
intent_pattern!(REQUEST_WORD_CHARACTER, r"^[\p{L}\p{N}_]$");
intent_pattern!(
    REFUSED_ITEM_MODAL_PREFIX,
    r"^(?:(?:need|have)\s+to|want\s+you\s+to)\s+"
);

fn is_request_word_character(character: Option<char>) -> bool {
    character.is_some_and(|character| {
        let mut buffer = [0; 4];
        REQUEST_WORD_CHARACTER.is_match(character.encode_utf8(&mut buffer))
    })
}

fn phrase_matches<'a>(text: &'a str, pattern: &'a Regex) -> impl Iterator<Item = regex::Match<'a>> {
    pattern.find_iter(text).filter(|phrase| {
        !is_request_word_character(text[..phrase.start()].chars().next_back())
            && !is_request_word_character(text[phrase.end()..].chars().next())
    })
}

fn utf16_prefix(text: &str, limit: usize) -> &str {
    let mut units = 0;
    let end = text
        .char_indices()
        .take_while(|(_, character)| {
            units += character.len_utf16();
            units <= limit
        })
        .map(|(index, character)| index + character.len_utf8())
        .last()
        .unwrap_or(0);
    &text[..end]
}

fn utf16_suffix(text: &str, limit: usize) -> &str {
    let mut units = 0;
    let start = text
        .char_indices()
        .rev()
        .take_while(|(_, character)| {
            units += character.len_utf16();
            units <= limit
        })
        .map(|(index, _)| index)
        .last()
        .unwrap_or(text.len());
    &text[start..]
}

fn web_search_request_text(message: &str) -> String {
    let unfenced = without_fenced_material(message);
    let unquoted = QUOTED_MATERIAL.replace_all(&unfenced, "");
    let mut request = String::new();
    let mut cursor = 0;
    for quote in SINGLE_QUOTED_MATERIAL.find_iter(&unquoted) {
        if is_request_word_character(unquoted[..quote.start()].chars().next_back())
            || is_request_word_character(unquoted[quote.end()..].chars().next())
        {
            continue;
        }
        request.push_str(&unquoted[cursor..quote.start()]);
        cursor = quote.end();
    }
    request.push_str(&unquoted[cursor..]);
    if request.encode_utf16().count() <= WEB_SEARCH_LONG_MESSAGE_CHARS {
        return request;
    }
    let mut paragraphs = REQUEST_PARAGRAPH_BREAK
        .split(&request)
        .map(str::trim)
        .filter(|paragraph| !paragraph.is_empty());
    let first = paragraphs.next().unwrap_or("");
    let last = paragraphs.last().unwrap_or(first);
    format!(
        "{}\n{}",
        utf16_prefix(first, WEB_SEARCH_REQUEST_EDGE_CHARS),
        utf16_suffix(last, WEB_SEARCH_REQUEST_EDGE_CHARS)
    )
}

fn asks_for_web_lookup(request: &str) -> bool {
    phrase_matches(request, &SEARCH_VERB_PATTERN).any(|phrase| {
        if matches!(
            request[..phrase.start()].chars().next_back(),
            Some('-' | '_')
        ) {
            return false;
        }
        !AMBIGUOUS_SEARCH_LABEL.is_match(phrase.as_str())
            || !UI_SEARCH_LABEL.is_match(&request[phrase.end()..])
            || EXPLICIT_LOOKUP_PREFIX.is_match(utf16_suffix(&request[..phrase.start()], 40))
    })
}

fn asks_for_web_sources(request: &str) -> bool {
    let sources = phrase_matches(request, &CITATION_PATTERN)
        .any(|phrase| !OWN_SOURCE_FOLLOWER.is_match(&request[phrase.end()..]))
        || phrase_matches(request, &LINK_REQUEST_PATTERN)
            .any(|phrase| !OWN_CHAT_LINK_FOLLOWER.is_match(&request[phrase.end()..]));
    sources && (!OWN_CONTENT_SCOPE_PATTERN.is_match(request) || WEB_NOUN_PATTERN.is_match(request))
}

fn refused_web_search_ranges(request: &str) -> Vec<(usize, usize)> {
    let mut ranges: Vec<_> = SEARCH_REFUSAL_NAMED_TARGET
        .find_iter(request)
        .map(|refusal| (refusal.start(), refusal.end()))
        .collect();
    for refusal in REFUSED_LIST_CLAUSE.captures_iter(request) {
        let Some(clause) = refusal.get(1) else {
            continue;
        };
        if REFUSED_ITEM_IDIOM.is_match(clause.as_str()) {
            continue;
        }
        if request[clause.end()..]
            .chars()
            .next()
            // em-dash-allow: canonical refusal terminator, never displayed as copy
            .is_some_and(|next| !matches!(next, '.' | ';' | ':' | '!' | '?' | '\n' | '–' | '—'))
        {
            continue;
        }
        let mut segments = Vec::new();
        let mut separators = Vec::new();
        let mut cursor = 0;
        for separator in REFUSED_LIST_SEPARATOR.find_iter(clause.as_str()) {
            let mut start = separator.start();
            while let Some((index, character)) =
                clause.as_str()[cursor..start].char_indices().next_back()
            {
                if !character.is_whitespace() {
                    break;
                }
                start = cursor + index;
            }
            segments.push((cursor, start));
            separators.push(&clause.as_str()[start..separator.end()]);
            cursor = separator.end();
        }
        segments.push((cursor, clause.len()));
        let last_or = separators
            .iter()
            .rposition(|separator| LIST_CLOSING_CONJUNCTION.is_match(separator));
        let refused_count = last_or
            .filter(|index| *index == 0 || separators[*index].trim_start().starts_with(','))
            .map_or(1, |index| index + 2);
        for (start, end) in segments.into_iter().take(refused_count) {
            let item = clause.as_str()[start..end].trim().to_lowercase();
            let item = REFUSED_ITEM_TRAILING_QUALIFIER.replace(&item, "");
            let item = REFUSED_ITEM_MODAL_PREFIX.replace(&item, "");
            let item = REFUSED_ITEM_LEADING_FILLER.replace(&item, "");
            if REFUSED_WEB_SEARCH_ITEM.is_match(&item) {
                ranges.push((clause.start() + start, clause.start() + end));
            }
        }
    }
    ranges
}

fn has_explicit_web_search_opt_out(request: &str) -> bool {
    if SEARCH_OPT_OUT_PATTERN.is_match(request) || PRIVATE_SCOPE_ONLY_PATTERN.is_match(request) {
        return true;
    }
    let mut ranges = refused_web_search_ranges(request);
    if ranges.is_empty() {
        return false;
    }
    ranges.sort_unstable();
    let mut outside_refusals = String::new();
    let mut cursor = 0;
    for (start, end) in ranges {
        if start >= cursor {
            outside_refusals.push_str(&request[cursor..start]);
            outside_refusals.push('\n');
        }
        cursor = cursor.max(end);
    }
    outside_refusals.push_str(&request[cursor..]);
    let has_lookup = phrase_matches(&outside_refusals, &SEARCH_VERB_PATTERN)
        .next()
        .is_some();
    !has_lookup
}

fn is_self_contained_response_request(message: &str) -> bool {
    let search_request = web_search_request_text(message);
    let request = request_text(&search_request);
    let explicit_sources = !has_explicit_web_search_opt_out(&search_request)
        && (asks_for_web_lookup(&search_request) || asks_for_web_sources(&search_request));
    classify_response_output_intent(message) != ResponseOutputIntent::Unknown
        && !explicit_sources
        && (TEXT_TRANSFORMATION.is_match(&request) || !EXTERNAL_FACTS.is_match(&request))
}

fn estimate_tokens_default(text: &str) -> usize {
    (text.encode_utf16().count() as f64 * TOKENS_PER_CHAR_DEFAULT).ceil() as usize
}

/// Classify the outgoing interactive turn into the canonical routing-task
/// taxonomy. Priority-ordered; the first heuristic to fire wins.
///
/// `has_image_attachment` covers the CLI's `-f image.png` / pasted-image
/// blocks, any image attachment classifies the turn as multimodal, exactly
/// like an `image/*` MIME does in the TS canonical.
pub fn classify_turn_task(message: &str, has_image_attachment: bool) -> RoutingTaskType {
    if requests_separate_image_resources(message) {
        return RoutingTaskType::Agentic;
    }
    if classify_response_output_intent(message) == ResponseOutputIntent::Image {
        return RoutingTaskType::ImageGeneration;
    }

    // 3. Multimodal, any image attachment, even with an empty message body.
    if has_image_attachment {
        return RoutingTaskType::Multimodal;
    }

    // 4. Long context, single-input token guard (history continuity is the
    //    resolver's job on this surface, mirroring the VS Code adapter).
    if estimate_tokens_default(message) > LONG_CONTEXT_TOKENS {
        return RoutingTaskType::LongContext;
    }

    if is_browser_action(message) {
        return RoutingTaskType::ComputerUse;
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
    if RE_RESEARCH.is_match(message) && !is_self_contained_response_request(message) {
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
    if message.encode_utf16().count() < SIMPLE_CHAT_MAX_CHARS
        && RE_WHITESPACE.split(message).count() < SIMPLE_CHAT_MAX_WORDS
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
    fn canonical_source_at(relative: &str) -> String {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(relative);
        std::fs::read_to_string(&path).unwrap_or_else(|error| {
            panic!(
                "canonical classifier unreadable at {}: {error}",
                path.display()
            )
        })
    }

    fn canonical_source() -> String {
        canonical_source_at("../../packages/ai/routing/src/classify.ts")
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

        for (name, ported) in [
            ("RE_CODE_FENCE", &*RE_CODE_FENCE),
            ("RE_CODING", &*RE_CODING),
            ("RE_CODING_WEAK", &*RE_CODING_WEAK),
            ("RE_REASONING_VERB", &*RE_REASONING_VERB),
            ("RE_REASONING_MATH", &*RE_REASONING_MATH),
            ("RE_AGENTIC", &*RE_AGENTIC),
            ("RE_RESEARCH", &*RE_RESEARCH),
            ("RE_CREATIVE_WRITING", &*RE_CREATIVE_WRITING),
            ("RE_WHITESPACE", &*RE_WHITESPACE),
            ("RE_COMPUTER_REQUEST_PREFIX", &*RE_COMPUTER_REQUEST_PREFIX),
            (
                "RE_BROWSER_TAB_WINDOW_ACTION",
                &*RE_BROWSER_TAB_WINDOW_ACTION,
            ),
            ("RE_BROWSER_PERFORM_ACTION", &*RE_BROWSER_PERFORM_ACTION),
            ("RE_BROWSER_UI_ACTION", &*RE_BROWSER_UI_ACTION),
            ("RE_BROWSER_NAVIGATION", &*RE_BROWSER_NAVIGATION),
            ("RE_BROWSER_PAGE_ACTION", &*RE_BROWSER_PAGE_ACTION),
            ("RE_BROWSER_ACTION_TOPIC", &*RE_BROWSER_ACTION_TOPIC),
        ] {
            assert_eq!(
                ported.as_str(),
                canonical_pattern(&source, name),
                "{name} has drifted from packages/ai/routing/src/classify.ts"
            );
        }
    }

    #[test]
    fn canonical_output_intent_patterns_match_their_owner() {
        let source = canonical_source_at("../../packages/ai/routing/src/output-intent.ts");
        for (name, ported) in [
            ("REQUEST_LABEL", &*REQUEST_LABEL),
            ("REQUEST_PREFIX", &*REQUEST_PREFIX),
            ("DESIRED_OUTPUT_PREFIX", &*DESIRED_OUTPUT_PREFIX),
            ("STRUCTURED_FORMAT", &*STRUCTURED_FORMAT),
            ("FENCE_START", &*FENCE_START),
            ("IMAGE_COMMAND", &*IMAGE_COMMAND),
            ("OUTPUT_ACTION", &*OUTPUT_ACTION),
            ("OUTPUT_FILLER", &*OUTPUT_FILLER),
            ("IMAGE_OUTPUT", &*IMAGE_OUTPUT),
            ("RENDERED_OUTPUT", &*RENDERED_OUTPUT),
            ("TEXT_OUTPUT", &*TEXT_OUTPUT),
            ("TEXT_AUTHORING", &*TEXT_AUTHORING),
            ("TEXT_TRANSFORMATION", &*TEXT_TRANSFORMATION),
            ("CALCULATION_REQUEST", &*CALCULATION_REQUEST),
            ("CALCULATION_EXPRESSION", &*CALCULATION_EXPRESSION),
            ("EXTERNAL_FACTS", &*EXTERNAL_FACTS),
            ("DATA_RENDERING_REQUEST", &*DATA_RENDERING_REQUEST),
            ("CHAT_RENDERING_REQUEST", &*CHAT_RENDERING_REQUEST),
            ("SNIPPET_OUTPUT", &*SNIPPET_OUTPUT),
            ("CODE_OUTPUT", &*CODE_OUTPUT),
            ("IMAGE_EDIT_REQUEST", &*IMAGE_EDIT_REQUEST),
            ("IMAGE_VISUAL_EDIT", &*IMAGE_VISUAL_EDIT),
            ("IMAGE_CONTINUATION", &*IMAGE_CONTINUATION),
            ("IMAGE_REFERENCE", &*IMAGE_REFERENCE),
        ] {
            assert_eq!(ported.as_str(), canonical_pattern(&source, name), "{name}");
        }
        assert_eq!(
            DRAW_SUBJECT.as_str(),
            canonical_pattern(&source, "DRAW_SUBJECT").replace(r"(?!up\b)", "")
        );
        assert_eq!(
            REQUEST_CONTEXT.as_str(),
            canonical_pattern(&source, "REQUEST_CONTEXT").replace(
                r"(?=(?:render|show|display|create|make|generate|calculate)\b)",
                r"((?:render|show|display|create|make|generate|calculate)\b)"
            )
        );
        let quote_fixtures: serde_json::Value = serde_json::from_str(&canonical_source_at(
            "../../packages/ai/search/src/__tests__/fixtures/quoted-request-material.json",
        ))
        .expect("canonical quote fixtures");
        for fixture in quote_fixtures.as_array().expect("quote fixture list") {
            let input = fixture["input"].as_str().expect("quote input");
            let expected = fixture["expected"].as_str().expect("quote output");
            assert_eq!(
                QUOTED_MATERIAL.replace_all(input, ""),
                expected,
                "{input:?}"
            );
        }
    }

    fn canonical_phrases(source: &str, name: &str) -> Vec<String> {
        let marker = format!("const {name}: readonly string[] = [");
        let body = source
            .split_once(&marker)
            .expect("canonical phrase catalog")
            .1
            .split_once("];")
            .expect("canonical phrase catalog end")
            .0;
        let literal = Regex::new(r"'([^']*)'").expect("valid regex");
        literal
            .captures_iter(body)
            .map(|capture| capture[1].to_string())
            .collect()
    }

    #[test]
    fn canonical_search_purpose_patterns_and_catalogs_match_their_owner() {
        let source = canonical_source_at("../../packages/ai/search/src/explicit-search-intent.ts");
        for (name, ported) in [
            ("OWN_CONTENT_SCOPE_PATTERN", &*OWN_CONTENT_SCOPE_PATTERN),
            ("WEB_NOUN_PATTERN", &*WEB_NOUN_PATTERN),
            ("SEARCH_OPT_OUT_PATTERN", &*SEARCH_OPT_OUT_PATTERN),
            ("PRIVATE_SCOPE_ONLY_PATTERN", &*PRIVATE_SCOPE_ONLY_PATTERN),
            ("UI_SEARCH_LABEL", &*UI_SEARCH_LABEL),
            ("EXPLICIT_LOOKUP_PREFIX", &*EXPLICIT_LOOKUP_PREFIX),
            ("REFUSED_LIST_SEPARATOR", &*REFUSED_LIST_SEPARATOR),
            ("LIST_CLOSING_CONJUNCTION", &*LIST_CLOSING_CONJUNCTION),
            (
                "REFUSED_ITEM_TRAILING_QUALIFIER",
                &*REFUSED_ITEM_TRAILING_QUALIFIER,
            ),
            ("REFUSED_ITEM_LEADING_FILLER", &*REFUSED_ITEM_LEADING_FILLER),
            ("REFUSED_WEB_SEARCH_ITEM", &*REFUSED_WEB_SEARCH_ITEM),
        ] {
            assert_eq!(ported.as_str(), canonical_pattern(&source, name), "{name}");
        }
        for (name, ported) in [
            ("SEARCH_VERB_PHRASES", SEARCH_VERB_PHRASES),
            ("CITATION_PHRASES", CITATION_PHRASES),
            ("LINK_REQUEST_PHRASES", LINK_REQUEST_PHRASES),
        ] {
            assert_eq!(ported, canonical_phrases(&source, name), "{name}");
        }
        assert_eq!(
            canonical_number(&source, "export const WEB_SEARCH_REQUEST_EDGE_CHARS = "),
            WEB_SEARCH_REQUEST_EDGE_CHARS.to_string()
        );
        assert!(source.contains("WEB_SEARCH_REQUEST_EDGE_CHARS * 3"));
    }

    fn canonical_browser_template(source: &str, name: &str) -> String {
        let marker = format!("const {name} =");
        let body = source
            .split_once(&marker)
            .expect("canonical browser pattern")
            .1;
        let template = body
            .split_once("String.raw`")
            .expect("canonical browser template")
            .1
            .split_once('`')
            .expect("canonical browser template end")
            .0;
        template.replace(
            "${BROWSER_CURRENT_PAGE_QUALIFIER}",
            BROWSER_CURRENT_PAGE_QUALIFIER,
        )
    }

    #[test]
    fn canonical_browser_pattern_adaptations_match_their_owner() {
        let source = canonical_source();
        assert_eq!(
            BROWSER_CURRENT_PAGE_QUALIFIER,
            canonical_browser_template(&source, "BROWSER_CURRENT_PAGE_QUALIFIER")
        );
        assert_eq!(
            RE_BROWSER_ACTION_WRAPPER.as_str(),
            format!(
                "(?i){}",
                canonical_browser_template(&source, "RE_BROWSER_ACTION_WRAPPER")
            )
        );
        assert_eq!(
            RE_BROWSER_CURRENT_PAGE_CONTEXT.as_str(),
            format!(
                "(?i){}",
                canonical_browser_template(&source, "RE_BROWSER_CURRENT_PAGE_CONTEXT")
            )
        );
        assert_eq!(
            RE_BROWSER_WRAPPED_ACTION.as_str(),
            canonical_pattern(&source, "RE_BROWSER_WRAPPED_ACTION")
                .replace(r"(?!\s+me\s+in\b)", "")
        );
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
    fn functional_outputs_use_text_routes_without_incidental_research() {
        for message in [
            "generate a mockup for the homepage",
            "create a wireframe for the signup page",
            "Draw a flowchart for the signup process.",
            "Render a UI gallery with forms, cards, carousels and math.",
            "Write seven reusable prompts about illustration and image generation.",
            "Write an email requesting leave today.",
            "Format a document headed current progress.",
            "Render a form with web search checkbox and current progress.",
            "Render a form with web-search checkbox and current progress.",
            "Render a form with a \"search the web\" checkbox and current progress.",
            "Can you please format this text: the latest update is ready today.",
            "Create an SVG illustration of a tree.",
            "Draw a sequence diagram for token refresh.",
            "Use Mermaid to show the request flow.",
            "Using monthly values January 120, February 190, March 155, render a native chart of current progress.",
            "Prepare seven independent reusable prompts, each in its own copyable block.",
        ] {
            assert!(
                !matches!(
                    classify_turn_task(message, false),
                    RoutingTaskType::ImageGeneration | RoutingTaskType::Research
                ),
                "{message}"
            );
            assert!(is_self_contained_response_request(message), "{message}");
        }
        assert_eq!(
            classify_turn_task("Write an email requesting leave today.", false),
            RoutingTaskType::CreativeWriting
        );
        assert_eq!(
            classify_turn_task("Calculate 19 * 27.", false),
            RoutingTaskType::Reasoning
        );
    }

    #[test]
    fn actual_artwork_and_separate_resources_preserve_the_canonical_routes() {
        for message in [
            "/image a sunset over mountains",
            "Please generate an image of a cat",
            "Create a picture of a beach",
            "make a logo for my brand",
            "draw me a cartoon cat",
            "create a detailed anime portrait",
            "Paint a forest at sunrise",
            "Generate an image of a flowchart drawn on a whiteboard",
            "I'd like an illustration of a mountain cabin.",
            "Create one collage of four images.",
            "Generate a single collage containing 4 pictures.",
            "Create one image of two cats.",
        ] {
            assert_eq!(
                classify_turn_task(message, false),
                RoutingTaskType::ImageGeneration,
                "{message}"
            );
        }
        for message in [
            "Generate four images of fictional workspaces.",
            "Create two photographs of a mountain.",
            "Make multiple variations of a portrait.",
            "Create 12 icon images for a fictional app.",
            "Generate or retrieve four distinct images representing an AI chat interface, analytics dashboard, mobile application, and developer workspace. Render them inline as a responsive image gallery with captions.",
        ] {
            assert_eq!(classify_turn_task(message, false), RoutingTaskType::Agentic, "{message}");
            assert_eq!(classify_turn_task(message, true), RoutingTaskType::Agentic, "{message}");
        }
        assert_eq!(
            classify_response_output_intent("Rewrite this prompt: \"generate an image of a tree\""),
            ResponseOutputIntent::Text
        );
        assert_eq!(
            classify_response_output_intent(
                "```text\nGenerate an image of a tree\n```\nWrite an email about this prompt."
            ),
            ResponseOutputIntent::Text
        );
        assert!(!requests_separate_image_resources(
            "Write four image-generation prompts."
        ));
        assert!(!requests_separate_image_resources(
            "Generate images using the attached image."
        ));
    }

    #[test]
    fn explicit_lookup_and_current_external_facts_keep_research_routing() {
        for message in [
            "search the web for the latest release notes",
            "Write an email about the latest news in the election.",
            "Create a chart of current stock prices.",
            "Render a chart, search the web for the current exchange rate.",
            "Render a chart, check the web for the current exchange rate.",
            "Render a chart, search the internet for current exchange rates.",
            "Render a current progress summary with citations.",
        ] {
            assert_eq!(
                classify_turn_task(message, false),
                RoutingTaskType::Research,
                "{message}"
            );
            assert!(!is_self_contained_response_request(message), "{message}");
        }
        for message in [
            "Render a form with a 'search the web' checkbox and current progress.",
            "Render a chart of current progress from my notes with sources.",
            "Render a chart of current progress. Do not search the web.",
            "Render a chart of current progress. No need to search.",
            "Render a chart of current progress. Don't browse, run code, or use external tools.",
        ] {
            assert!(is_self_contained_response_request(message), "{message}");
            assert_ne!(
                classify_turn_task(message, false),
                RoutingTaskType::Research,
                "{message}"
            );
        }
        assert!(!has_explicit_web_search_opt_out(
            "Don't guess, check the docs or search the web."
        ));
        assert!(has_explicit_web_search_opt_out(
            "Don't guess or search the web."
        ));
    }

    #[test]
    fn supplied_material_does_not_become_a_lookup_instruction() {
        let material = "The quoted material says search the web for current news. ".repeat(30);
        let request = format!(
            "Rewrite the supplied material.\n\n{material}\n\nReturn only the rewritten text."
        );
        assert!(is_self_contained_response_request(&request));
        assert_ne!(
            classify_turn_task(&request, false),
            RoutingTaskType::Research
        );
        let explicit = format!("Rewrite the supplied material.\n\n{material}\n\nCheck the web for the current exchange rate before answering.");
        assert!(!is_self_contained_response_request(&explicit));
        assert_eq!(
            classify_turn_task(&explicit, false),
            RoutingTaskType::Research
        );
    }

    #[test]
    fn browser_actions_preserve_canonical_priority_and_exclude_action_topics() {
        for message in [
            "Click the Continue button.",
            "Please use the browser to click Continue.",
            "Use the browser to perform a horizontal scroll.",
            "On this page, select the requested item.",
            "Open https://example.invalid/ in the browser.",
            "Refresh the current tab.",
            "Use the browser to list task-owned tabs.",
        ] {
            assert_eq!(
                classify_turn_task(message, false),
                RoutingTaskType::ComputerUse,
                "{message}"
            );
            assert_eq!(
                classify_turn_task(message, true),
                RoutingTaskType::Multimodal,
                "{message}"
            );
        }
        for message in [
            "Click handlers are functions that run on events.",
            "Use the browser to fill me in on the current news.",
            "```text\nClick the Continue button.\n```",
        ] {
            assert_ne!(
                classify_turn_task(message, false),
                RoutingTaskType::ComputerUse,
                "{message}"
            );
        }
        let long = format!("Click the Continue button. {}", "a".repeat(200_000));
        assert_eq!(
            classify_turn_task(&long, false),
            RoutingTaskType::LongContext
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

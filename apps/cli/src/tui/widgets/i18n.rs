//! Locale catalogs for the TUI overlays.
//!
//! Overlay chrome used to live in the render functions as English literals cut
//! to fixed box-drawing widths, so a translated build could not exist without
//! breaking the borders. Catalogs live in `apps/cli/locales/<code>.json` and
//! are embedded at build time: the CLI ships as a single relocatable binary and
//! must not look for data files beside itself.
//!
//! Scope, precisely: the chrome of the slash-command popup and the agent
//! picker. Identifiers echoed straight from agent frontmatter (`model:`,
//! `tools:`, `max_turns:`) and their config values stay in English because they
//! name text the user types into a file. Everything else still bakes English —
//! every other widget in this directory, and the `[global]`/`[user]`/`[project]`
//! scope badge the agent list gets from `crate::agents::agent_scope_label`.
//! This module is the mechanism; the migration is partial.

use std::collections::HashMap;
use std::sync::OnceLock;

/// Locale served when nothing else resolves, and the language every key is
/// authored in.
pub const DEFAULT_LOCALE: &str = "en";

/// Embedded catalogs, one per language in `packages/ui/i18n`'s
/// `SUPPORTED_LANGUAGES` at the time of writing. Nothing mechanically ties the
/// two lists — a Rust crate cannot read that TypeScript contract, and no check
/// compares them — so a language added upstream has to be added here by hand.
const CATALOGS: &[(&str, &str)] = &[
    ("ar", include_str!("../../../locales/ar.json")),
    ("de", include_str!("../../../locales/de.json")),
    ("en", include_str!("../../../locales/en.json")),
    ("es", include_str!("../../../locales/es.json")),
    ("fr", include_str!("../../../locales/fr.json")),
    ("hi", include_str!("../../../locales/hi.json")),
    ("it", include_str!("../../../locales/it.json")),
    ("ja", include_str!("../../../locales/ja.json")),
    ("ko", include_str!("../../../locales/ko.json")),
    ("pt", include_str!("../../../locales/pt.json")),
    ("ru", include_str!("../../../locales/ru.json")),
    ("zh", include_str!("../../../locales/zh.json")),
];

/// Environment variables consulted for the interface language, most specific
/// first. `AGI_WORKFORCE_LANG` exists so a user can translate the TUI without
/// re-pointing the locale their shell tools already depend on.
const LOCALE_ENV_VARS: [&str; 4] = ["AGI_WORKFORCE_LANG", "LC_ALL", "LC_MESSAGES", "LANG"];

/// A catalog key. The inner string is private to this module, so the only keys
/// a widget can pass to [`t`] are the constants in [`keys`]: a mistyped key is a
/// name that does not exist and fails to compile. Before this type, `t` took a
/// bare `&'static str` and a typo shipped green — rendering the raw key into the
/// overlay in *every* locale, English included.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Key(&'static str);

impl Key {
    fn as_str(self) -> &'static str {
        self.0
    }
}

/// Every key the overlays render. [`tests::declared_keys_and_english_catalog_agree`]
/// fails if this list and `locales/en.json` disagree in either direction, so a
/// constant can never name a string the catalogs do not define.
pub mod keys {
    use super::Key;

    pub const COMMAND_POPUP_TITLE: Key = Key("command_popup.title");
    pub const COMMAND_POPUP_EMPTY: Key = Key("command_popup.empty");
    pub const COMMAND_POPUP_HINT: Key = Key("command_popup.hint");
    pub const AGENT_PICKER_TITLE: Key = Key("agent_picker.title");
    pub const AGENT_PICKER_COUNT: Key = Key("agent_picker.count");
    pub const AGENT_PICKER_SEARCH_PLACEHOLDER: Key = Key("agent_picker.search_placeholder");
    pub const AGENT_PICKER_EMPTY_NO_AGENTS: Key = Key("agent_picker.empty_no_agents");
    pub const AGENT_PICKER_EMPTY_NO_MATCH: Key = Key("agent_picker.empty_no_match");
    pub const AGENT_PICKER_NO_DESCRIPTION: Key = Key("agent_picker.no_description");
    pub const AGENT_PICKER_NONE_SELECTED: Key = Key("agent_picker.none_selected");

    /// Declared keys, in one place so the catalogs can be checked against them.
    /// Test-only: the constants above carry the compile-time guarantee, this
    /// list only exists so the parity test can enumerate them.
    #[cfg(test)]
    pub(super) const ALL: &[Key] = &[
        COMMAND_POPUP_TITLE,
        COMMAND_POPUP_EMPTY,
        COMMAND_POPUP_HINT,
        AGENT_PICKER_TITLE,
        AGENT_PICKER_COUNT,
        AGENT_PICKER_SEARCH_PLACEHOLDER,
        AGENT_PICKER_EMPTY_NO_AGENTS,
        AGENT_PICKER_EMPTY_NO_MATCH,
        AGENT_PICKER_NO_DESCRIPTION,
        AGENT_PICKER_NONE_SELECTED,
    ];
}

fn catalogs() -> &'static HashMap<&'static str, HashMap<String, String>> {
    static PARSED: OnceLock<HashMap<&'static str, HashMap<String, String>>> = OnceLock::new();
    PARSED.get_or_init(|| {
        CATALOGS
            .iter()
            .map(|(code, raw)| {
                let entries: HashMap<String, String> = serde_json::from_str(raw)
                    .unwrap_or_else(|e| panic!("locales/{code}.json is not a string map: {e}"));
                (*code, entries)
            })
            .collect()
    })
}

/// Base language of a POSIX locale name (`pt_BR.UTF-8` → `pt`), or `None` when
/// no catalog covers it.
fn normalize(tag: &str) -> Option<&'static str> {
    let base = tag
        .split(['.', '@'])
        .next()
        .unwrap_or_default()
        .split(['_', '-'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    CATALOGS
        .iter()
        .map(|(code, _)| *code)
        .find(|code| *code == base)
}

/// Resolve the language from a variable lookup. The first variable that is set
/// and non-empty decides, so `LC_ALL=C` means English rather than falling
/// through to whatever `LANG` happens to say.
fn locale_from(lookup: impl Fn(&str) -> Option<String>) -> &'static str {
    for var in LOCALE_ENV_VARS {
        match lookup(var) {
            Some(value) if !value.is_empty() => return normalize(&value).unwrap_or(DEFAULT_LOCALE),
            _ => continue,
        }
    }
    DEFAULT_LOCALE
}

fn locale_from_env() -> &'static str {
    locale_from(|var| std::env::var(var).ok())
}

#[cfg(test)]
thread_local! {
    /// Per-thread language forced by [`with_locale`]. Rust runs each test on its
    /// own thread, so this isolates locale-sensitive tests from each other and
    /// from the developer's own `LANG`.
    static FORCED_LOCALE: std::cell::RefCell<Option<&'static str>> =
        const { std::cell::RefCell::new(None) };
}

fn active_locale() -> &'static str {
    #[cfg(test)]
    if let Some(forced) = FORCED_LOCALE.with(|cell| *cell.borrow()) {
        return forced;
    }
    static FROM_ENV: OnceLock<&'static str> = OnceLock::new();
    FROM_ENV.get_or_init(locale_from_env)
}

/// Run `body` with the interface language pinned, whatever the environment says.
#[cfg(test)]
pub fn with_locale<T>(locale: &'static str, body: impl FnOnce() -> T) -> T {
    FORCED_LOCALE.with(|cell| *cell.borrow_mut() = Some(locale));
    let result = body();
    FORCED_LOCALE.with(|cell| *cell.borrow_mut() = None);
    result
}

/// Translated string for `key`.
///
/// The lookup is fallible, so it needs an else-arm: a missing translation falls
/// back to English and then to the key text. Neither arm should fire in a
/// shipped build — the catalogs are embedded at compile time and the parity
/// tests below hold all twelve of them complete against `keys::ALL` — so they
/// are the total-function tail, not a coverage story.
pub fn t(key: Key) -> &'static str {
    let all = catalogs();
    all.get(active_locale())
        .and_then(|entries| entries.get(key.as_str()))
        .or_else(|| {
            all.get(DEFAULT_LOCALE)
                .and_then(|entries| entries.get(key.as_str()))
        })
        .map(String::as_str)
        .unwrap_or(key.as_str())
}

/// [`t`] with `{name}` placeholders substituted. Translations put the
/// placeholder wherever their grammar needs it, which is why counts are
/// interpolated instead of concatenated.
pub fn t_args(key: Key, args: &[(&str, &str)]) -> String {
    let mut out = t(key).to_string();
    for (name, value) in args {
        out = out.replace(&format!("{{{name}}}"), value);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    #[test]
    fn every_catalog_parses_and_covers_the_english_keys() {
        let all = catalogs();
        let english = all.get(DEFAULT_LOCALE).expect("en catalog");
        assert!(!english.is_empty(), "en catalog must not be empty");
        for (code, _) in CATALOGS {
            let entries = all.get(code).expect("catalog parsed");
            for key in english.keys() {
                let value = entries
                    .get(key)
                    .unwrap_or_else(|| panic!("locales/{code}.json is missing {key}"));
                assert!(
                    !value.trim().is_empty(),
                    "locales/{code}.json: {key} is blank"
                );
            }
            assert_eq!(
                entries.len(),
                english.len(),
                "locales/{code}.json has keys English does not"
            );
        }
    }

    /// The check that catalog-to-catalog parity cannot make: that the keys the
    /// widgets actually render are keys the catalogs actually define. Without
    /// it a typo'd key renders as its own text in every locale, English
    /// included, and every other test stays green.
    #[test]
    fn declared_keys_and_english_catalog_agree() {
        let declared: BTreeSet<&str> = keys::ALL.iter().map(|key| key.as_str()).collect();
        assert_eq!(
            declared.len(),
            keys::ALL.len(),
            "keys::ALL names the same key twice"
        );
        let defined: BTreeSet<&str> = catalogs()
            .get(DEFAULT_LOCALE)
            .expect("en catalog")
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            declared, defined,
            "keys::ALL and locales/en.json must name exactly the same keys"
        );
    }

    #[test]
    fn translations_resolve_per_locale() {
        assert_eq!(
            with_locale("en", || t(keys::COMMAND_POPUP_TITLE)),
            "Commands"
        );
        assert_eq!(
            with_locale("es", || t(keys::COMMAND_POPUP_TITLE)),
            "Comandos"
        );
        assert_eq!(
            with_locale("ja", || t(keys::AGENT_PICKER_TITLE)),
            "エージェント"
        );
    }

    #[test]
    fn placeholders_are_substituted_wherever_the_translation_puts_them() {
        assert_eq!(
            with_locale("en", || t_args(keys::AGENT_PICKER_COUNT, &[("count", "3")])),
            "3 agent(s)"
        );
        // Russian moves the number behind the noun; concatenation could not.
        assert_eq!(
            with_locale("ru", || t_args(keys::AGENT_PICKER_COUNT, &[("count", "3")])),
            "агентов: 3"
        );
    }

    #[test]
    fn the_first_variable_that_is_set_decides_the_language() {
        let env = |pairs: &'static [(&str, &str)]| {
            move |var: &str| {
                pairs
                    .iter()
                    .find(|(name, _)| *name == var)
                    .map(|(_, value)| (*value).to_string())
            }
        };

        assert_eq!(locale_from(env(&[("LANG", "de_DE.UTF-8")])), "de");
        // The product-specific override beats the shell's locale.
        assert_eq!(
            locale_from(env(&[
                ("AGI_WORKFORCE_LANG", "ja"),
                ("LANG", "de_DE.UTF-8")
            ])),
            "ja"
        );
        // `LC_ALL=C` is POSIX for "no localization" and must not fall through
        // to `LANG`.
        assert_eq!(
            locale_from(env(&[("LC_ALL", "C"), ("LANG", "fr_FR")])),
            "en"
        );
        // An empty variable is unset, not a request for English.
        assert_eq!(locale_from(env(&[("LC_ALL", ""), ("LANG", "fr_FR")])), "fr");
        assert_eq!(locale_from(env(&[])), DEFAULT_LOCALE);
    }

    #[test]
    fn posix_locale_names_reduce_to_their_base_language() {
        assert_eq!(normalize("pt_BR.UTF-8"), Some("pt"));
        assert_eq!(normalize("zh-Hans-CN"), Some("zh"));
        assert_eq!(normalize("DE_de@euro"), Some("de"));
        assert_eq!(normalize("C"), None);
        assert_eq!(normalize("sv_SE.UTF-8"), None);
    }
}

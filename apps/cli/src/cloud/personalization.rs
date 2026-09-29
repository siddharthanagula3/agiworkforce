use serde::Deserialize;
use serde_json::{json, Map, Value};

use super::client::{CloudClient, CloudError, Route};

pub const PREFERENCES_PATH: &str = "/api/settings/preferences";
const GENERAL: &str = "general";
const PERSONALIZATION: &str = "personalization";
const TRAIT_SCORES: [(&str, i64); 3] = [("less", 20), ("default", 50), ("more", 80)];

struct Field {
    name: &'static str,
    namespace: &'static str,
    key: &'static str,
    label: &'static str,
    kind: FieldKind,
}

enum FieldKind {
    Text(usize),
    Choice(&'static [&'static str]),
    Trait,
    Language,
}

const FIELDS: &[Field] = &[
    Field {
        name: "name",
        namespace: GENERAL,
        key: "preferredName",
        label: "What to call you",
        kind: FieldKind::Text(60),
    },
    Field {
        name: "work",
        namespace: GENERAL,
        key: "workDescription",
        label: "Your work or role",
        kind: FieldKind::Text(120),
    },
    Field {
        name: "about",
        namespace: GENERAL,
        key: "aboutYou",
        label: "About you",
        kind: FieldKind::Text(1500),
    },
    Field {
        name: "style",
        namespace: PERSONALIZATION,
        key: "style",
        label: "Response style",
        kind: FieldKind::Choice(&["default", "concise", "explanatory", "formal"]),
    },
    Field {
        name: "technical",
        namespace: PERSONALIZATION,
        key: "technicalLevel",
        label: "Technical level",
        kind: FieldKind::Choice(&["unspecified", "beginner", "intermediate", "expert"]),
    },
    Field {
        name: "formatting",
        namespace: PERSONALIZATION,
        key: "preferredFormatting",
        label: "Formatting",
        kind: FieldKind::Choice(&[
            "unspecified",
            "prose",
            "bullets",
            "headings_and_bullets",
            "tables_and_code",
        ]),
    },
    Field {
        name: "length",
        namespace: PERSONALIZATION,
        key: "preferredLength",
        label: "Length",
        kind: FieldKind::Choice(&["default", "shorter", "longer"]),
    },
    Field {
        name: "language",
        namespace: PERSONALIZATION,
        key: "responseLanguage",
        label: "Reply language",
        kind: FieldKind::Language,
    },
    Field {
        name: "warmth",
        namespace: PERSONALIZATION,
        key: "warmth",
        label: "Warmth",
        kind: FieldKind::Trait,
    },
    Field {
        name: "enthusiasm",
        namespace: PERSONALIZATION,
        key: "enthusiasm",
        label: "Enthusiasm",
        kind: FieldKind::Trait,
    },
    Field {
        name: "headings",
        namespace: PERSONALIZATION,
        key: "headersLists",
        label: "Headings and lists",
        kind: FieldKind::Trait,
    },
    Field {
        name: "emoji",
        namespace: PERSONALIZATION,
        key: "emoji",
        label: "Emoji",
        kind: FieldKind::Trait,
    },
];

#[derive(Deserialize)]
struct Preferences {
    #[serde(default)]
    settings: Map<String, Value>,
}

pub fn preferences_route() -> Route {
    Route::get(PREFERENCES_PATH)
}

pub fn save_route() -> Route {
    Route::put(PREFERENCES_PATH)
}

pub fn usage() -> String {
    let names: Vec<&str> = FIELDS.iter().map(|field| field.name).collect();
    format!(
        "Usage: /personalize [show] · /personalize set <field> <value> · /personalize clear <field>\nFields: {}\nTraits (warmth, enthusiasm, headings, emoji) take less, default or more. language takes auto or a tag such as fr or pt-BR.",
        names.join(", ")
    )
}

pub async fn run(arg: &str) -> Result<String, String> {
    let arg = arg.trim();
    let (action, rest) = arg.split_once(char::is_whitespace).unwrap_or((arg, ""));
    match action {
        "" | "show" => show().await.map_err(|error| error.to_string()),
        "set" => {
            let (name, value) = rest
                .trim()
                .split_once(char::is_whitespace)
                .ok_or_else(usage)?;
            save(name, Some(value.trim())).await
        }
        "clear" | "reset" => save(rest.trim(), None).await,
        _ => Err(usage()),
    }
}

async fn show() -> Result<String, CloudError> {
    let client = CloudClient::connect_managed()?;
    let preferences: Preferences = client.call(&preferences_route(), &[], None).await?;
    Ok(format_preferences(&preferences.settings, client.base()))
}

fn format_preferences(settings: &Map<String, Value>, base: &str) -> String {
    let mut lines = vec!["Personalization (your AGI Workforce account):".to_string()];
    for field in FIELDS {
        let value = settings
            .get(field.namespace)
            .and_then(|namespace| namespace.get(field.key));
        lines.push(format!(
            "  {:<11} {:<20} {}",
            field.name,
            field.label,
            display_value(field, value)
        ));
    }
    lines.push(String::new());
    lines.push(format!(
        "Managed Cloud chats on every surface follow these. Custom instructions: {base}/settings/general"
    ));
    lines.join("\n")
}

fn display_value(field: &Field, value: Option<&Value>) -> String {
    match (&field.kind, value) {
        (FieldKind::Trait, Some(Value::Number(score))) => {
            let score = score.as_f64().unwrap_or(50.0);
            if score <= 30.0 {
                "less".to_string()
            } else if score >= 70.0 {
                "more".to_string()
            } else {
                "default".to_string()
            }
        }
        (FieldKind::Trait, _) => "default".to_string(),
        (_, Some(Value::String(text))) if !text.trim().is_empty() => {
            crate::terminal_text::sanitize_terminal_text(text).into_owned()
        }
        _ => "not set".to_string(),
    }
}

async fn save(name: &str, value: Option<&str>) -> Result<String, String> {
    let field = FIELDS
        .iter()
        .find(|field| field.name == name)
        .ok_or_else(usage)?;
    let stored = match value {
        Some(value) => validate(field, value)?,
        None => Value::Null,
    };
    let client = CloudClient::connect_managed().map_err(|error| error.to_string())?;
    let body = json!({ "namespace": field.namespace, "patch": { field.key: stored } });
    let _: Value = client
        .call(&save_route(), &[], Some(&body))
        .await
        .map_err(|error| error.to_string())?;
    Ok(match value {
        Some(value) => format!("{} set to {}.", field.label, value),
        None => format!("{} cleared.", field.label),
    })
}

fn validate(field: &Field, value: &str) -> Result<Value, String> {
    match &field.kind {
        FieldKind::Text(limit) => {
            if value.is_empty() {
                return Err(format!("{} needs a value.", field.label));
            }
            if value.chars().count() > *limit {
                return Err(format!("{} is limited to {limit} characters.", field.label));
            }
            Ok(json!(value))
        }
        FieldKind::Choice(options) => {
            let value = if value == "default" && !options.contains(&"default") {
                "unspecified"
            } else {
                value
            };
            options
                .contains(&value)
                .then(|| json!(value))
                .ok_or_else(|| format!("{} takes one of: {}.", field.label, options.join(", ")))
        }
        FieldKind::Trait => TRAIT_SCORES
            .iter()
            .find(|(level, _)| *level == value)
            .map(|(_, score)| json!(score))
            .ok_or_else(|| format!("{} takes less, default or more.", field.label)),
        FieldKind::Language => {
            let valid = value == "auto"
                || value.split('-').enumerate().all(|(index, part)| {
                    let length = part.len();
                    part.chars().all(|c| c.is_ascii_alphanumeric())
                        && if index == 0 {
                            (2..=3).contains(&length)
                                && part.chars().all(|c| c.is_ascii_alphabetic())
                        } else {
                            (2..=8).contains(&length)
                        }
                });
            valid.then(|| json!(value)).ok_or_else(|| {
                "language takes auto or a language tag such as fr or pt-BR.".to_string()
            })
        }
    }
}

const CAPABILITIES_NAMESPACE: &str = "capabilities";
const MEMORY_SWITCH: &str = "memory";

pub async fn memory_switch(enabled: Option<bool>) -> Result<String, CloudError> {
    let client = CloudClient::connect_managed()?;
    if let Some(enabled) = enabled {
        let body =
            json!({ "namespace": CAPABILITIES_NAMESPACE, "patch": { MEMORY_SWITCH: enabled } });
        let _: Value = client.call(&save_route(), &[], Some(&body)).await?;
    }
    let preferences: Preferences = client
        .call(
            &preferences_route(),
            &[("namespace", CAPABILITIES_NAMESPACE.to_string())],
            None,
        )
        .await?;
    let on = preferences
        .settings
        .get(MEMORY_SWITCH)
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Ok(if on {
        "Memory is on: AGI remembers details across conversations on every surface.".to_string()
    } else {
        "Memory is off: nothing is carried from one conversation to the next on any surface."
            .to_string()
    })
}

const MEMORY_NAMESPACE: &str = "memory";
const EXCLUDED_TERMS: &str = "excludedTerms";

async fn excluded_terms(client: &CloudClient) -> Result<Vec<String>, CloudError> {
    let preferences: Preferences = client
        .call(
            &preferences_route(),
            &[("namespace", MEMORY_NAMESPACE.to_string())],
            None,
        )
        .await?;
    Ok(preferences
        .settings
        .get(EXCLUDED_TERMS)
        .and_then(Value::as_array)
        .map(|terms| {
            terms
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default())
}

pub async fn never_remember(add: &[String], remove: &[String]) -> Result<String, CloudError> {
    let client = CloudClient::connect_managed()?;
    let mut terms = excluded_terms(&client).await?;
    if add.is_empty() && remove.is_empty() {
        return Ok(format_terms(&terms));
    }
    for term in remove {
        let term = term.trim().to_lowercase();
        terms.retain(|existing| existing != &term);
    }
    for term in add {
        let term = term.trim().to_lowercase();
        if !term.is_empty() && !terms.contains(&term) {
            terms.push(term);
        }
    }
    let body = json!({ "namespace": MEMORY_NAMESPACE, "patch": { EXCLUDED_TERMS: terms } });
    let _: Value = client.call(&save_route(), &[], Some(&body)).await?;
    let saved = excluded_terms(&client).await?;
    let dropped: Vec<&String> = add
        .iter()
        .filter(|term| !saved.contains(&term.trim().to_lowercase()))
        .collect();
    let mut text = format_terms(&saved);
    if !dropped.is_empty() {
        text.push_str(&format!(
            "\nNot kept (too short, or the list is full): {}",
            dropped
                .iter()
                .map(|term| term.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    Ok(text)
}

fn format_terms(terms: &[String]) -> String {
    if terms.is_empty() {
        return "Nothing is on your never-remember list.".to_string();
    }
    format!(
        "Never remember anything mentioning ({}): {}",
        terms.len(),
        terms.join(", ")
    )
}

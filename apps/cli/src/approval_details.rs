use serde_json::Value;

const MAX_ARGUMENT_PREVIEW_CHARS: usize = 4_000;
const MAX_DETAIL_VALUE_CHARS: usize = 240;
const MAX_DEPTH: usize = 4;

const RECIPIENT_KEYS: &[&str] = &[
    "to",
    "cc",
    "bcc",
    "recipient",
    "recipients",
    "toemail",
    "toemails",
    "toaddress",
    "sendto",
    "replyto",
    "channel",
    "channelid",
    "channelname",
    "chatid",
    "conversationid",
    "phone",
    "phonenumber",
    "tonumber",
    "attendees",
    "invitees",
    "participants",
];
const SUBJECT_KEYS: &[&str] = &["subject"];
const AMOUNT_KEYS: &[&str] = &[
    "amount",
    "amountcents",
    "unitamount",
    "price",
    "total",
    "totalprice",
    "currency",
    "quantity",
];
const PURCHASE_KEYS: &[&str] = &["lineitems", "sku", "priceid", "productid", "variantid"];
const PURCHASE_KEYS_WITH_AMOUNT: &[&str] = &["items", "product", "plan"];
const NAMING_FIELDS: [&str; 6] = ["email", "address", "name", "title", "id", "number"];

pub(crate) fn approval_detail(args: &Value) -> Vec<String> {
    let mut detail = key_details(args);
    if !detail.is_empty() {
        detail.push(String::new());
    }
    detail.push(argument_preview(args));
    detail
}

pub(crate) fn argument_preview(args: &Value) -> String {
    let preview = serde_json::to_string_pretty(args)
        .unwrap_or_else(|_| "<arguments unavailable>".to_string());
    if preview.chars().count() <= MAX_ARGUMENT_PREVIEW_CHARS {
        return preview;
    }
    let mut truncated: String = preview.chars().take(MAX_ARGUMENT_PREVIEW_CHARS).collect();
    truncated.push_str("\n… truncated");
    truncated
}

pub(crate) fn key_details(args: &Value) -> Vec<String> {
    let mut found = Found::default();
    found.collect(args, "", 0);
    if !found.amounts.is_empty() {
        let guarded = std::mem::take(&mut found.guarded);
        found.purchases.extend(guarded);
    }
    [
        ("Who receives it", found.recipients),
        ("Subject", found.subjects),
        ("Amount", found.amounts),
        ("What is bought", found.purchases),
    ]
    .into_iter()
    .filter(|(_, entries)| !entries.is_empty())
    .map(|(label, entries)| format!("{label}: {}", entries.join("; ")))
    .collect()
}

#[derive(Default)]
struct Found {
    recipients: Vec<String>,
    subjects: Vec<String>,
    amounts: Vec<String>,
    purchases: Vec<String>,
    guarded: Vec<String>,
}

impl Found {
    fn bucket(&mut self, key: &str) -> Option<&mut Vec<String>> {
        let key = normalize_key(key);
        let key = key.as_str();
        if RECIPIENT_KEYS.contains(&key) {
            Some(&mut self.recipients)
        } else if SUBJECT_KEYS.contains(&key) {
            Some(&mut self.subjects)
        } else if AMOUNT_KEYS.contains(&key) {
            Some(&mut self.amounts)
        } else if PURCHASE_KEYS.contains(&key) {
            Some(&mut self.purchases)
        } else if PURCHASE_KEYS_WITH_AMOUNT.contains(&key) {
            Some(&mut self.guarded)
        } else {
            None
        }
    }

    fn collect(&mut self, value: &Value, path: &str, depth: usize) {
        if depth > MAX_DEPTH {
            return;
        }
        match value {
            Value::Object(map) => {
                for (key, child) in map {
                    let label = if path.is_empty() {
                        key.clone()
                    } else {
                        format!("{path}.{key}")
                    };
                    match self.bucket(key) {
                        Some(bucket) => {
                            if let Some(text) = describe(child) {
                                bucket.push(format!("{label}: {text}"));
                            }
                        }
                        None => self.collect(child, &label, depth + 1),
                    }
                }
            }
            Value::Array(items) => {
                for item in items {
                    self.collect(item, path, depth + 1);
                }
            }
            _ => {}
        }
    }
}

fn normalize_key(key: &str) -> String {
    key.chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

fn describe(value: &Value) -> Option<String> {
    let text = match value {
        Value::Null => return None,
        Value::String(text) if text.trim().is_empty() => return None,
        Value::String(text) => text.trim().to_string(),
        Value::Number(number) => number.to_string(),
        Value::Bool(flag) => flag.to_string(),
        Value::Array(items) if items.is_empty() => return None,
        Value::Array(items) => items
            .iter()
            .filter_map(describe_item)
            .collect::<Vec<_>>()
            .join(", "),
        Value::Object(_) => describe_item(value)?,
    };
    Some(clip(&crate::terminal_text::sanitize_terminal_text(&text)))
}

fn describe_item(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            let named = NAMING_FIELDS.iter().find_map(|field| {
                map.get(*field).and_then(|named| match named {
                    Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_string()),
                    Value::Number(number) => Some(number.to_string()),
                    _ => None,
                })
            });
            Some(named.unwrap_or_else(|| value.to_string()))
        }
        Value::String(text) if !text.trim().is_empty() => Some(text.trim().to_string()),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn clip(text: &str) -> String {
    if text.chars().count() <= MAX_DETAIL_VALUE_CHARS {
        return text.to_string();
    }
    let mut clipped: String = text.chars().take(MAX_DETAIL_VALUE_CHARS).collect();
    clipped.push('…');
    clipped
}

use mailparse::{parse_mail, MailHeaderMap, ParsedMail};
use once_cell::sync::Lazy;
use regex::Regex;
use std::path::Path;
use tokio::fs;
use tracing::debug;

use super::{EmailAddress, EmailAttachment};
use crate::sys::error::{Error, Result};

static SCRIPT_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(?i)<script[^>]*>.*?</script>").expect("valid regex: script tag pattern")
});
static EVENT_HANDLER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*')"#)
        .expect("valid regex: event handler pattern")
});
static JAVASCRIPT_URI_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)javascript:").expect("valid regex: javascript URI pattern"));

pub struct ParsedEmail {
    pub message_id: String,
    pub subject: String,
    pub from: EmailAddress,
    pub to: Vec<EmailAddress>,
    pub cc: Vec<EmailAddress>,
    pub bcc: Vec<EmailAddress>,
    pub reply_to: Option<EmailAddress>,
    pub date: i64,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub attachments: Vec<EmailAttachment>,
}

pub fn parse_email(raw_email: &[u8]) -> Result<ParsedEmail> {
    let parsed = parse_mail(raw_email)
        .map_err(|e| Error::Generic(format!("Failed to parse email: {}", e)))?;

    let headers = &parsed.headers;

    let message_id = headers
        .get_first_value("Message-ID")
        .unwrap_or_else(|| format!("<unknown-{}>", uuid::Uuid::new_v4()));

    let subject = headers
        .get_first_value("Subject")
        .unwrap_or_else(|| "(No subject)".to_string());

    let from = parse_email_address(
        &headers
            .get_first_value("From")
            .unwrap_or_else(|| "unknown@unknown".to_string()),
    );

    let to = parse_email_address_list(&headers.get_first_value("To").unwrap_or_default());

    let cc = parse_email_address_list(&headers.get_first_value("Cc").unwrap_or_default());

    let bcc = parse_email_address_list(&headers.get_first_value("Bcc").unwrap_or_default());

    let reply_to = headers
        .get_first_value("Reply-To")
        .map(|addr| parse_email_address(&addr));

    let date = headers
        .get_first_value("Date")
        .and_then(|d| chrono::DateTime::parse_from_rfc2822(&d).ok())
        .map(|d| d.timestamp())
        .unwrap_or_else(|| chrono::Utc::now().timestamp());

    let (body_text, body_html, attachments) = extract_body_parts(&parsed)?;

    Ok(ParsedEmail {
        message_id,
        subject,
        from,
        to,
        cc,
        bcc,
        reply_to,
        date,
        body_text,
        body_html,
        attachments,
    })
}

fn extract_body_parts(
    mail: &ParsedMail,
) -> Result<(Option<String>, Option<String>, Vec<EmailAttachment>)> {
    let mut body_text = None;
    let mut body_html = None;
    let mut attachments = Vec::new();

    extract_parts_recursive(mail, &mut body_text, &mut body_html, &mut attachments)?;

    Ok((body_text, body_html, attachments))
}

fn extract_parts_recursive(
    mail: &ParsedMail,
    body_text: &mut Option<String>,
    body_html: &mut Option<String>,
    attachments: &mut Vec<EmailAttachment>,
) -> Result<()> {
    let content_type = mail.ctype.mimetype.to_lowercase();
    let disposition = mail.get_content_disposition();

    use mailparse::DispositionType;
    let is_attachment = matches!(disposition.disposition, DispositionType::Attachment)
        || mail.ctype.params.contains_key("name");

    if is_attachment {
        let filename = mail
            .ctype
            .params
            .get("name")
            .or_else(|| disposition.params.get("filename"))
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("attachment_{}", uuid::Uuid::new_v4()));

        let content_id = mail.headers.get_first_value("Content-ID");

        let body_raw = mail
            .get_body_raw()
            .map_err(|e| Error::Generic(format!("Failed to get attachment body: {}", e)))?;

        let attachment = EmailAttachment {
            filename,
            content_type: content_type.clone(),
            size: body_raw.len(),
            content_id,
            file_path: None,
        };

        attachments.push(attachment);
        return Ok(());
    }

    match content_type.as_str() {
        "text/plain" if body_text.is_none() => {
            *body_text = Some(
                mail.get_body()
                    .map_err(|e| Error::Generic(format!("Failed to get text body: {}", e)))?,
            );
        }
        "text/html" if body_html.is_none() => {
            *body_html = Some(
                mail.get_body()
                    .map_err(|e| Error::Generic(format!("Failed to get HTML body: {}", e)))?,
            );
        }
        _ if content_type.starts_with("multipart/") => {
            for subpart in &mail.subparts {
                extract_parts_recursive(subpart, body_text, body_html, attachments)?;
            }
        }
        _ => {
            debug!("Ignoring part with content type: {}", content_type);
        }
    }

    Ok(())
}

fn parse_email_address(addr_str: &str) -> EmailAddress {
    let addr_str = addr_str.trim();

    let bracketed = addr_str.find('<').and_then(|open| {
        let rest = addr_str.get(open + 1..)?;
        let close = open + 1 + rest.find('>')?;
        let email = addr_str.get(open + 1..close)?.trim().to_string();
        let name = addr_str.get(..open)?.trim().to_string();

        Some(EmailAddress {
            email,
            name: if name.is_empty() { None } else { Some(name) },
        })
    });

    bracketed.unwrap_or_else(|| EmailAddress {
        email: addr_str.to_string(),
        name: None,
    })
}

fn parse_email_address_list(addr_list: &str) -> Vec<EmailAddress> {
    if addr_list.is_empty() {
        return Vec::new();
    }

    addr_list
        .split(',')
        .map(|s| parse_email_address(s.trim()))
        .collect()
}

pub async fn save_attachment<'a>(
    mail: &'a ParsedMail<'a>,
    attachment_index: usize,
) -> Result<String> {
    debug!("Saving attachment {}", attachment_index);

    let temp_dir = std::env::temp_dir()
        .join("agiworkforce")
        .join("attachments");
    fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| Error::Generic(format!("Failed to create temp directory: {}", e)))?;

    let mut current_index = 0;
    let attachment_part = find_attachment_recursive(mail, attachment_index, &mut current_index)
        .ok_or_else(|| Error::Generic(format!("Attachment {} not found", attachment_index)))?;

    let attachment_disposition = attachment_part.get_content_disposition();
    let filename = attachment_part
        .ctype
        .params
        .get("name")
        .map(|s| s.to_string())
        .or_else(|| {
            attachment_disposition
                .params
                .get("filename")
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| format!("attachment_{}", uuid::Uuid::new_v4()));

    let filename = sanitize_attachment_filename(&filename);
    let file_path = temp_dir.join(&filename);
    let content = attachment_part
        .get_body_raw()
        .map_err(|e| Error::Generic(format!("Failed to get attachment content: {}", e)))?;

    fs::write(&file_path, content)
        .await
        .map_err(|e| Error::Generic(format!("Failed to save attachment: {}", e)))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Reduces a sender-supplied attachment name to a single safe path segment.
/// Returns a generated name when nothing usable survives.
fn sanitize_attachment_filename(raw: &str) -> String {
    Path::new(raw)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.trim())
        .filter(|name| !name.is_empty() && *name != "." && *name != ".." && !name.contains('\0'))
        .map(|name| name.to_string())
        .unwrap_or_else(|| format!("attachment_{}", uuid::Uuid::new_v4()))
}

fn find_attachment_recursive<'a>(
    mail: &'a ParsedMail<'a>,
    target_index: usize,
    current_index: &mut usize,
) -> Option<&'a ParsedMail<'a>> {
    use mailparse::DispositionType;
    let disposition = mail.get_content_disposition();
    let is_attachment = matches!(disposition.disposition, DispositionType::Attachment)
        || mail.ctype.params.contains_key("name");

    if is_attachment {
        if *current_index == target_index {
            return Some(mail);
        }
        *current_index += 1;
    }

    for subpart in &mail.subparts {
        if let Some(found) = find_attachment_recursive(subpart, target_index, current_index) {
            return Some(found);
        }
    }

    None
}

pub fn sanitize_html(html: &str) -> String {
    let mut sanitized = html.to_string();

    sanitized = SCRIPT_TAG_RE.replace_all(&sanitized, "").to_string();

    sanitized = EVENT_HANDLER_RE.replace_all(&sanitized, "").to_string();

    sanitized = JAVASCRIPT_URI_RE.replace_all(&sanitized, "").to_string();

    sanitized
}

#[cfg(test)]
mod tests {

    #[test]
    fn an_absolute_attachment_name_is_reduced_to_its_last_segment() {
        assert_eq!(
            sanitize_attachment_filename("/Users/x/Library/LaunchAgents/evil.plist"),
            "evil.plist"
        );
    }

    #[test]
    fn a_traversing_attachment_name_keeps_only_the_name() {
        assert_eq!(
            sanitize_attachment_filename("../../../etc/cron.d/evil"),
            "evil"
        );
        assert_eq!(
            sanitize_attachment_filename("a/../b/report.pdf"),
            "report.pdf"
        );
    }

    #[test]
    fn a_name_with_nothing_usable_gets_a_generated_one() {
        for hostile in ["..", ".", "", "   ", "/", "with\0nul"] {
            let safe = sanitize_attachment_filename(hostile);
            assert!(
                safe.starts_with("attachment_"),
                "{hostile:?} produced {safe:?}"
            );
        }
    }

    #[test]
    fn an_ordinary_name_is_left_alone() {
        assert_eq!(
            sanitize_attachment_filename("quarterly report.pdf"),
            "quarterly report.pdf"
        );
    }
    use super::*;

    #[test]
    fn test_parse_email_address() {
        let addr = parse_email_address("John Doe <john@example.com>");
        assert_eq!(addr.email, "john@example.com");
        assert_eq!(addr.name, Some("John Doe".to_string()));

        let addr2 = parse_email_address("test@example.com");
        assert_eq!(addr2.email, "test@example.com");
        assert_eq!(addr2.name, None);
    }

    #[test]
    fn test_parse_email_address_list() {
        let addrs = parse_email_address_list("john@example.com, Jane Doe <jane@example.com>");
        assert_eq!(addrs.len(), 2);
        assert_eq!(addrs[0].email, "john@example.com");
        assert_eq!(addrs[1].email, "jane@example.com");
        assert_eq!(addrs[1].name, Some("Jane Doe".to_string()));
    }

    #[test]
    fn a_closing_bracket_before_the_opening_one_does_not_panic() {
        let addr = parse_email_address(">a<attacker@example.com>");
        assert_eq!(addr.email, "attacker@example.com");
        assert_eq!(addr.name, Some(">a".to_string()));
    }

    #[test]
    fn an_unclosed_bracket_falls_back_to_the_whole_string() {
        let addr = parse_email_address("a>b");
        assert_eq!(addr.email, "a>b");
        assert_eq!(addr.name, None);

        let addr2 = parse_email_address("Name <no-close@example.com");
        assert_eq!(addr2.email, "Name <no-close@example.com");
        assert_eq!(addr2.name, None);
    }

    #[test]
    fn a_multibyte_display_name_is_preserved() {
        let addr = parse_email_address("Zoë Ünicode 🙂 <zoe@example.com>");
        assert_eq!(addr.email, "zoe@example.com");
        assert_eq!(addr.name, Some("Zoë Ünicode 🙂".to_string()));

        let hostile = parse_email_address("é>ß<a@b.example>");
        assert_eq!(hostile.email, "a@b.example");
        assert_eq!(hostile.name, Some("é>ß".to_string()));
    }

    #[test]
    fn a_reversed_bracket_entry_in_a_list_does_not_panic() {
        let addrs = parse_email_address_list(">x<a@example.com>, Jane <jane@example.com>");
        assert_eq!(addrs.len(), 2);
        assert_eq!(addrs[0].email, "a@example.com");
        assert_eq!(addrs[1].email, "jane@example.com");
    }

    #[test]
    fn test_sanitize_html() {
        let html =
            r#"<html><script>alert('xss')</script><body onclick="alert('xss')">Test</body></html>"#;
        let sanitized = sanitize_html(html);
        assert!(!sanitized.contains("<script"));
        assert!(!sanitized.contains("onclick"));
    }
}

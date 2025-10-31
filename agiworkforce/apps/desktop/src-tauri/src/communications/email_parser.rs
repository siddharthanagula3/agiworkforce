use mailparse::{parse_mail, MailHeaderMap, ParsedMail};
use std::path::Path;
use tokio::fs;
use tracing::{debug, warn};

use super::{EmailAddress, EmailAttachment};
use crate::error::{Error, Result};

/// Parsed email structure
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

/// Parse an email from raw bytes
pub fn parse_email(raw_email: &[u8]) -> Result<ParsedEmail> {
    let parsed = parse_mail(raw_email)
        .map_err(|e| Error::Generic(format!("Failed to parse email: {}", e)))?;

    let headers = &parsed.headers;

    // Extract headers
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

    // Parse date
    let date = headers
        .get_first_value("Date")
        .and_then(|d| chrono::DateTime::parse_from_rfc2822(&d).ok())
        .map(|d| d.timestamp())
        .unwrap_or_else(|| chrono::Utc::now().timestamp());

    // Extract body parts
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

/// Extract body parts and attachments from parsed email
fn extract_body_parts(
    mail: &ParsedMail,
) -> Result<(Option<String>, Option<String>, Vec<EmailAttachment>)> {
    let mut body_text = None;
    let mut body_html = None;
    let mut attachments = Vec::new();

    extract_parts_recursive(mail, &mut body_text, &mut body_html, &mut attachments)?;

    Ok((body_text, body_html, attachments))
}

/// Recursively extract parts from multipart MIME
fn extract_parts_recursive(
    mail: &ParsedMail,
    body_text: &mut Option<String>,
    body_html: &mut Option<String>,
    attachments: &mut Vec<EmailAttachment>,
) -> Result<()> {
    let content_type = mail.ctype.mimetype.to_lowercase();
    let disposition = mail.get_content_disposition();

    // Check if this is an attachment (DispositionType is an enum)
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
            file_path: None, // Will be set when saved
        };

        attachments.push(attachment);
        return Ok(());
    }

    // Extract body content
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
            // Recurse into subparts
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

/// Parse a single email address (e.g., "John Doe <john@example.com>")
fn parse_email_address(addr_str: &str) -> EmailAddress {
    let addr_str = addr_str.trim();

    // Try to parse "Name <email>" format
    if let Some(start) = addr_str.find('<') {
        if let Some(end) = addr_str.find('>') {
            let name = addr_str[..start].trim().to_string();
            let email = addr_str[start + 1..end].trim().to_string();

            return EmailAddress {
                email,
                name: if name.is_empty() { None } else { Some(name) },
            };
        }
    }

    // Fallback: just an email address
    EmailAddress {
        email: addr_str.to_string(),
        name: None,
    }
}

/// Parse a comma-separated list of email addresses
fn parse_email_address_list(addr_list: &str) -> Vec<EmailAddress> {
    if addr_list.is_empty() {
        return Vec::new();
    }

    addr_list
        .split(',')
        .map(|s| parse_email_address(s.trim()))
        .collect()
}

/// Save email attachment to temp directory
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

    // Find the attachment
    let mut current_index = 0;
    let attachment_part = find_attachment_recursive(mail, attachment_index, &mut current_index)
        .ok_or_else(|| Error::Generic(format!("Attachment {} not found", attachment_index)))?;

    // Get filename
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

    // Save to file
    let file_path = temp_dir.join(&filename);
    let content = attachment_part
        .get_body_raw()
        .map_err(|e| Error::Generic(format!("Failed to get attachment content: {}", e)))?;

    fs::write(&file_path, content)
        .await
        .map_err(|e| Error::Generic(format!("Failed to save attachment: {}", e)))?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Find attachment by index recursively
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

    // Recurse into subparts
    for subpart in &mail.subparts {
        if let Some(found) = find_attachment_recursive(subpart, target_index, current_index) {
            return Some(found);
        }
    }

    None
}

/// Sanitize HTML for safe rendering in iframe
pub fn sanitize_html(html: &str) -> String {
    // Basic HTML sanitization - remove script tags and dangerous attributes
    let mut sanitized = html.to_string();

    // Remove script tags
    sanitized = regex::Regex::new(r"(?i)<script[^>]*>.*?</script>")
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();

    // Remove event handlers
    sanitized = regex::Regex::new(r#"(?i)\s+on\w+\s*=\s*"[^"]*""#)
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();

    // Remove javascript: URLs
    sanitized = regex::Regex::new(r"(?i)javascript:")
        .unwrap()
        .replace_all(&sanitized, "")
        .to_string();

    sanitized
}

#[cfg(test)]
mod tests {
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
    fn test_sanitize_html() {
        let html =
            r#"<html><script>alert('xss')</script><body onclick="alert('xss')">Test</body></html>"#;
        let sanitized = sanitize_html(html);
        assert!(!sanitized.contains("<script"));
        assert!(!sanitized.contains("onclick"));
    }
}

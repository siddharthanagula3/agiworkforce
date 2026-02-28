//! Email operations executor.
//!
//! Handles email operations including sending and fetching emails.
//! Supports IMAP/SMTP for standard email providers and OAuth for Gmail.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;

/// Executor for email operations.
///
/// This executor handles email send and fetch operations through the
/// configured email accounts. It supports:
/// - SMTP sending with attachments
/// - IMAP fetching with filters
/// - OAuth for Gmail accounts
pub struct EmailExecutor;

impl EmailExecutor {
    /// Create a new email executor.
    #[must_use]
    pub fn new() -> Self {
        Self
    }
}

impl Default for EmailExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for EmailExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["email_send", "email_fetch"]
    }

    fn description(&self) -> &'static str {
        "Email operations executor for sending and fetching emails via IMAP/SMTP"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "email_send" => execute_send(parameters, context).await,
            "email_fetch" => execute_fetch(parameters, context).await,
            _ => Err(anyhow!("Unknown email tool: {}", tool_name)),
        }
    }
}

/// Execute email_send operation.
///
/// Sends an email using the configured email account via SMTP.
///
/// # Parameters
/// - `to` (required): Comma-separated list of recipient email addresses
/// - `subject` (required): Email subject line
/// - `body` (required): Email body content (plain text)
/// - `body_html` (optional): HTML body content
/// - `cc` (optional): Comma-separated list of CC recipients
/// - `bcc` (optional): Comma-separated list of BCC recipients
/// - `reply_to` (optional): Reply-to email address
/// - `attachments` (optional): Array of file paths to attach
/// - `account_id` (optional): Specific account ID to use (defaults to first account)
async fn execute_send(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let to = parameters
        .get("to")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'to' parameter"))?;
    let subject = parameters
        .get("subject")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'subject' parameter"))?;
    let body = parameters
        .get("body")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing 'body' parameter"))?;

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!("App handle not available for email send"));
    };

    use crate::features::communications::EmailAddress;
    use crate::sys::commands::email::{email_list_accounts, email_send, SendEmailRequest};

    // Get account list
    let accounts = email_list_accounts(app.clone()).await.map_err(|e| {
        anyhow!(
            "Failed to list email accounts: {}. Please connect an email account first using email_connect.",
            e
        )
    })?;

    if accounts.is_empty() {
        return Err(anyhow!(
            "No email accounts configured. Please connect an email account first using email_connect command."
        ));
    }

    // Select account - either by specified ID or use first available
    let account = if let Some(account_id_val) = parameters.get("account_id") {
        let account_id: i64 = if let Some(id) = account_id_val.as_i64() {
            id
        } else if let Some(id_str) = account_id_val.as_str() {
            id_str
                .parse()
                .map_err(|_| anyhow!("Invalid account_id format. Must be a number."))?
        } else {
            return Err(anyhow!("Invalid account_id format. Must be a number."));
        };

        accounts
            .iter()
            .find(|a| a.id == account_id)
            .ok_or_else(|| anyhow!("Email account with id {} not found", account_id))?
    } else {
        &accounts[0]
    };

    // Parse recipient addresses
    let to_addresses: Vec<EmailAddress> = to
        .split(',')
        .map(|addr| parse_email_address(addr.trim()))
        .collect();

    // Parse CC addresses
    let cc_addresses: Vec<EmailAddress> = parameters
        .get("cc")
        .and_then(|v| v.as_str())
        .map(|cc| {
            cc.split(',')
                .map(|addr| parse_email_address(addr.trim()))
                .collect()
        })
        .unwrap_or_default();

    // Parse BCC addresses
    let bcc_addresses: Vec<EmailAddress> = parameters
        .get("bcc")
        .and_then(|v| v.as_str())
        .map(|bcc| {
            bcc.split(',')
                .map(|addr| parse_email_address(addr.trim()))
                .collect()
        })
        .unwrap_or_default();

    // Parse reply-to address
    let reply_to = parameters
        .get("reply_to")
        .and_then(|v| v.as_str())
        .map(|addr| parse_email_address(addr.trim()));

    // Parse HTML body
    let body_html = parameters.get("body_html").and_then(|v| v.as_str());

    // Parse attachments - can be array of strings or comma-separated string
    let attachments: Vec<String> =
        if let Some(arr) = parameters.get("attachments").and_then(|v| v.as_array()) {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        } else if let Some(att_str) = parameters.get("attachments").and_then(|v| v.as_str()) {
            if att_str.is_empty() {
                vec![]
            } else {
                att_str.split(',').map(|s| s.trim().to_string()).collect()
            }
        } else {
            vec![]
        };

    // Validate attachment paths exist
    for path in &attachments {
        if !std::path::Path::new(path).exists() {
            return Err(anyhow!("Attachment file not found: {}", path));
        }
    }

    let send_request = SendEmailRequest {
        account_id: account.id,
        to: to_addresses,
        cc: cc_addresses,
        bcc: bcc_addresses,
        reply_to,
        subject: subject.to_string(),
        body_text: Some(body.to_string()),
        body_html: body_html.map(String::from),
        attachments,
    };

    let message_id = email_send(app.clone(), send_request)
        .await
        .map_err(|e| anyhow!("Email send failed: {}", e))?;

    tracing::info!(
        "[EmailExecutor] Email sent successfully: message_id={}, to={}, subject={}",
        message_id,
        to,
        subject
    );

    Ok(json!({
        "success": true,
        "message_id": message_id,
        "to": to,
        "subject": subject,
        "from": account.email,
        "has_attachments": !parameters.get("attachments").map(|v| v.is_null()).unwrap_or(true)
    }))
}

/// Execute email_fetch operation.
///
/// Fetches emails from the inbox of a configured email account via IMAP.
///
/// # Parameters
/// - `account_id` (required): The ID of the email account to fetch from
/// - `limit` (optional): Maximum number of emails to fetch (default: 10, max: 100)
/// - `folder` (optional): IMAP folder to fetch from (default: "INBOX")
/// - `unread_only` (optional): Only fetch unread emails (default: false)
/// - `from` (optional): Filter by sender email/name
/// - `subject_contains` (optional): Filter by subject containing text
/// - `date_from` (optional): Filter by date (Unix timestamp) - emails after this date
/// - `date_to` (optional): Filter by date (Unix timestamp) - emails before this date
/// - `has_attachments` (optional): Filter by whether email has attachments
async fn execute_fetch(
    parameters: &HashMap<String, Value>,
    context: &ExecutorContext,
) -> Result<Value> {
    let account_id_val = parameters
        .get("account_id")
        .ok_or_else(|| anyhow!("Missing 'account_id' parameter"))?;

    let account_id: i64 = if let Some(id) = account_id_val.as_i64() {
        id
    } else if let Some(id_str) = account_id_val.as_str() {
        id_str
            .parse()
            .map_err(|_| anyhow!("Invalid account_id format. Must be a number."))?
    } else {
        return Err(anyhow!("Invalid account_id format. Must be a number."));
    };

    let limit = parameters
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|l| l.min(100) as usize)
        .unwrap_or(10);

    let folder = parameters
        .get("folder")
        .and_then(|v| v.as_str())
        .map(String::from);

    let Some(ref app) = context.app_handle else {
        return Err(anyhow!("App handle not available for email fetch"));
    };

    use crate::sys::commands::email::email_fetch_inbox;

    // Build filter from parameters
    let filter = build_email_filter(parameters);

    let emails = email_fetch_inbox(app.clone(), account_id, folder.clone(), Some(limit), filter)
        .await
        .map_err(|e| {
            anyhow!(
                "Failed to fetch emails: {}. Ensure the account is connected.",
                e
            )
        })?;

    tracing::info!(
        "[EmailExecutor] Fetched {} emails for account_id={}, folder={}",
        emails.len(),
        account_id,
        folder.as_deref().unwrap_or("INBOX")
    );

    // Serialize emails for response
    let emails_json =
        serde_json::to_value(&emails).map_err(|e| anyhow!("Failed to serialize emails: {}", e))?;

    Ok(json!({
        "success": true,
        "account_id": account_id,
        "folder": folder.unwrap_or_else(|| "INBOX".to_string()),
        "count": emails.len(),
        "emails": emails_json
    }))
}

/// Parse an email address string that may include a display name.
///
/// Handles formats like:
/// - "user@example.com"
/// - "John Doe <user@example.com>"
fn parse_email_address(input: &str) -> crate::features::communications::EmailAddress {
    use crate::features::communications::EmailAddress;

    let input = input.trim();

    // Check for "Name <email>" format
    if let Some(start) = input.find('<') {
        if let Some(end) = input.find('>') {
            let name = input[..start].trim();
            let email = input[start + 1..end].trim();
            return EmailAddress::new(
                email.to_string(),
                if name.is_empty() {
                    None
                } else {
                    Some(name.to_string())
                },
            );
        }
    }

    // Simple email address
    EmailAddress::new(input.to_string(), None)
}

/// Build an email filter from the parameters map.
fn build_email_filter(
    parameters: &HashMap<String, Value>,
) -> Option<crate::features::communications::EmailFilter> {
    use crate::features::communications::EmailFilter;

    let unread_only = parameters
        .get("unread_only")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let date_from = parameters.get("date_from").and_then(|v| v.as_i64());

    let date_to = parameters.get("date_to").and_then(|v| v.as_i64());

    let from = parameters
        .get("from")
        .and_then(|v| v.as_str())
        .map(String::from);

    let to = parameters
        .get("to_filter")
        .and_then(|v| v.as_str())
        .map(String::from);

    let subject_contains = parameters
        .get("subject_contains")
        .and_then(|v| v.as_str())
        .map(String::from);

    let body_contains = parameters
        .get("body_contains")
        .and_then(|v| v.as_str())
        .map(String::from);

    let has_attachments = parameters.get("has_attachments").and_then(|v| v.as_bool());

    // Only return filter if at least one criterion is set
    if !unread_only
        && date_from.is_none()
        && date_to.is_none()
        && from.is_none()
        && to.is_none()
        && subject_contains.is_none()
        && body_contains.is_none()
        && has_attachments.is_none()
    {
        return None;
    }

    Some(EmailFilter {
        unread_only,
        date_from,
        date_to,
        from,
        to,
        subject_contains,
        body_contains,
        has_attachments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_executor_tool_names() {
        let executor = EmailExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"email_send"));
        assert!(names.contains(&"email_fetch"));
    }

    #[test]
    fn test_email_executor_description() {
        let executor = EmailExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("email"));
    }

    #[test]
    fn test_parse_email_address_simple() {
        let addr = parse_email_address("user@example.com");
        assert_eq!(addr.email, "user@example.com");
        assert!(addr.name.is_none());
    }

    #[test]
    fn test_parse_email_address_with_name() {
        let addr = parse_email_address("John Doe <john@example.com>");
        assert_eq!(addr.email, "john@example.com");
        assert_eq!(addr.name, Some("John Doe".to_string()));
    }

    #[test]
    fn test_parse_email_address_with_whitespace() {
        let addr = parse_email_address("  Jane Smith  <jane@test.com>  ");
        assert_eq!(addr.email, "jane@test.com");
        assert_eq!(addr.name, Some("Jane Smith".to_string()));
    }

    #[test]
    fn test_build_email_filter_empty() {
        let params = HashMap::new();
        let filter = build_email_filter(&params);
        assert!(filter.is_none());
    }

    #[test]
    fn test_build_email_filter_with_criteria() {
        let mut params = HashMap::new();
        params.insert("unread_only".to_string(), json!(true));
        params.insert("from".to_string(), json!("sender@example.com"));

        let filter = build_email_filter(&params);
        assert!(filter.is_some());

        let f = filter.unwrap();
        assert!(f.unread_only);
        assert_eq!(f.from, Some("sender@example.com".to_string()));
    }

    #[test]
    fn test_build_email_filter_with_dates() {
        let mut params = HashMap::new();
        params.insert("date_from".to_string(), json!(1700000000));
        params.insert("date_to".to_string(), json!(1710000000));

        let filter = build_email_filter(&params);
        assert!(filter.is_some());

        let f = filter.unwrap();
        assert_eq!(f.date_from, Some(1700000000));
        assert_eq!(f.date_to, Some(1710000000));
    }

    #[test]
    fn test_default_implementation() {
        let executor = EmailExecutor::new();
        assert_eq!(executor.tool_names().len(), 2);
    }
}

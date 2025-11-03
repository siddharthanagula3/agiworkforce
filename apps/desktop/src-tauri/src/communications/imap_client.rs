use async_imap::{
    types::Flag,
    Session,
};
use futures::{pin_mut, StreamExt};
use std::cmp::Reverse;
use tokio::net::TcpStream;
use tokio_native_tls::{native_tls, TlsConnector};
use tokio_util::compat::{Compat, TokioAsyncReadCompatExt};
use tracing::{debug, info, warn};

use crate::error::{Error, Result};

use super::{email_parser, Email, EmailAttachment, EmailFilter};

type ImapStream = Compat<tokio_native_tls::TlsStream<TcpStream>>;
type TlsSession = Session<ImapStream>;

/// IMAP client wrapper that provides common mailbox operations.
pub struct ImapClient {
    session: TlsSession,
    host: String,
    email: String,
}

impl ImapClient {
    /// Establish a new IMAP session.
    pub async fn connect(
        host: &str,
        port: u16,
        email: &str,
        password: &str,
        use_tls: bool,
    ) -> Result<Self> {
        if !use_tls {
            return Err(Error::EmailConnection(
                "Non-TLS IMAP connections are not supported for security reasons".to_string(),
            ));
        }

        let addr = format!("{}:{}", host, port);
        info!("Connecting to IMAP server {}", addr);

        let tcp_stream = TcpStream::connect(&addr).await.map_err(|err| {
            Error::EmailConnection(format!("Failed to connect to {}: {}", addr, err))
        })?;
        tcp_stream.set_nodelay(true).map_err(|err| {
            Error::EmailConnection(format!("Failed to optimize TCP stream: {}", err))
        })?;

        let native_connector = native_tls::TlsConnector::new().map_err(|err| {
            Error::EmailConnection(format!("Failed to create TLS connector: {}", err))
        })?;
        let tls_connector = TlsConnector::from(native_connector);
        let tls_stream = tls_connector
            .connect(host, tcp_stream)
            .await
            .map_err(|err| Error::EmailConnection(format!("TLS handshake failed: {}", err)))?;

        let client = async_imap::Client::new(tls_stream.compat());

        let session = client
            .login(email, password)
            .await
            .map_err(|(err, _)| Error::EmailAuth(format!("IMAP authentication failed: {}", err)))?;

        info!("IMAP connection established for {}", email);

        Ok(Self {
            session,
            host: host.to_string(),
            email: email.to_string(),
        })
    }

    /// List all folders/mailboxes available for the account.
    pub async fn list_folders(&mut self) -> Result<Vec<String>> {
        let mut stream = self
            .session
            .list(Some(""), Some("*"))
            .await
            .map_err(map_imap_error)?;

        let mut names = Vec::new();
        while let Some(folder) = stream.next().await {
            let folder = folder.map_err(map_imap_error)?;
            let name = String::from_utf8_lossy(folder.name().as_bytes()).to_string();
            names.push(name);
        }

        names.sort();
        Ok(names)
    }

    /// Select a particular folder/mailbox.
    pub async fn select_folder(&mut self, folder: &str) -> Result<()> {
        debug!("Selecting IMAP folder {}", folder);
        self.session.select(folder).await.map_err(map_imap_error)?;
        Ok(())
    }

    /// Fetch emails from a folder applying optional filters.
    pub async fn fetch_emails(
        &mut self,
        account_id: i64,
        folder: &str,
        limit: usize,
        filter: Option<EmailFilter>,
    ) -> Result<Vec<Email>> {
        self.select_folder(folder).await?;

        let query = build_search_query(filter.as_ref());
        let uid_set = match query.as_deref() {
            Some(query) => self
                .session
                .uid_search(query)
                .await
                .map_err(map_imap_error)?,
            None => self
                .session
                .uid_search("ALL")
                .await
                .map_err(map_imap_error)?,
        };

        if uid_set.is_empty() {
            return Ok(Vec::new());
        }

        let mut uids: Vec<u32> = uid_set.into_iter().collect();
        uids.sort();
        uids.reverse();

        let fetch_count = limit.max(1).min(200);
        let target: Vec<u32> = uids.into_iter().take(fetch_count).collect();

        if target.is_empty() {
            return Ok(Vec::new());
        }

        let sequence = join_uids(&target);
        let mut fetches = self
            .session
            .uid_fetch(
                sequence,
                "(UID FLAGS RFC822.SIZE BODY.PEEK[] INTERNALDATE ENVELOPE)",
            )
            .await
            .map_err(map_imap_error)?;

        let mut emails = Vec::new();

        while let Some(fetch) = fetches.next().await {
            let fetch = fetch.map_err(map_imap_error)?;
            let uid = fetch
                .uid
                .ok_or_else(|| Error::EmailParse("Fetched message missing UID".to_string()))?;

            let body = fetch.body().map(|bytes| bytes.to_vec()).ok_or_else(|| {
                Error::EmailParse("Message body missing from IMAP response".to_string())
            })?;

            let parsed = match email_parser::parse_email(&body) {
                Ok(value) => value,
                Err(err) => {
                    warn!("Failed to parse email UID {}: {}", uid, err);
                    continue;
                }
            };

            let (body_text, body_html) = (
                parsed.body_text.clone(),
                parsed
                    .body_html
                    .as_ref()
                    .map(|html| email_parser::sanitize_html(html)),
            );

            let email = Email {
                id: format!("{}:{}", folder, uid),
                uid,
                account_id,
                message_id: parsed.message_id.clone(),
                subject: parsed.subject.clone(),
                from: parsed.from.clone(),
                to: parsed.to.clone(),
                cc: parsed.cc.clone(),
                bcc: parsed.bcc.clone(),
                reply_to: parsed.reply_to.clone(),
                date: parsed.date,
                body_text,
                body_html,
                attachments: map_attachments(parsed.attachments.clone()),
                is_read: fetch.flags().any(|flag| matches!(flag, Flag::Seen)),
                is_flagged: fetch.flags().any(|flag| matches!(flag, Flag::Flagged)),
                folder: folder.to_string(),
                size: fetch
                    .size
                    .map(|size| size as usize)
                    .unwrap_or_else(|| parsed.body_text.as_ref().map(|s| s.len()).unwrap_or(0)),
            };

            if let Some(filter) = filter.as_ref() {
                if !matches_filter(&email, filter) {
                    continue;
                }
            }

            emails.push(email);
        }

        emails.sort_by_key(|email| Reverse(email.date));
        Ok(emails)
    }

    /// Mark a message as read/unread using its UID.
    pub async fn mark_as_read(&mut self, uid: u32, read: bool) -> Result<()> {
        let sequence = uid.to_string();
        let command = if read {
            "+FLAGS (\\Seen)"
        } else {
            "-FLAGS (\\Seen)"
        };

        debug!("Setting \\Seen={} for UID {}", read, uid);
        #[allow(unused_mut)]
        let mut responses = self
            .session
            .uid_store(sequence, command)
            .await
            .map_err(map_imap_error)?;
        pin_mut!(responses);
        while let Some(response) = responses.next().await {
            response.map_err(map_imap_error)?;
        }
        Ok(())
    }

    /// Delete a message and expunge the folder.
    pub async fn delete_email(&mut self, uid: u32) -> Result<()> {
        let sequence = uid.to_string();
        {
            #[allow(unused_mut)]
            let mut delete_responses = self
                .session
                .uid_store(&sequence, "+FLAGS (\\Deleted)")
                .await
                .map_err(map_imap_error)?;
            pin_mut!(delete_responses);
            while let Some(response) = delete_responses.next().await {
                response.map_err(map_imap_error)?;
            }
        }

        #[allow(unused_mut)]
        let mut expunge_stream = self.session.expunge().await.map_err(map_imap_error)?;
        pin_mut!(expunge_stream);
        while let Some(response) = expunge_stream.next().await {
            response.map_err(map_imap_error)?;
        }
        Ok(())
    }

    /// Fetch the raw RFC822 message for the currently selected folder.
    pub async fn fetch_raw_selected(&mut self, uid: u32) -> Result<Vec<u8>> {
        let mut fetch_stream = self
            .session
            .uid_fetch(uid.to_string(), "(BODY.PEEK[])")
            .await
            .map_err(map_imap_error)?;

        if let Some(fetch) = fetch_stream.next().await {
            let fetch = fetch.map_err(map_imap_error)?;
            if let Some(body) = fetch.body() {
                return Ok(body.to_vec());
            }
        }

        Err(Error::EmailParse(format!(
            "Message UID {} not found in selected folder",
            uid
        )))
    }

    /// Gracefully close the IMAP session.
    pub async fn logout(mut self) -> Result<()> {
        if let Err(err) = self.session.logout().await {
            warn!(
                "Failed to logout IMAP session for {}@{}: {}",
                self.email, self.host, err
            );
        }
        Ok(())
    }
}

fn join_uids(uids: &[u32]) -> String {
    uids.iter()
        .map(|uid| uid.to_string())
        .collect::<Vec<String>>()
        .join(",")
}

fn map_imap_error(err: async_imap::error::Error) -> Error {
    Error::EmailConnection(format!("IMAP error: {}", err))
}

fn build_search_query(filter: Option<&EmailFilter>) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();

    if let Some(filter) = filter {
        if filter.unread_only {
            parts.push("UNSEEN".to_string());
        }

        if let Some(from_ts) = filter.date_from {
            if let Some(date) = timestamp_to_naive_date(from_ts) {
                parts.push(format!("SINCE {}", date.format("%d-%b-%Y")));
            }
        }

        if let Some(to_ts) = filter.date_to {
            if let Some(date) = timestamp_to_naive_date(to_ts) {
                parts.push(format!("BEFORE {}", date.format("%d-%b-%Y")));
            }
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn timestamp_to_naive_date(timestamp: i64) -> Option<chrono::NaiveDate> {
    let dt = chrono::DateTime::from_timestamp(timestamp, 0)?;
    Some(dt.date_naive())
}

fn matches_filter(email: &Email, filter: &EmailFilter) -> bool {
    if let Some(from_filter) = filter.from.as_ref() {
        if !email
            .from
            .email
            .to_lowercase()
            .contains(&from_filter.to_lowercase())
            && !email
                .from
                .name
                .as_ref()
                .map(|name| name.to_lowercase().contains(&from_filter.to_lowercase()))
                .unwrap_or(false)
        {
            return false;
        }
    }

    if let Some(to_filter) = filter.to.as_ref() {
        let matches_recipient = email
            .to
            .iter()
            .chain(email.cc.iter())
            .chain(email.bcc.iter())
            .any(|addr| {
                addr.email
                    .to_lowercase()
                    .contains(&to_filter.to_lowercase())
                    || addr
                        .name
                        .as_ref()
                        .map(|name| name.to_lowercase().contains(&to_filter.to_lowercase()))
                        .unwrap_or(false)
            });

        if !matches_recipient {
            return false;
        }
    }

    if let Some(subject) = filter.subject_contains.as_ref() {
        if !email
            .subject
            .to_lowercase()
            .contains(&subject.to_lowercase())
        {
            return false;
        }
    }

    if let Some(body) = filter.body_contains.as_ref() {
        let haystack = format!(
            "{}\n{}",
            email.body_text.as_deref().unwrap_or_default(),
            email.body_html.as_deref().unwrap_or_default()
        )
        .to_lowercase();

        if !haystack.contains(&body.to_lowercase()) {
            return false;
        }
    }

    if let Some(expected) = filter.has_attachments {
        if expected && email.attachments.is_empty() {
            return false;
        }
        if !expected && !email.attachments.is_empty() {
            return false;
        }
    }

    true
}

fn map_attachments(attachments: Vec<EmailAttachment>) -> Vec<EmailAttachment> {
    attachments
        .into_iter()
        .map(|mut attachment| {
            // Ensure attachment file paths are optional until downloaded.
            attachment.file_path = None;
            attachment
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::communications::EmailAddress;

    #[test]
    fn test_join_uids() {
        assert_eq!(join_uids(&[1, 2, 3]), "1,2,3");
        assert_eq!(join_uids(&[42]), "42");
    }

    #[test]
    fn test_matches_filter_subject() {
        let email = Email {
            id: "INBOX:1".to_string(),
            uid: 1,
            account_id: 1,
            message_id: "msg-1".to_string(),
            subject: "Hello World".to_string(),
            from: EmailAddress::new("sender@example.com".to_string(), Some("Sender".to_string())),
            to: vec![EmailAddress::new(
                "receiver@example.com".to_string(),
                Some("Receiver".to_string()),
            )],
            cc: vec![],
            bcc: vec![],
            reply_to: None,
            date: 1,
            body_text: Some("Body sample".to_string()),
            body_html: None,
            attachments: vec![],
            is_read: false,
            is_flagged: false,
            folder: "INBOX".to_string(),
            size: 1234,
        };

        let mut filter = EmailFilter::default();
        filter.subject_contains = Some("world".to_string());
        assert!(matches_filter(&email, &filter));

        filter.subject_contains = Some("missing".to_string());
        assert!(!matches_filter(&email, &filter));
    }
}

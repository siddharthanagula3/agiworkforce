use std::path::Path;
use std::time::Duration;

use lettre::{
    message::{
        header::{ContentDisposition, ContentType},
        Mailbox, Message, MultiPart, SinglePart,
    },
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Tokio1Executor,
};
use mime_guess::MimeGuess;
use tokio::fs;
use tracing::{debug, info};
use uuid::Uuid;

use crate::error::{Error, Result};

use super::EmailAddress;

/// Asynchronous SMTP client backed by the `lettre` crate.
pub struct SmtpClient {
    transport: AsyncSmtpTransport<Tokio1Executor>,
}

#[derive(Debug, Clone)]
pub struct OutgoingEmail {
    pub from: EmailAddress,
    pub to: Vec<EmailAddress>,
    pub cc: Vec<EmailAddress>,
    pub bcc: Vec<EmailAddress>,
    pub reply_to: Option<EmailAddress>,
    pub subject: String,
    pub body_text: Option<String>,
    pub body_html: Option<String>,
    pub attachments: Vec<String>,
}

impl SmtpClient {
    /// Create a new SMTP transport and verify connectivity.
    pub async fn new(
        host: &str,
        port: u16,
        email: &str,
        password: &str,
        use_tls: bool,
    ) -> Result<Self> {
        info!("Configuring SMTP transport for {}", host);

        let credentials = Credentials::new(email.to_string(), password.to_string());
        let timeout = Some(Duration::from_secs(30));

        let builder = if use_tls {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host).map_err(|err| {
                Error::Generic(format!("Failed to configure STARTTLS: {}", err))
            })?
        } else {
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host)
        };

        let transport = builder
            .port(port)
            .credentials(credentials)
            .timeout(timeout)
            .build();

        transport
            .test_connection()
            .await
            .map_err(|err| Error::Generic(format!("SMTP connection failed: {}", err)))?;

        info!("SMTP transport ready for {}", email);

        Ok(Self { transport })
    }

    /// Send an email with optional HTML body and attachments.
    pub async fn send(&self, email: OutgoingEmail) -> Result<String> {
        if email.to.is_empty() && email.cc.is_empty() && email.bcc.is_empty() {
            return Err(Error::EmailSend(
                "At least one recipient (To/CC/BCC) is required".to_string(),
            ));
        }

        let mut builder = Message::builder()
            .message_id(Some(generate_message_id()))
            .from(mailbox_from_address(&email.from)?)
            .subject(email.subject.clone());

        for recipient in &email.to {
            builder = builder.to(mailbox_from_address(recipient)?);
        }

        for recipient in &email.cc {
            builder = builder.cc(mailbox_from_address(recipient)?);
        }

        for recipient in &email.bcc {
            builder = builder.bcc(mailbox_from_address(recipient)?);
        }

        if let Some(reply_to) = &email.reply_to {
            builder = builder.reply_to(mailbox_from_address(reply_to)?);
        }

        let mut body_part = build_body_part(&email);

        if !email.attachments.is_empty() {
            let mut mixed = MultiPart::mixed().multipart(body_part);
            for path in &email.attachments {
                mixed = mixed.singlepart(load_attachment(path).await?);
            }
            body_part = mixed;
        }

        let message = builder
            .multipart(body_part)
            .map_err(|err| Error::EmailSend(format!("Failed to build email message: {}", err)))?;

        let response = self
            .transport
            .send(message)
            .await
            .map_err(|err| Error::EmailSend(format!("SMTP send failed: {}", err)))?;

        debug!("SMTP response: {:?}", response);
        Ok(extract_message_id(response))
    }
}

fn mailbox_from_address(address: &EmailAddress) -> Result<Mailbox> {
    let parsed = address.email.parse().map_err(|err| {
        Error::EmailSend(format!(
            "Invalid email address '{}': {}",
            address.email, err
        ))
    })?;
    Ok(Mailbox::new(address.name.clone(), parsed))
}

fn build_body_part(email: &OutgoingEmail) -> MultiPart {
    match (&email.body_text, &email.body_html) {
        (Some(text), Some(html)) => MultiPart::alternative()
            .singlepart(SinglePart::plain(text.clone()))
            .singlepart(SinglePart::html(html.clone())),
        (Some(text), None) => MultiPart::alternative().singlepart(SinglePart::plain(text.clone())),
        (None, Some(html)) => MultiPart::alternative().singlepart(SinglePart::html(html.clone())),
        (None, None) => MultiPart::alternative().singlepart(SinglePart::plain(String::new())),
    }
}

async fn load_attachment(path: &str) -> Result<SinglePart> {
    let data = fs::read(path).await.map_err(|err| {
        Error::EmailSend(format!("Failed to read attachment '{}': {}", path, err))
    })?;

    let filename = Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| Error::EmailSend(format!("Invalid attachment filename '{}'", path)))?;

    let mime = MimeGuess::from_path(path).first_or_octet_stream();
    let mime_value = mime.essence_str().to_string();
    let content_type = ContentType::parse(&mime_value)
        .map_err(|err| Error::EmailSend(format!("Invalid MIME type for '{}': {}", path, err)))?;

    Ok(SinglePart::builder()
        .header(content_type)
        .header(ContentDisposition::attachment(filename))
        .body(data))
}

fn generate_message_id() -> String {
    format!("<{}@agiworkforce.local>", Uuid::new_v4())
}

fn extract_message_id(response: lettre::transport::smtp::response::Response) -> String {
    response
        .message()
        .next()
        .map(|msg| msg.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string())
}

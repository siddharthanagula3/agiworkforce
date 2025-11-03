use std::fmt;

/// Main error type for the application
#[derive(Debug)]
pub enum Error {
    /// IO errors
    Io(std::io::Error),

    /// Tauri errors
    Tauri(tauri::Error),

    /// Database errors
    Database(rusqlite::Error),

    /// PostgreSQL errors
    Postgres(tokio_postgres::Error),

    /// HTTP request errors
    Http(reqwest::Error),

    /// Serialization errors
    Serialization(serde_json::Error),

    /// Window management errors
    WindowNotFound(String),

    /// Configuration errors
    Config(String),

    /// LLM provider errors
    Provider(String),

    /// Automation errors
    Automation(String),

    /// Security errors
    Security(String),

    /// Permission denied
    PermissionDenied(String),

    /// Invalid path
    InvalidPath(String),

    /// Command not found
    CommandNotFound(String),

    /// Command timeout
    CommandTimeout(String),

    /// Command failed
    CommandFailed { exit_code: i32, stderr: String },

    /// Rate limit exceeded
    RateLimitExceeded(String),

    /// Email connection errors
    EmailConnection(String),

    /// Email authentication errors
    EmailAuth(String),

    /// Email parsing errors
    EmailParse(String),

    /// Email send errors
    EmailSend(String),

    /// Contact errors
    Contact(String),

    /// Generic error with message
    Generic(String),

    /// Other errors
    Other(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(err) => write!(f, "IO error: {}", err),
            Error::Tauri(err) => write!(f, "Tauri error: {}", err),
            Error::Database(err) => write!(f, "Database error: {}", err),
            Error::Postgres(err) => write!(f, "PostgreSQL error: {}", err),
            Error::Http(err) => write!(f, "HTTP error: {}", err),
            Error::Serialization(err) => write!(f, "Serialization error: {}", err),
            Error::WindowNotFound(name) => write!(f, "Window not found: {}", name),
            Error::Config(msg) => write!(f, "Configuration error: {}", msg),
            Error::Provider(msg) => write!(f, "Provider error: {}", msg),
            Error::Automation(msg) => write!(f, "Automation error: {}", msg),
            Error::Security(msg) => write!(f, "Security error: {}", msg),
            Error::PermissionDenied(msg) => write!(f, "Permission denied: {}", msg),
            Error::InvalidPath(msg) => write!(f, "Invalid path: {}", msg),
            Error::CommandNotFound(msg) => write!(f, "Command not found: {}", msg),
            Error::CommandTimeout(msg) => write!(f, "Command timeout: {}", msg),
            Error::CommandFailed { exit_code, stderr } => {
                write!(f, "Command failed with exit code {}: {}", exit_code, stderr)
            }
            Error::RateLimitExceeded(msg) => write!(f, "Rate limit exceeded: {}", msg),
            Error::EmailConnection(msg) => write!(f, "Email connection error: {}", msg),
            Error::EmailAuth(msg) => write!(f, "Email authentication error: {}", msg),
            Error::EmailParse(msg) => write!(f, "Email parsing error: {}", msg),
            Error::EmailSend(msg) => write!(f, "Email send error: {}", msg),
            Error::Contact(msg) => write!(f, "Contact error: {}", msg),
            Error::Generic(msg) => write!(f, "{}", msg),
            Error::Other(msg) => write!(f, "Error: {}", msg),
        }
    }
}

impl std::error::Error for Error {}

impl From<Error> for tauri::ipc::InvokeError {
    fn from(err: Error) -> Self {
        tauri::ipc::InvokeError::from_error(err)
    }
}

// Conversions from common error types
impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error::Io(err)
    }
}

impl From<tauri::Error> for Error {
    fn from(err: tauri::Error) -> Self {
        Error::Tauri(err)
    }
}

impl From<rusqlite::Error> for Error {
    fn from(err: rusqlite::Error) -> Self {
        Error::Database(err)
    }
}

impl From<reqwest::Error> for Error {
    fn from(err: reqwest::Error) -> Self {
        Error::Http(err)
    }
}

impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Error::Serialization(err)
    }
}

impl From<tokio_postgres::Error> for Error {
    fn from(err: tokio_postgres::Error) -> Self {
        Error::Postgres(err)
    }
}

// Convenience result type
pub type Result<T> = std::result::Result<T, Error>;

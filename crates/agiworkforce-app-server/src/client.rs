use std::collections::VecDeque;
use std::num::NonZeroUsize;
use std::time::Duration;

use agiworkforce_protocol::developer_session::{
    method, AppServerClientInfo, AppServerError, AppServerNotification, AppServerRequest,
    AppServerResponse, InitializeParams, InitializeResponse, DEVELOPER_SESSION_PROTOCOL_VERSION,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};

mod background;
pub use background::{BackgroundDeveloperSessionClient, DeveloperSessionClientEvent};

#[derive(Clone, Copy, Debug)]
pub struct DeveloperSessionClientLimits {
    pub max_frame_bytes: NonZeroUsize,
    pub max_queued_notifications: NonZeroUsize,
    pub request_timeout: Duration,
}

#[derive(Debug, thiserror::Error)]
pub enum DeveloperSessionClientError {
    #[error("runtime connection is closed; reconnect before issuing a request")]
    Closed,
    #[error("runtime connection closed: {0}")]
    Disconnected(String),
    #[error("runtime has reached its configured pending-request limit")]
    Busy,
    #[error("runtime request timed out")]
    Timeout,
    #[error("runtime request timeout must be positive and fit the monotonic clock")]
    InvalidTimeout,
    #[error("runtime frame exceeds the configured size limit")]
    FrameTooLarge,
    #[error("runtime closed its output before completing a response")]
    UnexpectedEof,
    #[error("runtime notification queue is full; reconnect to recover its current state")]
    NotificationOverflow,
    #[error("runtime sent an invalid response: {0}")]
    InvalidResponse(&'static str),
    #[error("runtime protocol version {actual} does not match this client's version {expected}")]
    ProtocolVersion { expected: u32, actual: u32 },
    #[error("runtime refused the request ({code}): {message}")]
    Remote {
        code: i32,
        message: String,
        data: Option<Value>,
    },
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub struct DeveloperSessionClient<R, W> {
    reader: BufReader<R>,
    writer: W,
    limits: DeveloperSessionClientLimits,
    next_id: u64,
    usable: bool,
    notifications: VecDeque<AppServerNotification>,
}

impl<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> DeveloperSessionClient<R, W> {
    pub fn new(reader: R, writer: W, limits: DeveloperSessionClientLimits) -> Self {
        Self {
            reader: BufReader::new(reader),
            writer,
            limits,
            next_id: 0,
            usable: true,
            notifications: VecDeque::new(),
        }
    }

    pub async fn initialize(
        &mut self,
        client_info: AppServerClientInfo,
    ) -> Result<InitializeResponse, DeveloperSessionClientError> {
        let response: InitializeResponse = self
            .request(
                method::INITIALIZE,
                InitializeParams {
                    client_info,
                    experimental_api: false,
                    user_input: false,
                    protocol_version: Some(DEVELOPER_SESSION_PROTOCOL_VERSION),
                },
            )
            .await?;
        if response.protocol_version != DEVELOPER_SESSION_PROTOCOL_VERSION {
            self.usable = false;
            return Err(DeveloperSessionClientError::ProtocolVersion {
                expected: DEVELOPER_SESSION_PROTOCOL_VERSION,
                actual: response.protocol_version,
            });
        }
        Ok(response)
    }

    pub fn pop_notification(&mut self) -> Option<AppServerNotification> {
        self.notifications.pop_front()
    }

    pub fn into_background(
        self,
        max_pending_requests: NonZeroUsize,
    ) -> Result<
        (
            BackgroundDeveloperSessionClient,
            tokio::sync::mpsc::Receiver<DeveloperSessionClientEvent>,
        ),
        DeveloperSessionClientError,
    >
    where
        R: Send + 'static,
        W: Send + 'static,
    {
        if !self.usable {
            return Err(DeveloperSessionClientError::Closed);
        }
        Ok(background::start(self, max_pending_requests))
    }

    pub async fn request<T: DeserializeOwned>(
        &mut self,
        method: &str,
        params: impl Serialize,
    ) -> Result<T, DeveloperSessionClientError> {
        if !self.usable {
            return Err(DeveloperSessionClientError::Closed);
        }
        self.next_id =
            self.next_id
                .checked_add(1)
                .ok_or(DeveloperSessionClientError::InvalidResponse(
                    "request ids exhausted",
                ))?;
        let request = AppServerRequest::new(self.next_id, method, params)?;
        let mut frame = serde_json::to_vec(&request)?;
        frame.push(b'\n');
        if frame.len() > self.limits.max_frame_bytes.get() {
            return Err(DeveloperSessionClientError::FrameTooLarge);
        }

        // Cancellation after a partial write/read must never reuse a desynchronised pipe.
        self.usable = false;
        let response =
            tokio::time::timeout(self.limits.request_timeout, self.exchange(&request, &frame))
                .await
                .map_err(|_| DeveloperSessionClientError::Timeout)??;
        self.usable = true;
        if let Some(AppServerError {
            code,
            message,
            data,
        }) = response.error
        {
            return Err(DeveloperSessionClientError::Remote {
                code,
                message,
                data,
            });
        }
        serde_json::from_value(response.result.unwrap_or(Value::Null)).map_err(Into::into)
    }

    async fn exchange(
        &mut self,
        request: &AppServerRequest,
        frame: &[u8],
    ) -> Result<AppServerResponse, DeveloperSessionClientError> {
        self.writer.write_all(frame).await?;
        self.writer.flush().await?;
        loop {
            let mut bytes = Vec::new();
            let max_bytes = self.limits.max_frame_bytes.get();
            (&mut self.reader)
                .take(max_bytes.saturating_add(1) as u64)
                .read_until(b'\n', &mut bytes)
                .await?;
            if bytes.len() > max_bytes {
                return Err(DeveloperSessionClientError::FrameTooLarge);
            }
            if bytes.last() != Some(&b'\n') {
                return Err(DeveloperSessionClientError::UnexpectedEof);
            }
            match decode_frame(&bytes)? {
                Frame::Notification(notification) => {
                    if self.notifications.len() >= self.limits.max_queued_notifications.get() {
                        return Err(DeveloperSessionClientError::NotificationOverflow);
                    }
                    self.notifications.push_back(notification);
                }
                Frame::Response(response) => {
                    if response.id != request.id {
                        return Err(DeveloperSessionClientError::InvalidResponse(
                            "request id does not match",
                        ));
                    }
                    return Ok(response);
                }
            }
        }
    }
}

enum Frame {
    Notification(AppServerNotification),
    Response(AppServerResponse),
}

fn decode_frame(bytes: &[u8]) -> Result<Frame, DeveloperSessionClientError> {
    let value: Value = serde_json::from_slice(bytes)?;
    if value.get("id").is_none() {
        return Ok(Frame::Notification(serde_json::from_value(value)?));
    }
    if value.get("method").is_some()
        || value.get("result").is_some() == value.get("error").is_some()
        || value.get("error").is_some_and(Value::is_null)
    {
        return Err(DeveloperSessionClientError::InvalidResponse(
            "expected one result or error",
        ));
    }
    Ok(Frame::Response(serde_json::from_value(value)?))
}

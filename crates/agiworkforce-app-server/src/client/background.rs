use std::collections::HashMap;
use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use agiworkforce_protocol::developer_session::{
    AppServerNotification, AppServerRequest, AppServerResponse,
};
use bytes::BytesMut;
use futures_util::StreamExt;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};
use tokio::sync::{mpsc, oneshot, watch, Semaphore};
use tokio_util::codec::{Decoder, FramedRead, LinesCodec};

use super::{
    decode_frame, DeveloperSessionClient, DeveloperSessionClientError,
    DeveloperSessionClientLimits, Frame,
};

pub enum DeveloperSessionClientEvent {
    Notification(AppServerNotification),
    Disconnected(String),
}

type Reply = oneshot::Sender<Result<AppServerResponse, DeveloperSessionClientError>>;

struct JsonLines(LinesCodec);

impl Decoder for JsonLines {
    type Item = String;
    type Error = std::io::Error;

    fn decode(&mut self, bytes: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        self.0
            .decode(bytes)
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))
    }

    fn decode_eof(&mut self, bytes: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        match self.decode(bytes)? {
            Some(frame) => Ok(Some(frame)),
            None if bytes.is_empty() => Ok(None),
            None => Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "Runtime closed an unfinished frame",
            )),
        }
    }
}

struct Request {
    method: String,
    params: Value,
    reply: Reply,
}

struct Control {
    closed: Arc<Mutex<Option<String>>>,
    stop: watch::Sender<bool>,
}

impl Control {
    fn reason(&self) -> Option<String> {
        closed_reason(&self.closed)
    }

    fn close(&self, reason: &str) {
        set_closed(&self.closed, reason);
        let _ = self.stop.send(true);
    }
}

struct RequestGuard {
    control: Arc<Control>,
    completed: bool,
}

impl Drop for RequestGuard {
    fn drop(&mut self) {
        if !self.completed {
            self.control.close(
                "An in-flight request was cancelled or timed out; reconnect before continuing",
            );
        }
    }
}

#[derive(Clone)]
pub struct BackgroundDeveloperSessionClient {
    requests: mpsc::Sender<Request>,
    control: Arc<Control>,
    permits: Arc<Semaphore>,
    limits: DeveloperSessionClientLimits,
}

impl BackgroundDeveloperSessionClient {
    pub async fn request<T: DeserializeOwned>(
        &self,
        method: &str,
        params: impl Serialize,
    ) -> Result<T, DeveloperSessionClientError> {
        self.request_with_timeout(method, params, self.limits.request_timeout)
            .await
    }

    pub async fn request_with_timeout<T: DeserializeOwned>(
        &self,
        method: &str,
        params: impl Serialize,
        timeout: Duration,
    ) -> Result<T, DeveloperSessionClientError> {
        let deadline = tokio::time::Instant::now()
            .checked_add(timeout)
            .filter(|_| !timeout.is_zero())
            .ok_or(DeveloperSessionClientError::InvalidTimeout)?;
        if let Some(reason) = self.control.reason() {
            return Err(DeveloperSessionClientError::Disconnected(reason));
        }
        let _permit = Arc::clone(&self.permits)
            .try_acquire_owned()
            .map_err(|_| DeveloperSessionClientError::Busy)?;
        let params = serde_json::to_value(params)?;
        let (reply, result) = oneshot::channel();
        let mut guard = RequestGuard {
            control: Arc::clone(&self.control),
            completed: false,
        };
        self.requests
            .send(Request {
                method: method.to_owned(),
                params,
                reply,
            })
            .await
            .map_err(|_| {
                DeveloperSessionClientError::Disconnected(
                    self.control
                        .reason()
                        .unwrap_or_else(|| "Runtime request channel closed".to_owned()),
                )
            })?;
        let result = tokio::time::timeout_at(deadline, result)
            .await
            .map_err(|_| DeveloperSessionClientError::Timeout)?
            .map_err(|_| {
                DeveloperSessionClientError::Disconnected(
                    self.control
                        .reason()
                        .unwrap_or_else(|| "Runtime response channel closed".to_owned()),
                )
            })?;
        guard.completed = true;
        let response = result?;
        if let Some(error) = response.error {
            return Err(DeveloperSessionClientError::Remote {
                code: error.code,
                message: error.message,
                data: error.data,
            });
        }
        Ok(serde_json::from_value(
            response.result.unwrap_or(Value::Null),
        )?)
    }

    pub fn disconnect(&self) {
        self.control.close("Runtime disconnected by its client");
    }

    pub fn is_connected(&self) -> bool {
        self.control.reason().is_none()
    }
}

pub(super) fn start<R, W>(
    client: DeveloperSessionClient<R, W>,
    max_pending: NonZeroUsize,
) -> (
    BackgroundDeveloperSessionClient,
    mpsc::Receiver<DeveloperSessionClientEvent>,
)
where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let (requests, mut incoming) = mpsc::channel::<Request>(max_pending.get());
    let (events, receiver) = mpsc::channel(client.limits.max_queued_notifications.get());
    let (stop, mut stopping) = watch::channel(false);
    let closed = Arc::new(Mutex::new(None));
    let handle = BackgroundDeveloperSessionClient {
        requests,
        control: Arc::new(Control {
            closed: Arc::clone(&closed),
            stop,
        }),
        permits: Arc::new(Semaphore::new(max_pending.get())),
        limits: client.limits,
    };
    tokio::spawn(async move {
        let mut frames = FramedRead::new(
            client.reader,
            JsonLines(LinesCodec::new_with_max_length(
                client.limits.max_frame_bytes.get().saturating_sub(1),
            )),
        );
        let mut writer = client.writer;
        let mut next_id = client.next_id;
        let mut pending = HashMap::<u64, Reply>::new();
        let outcome: Result<(), DeveloperSessionClientError> = async {
            for notification in client.notifications {
                events.try_send(DeveloperSessionClientEvent::Notification(notification))
                    .map_err(delivery_error)?;
            }
            loop {
                tokio::select! {
                    _ = stopping.changed() => return Ok(()),
                    frame = frames.next() => {
                        let frame = frame.ok_or(DeveloperSessionClientError::UnexpectedEof)?
                            .map_err(|error| DeveloperSessionClientError::Disconnected(error.to_string()))?;
                        match decode_frame(frame.as_bytes())? {
                            Frame::Notification(notification) => {
                                events.try_send(DeveloperSessionClientEvent::Notification(notification))
                                    .map_err(delivery_error)?;
                            }
                            Frame::Response(response) => {
                                let reply = response.id.as_u64().and_then(|id| pending.remove(&id))
                                    .ok_or(DeveloperSessionClientError::InvalidResponse("request id does not match"))?;
                                let _ = reply.send(Ok(response));
                            }
                        }
                    }
                    request = incoming.recv() => {
                        let Some(request) = request else { return Ok(()); };
                        next_id = next_id.checked_add(1).ok_or(
                            DeveloperSessionClientError::InvalidResponse("request ids exhausted"))?;
                        let frame = AppServerRequest::new(next_id, request.method, request.params)?;
                        let mut bytes = serde_json::to_vec(&frame)?;
                        bytes.push(b'\n');
                        if bytes.len() > client.limits.max_frame_bytes.get() {
                            let _ = request.reply.send(Err(DeveloperSessionClientError::FrameTooLarge));
                            continue;
                        }
                        pending.insert(next_id, request.reply);
                        tokio::select! {
                            biased;
                            _ = stopping.changed() => return Ok(()),
                            result = tokio::time::timeout(client.limits.request_timeout, async {
                                writer.write_all(&bytes).await?;
                                writer.flush().await
                            }) => result.map_err(|_| DeveloperSessionClientError::Timeout)??,
                        }
                    }
                }
            }
        }.await;
        let reason = match outcome {
            Ok(()) => closed_reason(&closed).unwrap_or_else(|| "Runtime client closed".to_owned()),
            Err(error) => error.to_string(),
        };
        set_closed(&closed, &reason);
        for (_, reply) in pending {
            let _ = reply.send(Err(DeveloperSessionClientError::Disconnected(
                reason.clone(),
            )));
        }
        let _ = events.try_send(DeveloperSessionClientEvent::Disconnected(reason));
    });
    (handle, receiver)
}

fn delivery_error(
    error: mpsc::error::TrySendError<DeveloperSessionClientEvent>,
) -> DeveloperSessionClientError {
    match error {
        mpsc::error::TrySendError::Full(_) => DeveloperSessionClientError::NotificationOverflow,
        mpsc::error::TrySendError::Closed(_) => {
            DeveloperSessionClientError::Disconnected("Runtime event consumer closed".to_owned())
        }
    }
}

fn closed_reason(closed: &Mutex<Option<String>>) -> Option<String> {
    match closed.lock() {
        Ok(reason) => reason.clone(),
        Err(_) => Some("Runtime connection state is unavailable".to_owned()),
    }
}

fn set_closed(closed: &Mutex<Option<String>>, reason: &str) {
    if let Ok(mut current) = closed.lock() {
        if current.is_none() {
            *current = Some(reason.to_owned());
        }
    }
}

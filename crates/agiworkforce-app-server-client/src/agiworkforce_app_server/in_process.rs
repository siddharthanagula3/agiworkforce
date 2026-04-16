use std::io::Error as IoError;
use std::io::ErrorKind;
use std::io::Result as IoResult;
use std::sync::Arc;

use agiworkforce_app_server_protocol::ClientNotification;
use agiworkforce_app_server_protocol::ClientRequest;
use agiworkforce_app_server_protocol::InitializeParams;
use agiworkforce_app_server_protocol::JSONRPCErrorError;
use agiworkforce_app_server_protocol::RequestId;
use agiworkforce_app_server_protocol::Result as JsonRpcResult;
use agiworkforce_app_server_protocol::ServerNotification;
use agiworkforce_app_server_protocol::ServerRequest;
use agiworkforce_arg0::Arg0DispatchPaths;
use agiworkforce_core::config::Config;
use agiworkforce_core::config_loader::CloudRequirementsLoader;
use agiworkforce_core::config_loader::LoaderOverrides;
use agiworkforce_feedback::AgiWorkforceFeedback;
use agiworkforce_protocol::protocol::SessionSource;
use serde_json::json;
use tokio::sync::mpsc;
use tokio::sync::oneshot;

pub const DEFAULT_IN_PROCESS_CHANNEL_CAPACITY: usize = 128;

#[derive(Clone)]
#[allow(dead_code)]
pub struct InProcessStartArgs {
    pub arg0_paths: Arg0DispatchPaths,
    pub config: Arc<Config>,
    pub cli_overrides: Vec<(String, toml::Value)>,
    pub loader_overrides: LoaderOverrides,
    pub cloud_requirements: CloudRequirementsLoader,
    pub feedback: AgiWorkforceFeedback,
    pub config_warnings: Vec<agiworkforce_app_server_protocol::ConfigWarningNotification>,
    pub session_source: SessionSource,
    pub enable_agiworkforce_api_key_env: bool,
    pub initialize: InitializeParams,
    pub channel_capacity: usize,
}

#[derive(Debug, Clone)]
pub enum InProcessServerEvent {
    ServerRequest(ServerRequest),
    ServerNotification(ServerNotification),
    Lagged { skipped: usize },
}

#[allow(dead_code)]
enum InProcessClientMessage {
    Request {
        request: Box<ClientRequest>,
        response_tx: oneshot::Sender<std::result::Result<JsonRpcResult, JSONRPCErrorError>>,
    },
    Notification {
        notification: ClientNotification,
    },
    ServerRequestResponse {
        request_id: RequestId,
        result: JsonRpcResult,
    },
    ServerRequestError {
        request_id: RequestId,
        error: JSONRPCErrorError,
    },
    Shutdown {
        done_tx: oneshot::Sender<()>,
    },
}

#[derive(Clone)]
pub struct InProcessClientSender {
    client_tx: mpsc::Sender<InProcessClientMessage>,
}

pub struct InProcessClientHandle {
    client: InProcessClientSender,
    event_rx: mpsc::Receiver<InProcessServerEvent>,
    runtime_handle: tokio::task::JoinHandle<()>,
}

impl InProcessClientSender {
    pub async fn request(
        &self,
        request: ClientRequest,
    ) -> IoResult<std::result::Result<JsonRpcResult, JSONRPCErrorError>> {
        let (response_tx, response_rx) = oneshot::channel();
        self.client_tx
            .send(InProcessClientMessage::Request {
                request: Box::new(request),
                response_tx,
            })
            .await
            .map_err(|_| IoError::new(ErrorKind::BrokenPipe, "in-process runtime closed"))?;
        response_rx
            .await
            .map_err(|_| IoError::new(ErrorKind::BrokenPipe, "in-process request closed"))
    }

    pub fn notify(&self, notification: ClientNotification) -> IoResult<()> {
        self.client_tx
            .try_send(InProcessClientMessage::Notification { notification })
            .map_err(|err| match err {
                mpsc::error::TrySendError::Full(_) => {
                    IoError::new(ErrorKind::WouldBlock, "in-process queue full")
                }
                mpsc::error::TrySendError::Closed(_) => {
                    IoError::new(ErrorKind::BrokenPipe, "in-process runtime closed")
                }
            })
    }

    pub fn respond_to_server_request(
        &self,
        request_id: RequestId,
        result: JsonRpcResult,
    ) -> IoResult<()> {
        self.client_tx
            .try_send(InProcessClientMessage::ServerRequestResponse { request_id, result })
            .map_err(|err| match err {
                mpsc::error::TrySendError::Full(_) => {
                    IoError::new(ErrorKind::WouldBlock, "in-process queue full")
                }
                mpsc::error::TrySendError::Closed(_) => {
                    IoError::new(ErrorKind::BrokenPipe, "in-process runtime closed")
                }
            })
    }

    pub fn fail_server_request(
        &self,
        request_id: RequestId,
        error: JSONRPCErrorError,
    ) -> IoResult<()> {
        self.client_tx
            .try_send(InProcessClientMessage::ServerRequestError { request_id, error })
            .map_err(|err| match err {
                mpsc::error::TrySendError::Full(_) => {
                    IoError::new(ErrorKind::WouldBlock, "in-process queue full")
                }
                mpsc::error::TrySendError::Closed(_) => {
                    IoError::new(ErrorKind::BrokenPipe, "in-process runtime closed")
                }
            })
    }
}

#[allow(dead_code)]
impl InProcessClientHandle {
    pub fn sender(&self) -> InProcessClientSender {
        self.client.clone()
    }

    pub async fn request(
        &self,
        request: ClientRequest,
    ) -> IoResult<std::result::Result<JsonRpcResult, JSONRPCErrorError>> {
        self.client.request(request).await
    }

    pub fn notify(&self, notification: ClientNotification) -> IoResult<()> {
        self.client.notify(notification)
    }

    pub fn respond_to_server_request(
        &self,
        request_id: RequestId,
        result: JsonRpcResult,
    ) -> IoResult<()> {
        self.client.respond_to_server_request(request_id, result)
    }

    pub fn fail_server_request(
        &self,
        request_id: RequestId,
        error: JSONRPCErrorError,
    ) -> IoResult<()> {
        self.client.fail_server_request(request_id, error)
    }

    pub async fn next_event(&mut self) -> Option<InProcessServerEvent> {
        self.event_rx.recv().await
    }

    pub async fn shutdown(self) -> IoResult<()> {
        let Self {
            client,
            event_rx,
            runtime_handle,
        } = self;
        drop(event_rx);
        let (done_tx, done_rx) = oneshot::channel();
        let _ = client
            .client_tx
            .send(InProcessClientMessage::Shutdown { done_tx })
            .await;
        let _ = done_rx.await;
        let _ = runtime_handle.await;
        Ok(())
    }
}

pub async fn start(_args: InProcessStartArgs) -> IoResult<InProcessClientHandle> {
    let (client_tx, mut client_rx) =
        mpsc::channel::<InProcessClientMessage>(DEFAULT_IN_PROCESS_CHANNEL_CAPACITY);
    let (event_tx, event_rx) =
        mpsc::channel::<InProcessServerEvent>(DEFAULT_IN_PROCESS_CHANNEL_CAPACITY);
    let runtime_handle = tokio::spawn(async move {
        while let Some(message) = client_rx.recv().await {
            match message {
                InProcessClientMessage::Request { response_tx, .. } => {
                    let _ = response_tx.send(Ok(json!({})));
                }
                InProcessClientMessage::Notification { notification } => {
                    let _ = notification;
                }
                InProcessClientMessage::ServerRequestResponse { request_id, result } => {
                    let _ = (request_id, result);
                }
                InProcessClientMessage::ServerRequestError { request_id, error } => {
                    let _ = (request_id, error);
                }
                InProcessClientMessage::Shutdown { done_tx } => {
                    let _ = done_tx.send(());
                    break;
                }
            }
        }
        drop(event_tx);
    });

    Ok(InProcessClientHandle {
        client: InProcessClientSender { client_tx },
        event_rx,
        runtime_handle,
    })
}

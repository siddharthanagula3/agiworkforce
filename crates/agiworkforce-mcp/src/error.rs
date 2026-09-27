use thiserror::Error;

use crate::protocol::{
    HEADER_MISMATCH, MISSING_REQUIRED_CLIENT_CAPABILITY, RpcError, UNSUPPORTED_PROTOCOL_VERSION,
};

#[derive(Debug, Error)]
pub enum McpError {
    #[error(transparent)]
    Transport(#[from] anyhow::Error),
}

impl McpError {
    pub fn as_anyhow(&self) -> &anyhow::Error {
        match self {
            McpError::Transport(e) => e,
        }
    }

    pub fn rpc_error(&self) -> Option<&RpcError> {
        crate::jsonrpc::peer_error(self.as_anyhow())
    }

    pub fn is_unsupported_protocol_version(&self) -> bool {
        self.rpc_error()
            .is_some_and(|error| error.code == UNSUPPORTED_PROTOCOL_VERSION)
            || self
                .as_anyhow()
                .chain()
                .any(|cause| cause.downcast_ref::<ProtocolMismatch>().is_some())
    }

    pub fn is_missing_client_capability(&self) -> bool {
        self.rpc_error()
            .is_some_and(|error| error.code == MISSING_REQUIRED_CLIENT_CAPABILITY)
    }

    pub fn is_header_mismatch(&self) -> bool {
        self.rpc_error()
            .is_some_and(|error| error.code == HEADER_MISMATCH)
    }

    pub fn is_authorization_required(&self) -> bool {
        matches!(
            fault(self.as_anyhow()),
            Some(TransportFault::AuthorizationRequired { .. })
        )
    }

    pub fn step_up_scope(&self) -> Option<(&str, &str)> {
        match fault(self.as_anyhow()) {
            Some(TransportFault::AuthorizationRequired {
                url,
                challenged_scope: Some(scope),
                ..
            }) => Some((url, scope)),
            _ => None,
        }
    }
}

#[derive(Debug, Error)]
#[error("[{server}] {detail}")]
pub(crate) struct ProtocolMismatch {
    pub(crate) server: String,
    pub(crate) detail: String,
}

#[derive(Debug, Error)]
pub(crate) enum TransportFault {
    #[error("[{server}] MCP server closed connection")]
    Closed { server: String },
    #[error("[{server}] MCP server response timeout ({millis}ms) on '{method}'")]
    Timeout {
        server: String,
        millis: u128,
        method: String,
    },
    #[error("[{server}] [mcp http] non-success response {status} on '{method}': {body}")]
    HttpStatus {
        server: String,
        status: u16,
        method: String,
        body: String,
    },
    #[error("[{server}] [mcp http] response stream for '{method}' ended before its response")]
    StreamBroke { server: String, method: String },
    #[error("[{server}] [mcp http] session expired on '{method}'")]
    SessionExpired { server: String, method: String },
    #[error(
        "[{server}] '{method}' needs sign-in: the server answered {status} and no usable token is stored"
    )]
    AuthorizationRequired {
        server: String,
        url: String,
        status: u16,
        method: String,
        challenged_scope: Option<String>,
    },
}

pub(crate) fn fault(error: &anyhow::Error) -> Option<&TransportFault> {
    error
        .chain()
        .find_map(|cause| cause.downcast_ref::<TransportFault>())
}

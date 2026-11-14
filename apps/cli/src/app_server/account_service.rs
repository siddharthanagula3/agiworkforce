use super::account;
use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::developer_session::{
    AccountLoginOutcome, AccountLoginResponse, AccountLoginWaitParams, AccountLoginWaitResponse,
    AccountSource, AccountStatusParams, AccountStatusResponse, AccountTokenResponse,
    AppServerClientInfo, DeveloperSessionSource,
};
use std::collections::HashMap;
use std::future::Future;
use tokio::sync::{watch, Mutex, RwLock};
use uuid::Uuid;

pub(super) struct AccountService {
    pending_logins: Mutex<HashMap<String, PendingDeviceLogin>>,
    stopped: watch::Sender<bool>,
    lifecycle: RwLock<()>,
}

#[derive(Clone)]
struct PendingDeviceLogin {
    api_base: String,
    device_code: String,
    interval: std::time::Duration,
    deadline: std::time::Instant,
    cancellation: watch::Sender<bool>,
    waiting: bool,
}

impl AccountService {
    pub(super) fn new() -> Self {
        Self {
            pending_logins: Mutex::new(HashMap::new()),
            stopped: watch::channel(false).0,
            lifecycle: RwLock::new(()),
        }
    }
    pub(super) async fn run<T>(
        &self,
        work: impl Future<Output = Result<T, DeveloperSessionHostError>>,
    ) -> Result<T, DeveloperSessionHostError> {
        let _guard = self.lifecycle.read().await;
        let mut stopped = self.stopped.subscribe();
        if *stopped.borrow() {
            return Err(DeveloperSessionHostError::unavailable(
                "The account connection is shutting down",
            ));
        }
        tokio::select! {
            biased;
            _ = stopped.wait_for(|stopped| *stopped) => Err(DeveloperSessionHostError::unavailable("The account connection is shutting down")),
            result = work => result,
        }
    }
    pub(super) async fn shutdown(&self) {
        self.stopped.send_replace(true);
        let _exclusive = self.lifecycle.write().await;
        let mut logins = self.pending_logins.lock().await;
        for (_, pending) in logins.drain() {
            pending.cancellation.send_replace(true);
        }
    }
    async fn commit_device_login(
        &self,
        login_id: &str,
        commit: impl FnOnce() -> anyhow::Result<()>,
    ) -> Result<(), DeveloperSessionHostError> {
        // Cancellation and sign-out share this lock so an earlier authorization cannot reinstall a removed credential.
        let mut logins = self.pending_logins.lock().await;
        let pending = logins
            .get(login_id)
            .ok_or_else(|| DeveloperSessionHostError::unavailable("The sign-in was cancelled"))?;
        if *pending.cancellation.borrow() || *self.stopped.borrow() {
            return Err(DeveloperSessionHostError::unavailable(
                "The sign-in was cancelled",
            ));
        }
        commit().map_err(internal_error)?;
        logins.remove(login_id);
        Ok(())
    }

    pub(super) async fn account_status(
        &self,
        params: AccountStatusParams,
    ) -> Result<AccountStatusResponse, DeveloperSessionHostError> {
        self.run(async {
            if params.refresh {
                if let Some(reason) = account::renew_managed_session_if_expiring().await {
                    return Err(DeveloperSessionHostError::unavailable(reason));
                }
            }
            Ok(account_response(
                account::account_status(params.refresh).await,
            ))
        })
        .await
    }

    pub(super) async fn account_login(
        &self,
    ) -> Result<AccountLoginResponse, DeveloperSessionHostError> {
        self.account_login_for_client(None).await
    }

    pub(super) async fn account_login_for_client(
        &self,
        client: Option<&AppServerClientInfo>,
    ) -> Result<AccountLoginResponse, DeveloperSessionHostError> {
        self.run(async {
            let api_base = account::device_auth_base();
            let device = crate::oauth::start_device_code_login(&api_base, device_surface(client))
                .await
                .map_err(|error| DeveloperSessionHostError::unavailable(error.to_string()))?;

            let login_id = Uuid::new_v4().to_string();
            let expires_in = std::time::Duration::from_secs(device.expires_in_secs);
            let deadline = std::time::Instant::now()
                .checked_add(expires_in)
                .ok_or_else(|| {
                    DeveloperSessionHostError::unavailable(
                        "The account service returned an invalid sign-in lifetime",
                    )
                })?;
            let expires_at = i64::try_from(device.expires_in_secs)
                .ok()
                .and_then(|seconds| seconds.checked_mul(1000))
                .and_then(|millis| chrono::Utc::now().timestamp_millis().checked_add(millis))
                .and_then(account::epoch_millis_to_rfc3339)
                .ok_or_else(|| {
                    DeveloperSessionHostError::unavailable(
                        "The account service returned an invalid sign-in expiry",
                    )
                })?;
            let mut logins = self.pending_logins.lock().await;
            logins.retain(|_, pending| {
                if pending.deadline <= std::time::Instant::now() {
                    pending.cancellation.send_replace(true);
                    false
                } else {
                    true
                }
            });
            logins.insert(
                login_id.clone(),
                PendingDeviceLogin {
                    api_base,
                    device_code: device.device_code.clone(),
                    interval: std::time::Duration::from_secs(device.interval_secs),
                    deadline,
                    cancellation: watch::channel(false).0,
                    waiting: false,
                },
            );

            drop(logins);
            Ok(AccountLoginResponse {
                login_id,
                verification_url: device.verification_url,
                user_code: Some(device.user_code),
                expires_at: Some(expires_at),
            })
        })
        .await
    }

    pub(super) async fn account_login_wait(
        &self,
        params: AccountLoginWaitParams,
    ) -> Result<AccountLoginWaitResponse, DeveloperSessionHostError> {
        self.run(async {

        let mut pending = {
            let mut logins = self.pending_logins.lock().await;
            let pending = logins.get_mut(&params.login_id).ok_or_else(|| {
                DeveloperSessionHostError::not_found(
                    "No login is in flight for that id; start one with account/login",
                )
            })?;
            if pending.waiting {
                return Err(DeveloperSessionHostError::conflict(
                    "This sign-in is already being awaited",
                ));
            }
            pending.waiting = true;
            pending.clone()
        };
        let mut cancellation = pending.cancellation.subscribe();
        let result = async {
            loop {
                if *cancellation.borrow() {
                    return Err(DeveloperSessionHostError::unavailable("The sign-in was cancelled"));
                }
                if *self.stopped.borrow() {
                    return Err(DeveloperSessionHostError::unavailable(
                        "The app-server is shutting down",
                    ));
                }
                if std::time::Instant::now() >= pending.deadline {
                    return Ok(AccountLoginWaitResponse {
                        outcome: AccountLoginOutcome::Expired,
                        message: Some("The device code expired before it was approved".to_string()),
                        account: account_response(account::account_status(false).await),
                    });
                }
                tokio::select! {
                    biased;
                    _ = cancellation.changed() => return Err(DeveloperSessionHostError::unavailable("The sign-in was cancelled")),
                    _ = tokio::time::sleep(pending.interval.min(pending.deadline.saturating_duration_since(std::time::Instant::now()))) => {},
                }
                let poll = tokio::select! {
                    biased;
                    _ = cancellation.changed() => return Err(DeveloperSessionHostError::unavailable("The sign-in was cancelled")),
                    result = crate::oauth::poll_device_code(&pending.api_base, &pending.device_code) => result,
                }.map_err(|error| DeveloperSessionHostError::unavailable(error.to_string()))?;
                match poll {
                    crate::oauth::DeviceCodePoll::Pending => continue,
                    // Waiting out the code's lifetime would only end in "expired";
                    // the account has to accept the terms on the web first.
                    crate::oauth::DeviceCodePoll::TermsRequired(url) => {
                        return Ok(AccountLoginWaitResponse {
                            outcome: AccountLoginOutcome::Failed,
                            message: Some(format!(
                                "Accept the updated Terms of Service at {url}, then sign in again."
                            )),
                            account: account_response(account::account_status(false).await),
                        });
                    }
                    crate::oauth::DeviceCodePoll::SlowDown => {
                        pending.interval += std::time::Duration::from_secs(5);
                        continue;
                    }
                    crate::oauth::DeviceCodePoll::AccountUnavailable(reason) => {
                        return Ok(AccountLoginWaitResponse {
                            outcome: AccountLoginOutcome::Failed,
                            message: Some(reason),
                            account: account_response(account::account_status(false).await),
                        });
                    }
                    crate::oauth::DeviceCodePoll::Denied => {
                        return Ok(AccountLoginWaitResponse {
                            outcome: AccountLoginOutcome::Failed,
                            message: Some("The sign-in was denied in the browser".to_string()),
                            account: account_response(account::account_status(false).await),
                        });
                    }
                    crate::oauth::DeviceCodePoll::Expired => {
                        return Ok(AccountLoginWaitResponse {
                            outcome: AccountLoginOutcome::Expired,
                            message: Some("The device code expired before it was approved".to_string()),
                            account: account_response(account::account_status(false).await),
                        });
                    }
                    crate::oauth::DeviceCodePoll::Authorized(entry) => {
                        self.commit_device_login(&params.login_id, || account::save_device_grant(*entry)).await?;
                        return Ok(AccountLoginWaitResponse {
                            outcome: AccountLoginOutcome::Completed,
                            message: None,
                            account: account_response(account::account_status(false).await),
                        });
                    }
                }
            }
        }.await;
        self.pending_logins.lock().await.remove(&params.login_id);
        result
        }).await
    }

    pub(super) async fn account_login_cancel(
        &self,
        params: AccountLoginWaitParams,
    ) -> Result<(), DeveloperSessionHostError> {
        self.run(async {
            let pending = self
                .pending_logins
                .lock()
                .await
                .remove(&params.login_id)
                .ok_or_else(|| {
                    DeveloperSessionHostError::not_found(
                        "The sign-in already finished or was cancelled",
                    )
                })?;
            pending.cancellation.send_replace(true);
            Ok(())
        })
        .await
    }

    pub(super) async fn account_logout(&self) -> Result<(), DeveloperSessionHostError> {
        self.run(async {
            let mut logins = self.pending_logins.lock().await;
            for (_, pending) in logins.drain() {
                pending.cancellation.send_replace(true);
            }
            let result = account::sign_out()
                .await
                .map(|_| ())
                .map_err(|error| DeveloperSessionHostError::internal(error.to_string()));
            drop(logins);
            result
        })
        .await
    }

    pub(super) async fn account_token(
        &self,
    ) -> Result<AccountTokenResponse, DeveloperSessionHostError> {
        self.run(async {
            if let Some(reason) = account::renew_managed_session_if_expiring().await {
                return Err(DeveloperSessionHostError::unavailable(reason));
            }
            let (token, expires_ms) = account::managed_credential().ok_or_else(|| {
                DeveloperSessionHostError::not_found(
                    "This machine holds no AGI credential; call account/login first",
                )
            })?;
            if let Some(expires_ms) = expires_ms {
                if expires_ms <= chrono::Utc::now().timestamp_millis() {
                    return Err(DeveloperSessionHostError::unavailable(
                        "The stored AGI credential has expired; call account/login again",
                    ));
                }
            }
            Ok(AccountTokenResponse {
                token,
                expires_at: expires_ms.and_then(account::epoch_millis_to_rfc3339),
            })
        })
        .await
    }
}

fn account_response(snapshot: account::AccountSnapshot) -> AccountStatusResponse {
    AccountStatusResponse {
        signed_in: snapshot.signed_in,
        email: snapshot.email,
        tier: snapshot.tier,
        balance_credits: snapshot.balance_credits,
        purchased_credits: snapshot.purchased_credits,
        cached: snapshot.cached,
        source: AccountSource::Cli,
        web_search_key: crate::tools::search_key_provider().map(str::to_string),
        web_search_logins: crate::tools::SEARCH_KEY_PROVIDERS
            .iter()
            .map(|provider| provider.to_string())
            .collect(),
    }
}

pub(super) fn device_surface(client: Option<&AppServerClientInfo>) -> &'static str {
    match client.map(super::client_source) {
        Some(DeveloperSessionSource::Vscode) => "vscode",
        Some(DeveloperSessionSource::Desktop) => "desktop",
        _ => "cli",
    }
}

fn internal_error(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::internal(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };

    #[tokio::test]
    async fn shutdown_cancels_an_admitted_request_before_waiting_for_its_lifecycle_lock() {
        let service = Arc::new(AccountService::new());
        let (entered, entering) = tokio::sync::oneshot::channel();
        let request_service = service.clone();
        let request = tokio::spawn(async move {
            request_service
                .run(async {
                    entered.send(()).unwrap();
                    std::future::pending::<Result<(), DeveloperSessionHostError>>().await
                })
                .await
        });
        entering.await.unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(1), service.shutdown())
            .await
            .unwrap();
        assert!(request
            .await
            .unwrap()
            .unwrap_err()
            .to_string()
            .contains("shutting down"));
        let polled = AtomicBool::new(false);
        assert!(service
            .run(async {
                polled.store(true, Ordering::Release);
                Ok(())
            })
            .await
            .is_err());
        assert!(!polled.load(Ordering::Acquire));
    }
    #[tokio::test]
    async fn cancelling_a_pending_device_login_wakes_its_wait_without_signing_out() {
        let host = Arc::new(AccountService::new());
        host.pending_logins.lock().await.insert(
            "fixture-login".into(),
            PendingDeviceLogin {
                api_base: String::new(),
                device_code: "fixture".into(),
                interval: std::time::Duration::from_secs(3600),
                deadline: std::time::Instant::now() + std::time::Duration::from_secs(3600),
                cancellation: watch::channel(false).0,
                waiting: false,
            },
        );
        let waiting_host = host.clone();
        let waiting = tokio::spawn(async move {
            waiting_host
                .account_login_wait(AccountLoginWaitParams {
                    login_id: "fixture-login".into(),
                })
                .await
        });
        tokio::time::timeout(std::time::Duration::from_secs(1), async {
            loop {
                if host
                    .pending_logins
                    .lock()
                    .await
                    .get("fixture-login")
                    .is_some_and(|login| login.waiting)
                {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        host.account_login_cancel(AccountLoginWaitParams {
            login_id: "fixture-login".into(),
        })
        .await
        .unwrap();
        let error = tokio::time::timeout(std::time::Duration::from_secs(1), waiting)
            .await
            .unwrap()
            .unwrap()
            .unwrap_err();
        assert!(error.to_string().contains("cancelled"));
        assert!(host.pending_logins.lock().await.is_empty());
        assert!(host.run(async { Ok(()) }).await.is_ok());
        let committed = AtomicBool::new(false);
        assert!(host
            .commit_device_login("fixture-login", || {
                committed.store(true, Ordering::Release);
                Ok(())
            })
            .await
            .is_err());
        assert!(!committed.load(Ordering::Acquire));
    }

    #[tokio::test]
    async fn cancelling_a_different_login_does_not_remove_the_pending_one() {
        let host = Arc::new(AccountService::new());
        host.pending_logins.lock().await.insert(
            "keep-login".into(),
            PendingDeviceLogin {
                api_base: String::new(),
                device_code: "fixture".into(),
                interval: std::time::Duration::from_secs(3600),
                deadline: std::time::Instant::now() + std::time::Duration::from_secs(3600),
                cancellation: watch::channel(false).0,
                waiting: false,
            },
        );
        assert!(host
            .account_login_cancel(AccountLoginWaitParams {
                login_id: "different-login".into()
            })
            .await
            .is_err());
        assert!(host.pending_logins.lock().await.contains_key("keep-login"));
        host.account_login_cancel(AccountLoginWaitParams {
            login_id: "keep-login".into(),
        })
        .await
        .unwrap();
        assert!(host
            .account_login_wait(AccountLoginWaitParams {
                login_id: "keep-login".into()
            })
            .await
            .is_err());
    }

    #[test]
    fn the_approval_page_names_the_app_that_asked_to_sign_in() {
        let client = |name: &str| AppServerClientInfo {
            name: name.to_string(),
            title: String::new(),
            version: String::new(),
        };
        assert_eq!(device_surface(Some(&client("agi_vscode"))), "vscode");
        assert_eq!(device_surface(Some(&client("agi-desktop"))), "desktop");
        assert_eq!(device_surface(Some(&client("agi_cli"))), "cli");
        assert_eq!(device_surface(None), "cli");
    }
}

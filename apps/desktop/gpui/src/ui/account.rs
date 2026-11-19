use super::*;
use agiworkforce_protocol::developer_session::{
    AccountLoginOutcome, AccountLoginResponse, AccountLoginWaitParams, AccountLoginWaitResponse,
    AccountStatusParams, AccountStatusResponse, AcknowledgedResponse,
};
use std::time::Duration;

impl Desktop {
    pub(super) fn account_client(&self) -> Result<BackgroundDeveloperSessionClient> {
        self.account_connection_client
            .as_ref()
            .filter(|client| client.is_connected())
            .cloned()
            .context("The account service is disconnected. Reconnect it to continue.")
    }

    pub(super) fn connect_account(&mut self, cx: &mut Context<Self>) {
        if self.cloud.workspaces.is_selecting() {
            self.account.notice =
                Some("Wait for the workspace switch to finish before changing accounts.".into());
            cx.notify();
            return;
        }
        if self.cloud.management.editing.is_some() || self.cloud.management.operation.is_some() {
            self.account.notice = Some(
                "Finish the conversation change or cancel its title edit before changing accounts."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.account.pending.is_some() {
            return;
        }
        let Some(generation) = self.account_generation.checked_add(1) else {
            self.account.notice = Some("The account connection generation is exhausted.".into());
            cx.notify();
            return;
        };
        self.account_generation = generation;
        self.cloud.reset();
        self.account_connection_client = None;
        self.account_capabilities = None;
        self.account.status = None;
        self.account.challenge = None;
        self.account.pending = Some(AccountOperation::Reading);
        self.account.notice = None;
        let runtime = Arc::clone(&self.account_runtime);
        let binary = self.binary.clone();
        let contracts = Arc::clone(&self.contracts);
        let settings = self.settings;
        let task = self.executor.spawn(async move {
            let mut guard = runtime.lock().await;
            if let Some(previous) = guard.take() {
                previous.shutdown().await?;
            }
            let mut session =
                RuntimeSession::connect_account(&binary, &contracts, settings).await?;
            let client = session.client();
            let capabilities = session.capabilities().clone();
            let events = session
                .take_events()
                .context("The account connection has no event stream")?;
            *guard = Some(session);
            Ok::<_, anyhow::Error>((client, capabilities, events))
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Starting the account service stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation {
                    return;
                }
                view.account.pending = None;
                match result {
                    Ok((client, capabilities, mut events)) => {
                        view.account_connection_client = Some(client);
                        view.account_capabilities = Some(capabilities);
                        view.account_event_task = Some(cx.spawn(async move |view, cx| {
                            let reason = match events.recv().await {
                                Some(DeveloperSessionClientEvent::Disconnected(reason)) => reason,
                                Some(DeveloperSessionClientEvent::Notification(_)) => {
                                    "The account service sent an unexpected notification."
                                        .to_owned()
                                }
                                None => "The account event stream closed. Reconnect to continue."
                                    .to_owned(),
                            };
                            let _ = view.update(cx, |view, cx| {
                                if view.account_generation != generation {
                                    return;
                                }
                                if let Some(client) = &view.account_connection_client {
                                    client.disconnect();
                                }
                                view.account.pending = None;
                                view.account.status = None;
                                view.account.notice = Some(reason);
                                cx.notify();
                            });
                        }));
                        view.refresh_account(true, cx);
                    }
                    Err(error) => {
                        view.account.notice =
                            Some(format!("The account service could not start: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn open_account(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.cloud.visible = false;
        self.account.visible = true;
        self.focus.focus(window, cx);
        if self.account.pending.is_none() && self.account.challenge.is_none() {
            self.refresh_account(false, cx);
        }
        cx.notify();
    }

    pub(super) fn refresh_account(&mut self, refresh: bool, cx: &mut Context<Self>) {
        if self.account.pending.is_some() || self.account.challenge.is_some() {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.account.notice = Some(format!("{error:#}"));
                cx.notify();
                return;
            }
        };
        self.account.pending = Some(AccountOperation::Reading);
        self.account.notice = None;
        let generation = self.account_generation;
        let task = self.executor.spawn(async move {
            client
                .request::<AccountStatusResponse>(
                    method::ACCOUNT_STATUS,
                    AccountStatusParams { refresh },
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading the account stopped")
                .and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation {
                    return;
                }
                view.account.pending = None;
                match result {
                    Ok(status) => {
                        let changed = view.account.status.as_ref().is_some_and(|previous| {
                            previous.signed_in != status.signed_in || previous.email != status.email
                        });
                        if changed {
                            view.cloud.reset();
                        }
                        view.account.status = Some(status.into());
                    }
                    Err(error) => {
                        view.account.notice =
                            Some(format!("Account status could not be refreshed: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn sign_in(&mut self, cx: &mut Context<Self>) {
        if self.cloud.workspaces.is_selecting() {
            self.account.notice =
                Some("Wait for the workspace switch to finish before changing accounts.".into());
            cx.notify();
            return;
        }
        if self.cloud.management.editing.is_some() || self.cloud.management.operation.is_some() {
            self.account.notice = Some(
                "Finish the conversation change or cancel its title edit before changing accounts."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.has_unsaved_cloud_draft(cx) {
            self.account.notice = Some("Save or resolve the unsent Cloud draft before changing accounts. You can also copy and clear it.".into());
            cx.notify();
            return;
        }

        if self.account.pending.is_some() || self.account.challenge.is_some() || self.busy() {
            return;
        }
        if !self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.account_login_cancel)
        {
            self.account.notice = Some(
                "This runtime needs an update before it can safely start and cancel sign-in."
                    .into(),
            );
            cx.notify();
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.account.notice = Some(format!("{error:#}"));
                cx.notify();
                return;
            }
        };
        self.account.pending = Some(AccountOperation::Starting);
        self.cloud.reset();
        self.account.notice = None;
        let generation = self.account_generation;
        let grace = Duration::from_millis(self.settings.request_timeout_ms);
        let task = self.executor.spawn(async move {
            let response: AccountLoginResponse = client
                .request(method::ACCOUNT_LOGIN, serde_json::json!({}))
                .await?;
            let id = response.login_id.clone();
            match DeviceLogin::new(response, chrono::Utc::now(), grace) {
                Ok(challenge) => Ok(challenge),
                Err(error) => {
                    let _: AcknowledgedResponse = client
                        .request(
                            method::ACCOUNT_LOGIN_CANCEL,
                            AccountLoginWaitParams { login_id: id },
                        )
                        .await?;
                    Err(error)
                }
            }
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Starting sign-in stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation {
                    return;
                }
                view.account.pending = None;
                match result {
                    Ok(challenge) => {
                        view.account.challenge = Some(challenge);
                        view.wait_for_sign_in(cx);
                    }
                    Err(error) => {
                        view.account.notice = Some(format!("Sign-in could not start: {error:#}"))
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn wait_for_sign_in(&mut self, cx: &mut Context<Self>) {
        let Some(challenge) = &self.account.challenge else {
            return;
        };
        let id = challenge.id.clone();
        let timeout = challenge.wait_timeout;
        let generation = self.account_generation;
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.account.notice = Some(format!("{error:#}"));
                cx.notify();
                return;
            }
        };
        let params = AccountLoginWaitParams {
            login_id: id.clone(),
        };
        let task = self.executor.spawn(async move {
            client
                .request_with_timeout::<AccountLoginWaitResponse>(
                    method::ACCOUNT_LOGIN_WAIT,
                    params,
                    timeout,
                )
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Waiting for sign-in stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation || view.account.challenge.as_ref().is_none_or(|challenge| challenge.id != id) { return; }
                let cancelling = view.account.pending == Some(AccountOperation::Cancelling);
                if cancelling && result.is_err() { return; }
                view.account.challenge = None;
                view.account.pending = None;
                match result {
                    Ok(response) => {
                        view.cloud.reset();
                        view.account.notice = Some(match response.outcome {
                            AccountLoginOutcome::Completed if cancelling => "Sign-in completed before it could be cancelled.".into(),
                            AccountLoginOutcome::Completed if response.account.signed_in => "Signed in. New conversations can use the models admitted for this account.".into(),
                            AccountLoginOutcome::Completed => "The login finished, but account status is not signed in. Refresh before continuing.".into(),
                            AccountLoginOutcome::Expired => response.message.unwrap_or_else(|| "The sign-in code expired. Start sign-in again.".into()),
                            AccountLoginOutcome::Failed => response.message.unwrap_or_else(|| "Sign-in failed. Start sign-in again.".into()),
                        });
                        view.account.status = Some(response.account.into());
                        view.models = None;
                    }
                    Err(error) => view.account.notice = Some(format!("Sign-in could not be confirmed: {error:#}. Reconnect and refresh account status before trying again.")),
                }
                cx.notify();
            });
        }).detach();
    }

    pub(super) fn open_sign_in(&mut self, cx: &mut Context<Self>) {
        if let Some(challenge) = &self.account.challenge {
            if challenge.expires_at <= chrono::Utc::now() {
                self.account.notice = Some("The sign-in code has expired.".into());
                cx.notify();
            } else {
                cx.open_url(challenge.verification_url.as_str());
            }
        }
    }

    pub(super) fn copy_sign_in_code(&self, cx: &mut Context<Self>) {
        if let Some(code) = self
            .account
            .challenge
            .as_ref()
            .and_then(|challenge| challenge.user_code.as_ref())
        {
            cx.write_to_clipboard(gpui::ClipboardItem::new_string(code.clone()));
        }
    }

    pub(super) fn cancel_sign_in(&mut self, cx: &mut Context<Self>) {
        if self.account.pending.is_some() {
            return;
        }
        let Some(challenge) = &self.account.challenge else {
            return;
        };
        let id = challenge.id.clone();
        let generation = self.account_generation;
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.account.notice = Some(format!("{error:#}"));
                cx.notify();
                return;
            }
        };
        self.account.pending = Some(AccountOperation::Cancelling);
        let params = AccountLoginWaitParams {
            login_id: id.clone(),
        };
        let task = self.executor.spawn(async move {
            let response: AcknowledgedResponse =
                client.request(method::ACCOUNT_LOGIN_CANCEL, params).await?;
            anyhow::ensure!(
                response.acknowledged,
                "The runtime did not acknowledge cancellation"
            );
            Ok::<_, anyhow::Error>(())
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Cancelling sign-in stopped").and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation || view.account.challenge.as_ref().is_none_or(|challenge| challenge.id != id) { return; }
                view.account.pending = None;
                match result {
                    Ok(()) => { view.account.challenge = None; view.account.notice = Some("Sign-in cancelled. Existing credentials were not signed out.".into()); },
                    Err(error) => view.account.notice = Some(format!("Cancellation could not be confirmed: {error:#}. Refresh account status after the pending login finishes.")),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn sign_out(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.workspaces.is_selecting() {
            self.account.notice =
                Some("Wait for the workspace switch to finish before changing accounts.".into());
            cx.notify();
            return;
        }
        if self.cloud.management.editing.is_some() || self.cloud.management.operation.is_some() {
            self.account.notice = Some(
                "Finish the conversation change or cancel its title edit before changing accounts."
                    .into(),
            );
            cx.notify();
            return;
        }
        if self.has_unsaved_cloud_draft(cx) {
            self.account.notice = Some("Save or resolve the unsent Cloud draft before changing accounts. You can also copy and clear it.".into());
            cx.notify();
            return;
        }

        if self.account.pending.is_some() || self.account.challenge.is_some() || self.busy() {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.account.notice = Some(format!("{error:#}"));
                cx.notify();
                return;
            }
        };
        let generation = self.account_generation;
        self.account.pending = Some(AccountOperation::SigningOut);
        let answer = window.prompt(PromptLevel::Warning, "Sign out of this runtime account?",
            Some("This removes the account credential shared by this desktop runtime and the CLI on this machine. Account-backed model requests will need sign-in again. File uploads stop and their local snapshots are discarded. Downloads stop before local saving; a save already in progress finishes before sign-out. Saved local copies remain; files whose completion reached Cloud remain in their projects. Provider API keys and saved conversations remain."), &["Cancel", "Sign out"], cx);
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<Option<AccountStatusResponse>> = async {
                if answer.await? != 1 { return Ok(None); }
                view.update(cx, |view, _| view.cloud.reset())?;
                let task = view.update(cx, |view, _| view.executor.spawn(async move {
                    let response: AcknowledgedResponse = client.request(method::ACCOUNT_LOGOUT, serde_json::json!({})).await?;
                    anyhow::ensure!(response.acknowledged, "The runtime did not acknowledge sign-out");
                    Ok::<_, anyhow::Error>(client.request::<AccountStatusResponse>(method::ACCOUNT_STATUS, AccountStatusParams::default()).await?)
                }))?;
                Ok(Some(task.await.context("Signing out stopped")??))
            }.await;
            let _ = view.update(cx, |view, cx| {
                if view.account_generation != generation { return; }
                view.account.pending = None;
                match result {
                    Ok(Some(status)) => {
                        view.account.notice = Some(if status.signed_in { "Sign-out completed, but the runtime still reports a signed-in account. Refresh its status." } else { "Signed out on this machine." }.into());
                        view.account.status = Some(status.into());
                        view.models = None;
                    }
                    Ok(None) => {},
                    Err(error) => { view.account.status = None; view.account.notice = Some(format!("Sign-out status is unknown: {error:#}. Refresh before continuing.")); },
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }

    pub(super) fn render_account(
        &self,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> impl IntoElement {
        let mut panel = div().w_full().max_w(px(self.contracts.frame.content_width)).flex().flex_col().gap_4()
            .child(gpui::text!(format!("Account for {} on this computer. Signing in does not move local conversations to Cloud.", self.contracts.desktop_name)));
        if let Some(status) = &self.account.status {
            panel = panel.child(gpui::text!(if status.signed_in {
                status.email.as_deref().unwrap_or("Signed in")
            } else {
                "Signed out"
            }
            .to_owned()));
            if let Some(tier) = &status.tier {
                panel = panel.child(gpui::text!(format!("Plan: {tier}")));
            }
            if let Some(balance) = status.balance_credits {
                panel = panel.child(gpui::text!(format!("Plan credits remaining: {balance}")));
            }
            if let Some(balance) = status.purchased_credits {
                panel = panel.child(gpui::text!(format!("Purchased credits: {balance}")));
            }
            if status.cached {
                panel = panel.child(gpui::text!(
                    "Showing cached account status. Refresh to check the current account."
                ));
            }
        }
        if let Some(notice) = &self.account.notice {
            panel = panel.child(gpui::text!(notice.clone()));
        }
        if let Some(pending) = self.account.pending {
            panel = panel.child(gpui::text!(match pending {
                AccountOperation::Reading => "Checking account…",
                AccountOperation::Starting => "Starting sign-in…",
                AccountOperation::Cancelling => "Cancelling sign-in…",
                AccountOperation::SigningOut => "Signing out…",
            }));
        }
        let connected = self
            .account_connection_client
            .as_ref()
            .is_some_and(BackgroundDeveloperSessionClient::is_connected);
        if let Some(challenge) = &self.account.challenge {
            panel = panel
                .child(gpui::text!("Finish sign-in in your browser"))
                .child(gpui::text!(challenge.verification_url.to_string()))
                .child(gpui::text!(format!(
                    "Expires at {}",
                    challenge.expires_at.to_rfc3339()
                )));
            if let Some(code) = &challenge.user_code {
                panel = panel.child(gpui::text!(code.clone())).child(self.button(
                    "copy-sign-in-code",
                    "Copy code",
                    UiAction::CopySignInCode,
                    palette,
                    cx,
                ));
            }
            panel = panel.child(self.button(
                "open-sign-in",
                "Continue in browser",
                UiAction::OpenSignIn,
                palette,
                cx,
            ));
            if self.account.pending.is_none() && connected {
                panel = panel.child(self.button(
                    "cancel-sign-in",
                    "Cancel sign-in",
                    UiAction::CancelSignIn,
                    palette,
                    cx,
                ));
            }
        } else if self.account.pending.is_none() && connected {
            panel = panel.child(self.button(
                "refresh-account",
                "Refresh account",
                UiAction::RefreshAccount,
                palette,
                cx,
            ));
            if self.busy() {
                panel = panel.child(gpui::text!(
                    "Stop the current turn before changing accounts."
                ));
            } else if self
                .account
                .status
                .as_ref()
                .is_some_and(|status| status.signed_in)
            {
                panel = panel.child(self.button(
                    "sign-out",
                    "Sign out",
                    UiAction::SignOut,
                    palette,
                    cx,
                ));
            } else if self
                .account_capabilities
                .as_ref()
                .is_some_and(|caps| caps.account_login_cancel)
            {
                panel =
                    panel.child(self.button("sign-in", "Sign in", UiAction::SignIn, palette, cx));
            }
        }
        if !connected {
            panel = panel.child(gpui::text!(
                "Reconnect the account service before changing this account."
            ));
            if self.account.pending.is_none() {
                panel = panel.child(self.button(
                    "reconnect-account",
                    "Reconnect account",
                    UiAction::ReconnectAccount,
                    palette,
                    cx,
                ));
            }
        }
        panel.child(self.button(
            "close-account",
            "Back to conversations",
            UiAction::CloseAccount,
            palette,
            cx,
        ))
    }
}

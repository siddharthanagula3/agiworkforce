pub mod event_types;
pub mod google_calendar;
pub mod outlook_calendar;
pub mod timezone;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::api::oauth::{PkceChallenge, TokenResponse};
use crate::error::{Error, Result};

pub use event_types::*;
pub use google_calendar::GoogleCalendarClient;
pub use outlook_calendar::OutlookCalendarClient;
pub use timezone::*;

/// OAuth configuration for calendar providers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarOAuthSettings {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

/// Calendar account information cached in memory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarAccountInfo {
    pub provider: CalendarProvider,
    pub settings: CalendarOAuthSettings,
    pub token: TokenResponse,
    pub email: Option<String>,
    pub display_name: Option<String>,
}

struct PendingOAuth {
    provider: CalendarProvider,
    settings: CalendarOAuthSettings,
    pkce: PkceChallenge,
}

/// Calendar client that can handle multiple providers
#[derive(Clone)]
pub enum CalendarClient {
    Google(GoogleCalendarClient),
    Outlook(OutlookCalendarClient),
}

impl CalendarClient {
    /// Create Google Calendar client
    pub fn new_google(client_id: String, client_secret: String, redirect_uri: String) -> Self {
        CalendarClient::Google(GoogleCalendarClient::new(
            client_id,
            client_secret,
            redirect_uri,
        ))
    }

    /// Create Outlook Calendar client
    pub fn new_outlook(client_id: String, client_secret: String, redirect_uri: String) -> Self {
        CalendarClient::Outlook(OutlookCalendarClient::new(
            client_id,
            client_secret,
            redirect_uri,
        ))
    }

    /// Get authorization URL for OAuth flow
    pub fn get_authorization_url(&self, state: &str) -> (String, PkceChallenge) {
        match self {
            CalendarClient::Google(client) => client.get_authorization_url(state),
            CalendarClient::Outlook(client) => client.get_authorization_url(state),
        }
    }

    /// Complete authorization with OAuth code
    pub async fn authorize_with_code(&mut self, code: &str, code_verifier: &str) -> Result<()> {
        match self {
            CalendarClient::Google(client) => client.authorize_with_code(code, code_verifier).await,
            CalendarClient::Outlook(client) => {
                client.authorize_with_code(code, code_verifier).await
            }
        }
    }

    /// Set token directly
    pub fn set_token(&mut self, token: TokenResponse) {
        match self {
            CalendarClient::Google(client) => client.set_token(token),
            CalendarClient::Outlook(client) => client.set_token(token),
        }
    }

    /// Retrieve the current token
    pub fn token(&self) -> Option<TokenResponse> {
        match self {
            CalendarClient::Google(client) => client.token(),
            CalendarClient::Outlook(client) => client.token(),
        }
    }

    /// Ensure token validity (refresh if needed)
    pub async fn ensure_valid_token(&mut self) -> Result<()> {
        match self {
            CalendarClient::Google(client) => client.ensure_valid_token().await,
            CalendarClient::Outlook(client) => client.ensure_valid_token().await,
        }
    }

    /// List calendars
    pub async fn list_calendars(&mut self) -> Result<Vec<Calendar>> {
        match self {
            CalendarClient::Google(client) => client.list_calendars().await,
            CalendarClient::Outlook(client) => client.list_calendars().await,
        }
    }

    /// List events in a calendar
    pub async fn list_events(&mut self, request: ListEventsRequest) -> Result<EventListResponse> {
        match self {
            CalendarClient::Google(client) => client.list_events(request).await,
            CalendarClient::Outlook(client) => client.list_events(request).await,
        }
    }

    /// Create a new event
    pub async fn create_event(&mut self, request: CreateEventRequest) -> Result<CalendarEvent> {
        match self {
            CalendarClient::Google(client) => client.create_event(request).await,
            CalendarClient::Outlook(client) => client.create_event(request).await,
        }
    }

    /// Update an existing event
    pub async fn update_event(
        &mut self,
        calendar_id: &str,
        event_id: &str,
        request: UpdateEventRequest,
    ) -> Result<CalendarEvent> {
        match self {
            CalendarClient::Google(client) => {
                client.update_event(calendar_id, event_id, request).await
            }
            CalendarClient::Outlook(client) => {
                client.update_event(calendar_id, event_id, request).await
            }
        }
    }

    /// Delete an event
    pub async fn delete_event(&mut self, calendar_id: &str, event_id: &str) -> Result<()> {
        match self {
            CalendarClient::Google(client) => client.delete_event(calendar_id, event_id).await,
            CalendarClient::Outlook(client) => client.delete_event(calendar_id, event_id).await,
        }
    }
}

/// Calendar manager that handles multiple connected accounts
pub struct CalendarManager {
    clients: Arc<DashMap<String, CalendarClient>>,
    accounts: Arc<DashMap<String, CalendarAccountInfo>>,
    pending_auth: Arc<DashMap<String, PendingOAuth>>,
}

impl CalendarManager {
    /// Create new calendar manager
    pub fn new() -> Self {
        Self {
            clients: Arc::new(DashMap::new()),
            accounts: Arc::new(DashMap::new()),
            pending_auth: Arc::new(DashMap::new()),
        }
    }

    /// Start OAuth flow for given provider
    pub fn start_oauth(
        &self,
        provider: CalendarProvider,
        client_id: String,
        client_secret: String,
        redirect_uri: String,
    ) -> Result<(String, String)> {
        let state = Uuid::new_v4().to_string();

        tracing::info!("Starting OAuth flow for {:?}, state: {}", provider, state);

        let client = match provider {
            CalendarProvider::Google => CalendarClient::new_google(
                client_id.clone(),
                client_secret.clone(),
                redirect_uri.clone(),
            ),
            CalendarProvider::Outlook => CalendarClient::new_outlook(
                client_id.clone(),
                client_secret.clone(),
                redirect_uri.clone(),
            ),
        };

        let (auth_url, pkce) = client.get_authorization_url(&state);
        self.pending_auth.insert(
            state.clone(),
            PendingOAuth {
                provider,
                settings: CalendarOAuthSettings {
                    client_id,
                    client_secret,
                    redirect_uri,
                },
                pkce,
            },
        );

        Ok((auth_url, state))
    }

    /// Retrieve pending OAuth configuration by state
    pub fn take_pending(
        &self,
        state: &str,
    ) -> Result<(CalendarProvider, CalendarOAuthSettings, PkceChallenge)> {
        self.pending_auth
            .remove(state)
            .map(|entry| {
                let pending = entry.1;
                (pending.provider, pending.settings, pending.pkce)
            })
            .ok_or_else(|| Error::Other("Invalid state parameter".to_string()))
    }

    /// Complete OAuth flow using pending configuration
    pub async fn complete_pending(
        provider: CalendarProvider,
        settings: CalendarOAuthSettings,
        pkce: PkceChallenge,
        code: &str,
    ) -> Result<(CalendarAccountInfo, CalendarClient)> {
        tracing::info!("Completing OAuth flow for {:?}", provider);

        let mut client = match provider {
            CalendarProvider::Google => CalendarClient::new_google(
                settings.client_id.clone(),
                settings.client_secret.clone(),
                settings.redirect_uri.clone(),
            ),
            CalendarProvider::Outlook => CalendarClient::new_outlook(
                settings.client_id.clone(),
                settings.client_secret.clone(),
                settings.redirect_uri.clone(),
            ),
        };

        client
            .authorize_with_code(code, &pkce.code_verifier)
            .await?;

        let token = client
            .token()
            .ok_or_else(|| Error::Other("OAuth provider returned no token".to_string()))?;

        let info = CalendarAccountInfo {
            provider,
            settings,
            token,
            email: None,
            display_name: None,
        };

        Ok((info, client))
    }

    /// Insert or update account information (optionally supplying a prepared client)
    pub fn upsert_account(
        &self,
        account_id: String,
        info: CalendarAccountInfo,
        client: Option<CalendarClient>,
    ) {
        if let Some(client) = client {
            self.clients.insert(account_id.clone(), client);
        } else if !self.clients.contains_key(&account_id) {
            let mut client = build_client(&info);
            client.set_token(info.token.clone());
            self.clients.insert(account_id.clone(), client);
        } else if let Some(mut entry) = self.clients.get_mut(&account_id) {
            entry.value_mut().set_token(info.token.clone());
        }

        self.accounts.insert(account_id, info);
    }

    fn ensure_client_loaded(&self, account_id: &str) -> Result<()> {
        if self.clients.contains_key(account_id) {
            return Ok(());
        }

        let info = self
            .accounts
            .get(account_id)
            .ok_or_else(|| Error::Other("Account not loaded".to_string()))?;

        let mut client = build_client(info.value());
        client.set_token(info.token.clone());
        self.clients.insert(account_id.to_string(), client);
        Ok(())
    }

    /// List calendars for an account
    pub async fn list_calendars(&self, account_id: &str) -> Result<Vec<Calendar>> {
        self.ensure_client_loaded(account_id)?;

        // Clone the client to avoid holding DashMap guard across await
        let mut client = {
            let entry = self
                .clients
                .get(account_id)
                .ok_or_else(|| Error::Other("Account not found".to_string()))?;
            entry.value().clone()
        };

        client.ensure_valid_token().await?;
        let result = client.list_calendars().await?;

        // Update token if changed
        if let Some(token) = client.token() {
            if let Some(mut entry) = self.clients.get_mut(account_id) {
                entry.value_mut().set_token(token.clone());
            }
            if let Some(mut info) = self.accounts.get_mut(account_id) {
                info.token = token;
            }
        }

        Ok(result)
    }

    /// List events for a calendar
    pub async fn list_events(
        &self,
        account_id: &str,
        request: &ListEventsRequest,
    ) -> Result<EventListResponse> {
        self.ensure_client_loaded(account_id)?;

        let mut client = {
            let entry = self
                .clients
                .get(account_id)
                .ok_or_else(|| Error::Other("Account not found".to_string()))?;
            entry.value().clone()
        };

        client.ensure_valid_token().await?;
        let result = client.list_events(request.clone()).await?;

        if let Some(token) = client.token() {
            if let Some(mut entry) = self.clients.get_mut(account_id) {
                entry.value_mut().set_token(token.clone());
            }
            if let Some(mut info) = self.accounts.get_mut(account_id) {
                info.token = token;
            }
        }

        Ok(result)
    }

    /// Create an event
    pub async fn create_event(
        &self,
        account_id: &str,
        request: &CreateEventRequest,
    ) -> Result<CalendarEvent> {
        self.ensure_client_loaded(account_id)?;

        let mut client = {
            let entry = self
                .clients
                .get(account_id)
                .ok_or_else(|| Error::Other("Account not found".to_string()))?;
            entry.value().clone()
        };

        client.ensure_valid_token().await?;
        let result = client.create_event(request.clone()).await?;

        if let Some(token) = client.token() {
            if let Some(mut entry) = self.clients.get_mut(account_id) {
                entry.value_mut().set_token(token.clone());
            }
            if let Some(mut info) = self.accounts.get_mut(account_id) {
                info.token = token;
            }
        }

        Ok(result)
    }

    /// Update an event
    pub async fn update_event(
        &self,
        account_id: &str,
        calendar_id: &str,
        event_id: &str,
        request: &UpdateEventRequest,
    ) -> Result<CalendarEvent> {
        self.ensure_client_loaded(account_id)?;

        let mut client = {
            let entry = self
                .clients
                .get(account_id)
                .ok_or_else(|| Error::Other("Account not found".to_string()))?;
            entry.value().clone()
        };

        client.ensure_valid_token().await?;
        let result = client
            .update_event(calendar_id, event_id, request.clone())
            .await?;

        if let Some(token) = client.token() {
            if let Some(mut entry) = self.clients.get_mut(account_id) {
                entry.value_mut().set_token(token.clone());
            }
            if let Some(mut info) = self.accounts.get_mut(account_id) {
                info.token = token;
            }
        }

        Ok(result)
    }

    /// Delete an event
    pub async fn delete_event(
        &self,
        account_id: &str,
        calendar_id: &str,
        event_id: &str,
    ) -> Result<()> {
        self.ensure_client_loaded(account_id)?;

        let mut client = {
            let entry = self
                .clients
                .get(account_id)
                .ok_or_else(|| Error::Other("Account not found".to_string()))?;
            entry.value().clone()
        };

        client.ensure_valid_token().await?;
        client.delete_event(calendar_id, event_id).await?;

        if let Some(token) = client.token() {
            if let Some(mut entry) = self.clients.get_mut(account_id) {
                entry.value_mut().set_token(token.clone());
            }
            if let Some(mut info) = self.accounts.get_mut(account_id) {
                info.token = token;
            }
        }

        Ok(())
    }

    /// Remove an account/client from memory
    pub fn remove_account(&self, account_id: &str) {
        self.clients.remove(account_id);
        self.accounts.remove(account_id);
    }

    /// List loaded account identifiers
    pub fn list_accounts(&self) -> Vec<String> {
        self.accounts
            .iter()
            .map(|entry| entry.key().clone())
            .collect()
    }

    /// Snapshot of account information (if loaded)
    pub fn account_info(&self, account_id: &str) -> Option<CalendarAccountInfo> {
        self.accounts.get(account_id).map(|entry| entry.clone())
    }
}

impl Default for CalendarManager {
    fn default() -> Self {
        Self::new()
    }
}

fn build_client(info: &CalendarAccountInfo) -> CalendarClient {
    match info.provider {
        CalendarProvider::Google => CalendarClient::new_google(
            info.settings.client_id.clone(),
            info.settings.client_secret.clone(),
            info.settings.redirect_uri.clone(),
        ),
        CalendarProvider::Outlook => CalendarClient::new_outlook(
            info.settings.client_id.clone(),
            info.settings.client_secret.clone(),
            info.settings.redirect_uri.clone(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calendar_manager_creation() {
        let manager = CalendarManager::new();
        assert_eq!(manager.list_accounts().len(), 0);
    }

    #[test]
    fn test_start_oauth() {
        let manager = CalendarManager::new();

        let result = manager.start_oauth(
            CalendarProvider::Google,
            "test_client_id".to_string(),
            "test_client_secret".to_string(),
            "http://localhost:8080/callback".to_string(),
        );

        assert!(result.is_ok());

        let (auth_url, state) = result.unwrap();
        assert!(auth_url.contains("accounts.google.com"));
        assert!(!state.is_empty());
    }
}

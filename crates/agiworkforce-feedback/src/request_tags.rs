use agiworkforce_login::AuthEnvTelemetry;

/// Structured feedback tags collected from each API request attempt.
///
/// All fields are serialized as tracing event fields under the
/// `"feedback_tags"` target so they are picked up by the ring buffer.
pub struct FeedbackRequestTags<'a> {
    pub endpoint: &'a str,
    pub auth_header_attached: bool,
    pub auth_header_name: Option<&'a str>,
    pub auth_mode: Option<&'a str>,
    pub auth_retry_after_unauthorized: Option<bool>,
    pub auth_recovery_mode: Option<&'a str>,
    pub auth_recovery_phase: Option<&'a str>,
    pub auth_connection_reused: Option<bool>,
    pub auth_request_id: Option<&'a str>,
    pub auth_cf_ray: Option<&'a str>,
    pub auth_error: Option<&'a str>,
    pub auth_error_code: Option<&'a str>,
    pub auth_recovery_followup_success: Option<bool>,
    pub auth_recovery_followup_status: Option<u16>,
}

/// Emit request tags as tracing feedback fields (without auth-env fields).
pub fn emit_feedback_request_tags(tags: &FeedbackRequestTags<'_>) {
    tracing::event!(
        target: "feedback_tags",
        tracing::Level::INFO,
        endpoint = tags.endpoint,
        auth_header_attached = tags.auth_header_attached,
        auth_header_name = tags.auth_header_name,
        auth_mode = tags.auth_mode,
        auth_retry_after_unauthorized = tags.auth_retry_after_unauthorized.map(|b| b.to_string()).as_deref(),
        auth_recovery_mode = tags.auth_recovery_mode,
        auth_recovery_phase = tags.auth_recovery_phase,
        auth_connection_reused = tags.auth_connection_reused.map(|b| b.to_string()).as_deref(),
        auth_request_id = tags.auth_request_id,
        auth_cf_ray = tags.auth_cf_ray,
        auth_error = tags.auth_error,
        auth_error_code = tags.auth_error_code,
        auth_recovery_followup_success = tags.auth_recovery_followup_success.map(|b| b.to_string()).as_deref(),
        auth_recovery_followup_status = tags.auth_recovery_followup_status.map(|s| s.to_string()).as_deref(),
    );
}

/// Emit request tags plus auth-environment telemetry as tracing feedback fields.
pub fn emit_feedback_request_tags_with_auth_env(
    tags: &FeedbackRequestTags<'_>,
    auth_env: &AuthEnvTelemetry,
) {
    tracing::event!(
        target: "feedback_tags",
        tracing::Level::INFO,
        endpoint = tags.endpoint,
        auth_header_attached = tags.auth_header_attached,
        auth_header_name = tags.auth_header_name,
        auth_mode = tags.auth_mode,
        auth_retry_after_unauthorized = tags.auth_retry_after_unauthorized.map(|b| b.to_string()).as_deref(),
        auth_recovery_mode = tags.auth_recovery_mode,
        auth_recovery_phase = tags.auth_recovery_phase,
        auth_connection_reused = tags.auth_connection_reused.map(|b| b.to_string()).as_deref(),
        auth_request_id = tags.auth_request_id,
        auth_cf_ray = tags.auth_cf_ray,
        auth_error = tags.auth_error,
        auth_error_code = tags.auth_error_code,
        auth_recovery_followup_success = tags.auth_recovery_followup_success.map(|b| b.to_string()).as_deref(),
        auth_recovery_followup_status = tags.auth_recovery_followup_status.map(|s| s.to_string()).as_deref(),
        auth_env_openai_api_key_present = auth_env.openai_api_key_env_present,
        auth_env_agiworkforce_api_key_present = auth_env.agiworkforce_api_key_env_present,
        auth_env_agiworkforce_api_key_enabled = auth_env.agiworkforce_api_key_env_enabled,
        auth_env_provider_key_name = auth_env.provider_env_key_name.as_deref(),
        auth_env_provider_key_present = auth_env.provider_env_key_present.map(|b| b.to_string()).as_deref(),
        auth_env_refresh_token_url_override_present = auth_env.refresh_token_url_override_present,
    );
}

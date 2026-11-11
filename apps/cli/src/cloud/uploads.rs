use crate::cloud::client::{CloudClient, CloudError};
use crate::path_security::DirectoryAuthority;
use bytes::Bytes;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::{collections::HashMap, time::Duration};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadContract {
    pub resumable_path: String,
    pub part_bytes: usize,
    pub transfer_timeout_ms: u64,
    pub abort_timeout_ms: u64,
}
pub(crate) fn contract() -> Result<UploadContract, CloudError> {
    serde_json::from_str(include_str!(
        "../../../../packages/contracts/cloud-contracts/src/upload-contract.json"
    ))
    .map_err(|error| CloudError::Decode(error.to_string()))
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Session {
    pub upload_id: String,
    pub session: String,
    pub part_bytes: usize,
    pub part_count: usize,
    expires_at: String,
}
impl Session {
    pub(crate) fn validate(&self, byte_count: usize) -> Result<(), CloudError> {
        let valid = !self.upload_id.is_empty()
            && !self.session.is_empty()
            && !self.upload_id.chars().any(char::is_control)
            && self.part_bytes == contract()?.part_bytes
            && self.part_bytes > 0
            && self.part_count == byte_count.div_ceil(self.part_bytes)
            && chrono::DateTime::parse_from_rfc3339(&self.expires_at)
                .is_ok_and(|expiry| expiry > chrono::Utc::now());
        if valid {
            Ok(())
        } else {
            Err(CloudError::Decode(
                "The account returned an invalid upload session. No file bytes were sent.".into(),
            ))
        }
    }
    pub(crate) fn path(&self) -> Result<String, CloudError> {
        Ok(format!(
            "{}/{}",
            contract()?.resumable_path,
            urlencoding::encode(&self.upload_id)
        ))
    }
    pub(crate) fn session_path(&self) -> Result<String, CloudError> {
        Ok(format!(
            "{}?session={}",
            self.path()?,
            urlencoding::encode(&self.session)
        ))
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    upload_id: String,
    part_bytes: usize,
    parts: Vec<StoredPart>,
    bytes_stored: usize,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPart {
    part_number: usize,
    size: usize,
}
pub(crate) async fn progress(
    client: &CloudClient,
    session: &Session,
    bytes: usize,
) -> Result<Vec<usize>, CloudError> {
    let response: Progress = client
        .get_bounded(
            &session.session_path()?,
            &[],
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    let mut numbers = Vec::new();
    let mut stored = 0usize;
    for part in response.parts {
        if part.part_number == 0
            || part.part_number > session.part_count
            || numbers.contains(&part.part_number)
            || part.size != part_length(session, bytes, part.part_number)
        {
            return Err(CloudError::Decode(
                "The stored upload parts do not match the reviewed file".into(),
            ));
        }
        numbers.push(part.part_number);
        stored = stored.saturating_add(part.size);
    }
    if response.upload_id != session.upload_id
        || response.part_bytes != session.part_bytes
        || stored != response.bytes_stored
        || stored > bytes
    {
        return Err(CloudError::Decode(
            "The upload progress does not match the reviewed file".into(),
        ));
    }
    Ok(numbers)
}
pub(crate) fn part_length(session: &Session, bytes: usize, number: usize) -> usize {
    bytes
        .saturating_sub((number - 1) * session.part_bytes)
        .min(session.part_bytes)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignedPart {
    part_number: usize,
    url: String,
    method: String,
    headers: HashMap<String, String>,
}
pub(crate) async fn send_part(
    client: &CloudClient,
    session: &Session,
    number: usize,
    bytes: Bytes,
) -> Result<(), CloudError> {
    #[derive(Deserialize)]
    struct Parts {
        parts: Vec<SignedPart>,
    }
    let signed: Parts = client
        .post_bounded(
            &format!("{}/parts", session.path()?),
            &serde_json::json!({ "session":session.session,"partNumbers":[number] }),
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    let [part] = &signed.parts[..] else {
        return Err(CloudError::Decode(
            "The account returned an unexpected set of upload parts".into(),
        ));
    };
    if part.part_number != number
        || part.method != "PUT"
        || part.headers.keys().any(|name| {
            name.eq_ignore_ascii_case("authorization")
                || name.eq_ignore_ascii_case("cookie")
                || name.eq_ignore_ascii_case(
                    &crate::cloud::conversation_contract::contract().organization_header,
                )
        })
    {
        return Err(CloudError::Decode(
            "The account returned an invalid signed upload part".into(),
        ));
    }
    client
        .upload_bytes_bounded(
            &part.url,
            &part.headers,
            bytes,
            Duration::from_millis(contract()?.transfer_timeout_ms),
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await
}
pub(crate) async fn abort(client: &CloudClient, session: &Session) -> Result<(), CloudError> {
    #[derive(Deserialize)]
    struct Aborted {
        aborted: bool,
    }
    let result: Aborted = client
        .delete_bounded(
            &session.session_path()?,
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    if result.aborted {
        Ok(())
    } else {
        Err(CloudError::Decode(
            "The account did not confirm partial-upload cleanup".into(),
        ))
    }
}

pub(crate) fn snapshot(
    path: &str,
    selected_at_ms: i64,
    max_bytes: u64,
    max_name_length: usize,
    validate: impl FnOnce(&str, &str) -> Result<(), CloudError>,
) -> Result<(String, String, Bytes), CloudError> {
    let decision = chrono::DateTime::from_timestamp_millis(selected_at_ms)
        .ok_or_else(|| CloudError::LocalFile("The file selection time is invalid".into()))?;
    if selected_at_ms < 0 || decision > chrono::Utc::now() {
        return Err(CloudError::LocalFile(
            "The file selection time is invalid".into(),
        ));
    }
    let (authority, leaf) = DirectoryAuthority::selected_file(Path::new(path)).map_err(local)?;
    let file_name = leaf
        .to_str()
        .ok_or_else(|| CloudError::LocalFile("Choose a file with a Unicode name".into()))?
        .to_owned();
    if file_name.encode_utf16().count() > max_name_length {
        return Err(CloudError::LocalFile(
            "The selected filename is too long for Cloud storage".into(),
        ));
    }
    let mime = mime_guess::from_path(leaf.as_path())
        .first_or_octet_stream()
        .essence_str()
        .to_string();
    validate(&file_name, &mime)?;
    let file = authority
        .read_selected_file(leaf.as_path(), max_bytes, selected_at_ms)
        .map_err(local)?
        .ok_or_else(|| CloudError::LocalFile("The selected file was removed".into()))?;
    if file.bytes.is_empty() {
        return Err(CloudError::LocalFile("The selected file is empty".into()));
    }
    Ok((file_name, mime, Bytes::from(file.bytes)))
}
fn local(error: anyhow::Error) -> CloudError {
    CloudError::LocalFile(error.to_string())
}
pub(crate) fn checksum(bytes: &[u8]) -> String {
    crate::hex::encode(&Sha256::digest(bytes))
}

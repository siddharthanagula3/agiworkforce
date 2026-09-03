
use schemars::JsonSchema;
use serde::Deserialize;
use serde::Serialize;
use ts_rs::TS;

/// Bounded accent color palette for project visual identity. Mirrors
/// `ProjectAccentColor` in `packages/contracts/types/src/suite-contracts.ts`.
/// Default is `Zinc`, mirroring the TS `PROJECT_ACCENT_FALLBACK`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum ProjectAccentColor {
    Emerald,
    Sky,
    Amber,
    Rose,
    Violet,
    #[default]
    Zinc,
}

/// Provenance for imported projects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum ProjectImportSource {
    Claude,
    Openai,
    Manual,
}

/// Project member role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum ProjectMemberRole {
    Owner,
    Editor,
    Viewer,
}

/// Privacy mode mirrors `PrivacyMode` from `@agiworkforce/types`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum ProjectPrivacyMode {
    Local,
    Byok,
    Managed,
}

/// Provider mode mirrors `ProviderMode` from `@agiworkforce/types`. The TS
/// vocabulary uses PascalCase variants (`'Local' | 'DirectByok' | …`); we
/// preserve that on the wire so deserialization of payloads emitted by the
/// TS side round-trips cleanly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
pub enum ProjectProviderMode {
    Local,
    DirectByok,
    ManagedGateway,
    ManagedNative,
}

/// Source surface mirrors `SourceSurface` from `@agiworkforce/types`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum ProjectSourceSurface {
    Web,
    Desktop,
    Mobile,
    Cli,
    Vscode,
    Chrome,
}

pub const SYNCED_APP_SURFACES: &[ProjectSourceSurface] = &[
    ProjectSourceSurface::Web,
    ProjectSourceSurface::Desktop,
    ProjectSourceSurface::Mobile,
];

/// Developer-session surfaces per the locked /goal rule. Mirrors the TS
/// `DEVELOPER_SESSION_SURFACES` export. These surfaces keep separate
/// developer-session history and never sync consumer chat.
pub const DEVELOPER_SESSION_SURFACES: &[ProjectSourceSurface] = &[
    ProjectSourceSurface::Cli,
    ProjectSourceSurface::Vscode,
    ProjectSourceSurface::Chrome,
];

impl ProjectSourceSurface {
    /// Returns `true` if this surface participates in consumer chat sync.
    /// Mirrors the TS `isSyncedAppSurface` helper.
    pub fn is_synced_app_surface(self) -> bool {
        matches!(self, Self::Web | Self::Desktop | Self::Mobile)
    }

    /// Returns `true` if this surface is a developer-session surface
    /// (CLI / VS Code / Chrome). Mirrors `isDeveloperSessionSurface`.
    pub fn is_developer_session_surface(self) -> bool {
        matches!(self, Self::Cli | Self::Vscode | Self::Chrome)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub owner_user_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub organization_id: Option<String>,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub default_privacy_mode: ProjectPrivacyMode,
    pub default_provider_mode: ProjectProviderMode,
    pub allowed_surfaces: Vec<ProjectSourceSurface>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_model_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub knowledge_file_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub member_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_used_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon_emoji: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent_color: Option<ProjectAccentColor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imported_from: Option<ProjectImportSource>,
    /// Whether the project is archived. Mirrors Postgres `is_archived`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_archived: Option<bool>,
    /// Free-form jsonb metadata. Mirrors Postgres `metadata` column.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMember {
    pub id: String,
    pub project_id: String,
    pub user_id: String,
    pub role: ProjectMemberRole,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invited_by_user_id: Option<String>,
    pub added_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectKnowledgeFile {
    pub id: String,
    pub project_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub byte_count: u64,
    pub checksum_sha256: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    pub source_surface: ProjectSourceSurface,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub added_by_user_id: Option<String>,
    pub added_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retention_expires_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    pub storage_uri: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInstructions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response_style: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub format_preference: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub safety_directives: Option<String>,
}

/// Normalize an accent color string to the bounded palette. Mirrors
/// `normalizeProjectAccentColor` in `packages/contracts/types/src/suite-contracts.ts`.
pub fn normalize_accent_color(value: Option<&str>) -> ProjectAccentColor {
    match value {
        Some("emerald") => ProjectAccentColor::Emerald,
        Some("sky") => ProjectAccentColor::Sky,
        Some("amber") => ProjectAccentColor::Amber,
        Some("rose") => ProjectAccentColor::Rose,
        Some("violet") => ProjectAccentColor::Violet,
        Some("zinc") => ProjectAccentColor::Zinc,
        _ => ProjectAccentColor::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_record() -> ProjectRecord {
        ProjectRecord {
            id: "proj_1".to_string(),
            owner_user_id: "user_1".to_string(),
            organization_id: None,
            name: "Local research".to_string(),
            description: Some("On-device only experiments.".to_string()),
            default_privacy_mode: ProjectPrivacyMode::Local,
            default_provider_mode: ProjectProviderMode::Local,
            allowed_surfaces: vec![
                ProjectSourceSurface::Web,
                ProjectSourceSurface::Desktop,
                ProjectSourceSurface::Mobile,
            ],
            instructions: None,
            default_model_id: None,
            knowledge_file_count: None,
            member_count: None,
            last_used_at: None,
            icon_emoji: None,
            accent_color: None,
            imported_from: Some(ProjectImportSource::Manual),
            is_archived: None,
            metadata: None,
            created_at: "2026-05-01T00:00:00Z".to_string(),
            updated_at: "2026-05-20T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn accent_color_defaults_to_zinc() {
        assert_eq!(ProjectAccentColor::default(), ProjectAccentColor::Zinc);
    }

    #[test]
    fn normalize_accent_color_round_trips_known_values() {
        assert_eq!(
            normalize_accent_color(Some("emerald")),
            ProjectAccentColor::Emerald
        );
        assert_eq!(normalize_accent_color(Some("sky")), ProjectAccentColor::Sky);
        assert_eq!(
            normalize_accent_color(Some("amber")),
            ProjectAccentColor::Amber
        );
        assert_eq!(
            normalize_accent_color(Some("rose")),
            ProjectAccentColor::Rose
        );
        assert_eq!(
            normalize_accent_color(Some("violet")),
            ProjectAccentColor::Violet
        );
        assert_eq!(
            normalize_accent_color(Some("zinc")),
            ProjectAccentColor::Zinc
        );
    }

    #[test]
    fn normalize_accent_color_falls_back_for_unknown_and_none() {
        assert_eq!(
            normalize_accent_color(Some("teal")),
            ProjectAccentColor::Zinc
        );
        assert_eq!(normalize_accent_color(None), ProjectAccentColor::Zinc);
    }

    #[test]
    fn synced_app_surfaces_matches_canonical_set() {
        assert_eq!(
            SYNCED_APP_SURFACES,
            &[
                ProjectSourceSurface::Web,
                ProjectSourceSurface::Desktop,
                ProjectSourceSurface::Mobile,
            ]
        );
    }

    #[test]
    fn developer_session_surfaces_matches_canonical_set() {
        assert_eq!(
            DEVELOPER_SESSION_SURFACES,
            &[
                ProjectSourceSurface::Cli,
                ProjectSourceSurface::Vscode,
                ProjectSourceSurface::Chrome,
            ]
        );
    }

    #[test]
    fn is_synced_app_surface_accepts_web_desktop_mobile() {
        assert!(ProjectSourceSurface::Web.is_synced_app_surface());
        assert!(ProjectSourceSurface::Desktop.is_synced_app_surface());
        assert!(ProjectSourceSurface::Mobile.is_synced_app_surface());
        assert!(!ProjectSourceSurface::Cli.is_synced_app_surface());
        assert!(!ProjectSourceSurface::Vscode.is_synced_app_surface());
        assert!(!ProjectSourceSurface::Chrome.is_synced_app_surface());
    }

    #[test]
    fn is_developer_session_surface_accepts_cli_vscode_chrome() {
        assert!(ProjectSourceSurface::Cli.is_developer_session_surface());
        assert!(ProjectSourceSurface::Vscode.is_developer_session_surface());
        assert!(ProjectSourceSurface::Chrome.is_developer_session_surface());
        assert!(!ProjectSourceSurface::Web.is_developer_session_surface());
        assert!(!ProjectSourceSurface::Desktop.is_developer_session_surface());
        assert!(!ProjectSourceSurface::Mobile.is_developer_session_surface());
    }

    #[test]
    fn surface_classifications_are_mutually_exclusive() {
        for surface in [
            ProjectSourceSurface::Web,
            ProjectSourceSurface::Desktop,
            ProjectSourceSurface::Mobile,
            ProjectSourceSurface::Cli,
            ProjectSourceSurface::Vscode,
            ProjectSourceSurface::Chrome,
        ] {
            assert_ne!(
                surface.is_synced_app_surface(),
                surface.is_developer_session_surface(),
                "every surface must be in exactly one classification: {surface:?}"
            );
        }
    }

    #[test]
    fn project_record_serialises_to_camelcase() {
        let record = sample_record();
        let json = serde_json::to_value(&record).expect("serialize");
        assert!(json.get("ownerUserId").is_some());
        assert!(json.get("defaultPrivacyMode").is_some());
        assert!(json.get("defaultProviderMode").is_some());
        assert!(json.get("allowedSurfaces").is_some());
        assert!(json.get("importedFrom").is_some());
    }

    #[test]
    fn project_record_round_trips_through_serde() {
        let record = sample_record();
        let json = serde_json::to_string(&record).expect("serialize");
        let back: ProjectRecord = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(record, back);
    }

    #[test]
    fn project_record_omits_none_fields_on_the_wire() {
        let record = sample_record();
        let json = serde_json::to_value(&record).expect("serialize");
        // None fields use skip_serializing_if so they should not appear.
        assert!(json.get("organizationId").is_none());
        assert!(json.get("instructions").is_none());
        assert!(json.get("defaultModelId").is_none());
        assert!(json.get("knowledgeFileCount").is_none());
        assert!(json.get("memberCount").is_none());
        assert!(json.get("lastUsedAt").is_none());
        assert!(json.get("iconEmoji").is_none());
        assert!(json.get("accentColor").is_none());
    }

    #[test]
    fn privacy_mode_uses_lowercase_wire_form() {
        let json = serde_json::to_string(&ProjectPrivacyMode::Local).expect("serialize");
        assert_eq!(json, "\"local\"");
        let json = serde_json::to_string(&ProjectPrivacyMode::Byok).expect("serialize");
        assert_eq!(json, "\"byok\"");
        let json = serde_json::to_string(&ProjectPrivacyMode::Managed).expect("serialize");
        assert_eq!(json, "\"managed\"");
    }

    #[test]
    fn provider_mode_uses_pascalcase_wire_form() {
        let json = serde_json::to_string(&ProjectProviderMode::Local).expect("serialize");
        assert_eq!(json, "\"Local\"");
        let json = serde_json::to_string(&ProjectProviderMode::DirectByok).expect("serialize");
        assert_eq!(json, "\"DirectByok\"");
        let json = serde_json::to_string(&ProjectProviderMode::ManagedGateway).expect("serialize");
        assert_eq!(json, "\"ManagedGateway\"");
    }

    #[test]
    fn import_source_uses_lowercase_wire_form() {
        let json = serde_json::to_string(&ProjectImportSource::Claude).expect("serialize");
        assert_eq!(json, "\"claude\"");
        let json = serde_json::to_string(&ProjectImportSource::Openai).expect("serialize");
        assert_eq!(json, "\"openai\"");
        let json = serde_json::to_string(&ProjectImportSource::Manual).expect("serialize");
        assert_eq!(json, "\"manual\"");
    }

    #[test]
    fn member_role_uses_lowercase_wire_form() {
        let json = serde_json::to_string(&ProjectMemberRole::Owner).expect("serialize");
        assert_eq!(json, "\"owner\"");
        let json = serde_json::to_string(&ProjectMemberRole::Editor).expect("serialize");
        assert_eq!(json, "\"editor\"");
        let json = serde_json::to_string(&ProjectMemberRole::Viewer).expect("serialize");
        assert_eq!(json, "\"viewer\"");
    }

    #[test]
    fn project_member_round_trips_through_serde() {
        let member = ProjectMember {
            id: "mem_1".to_string(),
            project_id: "proj_1".to_string(),
            user_id: "user_2".to_string(),
            role: ProjectMemberRole::Editor,
            invited_by_user_id: Some("user_1".to_string()),
            added_at: "2026-05-20T00:00:00Z".to_string(),
        };
        let json = serde_json::to_string(&member).expect("serialize");
        let back: ProjectMember = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(member, back);
    }

    #[test]
    fn project_knowledge_file_round_trips_through_serde() {
        let file = ProjectKnowledgeFile {
            id: "kf_1".to_string(),
            project_id: "proj_1".to_string(),
            file_name: "spec.md".to_string(),
            mime_type: "text/markdown".to_string(),
            byte_count: 4096,
            checksum_sha256: "abc".to_string(),
            summary: Some("Project spec.".to_string()),
            source_surface: ProjectSourceSurface::Desktop,
            added_by_user_id: Some("user_1".to_string()),
            added_at: "2026-05-20T00:00:00Z".to_string(),
            retention_expires_at: None,
            deleted_at: None,
            storage_uri: "cloud-storage://projects/proj_1/kf_1".to_string(),
        };
        let json = serde_json::to_string(&file).expect("serialize");
        let back: ProjectKnowledgeFile = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(file, back);
    }

    #[test]
    fn instructions_default_is_all_none() {
        let instructions = ProjectInstructions::default();
        assert!(instructions.system_prompt.is_none());
        assert!(instructions.response_style.is_none());
        assert!(instructions.format_preference.is_none());
        assert!(instructions.safety_directives.is_none());
    }

    // -- Parity guard against the TS canonical contract --
    //
    // These tests read the canonical TS source
    // (`packages/contracts/types/src/suite-contracts.ts`) at test time and assert that
    // this hand-maintained Rust mirror enumerates exactly the same wire-form
    // string-literal members. If the TS side adds/removes/renames a variant
    // (e.g. a new `PrivacyMode` or `SourceSurface`), these tests fail loudly so
    // the mirror cannot desynchronize silently and break cross-surface
    // deserialization of project payloads.

    /// Absolute path to the canonical TS contract, resolved from the crate's
    /// manifest dir so it works regardless of the test runner's cwd.
    fn suite_contracts_ts() -> std::path::PathBuf {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../packages/contracts/types/src/suite-contracts.ts")
    }

    /// Extract the string-literal members of a single-line TS union type
    /// declaration of the form `export type Name = 'a' | 'b' | 'c';`.
    fn ts_union_members(source: &str, type_name: &str) -> Vec<String> {
        let needle = format!("export type {type_name} =");
        let line = source
            .lines()
            .find(|l| l.trim_start().starts_with(&needle))
            .unwrap_or_else(|| {
                panic!("type `{type_name}` not found in suite-contracts.ts, TS contract changed")
            });
        let rhs = line.split_once('=').expect("union declaration has `=`").1;
        let mut members: Vec<String> = rhs
            .split('|')
            .filter_map(|part| {
                let part = part.trim().trim_end_matches(';').trim();
                let inner = part.strip_prefix('\'')?.strip_suffix('\'')?;
                Some(inner.to_string())
            })
            .collect();
        members.sort();
        assert!(
            !members.is_empty(),
            "no string-literal members parsed for `{type_name}`, TS declaration format changed"
        );
        members
    }

    /// Serialize an enum value and strip the surrounding JSON quotes to recover
    /// its on-the-wire string form.
    fn wire_form<T: Serialize>(value: &T) -> String {
        serde_json::to_string(value)
            .expect("serialize")
            .trim_matches('"')
            .to_string()
    }

    fn sorted(mut v: Vec<String>) -> Vec<String> {
        v.sort();
        v
    }

    #[test]
    fn privacy_mode_matches_ts_canonical() {
        let ts = std::fs::read_to_string(suite_contracts_ts()).expect("read suite-contracts.ts");
        let ts_members = ts_union_members(&ts, "PrivacyMode");
        let rust_members = sorted(
            [
                ProjectPrivacyMode::Local,
                ProjectPrivacyMode::Byok,
                ProjectPrivacyMode::Managed,
            ]
            .iter()
            .map(wire_form)
            .collect(),
        );
        assert_eq!(
            rust_members, ts_members,
            "ProjectPrivacyMode wire forms drifted from TS `PrivacyMode`"
        );
    }

    #[test]
    fn provider_mode_matches_ts_canonical() {
        let ts = std::fs::read_to_string(suite_contracts_ts()).expect("read suite-contracts.ts");
        let ts_members = ts_union_members(&ts, "ProviderMode");
        let rust_members = sorted(
            [
                ProjectProviderMode::Local,
                ProjectProviderMode::DirectByok,
                ProjectProviderMode::ManagedGateway,
                ProjectProviderMode::ManagedNative,
            ]
            .iter()
            .map(wire_form)
            .collect(),
        );
        assert_eq!(
            rust_members, ts_members,
            "ProjectProviderMode wire forms drifted from TS `ProviderMode`"
        );
    }

    #[test]
    fn source_surface_matches_ts_canonical() {
        let ts = std::fs::read_to_string(suite_contracts_ts()).expect("read suite-contracts.ts");
        let ts_members = ts_union_members(&ts, "SourceSurface");
        let rust_members = sorted(
            [
                ProjectSourceSurface::Web,
                ProjectSourceSurface::Desktop,
                ProjectSourceSurface::Mobile,
                ProjectSourceSurface::Cli,
                ProjectSourceSurface::Vscode,
                ProjectSourceSurface::Chrome,
            ]
            .iter()
            .map(wire_form)
            .collect(),
        );
        assert_eq!(
            rust_members, ts_members,
            "ProjectSourceSurface wire forms drifted from TS `SourceSurface`"
        );
    }
}

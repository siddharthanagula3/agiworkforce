use super::*;

struct Fixture {
    base: tempfile::TempDir,
    workspace: tempfile::TempDir,
    authority: WorkspaceFileAuthority,
}
impl Fixture {
    fn new() -> Self {
        let base = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        std::fs::create_dir(workspace.path().join(".git")).unwrap();
        let authority = WorkspaceFileAuthority::new(workspace.path()).unwrap();
        Self {
            base,
            workspace,
            authority,
        }
    }
    fn profile(&self) -> SettingsReadResponse {
        SettingsReadResponse {
            default_model: None,
            default_effort: None,
            permission_mode: None,
            user_instructions: None,
            project_instructions: None,
            user_instructions_path: self
                .base
                .path()
                .join(crate::compaction::USER_INSTRUCTIONS_FILE)
                .display()
                .to_string(),
            project_instructions_path: self
                .workspace
                .path()
                .join(crate::compaction::PROJECT_INSTRUCTIONS_FILE)
                .display()
                .to_string(),
            config_path: self.base.path().join("config.toml").display().to_string(),
        }
    }
    fn read(&self, scope: InstructionSettingsScope) -> InstructionSettingsSnapshot {
        read(
            self.base.path(),
            &self.authority,
            InstructionSettingsReadParams {
                root_key: self.authority.identity().unwrap(),
                scope,
            },
            self.profile(),
        )
        .unwrap()
    }
    fn params(
        &self,
        snapshot: &InstructionSettingsSnapshot,
        text: &str,
    ) -> InstructionSettingsWriteParams {
        InstructionSettingsWriteParams {
            root_key: snapshot.root_key.clone(),
            scope: snapshot.scope,
            revision: snapshot.revision.clone(),
            text: text.into(),
        }
    }
    fn write(
        &self,
        params: InstructionSettingsWriteParams,
    ) -> Result<InstructionSettingsWriteResponse, DeveloperSessionHostError> {
        write(self.base.path(), &self.authority, params, self.profile())
    }
}

#[test]
fn reads_distinguish_absence_without_creating_project_instruction_folders() {
    let fixture = Fixture::new();
    let project = fixture.read(InstructionSettingsScope::Project);
    assert_eq!(project.revision, None);
    assert!(project.text.is_empty());
    assert!(!fixture.workspace.path().join(".agiworkforce").exists());
    assert_ne!(
        project.path,
        fixture.read(InstructionSettingsScope::User).path
    );
}

#[test]
fn scopes_write_exact_text_and_the_context_engine_loads_the_same_files() {
    let fixture = Fixture::new();
    let project = fixture.read(InstructionSettingsScope::Project);
    let user = fixture.read(InstructionSettingsScope::User);
    assert!(
        fixture
            .write(fixture.params(&project, "folder 東京\r\n🦀"))
            .unwrap()
            .saved
    );
    assert!(
        fixture
            .write(fixture.params(&user, "profile instructions"))
            .unwrap()
            .saved
    );
    assert_eq!(
        fixture.read(InstructionSettingsScope::Project).text,
        "folder 東京\r\n🦀"
    );
    assert_eq!(
        fixture.read(InstructionSettingsScope::User).text,
        "profile instructions"
    );
    crate::compaction::with_config_home(fixture.base.path(), || {
        let loaded = crate::compaction::load_instructions(fixture.workspace.path()).unwrap();
        assert!(loaded.contains("folder 東京"));
        assert!(loaded.contains("profile instructions"));
    });
}

#[test]
fn an_external_change_returns_a_conflict_and_a_reviewed_revision_can_replace_it() {
    let fixture = Fixture::new();
    let original = fixture.read(InstructionSettingsScope::Project);
    let saved = fixture
        .write(fixture.params(&original, "first"))
        .unwrap()
        .current;
    std::fs::write(&saved.path, "external edit").unwrap();
    let conflict = fixture.write(fixture.params(&saved, "my edits")).unwrap();
    assert!(!conflict.saved);
    assert_eq!(conflict.current.text, "external edit");
    assert_eq!(
        std::fs::read_to_string(&saved.path).unwrap(),
        "external edit"
    );
    assert!(
        fixture
            .write(fixture.params(&conflict.current, "my edits"))
            .unwrap()
            .saved
    );
}

#[test]
fn empty_native_saves_keep_the_file_and_legacy_empty_writes_still_delete_it() {
    let fixture = Fixture::new();
    let original = fixture.read(InstructionSettingsScope::Project);
    let saved = fixture
        .write(fixture.params(&original, "remove this text"))
        .unwrap()
        .current;
    let cleared = fixture.write(fixture.params(&saved, "")).unwrap().current;
    assert!(Path::new(&cleared.path).is_file());
    assert!(cleared.revision.is_some());
    assert!(cleared.text.is_empty());
    write_legacy(
        fixture.base.path(),
        &fixture.authority,
        InstructionSettingsScope::Project,
        "",
    )
    .unwrap();
    assert!(!Path::new(&cleared.path).exists());
}

#[test]
fn lost_acknowledgements_read_back_the_accepted_revision_without_another_write() {
    let fixture = Fixture::new();
    let request = fixture.params(
        &fixture.read(InstructionSettingsScope::User),
        "accepted before disconnect",
    );
    let accepted = fixture.write(request.clone()).unwrap().current;
    assert_eq!(fixture.read(InstructionSettingsScope::User), accepted);
    assert_eq!(fixture.write(request).unwrap().current, accepted);
}

#[test]
fn invalid_roots_limits_and_binary_files_fail_without_becoming_empty_settings() {
    let fixture = Fixture::new();
    let original = fixture.read(InstructionSettingsScope::User);
    let mut foreign = fixture.params(&original, "must not write");
    foreign.root_key = "foreign".into();
    assert!(fixture.write(foreign).is_err());
    assert!(fixture
        .write(fixture.params(&original, &"x".repeat(MAX_INSTRUCTION_EDIT_BYTES + 1)))
        .is_err());
    assert!(fixture
        .write(fixture.params(&original, "bad\0text"))
        .is_err());
    assert!(!Path::new(&original.path).exists());
    std::fs::write(&original.path, [0xff, 0xfe]).unwrap();
    assert!(read(
        fixture.base.path(),
        &fixture.authority,
        InstructionSettingsReadParams {
            root_key: original.root_key,
            scope: InstructionSettingsScope::User
        },
        fixture.profile()
    )
    .is_err());
    assert_eq!(std::fs::read(&original.path).unwrap(), [0xff, 0xfe]);
}

#[cfg(unix)]
#[test]
fn links_never_redirect_instruction_writes() {
    let fixture = Fixture::new();
    let outside = tempfile::tempdir().unwrap();
    let secret = outside.path().join("private.txt");
    std::fs::write(&secret, "preserve outside data").unwrap();
    std::os::unix::fs::symlink(
        outside.path(),
        fixture.workspace.path().join(".agiworkforce"),
    )
    .unwrap();
    assert!(read(
        fixture.base.path(),
        &fixture.authority,
        InstructionSettingsReadParams {
            root_key: fixture.authority.identity().unwrap(),
            scope: InstructionSettingsScope::Project
        },
        fixture.profile()
    )
    .is_err());
    let user = fixture.read(InstructionSettingsScope::User);
    std::fs::hard_link(&secret, &user.path).unwrap();
    assert!(fixture
        .write(fixture.params(&user, "must not overwrite"))
        .is_err());
    assert!(write_legacy(
        fixture.base.path(),
        &fixture.authority,
        InstructionSettingsScope::User,
        "must not overwrite"
    )
    .is_err());
    assert_eq!(
        std::fs::read_to_string(&secret).unwrap(),
        "preserve outside data"
    );
}

#[test]
fn cooperating_settings_operations_are_fenced_by_the_profile_lock() {
    let fixture = Fixture::new();
    let original = fixture.read(InstructionSettingsScope::User);
    let held = lock(fixture.base.path()).unwrap();
    assert!(fixture
        .write(fixture.params(&original, "not accepted"))
        .unwrap_err()
        .to_string()
        .contains("in progress"));
    drop(held);
    assert_eq!(fixture.read(InstructionSettingsScope::User), original);
}

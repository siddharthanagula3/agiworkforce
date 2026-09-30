use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use crate::sandbox::{SandboxSettings, SandboxType};

tokio::task_local! {
    static FILE_INPUTS: Arc<FileInputs>;
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum Input {
    ExecRules,
    DeviceIdentity,
    ManagedSettings,
}

impl Input {
    fn index(self) -> usize {
        match self {
            Self::ExecRules => 0,
            Self::DeviceIdentity => 1,
            Self::ManagedSettings => 2,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct ReadCounts {
    attempts: usize,
    successes: usize,
    validations: usize,
    valid: usize,
}

struct FileInputs {
    directory: tempfile::TempDir,
    rules_dir: PathBuf,
    rules_file: PathBuf,
    device_file: PathBuf,
    managed_file: PathBuf,
    device_id: String,
    counts: Mutex<[ReadCounts; 3]>,
    sandbox_settings: OnceLock<SandboxSettings>,
}

impl FileInputs {
    fn check_path(&self, input: Input, path: &Path) {
        let expected = match input {
            Input::ExecRules => &self.rules_file,
            Input::DeviceIdentity => &self.device_file,
            Input::ManagedSettings => &self.managed_file,
        };
        assert!(
            path == expected,
            "native fixture reader escaped its raw input"
        );
    }
}

#[derive(Clone)]
pub(crate) struct NativeProcessFixture {
    inputs: Arc<FileInputs>,
}

impl NativeProcessFixture {
    pub(crate) fn new() -> Self {
        Self::with_managed_document(serde_json::json!({
            "sandbox": {
                "forced": true,
                "scrubEnvironment": true,
                "sandboxUserHooks": true,
                "sandboxMcpServers": true
            }
        }))
    }

    fn with_managed_document(document: serde_json::Value) -> Self {
        let directory = tempfile::tempdir().expect("native fixture directory");
        let rules_dir = directory.path().join("rules");
        std::fs::create_dir(&rules_dir).expect("native fixture rules directory");
        let rules_file = rules_dir.join("native.rules");
        std::fs::write(
            &rules_file,
            "prefix_rule(pattern=[\"native-fixture-forbidden\"], decision=\"forbidden\")\n",
        )
        .expect("native fixture raw rule");
        let device_file = directory.path().join("device-id");
        let device_id = uuid::Uuid::new_v4().to_string();
        std::fs::write(&device_file, &device_id).expect("native fixture raw device identity");
        let managed_file = directory
            .path()
            .join(crate::features::hooks::managed::MANAGED_SETTINGS_FILE);
        std::fs::write(
            &managed_file,
            serde_json::to_vec(&document).expect("native fixture raw managed document"),
        )
        .expect("native fixture managed file");
        Self {
            inputs: Arc::new(FileInputs {
                directory,
                rules_dir,
                rules_file,
                device_file,
                managed_file,
                device_id,
                counts: Mutex::new([ReadCounts::default(); 3]),
                sandbox_settings: OnceLock::new(),
            }),
        }
    }

    pub(crate) async fn scope<F: Future>(&self, action: F) -> F::Output {
        FILE_INPUTS.scope(self.inputs.clone(), action).await
    }

    pub(crate) fn sync_scope<T>(&self, action: impl FnOnce() -> T) -> T {
        FILE_INPUTS.sync_scope(self.inputs.clone(), action)
    }

    #[cfg(not(windows))]
    pub(crate) fn require_backend() {
        assert_ne!(
            SandboxType::detect(),
            SandboxType::None,
            "native sandbox backend required for this regression"
        );
    }

    pub(crate) fn assert_inputs(&self, expected: &[Input]) {
        let counts = self.inputs.counts.lock().expect("native fixture counters");
        for input in [
            Input::ExecRules,
            Input::DeviceIdentity,
            Input::ManagedSettings,
        ] {
            let counter = counts[input.index()];
            if expected.iter().any(|value| value.index() == input.index()) {
                assert!(
                    counter.attempts > 0
                        && counter.successes > 0
                        && counter.validations > 0
                        && counter.valid > 0,
                    "native raw input was not actually read and validated: {input:?} {counter:?}"
                );
            } else {
                assert_eq!(counter.attempts, 0, "unexpected native reader: {input:?}");
                assert_eq!(counter.validations, 0, "unexpected validation: {input:?}");
            }
        }
    }
}

fn inputs() -> Option<Arc<FileInputs>> {
    FILE_INPUTS.try_with(Arc::clone).ok()
}

pub(crate) fn rules_dir() -> Option<PathBuf> {
    inputs().map(|value| value.rules_dir.clone())
}

pub(crate) fn device_id_file() -> Option<PathBuf> {
    inputs().map(|value| value.device_file.clone())
}

pub(crate) fn managed_settings_file() -> Option<PathBuf> {
    inputs().map(|value| value.managed_file.clone())
}

pub(crate) fn sandbox_settings(
    factory: impl FnOnce() -> SandboxSettings,
) -> Option<SandboxSettings> {
    inputs().map(|value| *value.sandbox_settings.get_or_init(factory))
}

pub(crate) fn check_read(input: Input, path: &Path) {
    if let Some(value) = inputs() {
        value.check_path(input, path);
    }
}

pub(crate) fn record_read(input: Input, path: &Path, succeeded: bool) {
    if let Some(value) = inputs() {
        value.check_path(input, path);
        let mut counts = value.counts.lock().expect("native fixture counters");
        counts[input.index()].attempts += 1;
        counts[input.index()].successes += usize::from(succeeded);
    }
}

pub(crate) fn record_validation(input: Input, path: &Path, succeeded: bool) {
    if let Some(value) = inputs() {
        value.check_path(input, path);
        let mut counts = value.counts.lock().expect("native fixture counters");
        counts[input.index()].validations += 1;
        counts[input.index()].valid += usize::from(succeeded);
    }
}

#[cfg(windows)]
pub(crate) struct WindowsRefusalProbe {
    pub(crate) args: Vec<String>,
    marker: PathBuf,
}

#[cfg(windows)]
impl WindowsRefusalProbe {
    pub(crate) fn command_string(&self) -> String {
        let mut argv = vec!["cmd.exe".to_string()];
        argv.extend(self.args.iter().cloned());
        crate::sandbox::shell_join(&argv)
    }

    pub(crate) fn assert_marker_absent(&self) {
        assert!(!self.marker.exists(), "refused child wrote its marker");
    }
}

#[cfg(windows)]
fn windows_cmd_workspace(workspace: &Path) -> PathBuf {
    use std::path::{Component, Prefix};

    let mut components = workspace.components();
    let drive = match components.next() {
        Some(Component::Prefix(prefix)) => match prefix.kind() {
            Prefix::Disk(drive) | Prefix::VerbatimDisk(drive) => drive,
            _ => panic!("native Windows fixture requires a local drive root"),
        },
        _ => panic!("native Windows fixture requires an absolute drive root"),
    };
    assert!(drive.is_ascii_alphabetic());
    assert!(matches!(components.next(), Some(Component::RootDir)));
    let mut normalized = PathBuf::from(format!("{}:\\", char::from(drive)));
    for component in components {
        let Component::Normal(part) = component else {
            panic!("native Windows fixture contains a non-normal component");
        };
        normalized.push(part);
    }
    let text = normalized
        .to_str()
        .expect("native Windows fixture path must be Unicode");
    assert!(
        text.bytes().all(|byte| byte.is_ascii_alphanumeric()
            || matches!(byte, b'\\' | b':' | b'_' | b'-' | b'.'))
            && !text[2..].contains(':'),
        "native Windows fixture path contains unsafe command characters"
    );
    assert_eq!(
        std::fs::canonicalize(&normalized).expect("native Windows fixture canonical drive path"),
        workspace,
        "native Windows fixture normalization changed its identity"
    );
    normalized
}

#[cfg(windows)]
pub(crate) async fn windows_refusal_probe(
    workspace: &Path,
    timeout: std::time::Duration,
) -> WindowsRefusalProbe {
    assert_eq!(SandboxType::detect(), SandboxType::None);
    let command_workspace = windows_cmd_workspace(workspace);
    let mut cwd_command = tokio::process::Command::new("cmd.exe");
    cwd_command
        .args(["/D", "/V:OFF", "/C", "cd"])
        .current_dir(&command_workspace);
    let cwd_output = crate::process_tree::output(cwd_command, None, Some(timeout))
        .await
        .expect("synthetic Windows cwd control must launch");
    assert!(
        cwd_output.status.success() && cwd_output.stderr.is_empty(),
        "synthetic Windows cwd control failed"
    );
    let reported_cwd = std::str::from_utf8(&cwd_output.stdout)
        .expect("synthetic Windows cwd output")
        .trim();
    assert!(
        reported_cwd.eq_ignore_ascii_case(
            command_workspace
                .to_str()
                .expect("validated Windows fixture path")
        ),
        "synthetic Windows command changed its cwd"
    );
    assert_eq!(
        std::fs::canonicalize(reported_cwd).expect("synthetic Windows reported cwd"),
        workspace,
        "synthetic Windows cwd identity differs from its owned root"
    );
    let marker = workspace.join("native-refusal-probe.txt");
    assert!(!marker.exists(), "synthetic Windows marker already exists");
    let command_marker = command_workspace.join("native-refusal-probe.txt");
    let args = vec![
        "/D".to_string(),
        "/V:OFF".to_string(),
        "/C".to_string(),
        format!(
            "echo native-probe-ran>{}",
            command_marker
                .to_str()
                .expect("validated Windows fixture marker")
        ),
    ];
    let mut command = tokio::process::Command::new("cmd.exe");
    command.args(&args).current_dir(command_workspace);
    let output = crate::process_tree::output(command, None, Some(timeout))
        .await
        .expect("synthetic Windows command must launch");
    assert!(output.status.success(), "synthetic Windows command failed");
    assert_eq!(
        std::fs::read_to_string(&marker)
            .expect("synthetic child marker")
            .trim(),
        "native-probe-ran"
    );
    std::fs::remove_file(&marker).expect("clear synthetic child marker");
    WindowsRefusalProbe { args, marker }
}

#[cfg(windows)]
pub(crate) fn assert_windows_backend_refusal(error: &str) {
    assert!(
        error.contains("sandbox not available on this platform or host"),
        "canonical unavailable-backend refusal was not reached: {error}"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_execpolicy::Decision;

    #[test]
    fn raw_inputs_reach_canonical_parsers_and_security_floor() {
        let fixture = NativeProcessFixture::new();
        fixture.sync_scope(|| {
            let policy = crate::features::exec::exec_policy::load_policy().expect("raw policy");
            assert_eq!(
                crate::features::exec::exec_policy::evaluate_command(
                    &policy,
                    "native-fixture-forbidden"
                )
                .decision,
                Decision::Forbidden
            );
            assert_eq!(
                crate::features::exec::exec_policy::evaluate_command(&policy, "rm -rf /").decision,
                Decision::Forbidden
            );
            assert!(crate::trust::identity::current_machine() == fixture.inputs.device_id);
            let settings = crate::sandbox::sandbox_settings();
            assert!(settings.forced);
            assert!(settings.scrub_environment);
            assert!(settings.sandbox_user_hooks);
            assert!(settings.sandbox_mcp_servers);
        });
        fixture.assert_inputs(&[
            Input::ExecRules,
            Input::DeviceIdentity,
            Input::ManagedSettings,
        ]);
        assert!(inputs().is_none());
    }

    #[test]
    fn managed_cache_reads_each_scoped_document_once() {
        let strict = NativeProcessFixture::new();
        let absent = NativeProcessFixture::with_managed_document(serde_json::json!({}));
        strict.sync_scope(|| {
            let first = crate::sandbox::sandbox_settings();
            assert!(first.forced);
            absent.sync_scope(|| assert!(!crate::sandbox::sandbox_settings().forced));
            assert_eq!(crate::sandbox::sandbox_settings(), first);
        });
        strict.assert_inputs(&[Input::ManagedSettings]);
        absent.assert_inputs(&[Input::ManagedSettings]);
        for fixture in [strict, absent] {
            let counts = fixture.inputs.counts.lock().unwrap();
            assert_eq!(counts[Input::ManagedSettings.index()].attempts, 1);
            assert_eq!(counts[Input::ManagedSettings.index()].validations, 1);
        }
        assert!(inputs().is_none());
    }

    #[test]
    fn malformed_raw_inputs_preserve_fail_closed_outcomes() {
        let fixture = NativeProcessFixture::new();
        std::fs::write(&fixture.inputs.rules_file, "not valid rules {{{").unwrap();
        std::fs::write(&fixture.inputs.managed_file, "{ malformed JSON").unwrap();
        fixture.sync_scope(|| {
            assert!(crate::features::exec::exec_policy::load_policy().is_err());
            let settings = crate::sandbox::sandbox_settings();
            assert!(settings.forced && settings.scrub_environment);
            assert!(settings.sandbox_user_hooks && settings.sandbox_mcp_servers);
        });
        let counts = fixture.inputs.counts.lock().unwrap();
        for input in [Input::ExecRules, Input::ManagedSettings] {
            let count = counts[input.index()];
            assert_eq!(count.attempts, 1);
            assert_eq!(count.successes, 1);
            assert_eq!(count.validations, 1);
            assert_eq!(count.valid, 0);
        }
    }

    #[test]
    fn invalid_and_missing_device_input_use_the_original_fallback() {
        let fixture = NativeProcessFixture::new();
        std::fs::write(&fixture.inputs.device_file, "invalid fixture identity!").unwrap();
        let invalid = fixture.sync_scope(crate::trust::identity::current_machine);
        assert!(invalid != fixture.inputs.device_id);
        std::fs::remove_file(&fixture.inputs.device_file).unwrap();
        let missing = fixture.sync_scope(crate::trust::identity::current_machine);
        assert!(invalid == missing, "device identity fallback changed");
        assert!(!fixture.inputs.device_file.exists());
        let counts = fixture.inputs.counts.lock().unwrap();
        let count = counts[Input::DeviceIdentity.index()];
        assert_eq!(count.attempts, 2);
        assert_eq!(count.successes, 1);
        assert_eq!(count.validations, 1);
        assert_eq!(count.valid, 0);
    }

    #[test]
    fn a_different_path_is_refused_before_the_reader_runs() {
        let fixture = NativeProcessFixture::new();
        let other = fixture.inputs.directory.path().join("other.json");
        std::fs::write(&other, "{}").unwrap();
        let refused = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            fixture.sync_scope(|| {
                crate::features::hooks::managed::load_managed_sandbox_policy_from(&other)
            })
        }));
        assert!(refused.is_err());
        fixture.assert_inputs(&[]);
    }

    #[tokio::test]
    async fn raw_input_scopes_survive_awaits_and_do_not_cross_spawned_tasks() {
        let first = NativeProcessFixture::new();
        let second = NativeProcessFixture::new();
        let read = |fixture: NativeProcessFixture| async move {
            fixture
                .scope(async {
                    assert!(crate::trust::identity::current_machine() == fixture.inputs.device_id);
                    tokio::task::yield_now().await;
                    assert!(crate::trust::identity::current_machine() == fixture.inputs.device_id);
                })
                .await;
            fixture.assert_inputs(&[Input::DeviceIdentity]);
        };
        let (first, second) = tokio::join!(tokio::spawn(read(first)), tokio::spawn(read(second)));
        first.unwrap();
        second.unwrap();
        assert!(inputs().is_none());
    }

    #[tokio::test]
    async fn a_spawn_without_explicit_propagation_has_no_fixture_scope() {
        let fixture = NativeProcessFixture::new();
        fixture
            .scope(async {
                tokio::spawn(async { assert!(inputs().is_none()) })
                    .await
                    .unwrap();
            })
            .await;
        fixture.assert_inputs(&[]);
        assert!(inputs().is_none());
    }

    #[test]
    fn panic_restores_the_inactive_scope() {
        let fixture = NativeProcessFixture::new();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            fixture.sync_scope(|| panic!("synthetic fixture panic"))
        }));
        assert!(result.is_err());
        assert!(inputs().is_none());
    }

    #[tokio::test]
    async fn explicitly_propagated_spawned_scope_is_released_on_cancellation() {
        let fixture = NativeProcessFixture::new();
        let child_fixture = fixture.clone();
        let (ready, entered) = tokio::sync::oneshot::channel();
        let child = tokio::spawn(async move {
            child_fixture
                .scope(async {
                    assert!(
                        crate::trust::identity::current_machine() == child_fixture.inputs.device_id
                    );
                    ready.send(()).unwrap();
                    std::future::pending::<()>().await;
                })
                .await;
        });
        entered.await.unwrap();
        child.abort();
        assert!(child.await.unwrap_err().is_cancelled());
        fixture.assert_inputs(&[Input::DeviceIdentity]);
        assert!(inputs().is_none());
    }
}

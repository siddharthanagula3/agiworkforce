use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use crate::automation::screen::{list_displays, ScreenInfo};

const PRIMARY_DISPLAY: i64 = -1;

static TARGET_DISPLAY: AtomicI64 = AtomicI64::new(PRIMARY_DISPLAY);
static TAKEN_OVER: AtomicBool = AtomicBool::new(false);

/// Bumped by every takeover and every hand-back, so an observation carries the
/// generation of the screen it saw rather than only its age.
static CONTROL_EPOCH: AtomicU64 = AtomicU64::new(0);

pub const TAKEN_OVER_MESSAGE: &str = "The user has taken over the screen. No pointer or keyboard step runs until they hand control back.";

pub const TOOK_OVER_SINCE_MESSAGE: &str = "The user moved the screen since this observation was taken. The screen is observed again before anything else is clicked or typed.";

pub const OBSERVATION_TOO_OLD_MESSAGE: &str =
    "This observation is older than the freshness bound, so the screen is observed again before the next step.";

/// How long a screenshot stays usable as the basis for a pointer coordinate.
/// Anything the user, a notification or an animation moved in that window is
/// caught by the next observation instead of clicked blind.
pub const DEFAULT_OBSERVATION_MAX_AGE: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DialogResponse {
    Accept,
    Cancel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControlState {
    pub taken_over: bool,
    pub target_display: Option<u32>,
    pub epoch: u64,
}

pub fn control_state() -> ControlState {
    ControlState {
        taken_over: is_taken_over(),
        target_display: target_display(),
        epoch: control_epoch(),
    }
}

pub fn target_display() -> Option<u32> {
    u32::try_from(TARGET_DISPLAY.load(Ordering::SeqCst)).ok()
}

pub fn set_target_display(display: Option<u32>) -> Result<ScreenInfo> {
    let chosen = select_display(&list_displays()?, display)?;
    TARGET_DISPLAY.store(display.map_or(PRIMARY_DISPLAY, i64::from), Ordering::SeqCst);
    Ok(chosen)
}

pub fn select_display(displays: &[ScreenInfo], target: Option<u32>) -> Result<ScreenInfo> {
    if let Some(id) = target {
        return displays
            .iter()
            .find(|display| display.id == id)
            .cloned()
            .ok_or_else(|| anyhow!("Display {id} is not connected"));
    }
    displays
        .iter()
        .find(|display| display.is_primary)
        .or_else(|| displays.first())
        .cloned()
        .ok_or_else(|| anyhow!("No display available for coordinate translation"))
}

pub fn resolve_target_display() -> Result<ScreenInfo> {
    select_display(&list_displays()?, target_display())
}

pub fn is_taken_over() -> bool {
    TAKEN_OVER.load(Ordering::SeqCst)
}

pub fn control_epoch() -> u64 {
    CONTROL_EPOCH.load(Ordering::SeqCst)
}

pub fn take_over() -> ControlState {
    TAKEN_OVER.store(true, Ordering::SeqCst);
    CONTROL_EPOCH.fetch_add(1, Ordering::SeqCst);
    control_state()
}

pub fn hand_back() -> ControlState {
    TAKEN_OVER.store(false, Ordering::SeqCst);
    CONTROL_EPOCH.fetch_add(1, Ordering::SeqCst);
    control_state()
}

pub fn ensure_agent_in_control() -> Result<()> {
    if is_taken_over() {
        return Err(anyhow!(TAKEN_OVER_MESSAGE));
    }
    Ok(())
}

/// When the screen was last looked at, and which generation of control it was
/// looked at under. Minted by the observe step and carried to every act step.
#[derive(Debug, Clone, Copy)]
pub struct ObservationStamp {
    epoch: u64,
    taken_at: Instant,
}

impl ObservationStamp {
    pub fn now() -> Self {
        Self {
            epoch: control_epoch(),
            taken_at: Instant::now(),
        }
    }

    pub fn epoch(&self) -> u64 {
        self.epoch
    }

    pub fn age(&self) -> Duration {
        self.taken_at.elapsed()
    }
}

/// Why the screen has to be observed again before the next step.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StaleObservation {
    UserInControl,
    TookOverSince,
    TooOld,
}

impl StaleObservation {
    pub fn message(self) -> &'static str {
        match self {
            Self::UserInControl => TAKEN_OVER_MESSAGE,
            Self::TookOverSince => TOOK_OVER_SINCE_MESSAGE,
            Self::TooOld => OBSERVATION_TOO_OLD_MESSAGE,
        }
    }
}

/// The check that stands between a screenshot and a click at coordinates read
/// off it. A takeover in either direction invalidates every observation taken
/// before it, so the first step after a hand-back is planned on a screen that
/// already contains whatever the user changed.
pub fn observation_is_actionable(
    stamp: &ObservationStamp,
    max_age: Duration,
) -> Result<(), StaleObservation> {
    if is_taken_over() {
        return Err(StaleObservation::UserInControl);
    }
    if stamp.epoch != control_epoch() {
        return Err(StaleObservation::TookOverSince);
    }
    if stamp.age() > max_age {
        return Err(StaleObservation::TooOld);
    }
    Ok(())
}

pub fn ensure_agent_may_act(stamp: &ObservationStamp, max_age: Duration) -> Result<()> {
    observation_is_actionable(stamp, max_age).map_err(|stale| anyhow!(stale.message()))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilePickerPlatform {
    MacOs,
    Windows,
    Linux,
}

impl FilePickerPlatform {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::MacOs
        } else if cfg!(target_os = "windows") {
            Self::Windows
        } else {
            Self::Linux
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PickerKeystroke {
    Chord(Vec<PickerModifier>, char),
    Text(String),
    Enter,
    Escape,
    Pause(u64),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PickerModifier {
    Command,
    Control,
    Shift,
    Alt,
}

pub fn validate_picker_path(path: &str) -> Result<&str> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(anyhow!(
            "A file picker step needs the path of the file to choose"
        ));
    }
    if trimmed
        .chars()
        .any(|c| c == '\n' || c == '\r' || c.is_control())
    {
        return Err(anyhow!(
            "A file picker path cannot contain line breaks or control characters"
        ));
    }
    if !std::path::Path::new(trimmed).is_absolute() {
        return Err(anyhow!("A file picker path must be absolute"));
    }
    Ok(trimmed)
}

pub fn file_picker_keystrokes(platform: FilePickerPlatform, path: &str) -> Vec<PickerKeystroke> {
    let path = path.to_string();
    match platform {
        FilePickerPlatform::MacOs => vec![
            PickerKeystroke::Chord(vec![PickerModifier::Command, PickerModifier::Shift], 'g'),
            PickerKeystroke::Pause(400),
            PickerKeystroke::Chord(vec![PickerModifier::Command], 'a'),
            PickerKeystroke::Text(path),
            PickerKeystroke::Pause(300),
            PickerKeystroke::Enter,
            PickerKeystroke::Pause(500),
            PickerKeystroke::Enter,
        ],
        FilePickerPlatform::Windows => vec![
            PickerKeystroke::Chord(vec![PickerModifier::Alt], 'n'),
            PickerKeystroke::Pause(200),
            PickerKeystroke::Chord(vec![PickerModifier::Control], 'a'),
            PickerKeystroke::Text(path),
            PickerKeystroke::Pause(200),
            PickerKeystroke::Enter,
        ],
        FilePickerPlatform::Linux => vec![
            PickerKeystroke::Chord(vec![PickerModifier::Control], 'l'),
            PickerKeystroke::Pause(300),
            PickerKeystroke::Chord(vec![PickerModifier::Control], 'a'),
            PickerKeystroke::Text(path),
            PickerKeystroke::Pause(200),
            PickerKeystroke::Enter,
        ],
    }
}

pub fn dialog_keystrokes(response: DialogResponse) -> Vec<PickerKeystroke> {
    match response {
        DialogResponse::Accept => vec![PickerKeystroke::Enter],
        DialogResponse::Cancel => vec![PickerKeystroke::Escape],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, MutexGuard};

    /// Takeover and epoch are process-wide, so every test that moves them takes
    /// this first or they race each other inside the one test binary.
    static CONTROL: Mutex<()> = Mutex::new(());

    fn control_guard() -> MutexGuard<'static, ()> {
        let guard = CONTROL
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        TAKEN_OVER.store(false, Ordering::SeqCst);
        guard
    }

    fn display(id: u32, primary: bool, scale_factor: f32) -> ScreenInfo {
        ScreenInfo {
            id,
            x: if primary { 0 } else { 1512 },
            y: 0,
            width: 3024,
            height: 1964,
            scale_factor,
            is_primary: primary,
        }
    }

    #[test]
    fn selects_the_primary_display_when_none_is_chosen() {
        let displays = vec![display(0, false, 1.0), display(1, true, 2.0)];
        assert_eq!(select_display(&displays, None).unwrap().id, 1);
    }

    #[test]
    fn selects_the_chosen_display_with_its_own_scale_factor() {
        let displays = vec![display(0, true, 2.0), display(1, false, 1.0)];
        let chosen = select_display(&displays, Some(1)).unwrap();
        assert_eq!(chosen.id, 1);
        assert_eq!(chosen.x, 1512);
        assert!((chosen.scale_factor - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn refuses_a_display_that_is_not_connected() {
        let displays = vec![display(0, true, 2.0)];
        let error = select_display(&displays, Some(3)).unwrap_err().to_string();
        assert!(error.contains("Display 3 is not connected"));
    }

    #[test]
    fn takeover_blocks_agent_input_until_handed_back() {
        let _guard = control_guard();
        take_over();
        assert!(ensure_agent_in_control().is_err());
        assert!(control_state().taken_over);
        hand_back();
        assert!(ensure_agent_in_control().is_ok());
    }

    #[test]
    fn a_fresh_observation_is_actionable() {
        let _guard = control_guard();
        let stamp = ObservationStamp::now();
        assert!(observation_is_actionable(&stamp, DEFAULT_OBSERVATION_MAX_AGE).is_ok());
    }

    /// L73048/L73214: the screenshot the agent planned from no longer describes
    /// the screen once a person has had their hands on it, so acting on its
    /// coordinates is refused until the screen has been looked at again.
    #[test]
    fn an_observation_taken_before_a_takeover_is_refused_after_hand_back() {
        let _guard = control_guard();
        let stale = ObservationStamp::now();

        take_over();
        assert_eq!(
            observation_is_actionable(&stale, DEFAULT_OBSERVATION_MAX_AGE),
            Err(StaleObservation::UserInControl)
        );

        hand_back();
        assert_eq!(
            observation_is_actionable(&stale, DEFAULT_OBSERVATION_MAX_AGE),
            Err(StaleObservation::TookOverSince)
        );
        assert!(ensure_agent_may_act(&stale, DEFAULT_OBSERVATION_MAX_AGE)
            .unwrap_err()
            .to_string()
            .contains("observed again"));

        let fresh = ObservationStamp::now();
        assert!(observation_is_actionable(&fresh, DEFAULT_OBSERVATION_MAX_AGE).is_ok());
    }

    /// L72697: what the user did while they held the screen only reaches the
    /// agent through an observation taken after they handed it back, so the
    /// epoch a takeover advances is what forces that capture.
    #[test]
    fn a_user_edit_during_takeover_is_captured_by_the_next_observation() {
        let _guard = control_guard();
        let before_edit = ObservationStamp::now();

        let held = take_over();
        assert!(held.taken_over);
        let handed_back = hand_back();

        assert!(handed_back.epoch > before_edit.epoch());
        assert!(observation_is_actionable(&before_edit, DEFAULT_OBSERVATION_MAX_AGE).is_err());

        let after_edit = ObservationStamp::now();
        assert_eq!(after_edit.epoch(), handed_back.epoch);
        assert!(observation_is_actionable(&after_edit, DEFAULT_OBSERVATION_MAX_AGE).is_ok());
    }

    #[test]
    fn an_observation_past_the_freshness_bound_is_refused() {
        let _guard = control_guard();
        let stamp = ObservationStamp::now();
        std::thread::sleep(Duration::from_millis(5));
        assert_eq!(
            observation_is_actionable(&stamp, Duration::from_millis(1)),
            Err(StaleObservation::TooOld)
        );
        assert!(observation_is_actionable(&stamp, DEFAULT_OBSERVATION_MAX_AGE).is_ok());
    }

    /// L73082: takeover and resume have to survive repetition, not just one
    /// pass, and each cycle must leave the agent able to act again.
    #[test]
    fn takeover_and_resume_hold_across_repeated_cycles() {
        let _guard = control_guard();
        for _ in 0..25 {
            let stale = ObservationStamp::now();
            take_over();
            assert!(ensure_agent_in_control().is_err());
            hand_back();
            assert!(ensure_agent_in_control().is_ok());
            assert!(observation_is_actionable(&stale, DEFAULT_OBSERVATION_MAX_AGE).is_err());
            assert!(observation_is_actionable(
                &ObservationStamp::now(),
                DEFAULT_OBSERVATION_MAX_AGE
            )
            .is_ok());
        }
    }

    #[test]
    fn file_picker_types_the_path_into_the_go_to_field_on_macos() {
        let strokes = file_picker_keystrokes(FilePickerPlatform::MacOs, "/Users/qa/cv.pdf");
        assert_eq!(
            strokes.first(),
            Some(&PickerKeystroke::Chord(
                vec![PickerModifier::Command, PickerModifier::Shift],
                'g'
            ))
        );
        assert!(strokes.contains(&PickerKeystroke::Text("/Users/qa/cv.pdf".to_string())));
        assert_eq!(strokes.last(), Some(&PickerKeystroke::Enter));
    }

    #[test]
    fn file_picker_focuses_the_file_name_box_on_windows_and_the_location_bar_on_linux() {
        assert_eq!(
            file_picker_keystrokes(FilePickerPlatform::Windows, "C:\\cv.pdf").first(),
            Some(&PickerKeystroke::Chord(vec![PickerModifier::Alt], 'n'))
        );
        assert_eq!(
            file_picker_keystrokes(FilePickerPlatform::Linux, "/home/qa/cv.pdf").first(),
            Some(&PickerKeystroke::Chord(vec![PickerModifier::Control], 'l'))
        );
    }

    #[test]
    fn picker_paths_must_be_absolute_single_lines() {
        assert!(validate_picker_path("relative/cv.pdf").is_err());
        assert!(validate_picker_path("").is_err());
        #[cfg(not(windows))]
        {
            assert!(validate_picker_path("/tmp/a\n/etc/passwd").is_err());
            assert_eq!(
                validate_picker_path(" /tmp/cv.pdf ").unwrap(),
                "/tmp/cv.pdf"
            );
        }
    }

    #[test]
    fn dialog_responses_map_to_the_default_and_cancel_keys() {
        assert_eq!(
            dialog_keystrokes(DialogResponse::Accept),
            vec![PickerKeystroke::Enter]
        );
        assert_eq!(
            dialog_keystrokes(DialogResponse::Cancel),
            vec![PickerKeystroke::Escape]
        );
    }
}

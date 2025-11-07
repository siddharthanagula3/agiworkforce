/// Unit tests for window command handlers
/// Tests fullscreen toggle, state management, and error handling
#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{AppState, DockPosition, PersistentWindowState, WindowGeometry};
    use std::sync::{Arc, RwLock};
    use tauri::test::{mock_builder, MockRuntime};

    /// Helper function to create a mock AppState for testing
    fn create_test_state() -> AppState {
        let state = PersistentWindowState {
            pinned: true,
            always_on_top: false,
            dock: None,
            geometry: Some(WindowGeometry::default()),
            previous_geometry: None,
            maximized: false,
            fullscreen: false,
        };

        let temp_dir = std::env::temp_dir();
        let storage_path = temp_dir.join("test_window_state.json");

        AppState {
            inner: Arc::new(RwLock::new(state)),
            storage_path: Arc::new(storage_path),
            suppress_events: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    #[test]
    fn test_window_get_state_returns_correct_payload() {
        let state = create_test_state();

        let result = window_get_state(tauri::State::from(&state));

        assert!(result.is_ok());
        let payload = result.unwrap();
        assert_eq!(payload.pinned, true);
        assert_eq!(payload.always_on_top, false);
        assert_eq!(payload.dock, None);
        assert_eq!(payload.maximized, false);
        assert_eq!(payload.fullscreen, false);
    }

    #[test]
    fn test_window_get_state_includes_fullscreen() {
        let mut state = create_test_state();

        // Update fullscreen to true
        state.update(|s| {
            s.fullscreen = true;
            true
        }).unwrap();

        let result = window_get_state(tauri::State::from(&state));

        assert!(result.is_ok());
        let payload = result.unwrap();
        assert_eq!(payload.fullscreen, true);
    }

    #[test]
    fn test_window_get_state_with_dock_position() {
        let mut state = create_test_state();

        // Set dock position
        state.update(|s| {
            s.dock = Some(DockPosition::Left);
            true
        }).unwrap();

        let result = window_get_state(tauri::State::from(&state));

        assert!(result.is_ok());
        let payload = result.unwrap();
        assert_eq!(payload.dock, Some(DockPosition::Left));
    }

    #[test]
    fn test_window_get_state_with_maximized() {
        let mut state = create_test_state();

        // Set maximized
        state.update(|s| {
            s.maximized = true;
            true
        }).unwrap();

        let result = window_get_state(tauri::State::from(&state));

        assert!(result.is_ok());
        let payload = result.unwrap();
        assert_eq!(payload.maximized, true);
    }

    #[test]
    fn test_window_state_payload_serialization() {
        let payload = WindowStatePayload {
            pinned: true,
            always_on_top: false,
            dock: Some(DockPosition::Right),
            maximized: true,
            fullscreen: true,
        };

        let serialized = serde_json::to_string(&payload);
        assert!(serialized.is_ok());

        let json = serialized.unwrap();
        assert!(json.contains("\"fullscreen\":true"));
        assert!(json.contains("\"maximized\":true"));
        assert!(json.contains("\"dock\":\"right\""));
    }

    #[test]
    fn test_window_state_payload_deserialization() {
        let json = r#"{
            "pinned": true,
            "alwaysOnTop": false,
            "dock": "left",
            "maximized": false,
            "fullscreen": true
        }"#;

        let result: Result<WindowStatePayload, _> = serde_json::from_str(json);
        assert!(result.is_ok());

        let payload = result.unwrap();
        assert_eq!(payload.fullscreen, true);
        assert_eq!(payload.dock, Some(DockPosition::Left));
    }

    #[test]
    fn test_state_update_fullscreen() {
        let state = create_test_state();

        // Verify initial state
        let initial = state.snapshot();
        assert_eq!(initial.fullscreen, false);

        // Update fullscreen to true
        let result = state.update(|s| {
            s.fullscreen = true;
            true
        });

        assert!(result.is_ok());

        // Verify updated state
        let updated = state.snapshot();
        assert_eq!(updated.fullscreen, true);
    }

    #[test]
    fn test_state_update_fullscreen_toggle() {
        let state = create_test_state();

        // Toggle on
        state.update(|s| {
            s.fullscreen = true;
            true
        }).unwrap();

        assert_eq!(state.snapshot().fullscreen, true);

        // Toggle off
        state.update(|s| {
            s.fullscreen = false;
            true
        }).unwrap();

        assert_eq!(state.snapshot().fullscreen, false);
    }

    #[test]
    fn test_state_update_preserves_other_fields() {
        let mut state = create_test_state();

        // Set initial state
        state.update(|s| {
            s.pinned = true;
            s.always_on_top = true;
            s.dock = Some(DockPosition::Left);
            s.maximized = false;
            true
        }).unwrap();

        // Update only fullscreen
        state.update(|s| {
            s.fullscreen = true;
            true
        }).unwrap();

        // Verify other fields are preserved
        let snapshot = state.snapshot();
        assert_eq!(snapshot.pinned, true);
        assert_eq!(snapshot.always_on_top, true);
        assert_eq!(snapshot.dock, Some(DockPosition::Left));
        assert_eq!(snapshot.maximized, false);
        assert_eq!(snapshot.fullscreen, true);
    }

    #[test]
    fn test_fullscreen_and_maximized_independent() {
        let state = create_test_state();

        // Set both to true
        state.update(|s| {
            s.fullscreen = true;
            s.maximized = true;
            true
        }).unwrap();

        let snapshot = state.snapshot();
        assert_eq!(snapshot.fullscreen, true);
        assert_eq!(snapshot.maximized, true);

        // Turn off fullscreen, keep maximized
        state.update(|s| {
            s.fullscreen = false;
            true
        }).unwrap();

        let snapshot = state.snapshot();
        assert_eq!(snapshot.fullscreen, false);
        assert_eq!(snapshot.maximized, true);
    }

    #[test]
    fn test_state_snapshot_is_immutable() {
        let state = create_test_state();

        let snapshot1 = state.snapshot();
        assert_eq!(snapshot1.fullscreen, false);

        // Update state
        state.update(|s| {
            s.fullscreen = true;
            true
        }).unwrap();

        // Original snapshot should be unchanged
        assert_eq!(snapshot1.fullscreen, false);

        // New snapshot should reflect changes
        let snapshot2 = state.snapshot();
        assert_eq!(snapshot2.fullscreen, true);
    }

    #[test]
    fn test_dock_position_serialization() {
        let left = DockPosition::Left;
        let right = DockPosition::Right;

        let left_json = serde_json::to_string(&left).unwrap();
        let right_json = serde_json::to_string(&right).unwrap();

        assert_eq!(left_json, "\"left\"");
        assert_eq!(right_json, "\"right\"");
    }

    #[test]
    fn test_dock_position_deserialization() {
        let left: DockPosition = serde_json::from_str("\"left\"").unwrap();
        let right: DockPosition = serde_json::from_str("\"right\"").unwrap();

        assert_eq!(left, DockPosition::Left);
        assert_eq!(right, DockPosition::Right);
    }

    #[test]
    fn test_window_geometry_default() {
        let geometry = WindowGeometry::default();

        assert_eq!(geometry.x, 120.0);
        assert_eq!(geometry.y, 120.0);
        assert_eq!(geometry.width, 420.0);
        assert_eq!(geometry.height, 760.0);
    }

    #[test]
    fn test_persistent_window_state_default() {
        let state = PersistentWindowState::default();

        assert_eq!(state.pinned, true);
        assert_eq!(state.always_on_top, false);
        assert_eq!(state.dock, None);
        assert_eq!(state.maximized, false);
        assert_eq!(state.fullscreen, false);
        assert!(state.geometry.is_some());
        assert!(state.previous_geometry.is_none());
    }

    #[test]
    fn test_state_with_state_accessor() {
        let state = create_test_state();

        // Update fullscreen
        state.update(|s| {
            s.fullscreen = true;
            true
        }).unwrap();

        // Access state without cloning
        let fullscreen_value = state.with_state(|s| s.fullscreen);
        assert_eq!(fullscreen_value, true);

        let maximized_value = state.with_state(|s| s.maximized);
        assert_eq!(maximized_value, false);
    }

    #[test]
    fn test_suppress_events_flag() {
        let state = create_test_state();

        assert_eq!(state.is_events_suppressed(), false);

        let result = state.suppress_events(|| {
            assert_eq!(state.is_events_suppressed(), true);
            Ok::<_, tauri::Error>(42)
        });

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
        assert_eq!(state.is_events_suppressed(), false);
    }

    #[test]
    fn test_suppress_events_with_error() {
        let state = create_test_state();

        let result = state.suppress_events(|| {
            Err::<(), _>(tauri::Error::FailedToSendMessage)
        });

        assert!(result.is_err());
        // Flag should still be reset even on error
        assert_eq!(state.is_events_suppressed(), false);
    }

    #[test]
    fn test_fullscreen_state_persistence() {
        let state = create_test_state();

        // Update fullscreen and ensure it's marked for persistence
        let result = state.update(|s| {
            s.fullscreen = true;
            true // Returns true to trigger persistence
        });

        assert!(result.is_ok());

        // The state should be persisted (file write attempted)
        // Note: Actual file I/O is tested in integration tests
        let snapshot = state.snapshot();
        assert_eq!(snapshot.fullscreen, true);
    }

    #[test]
    fn test_update_without_mutation_skips_persistence() {
        let state = create_test_state();

        // Update but return false (no mutation)
        let result = state.update(|s| {
            // Don't actually change anything
            false // Returns false to skip persistence
        });

        assert!(result.is_ok());
    }

    #[test]
    fn test_concurrent_snapshot_access() {
        use std::thread;

        let state = create_test_state();

        // Spawn multiple threads reading state
        let handles: Vec<_> = (0..5)
            .map(|_| {
                let state_clone = state.clone();
                thread::spawn(move || {
                    let snapshot = state_clone.snapshot();
                    assert_eq!(snapshot.fullscreen, false);
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }
    }

    #[test]
    fn test_fullscreen_with_dock_state() {
        let state = create_test_state();

        // Set dock position
        state.update(|s| {
            s.dock = Some(DockPosition::Left);
            true
        }).unwrap();

        // Set fullscreen
        state.update(|s| {
            s.fullscreen = true;
            true
        }).unwrap();

        let snapshot = state.snapshot();
        assert_eq!(snapshot.dock, Some(DockPosition::Left));
        assert_eq!(snapshot.fullscreen, true);
    }
}

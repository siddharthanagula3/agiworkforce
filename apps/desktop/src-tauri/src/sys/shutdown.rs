//! Orderly quit for the Tauri shell.
//!
//! Every quit path (window close, tray, menu, Cmd+Q, recovery window) ends in
//! `AppHandle::exit`, which raises `RunEvent::ExitRequested`. The first request
//! is held while live work is counted; when there is any, the user is asked
//! first, mirroring the Electron quit guard (`electron/quitGuard.ts`). Services
//! are then stopped in dependency order, each bounded by a timeout, so a hung
//! service delays the quit but never prevents it.

use std::future::Future;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, ExitRequestApi, Manager};

use crate::sys::native_confirm::{self, NativeConfirm};

const STEP_TIMEOUT: Duration = Duration::from_secs(3);

/// The longest a restart holds the event loop for services to stop: every
/// step of [`stop_services`] at its own bound, with a margin.
const RESTART_STOP_TIMEOUT: Duration = Duration::from_secs(30);

const IDLE: u8 = 0;
const CONFIRMING: u8 = 1;
const STOPPING: u8 = 2;
const DONE: u8 = 3;

static PHASE: AtomicU8 = AtomicU8::new(IDLE);

/// Set once the services have stopped. A quit and a restart that overlap both
/// wait on it, so the services are stopped once.
static SERVICES_STOPPED: once_cell::sync::Lazy<tokio::sync::Mutex<bool>> =
    once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(false));

static BACKGROUND_LOOPS: Mutex<Vec<(BackgroundLoop, tauri::async_runtime::JoinHandle<()>)>> =
    Mutex::new(Vec::new());

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackgroundLoop {
    Scheduler,
    RealtimeServer,
}

pub const QUIT_LABEL: &str = "Quit and Stop All";

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LiveWork {
    pub chat_replies: usize,
    pub background_agents: usize,
    pub terminals: usize,
    pub scheduled_runs: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QuitPrompt {
    pub title: String,
    pub body: String,
}

pub fn track_background_loop(kind: BackgroundLoop, handle: tauri::async_runtime::JoinHandle<()>) {
    if let Ok(mut loops) = BACKGROUND_LOOPS.lock() {
        loops.push((kind, handle));
    }
}

fn abort_background_loop(kind: BackgroundLoop) {
    if let Ok(mut loops) = BACKGROUND_LOOPS.lock() {
        loops.retain(|(loop_kind, handle)| {
            if *loop_kind == kind {
                handle.abort();
                false
            } else {
                true
            }
        });
    }
}

fn plural(count: usize, one: &str, many: &str) -> String {
    format!("{count} {}", if count == 1 { one } else { many })
}

pub fn live_work_lines(work: &LiveWork) -> Vec<String> {
    let mut lines = Vec::new();
    if work.chat_replies > 0 {
        lines.push(format!(
            "{} still being written",
            plural(work.chat_replies, "chat reply", "chat replies")
        ));
    }
    if work.background_agents > 0 {
        lines.push(format!(
            "{} still running",
            plural(
                work.background_agents,
                "background agent",
                "background agents"
            )
        ));
    }
    if work.scheduled_runs > 0 {
        lines.push(format!(
            "{} in progress",
            plural(work.scheduled_runs, "scheduled run", "scheduled runs")
        ));
    }
    if work.terminals > 0 {
        lines.push(format!(
            "{} open",
            plural(work.terminals, "terminal", "terminals")
        ));
    }
    lines
}

/// The question asked before quitting with work in flight, or `None` when
/// nothing would stop.
pub fn quit_prompt(work: &LiveWork) -> Option<QuitPrompt> {
    let lines = live_work_lines(work);
    if lines.is_empty() {
        return None;
    }
    let listed = lines
        .iter()
        .map(|line| format!("• {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    Some(QuitPrompt {
        title: "Quit AGI Workforce?".to_string(),
        body: format!(
            "Quitting stops the work running on this computer.\n\n{listed}\n\n\
             A chat reply stops where it is and can be retried when you reopen the app. \
             An agent task stops where it is and has to be asked again. A background \
             agent is paused and can be resumed after you reopen the app. A scheduled \
             run is ended without finishing and starts again when you reopen the app, if \
             that is within 7 days. Terminal \
             commands, and anything they started, are ended."
        ),
    })
}

pub fn handle_exit_requested(app: &AppHandle, code: Option<i32>, api: &ExitRequestApi) {
    if code == Some(tauri::RESTART_EXIT_CODE) {
        // A restart cannot be held, so the services are stopped before the
        // process is replaced. They stop on a thread of their own, because a
        // step may need the event loop this call is running on; the wait here
        // is bounded. A quit already stopping them is waited for, not repeated.
        if PHASE.swap(DONE, Ordering::SeqCst) != DONE {
            stop_services_before_restart(app);
        }
        return;
    }

    match PHASE.compare_exchange(IDLE, CONFIRMING, Ordering::SeqCst, Ordering::SeqCst) {
        Ok(_) => {
            api.prevent_exit();
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                confirm_then_quit(app, code.unwrap_or(0)).await;
            });
        }
        Err(DONE) => {}
        Err(_) => api.prevent_exit(),
    }
}

fn stop_services_before_restart(app: &AppHandle) {
    let app = app.clone();
    let (stopped_tx, stopped_rx) = std::sync::mpsc::channel();
    let spawned = std::thread::Builder::new()
        .name("restart-shutdown".to_string())
        .spawn(move || {
            tauri::async_runtime::block_on(stop_services_once(&app));
            let _ = stopped_tx.send(());
        });
    match spawned {
        Ok(_) => {
            if stopped_rx.recv_timeout(RESTART_STOP_TIMEOUT).is_err() {
                tracing::warn!(
                    "[shutdown] services did not stop within {RESTART_STOP_TIMEOUT:?}; restarting anyway"
                );
            }
        }
        Err(error) => {
            tracing::warn!("[shutdown] could not stop services before restarting: {error}")
        }
    }
}

async fn stop_services_once(app: &AppHandle) {
    let mut stopped = SERVICES_STOPPED.lock().await;
    if !*stopped {
        stop_services(app).await;
        *stopped = true;
    }
}

async fn confirm_then_quit(app: AppHandle, code: i32) {
    let work = live_work(&app).await;
    if let Some(prompt) = quit_prompt(&work) {
        crate::focus_running_instance(&app);
        // A dialog that fails or is dismissed keeps the app, and the work,
        // running: only the Quit button itself is a yes.
        let confirmed = native_confirm::confirm(
            &app,
            NativeConfirm {
                title: prompt.title,
                body: prompt.body,
                confirm_label: QUIT_LABEL.to_string(),
            },
        )
        .await;
        if !confirmed {
            let _ = PHASE.compare_exchange(CONFIRMING, IDLE, Ordering::SeqCst, Ordering::SeqCst);
            return;
        }
    }

    // A restart that began while the question was open owns the shutdown.
    if PHASE
        .compare_exchange(CONFIRMING, STOPPING, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    stop_services_once(&app).await;
    PHASE.store(DONE, Ordering::SeqCst);
    app.exit(code);
}

pub async fn live_work(app: &AppHandle) -> LiveWork {
    use crate::core::agent::{BackgroundAgentManagerState, BackgroundAgentStatus};
    use crate::features::terminal::SessionManager;
    use crate::sys::commands::SchedulerState;

    let mut work = LiveWork {
        chat_replies: crate::sys::commands::chat::active_turn_count(),
        ..LiveWork::default()
    };

    if let Some(agents) = app
        .try_state::<BackgroundAgentManagerState>()
        .map(|s| s.0.clone())
    {
        work.background_agents = agents
            .read()
            .await
            .list_agents()
            .await
            .iter()
            .filter(|agent| agent.status == BackgroundAgentStatus::Running)
            .count();
    }
    if let Some(terminals) = app.try_state::<SessionManager>().map(|s| s.inner().clone()) {
        work.terminals = terminals.live_session_count().await;
    }
    if let Some(scheduler) = app.try_state::<SchedulerState>() {
        work.scheduled_runs = scheduler.runs_in_flight();
    }

    work
}

async fn bounded_step<F: Future<Output = ()>>(name: &str, step: F) {
    if tokio::time::timeout(STEP_TIMEOUT, step).await.is_err() {
        tracing::warn!("[shutdown] {name} did not stop within {STEP_TIMEOUT:?}; quitting anyway");
    } else {
        tracing::info!("[shutdown] {name} stopped");
    }
}

/// Stops every item at once. One after another, a single one slow to stop
/// used up the whole bound of its step, and the ones behind it were never
/// told to stop at all.
async fn stop_together<T, F, Fut>(items: Vec<T>, stop: F)
where
    F: Fn(T) -> Fut,
    Fut: Future<Output = ()>,
{
    futures::future::join_all(items.into_iter().map(stop)).await;
}

pub async fn stop_services(app: &AppHandle) {
    use crate::core::agent::triggers::TriggerRegistryState;
    use crate::core::agent::BackgroundAgentManagerState;
    use crate::features::terminal::SessionManager;
    use crate::sys::commands::analytics::TelemetryState;
    use crate::sys::commands::{AppDatabase, BrowserStateWrapper, McpState, SchedulerState};

    tracing::info!("[shutdown] stopping services");

    bounded_step(
        "session hooks",
        crate::ui::hooks::lifecycle::end_all_sessions("quit"),
    )
    .await;

    let scheduler = app.try_state::<SchedulerState>();
    bounded_step("scheduler", async move {
        abort_background_loop(BackgroundLoop::Scheduler);
        if let Some(scheduler) = scheduler {
            scheduler.abort_runs().await;
        }
    })
    .await;

    let triggers = app.try_state::<TriggerRegistryState>().map(|s| s.0.clone());
    bounded_step("triggers", async move {
        if let Some(triggers) = triggers {
            triggers.write().await.stop().await;
        }
    })
    .await;

    bounded_step("realtime server", async move {
        abort_background_loop(BackgroundLoop::RealtimeServer);
    })
    .await;

    let agents = app
        .try_state::<BackgroundAgentManagerState>()
        .map(|s| s.0.clone());
    bounded_step("agents", async move {
        let _ = crate::sys::commands::chat_stop_generation(None).await;
        if let Some(agents) = agents {
            agents.read().await.interrupt_all_runs().await;
        }
    })
    .await;

    let browser = app
        .try_state::<BrowserStateWrapper>()
        .and_then(|state| state.get().ok().map(|browser| browser.playwright.clone()));
    bounded_step("launched browsers", async move {
        if let Some(browser) = browser {
            let closed = browser.lock().await.kill_launched_browsers().await;
            if closed > 0 {
                tracing::info!("[shutdown] closed {closed} launched browser(s)");
            }
        }
    })
    .await;

    let mcp_client = app.try_state::<McpState>().map(|s| s.client.clone());
    bounded_step("MCP servers", async move {
        if let Some(client) = mcp_client {
            let client = client.as_ref();
            stop_together(client.list_servers(), |server| async move {
                if let Err(error) = client.disconnect_server(&server).await {
                    tracing::warn!("[shutdown] failed to stop MCP server {server}: {error}");
                }
            })
            .await;
        }
    })
    .await;

    let terminals = app.try_state::<SessionManager>().map(|s| s.inner().clone());
    bounded_step("terminals", async move {
        if let Some(terminals) = terminals {
            terminals.kill_all_trees().await;
        }
    })
    .await;

    let telemetry = app
        .try_state::<TelemetryState>()
        .map(|s| s.collector.clone());
    bounded_step("telemetry", async move {
        if let Some(telemetry) = telemetry {
            if let Err(error) = telemetry.read().await.flush().await {
                tracing::warn!("[shutdown] telemetry flush failed: {error}");
            }
        }
    })
    .await;

    let database = app.try_state::<AppDatabase>().map(|s| s.conn.clone());
    bounded_step("database", async move {
        if let Some(database) = database {
            let checkpoint = tauri::async_runtime::spawn_blocking(move || {
                database
                    .lock()
                    .map_err(|error| error.to_string())
                    .and_then(|conn| {
                        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                            .map_err(|error| error.to_string())
                    })
            });
            match checkpoint.await {
                Ok(Ok(())) => {}
                Ok(Err(error)) => tracing::warn!("[shutdown] database checkpoint failed: {error}"),
                Err(error) => tracing::warn!("[shutdown] database checkpoint task failed: {error}"),
            }
        }
    })
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn every_server_is_told_to_stop_before_any_has_finished_stopping() {
        let all_started = std::sync::Arc::new(tokio::sync::Barrier::new(3));

        let stopped = tokio::time::timeout(
            Duration::from_secs(5),
            stop_together(vec!["a", "b", "c"], |_server| {
                let all_started = all_started.clone();
                async move {
                    all_started.wait().await;
                }
            }),
        )
        .await;

        assert!(
            stopped.is_ok(),
            "stopped one after another, the first would wait for the others forever"
        );
    }

    #[test]
    fn nothing_running_asks_nothing() {
        assert_eq!(quit_prompt(&LiveWork::default()), None);
    }

    #[test]
    fn prompt_names_each_kind_of_work_that_stops() {
        let prompt = quit_prompt(&LiveWork {
            chat_replies: 2,
            background_agents: 2,
            terminals: 3,
            scheduled_runs: 1,
        })
        .expect("live work must ask before quitting");
        assert_eq!(prompt.title, "Quit AGI Workforce?");
        assert!(prompt.body.contains("• 2 chat replies still being written"));
        assert!(prompt.body.contains("• 2 background agents still running"));
        assert!(prompt.body.contains("• 1 scheduled run in progress"));
        assert!(prompt.body.contains("• 3 terminals open"));
        assert!(prompt
            .body
            .contains("Terminal commands, and anything they started, are ended."));
    }

    #[test]
    fn a_reply_still_being_written_is_enough_to_ask() {
        let lines = live_work_lines(&LiveWork {
            chat_replies: 1,
            ..LiveWork::default()
        });
        assert_eq!(lines, vec!["1 chat reply still being written".to_string()]);
    }

    #[test]
    fn a_single_open_terminal_is_enough_to_ask() {
        let lines = live_work_lines(&LiveWork {
            terminals: 1,
            ..LiveWork::default()
        });
        assert_eq!(lines, vec!["1 terminal open".to_string()]);
    }

    #[test]
    fn the_quit_button_is_one_the_native_dialog_can_ask_with() {
        assert!(native_confirm::can_ask_with(QUIT_LABEL));
    }
}

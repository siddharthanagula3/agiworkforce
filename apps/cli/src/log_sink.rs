use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use tracing_subscriber::fmt::MakeWriter;

pub const LOG_DIR_NAME: &str = "log";
const LOG_FILE_NAME: &str = "agi.log";
const LOG_FILE_ROLL_BYTES: u64 = 5 * 1024 * 1024;

pub fn log_file_path() -> Option<PathBuf> {
    crate::config::CliConfig::config_dir()
        .ok()
        .map(|dir| dir.join(LOG_DIR_NAME).join(LOG_FILE_NAME))
}

fn open_log_file(path: &std::path::Path) -> Option<File> {
    std::fs::create_dir_all(path.parent()?).ok()?;
    if std::fs::metadata(path).is_ok_and(|meta| meta.len() > LOG_FILE_ROLL_BYTES) {
        let _ = std::fs::rename(path, path.with_extension("log.1"));
    }
    OpenOptions::new().create(true).append(true).open(path).ok()
}

static LOG_FILE: OnceLock<Option<Arc<Mutex<File>>>> = OnceLock::new();

/// The CLI's log file, opened on the first record written to it. A log that
/// cannot be opened is dropped rather than sent to the terminal, because the
/// only time this sink is used is while the full-screen UI owns the screen.
#[derive(Clone, Copy, Default)]
pub struct LogFile;

pub enum LogFileWriter {
    File(Arc<Mutex<File>>),
    Discard,
}

impl Write for LogFileWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Self::File(file) => match file.lock() {
                Ok(mut file) => file.write(buf),
                Err(_) => Ok(buf.len()),
            },
            Self::Discard => Ok(buf.len()),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::File(file) => match file.lock() {
                Ok(mut file) => file.flush(),
                Err(_) => Ok(()),
            },
            Self::Discard => Ok(()),
        }
    }
}

impl<'a> MakeWriter<'a> for LogFile {
    type Writer = LogFileWriter;

    fn make_writer(&'a self) -> Self::Writer {
        let file = LOG_FILE.get_or_init(|| {
            log_file_path()
                .and_then(|path| open_log_file(&path))
                .map(|file| Arc::new(Mutex::new(file)))
        });
        match file {
            Some(file) => LogFileWriter::File(Arc::clone(file)),
            None => LogFileWriter::Discard,
        }
    }
}

/// Two sinks behind one filter: the terminal's stderr while nothing else draws
/// on it, and the log file while the full-screen UI does. A stderr write under
/// the UI lands inside its frame (the input box, the status bar) and stays
/// there until a full repaint.
pub fn subscriber<T, F>(
    filter: tracing_subscriber::EnvFilter,
    terminal: T,
    file: F,
    ui_owns_terminal: fn() -> bool,
) -> impl tracing::Subscriber + Send + Sync
where
    T: for<'w> MakeWriter<'w> + Send + Sync + 'static,
    F: for<'w> MakeWriter<'w> + Send + Sync + 'static,
{
    use tracing_subscriber::filter::filter_fn;
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::Layer;

    tracing_subscriber::registry()
        .with(filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(terminal)
                .with_filter(filter_fn(move |_| !ui_owns_terminal())),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .with_writer(file)
                .with_filter(filter_fn(move |_| ui_owns_terminal())),
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[derive(Clone, Default)]
    struct Captured(Arc<Mutex<Vec<u8>>>);

    impl Captured {
        fn text(&self) -> String {
            String::from_utf8_lossy(&self.0.lock().unwrap()).into_owned()
        }
    }

    impl Write for Captured {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'a> MakeWriter<'a> for Captured {
        type Writer = Captured;
        fn make_writer(&'a self) -> Self::Writer {
            self.clone()
        }
    }

    static UI_UP: AtomicBool = AtomicBool::new(false);

    fn ui_up() -> bool {
        UI_UP.load(Ordering::SeqCst)
    }

    #[test]
    fn a_warning_raised_under_the_full_screen_ui_goes_to_the_log_file_not_the_terminal() {
        let terminal = Captured::default();
        let file = Captured::default();
        let subscriber = subscriber(
            tracing_subscriber::EnvFilter::new("warn"),
            terminal.clone(),
            file.clone(),
            ui_up,
        );
        tracing::subscriber::with_default(subscriber, || {
            UI_UP.store(true, Ordering::SeqCst);
            tracing::warn!("shell setup could not be captured");
            UI_UP.store(false, Ordering::SeqCst);
            tracing::warn!("after the screen is released");
        });

        let terminal = terminal.text();
        let file = file.text();
        assert!(
            !terminal.contains("shell setup could not be captured"),
            "a log line reached the terminal under the UI: {terminal:?}"
        );
        assert!(
            file.contains("shell setup could not be captured"),
            "{file:?}"
        );
        assert!(
            !file.contains('\u{1b}'),
            "the log file carries no colour codes"
        );
        assert!(
            terminal.contains("after the screen is released"),
            "{terminal:?}"
        );
    }
}

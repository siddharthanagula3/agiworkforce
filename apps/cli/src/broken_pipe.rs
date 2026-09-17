//! A downstream reader closing the pipe (`agi ... | head`) ends the process the
//! way it ends every other Unix filter: silently, with the status a shell
//! reports for SIGPIPE. Rust ignores SIGPIPE, so without this the first write
//! after the reader goes away panics and exits 101 with a backtrace hint.

/// 128 + SIGPIPE, the status a shell reports for a filter killed by the signal.
pub const BROKEN_PIPE_EXIT_CODE: u8 = 141;

pub fn is_broken_pipe_error(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause
            .downcast_ref::<std::io::Error>()
            .is_some_and(|io| io.kind() == std::io::ErrorKind::BrokenPipe)
    })
}

/// Whether a panic message is the standard library, or a library writing on
/// the process's behalf, reporting that its output pipe was closed.
pub fn is_broken_pipe_panic(message: &str) -> bool {
    message.contains("Broken pipe") || message.contains("kind: BrokenPipe")
}

pub fn panic_message<'a>(info: &'a std::panic::PanicHookInfo<'_>) -> Option<&'a str> {
    let payload = info.payload();
    payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
}

/// Exit quietly on a broken-pipe panic and defer to the previous hook for
/// every other panic. Install before any other hook that should not see a
/// closed pipe as a crash.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if panic_message(info).is_some_and(is_broken_pipe_panic) {
            std::process::exit(i32::from(BROKEN_PIPE_EXIT_CODE));
        }
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_closed_output_pipe_is_recognised_however_it_surfaces() {
        assert!(is_broken_pipe_panic(
            "failed printing to stdout: Broken pipe (os error 32)"
        ));
        assert!(is_broken_pipe_panic(
            "failed to write completion file: Os { code: 32, kind: BrokenPipe, message: \"Broken pipe\" }"
        ));
        assert!(!is_broken_pipe_panic("index out of bounds"));

        let wrapped = anyhow::Error::new(std::io::Error::from(std::io::ErrorKind::BrokenPipe))
            .context("writing the session list");
        assert!(is_broken_pipe_error(&wrapped));
        assert!(!is_broken_pipe_error(&anyhow::anyhow!("model refused")));
    }
}

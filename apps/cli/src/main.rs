use agiworkforce_cli::{broken_pipe, run_main};
use std::process::ExitCode;

fn main() -> ExitCode {
    broken_pipe::install_panic_hook();
    let result = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(anyhow::Error::from)
        .and_then(|runtime| runtime.block_on(run_main()));
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) if broken_pipe::is_broken_pipe_error(&error) => {
            ExitCode::from(broken_pipe::BROKEN_PIPE_EXIT_CODE)
        }
        Err(error) => {
            eprintln!("Error: {error:?}");
            ExitCode::FAILURE
        }
    }
}

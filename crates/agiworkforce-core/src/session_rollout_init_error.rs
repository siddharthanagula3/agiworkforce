use std::io::ErrorKind;
use std::path::Path;

use crate::rollout::SESSIONS_SUBDIR;
use agiworkforce_protocol::error::AgiworkforceErr;

pub(crate) fn map_session_init_error(err: &anyhow::Error, agiworkforce_home: &Path) -> AgiworkforceErr {
    if let Some(mapped) = err
        .chain()
        .filter_map(|cause| cause.downcast_ref::<std::io::Error>())
        .find_map(|io_err| map_rollout_io_error(io_err, agiworkforce_home))
    {
        return mapped;
    }

    AgiworkforceErr::Fatal(format!("Failed to initialize session: {err:#}"))
}

fn map_rollout_io_error(io_err: &std::io::Error, agiworkforce_home: &Path) -> Option<AgiworkforceErr> {
    let sessions_dir = agiworkforce_home.join(SESSIONS_SUBDIR);
    let hint = match io_err.kind() {
        ErrorKind::PermissionDenied => format!(
            "Agiworkforce cannot access session files at {} (permission denied). If sessions were created using sudo, fix ownership: sudo chown -R $(whoami) {}",
            sessions_dir.display(),
            agiworkforce_home.display()
        ),
        ErrorKind::NotFound => format!(
            "Session storage missing at {}. Create the directory or choose a different Agiworkforce home.",
            sessions_dir.display()
        ),
        ErrorKind::AlreadyExists => format!(
            "Session storage path {} is blocked by an existing file. Remove or rename it so Agiworkforce can create sessions.",
            sessions_dir.display()
        ),
        ErrorKind::InvalidData | ErrorKind::InvalidInput => format!(
            "Session data under {} looks corrupt or unreadable. Clearing the sessions directory may help (this will remove saved threads).",
            sessions_dir.display()
        ),
        ErrorKind::IsADirectory | ErrorKind::NotADirectory => format!(
            "Session storage path {} has an unexpected type. Ensure it is a directory Agiworkforce can use for session files.",
            sessions_dir.display()
        ),
        _ => return None,
    };

    Some(AgiworkforceErr::Fatal(format!(
        "{hint} (underlying error: {io_err})"
    )))
}

use std::path::PathBuf;

use agiworkforce_utils_absolute_path::AbsolutePathBuf;

/// Runtime paths needed by exec-server child processes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExecServerRuntimePaths {
    /// Stable path to the Agiworkforce executable used to launch hidden helper modes.
    pub agiworkforce_self_exe: AbsolutePathBuf,
    /// Path to the Linux sandbox helper alias used when the platform sandbox
    /// needs to re-enter Agiworkforce by argv0.
    pub agiworkforce_linux_sandbox_exe: Option<AbsolutePathBuf>,
}

impl ExecServerRuntimePaths {
    pub fn from_optional_paths(
        agiworkforce_self_exe: Option<PathBuf>,
        agiworkforce_linux_sandbox_exe: Option<PathBuf>,
    ) -> std::io::Result<Self> {
        let agiworkforce_self_exe = agiworkforce_self_exe.ok_or_else(|| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Agiworkforce executable path is not configured",
            )
        })?;
        Self::new(agiworkforce_self_exe, agiworkforce_linux_sandbox_exe)
    }

    pub fn new(
        agiworkforce_self_exe: PathBuf,
        agiworkforce_linux_sandbox_exe: Option<PathBuf>,
    ) -> std::io::Result<Self> {
        Ok(Self {
            agiworkforce_self_exe: absolute_path(agiworkforce_self_exe)?,
            agiworkforce_linux_sandbox_exe: agiworkforce_linux_sandbox_exe.map(absolute_path).transpose()?,
        })
    }
}

fn absolute_path(path: PathBuf) -> std::io::Result<AbsolutePathBuf> {
    AbsolutePathBuf::from_absolute_path(path.as_path())
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidInput, err))
}

use std::ffi::OsString;
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, ensure, Context as _, Result};
use serde::{Deserialize, Serialize};

pub const FILE_NAME: &str = "preferences.json";
const INVALID_SUFFIX: &str = "invalid";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Appearance {
    #[default]
    System,
    Light,
    Dark,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences {
    pub appearance: Appearance,
    pub notify_when_work_finishes: bool,
    pub notify_when_approval_needed: bool,
    pub keep_awake_while_working: bool,
    pub launch_at_login: bool,
    pub show_in_menu_bar: bool,
    pub quick_ask_shortcut: Option<String>,
    pub check_for_updates: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            appearance: Appearance::System,
            notify_when_work_finishes: true,
            notify_when_approval_needed: true,
            keep_awake_while_working: true,
            launch_at_login: false,
            show_in_menu_bar: true,
            quick_ask_shortcut: None,
            check_for_updates: true,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Platform {
    MacOs,
    Windows,
    Linux,
}

impl Platform {
    pub const fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::MacOs
        } else if cfg!(target_os = "windows") {
            Self::Windows
        } else {
            Self::Linux
        }
    }
}

pub fn data_directory(
    platform: Platform,
    desktop_name: &str,
    var: impl Fn(&str) -> Option<OsString>,
) -> Result<PathBuf> {
    ensure!(
        !desktop_name.trim().is_empty()
            && !desktop_name.contains(['/', '\\', '\0'])
            && desktop_name != "."
            && desktop_name != "..",
        "The desktop name cannot be used as a folder name"
    );
    let absolute = |name: &str| {
        var(name)
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
    };
    let base = match platform {
        Platform::MacOs => absolute("HOME")
            .map(|home| home.join("Library").join("Application Support"))
            .ok_or_else(|| anyhow!("HOME is not set to an absolute path"))?,
        Platform::Windows => {
            absolute("APPDATA").ok_or_else(|| anyhow!("APPDATA is not set to an absolute path"))?
        }
        Platform::Linux => absolute("XDG_CONFIG_HOME")
            .or_else(|| absolute("HOME").map(|home| home.join(".config")))
            .ok_or_else(|| {
                anyhow!("Neither XDG_CONFIG_HOME nor HOME is set to an absolute path")
            })?,
    };
    Ok(base.join(desktop_name))
}

pub fn normalize_accelerator(text: &str) -> Result<Option<String>> {
    let text = text.trim();
    if text.is_empty() {
        return Ok(None);
    }
    let parts: Vec<&str> = text.split('+').map(str::trim).collect();
    ensure!(
        parts.iter().all(|part| !part.is_empty()),
        "Write the shortcut as keys joined by +, for example cmd+shift+space"
    );
    ensure!(
        parts.len() >= 2,
        "A shortcut needs a modifier such as cmd, ctrl, alt or shift before the key"
    );
    let normalized = parts.join("+");
    crate::integration::parse_accelerator(&normalized).map_err(|error| {
        anyhow!("{normalized} {error}. Write the shortcut as keys joined by +, for example cmd+shift+space")
    })?;
    Ok(Some(normalized))
}

impl Preferences {
    pub fn directory() -> Result<PathBuf> {
        let contracts = crate::config::NativeContracts::load()?;
        data_directory(Platform::current(), &contracts.desktop_name, |name| {
            std::env::var_os(name)
        })
    }

    pub fn path() -> Result<PathBuf> {
        Ok(Self::directory()?.join(FILE_NAME))
    }

    pub fn load() -> Result<Self> {
        Self::load_from(&Self::path()?)
    }

    pub fn save(&self) -> Result<()> {
        self.save_to(&Self::path()?)
    }

    pub fn load_from(path: &Path) -> Result<Self> {
        let bytes = match fs::read(path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default())
            }
            Err(error) => {
                return Err(error).with_context(|| {
                    format!(
                        "Preferences at {} could not be read. Defaults are in use.",
                        path.display()
                    )
                })
            }
        };
        Self::parse(&bytes).map_err(|reason| {
            let kept = Self::keep_invalid(path);
            anyhow!(
                "Preferences at {} are unreadable ({reason:#}). Defaults are in use until you change a setting.{}",
                path.display(),
                match kept {
                    Ok(kept) => format!(" The unreadable file was kept at {}.", kept.display()),
                    Err(error) => format!(" The unreadable file could not be kept: {error:#}"),
                }
            )
        })
    }

    pub fn save_to(&self, path: &Path) -> Result<()> {
        let validated = self.clone().validated()?;
        let directory = path
            .parent()
            .ok_or_else(|| anyhow!("The preferences path has no folder"))?;
        fs::create_dir_all(directory)
            .with_context(|| format!("The folder {} could not be created", directory.display()))?;
        let mut contents = serde_json::to_vec_pretty(&validated)?;
        contents.push(b'\n');
        let staged = directory.join(format!(
            "{}.{}.tmp",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(FILE_NAME),
            uuid::Uuid::new_v4()
        ));
        let written = (|| -> std::io::Result<()> {
            let mut file = fs::File::create(&staged)?;
            file.write_all(&contents)?;
            file.sync_all()?;
            fs::rename(&staged, path)
        })();
        if let Err(error) = written {
            let _ = fs::remove_file(&staged);
            return Err(error)
                .with_context(|| format!("Preferences could not be saved to {}", path.display()));
        }
        Ok(())
    }

    pub fn validated(mut self) -> Result<Self> {
        self.quick_ask_shortcut = match self.quick_ask_shortcut.as_deref() {
            Some(shortcut) if shortcut.trim().is_empty() => Some(String::new()),
            Some(shortcut) => normalize_accelerator(shortcut)
                .with_context(|| format!("The quick-ask shortcut {shortcut:?} is not valid"))?,
            None => None,
        };
        Ok(self)
    }

    fn parse(bytes: &[u8]) -> Result<Self> {
        let preferences: Self = serde_json::from_slice(bytes)?;
        preferences.validated()
    }

    fn keep_invalid(path: &Path) -> Result<PathBuf> {
        let mut name = path
            .file_name()
            .ok_or_else(|| anyhow!("The preferences path has no file name"))?
            .to_os_string();
        name.push(".");
        name.push(INVALID_SUFFIX);
        let kept = path.with_file_name(name);
        if kept == path {
            bail!("The kept copy would replace the original");
        }
        fs::copy(path, &kept)?;
        Ok(kept)
    }
}

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use anyhow::{Context as _, Result};
use global_hotkey::hotkey::HotKey;
use tokio::sync::mpsc;
use url::Url;

const HOST_BRIDGE_SOURCE: &str =
    include_str!("../../../../packages/contracts/local-runtime/src/host-bridge.ts");
const SIGN_IN_SOURCE: &str =
    include_str!("../../../../packages/contracts/local-runtime/src/desktop-sign-in.ts");
const PRODUCT_LINKS_SOURCE: &str =
    include_str!("../../../../packages/contracts/types/src/product-links.ts");

pub const DEEP_LINK_QUEUE_LIMIT: usize = 20;
pub const DEEP_LINK_QUEUE_TTL: Duration = Duration::from_secs(10 * 60);
pub const DEEP_LINK_MAX_LENGTH: usize = 4096;
pub const LINK_READY_TIMEOUT: Duration = Duration::from_secs(30);
pub const LINK_READY_POLL_INTERVAL: Duration = Duration::from_millis(250);
pub const INBOX_CAPACITY: usize = 64;

const LINK_ID_MAX_CHARS: usize = 128;
const CHAT_TARGET: &str = "chat";
const PROJECT_TARGET: &str = "project";
const CODE_TARGET: &str = "code";
const LOCAL_SESSION_PREFIX: &str = "/local/";
const LOCAL_SESSION_FOLDER_PARAM: &str = "folder";
const PRODUCT_LINK_TARGETS_NAME: &str = "PRODUCT_LINK_TARGETS";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeepLinkContract {
    scheme: String,
    targets: Vec<String>,
    code_home_id: String,
    sign_in_host: String,
    quick_ask_choices: Vec<String>,
}

impl DeepLinkContract {
    pub fn load() -> Result<&'static Self> {
        static CONTRACT: LazyLock<std::result::Result<DeepLinkContract, String>> =
            LazyLock::new(|| {
                DeepLinkContract::from_sources(
                    HOST_BRIDGE_SOURCE,
                    SIGN_IN_SOURCE,
                    PRODUCT_LINKS_SOURCE,
                )
                .map_err(|error| format!("{error:#}"))
            });
        CONTRACT
            .as_ref()
            .map_err(|error| anyhow::anyhow!("{error}"))
    }

    pub fn from_sources(host_bridge: &str, sign_in: &str, product_links: &str) -> Result<Self> {
        let scheme = string_constant(host_bridge, "DESKTOP_DEEP_LINK_SCHEME")
            .context("The desktop deep-link scheme is missing from its contract")?;
        anyhow::ensure!(
            is_url_scheme(&scheme),
            "The desktop deep-link scheme must be a lowercase URL scheme"
        );
        let (mut targets, spreads) = string_list(host_bridge, "DESKTOP_DEEP_LINK_TARGETS")
            .context("The desktop deep-link targets are missing from their contract")?;
        for spread in spreads {
            anyhow::ensure!(
                spread == PRODUCT_LINK_TARGETS_NAME,
                "The desktop deep-link targets include an unknown list"
            );
            let (product, nested) = string_list(product_links, PRODUCT_LINK_TARGETS_NAME)
                .context("The product link targets are missing from their contract")?;
            anyhow::ensure!(
                nested.is_empty(),
                "The product link targets must be a flat list"
            );
            targets.extend(product);
        }
        targets.sort();
        targets.dedup();
        for required in [CHAT_TARGET, PROJECT_TARGET, CODE_TARGET] {
            anyhow::ensure!(
                targets.iter().any(|target| target == required),
                "The desktop deep-link contract no longer names {required}"
            );
        }
        anyhow::ensure!(
            targets.iter().all(|target| is_link_host(target)),
            "The desktop deep-link targets must be plain host names"
        );
        let code_home_id = string_constant(host_bridge, "CODE_HOME_DEEP_LINK_ID")
            .filter(|id| is_link_id(id))
            .context("The code home deep-link id is missing from its contract")?;
        let sign_in_host = string_constant(sign_in, "DESKTOP_SIGN_IN_LINK_HOST")
            .filter(|host| is_link_host(host))
            .context("The desktop sign-in link host is missing from its contract")?;
        anyhow::ensure!(
            !targets.contains(&sign_in_host),
            "The desktop sign-in host must not be a deep-link target"
        );
        let quick_ask_choices = keyed_list(host_bridge, "HOST_SHORTCUT_CHOICES", "quickAsk")
            .filter(|choices| !choices.is_empty())
            .context("The Quick Ask shortcut choices are missing from their contract")?;
        for choice in &quick_ask_choices {
            parse_accelerator(choice)
                .with_context(|| format!("The Quick Ask shortcut choice {choice} is invalid"))?;
        }
        Ok(Self {
            scheme,
            targets,
            code_home_id,
            sign_in_host,
            quick_ask_choices,
        })
    }

    pub fn scheme(&self) -> &str {
        &self.scheme
    }

    pub fn targets(&self) -> &[String] {
        &self.targets
    }

    pub fn quick_ask_default(&self) -> &str {
        &self.quick_ask_choices[0]
    }

    pub fn quick_ask_choices(&self) -> &[String] {
        &self.quick_ask_choices
    }

    pub fn parse(&self, raw: &str) -> std::result::Result<DeepLinkRoute, DeepLinkRejection> {
        if raw.len() > DEEP_LINK_MAX_LENGTH {
            return Err(DeepLinkRejection::Malformed);
        }
        let url = Url::parse(raw).map_err(|_| DeepLinkRejection::Malformed)?;
        if url.scheme() != self.scheme {
            return Err(DeepLinkRejection::NotThisApp);
        }
        if !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
            || url.fragment().is_some()
        {
            return Err(DeepLinkRejection::Malformed);
        }
        let host = url.host_str().ok_or(DeepLinkRejection::Malformed)?;
        if host == self.sign_in_host {
            return Ok(DeepLinkRoute::SignIn);
        }
        if !self.targets.iter().any(|target| target == host) {
            return Err(DeepLinkRejection::UnknownTarget);
        }
        if host == CODE_TARGET && url.path().starts_with(LOCAL_SESSION_PREFIX) {
            return local_session(&url);
        }
        if url.query().is_some() {
            return Err(DeepLinkRejection::Malformed);
        }
        let id = decode_link_id(url.path().trim_start_matches('/').trim_end_matches('/'))?;
        match host {
            CHAT_TARGET => Ok(DeepLinkRoute::Conversation(id)),
            PROJECT_TARGET => Ok(DeepLinkRoute::Project(id)),
            CODE_TARGET if id == self.code_home_id => Ok(DeepLinkRoute::CodeHome),
            CODE_TARGET => Err(DeepLinkRejection::CloudCodeSession),
            target => Err(DeepLinkRejection::Unsupported(target.to_owned())),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeepLinkRoute {
    Conversation(String),
    Project(String),
    CodeHome,
    LocalSession { thread_id: String, folder: PathBuf },
    SignIn,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeepLinkRejection {
    NotThisApp,
    Malformed,
    UnknownTarget,
    InvalidId,
    InvalidFolder,
    CloudCodeSession,
    Unsupported(String),
}

impl DeepLinkRejection {
    pub fn message(&self) -> String {
        match self {
            Self::NotThisApp => "This link is not for this app, so it was not opened.".into(),
            Self::Malformed => "This link is malformed, so it was not opened.".into(),
            Self::UnknownTarget => {
                "This link names something this app does not open, so it was not opened.".into()
            }
            Self::InvalidId => {
                "This link names an item with an invalid identifier, so it was not opened.".into()
            }
            Self::InvalidFolder => {
                "This session link does not name an absolute folder, so it was not opened.".into()
            }
            Self::CloudCodeSession => {
                "This app cannot open cloud coding sessions yet. Open the session on the web."
                    .into()
            }
            Self::Unsupported(target) => {
                format!("This app cannot open {target} links yet. Open the link on the web.")
            }
        }
    }
}

fn local_session(url: &Url) -> std::result::Result<DeepLinkRoute, DeepLinkRejection> {
    let thread_id = decode_link_id(&url.path()[LOCAL_SESSION_PREFIX.len()..])?;
    let mut folder = None;
    for (key, value) in url.query_pairs() {
        if key != LOCAL_SESSION_FOLDER_PARAM || folder.is_some() {
            return Err(DeepLinkRejection::Malformed);
        }
        folder = Some(value.into_owned());
    }
    let folder = folder.ok_or(DeepLinkRejection::InvalidFolder)?;
    if folder.contains('\0') || !Path::new(&folder).is_absolute() {
        return Err(DeepLinkRejection::InvalidFolder);
    }
    Ok(DeepLinkRoute::LocalSession {
        thread_id,
        folder: PathBuf::from(folder),
    })
}

fn decode_link_id(encoded: &str) -> std::result::Result<String, DeepLinkRejection> {
    let bytes = encoded.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let pair = bytes
                .get(index + 1..index + 3)
                .and_then(|pair| std::str::from_utf8(pair).ok())
                .and_then(|pair| u8::from_str_radix(pair, 16).ok())
                .ok_or(DeepLinkRejection::Malformed)?;
            decoded.push(pair);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    let id = String::from_utf8(decoded).map_err(|_| DeepLinkRejection::Malformed)?;
    if is_link_id(&id) {
        Ok(id)
    } else {
        Err(DeepLinkRejection::InvalidId)
    }
}

fn is_link_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= LINK_ID_MAX_CHARS
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}

fn is_link_host(host: &str) -> bool {
    !host.is_empty()
        && host
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn is_url_scheme(scheme: &str) -> bool {
    let mut bytes = scheme.bytes();
    bytes.next().is_some_and(|first| first.is_ascii_lowercase())
        && bytes.all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'+' | b'.' | b'-')
        })
}

fn declaration<'a>(source: &'a str, name: &str) -> Option<&'a str> {
    let marker = format!("export const {name}");
    let mut offset = 0;
    while let Some(found) = source[offset..].find(&marker) {
        let rest = &source[offset + found + marker.len()..];
        if rest.starts_with([' ', ':', '=']) {
            let (_, value) = rest.split_once('=')?;
            return Some(value.trim_start());
        }
        offset += found + marker.len();
    }
    None
}

fn quoted(text: &str) -> Option<String> {
    let inner = text.strip_prefix('\'')?;
    let (value, _) = inner.split_once('\'')?;
    (!value.contains(['\\', '\n'])).then(|| value.to_owned())
}

fn list_items(text: &str) -> Option<(Vec<String>, Vec<String>)> {
    let body = text.strip_prefix('[')?;
    let (body, _) = body.split_once(']')?;
    let mut values = Vec::new();
    let mut spreads = Vec::new();
    for item in body
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
    {
        if let Some(spread) = item.strip_prefix("...") {
            if spread.is_empty()
                || !spread
                    .bytes()
                    .all(|byte| byte.is_ascii_uppercase() || byte == b'_')
            {
                return None;
            }
            spreads.push(spread.to_owned());
        } else {
            let value = quoted(item)?;
            if item.len() != value.len() + 2 {
                return None;
            }
            values.push(value);
        }
    }
    Some((values, spreads))
}

fn string_constant(source: &str, name: &str) -> Option<String> {
    let value = declaration(source, name)?;
    let parsed = quoted(value)?;
    value[parsed.len() + 2..]
        .trim_start()
        .starts_with(';')
        .then_some(parsed)
}

fn string_list(source: &str, name: &str) -> Option<(Vec<String>, Vec<String>)> {
    list_items(declaration(source, name)?)
}

fn keyed_list(source: &str, name: &str, key: &str) -> Option<Vec<String>> {
    let object = declaration(source, name)?.strip_prefix('{')?;
    let (object, _) = object.split_once('}')?;
    let marker = format!("{key}:");
    let start = object
        .lines()
        .map(str::trim_start)
        .find_map(|line| line.strip_prefix(&marker))?;
    let (values, spreads) = list_items(start.trim_start())?;
    spreads.is_empty().then_some(values)
}

#[derive(Debug)]
struct QueuedLink {
    url: String,
    received_at: Instant,
}

#[derive(Debug, Default)]
pub struct DeepLinkQueue {
    entries: VecDeque<QueuedLink>,
}

impl DeepLinkQueue {
    pub fn push(&mut self, url: String, now: Instant) {
        if self.entries.iter().any(|entry| entry.url == url) {
            return;
        }
        self.entries.push_back(QueuedLink {
            url,
            received_at: now,
        });
        while self.entries.len() > DEEP_LINK_QUEUE_LIMIT {
            self.entries.pop_front();
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn drain_fresh(&mut self, now: Instant) -> Vec<String> {
        self.entries
            .drain(..)
            .filter(|entry| {
                now.checked_duration_since(entry.received_at)
                    .is_some_and(|age| age < DEEP_LINK_QUEUE_TTL)
            })
            .map(|entry| entry.url)
            .collect()
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InboxEvent {
    OpenUrls(Vec<String>),
    HotKey(u32),
    TrayMenu(String),
    TrayActivated,
}

type Inbox = (
    mpsc::Sender<InboxEvent>,
    Mutex<Option<mpsc::Receiver<InboxEvent>>>,
);

static INBOX: LazyLock<Inbox> = LazyLock::new(|| {
    let (sender, receiver) = mpsc::channel(INBOX_CAPACITY);
    (sender, Mutex::new(Some(receiver)))
});

pub fn post(event: InboxEvent) {
    if let Err(error) = INBOX.0.try_send(event) {
        eprintln!("Desktop integration dropped an event: {error}");
    }
}

pub fn receive_open_urls(urls: Vec<String>) {
    post(InboxEvent::OpenUrls(urls));
}

pub fn take_inbox() -> Option<mpsc::Receiver<InboxEvent>> {
    INBOX.1.lock().map_or_else(
        |poisoned| poisoned.into_inner().take(),
        |mut guard| guard.take(),
    )
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AcceleratorError {
    Empty,
    Whitespace,
    EmptyToken,
    DuplicateModifier,
    MissingModifier,
    ShiftOnly,
    UnknownKey,
}

impl std::fmt::Display for AcceleratorError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(match self {
            Self::Empty => "is empty",
            Self::Whitespace => "contains whitespace",
            Self::EmptyToken => "has an empty key name",
            Self::DuplicateModifier => "repeats a modifier",
            Self::MissingModifier => "needs a modifier key",
            Self::ShiftOnly => "needs a modifier other than Shift",
            Self::UnknownKey => "names a key this app does not recognize",
        })
    }
}

impl std::error::Error for AcceleratorError {}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Modifier {
    Alt,
    Control,
    Shift,
    Super,
    CommandOrControl,
}

fn modifier(token: &str) -> Option<Modifier> {
    match token.to_ascii_uppercase().as_str() {
        "ALT" | "OPTION" => Some(Modifier::Alt),
        "CONTROL" | "CTRL" => Some(Modifier::Control),
        "SHIFT" => Some(Modifier::Shift),
        "COMMAND" | "CMD" | "SUPER" => Some(Modifier::Super),
        "COMMANDORCONTROL" | "COMMANDORCTRL" | "CMDORCTRL" | "CMDORCONTROL" => {
            Some(Modifier::CommandOrControl)
        }
        _ => None,
    }
}

pub fn parse_accelerator(value: &str) -> std::result::Result<HotKey, AcceleratorError> {
    if value.is_empty() {
        return Err(AcceleratorError::Empty);
    }
    if value.chars().any(char::is_whitespace) {
        return Err(AcceleratorError::Whitespace);
    }
    let tokens = value.split('+').collect::<Vec<_>>();
    if tokens.iter().any(|token| token.is_empty()) {
        return Err(AcceleratorError::EmptyToken);
    }
    let (key, modifiers) = tokens.split_last().ok_or(AcceleratorError::Empty)?;
    if modifier(key).is_some() {
        return Err(AcceleratorError::UnknownKey);
    }
    let mut seen = Vec::new();
    for token in modifiers {
        let parsed = modifier(token).ok_or(AcceleratorError::UnknownKey)?;
        if seen.contains(&parsed) {
            return Err(AcceleratorError::DuplicateModifier);
        }
        seen.push(parsed);
    }
    if seen.is_empty() {
        return Err(AcceleratorError::MissingModifier);
    }
    if seen.iter().all(|modifier| *modifier == Modifier::Shift) {
        return Err(AcceleratorError::ShiftOnly);
    }
    HotKey::from_str(value).map_err(|_| AcceleratorError::UnknownKey)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum QuickAskShortcut {
    Off,
    Chord(String),
}

pub fn quick_ask_shortcut(preference: Option<&str>, default: &str) -> QuickAskShortcut {
    match preference {
        None => QuickAskShortcut::Chord(default.to_owned()),
        Some("") => QuickAskShortcut::Off,
        Some(chord) => QuickAskShortcut::Chord(chord.to_owned()),
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum ShortcutStatus {
    #[default]
    Off,
    Registered(String),
    Malformed(String, AcceleratorError),
    Taken(String),
    Unavailable(String),
}

impl ShortcutStatus {
    pub fn detail(&self) -> Option<String> {
        match self {
            Self::Off | Self::Registered(_) => None,
            Self::Malformed(chord, error) => Some(format!("{chord} {error}.")),
            Self::Taken(chord) => Some(format!("{chord} is already in use by another app.")),
            Self::Unavailable(reason) => Some(reason.clone()),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayCommand {
    Open,
    Hide,
    NewChat,
    Quit,
}

impl TrayCommand {
    const ALL: [Self; 4] = [Self::Open, Self::Hide, Self::NewChat, Self::Quit];

    pub fn id(self) -> &'static str {
        match self {
            Self::Open => "integration.tray.open",
            Self::Hide => "integration.tray.hide",
            Self::NewChat => "integration.tray.new-chat",
            Self::Quit => "integration.tray.quit",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|command| command.id() == id)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TrayMenuItem {
    Command(TrayCommand, String),
    Separator,
}

pub fn tray_menu(desktop_name: &str) -> Vec<TrayMenuItem> {
    vec![
        TrayMenuItem::Command(TrayCommand::Open, format!("Open {desktop_name}")),
        TrayMenuItem::Command(TrayCommand::Hide, format!("Hide {desktop_name}")),
        TrayMenuItem::Separator,
        TrayMenuItem::Command(TrayCommand::NewChat, "New Chat".into()),
        TrayMenuItem::Separator,
        TrayMenuItem::Command(TrayCommand::Quit, format!("Quit {desktop_name}")),
    ]
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum MenuBarStatus {
    #[default]
    Off,
    Shown,
    Unsupported(String),
    Failed(String),
}

impl MenuBarStatus {
    pub fn detail(&self) -> Option<&str> {
        match self {
            Self::Off | Self::Shown => None,
            Self::Unsupported(reason) | Self::Failed(reason) => Some(reason),
        }
    }
}

pub const fn tray_supported() -> bool {
    cfg!(any(target_os = "macos", target_os = "windows"))
}

pub fn menu_bar_status(requested: bool) -> MenuBarStatus {
    match (requested, tray_supported()) {
        (false, _) => MenuBarStatus::Off,
        (true, true) => MenuBarStatus::Shown,
        (true, false) => MenuBarStatus::Unsupported(
            "The menu bar icon is not available on this platform yet.".into(),
        ),
    }
}

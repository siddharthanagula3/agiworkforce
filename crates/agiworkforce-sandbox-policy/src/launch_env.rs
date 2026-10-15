//! What a launch consent records for each environment variable. Any value
//! can decide what code a launched program runs, through a search path, a
//! startup hook, a loader variable or a setting a tool reads that no list
//! keeps up with, so a consent pins every value it can. The CLI's and the
//! desktop's MCP consent both use this.
//!
//! Two things are decided for a variable, and they are not the same thing.
//! Whether its value is shown in the approval question ([`shown_value`]), and
//! whether a change to it asks again ([`pinned_value`]):
//!
//! - A credential, by its name, is neither shown nor pinned. Rotating an API
//!   key is not a different launch, and a digest of a short password kept in
//!   a consent record would be something to guess it against. A name says so
//!   by its last word, as `API_TOKEN` and `DB_PASSWORD` do; a secret word
//!   earlier in a name, as in `ANSIBLE_HOST_KEY_CHECKING`, does not.
//! - An endpoint is shown by where it points and no more: such a value often
//!   carries a password or a token. It is pinned by that and by a digest of
//!   its query, credentials blanked, so a host or a TLS option moved there
//!   asks again and a rotated password does not.
//! - A value that cannot be shown without risk, and whose name does not say
//!   it is a credential, is pinned by a digest: it is not displayed, and a
//!   change to it still asks again.
//! - Everything else is shown and pinned whole.

use std::borrow::Cow;

/// Words that mark a variable as a credential when one of them is the last
/// word of its name, words being what `_` separates and a trailing number not
/// counting: `API_TOKEN`, `DB_PASS`, `MYSQL_PWD`, `API_KEY_2`.
const SECRET_NAME_WORDS: [&str; 20] = [
    "TOKEN",
    "TOKENS",
    "KEY",
    "KEYS",
    "SECRET",
    "SECRETS",
    "PASSWORD",
    "PASSWD",
    "PASS",
    "PWD",
    "PASSPHRASE",
    "CREDENTIAL",
    "CREDENTIALS",
    "AUTH",
    "AUTHORIZATION",
    "COOKIE",
    "COOKIES",
    "SESSION",
    "PAT",
    "APIKEY",
];

/// The longer of those words mark a credential at the end of that last word
/// as well, with nothing between: `PGPASSWORD`, `AUTHTOKEN`. The short ones
/// do not, since `MONKEY` ends in `KEY` and `GOAUTH` in `AUTH`.
const SECRET_WORD_ENDINGS: [&str; 6] = [
    "TOKEN",
    "SECRET",
    "PASSWORD",
    "PASSWD",
    "PASSPHRASE",
    "CREDENTIALS",
];

/// Plural words of those that are as often a number as a credential, and the
/// words beside them that say which: `MAX_OUTPUT_TOKENS` and `MAX_KEYS` are
/// limits, `API_TOKENS` is a list of credentials. With one of the second
/// list in the name, a name ending in one of the first only might hold a
/// credential.
const COUNTED_NAME_WORDS: [&str; 2] = ["TOKENS", "KEYS"];
const COUNT_NAME_WORDS: [&str; 7] = ["MAX", "MIN", "NUM", "TOTAL", "COUNT", "LIMIT", "BUDGET"];

/// Values that switch something on or off, compared without case. No
/// credential is one of them, so a variable set to one is shown and pinned
/// whatever its name says: `DANGEROUSLY_OMIT_AUTH=true` and `SECURE_COOKIE=0`
/// change what a server does, and a consent that left them out would let
/// either be flipped unasked.
const SWITCH_VALUES: [&str; 9] = ["", "0", "1", "true", "false", "yes", "no", "on", "off"];

/// What any of those words is looked for as anywhere else in the name: an
/// earlier word, as `KEY` is in `AWS_ACCESS_KEY_ID`, or a part of a longer
/// one, as it is in `KEYCLOAK_REALM`. Such a name may hold a credential or
/// may be a switch, so its value is not shown and is pinned by a digest.
const SECRET_NAME_PARTS: [&str; 11] = [
    "TOKEN",
    "KEY",
    "SECRET",
    "PASSWORD",
    "PASSWD",
    "PASS",
    "PWD",
    "CREDENTIAL",
    "AUTH",
    "COOKIE",
    "SESSION",
];

/// Git reads `GIT_CONFIG_KEY_<n>` as the name of a setting whose value is
/// `GIT_CONFIG_VALUE_<n>`, so the name decides whether that value runs as a
/// command; it is never a secret.
const SETTING_NAME_PREFIX: &str = "GIT_CONFIG_KEY_";

/// Names whose value may be a setting or may carry a credential, with
/// nothing in the name to tell which, so the value is not shown and is
/// pinned by a digest. `GIT_CONFIG_VALUE_<n>` is the value of the setting
/// `GIT_CONFIG_KEY_<n>` names, a command for `core.sshCommand` and an
/// `Authorization` line for `http.extraHeader`.
const HIDDEN_SETTING_PREFIXES: [&str; 1] = ["GIT_CONFIG_VALUE_"];

/// `GIT_CONFIG_PARAMETERS` is the same settings, names and values, in one
/// variable. `HEADER` and `HEADERS` are what `--header` names when an
/// argument is read by the option before it.
const HIDDEN_SETTING_NAMES: [&str; 3] = ["GIT_CONFIG_PARAMETERS", "HEADER", "HEADERS"];

/// Request headers handed to a client, `OTEL_EXPORTER_OTLP_HEADERS` among
/// them, are where an `Authorization` value is put.
const HIDDEN_SETTING_SUFFIXES: [&str; 2] = ["_HEADERS", "_HEADER"];

/// Bundler keeps a setting per host or per gem under a name with the dots
/// written `__`: `BUNDLE_GEMS__EXAMPLE__COM` is that host's user and
/// password, `BUNDLE_BUILD__NOKOGIRI` that gem's build flags.
const HOST_SETTING_FAMILY: (&str, &str) = ("BUNDLE_", "__");

/// Names that hold a credential and do not end in a word that says so.
const SECRET_NAMES: [&str; 2] = ["DOCKER_AUTH_CONFIG", "GOOGLE_APPLICATION_CREDENTIALS_JSON"];

/// Families that hold a credential under a name that ends in what the
/// credential is for: Terraform's token for a host, Poetry's for a
/// repository, NuGet's for a package source.
const SECRET_NAME_PREFIXES: [&str; 3] = [
    "TF_TOKEN_",
    "POETRY_PYPI_TOKEN_",
    "NUGETPACKAGESOURCECREDENTIALS_",
];

/// Endings that name where a secret is kept or which program fetches it,
/// rather than the secret itself: a credential provider, a key file, a
/// keyring backend, a command that prints a key such as `SOPS_AGE_KEY_CMD`,
/// an agent's socket such as `SSH_AUTH_SOCK`, a store's folder, a
/// certificate or the bundle of authorities a client trusts. The last five
/// are switches rather than places: whether a host key or a certificate is
/// checked at all, as in `ANSIBLE_HOST_KEY_CHECKING`. The value decides what
/// runs, what is read or what is trusted, so it is shown and pinned whatever
/// words come before the ending.
const LOCATOR_NAME_SUFFIXES: [&str; 25] = [
    "_PROVIDER",
    "_FILE",
    "_BACKEND",
    "_PROCESS",
    "_COMMAND",
    "_PATH",
    "_CMD",
    "_HELPER",
    "_EXEC",
    "_SCRIPT",
    "_PROGRAM",
    "_SOCK",
    "_DIR",
    "_DIRECTORY",
    "_CAFILE",
    "_CAINFO",
    "_CAPATH",
    "_BUNDLE",
    "_CERT",
    "_CERTS",
    "_CHECKING",
    "_VERIFY",
    "_VERIFICATION",
    "_INSECURE",
    "_UNAUTHORIZED",
];

/// Names of that kind whose ending does not say so. `SSLKEYLOGFILE` is the
/// file a TLS library writes every session key to, `XAUTHORITY` and
/// `PGPASSFILE` are files a client reads its credentials from, and
/// `GIT_SSL_KEY` is the path of a key file, not the key.
const LOCATOR_NAMES: [&str; 8] = [
    "CARGO_REGISTRY_CREDENTIAL_PROVIDER",
    "AWS_SHARED_CREDENTIALS_FILE",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "PYTHON_KEYRING_BACKEND",
    "SSLKEYLOGFILE",
    "XAUTHORITY",
    "PGPASSFILE",
    "GIT_SSL_KEY",
];

/// Switches and commands that are always shown and pinned whole, whatever
/// words their names hold: what a program loads at start, what it runs to
/// ask for a password, whether it checks a certificate. Most hold no secret
/// word and would be pinned anyway; they are listed so that no change to the
/// words above can drop one. `NODE_TLS_REJECT_UNAUTHORIZED` holds `AUTH`,
/// `GOAUTH` is a command Go runs, and the `ASKPASS` ones hold `PASS`. `PWD`
/// is the working directory, which reads as a word for a password, and the
/// last three turn a server's sign-in or its cookie's protection on or off.
const BEHAVIOUR_NAMES: [&str; 19] = [
    "PATH",
    "PWD",
    "OLDPWD",
    "DANGEROUSLY_OMIT_AUTH",
    "NPM_CONFIG_ALWAYS_AUTH",
    "SECURE_COOKIE",
    "NODE_OPTIONS",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "PYTHONSTARTUP",
    "LD_PRELOAD",
    "DYLD_INSERT_LIBRARIES",
    "GOAUTH",
    "GIT_SSH_COMMAND",
    "GIT_ASKPASS",
    "SSH_ASKPASS",
    "SSH_ASKPASS_REQUIRE",
    "SUDO_ASKPASS",
    "BORG_PASSCOMMAND",
    "SESSION_MANAGER",
];

/// Endings that mark a value as an endpoint, a place a program connects to:
/// `DATABASE_URL`, `MONGODB_URI`, `SENTRY_DSN`, `OIDC_TOKEN_ENDPOINT`,
/// `AUTH_HOST`, `SMTP_SERVER`, `VAULT_ADDR`, `DBUS_SESSION_BUS_ADDRESS`,
/// `HTTPS_PROXY`, which often carries the proxy's password, and where
/// packages come from: `NPM_CONFIG_REGISTRY`, `CARGO_REGISTRIES_<name>_INDEX`.
const ENDPOINT_NAME_SUFFIXES: [&str; 11] = [
    "_URL",
    "_URI",
    "_DSN",
    "_ENDPOINT",
    "_HOST",
    "_SERVER",
    "_ADDR",
    "_ADDRESS",
    "_PROXY",
    "_REGISTRY",
    "_INDEX",
];

/// What follows an endpoint that had credentials taken out of it, so whoever
/// approves the launch sees that the value was more than what is shown.
pub const REDACTED_SUFFIX: &str = " (credentials hidden)";

/// What comes before the digest a value is pinned by when it is not shown.
pub const VALUE_DIGEST_PREFIX: &str = "sha256:";

/// What comes between an endpoint as it is shown and the digest its query is
/// pinned by.
const PINNED_QUERY: &str = " query ";

/// What a variable's name says about its value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NameClass {
    /// Shown and pinned whole.
    Plain,
    /// Shown and pinned as where it points.
    Endpoint,
    /// A credential: neither shown nor pinned.
    Secret,
    /// Maybe a credential, maybe a switch: not shown, pinned by a digest.
    Unclear,
}

/// Names compare without case, as Windows does. The order is the rule: the
/// names listed outright first, then what the ending says, and only then the
/// words.
fn name_class(name: &str) -> NameClass {
    let name = name.to_ascii_uppercase();
    let name = name.as_str();
    if BEHAVIOUR_NAMES.contains(&name) {
        return NameClass::Plain;
    }
    if SECRET_NAMES.contains(&name)
        || SECRET_NAME_PREFIXES
            .iter()
            .any(|prefix| name.starts_with(prefix))
    {
        return NameClass::Secret;
    }
    let (family, host_mark) = HOST_SETTING_FAMILY;
    if HIDDEN_SETTING_NAMES.contains(&name)
        || HIDDEN_SETTING_PREFIXES
            .iter()
            .any(|prefix| name.starts_with(prefix))
        || HIDDEN_SETTING_SUFFIXES
            .iter()
            .any(|suffix| name.ends_with(suffix))
        || (name.starts_with(family) && name.contains(host_mark))
    {
        return NameClass::Unclear;
    }
    if ENDPOINT_NAME_SUFFIXES
        .iter()
        .any(|suffix| name.ends_with(suffix))
    {
        return NameClass::Endpoint;
    }
    if name.starts_with(SETTING_NAME_PREFIX)
        || LOCATOR_NAMES.contains(&name)
        || LOCATOR_NAME_SUFFIXES
            .iter()
            .any(|suffix| name.ends_with(suffix))
    {
        return NameClass::Plain;
    }
    let last_word = name
        .rsplit('_')
        .find(|word| !word.is_empty() && !word.chars().all(|c| c.is_ascii_digit()))
        .unwrap_or(name);
    let names_a_secret = SECRET_NAME_WORDS.contains(&last_word)
        || SECRET_WORD_ENDINGS
            .iter()
            .any(|ending| last_word.ends_with(ending));
    let names_a_count = COUNTED_NAME_WORDS.contains(&last_word)
        && name.split('_').any(|word| COUNT_NAME_WORDS.contains(&word));
    if names_a_secret && !names_a_count {
        NameClass::Secret
    } else if SECRET_NAME_PARTS.iter().any(|part| name.contains(part)) {
        NameClass::Unclear
    } else {
        NameClass::Plain
    }
}

/// A variable whose name says its value is a credential, which a consent
/// neither shows nor pins: it is one of [`SECRET_NAMES`] or starts with one
/// of [`SECRET_NAME_PREFIXES`], or its last word is
/// one of [`SECRET_NAME_WORDS`] or ends in one of [`SECRET_WORD_ENDINGS`] and
/// the name is not a listed switch ([`BEHAVIOUR_NAMES`]), an endpoint
/// ([`ENDPOINT_NAME_SUFFIXES`]), a git setting ([`SETTING_NAME_PREFIX`]) or
/// where a secret is kept ([`LOCATOR_NAME_SUFFIXES`], [`LOCATOR_NAMES`]).
pub fn value_is_secret(name: &str) -> bool {
    name_class(name) == NameClass::Secret
}

/// What `name` set to `value` is: what the name says, except that a switch
/// ([`SWITCH_VALUES`]) is never a credential.
fn value_class(name: &str, value: &str) -> NameClass {
    let is_a_switch = SWITCH_VALUES
        .iter()
        .any(|switch| switch.eq_ignore_ascii_case(value.trim()));
    match name_class(name) {
        NameClass::Secret if is_a_switch => NameClass::Plain,
        class => class,
    }
}

/// Whether `name` set to `value` is a credential: its name says so
/// ([`value_is_secret`]) and the value is not a switch. A consent neither
/// shows nor pins such a value, and a host leaves it out of the environment
/// it gives a sandboxed command.
pub fn holds_a_credential(name: &str, value: &str) -> bool {
    value_class(name, value) == NameClass::Secret
}

/// What an approval question shows for the variable `name` set to `value`,
/// or `None` when the value is not to be displayed.
///
/// An endpoint is shown as where it points: scheme, host, port and path. The
/// user and password before the host, the query and the fragment are
/// dropped, with [`REDACTED_SUFFIX`] in their place when any was there. An
/// endpoint written without `://` is a path or a `host:port` and is shown as
/// written, unless it holds an `@`, a `?` or a `#`, which is where a
/// credential would sit. A credential, a name that may be one, and an
/// endpoint that cannot be read with confidence are not shown. Every other
/// value is shown whole.
pub fn shown_value<'a>(name: &str, value: &'a str) -> Option<Cow<'a, str>> {
    match value_class(name, value) {
        NameClass::Plain => Some(Cow::Borrowed(value)),
        NameClass::Endpoint => endpoint(value).map(|endpoint| endpoint.shown),
        NameClass::Secret | NameClass::Unclear => None,
    }
}

/// What a consent pins for the variable `name` set to `value`, so that a
/// change to it asks again, or `None` when the value may change freely.
///
/// What is shown is pinned ([`shown_value`]), so the approval covers what
/// was on screen. What is not shown is pinned too, by [`VALUE_DIGEST_PREFIX`]
/// and a `digest`, which the caller computes as a SHA-256 in hex: of the
/// whole value for two index URLs in one value or a name that may or may not
/// hold a credential, and for an endpoint of its query and fragment with the
/// value of each credential parameter taken out, so that
/// `?host=other&sslmode=disable` asks again and `?password=` rotated does
/// not. Only a credential by name ([`value_is_secret`]) is left out
/// altogether, so that rotating a token is not a different launch; a
/// credential inside a value pinned whole by digest does ask again when it
/// rotates.
pub fn pinned_value<'a>(
    name: &str,
    value: &'a str,
    digest: impl FnOnce(&str) -> String,
) -> Option<Cow<'a, str>> {
    let whole =
        |digest: String| -> Cow<'a, str> { Cow::Owned(format!("{VALUE_DIGEST_PREFIX}{digest}")) };
    match value_class(name, value) {
        NameClass::Secret => None,
        NameClass::Plain => Some(Cow::Borrowed(value)),
        NameClass::Unclear => Some(whole(digest(value))),
        NameClass::Endpoint => Some(match endpoint(value) {
            None => whole(digest(value)),
            Some(endpoint) if endpoint.left_out.is_empty() => endpoint.shown,
            Some(endpoint) => Cow::Owned(format!(
                "{}{PINNED_QUERY}{VALUE_DIGEST_PREFIX}{}",
                endpoint.shown,
                digest(&without_credential_parameters(endpoint.left_out))
            )),
        }),
    }
}

/// An endpoint as it is shown, and the query and fragment that were left
/// out of that, as written.
struct Endpoint<'a> {
    shown: Cow<'a, str>,
    left_out: &'a str,
}

/// `left_out`, a query and a fragment, with the value of each parameter
/// whose name says it is a credential taken out and everything else kept as
/// written: what of an endpoint has to hold still for the launch to be the
/// one that was approved.
fn without_credential_parameters(left_out: &str) -> String {
    const SEPARATORS: [char; 4] = ['?', '#', '&', ';'];
    let mut settings = String::with_capacity(left_out.len());
    for piece in left_out.split_inclusive(SEPARATORS) {
        let (parameter, separator) = match piece.char_indices().next_back() {
            Some((at, last)) if SEPARATORS.contains(&last) => piece.split_at(at),
            _ => (piece, ""),
        };
        match parameter.split_once('=') {
            Some((name, value)) if holds_a_credential(&name.replace(['-', '.'], "_"), value) => {
                settings.push_str(name);
                settings.push('=');
            }
            _ => settings.push_str(parameter),
        }
        settings.push_str(separator);
    }
    settings
}

/// `value` as where it points, or `None` when it cannot be read with
/// confidence. See [`shown_value`].
fn endpoint(value: &str) -> Option<Endpoint<'_>> {
    if value.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return None;
    }
    let Some((scheme, rest)) = value.split_once("://") else {
        return (!value.contains(['@', '?', '#'])).then_some(Endpoint {
            shown: Cow::Borrowed(value),
            left_out: "",
        });
    };
    let names_a_scheme = scheme.starts_with(|c: char| c.is_ascii_alphabetic())
        && scheme
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.' | ':'));
    if !names_a_scheme {
        return None;
    }
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let (authority, after) = rest.split_at(authority_end);
    let (user, host) = match authority.rsplit_once('@') {
        Some((user, host)) => (Some(user), host),
        None => (None, authority),
    };
    let (path, left_out) = after.split_at(after.find(['?', '#']).unwrap_or(after.len()));
    // A password with a slash in it ends the authority early: what is left
    // reads as `user:digits` with the rest of the password, an `@` and the
    // real host in the path. Such a value is not one to show.
    let split_password = user.is_none() && host.contains(':') && path.contains('@');
    if !names_a_host(host) || split_password || (host.is_empty() && user.is_some()) {
        return None;
    }
    let shown = if user.is_none() && left_out.is_empty() {
        Cow::Borrowed(value)
    } else {
        Cow::Owned(format!("{scheme}://{host}{path}{REDACTED_SUFFIX}"))
    };
    Some(Endpoint { shown, left_out })
}

/// Whether `host` is a host with an optional port and nothing else: a name
/// or an address, or an IPv6 address in brackets, then `:` and digits. Empty
/// is a host too, as in `file:///srv/data`.
fn names_a_host(host: &str) -> bool {
    let (name, port) = match host.strip_prefix('[').and_then(|rest| rest.split_once(']')) {
        Some((address, port)) => {
            let hex = !address.is_empty()
                && address
                    .chars()
                    .all(|c| c.is_ascii_hexdigit() || matches!(c, ':' | '.'));
            if !hex {
                return false;
            }
            (
                "",
                port.strip_prefix(':').or(port.is_empty().then_some("0")),
            )
        }
        None => match host.split_once(':') {
            Some((name, port)) => (name, Some(port)),
            None => (host, Some("0")),
        },
    };
    name.chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        && port.is_some_and(|port| !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shown(name: &str, value: &str) -> Option<String> {
        shown_value(name, value).map(Cow::into_owned)
    }

    /// A stand-in for the caller's SHA-256: what matters here is that the
    /// whole value goes in and that the value itself does not come out.
    fn pinned(name: &str, value: &str) -> Option<String> {
        pinned_value(name, value, |whole| format!("digest-of-{}", whole.len())).map(Cow::into_owned)
    }

    /// A pin with what went into its digest left readable.
    fn pinned_from(name: &str, value: &str) -> Option<String> {
        pinned_value(name, value, |digested| format!("<{digested}>")).map(Cow::into_owned)
    }

    #[test]
    fn a_credential_by_name_is_neither_shown_nor_pinned() {
        for name in [
            "API_TOKEN",
            "github_token",
            "OPENAI_API_KEY",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_SESSION_TOKEN",
            "CLIENT_SECRET",
            "DB_PASSWORD",
            "SMTP_PASSWD",
            "DB_PASS",
            "MYSQL_PWD",
            "GPG_PASSPHRASE",
            "REGISTRY_CREDENTIAL",
            "GOOGLE_APPLICATION_CREDENTIALS_JSON",
            "AUTHORIZATION",
            "DOCKER_AUTH_CONFIG",
            "SESSION_COOKIE",
            "ERLANG_COOKIE",
            "API_KEY_2",
            "GITHUB_PAT",
            "PGPASSWORD",
            "NGROK_AUTHTOKEN",
            "OPENAI_APIKEY",
            "AUTH_URL_TOKEN",
            "API_TOKENS",
            "SIGNING_KEYS",
            "SOCKET_SECRET",
            "MY_SSLKEYLOGFILE_KEY",
        ] {
            assert!(value_is_secret(name), "{name}");
            assert_eq!(shown(name, "EXAMPLE"), None, "{name} is shown");
            assert_eq!(
                pinned(name, "EXAMPLE"),
                None,
                "rotating {name} would ask again"
            );
        }
    }

    #[test]
    fn a_switch_or_a_command_is_shown_and_pinned_whatever_its_name_holds() {
        for name in BEHAVIOUR_NAMES {
            assert!(!value_is_secret(name), "{name}");
            assert_eq!(shown(name, "0").as_deref(), Some("0"), "{name}");
            assert_eq!(pinned(name, "0").as_deref(), Some("0"), "{name}");
        }
        for name in [
            "NODE_TLS_REJECT_UNAUTHORIZED",
            "NODE_OPTIONS",
            "GOAUTH",
            "GIT_SSH_COMMAND",
            "GIT_ASKPASS",
            "SSH_ASKPASS",
            "PYTHONSTARTUP",
            "LD_PRELOAD",
            "DYLD_INSERT_LIBRARIES",
            "PATH",
            "node_tls_reject_unauthorized",
        ] {
            assert_ne!(
                pinned(name, "0"),
                pinned(name, "1"),
                "{name} could change with nobody asked again"
            );
        }
        for name in [
            "npm_config_registry",
            "GIT_CONFIG_KEY_0",
            "GIT_CONFIG_COUNT",
            "HOME",
            "PATCH_LEVEL",
            "MY_TOOL_PLUGIN",
        ] {
            assert_eq!(shown(name, "v").as_deref(), Some("v"), "{name}");
            assert_eq!(pinned(name, "v").as_deref(), Some("v"), "{name}");
        }
    }

    #[test]
    fn the_settings_git_is_handed_are_all_pinned_and_their_values_are_not_shown() {
        for (name, value) in [
            ("GIT_CONFIG_COUNT", "2"),
            ("GIT_CONFIG_KEY_0", "http.extraHeader"),
            ("git_config_key_12", "core.sshCommand"),
            ("GIT_CONFIG_GLOBAL", "/planted/gitconfig"),
        ] {
            assert_eq!(shown(name, value).as_deref(), Some(value), "{name}");
            assert_eq!(pinned(name, value).as_deref(), Some(value), "{name}");
        }
        for name in [
            "GIT_CONFIG_VALUE_0",
            "git_config_value_12",
            "GIT_CONFIG_PARAMETERS",
            "OTEL_EXPORTER_OTLP_HEADERS",
            "API_KEY_HEADER",
            "HEADER",
            "headers",
            "BUNDLE_GEMS__EXAMPLE__COM",
            "BUNDLE_BUILD__NOKOGIRI",
        ] {
            let value = "Authorization: Bearer EXAMPLE";
            assert!(!value_is_secret(name), "{name}");
            assert_eq!(shown(name, value), None, "{name} is shown");
            let pin = pinned(name, value).expect("pinned");
            assert_eq!(pin, format!("sha256:digest-of-{}", value.len()), "{name}");
            assert_ne!(
                pinned(name, value),
                pinned(name, "ssh -o ProxyCommand=planted"),
                "{name} could change with nobody asked again"
            );
        }
    }

    #[test]
    fn a_package_tool_family_hides_its_credentials_and_pins_what_it_runs() {
        for name in [
            "NPM_CONFIG__AUTH",
            "npm_config__authToken",
            "NPM_CONFIG_//registry.npmjs.org/:_authToken",
            "NPM_CONFIG__PASSWORD",
            "CARGO_REGISTRY_TOKEN",
            "CARGO_REGISTRIES_CORP_TOKEN",
            "DOCKER_PASSWORD",
            "DOCKER_AUTH_CONFIG",
            "DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE",
            "TWINE_PASSWORD",
            "UV_INDEX_CORP_PASSWORD",
            "POETRY_HTTP_BASIC_CORP_PASSWORD",
            "POETRY_PYPI_TOKEN_CORP",
            "TF_TOKEN_app_terraform_io",
            "NuGetPackageSourceCredentials_corp",
            "COMPOSER_AUTH",
            "ORG_GRADLE_PROJECT_mavenPassword",
        ] {
            assert!(value_is_secret(name), "{name}");
            assert_eq!(shown(name, "EXAMPLE"), None, "{name} is shown");
            assert_eq!(pinned(name, "EXAMPLE"), None, "{name} is hashed");
        }
        for name in [
            "NPM_CONFIG_REGISTRY",
            "npm_config_https_proxy",
            "PIP_INDEX_URL",
            "PIP_EXTRA_INDEX_URL",
            "PIP_TRUSTED_HOST",
            "PIP_PROXY",
            "UV_DEFAULT_INDEX",
            "CARGO_REGISTRIES_CORP_INDEX",
            "CARGO_HTTP_PROXY",
            "DOCKER_HOST",
            "DOCKER_CONTENT_TRUST_SERVER",
        ] {
            assert_eq!(
                shown(name, "sparse+https://app:EXAMPLE@pkgs.example.com/index/").as_deref(),
                Some("sparse+https://pkgs.example.com/index/ (credentials hidden)"),
                "{name}"
            );
            assert_eq!(
                pinned(name, "https://app:EXAMPLE@pkgs.example.com/simple"),
                pinned(name, "https://app:ROTATED@pkgs.example.com/simple"),
                "{name}"
            );
            assert_ne!(
                pinned(name, "https://pkgs.example.com/simple"),
                pinned(name, "https://pkgs.planted.invalid/simple"),
                "{name} could point elsewhere with nobody asked again"
            );
            assert_eq!(shown(name, "1").as_deref(), Some("1"), "{name}");
        }
        for name in [
            "NPM_CONFIG_USERCONFIG",
            "NPM_CONFIG_SCRIPT_SHELL",
            "NPM_CONFIG_STRICT_SSL",
            "NPM_CONFIG_CAFILE",
            "PIP_CONFIG_FILE",
            "PIP_CERT",
            "PIP_CLIENT_CERT",
            "PIP_KEYRING_PROVIDER",
            "PIP_NO_INPUT",
            "CARGO_REGISTRIES_CORP_CREDENTIAL_PROVIDER",
            "CARGO_HTTP_CAINFO",
            "CARGO_BUILD_RUSTC_WRAPPER",
            "RUSTC_WRAPPER",
            "DOCKER_CONFIG",
            "DOCKER_CERT_PATH",
            "DOCKER_TLS_VERIFY",
            "DOCKER_CONTEXT",
        ] {
            assert_eq!(shown(name, "/a?b@c").as_deref(), Some("/a?b@c"), "{name}");
            assert_eq!(pinned(name, "/a?b@c").as_deref(), Some("/a?b@c"), "{name}");
        }
    }

    #[test]
    fn a_switch_is_shown_and_pinned_whatever_its_name_says() {
        for name in [
            "DANGEROUSLY_OMIT_AUTH",
            "NPM_CONFIG_ALWAYS_AUTH",
            "SECURE_COOKIE",
        ] {
            assert!(!value_is_secret(name), "{name} is a listed switch");
            for value in ["true", "none", "EXAMPLE"] {
                assert_eq!(shown(name, value).as_deref(), Some(value), "{name}");
                assert_eq!(pinned(name, value).as_deref(), Some(value), "{name}");
            }
        }
        for name in [
            "SKIP_AUTH",
            "USE_SESSION",
            "REQUIRE_API_KEY",
            "HTTP_ONLY_COOKIE",
        ] {
            assert!(value_is_secret(name), "{name} by its name alone");
            for switch in ["true", "false", "0", "1", "YES", "off", ""] {
                assert!(!holds_a_credential(name, switch), "{name}={switch}");
                assert_eq!(shown(name, switch).as_deref(), Some(switch), "{name}");
                assert_eq!(pinned(name, switch).as_deref(), Some(switch), "{name}");
            }
            assert_ne!(
                pinned(name, "true"),
                pinned(name, "false"),
                "{name} could be flipped with nobody asked again"
            );
            assert!(holds_a_credential(name, "EXAMPLE"), "{name}");
            assert_eq!(shown(name, "EXAMPLE"), None, "{name}");
            assert_eq!(pinned(name, "EXAMPLE"), None, "{name}");
        }
        assert_eq!(
            pinned_from(
                "DATABASE_URL",
                "postgres://db/main?auth=false&password=EXAMPLE"
            )
            .as_deref(),
            Some("postgres://db/main (credentials hidden) query sha256:<?auth=false&password=>"),
            "a switch in a query is pinned as it is"
        );
        for name in ["PWD", "OLDPWD", "pwd"] {
            assert!(!value_is_secret(name), "{name} is the working directory");
            assert_eq!(shown(name, "/work").as_deref(), Some("/work"), "{name}");
        }
    }

    #[test]
    fn where_a_secret_is_kept_is_shown_and_pinned_like_any_other_value() {
        for name in [
            "CARGO_REGISTRY_CREDENTIAL_PROVIDER",
            "cargo_registries_corp_credential_provider",
            "AWS_SHARED_CREDENTIALS_FILE",
            "AWS_CREDENTIAL_PROCESS",
            "GOOGLE_APPLICATION_CREDENTIALS",
            "PYTHON_KEYRING_BACKEND",
            "SSH_AUTH_SOCK",
            "ssh_auth_sock",
            "GPG_AGENT_AUTH_SOCK",
            "SSH_AUTH_SOCK_PATH",
            "SSLKEYLOGFILE",
            "sslkeylogfile",
            "XAUTHORITY",
            "PGPASSFILE",
            "GIT_SSL_KEY",
            "GIT_SSL_CERT",
            "GIT_SSL_CAINFO",
            "GIT_SSL_CAPATH",
            "SSL_CERT_FILE",
            "NODE_EXTRA_CA_CERTS",
            "REQUESTS_CA_BUNDLE",
            "PIP_CERT",
            "TOKEN_SIGNING_CAFILE",
            "PASSWORD_STORE_DIR",
            "CREDENTIALS_DIRECTORY",
            "API_KEY_FILE",
            "TOKEN_COMMAND",
            "SECRET_PROVIDER",
            "SOPS_AGE_KEY_CMD",
            "git_credential_helper",
            "VAULT_TOKEN_HELPER",
            "AWS_SECRET_KEY_EXEC",
            "API_KEY_SCRIPT",
            "AUTH_PROGRAM",
        ] {
            assert!(!value_is_secret(name), "{name}");
            assert_eq!(
                shown(name, "/a?b@c").as_deref(),
                Some("/a?b@c"),
                "{name} is a path or a command and is shown as it is"
            );
            assert_eq!(pinned(name, "/a?b@c").as_deref(), Some("/a?b@c"), "{name}");
        }
    }

    #[test]
    fn whether_a_key_or_a_certificate_is_checked_is_shown_and_pinned() {
        for name in [
            "ANSIBLE_HOST_KEY_CHECKING",
            "STRICT_HOST_KEY_CHECKING",
            "GIT_SSL_NO_VERIFY",
            "VAULT_SKIP_VERIFY",
            "TOKEN_SIGNATURE_VERIFY",
            "SSH_HOST_KEY_VERIFICATION",
            "REGISTRY_AUTH_INSECURE",
            "REJECT_UNAUTHORIZED",
            "ansible_host_key_checking",
        ] {
            assert!(!value_is_secret(name), "{name}");
            assert_eq!(shown(name, "False").as_deref(), Some("False"), "{name}");
            assert_eq!(pinned(name, "False").as_deref(), Some("False"), "{name}");
            assert_ne!(
                pinned(name, "False"),
                pinned(name, "True"),
                "{name} could be switched off with nobody asked again"
            );
        }
    }

    #[test]
    fn a_place_to_connect_to_is_an_endpoint_whatever_words_come_before() {
        for name in [
            "OIDC_TOKEN_ENDPOINT",
            "AUTH_HOST",
            "KEYCLOAK_AUTH_SERVER",
            "VAULT_ADDR",
            "DBUS_SESSION_BUS_ADDRESS",
            "SECRETS_MANAGER_ENDPOINT",
            "HTTPS_PROXY",
            "oidc_token_endpoint",
        ] {
            assert!(!value_is_secret(name), "{name}");
            for value in [
                "https://id.example.com/token",
                "id.example.com:8443",
                "unix:path=/run/user/1000/bus",
            ] {
                assert_eq!(shown(name, value).as_deref(), Some(value), "{name}");
                assert_eq!(pinned(name, value).as_deref(), Some(value), "{name}");
            }
            assert_eq!(
                shown(name, "https://app:EXAMPLE@id.example.com/token").as_deref(),
                Some("https://id.example.com/token (credentials hidden)"),
                "{name}"
            );
            assert_ne!(
                pinned(name, "https://id.example.com/token"),
                pinned(name, "https://id.planted.invalid/token"),
                "{name} could point elsewhere with nobody asked again"
            );
        }
    }

    #[test]
    fn a_secret_word_that_is_not_the_last_one_is_hidden_and_still_pinned() {
        for name in [
            "AWS_ACCESS_KEY_ID",
            "SESSION_ID",
            "MAX_OUTPUT_TOKENS",
            "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
            "THINKING_BUDGET_TOKENS",
            "S3_MAX_KEYS",
            "TOKEN_TTL",
            "KEY_ROTATION_DAYS",
            "PASSWORD_MIN_LENGTH",
            "AUTH_MODE",
            "KEYCLOAK_REALM",
            "MONKEY_MODE",
            "PGSSLKEY",
            "COMPASS_MODE",
            "TOKENIZERS_PARALLELISM",
        ] {
            assert!(!value_is_secret(name), "{name}");
            assert_eq!(shown(name, "EXAMPLE"), None, "{name} is shown");
            let pin = pinned(name, "EXAMPLE").expect("pinned");
            assert_eq!(pin, "sha256:digest-of-7", "{name}");
            assert!(!pin.contains("EXAMPLE"), "{name} stores its value");
            assert_ne!(
                pinned(name, "EXAMPLE"),
                pinned(name, "EXAMPLE-2"),
                "{name} could change with nobody asked again"
            );
        }
    }

    #[test]
    fn an_endpoint_is_shown_by_where_it_points_without_its_credentials() {
        for (value, reduced) in [
            (
                "postgres://app:EXAMPLE@db.example.com:5432/main",
                "postgres://db.example.com:5432/main (credentials hidden)",
            ),
            (
                "redis://:EXAMPLE@cache.example.com",
                "redis://cache.example.com (credentials hidden)",
            ),
            (
                "https://hooks.example.com/notify?token=EXAMPLE&room=7",
                "https://hooks.example.com/notify (credentials hidden)",
            ),
            (
                "https://example.com/callback#access_token=EXAMPLE",
                "https://example.com/callback (credentials hidden)",
            ),
            (
                "https://user:EXAMPLE@[2001:db8::1]:8443/v1?key=1",
                "https://[2001:db8::1]:8443/v1 (credentials hidden)",
            ),
            (
                "jdbc:postgresql://db.example.com/main?user=app&password=EXAMPLE",
                "jdbc:postgresql://db.example.com/main (credentials hidden)",
            ),
        ] {
            for name in ["DATABASE_URL", "MONGODB_URI", "SENTRY_DSN", "mongodb_uri"] {
                assert_eq!(shown(name, value).as_deref(), Some(reduced), "{name}");
                let pin = pinned(name, value).expect("pinned");
                assert!(pin.starts_with(reduced), "{name}: {pin}");
                assert!(!pin.contains("EXAMPLE"), "{name} stores a credential");
            }
        }
        assert_eq!(
            pinned("DATABASE_URL", "postgres://app:EXAMPLE@db.example.com/main"),
            pinned("DATABASE_URL", "postgres://app:ROTATED@db.example.com/main"),
            "a rotated password is the same launch"
        );
        assert_ne!(
            pinned("DATABASE_URL", "postgres://app:EXAMPLE@db.example.com/main"),
            pinned(
                "DATABASE_URL",
                "postgres://app:EXAMPLE@db.planted.invalid/main"
            ),
            "another host is another launch"
        );
        assert_ne!(
            pinned("PIP_INDEX_URL", "https://pypi.org/simple"),
            pinned("PIP_INDEX_URL", "https://pypi.org/simple?x=1"),
            "the marker tells a bare endpoint from one that carried something"
        );
        assert_eq!(
            shown(
                "OAUTH_TOKEN_URL",
                "https://id.example.com/token?client_secret=EXAMPLE"
            )
            .as_deref(),
            Some("https://id.example.com/token (credentials hidden)"),
            "the ending decides before the words do"
        );
    }

    #[test]
    fn an_endpoint_is_pinned_by_its_query_with_the_credentials_blanked() {
        for (value, pin) in [
            (
                "postgres://app:EXAMPLE@db.example.com:5432/main",
                "postgres://db.example.com:5432/main (credentials hidden)",
            ),
            (
                "postgres://db/main?host=planted.invalid&sslmode=disable",
                "postgres://db/main (credentials hidden) query sha256:<?host=planted.invalid&sslmode=disable>",
            ),
            (
                "https://hooks.example.com/notify?token=EXAMPLE&room=7",
                "https://hooks.example.com/notify (credentials hidden) query sha256:<?token=&room=7>",
            ),
            (
                "https://example.com/callback#access_token=EXAMPLE",
                "https://example.com/callback (credentials hidden) query sha256:<#access_token=>",
            ),
            (
                "https://user:EXAMPLE@[2001:db8::1]:8443/v1?key=EXAMPLE",
                "https://[2001:db8::1]:8443/v1 (credentials hidden) query sha256:<?key=>",
            ),
            (
                "jdbc:postgresql://db.example.com/main?user=app&password=EXAMPLE",
                "jdbc:postgresql://db.example.com/main (credentials hidden) query sha256:<?user=app&password=>",
            ),
            (
                "mysql://db/main?ssl-mode=DISABLED;api-key=EXAMPLE&flag#client.secret=EXAMPLE",
                "mysql://db/main (credentials hidden) query sha256:<?ssl-mode=DISABLED;api-key=&flag#client.secret=>",
            ),
            (
                "https://db.example.com/main?sslkey=/planted/key.pem&password=",
                "https://db.example.com/main (credentials hidden) query sha256:<?sslkey=/planted/key.pem&password=>",
            ),
        ] {
            for name in ["DATABASE_URL", "MONGODB_URI", "AUTH_HOST"] {
                assert_eq!(pinned_from(name, value).as_deref(), Some(pin), "{name}");
            }
        }
        let approved = "postgres://db/main?sslmode=require&password=EXAMPLE";
        assert_eq!(
            pinned_from("DATABASE_URL", approved),
            pinned_from(
                "DATABASE_URL",
                "postgres://db/main?sslmode=require&password=ROTATED-AND-LONGER"
            ),
            "a rotated password in the query is the same launch"
        );
        for moved in [
            "postgres://db/main",
            "postgres://db/main?sslmode=disable&password=EXAMPLE",
            "postgres://db/main?sslmode=require&password=EXAMPLE&host=planted.invalid",
            "postgres://db/main?password=EXAMPLE&sslmode=require",
            "postgres://db/main?sslmode=require#password=EXAMPLE",
        ] {
            assert_ne!(
                pinned_from("DATABASE_URL", approved),
                pinned_from("DATABASE_URL", moved),
                "{moved} is another launch"
            );
            assert_eq!(
                shown("DATABASE_URL", moved).is_some(),
                shown("DATABASE_URL", approved).is_some()
            );
        }
        assert_ne!(
            pinned("DATABASE_URL", approved),
            shown("DATABASE_URL", approved),
            "the digest is pinned and not shown"
        );
    }

    #[test]
    fn an_endpoint_with_nothing_to_hide_is_shown_and_pinned_as_written() {
        for value in [
            "https://pypi.org/simple",
            "https://registry.npmjs.org/@scope/pkg",
            "http://localhost:8080",
            "file:///srv/data/index",
            "unix:///var/run/docker.sock",
            "./planted-plugin",
            "localhost:5432",
            "BASE_URL-value",
            "",
        ] {
            assert!(
                matches!(shown_value("BASE_URL", value), Some(Cow::Borrowed(kept)) if kept == value),
                "{value}"
            );
            assert_eq!(pinned("BASE_URL", value).as_deref(), Some(value));
        }
    }

    #[test]
    fn an_endpoint_that_cannot_be_read_is_hidden_and_still_pinned() {
        for value in [
            "https://pypi.org/simple https://planted.invalid/simple",
            "app:EXAMPLE@db.example.com/main",
            "app:EXAMPLE@tcp(db.example.com:3306)/main",
            "db.example.com/main?password=EXAMPLE",
            "page#token",
            "postgres://app:12/34@db.example.com/main",
            "postgres://app:EXAMPLE@/main",
            "https://example.com:port/x",
            "https://[not-an-address]/x",
            "1https://example.com",
            "https://ex\u{0}ample.com/",
            "https://example.com/a\nb",
        ] {
            for name in ["PIP_EXTRA_INDEX_URL", "MONGODB_URI", "MYSQL_DSN"] {
                assert_eq!(shown(name, value), None, "{value:?} is shown");
                let pin = pinned(name, value).expect("what is not shown is still pinned");
                assert_eq!(pin, format!("sha256:digest-of-{}", value.len()));
            }
        }
        assert_ne!(
            pinned(
                "PIP_EXTRA_INDEX_URL",
                "https://pypi.org/simple https://one.invalid/simple"
            ),
            pinned(
                "PIP_EXTRA_INDEX_URL",
                "https://pypi.org/simple https://another.invalid/simple/x"
            ),
            "a second index could be swapped with nobody asked again"
        );
    }
}

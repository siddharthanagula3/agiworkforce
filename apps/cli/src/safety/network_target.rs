//! Which destinations a command names, and which of them are internal.
//!
//! "Allow the network" is an answer about the internet. Treating it as consent
//! to reach a service bound to the developer's own machine, or a cloud
//! instance-metadata endpoint that hands out credentials to anything that asks,
//! is the SSRF shape this module exists to refuse. It is the one owner of that
//! judgement in the CLI: the sandbox profile, the approval prompt and the
//! environment summary all read it from here rather than each keeping a list.

/// For display only; `is_internal_host` is the check and covers ranges no list can.
pub(crate) const INTERNAL_HOST_NAMES: &[&str] = &[
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
    "169.254.169.254",
    "metadata.google.internal",
];

/// Whether a host names this machine, a link-local address, or a cloud
/// instance-metadata endpoint.
pub(crate) fn is_internal_host(host: &str) -> bool {
    host_is_internal(host, false)
}

/// [`is_internal_host`] for a host read out of a URL, where a dotless `0`
/// can only be 0.0.0.0, which reaches this machine. The host is
/// percent-decoded first, as curl and WHATWG clients decode it, and one that
/// does not decode is taken for an internal one.
fn is_internal_url_host(host: &str) -> bool {
    percent_decoded(host).is_none_or(|host| host_is_internal(&host, true))
}

fn percent_decoded(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        if byte != b'%' {
            decoded.push(byte);
            index += 1;
            continue;
        }
        let (high, low) = (*bytes.get(index + 1)?, *bytes.get(index + 2)?);
        let digit = |byte: u8| char::from(byte).to_digit(16);
        decoded.push((digit(high)? * 16 + digit(low)?) as u8);
        index += 3;
    }
    String::from_utf8(decoded).ok()
}

fn host_is_internal(host: &str, in_url: bool) -> bool {
    let host = host
        .trim_matches(|c| c == '[' || c == ']')
        .trim_end_matches('.')
        .to_ascii_lowercase();
    let host = match host.find('%') {
        Some(zone) if host[..zone].contains(':') => host[..zone].to_string(),
        _ => host,
    };
    if host == "localhost"
        || host.ends_with(".localhost")
        || host == "metadata.google.internal"
        || host == "metadata.goog"
    {
        return true;
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return is_internal_ip(ip);
    }
    if host.starts_with("127.") || host.starts_with("169.254.") {
        return true;
    }
    // The resolver also accepts the inet_aton spellings: `0x7f000001`,
    // `0177.0.0.1` and `127.1` all reach 127.0.0.1. Outside a URL a dotless
    // word is only read as an address when it lands on loopback or
    // link-local, so a bare `0` in `curl --retry 0` is not taken for one.
    match inet_aton(&host) {
        Some(v4) if host.contains('.') || in_url => is_internal_ip(std::net::IpAddr::V4(v4)),
        Some(v4) => v4.is_loopback() || v4.is_link_local(),
        None => false,
    }
}

fn is_internal_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_unspecified()
                || v4.is_link_local()
                // Alibaba Cloud's metadata endpoint.
                || v4.octets() == [100, 100, 100, 200]
        }
        std::net::IpAddr::V6(v6) => {
            let segments = v6.segments();
            v6.is_loopback()
                || v6.is_unspecified()
                || (segments[0] & 0xffc0) == 0xfe80
                // `fd00:ec2::254` is the IPv6 spelling of the EC2 metadata service.
                || (segments[0] == 0xfd00 && segments[1] == 0x0ec2)
                || v6
                    .to_ipv4_mapped()
                    .is_some_and(|v4| is_internal_ip(std::net::IpAddr::V4(v4)))
        }
    }
}

/// An IPv4 address in any spelling inet_aton accepts: one to four parts, each
/// decimal, `0x` hex or leading-zero octal, the last filling the bytes left.
fn inet_aton(host: &str) -> Option<std::net::Ipv4Addr> {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.is_empty() || parts.len() > 4 {
        return None;
    }
    let mut values = Vec::with_capacity(parts.len());
    for part in &parts {
        let value = if let Some(hex) = part.strip_prefix("0x") {
            u32::from_str_radix(hex, 16).ok()?
        } else if part.len() > 1 && part.starts_with('0') {
            u32::from_str_radix(&part[1..], 8).ok()?
        } else {
            part.parse::<u32>().ok()?
        };
        values.push(value);
    }
    let (last, leading) = values.split_last()?;
    if leading.iter().any(|value| *value > 0xff) {
        return None;
    }
    let remaining_bits = 8 * (4 - leading.len() as u32);
    if remaining_bits < 32 && u64::from(*last) >= 1u64 << remaining_bits {
        return None;
    }
    let mut packed = 0u32;
    for (index, value) in leading.iter().enumerate() {
        packed |= value << (24 - 8 * index as u32);
    }
    Some(std::net::Ipv4Addr::from(packed | last))
}

/// Schemes after whose colon a WHATWG client skips any run of `/` and `\`
/// and reads the authority, with no `//` needed.
const SPECIAL_SCHEMES: [&str; 5] = ["http", "https", "ws", "wss", "ftp"];

fn is_special_scheme(scheme: &str) -> bool {
    SPECIAL_SCHEMES
        .iter()
        .any(|special| special.eq_ignore_ascii_case(scheme))
}

/// Where the run of scheme characters that ends at byte `end` of `word`
/// starts.
fn scheme_start(word: &str, end: usize) -> usize {
    word[..end]
        .char_indices()
        .rev()
        .take_while(|(_, c)| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
        .last()
        .map_or(end, |(start, _)| start)
}

/// The text after a word's scheme that curl and WHATWG clients read the
/// authority from: what follows `://`, and after a special scheme what
/// follows the colon and any `/` and `\`, so `http:127.0.0.1/`,
/// `http:/127.0.0.1/` and `http:\\127.0.0.1/` all name 127.0.0.1.
fn after_scheme(word: &str) -> Option<&str> {
    if let Some((scheme, rest)) = word.split_once("://") {
        if scheme.is_empty() {
            return None;
        }
        let named = &scheme[scheme_start(scheme, scheme.len())..];
        return Some(if is_special_scheme(named) {
            rest.trim_start_matches(['/', '\\'])
        } else {
            rest
        });
    }
    word.match_indices(':').find_map(|(colon, _)| {
        is_special_scheme(&word[scheme_start(word, colon)..colon])
            .then(|| word[colon + 1..].trim_start_matches(['/', '\\']))
    })
}

/// Schemes curl reads a host after that a WHATWG client does not treat as
/// special, proxy schemes included.
const CURL_SCHEMES: &[&str] = &[
    "dict", "ftps", "gopher", "gophers", "imap", "imaps", "ldap", "ldaps", "mqtt", "mqtts", "pop3",
    "pop3s", "rtmp", "rtmpe", "rtmps", "rtmpt", "rtmpte", "rtmpts", "rtsp", "scp", "sftp", "smb",
    "smbs", "smtp", "smtps", "socks4", "socks4a", "socks5", "socks5h", "telnet", "tftp",
];

/// The text curl reads the authority from after each scheme in
/// [`CURL_SCHEMES`] that a `/` follows. curl skips one to three slashes
/// there, so `gopher:/127.0.0.1:6379/` and `dict:///localhost:11211/` both
/// reach this machine.
fn curl_readings(word: &str) -> impl Iterator<Item = &str> {
    word.match_indices(':').filter_map(move |(colon, _)| {
        let rest = &word[colon + 1..];
        let scheme = &word[scheme_start(word, colon)..colon];
        (rest.starts_with('/')
            && CURL_SCHEMES
                .iter()
                .any(|known| known.eq_ignore_ascii_case(scheme)))
        .then(|| rest.trim_start_matches('/'))
    })
}

fn host_of_authority(authority: &str) -> Option<&str> {
    let authority = authority.rsplit('@').next()?;
    let host = if let Some(rest) = authority.strip_prefix('[') {
        rest.split(']').next()?
    } else {
        authority.split(':').next()?
    };
    (!host.is_empty()).then_some(host)
}

/// The host a WHATWG client such as npm's connects to for the URL in `word`,
/// read from the first scheme in it as the client reads the whole operand.
fn whatwg_host(word: &str) -> Option<String> {
    let start = word
        .match_indices(':')
        .map(|(colon, _)| scheme_start(word, colon))
        .find(|start| word[*start..].starts_with(|c: char| c.is_ascii_alphabetic()))?;
    reqwest::Url::parse(&word[start..])
        .ok()?
        .host_str()
        .map(str::to_string)
}

/// The first internal destination any segment of `command` names, or the
/// authority of a URL whose host is only known once the command runs.
///
/// Each word is read as written and as the program receives it. Quote
/// removal turns `http://12'7.0.0.1':3000/` into `http://127.0.0.1:3000/` for
/// both the direct argv launch and `sh -c`, so a check on the written text
/// alone refuses one spelling of a destination and admits another.
///
/// A URL is read twice, as curl reads it and as a WHATWG client does, and is
/// refused when either reading is internal: curl takes
/// `http://example.com\@127.0.0.1/` to 127.0.0.1 and a WHATWG client takes
/// `http://127.0.0.1\@example.com/` there.
///
/// An option that sends the connection somewhere other than the URL's host
/// (a proxy, `--connect-to`, `--resolve`, a Unix socket, `--interface`) is
/// judged as a destination of its own; see [`redirected_destination`].
///
/// An assignment `NAME=value` is also read from its value, and a proxy
/// variable's value is judged as a proxy; see [`assigned_destination`].
pub(crate) fn internal_destination(command: &str) -> Option<String> {
    let no_proxy_read_back = no_proxy_is_read_back(command);
    super::split_segments(command).iter().find_map(|segment| {
        let written: Vec<String> = segment.split_whitespace().map(str::to_string).collect();
        let unquoted = shlex::split(segment).unwrap_or_default();
        let curl_rules =
            runs_curl(&written) || runs_curl(&unquoted) || runs_a_filled_in_program(segment, 0);
        [written, unquoted].iter().find_map(|words| {
            let command_word = command_word_position(words);
            redirected_destination(words, curl_rules).or_else(|| {
                destination_words(words)
                    .into_iter()
                    .find_map(|(index, word, names_an_owner)| {
                        let lists_proxy_exclusions = index < command_word
                            && command_word < words.len()
                            && !no_proxy_read_back;
                        internal_destination_in(&word, names_an_owner).or_else(|| {
                            assigned_destination(&word, names_an_owner, lists_proxy_exclusions)
                        })
                    })
            })
        })
    })
}

/// Environment variables curl and most HTTP clients take a proxy from, in
/// any letter case.
const PROXY_VARIABLES: [&str; 4] = ["http_proxy", "https_proxy", "all_proxy", "ftp_proxy"];

/// The name and value of an assignment word `NAME=value`.
fn assignment(word: &str) -> Option<(&str, &str)> {
    let (name, value) = word.trim_start_matches(['\'', '"']).split_once('=')?;
    let is_name = name
        .chars()
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    is_name.then_some((name, value))
}

fn names_no_proxy(word: &str) -> bool {
    assignment(word).is_some_and(|(name, _)| name.eq_ignore_ascii_case("no_proxy"))
}

/// Words a shell reads before the program word of a simple command: reserved
/// words, and wrappers that run the word after their own options.
const WORDS_BEFORE_A_PROGRAM: &[&str] = &[
    "!", "{", "if", "then", "else", "elif", "do", "while", "until", "time", "env", "sudo", "doas",
    "exec", "command", "nohup", "builtin",
];

/// Where the command word of a simple command stands: after the
/// environment assignments, reserved words and wrappers written before it,
/// and the options of those wrappers.
fn command_word_position(words: &[String]) -> usize {
    let mut wrapped = false;
    words
        .iter()
        .position(|word| {
            let before_the_program = WORDS_BEFORE_A_PROGRAM
                .contains(&program_name(&without_quoting(word)))
                || assignment(word).is_some()
                || (wrapped && word.starts_with('-'));
            wrapped |= before_the_program;
            !before_the_program
        })
        .unwrap_or(words.len())
}

fn without_quoting(word: &str) -> String {
    word.replace(['\'', '"', '\\'], "")
}

/// Whether a `no_proxy` value written in `command` can come back as a
/// destination. The name, once quotes and backslashes are dropped, appears
/// anywhere other than as an assignment before a command word (as
/// `--variable %NO_PROXY` or `$no_proxy` read it), or the command expands
/// something and can build the name while it runs: an indirect expansion
/// `${!name}`, a `$` or backquote handed on for a program to expand (see
/// [`hands_on_an_expansion`]), or a program that reads its environment by a
/// name it is given (see [`reads_its_environment`]).
///
/// An expansion elsewhere in the command cannot read the value: the shell
/// expands it before the assignment reaches the one program it is written
/// for. An assignment with no command word sets a shell variable every later
/// expansion reads, so it is not counted as listing proxy exclusions.
fn no_proxy_is_read_back(command: &str) -> bool {
    let mentions = without_quoting(command)
        .to_ascii_lowercase()
        .matches("no_proxy")
        .count();
    let carrying: Vec<(Vec<String>, usize)> = super::split_segments(command)
        .iter()
        .map(|segment| {
            let words: Vec<String> = segment.split_whitespace().map(str::to_string).collect();
            let program = command_word_position(&words);
            (words, program)
        })
        .filter(|(words, program)| {
            *program < words.len() && words[..*program].iter().any(|word| names_no_proxy(word))
        })
        .collect();
    let listed: usize = carrying
        .iter()
        .map(|(words, program)| {
            words[..*program]
                .iter()
                .filter(|word| names_no_proxy(word))
                .count()
        })
        .sum();
    mentions > listed
        || (command.contains(['$', '`'])
            && (command.contains("${!")
                || hands_on_an_expansion(command)
                || carrying
                    .iter()
                    .any(|(words, program)| reads_its_environment(&words[*program..]))))
}

/// Whether `command` hands a program a `$` or backquote to expand itself:
/// one inside single quotes, one after a backslash, or a `$'...'` string,
/// whose escapes can spell one.
fn hands_on_an_expansion(command: &str) -> bool {
    let (mut single, mut double, mut escaped) = (false, false, false);
    let mut chars = command.chars().peekable();
    while let Some(c) = chars.next() {
        if escaped {
            if matches!(c, '$' | '`') {
                return true;
            }
            escaped = false;
            continue;
        }
        match c {
            '\\' if !single => escaped = true,
            '\'' if !double => single = !single,
            '"' if !single => double = !double,
            '$' | '`' if single => return true,
            '$' if !double && chars.peek() == Some(&'\'') => return true,
            _ => {}
        }
    }
    false
}

/// Programs that run a script or print their environment, so read a
/// variable by a name built while they run.
const ENVIRONMENT_READERS: &[&str] = &[
    "sh", "bash", "zsh", "dash", "ksh", "mksh", "fish", "busybox", "eval", "source", "env",
    "printenv", "envsubst", "perl", "ruby", "node", "deno", "bun", "php", "lua", "awk", "gawk",
    "mawk", "nawk", "make", "gmake", "pwsh",
];

/// Whether the simple command `command`, from its program word on, may read
/// an environment variable by a name built at run time: its program word is
/// filled in by the shell, any of its words names a program in
/// [`ENVIRONMENT_READERS`] or a Python, or it runs curl, which imports a
/// variable through `--variable %NAME` and a config file, with an expansion,
/// a `%` or a config option in it.
fn reads_its_environment(command: &[String]) -> bool {
    let program_filled_in = command
        .first()
        .is_some_and(|program| without_quoting(program).contains(FILLED_IN_BY_THE_SHELL));
    let names_a_reader = command.iter().any(|word| {
        shell_pieces(word).any(|piece| {
            let name = program_name(&piece);
            ENVIRONMENT_READERS.contains(&name) || name.starts_with("python")
        })
    });
    let curl_imports = runs_curl(command)
        && command.iter().any(|word| {
            let text = without_quoting(word).to_ascii_lowercase();
            text.contains(['$', '`', '%'])
                || text.starts_with("--conf")
                || text.starts_with("--expand-conf")
                || (word.starts_with('-') && !word.starts_with("--") && word.contains('K'))
        });
    program_filled_in || names_a_reader || curl_imports
}

/// What an assignment word `NAME=value` names: its value read as a
/// destination, as `--variable` and an exported variable hand it on, and the
/// value of a proxy variable judged as the proxy every request goes through.
/// A `no_proxy` assignment that `lists_proxy_exclusions`, standing before
/// the command word in a command that never reads it back (see
/// [`no_proxy_is_read_back`]), lists hosts reached without the proxy, each
/// still judged as the URL that names it, so its value is not a destination.
fn assigned_destination(
    word: &str,
    names_an_owner: bool,
    lists_proxy_exclusions: bool,
) -> Option<String> {
    let (name, value) = assignment(word)?;
    if lists_proxy_exclusions && name.eq_ignore_ascii_case("no_proxy") {
        return None;
    }
    if PROXY_VARIABLES
        .iter()
        .any(|variable| variable.eq_ignore_ascii_case(name))
    {
        return proxy_target(value);
    }
    internal_destination_in(value, names_an_owner)
}

/// The internal host `word` names in any of its readings. A scheme found
/// later in the word does not replace the scheme-less reading of its start:
/// curl reads a scheme only at the start, so it fetches
/// `127.0.0.1:6379/gopher:/x` from 127.0.0.1.
fn internal_destination_in(word: &str, names_an_owner: bool) -> Option<String> {
    let readings: Vec<&str> = after_scheme(word)
        .into_iter()
        .chain(curl_readings(word))
        .collect();
    let scheme_less = || {
        host_of_authority(word.split(['/', '?', '#']).next().unwrap_or_default())
            .filter(|host| is_internal_host(host) || (!names_an_owner && names_dotless_zero(word)))
            .map(str::to_string)
    };
    if readings.is_empty() {
        return scheme_less();
    }
    readings
        .into_iter()
        .find_map(|rest| internal_authority(rest.split(['/', '?', '#']).next().unwrap_or_default()))
        .or_else(|| whatwg_host(word).filter(|host| is_internal_url_host(host)))
        .or_else(scheme_less)
}

/// The authority when its host is filled in at run time, or its host when
/// that is internal.
fn internal_authority(authority: &str) -> Option<String> {
    if dynamic_authority(authority) {
        return Some(authority.to_string());
    }
    host_of_authority(authority)
        .filter(|host| is_internal_url_host(host))
        .map(str::to_string)
}

/// Where a curl option sends the connection in place of the URL's host.
#[derive(Clone, Copy)]
enum Redirect {
    Proxy,
    ConnectTo,
    Resolve,
    UnixSocket,
    Interface,
}

const REDIRECTING_OPTIONS: &[(&str, Redirect)] = &[
    ("proxy", Redirect::Proxy),
    ("proxy1.0", Redirect::Proxy),
    ("preproxy", Redirect::Proxy),
    ("socks4", Redirect::Proxy),
    ("socks4a", Redirect::Proxy),
    ("socks5", Redirect::Proxy),
    ("socks5-hostname", Redirect::Proxy),
    ("doh-url", Redirect::Proxy),
    ("connect-to", Redirect::ConnectTo),
    ("resolve", Redirect::Resolve),
    ("unix-socket", Redirect::UnixSocket),
    ("abstract-unix-socket", Redirect::UnixSocket),
    ("interface", Redirect::Interface),
];

/// What the long option `name`, written without its `--`, redirects. In a
/// segment that runs curl the name is also read as curl reads it: with a
/// leading `expand-` or `no-` dropped, and, as older curl releases did, as
/// any prefix of an option name in any case. No other curl option is such a
/// prefix, so the wider reading only refuses spellings curl rejects.
fn redirect_of(name: &str, runs_curl: bool) -> Option<Redirect> {
    let exact = REDIRECTING_OPTIONS
        .iter()
        .find(|(option, _)| *option == name)
        .map(|(_, redirect)| *redirect);
    if exact.is_some() || !runs_curl {
        return exact;
    }
    let name = name.to_ascii_lowercase();
    let name = ["expand-", "no-"]
        .iter()
        .find_map(|prefix| name.strip_prefix(*prefix))
        .unwrap_or(&name);
    if name.is_empty() {
        return None;
    }
    REDIRECTING_OPTIONS
        .iter()
        .find(|(option, _)| option.starts_with(name))
        .map(|(_, redirect)| *redirect)
}

/// curl's short options that take a value, which ends a bundle such as
/// `-sSo`: what follows in the word is that option's value.
const CURL_SHORT_OPTIONS_WITH_A_VALUE: &str = "AbcCdDeEFHKmoPQrtTuUwXyYz";

/// The value of curl's `-x` in `word`, alone (`-x`, then `next`), with the
/// value attached (`-xhost:port`) or at the end of a bundle (`-sSx`).
fn short_proxy_value<'a>(word: &'a str, next: Option<&'a str>) -> Option<&'a str> {
    let flags = word
        .strip_prefix('-')
        .filter(|flags| !flags.starts_with('-'))?;
    for (at, flag) in flags.char_indices() {
        if flag == 'x' {
            let attached = &flags[at + 1..];
            return if attached.is_empty() {
                next
            } else {
                Some(attached)
            };
        }
        if CURL_SHORT_OPTIONS_WITH_A_VALUE.contains(flag) {
            return None;
        }
    }
    None
}

/// The first target an option in `words` sends the connection to that is
/// internal or cannot be read, written `--opt value` or `--opt=value`, and
/// in a segment that runs curl also `-x value`, `-xvalue` or `-sSx value`
/// and the long spellings [`redirect_of`] reads. A Unix socket is always on
/// this machine.
fn redirected_destination(words: &[String], runs_curl: bool) -> Option<String> {
    words.iter().enumerate().find_map(|(index, word)| {
        let next = words.get(index + 1).map(String::as_str);
        let (redirect, value) = if let Some(long) = word.strip_prefix("--") {
            let (option, attached) = match long.split_once('=') {
                Some((option, value)) => (option, Some(value)),
                None => (long, None),
            };
            (redirect_of(option, runs_curl)?, attached.or(next)?)
        } else if runs_curl {
            (Redirect::Proxy, short_proxy_value(word, next)?)
        } else {
            return None;
        };
        redirected_target(redirect, value)
    })
}

/// Whether a segment may run curl: any of its words, or any piece of a word
/// between blanks and shell punctuation (see [`shell_pieces`]), names curl
/// once quotes and backslashes are dropped, as in `true;curl`, `curl>/dev/null`,
/// `$(which curl)` and `{curl,}`.
///
/// Every word of such a segment is read with curl's option rules. Where the
/// curl command ends inside a quoted body cannot be told from its words: the
/// operands after `sh -c '...' sh` reach curl as `"$@"`. So another program's
/// option in the same segment that looks like a redirecting one is refused.
fn runs_curl(words: &[String]) -> bool {
    words
        .iter()
        .any(|word| shell_pieces(word).any(|piece| program_name(&piece) == "curl"))
}

/// The pieces of `word` between blanks and the punctuation a shell ends a
/// program word on or expands around, with quotes and backslashes dropped.
fn shell_pieces(word: &str) -> impl Iterator<Item = String> + '_ {
    word.split(|c: char| {
        c.is_whitespace()
            || matches!(
                c,
                ';' | '&' | '|' | '(' | ')' | '{' | '}' | ',' | '<' | '>' | '`' | '$'
            )
    })
    .map(without_quoting)
}

/// Characters that leave a word's text to the shell to fill in: an
/// expansion, a glob or a brace list.
const FILLED_IN_BY_THE_SHELL: [char; 7] = ['$', '`', '*', '?', '[', '{', '}'];

/// How deep [`runs_a_filled_in_program`] reads quoted scripts inside quoted
/// scripts before taking the innermost for one that may run curl.
const QUOTED_SCRIPT_DEPTH: usize = 8;

/// Whether `script`, or a quoted script one of its words holds, starts a
/// command whose program word the shell fills in, such as `$C`, `"${C}"`,
/// `cu?l` or `{cu,}rl`. Such a word can run curl without naming it, so the
/// segment is read with curl's option rules.
fn runs_a_filled_in_program(script: &str, depth: usize) -> bool {
    if depth >= QUOTED_SCRIPT_DEPTH {
        return true;
    }
    let program_filled_in = command_texts(script).into_iter().any(|text| {
        let words: Vec<String> = text.split_whitespace().map(str::to_string).collect();
        words
            .get(command_word_position(&words))
            .is_some_and(|word| {
                let program = without_quoting(word);
                !matches!(program.as_str(), "[" | "[[" | "}")
                    && program.contains(FILLED_IN_BY_THE_SHELL)
            })
    });
    program_filled_in
        || shlex::split(script)
            .unwrap_or_default()
            .iter()
            .filter(|word| word.contains(char::is_whitespace))
            .any(|quoted| runs_a_filled_in_program(quoted, depth + 1))
}

/// The text of each command `script` starts: from its start, and after
/// `;`, `&`, `|`, `(`, a newline or an opening backquote, to the next of
/// those or a `)` or closing backquote. What follows a `)` or a closing
/// backquote continues the command around it.
fn command_texts(script: &str) -> Vec<&str> {
    let mut texts = Vec::new();
    let mut start = Some(0);
    let mut backquote_opens = true;
    for (at, c) in script.char_indices() {
        if !matches!(c, ';' | '&' | '|' | '(' | ')' | '\n' | '`') {
            continue;
        }
        if let Some(from) = start {
            texts.push(&script[from..at]);
        }
        start = match c {
            ')' => None,
            '`' => {
                let opens = backquote_opens;
                backquote_opens = !opens;
                opens.then_some(at + 1)
            }
            _ => Some(at + 1),
        };
    }
    if let Some(from) = start {
        texts.push(&script[from..]);
    }
    texts
}

fn redirected_target(redirect: Redirect, value: &str) -> Option<String> {
    let filled_in_at_run_time = value.contains(['$', '`', '{', '}']);
    match redirect {
        Redirect::UnixSocket => Some(format!("the Unix socket {value}")),
        Redirect::Proxy => proxy_target(value),
        _ if filled_in_at_run_time => Some(value.to_string()),
        Redirect::ConnectTo => connect_to_target(value),
        Redirect::Resolve => resolve_target(value),
        Redirect::Interface => interface_target(value),
    }
}

/// A proxy or DoH server, `[scheme://]host[:port]`: a URL when it has a
/// scheme, an authority when it has none.
fn proxy_target(value: &str) -> Option<String> {
    if after_scheme(value).is_some() || curl_readings(value).next().is_some() {
        return internal_destination_in(value, false);
    }
    internal_authority(value.split(['/', '?', '#']).next().unwrap_or_default())
}

/// `HOST1:PORT1:HOST2:PORT2` connects to HOST2. Where HOST1 ends depends on
/// the URL's host, so the host after every `:` is judged.
fn connect_to_target(value: &str) -> Option<String> {
    value.match_indices(':').find_map(|(colon, _)| {
        let rest = &value[colon + 1..];
        let host = match rest.strip_prefix('[') {
            Some(inner) => inner.split(']').next().unwrap_or(inner),
            None => rest.split(':').next().unwrap_or(rest),
        };
        (!host.is_empty() && is_internal_url_host(host)).then(|| host.to_string())
    })
}

/// `[+]HOST:PORT:ADDR[,ADDR]...` connects to the addresses, and `-HOST:PORT`
/// removes an entry. HOST may be an IPv6 address, so the list after every
/// `:` is judged.
fn resolve_target(value: &str) -> Option<String> {
    if value.starts_with('-') {
        return None;
    }
    value.match_indices(':').find_map(|(colon, _)| {
        value[colon + 1..]
            .split(',')
            .map(|address| address.trim_start_matches('[').trim_end_matches(']'))
            .find(|address| !address.is_empty() && is_internal_url_host(address))
            .map(str::to_string)
    })
}

/// `--interface` binds to an interface by name (`eth0`, `if!eth0`) or to an
/// address (`127.0.0.1`, `host!127.0.0.1`, `ifhost!eth0!127.0.0.1`); only an
/// address is judged.
fn interface_target(value: &str) -> Option<String> {
    if value.starts_with("if!") {
        return None;
    }
    let address = match (value.strip_prefix("host!"), value.strip_prefix("ifhost!")) {
        (Some(address), _) => address,
        (_, Some(rest)) => rest.split_once('!').map_or(rest, |(_, address)| address),
        _ => value,
    };
    is_internal_url_host(address).then(|| address.to_string())
}

/// Whether a word with no scheme is `0:3000`, `0/admin` or another dotless
/// spelling of 0.0.0.0 followed by a port or a path, query or fragment,
/// which curl fetches as `http://0.0.0.0:3000/`. A bare `0`, as in
/// `curl --retry 0`, and a port of 0, as in `chown 0:0`, are not read as one.
fn names_dotless_zero(word: &str) -> bool {
    let authority_end = word.find(['/', '?', '#']);
    let authority = &word[..authority_end.unwrap_or(word.len())];
    let host_and_port = authority.rsplit('@').next().unwrap_or_default();
    let (host, port) = match host_and_port.split_once(':') {
        Some((host, port)) => (host, Some(port)),
        None => (host_and_port, None),
    };
    let reaches_a_service = match port {
        Some(port) => port.parse::<u16>().is_ok_and(|port| port != 0),
        None => authority_end.is_some(),
    };
    reaches_a_service
        && inet_aton(&host.trim_end_matches('.').to_ascii_lowercase())
            .is_some_and(|v4| v4.is_unspecified())
}

/// The words of one reading of a segment, each also cut at redirection and
/// grouping characters a shell ends a word on, with the index of the word it
/// was cut from and whether that word names a user and group rather than a
/// destination.
fn destination_words(words: &[String]) -> Vec<(usize, String, bool)> {
    let owner = owner_position(words);
    words
        .iter()
        .enumerate()
        .flat_map(|(index, word)| {
            let names_an_owner = owner == Some(index);
            word.split(['<', '>', '(', ')'])
                .filter(|piece| !piece.is_empty())
                .map(move |piece| (index, piece.to_string(), names_an_owner))
        })
        .collect()
}

fn program_name(word: &str) -> &str {
    word.rsplit('/').next().unwrap_or(word)
}

/// Which word names a user and group, as `0:1000` does after `chown`. The
/// word is found by position and must be plain text, so a command
/// substitution in that place, or the same text elsewhere in the segment,
/// is still read as a destination. A word after `-u` or `--user` is not one:
/// that flag may itself be the value of an earlier option, as in
/// `curl -o -u 0:3000/admin`, which fetches from this machine.
fn owner_position(words: &[String]) -> Option<usize> {
    words
        .iter()
        .position(|word| !matches!(program_name(word), "sudo" | "doas") && !word.starts_with('-'))
        .filter(|program| program_name(&words[*program]) == "chown")
        .and_then(|program| {
            (program + 1..words.len()).find(|index| !words[*index].starts_with('-'))
        })
        .filter(|index| !words[*index].contains(['$', '`', '(', ')', '<', '>', '\'', '"', '\\']))
}

/// Whether a URL's host is one the shell or the program fills in at run
/// time: an expansion (`$H`, `` `cmd` ``), a brace list or a curl range. No
/// check can read the destination such a word reaches. The authority is
/// read whole, as curl reads it, and cut at a backslash, as a WHATWG client
/// does.
fn dynamic_authority(authority: &str) -> bool {
    let cut = authority.split('\\').next().unwrap_or(authority);
    [authority, cut]
        .iter()
        .any(|reading| reading_is_dynamic(reading.rsplit('@').next().unwrap_or_default()))
}

fn reading_is_dynamic(host_and_port: &str) -> bool {
    match host_and_port.strip_prefix('[') {
        Some(inner) => inner
            .split_once(']')
            .map(|(literal, _)| literal.split('%').next().unwrap_or(literal))
            .is_some_and(|address| address.parse::<std::net::Ipv6Addr>().is_err()),
        None => host_and_port
            .split(':')
            .next()
            .is_some_and(|host| host.contains(['$', '`', '{', '}', '[', ']'])),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        internal_destination, internal_destination_in, is_internal_host, INTERNAL_HOST_NAMES,
    };
    use crate::safety::argv::parse_simple_command;

    #[test]
    fn every_displayed_name_is_one_the_predicate_actually_refuses() {
        for name in INTERNAL_HOST_NAMES {
            assert!(is_internal_host(name), "displayed but not refused: {name}");
        }
    }

    #[test]
    fn loopback_link_local_and_metadata_hosts_are_internal() {
        for host in [
            "localhost",
            "api.localhost",
            "LOCALHOST",
            "127.0.0.1",
            "127.1.2.3",
            "0.0.0.0",
            "::1",
            "[::1]",
            "169.254.169.254",
            "metadata.google.internal",
            "100.100.100.200",
            "fd00:ec2::254",
            // 127.0.0.1 written as one integer.
            "2130706433",
            "0x7f000001",
            "0177.0.0.1",
            "127.1",
            "localhost.",
            "::ffff:127.0.0.1",
            "[::ffff:169.254.169.254]",
            "fe80::1",
        ] {
            assert!(is_internal_host(host), "should be internal: {host}");
        }
    }

    #[test]
    fn public_hosts_are_not_internal() {
        for host in [
            "example.com",
            "api.github.com",
            "8.8.8.8",
            "registry.npmjs.org",
            "169.255.0.1",
            "1270.0.0.1",
            "0",
            "10",
            "08.0.0.1",
            "::ffff:8.8.8.8",
        ] {
            assert!(!is_internal_host(host), "should be external: {host}");
        }
    }

    #[test]
    fn a_host_is_read_out_of_the_shapes_a_command_line_uses() {
        for (word, host) in [
            ("http://user:pw@127.0.0.1:8080/x", "127.0.0.1"),
            ("http://[::1]:9200/_shutdown", "::1"),
            ("localhost:443", "localhost"),
            ("u:p@169.254.169.254/latest/meta-data", "169.254.169.254"),
            ("[::1]:9200/_cat?v", "::1"),
            ("127.0.0.1#top", "127.0.0.1"),
        ] {
            assert_eq!(
                internal_destination_in(word, false).as_deref(),
                Some(host),
                "{word}"
            );
        }
        for word in [
            "https://example.com/a/b",
            "example.com:443",
            "u:p@example.com/x",
            "--silent",
            "",
        ] {
            assert_eq!(internal_destination_in(word, false), None, "{word}");
        }
    }

    #[test]
    fn a_command_reports_the_internal_destination_it_names() {
        assert_eq!(
            internal_destination("curl -s http://169.254.169.254/latest/meta-data/"),
            Some("169.254.169.254".to_string())
        );
        assert_eq!(
            internal_destination("curl https://api.example.com && curl http://localhost:3000"),
            Some("localhost".to_string())
        );
        assert_eq!(
            internal_destination("curl https://api.example.com/v1/models"),
            None
        );
    }

    #[test]
    fn the_check_reads_the_operand_the_direct_launch_executes() {
        assert_eq!(
            parse_simple_command("curl http://12'7.0.0.1':3000/"),
            Some((
                "curl".to_string(),
                vec!["http://127.0.0.1:3000/".to_string()]
            ))
        );
        assert_eq!(
            internal_destination("curl http://12'7.0.0.1':3000/"),
            Some("127.0.0.1".to_string())
        );
        for command in [
            "curl http://12'7.0.0.1':3000/",
            "curl \"http://local\"host:3000",
            "curl 'http://[::1]:9200/_shutdown'",
            "wget http://0x7f'000001'/",
            "curl 'http://169.254.169.254'/latest/meta-data/",
        ] {
            let (_, args) = parse_simple_command(command).expect("direct argv launch");
            assert!(
                args.iter()
                    .any(|arg| internal_destination_in(arg, false).is_some()),
                "the executed argv names an internal host: {command}"
            );
            assert!(
                internal_destination(command).is_some(),
                "admitted a destination the launch reaches: {command}"
            );
        }
    }

    #[test]
    fn the_check_reads_what_the_shell_hands_the_program() {
        for command in [
            "curl http://local\\host/",
            "curl \"http://127.0.0.1\":8080/",
            "curl http://localhost>out.txt",
            "curl -s http://[::1%25lo]:9200/",
            "curl https://example.com && curl http://12'7.0.0.1':3000/",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
    }

    #[test]
    fn an_authority_with_a_backslash_is_refused_when_either_reading_is_internal() {
        for command in [
            "curl 'http://127.0.0.1\\@public.example/'",
            "curl 'http://public.example\\@127.0.0.1/'",
            "curl 'https://public.example\\@169.254.169.254/latest/meta-data/'",
            "curl 'https://169.254.169.254\\@public.example/'",
            "curl http://127.0.0.1\\@public.example/",
            "wget 'ws://localhost\\@public.example/'",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
        assert_eq!(
            internal_destination("curl 'http://127.0.0.1\\@public.example/'"),
            Some("127.0.0.1".to_string())
        );
        assert!(
            internal_destination("npm install 'http://127.0.0.1\\pkg.tgz'").is_some(),
            "npm fetches http://127.0.0.1/pkg.tgz"
        );
        assert_eq!(
            internal_destination("curl 'https://example.com/a\\b?x=http://y\\z'"),
            None
        );
        for command in [
            "curl 'http://public.example\\@other.example/'",
            "curl -s https://x.example | sed 's|https://\\(www\\.\\)\\?||'",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn a_dotless_zero_in_a_url_is_this_machine() {
        for command in [
            "curl http://0:3000/admin",
            "curl http://0x0:3000/",
            "curl http://00:3000/",
            "curl HTTP://0/",
            "npm install http://0:8080/x.tgz",
            "curl 0:3000/admin",
            "curl http://0%30:3000/",
            "curl 'http://%6c%6fcalhost:3000/'",
            "curl 'http://127.0.0.%gg/'",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
        for command in [
            "curl --retry 0 https://example.com/",
            "curl -m 0 https://example.com/",
            "chown 0:0 out && curl https://example.com/",
            "curl 'https://example.com/a%20b'",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn a_dotless_zero_with_no_scheme_or_port_is_this_machine() {
        for command in [
            "curl 0/admin",
            "curl 0x0/",
            "wget 0/",
            "curl 00?x=1",
            "curl 0#top",
            "curl u:p@0/admin",
            "curl 0./admin",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
        for command in [
            "curl --retry 0 https://example.com/",
            "curl -o out/0 https://example.com/",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn a_user_and_group_pair_is_not_a_destination() {
        for command in [
            "chown -R 0:1000 build && curl -fsSL https://example.com/x -o build/x",
            "npm install && chown -R 0:20 node_modules",
            "npm install && /usr/bin/chown 0:20 node_modules",
            "npm install && sudo -n chown -R 0:20 node_modules",
            "curl https://example.com/x -o x && sudo chown 0:1000 x",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
        for command in [
            "curl -o chown 0:3000/admin",
            "curl 0:1000/admin && chown 0:1000 x",
            "chown 0:1000 x; curl 0:3000/",
            "chown 0:1000 x $(curl 0:3000)",
            "curl -u 0:3000 0:3000",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
    }

    #[test]
    fn a_word_after_a_user_flag_is_still_read_as_a_destination() {
        for command in [
            "curl -o -u 0:3000/admin",
            "curl -H --user 0:8080/",
            "curl -A -u 0:3000/",
            "curl -e --user 0x0:3000/",
            "curl -u 0:1000 https://example.com/",
            "curl https://example.com/x && docker run -u 0:1000 img",
            "curl https://example.com/x && docker run --user 0:1000 img",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
        assert_eq!(
            internal_destination("curl -u app:EXAMPLE https://example.com/"),
            None
        );
    }

    #[test]
    fn a_curl_scheme_written_with_one_to_three_slashes_names_its_host() {
        for command in [
            "curl gopher:/127.0.0.1:6379/_INFO",
            "curl 'dict:///localhost:11211/stat'",
            "curl ftps:/127.0.0.1/",
            "curl GOPHER://127.0.0.1:6379/_x",
            "curl ldap:///169.254.169.254/",
            "curl telnet:/0:23",
            "curl 'smb://[::1]/share'",
            "curl gopher:/127.0.0.1:6379/_http://example.com/",
            "curl sftp://localhost/etc/passwd",
            "curl 'imaps:/$HOST/INBOX'",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
        assert_eq!(
            internal_destination("curl 'dict:///localhost:11211/stat'"),
            Some("localhost".to_string())
        );
        for command in [
            "curl gopher://gopher.example/",
            "curl dict:/dict.example/d:word",
            "curl 'ldap:///dc=example,dc=com'",
            "curl -T file sftp://files.example/upload/",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn an_option_that_moves_the_connection_is_judged_as_a_target() {
        for (command, target) in [
            (
                "curl --connect-to ::127.0.0.1:3000 https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --connect-to=example.com:443:localhost:3000 https://example.com/",
                "localhost",
            ),
            (
                "curl --connect-to 'example.com:443:[::1]:3000' https://example.com/",
                "::1",
            ),
            (
                "curl --connect-to '[2001:db8::1]:443:0:3000' 'https://[2001:db8::1]/'",
                "0",
            ),
            (
                "curl --resolve example.com:443:127.0.0.1 https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --resolve=+example.com:443:93.184.216.34,[::1] https://example.com/",
                "::1",
            ),
            (
                "curl --unix-socket /var/run/docker.sock http://x/containers/json",
                "the Unix socket /var/run/docker.sock",
            ),
            (
                "curl --abstract-unix-socket=docker http://x/",
                "the Unix socket docker",
            ),
            (
                "curl -x socks5h:/127.0.0.1:1080 https://example.com/",
                "127.0.0.1",
            ),
            ("curl -x127.0.0.1:8080 https://example.com/", "127.0.0.1"),
            ("curl -sSxlocalhost:3128 https://example.com/", "localhost"),
            ("curl -sS -x 0:8080 https://example.com/", "0"),
            (
                "curl --proxy=localhost:3128 https://example.com/",
                "localhost",
            ),
            ("curl --proxy1.0 127.1 https://example.com/", "127.1"),
            (
                "curl --preproxy socks5:/169.254.169.254 https://example.com/",
                "169.254.169.254",
            ),
            ("curl --socks5-hostname=0:9050 https://example.com/", "0"),
            ("curl --socks4a=127.1 https://example.com/", "127.1"),
            (
                "curl --doh-url=https://127.0.0.1/dns-query https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --interface host!127.0.0.1 https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --interface=ifhost!en0!localhost https://example.com/",
                "localhost",
            ),
            ("curl -x $PROXY https://example.com/", "$PROXY"),
            ("curl --resolve $PAIR https://example.com/", "$PAIR"),
            (
                "curl --connect-to ::$H:3000 https://example.com/",
                "::$H:3000",
            ),
            (
                "sh -c 'curl --unix-socket /var/run/docker.sock http://x/'",
                "the Unix socket /var/run/docker.sock",
            ),
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some(target),
                "{command}"
            );
        }
        for command in [
            "curl -x http://proxy.example:3128 https://example.com/",
            "curl --proxy proxy.example:3128 https://example.com/",
            "curl -x http://u:$PASS@proxy.example:3128 https://example.com/",
            "curl --resolve example.com:443:93.184.216.34 https://example.com/",
            "curl --resolve -example.com:443 https://example.com/",
            "curl --connect-to example.com:443:backend.example.com:8443 https://example.com/",
            "curl --connect-to ::backend.example.com: https://example.com/",
            "curl --interface en0 https://example.com/",
            "curl --interface if!lo0 https://example.com/",
            "curl -sSLo out.tgz https://example.com/a.tgz",
            "curl -Hx-api-key:abc https://example.com/",
            "curl -fsSL https://example.com/a.tgz -o a.tgz && tar -xzf $ARCHIVE",
            "curl -fsSL https://example.com/install.sh | bash -x -s -- --prefix $HOME",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn a_redirecting_option_in_any_spelling_curl_reads_is_judged_as_a_target() {
        for (command, target) in [
            (
                "curl --expand-unix-socket /var/run/docker.sock http://x/containers/json",
                "the Unix socket /var/run/docker.sock",
            ),
            (
                "curl --expand-abstract-unix-socket docker http://x/",
                "the Unix socket docker",
            ),
            (
                "curl --expand-connect-to ::127.0.0.1:3000 https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --expand-resolve example.com:443:127.0.0.1 https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --expand-proxy {{proxy}} https://example.com/",
                "{{proxy}}",
            ),
            (
                "curl --expand-resolve example.com:443:{{addr}} https://example.com/",
                "example.com:443:{{addr}}",
            ),
            (
                "curl --expand-interface=host!{{addr}} https://example.com/",
                "host!{{addr}}",
            ),
            (
                "curl --unix-sock /var/run/docker.sock http://x/",
                "the Unix socket /var/run/docker.sock",
            ),
            (
                "curl --Resolve example.com:443:127.0.0.1 https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --CONNECT-TO ::localhost:3000 https://example.com/",
                "localhost",
            ),
            (
                "curl --prox 127.0.0.1:8080 https://example.com/",
                "127.0.0.1",
            ),
            ("curl --socks5-h 0:9050 https://example.com/", "0"),
            (
                "curl --inter host!127.0.0.1 https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --doh=https://127.0.0.1/dns-query https://example.com/",
                "127.0.0.1",
            ),
            (
                "curl --no-proxy 127.0.0.1:8080 https://example.com/",
                "127.0.0.1",
            ),
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some(target),
                "{command}"
            );
        }
        for command in [
            "curl --expand-proxy http://proxy.example:3128 https://example.com/",
            "curl --expand-url 'https://example.com/{{path}}'",
            "curl --proxy-user u:p -x http://proxy.example:3128 https://example.com/",
            "curl --retry 3 --connect-timeout 5 https://example.com/",
            "curl --noproxy internal.example https://example.com/",
            "curl --no-buffer --compressed https://example.com/",
            "curl --expand-resolve example.com:443:93.184.216.34 https://example.com/",
            "pip install --pre $PKG",
            "npm install --res example.com:443:127.0.0.1",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn every_word_of_a_segment_that_runs_curl_is_read_with_curl_option_rules() {
        for command in [
            "curl -o a https://example.com/a && pip install --pre $PKG",
            "curl -o a https://example.com/a; pip install --pre $PKG",
            "pip install --pre $PKG && curl -o a https://example.com/a",
            "sh -c 'pip install --pre $PKG'",
            "sh -c 'echo curling;pip install --pre $PKG'",
            "sh -c 'curl -o a https://example.com/a'",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
        for command in [
            "sh -c 'curl -o a https://example.com/a && pip install --pre $PKG'",
            "bash -c \"curl -o a https://example.com/a && pip install --pre $PKG\"",
            "sh -c 'curl -o a https://example.com/a; pip install --pre $PKG'",
            "sh -c 'curl -H \"Accept: text/plain\" -o a https://example.com/a || pip install --pre $PKG'",
            "sh -c 'pip install --pre $PKG && curl -o a https://example.com/a'",
            "bash -lc 'curl -o a https://example.com/a && pip install --pre $PKG'",
            "/bin/sh -c 'curl -o a https://example.com/a && pip install --pre $PKG'",
            "sudo -n bash -e -c 'curl -o a https://example.com/a && pip install --pre $PKG'",
            "eval 'curl -o a https://example.com/a && pip install --pre $PKG'",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "a look-alike option in a segment that runs curl is refused: {command}"
            );
        }
        for (command, target) in [
            (
                "curl https://example.com/ && sh -c 'curl \"$@\" && true' sh --expand-unix-socket /var/run/docker.sock http://x/containers/json",
                "the Unix socket /var/run/docker.sock",
            ),
            (
                "curl https://example.com/ && sh -c 'curl $1 $2 $3; true' sh --expand-unix-socket /var/run/docker.sock http://x/",
                "the Unix socket /var/run/docker.sock",
            ),
            ("sh -c 'curl \"$@\" || true' sh -x $P https://example.com/", "$P"),
            (
                "sh -c 'curl -o a https://example.com/a && curl --pre $P https://example.com/'",
                "$P",
            ),
            (
                "sh -c 'curl -d \" && \" --expand-unix-socket /var/run/docker.sock http://x/'",
                "the Unix socket /var/run/docker.sock",
            ),
            (
                "sh -c 'echo \"a curl\" && curl -d \" && \" --expand-unix-socket /s http://x/'",
                "the Unix socket /s",
            ),
            (
                "sh -c '\"curl\" -d \" && \" --expand-unix-socket /s http://x/'",
                "the Unix socket /s",
            ),
            (
                "bash -c \"curl -H 'a && b' --expand-unix-socket /s http://x/\"",
                "the Unix socket /s",
            ),
            (
                "bash -c \"curl -d \\\"a && b\\\" --expand-unix-socket /s http://x/\"",
                "the Unix socket /s",
            ),
            (
                "bash -c \"curl -d $D && x --expand-unix-socket /s http://x/\"",
                "the Unix socket /s",
            ),
            (
                "sh -c 'curl $(printf x && echo y) --pre $X https://example.com/'",
                "$X",
            ),
            (
                "sh -c 'curl -d \\\" && \\\" --expand-unix-socket /s http://x/'",
                "the Unix socket /s",
            ),
            (
                "sh -c 'curl -o a https://example.com/a&&pip install --pre $P'",
                "$P'",
            ),
            (
                "curl -d '&&' --expand-unix-socket /s http://x/",
                "the Unix socket /s",
            ),
            ("curl -d ' && ' -x $P https://example.com/", "$P"),
            (
                "curl https://example.com/ && env -S 'curl -d && --expand-unix-socket /var/run/docker.sock http://x/containers/json'",
                "the Unix socket /var/run/docker.sock",
            ),
            (
                "perl -e 'exec qw( curl -d && --expand-unix-socket /s http://x/ )'",
                "the Unix socket /s",
            ),
            (
                "sh ./run.sh -c 'curl -d && --expand-unix-socket /s http://x/'",
                "the Unix socket /s",
            ),
            (
                "sh -c 'echo #\"\ncurl -d \" && \" --expand-unix-socket /s http://x/'",
                "the Unix socket /s",
            ),
            (
                "sh -c 'echo #\"\ncurl -d \" && \" -x $P https://example.com/'",
                "$P",
            ),
            (
                "bash -c 'curl -d @<(echo a && echo b) --expand-unix-socket /s http://x/'",
                "the Unix socket /s",
            ),
            (
                "bash -c 'curl -d $[1 && 2] --expand-proxy {{p}} https://example.com/'",
                "{{p}}",
            ),
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some(target),
                "{command}"
            );
        }
    }

    #[test]
    fn a_curl_word_glued_to_shell_punctuation_still_runs_curl() {
        assert_eq!(
            internal_destination(
                "curl https://example.com/ && sh -c 'true;curl --expand-unix-socket /var/run/docker.sock http://x/'"
            )
            .as_deref(),
            Some("the Unix socket /var/run/docker.sock")
        );
        for command in [
            "sh -c '(curl --expand-unix-socket /s http://x/)'",
            "sh -c 'x&&curl --unix-sock /s http://x/'",
            "sh -c 'false||curl --unix-sock /s http://x/'",
            "sh -c 'true|curl --unix-sock /s http://x/'",
            "sh -c '{curl --unix-sock /s http://x/;}'",
            "sh -c 'echo `curl --unix-sock /s http://x/`'",
            "sh -c 'echo $(curl --unix-sock /s http://x/)'",
            "sh -c 'true\ncurl --unix-sock /s http://x/'",
            "sh -c '\\curl --unix-sock /s http://x/'",
            "sh -c 'c\"u\"rl --unix-sock /s http://x/'",
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some("the Unix socket /s"),
                "{command}"
            );
        }
        assert_eq!(
            internal_destination("sh -c 'true;/usr/bin/curl -x $P https://example.com/'")
                .as_deref(),
            Some("$P")
        );
        assert_eq!(
            internal_destination(
                "curl https://example.com/ && sh -c 'curl>/dev/null --expand-unix-socket /var/run/docker.sock http://x/containers/json'"
            )
            .as_deref(),
            Some("the Unix socket /var/run/docker.sock")
        );
        for command in [
            "sh -c 'curl</dev/null --unix-sock /s http://x/'",
            "$(which curl) --unix-sock /s http://x/",
            "\"$(command -v curl)\" --unix-sock /s http://x/",
            "{curl,} --unix-sock /s http://x/",
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some("the Unix socket /s"),
                "{command}"
            );
        }
    }

    #[test]
    fn a_program_word_the_shell_fills_in_may_run_curl() {
        for command in [
            "C=curl; $C --unix-sock /s http://x/",
            "\"$X\" --unix-sock /s http://x/",
            "${C} --unix-sock /s http://x/",
            "A=1 $C --unix-sock /s http://x/",
            "sudo $C --unix-sock /s http://x/",
            "sh -c '$C --unix-sock /s http://x/'",
            "sh -c 'true; ${C} --unix-sock /s http://x/'",
            "bash -c \"sh -c '\\$C --unix-sock /s http://x/'\"",
            "/usr/bin/cu?l --unix-sock /s http://x/",
            "{cu,}rl --unix-sock /s http://x/",
            "$'\\x63url' --unix-sock /s http://x/",
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some("the Unix socket /s"),
                "{command}"
            );
        }
        for command in [
            "pip install --pre $PKG $(cat extra.txt) $MORE",
            "pip install --pre `cat extra.txt` $PKG",
            "pip install --pre \"$PKG\"",
            "[ -n \"$PKG\" ] && pip install --pre $PKG",
            "for p in $PKGS; do pip install --pre $p; done",
            "sh -c 'pip install --pre \"$PKG\"'",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn an_assignment_is_read_from_its_value_and_a_proxy_variable_as_a_proxy() {
        for (command, target) in [
            (
                "ALL_PROXY=127.0.0.1:1080 curl https://example.com/",
                "127.0.0.1",
            ),
            ("https_proxy=localhost:3128 npm install", "localhost"),
            ("HTTP_PROXY=0:8080 curl http://example.com/", "0"),
            ("Ftp_Proxy=[::1]:21 curl ftp://example.com/f", "::1"),
            (
                "env all_proxy='127.1:1080' curl https://example.com/",
                "127.1",
            ),
            (
                "export HTTPS_PROXY=socks5h://127.0.0.1:1080 && curl https://example.com/",
                "127.0.0.1",
            ),
            (
                "HTTPS_PROXY=$CORP_PROXY curl https://example.com/",
                "$CORP_PROXY",
            ),
            ("all_proxy=%zz:1080 curl https://example.com/", "%zz"),
            (
                "sh -c 'ALL_PROXY=127.0.0.1:1080 curl https://example.com/'",
                "127.0.0.1",
            ),
            (
                "curl --variable h=127.0.0.1:3000 --expand-url '{{h}}/admin'",
                "127.0.0.1",
            ),
            (
                "DOCKER_HOST=localhost:2375 curl https://example.com/",
                "localhost",
            ),
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some(target),
                "{command}"
            );
        }
        for command in [
            "HTTPS_PROXY=http://proxy.example:3128 curl https://example.com/",
            "https_proxy=proxy.example:3128 curl https://example.com/",
            "http_proxy= curl http://example.com/",
            "NODE_ENV=production PORT=3000 npm install",
            "FOO=$BAR curl https://example.com/",
            "make CFLAGS=-O2 VERSION=1.0",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn a_proxy_exclusion_list_is_not_a_destination() {
        for command in [
            "NO_PROXY=localhost curl https://example.com/",
            "no_proxy=127.0.0.1 npm install",
            "env No_Proxy=localhost:3000 curl https://example.com/",
            "NO_PROXY=localhost,127.0.0.1 no_proxy=localhost,127.0.0.1 curl https://example.com/",
            "curl https://example.com/ && NO_PROXY=localhost npm install",
            "pnpm install && NO_PROXY=localhost,127.0.0.1 pnpm test -- --port $PORT",
            "curl -fsSL https://example.com/a -o a && NO_PROXY=localhost npm install && echo \"$?\"",
            "NO_PROXY=localhost npm install --prefix \"$HOME/app\"",
            "env -i NO_PROXY=localhost curl https://example.com/",
            "sudo NO_PROXY=localhost curl https://example.com/",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
        assert_eq!(
            internal_destination("NO_PROXY=localhost curl http://localhost:3000/").as_deref(),
            Some("localhost")
        );
    }

    #[test]
    fn a_no_proxy_value_the_command_can_read_back_is_a_destination() {
        for (command, target) in [
            (
                "curl --variable no_proxy=127.0.0.1:6379 --expand-url '{{no_proxy}}/admin'",
                "127.0.0.1",
            ),
            (
                "curl --variable NO_PROXY=127.0.0.1:6379 https://example.com/",
                "127.0.0.1",
            ),
            (
                "NO_PROXY=127.0.0.1:6379 curl --variable %NO_PROXY --expand-url '{{NO_PROXY}}/'",
                "127.0.0.1",
            ),
            (
                "NO_PROXY=127.0.0.1:6379 curl --variable %NO_PRO\"\"XY --expand-url {{NO_PRO''XY}}/",
                "127.0.0.1",
            ),
            (
                "env NO_PROXY=127.0.0.1:6379 sh -c 'curl $NO_PROXY/'",
                "127.0.0.1",
            ),
            (
                "NO_PROXY=127.0.0.1:6379 bash -c 'v=NO_PRO; v=${v}XY; curl ${!v}/'",
                "127.0.0.1",
            ),
            (
                "export NO_PROXY=localhost && curl https://example.com/",
                "localhost",
            ),
            (
                "NO_PROXY=127.0.0.1:6379; curl https://example.com/",
                "127.0.0.1",
            ),
            (
                "X=XY; NO_PROXY=127.0.0.1:6379 sh -c \"curl \\$NO_PRO$X/\"",
                "127.0.0.1",
            ),
            (
                "X=XY; NO_PROXY=127.0.0.1:6379 curl --variable %NO_PRO$X --expand-url \"{{NO_PRO$X}}/\"",
                "127.0.0.1",
            ),
            (
                "P=--variable; X=%NO_PRO; NO_PROXY=127.0.0.1:6379 curl $P ${X}XY https://example.com/",
                "127.0.0.1",
            ),
            (
                "printf 'variable %%NO_PRO%s\\nexpand-url \"{{NO_PRO%s}}/\"\\n' $X $X | NO_PROXY=127.0.0.1:6379 curl -K -",
                "127.0.0.1",
            ),
            (
                "D=$(printf '\\x24'); NO_PROXY=127.0.0.1:6379 pnpm exec sh -c \"curl ${D}NO_PRO${X}XY/\"",
                "127.0.0.1",
            ),
            (
                "NO_PROXY=127.0.0.1:6379 python3 -c \"import os;print(os.environ['NO_PRO'+'$X'])\" | xargs -I@ curl http://@/",
                "127.0.0.1",
            ),
            (
                "NO_PROXY=127.0.0.1:6379 bash -c 'curl $(printenv | grep 6379 | cut -d= -f2)/'",
                "127.0.0.1",
            ),
            (
                "NO_PROXY=127.0.0.1:6379 $RUN https://example.com/",
                "127.0.0.1",
            ),
            (
                "NO_PROXY=localhost curl -o \"$OUT\" https://example.com/",
                "localhost",
            ),
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some(target),
                "{command}"
            );
        }
    }

    #[test]
    fn a_scheme_inside_a_word_does_not_hide_the_host_the_word_starts_with() {
        for (command, target) in [
            ("curl 127.0.0.1:6379/gopher:/x", "127.0.0.1"),
            ("curl 'localhost:8080/admin?next=dict:/x'", "localhost"),
            (
                "curl 'localhost:8080/admin?next=http://example.com/'",
                "localhost",
            ),
            ("curl 0:3000/http:/x", "0"),
            (
                "curl 169.254.169.254/latest/meta-data?u=ldap:///x",
                "169.254.169.254",
            ),
            ("curl '[::1]:9200/_cat?u=https:x'", "::1"),
        ] {
            assert_eq!(
                internal_destination(command).as_deref(),
                Some(target),
                "{command}"
            );
        }
        for command in [
            "curl 'example.com/login?next=dict:/x'",
            "curl 'https://example.com/?next=http://example.org/'",
            "curl 'example.com:8080/a?u=gopher://gopher.example/'",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn a_url_written_with_one_slash_or_none_is_read_like_one_with_two() {
        for command in [
            "npm install http:127.0.0.1:8080/pkg.tgz",
            "npm install 'http:\\\\169.254.169.254/latest'",
            "npm install 'http:/\\169.254.169.254/x'",
            "curl http:/127.0.0.1:9/x",
            "curl http:///127.0.0.1:9/",
            "curl 'http://\\127.0.0.1/'",
            "pnpm add HTTPS:127.1/pkg.tgz",
            "yarn add ws:localhost/x",
            "npm install --registry=http:127.0.0.1:4873/ left-pad",
            "npm install http://127.0.0.1./pkg.tgz",
            "npm install 'http://\u{24db}ocalhost/pkg.tgz'",
            "npm install 'https:169.254.169.254://u@public.example/'",
            "curl 'http://[::ffff:7f00:1]:3000/'",
            "curl http://0177.1:3000/",
            "curl http://0x7f.1:3000/",
        ] {
            assert!(
                internal_destination(command).is_some(),
                "should be refused: {command}"
            );
        }
        assert_eq!(
            internal_destination("npm install http:$HOST/pkg.tgz"),
            Some("$HOST".to_string())
        );
        for command in [
            "npm install https:registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz",
            "git clone git@github.com:acme/app.git",
            "curl -H 'Content-Type: application/json' https://api.example.com/",
            "curl -d url=https:api.example.com https://api.example.com/",
            "pip install news:example",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn quoted_public_destinations_are_still_admitted() {
        for command in [
            "curl 'https://api.example.com/v1/models'",
            "curl \"https://api.github.com/repos/acme/app\"",
            "curl -H 'Authorization: Bearer $TOKEN' https://api.example.com/",
            "git clone https://x-access-token:$TOKEN@github.com/acme/app.git",
            "curl https://example.com:443/'a b'",
            "curl https://api.example.com/$PATH_PART",
            "curl https://example.com:${PORT}/",
            "curl 'http://[2001:db8::1]:8080/'",
        ] {
            assert_eq!(internal_destination(command), None, "{command}");
        }
    }

    #[test]
    fn a_url_whose_host_is_filled_in_at_run_time_is_refused() {
        for (command, authority) in [
            ("curl http://$HOST:3000/", "$HOST:3000"),
            ("curl \"http://${TARGET}/admin\"", "${TARGET}"),
            ("curl http://`hostname`/", "`hostname`"),
            (
                "curl 'http://{example.com,127.0.0.1}/'",
                "{example.com,127.0.0.1}",
            ),
            ("curl 'http://[126-127].0.0.1/'", "[126-127].0.0.1"),
        ] {
            assert_eq!(
                internal_destination(command),
                Some(authority.to_string()),
                "{command}"
            );
        }
    }

    #[test]
    fn a_zone_index_does_not_hide_an_ipv6_address() {
        assert!(is_internal_host("::1%25lo"));
        assert!(is_internal_host("fe80::1%eth0"));
        assert!(!is_internal_host("2001:db8::1%eth0"));
    }
}

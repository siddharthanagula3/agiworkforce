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
    // `0177.0.0.1` and `127.1` all reach 127.0.0.1. A dotless word is only
    // read as an address when it lands on loopback or link-local, so a bare
    // `0` in `curl --retry 0` is not taken for one.
    match inet_aton(&host) {
        Some(v4) if host.contains('.') => is_internal_ip(std::net::IpAddr::V4(v4)),
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

/// The host part of a word that names a destination, if it names one.
pub(crate) fn destination_host(word: &str) -> Option<&str> {
    let after_scheme = match word.split_once("://") {
        Some((scheme, rest)) if !scheme.is_empty() => rest,
        _ => word,
    };
    let authority = after_scheme.split(['/', '?', '#']).next()?;
    let authority = authority.rsplit('@').next()?;
    let host = if let Some(rest) = authority.strip_prefix('[') {
        rest.split(']').next()?
    } else {
        authority.split(':').next()?
    };
    (!host.is_empty()).then_some(host)
}

/// The first internal destination any segment of `command` names, or the
/// authority of a URL whose host is only known once the command runs.
///
/// Each word is read as written and as the program receives it. Quote
/// removal turns `http://12'7.0.0.1':3000/` into `http://127.0.0.1:3000/` for
/// both the direct argv launch and `sh -c`, so a check on the written text
/// alone refuses one spelling of a destination and admits another.
pub(crate) fn internal_destination(command: &str) -> Option<String> {
    super::split_segments(command).iter().find_map(|segment| {
        destination_words(segment).into_iter().find_map(|word| {
            if let Some(authority) = dynamic_authority(&word) {
                return Some(authority.to_string());
            }
            destination_host(&word)
                .filter(|host| is_internal_host(host))
                .map(str::to_string)
        })
    })
}

/// The words of one segment as written and with shell quoting removed, each
/// also cut at redirection and grouping characters a shell ends a word on.
fn destination_words(segment: &str) -> Vec<String> {
    let mut words: Vec<String> = segment.split_whitespace().map(str::to_string).collect();
    if let Some(unquoted) = shlex::split(segment) {
        words.extend(unquoted);
    }
    words
        .iter()
        .flat_map(|word| word.split(['<', '>', '(', ')']))
        .filter(|piece| !piece.is_empty())
        .map(str::to_string)
        .collect()
}

/// The authority of a URL whose host the shell or the program fills in at run
/// time: an expansion (`$H`, `` `cmd` ``), a brace list or a curl range. No
/// check can read the destination such a word reaches.
fn dynamic_authority(word: &str) -> Option<&str> {
    let (scheme, rest) = word.split_once("://")?;
    if scheme.is_empty() {
        return None;
    }
    let authority = rest.split(['/', '?', '#']).next()?;
    let host_and_port = authority.rsplit('@').next()?;
    let dynamic = match host_and_port.strip_prefix('[') {
        Some(inner) => inner
            .split_once(']')
            .map(|(literal, _)| literal.split('%').next().unwrap_or(literal))
            .is_some_and(|address| address.parse::<std::net::Ipv6Addr>().is_err()),
        None => host_and_port
            .split(':')
            .next()
            .is_some_and(|host| host.contains(['$', '`', '{', '}', '[', ']'])),
    };
    dynamic.then_some(authority)
}

#[cfg(test)]
mod tests {
    use super::{destination_host, internal_destination, is_internal_host, INTERNAL_HOST_NAMES};
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
        assert_eq!(
            destination_host("https://example.com/a/b"),
            Some("example.com")
        );
        assert_eq!(
            destination_host("http://user:pw@127.0.0.1:8080/x"),
            Some("127.0.0.1")
        );
        assert_eq!(destination_host("http://[::1]:9200/_shutdown"), Some("::1"));
        assert_eq!(destination_host("example.com:443"), Some("example.com"));
        assert_eq!(destination_host("--silent"), Some("--silent"));
        assert_eq!(destination_host(""), None);
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
                    .filter_map(|arg| destination_host(arg))
                    .any(is_internal_host),
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

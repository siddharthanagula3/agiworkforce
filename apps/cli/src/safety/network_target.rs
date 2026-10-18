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

/// The first internal destination any segment of `command` names.
pub(crate) fn internal_destination(command: &str) -> Option<String> {
    super::split_segments(command).iter().find_map(|segment| {
        segment
            .split_whitespace()
            .filter_map(destination_host)
            .find(|host| is_internal_host(host))
            .map(str::to_string)
    })
}

#[cfg(test)]
mod tests {
    use super::{destination_host, internal_destination, is_internal_host, INTERNAL_HOST_NAMES};

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
}

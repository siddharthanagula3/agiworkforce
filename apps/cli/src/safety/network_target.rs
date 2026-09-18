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
        .to_ascii_lowercase();
    if host == "localhost"
        || host.ends_with(".localhost")
        || host == "metadata.google.internal"
        || host == "metadata.goog"
        // Alibaba Cloud's metadata endpoint.
        || host == "100.100.100.200"
    {
        return true;
    }
    // `fd00:ec2::254` is the IPv6 spelling of the EC2 metadata service.
    if host == "::1" || host == "::" || host.starts_with("fd00:ec2:") {
        return true;
    }
    if host.starts_with("127.") || host == "0.0.0.0" || host.starts_with("169.254.") {
        return true;
    }
    // A bare integer is still a routable spelling of an address:
    // `curl http://2130706433/` reaches 127.0.0.1.
    if let Ok(packed) = host.parse::<u32>() {
        let octets = packed.to_be_bytes();
        if octets[0] == 127 || (octets[0] == 169 && octets[1] == 254) {
            return true;
        }
    }
    false
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

//! The Local trust boundary for self-hosted model servers.
//!
//! A runtime labelled Local (Ollama, LM Studio, llama.cpp, vLLM) may only be
//! reached on this computer, or on a private-network address the user has
//! marked as a machine they own. Anything else would let a chat shown as Local
//! leave the user's network, so it is refused here rather than at send time.
//! A server on the public internet belongs behind a custom endpoint provider
//! with its own visible label.

use std::net::Ipv6Addr;

use url::{Host, Url};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalEndpointScope {
    ThisComputer,
    PrivateNetwork,
}

fn ipv6_is_unique_local(address: &Ipv6Addr) -> bool {
    (address.segments()[0] & 0xfe00) == 0xfc00
}

/// Validates a Local runtime base URL and returns it without a trailing slash.
///
/// `allow_private_network` is the user's explicit mark that private-network
/// addresses entered for local runtimes are machines they own. Without it only
/// loopback is accepted. Host names other than `localhost` are refused even
/// when they resolve privately today, because DNS can change where they point.
pub fn validate_local_runtime_url(
    raw: &str,
    runtime_label: &str,
    allow_private_network: bool,
) -> Result<(String, LocalEndpointScope), String> {
    let candidate = raw.trim().trim_end_matches('/');
    let parsed =
        Url::parse(candidate).map_err(|_| format!("{runtime_label} URL must be a valid URL"))?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("{runtime_label} URL must use http or https"));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(format!("{runtime_label} URL must not contain credentials"));
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(format!(
            "{runtime_label} URL must not contain a query or fragment"
        ));
    }

    let scope = match parsed.host() {
        Some(Host::Domain(domain)) if domain.eq_ignore_ascii_case("localhost") => {
            LocalEndpointScope::ThisComputer
        }
        Some(Host::Ipv4(address)) if address.is_loopback() => LocalEndpointScope::ThisComputer,
        Some(Host::Ipv6(address)) if address.is_loopback() => LocalEndpointScope::ThisComputer,
        Some(Host::Ipv4(address)) if address.is_private() => LocalEndpointScope::PrivateNetwork,
        Some(Host::Ipv6(address)) if ipv6_is_unique_local(&address) => {
            LocalEndpointScope::PrivateNetwork
        }
        Some(_) => {
            return Err(format!(
                "{runtime_label} must run on this computer or on a private-network address you own. \
                 A server on the internet is not Local; add it as a custom endpoint provider instead."
            ));
        }
        None => return Err(format!("{runtime_label} URL must include a host")),
    };

    if scope == LocalEndpointScope::PrivateNetwork && !allow_private_network {
        return Err(format!(
            "{runtime_label} is on another computer on your network. Turn on \"Use local servers on my private network\" in Settings, Models, if you own that computer."
        ));
    }

    Ok((candidate.to_string(), scope))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_loopback_without_the_private_network_mark() {
        for url in [
            "http://localhost:11434",
            "http://127.0.0.1:1234/v1/",
            "http://[::1]:8080/v1",
        ] {
            let (resolved, scope) = validate_local_runtime_url(url, "Ollama", false).unwrap();
            assert!(!resolved.ends_with('/'));
            assert_eq!(scope, LocalEndpointScope::ThisComputer);
        }
    }

    #[test]
    fn refuses_private_network_hosts_until_the_user_marks_them() {
        let refused = validate_local_runtime_url("http://192.168.1.20:11434", "Ollama", false);
        assert!(refused.unwrap_err().contains("private network"));

        let (_, scope) =
            validate_local_runtime_url("http://192.168.1.20:11434", "Ollama", true).unwrap();
        assert_eq!(scope, LocalEndpointScope::PrivateNetwork);
        assert!(validate_local_runtime_url("http://10.0.0.5:8000/v1", "vLLM", true).is_ok());
        assert!(validate_local_runtime_url("http://[fd00::5]:8000/v1", "vLLM", true).is_ok());
    }

    #[test]
    fn refuses_public_and_named_hosts_even_when_marked() {
        for url in [
            "https://ollama.example.com",
            "http://8.8.8.8:11434",
            "http://my-server.lan:11434",
            "http://169.254.169.254",
        ] {
            let error = validate_local_runtime_url(url, "Ollama", true).unwrap_err();
            assert!(error.contains("custom endpoint"), "{url}: {error}");
        }
    }

    #[test]
    fn refuses_credentials_queries_and_other_schemes() {
        assert!(
            validate_local_runtime_url("http://user:pw@localhost:11434", "Ollama", false)
                .unwrap_err()
                .contains("credentials")
        );
        assert!(
            validate_local_runtime_url("http://localhost:11434?x=1", "Ollama", false)
                .unwrap_err()
                .contains("query")
        );
        assert!(
            validate_local_runtime_url("ftp://localhost", "Ollama", false)
                .unwrap_err()
                .contains("http or https")
        );
    }
}

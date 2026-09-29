//! The workspace's website allow and block lists, applied to web_search and
//! web_fetch on this machine. A contract match with the web gateway's
//! `researchDomainAllowed` (apps/web/.../research-sources.ts): a rule covers its
//! subdomains, a leading `www.` is ignored, a block beats an allow, and a
//! non-empty allow list refuses everything not on it.

use crate::claude_parity::connectors::ConnectorAccessPolicy;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct SiteRules {
    allow: Vec<String>,
    deny: Vec<String>,
}

fn strip_www(host: &str) -> &str {
    host.strip_prefix("www.").unwrap_or(host)
}

/// Accepts what an administrator types: a bare domain, a leading dot, a `*.`
/// wildcard or a whole URL. Anything else narrows nothing.
fn normalize_rule(raw: &str) -> Option<String> {
    let value = raw.trim().to_ascii_lowercase();
    let host = if value.contains("://") {
        reqwest::Url::parse(&value).ok()?.host_str()?.to_string()
    } else {
        value
    };
    let host = host.trim_start_matches("*.").trim_start_matches('.');
    let host = strip_www(host).trim_end_matches('.');
    let valid = !host.is_empty()
        && host.contains('.')
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    valid.then(|| host.to_string())
}

fn host_of(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?.to_ascii_lowercase();
    Some(strip_www(&host).to_string())
}

fn matches_rule(host: &str, rule: &str) -> bool {
    host == rule || host.ends_with(&format!(".{rule}"))
}

impl SiteRules {
    pub(crate) fn from_policy(policy: &ConnectorAccessPolicy) -> Option<Self> {
        let normalize = |values: &[String]| {
            let mut rules: Vec<String> = values.iter().filter_map(|v| normalize_rule(v)).collect();
            rules.sort();
            rules.dedup();
            rules
        };
        let rules = Self {
            allow: normalize(&policy.allowed_web_domains),
            deny: normalize(&policy.blocked_web_domains),
        };
        (!rules.allow.is_empty() || !rules.deny.is_empty()).then_some(rules)
    }

    /// Why this URL may not be read, or None when the rules admit it. A URL
    /// that will not parse is refused only when an allow list is in force.
    pub(crate) fn refusal(&self, url: &str) -> Option<String> {
        let Some(host) = host_of(url) else {
            return (!self.allow.is_empty()).then(|| {
                format!(
                    "Your workspace administrator limits which websites the assistant may read, \
                     and {url} could not be checked against that list."
                )
            });
        };
        if self.deny.iter().any(|rule| matches_rule(&host, rule)) {
            return Some(format!(
                "Your workspace administrator has blocked {host}, so the assistant may not read it."
            ));
        }
        if !self.allow.is_empty() && !self.allow.iter().any(|rule| matches_rule(&host, rule)) {
            return Some(format!(
                "Your workspace administrator limits which websites the assistant may read, and \
                 {host} is not on the approved list."
            ));
        }
        None
    }
}

/// The rules in force for this process, read with the stored sign-in.
pub(crate) async fn current() -> Option<SiteRules> {
    crate::claude_parity::connectors::policy_for_local_tools()
        .await
        .as_ref()
        .and_then(SiteRules::from_policy)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(allow: &[&str], deny: &[&str]) -> SiteRules {
        SiteRules::from_policy(&ConnectorAccessPolicy {
            allowed_web_domains: allow.iter().map(|s| s.to_string()).collect(),
            blocked_web_domains: deny.iter().map(|s| s.to_string()).collect(),
            ..ConnectorAccessPolicy::default()
        })
        .expect("rules in force")
    }

    #[test]
    fn no_lists_means_no_rules() {
        assert_eq!(
            SiteRules::from_policy(&ConnectorAccessPolicy::default()),
            None
        );
    }

    #[test]
    fn a_block_covers_subdomains_and_ignores_www() {
        let r = rules(&[], &["example.com"]);
        assert!(r.refusal("https://example.com/a").is_some());
        assert!(r.refusal("https://www.example.com/a").is_some());
        assert!(r.refusal("https://docs.example.com/a").is_some());
        assert!(r.refusal("https://notexample.com/a").is_none());
        assert!(r.refusal("not a url").is_none());
    }

    #[test]
    fn an_allow_list_refuses_everything_else_and_a_block_beats_it() {
        let r = rules(
            &["*.docs.rs", "https://www.rust-lang.org/learn"],
            &["blog.rust-lang.org"],
        );
        assert!(r.refusal("https://docs.rs/serde").is_none());
        assert!(r.refusal("https://rust-lang.org/").is_none());
        assert!(r.refusal("https://blog.rust-lang.org/post").is_some());
        assert!(r.refusal("https://example.com/").is_some());
        assert!(r.refusal("not a url").is_some());
    }

    #[test]
    fn a_rule_that_is_not_a_domain_narrows_nothing() {
        assert_eq!(
            SiteRules::from_policy(&ConnectorAccessPolicy {
                blocked_web_domains: vec!["not a domain".to_string(), "localhost".to_string()],
                ..ConnectorAccessPolicy::default()
            }),
            None
        );
    }
}

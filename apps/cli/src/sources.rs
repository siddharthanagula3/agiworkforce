use std::cell::RefCell;
use std::future::Future;

use serde_json::Value;

pub(crate) const SEARCH_RESULTS_EVENT: &str = "x_search_results";
const MAX_SNIPPET_CHARS: usize = 300;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebSource {
    pub url: String,
    pub title: String,
    pub snippet: Option<String>,
}

tokio::task_local! {
    static TURN_SOURCES: RefCell<Vec<WebSource>>;
}

pub(crate) async fn collect<F: Future>(future: F) -> (F::Output, Vec<WebSource>) {
    TURN_SOURCES
        .scope(RefCell::new(Vec::new()), async move {
            let output = future.await;
            let sources = TURN_SOURCES.with(|sources| sources.take());
            (output, sources)
        })
        .await
}

pub(crate) fn record(found: impl IntoIterator<Item = WebSource>) {
    let _ = TURN_SOURCES.try_with(|sources| {
        let mut sources = sources.borrow_mut();
        for source in found {
            if source.url.trim().is_empty() {
                continue;
            }
            match sources
                .iter_mut()
                .find(|existing| existing.url == source.url)
            {
                Some(existing) => {
                    if existing.snippet.is_none() {
                        existing.snippet = source.snippet;
                    }
                }
                None => sources.push(source),
            }
        }
    });
}

pub(crate) fn source(url: &str, title: Option<&str>, snippet: Option<&str>) -> WebSource {
    let title = title.map(str::trim).filter(|title| !title.is_empty());
    WebSource {
        url: url.trim().to_string(),
        title: title.unwrap_or(url).trim().to_string(),
        snippet: snippet
            .map(|snippet| snippet.split_whitespace().collect::<Vec<_>>().join(" "))
            .filter(|snippet| !snippet.is_empty())
            .map(|snippet| {
                if snippet.chars().count() <= MAX_SNIPPET_CHARS {
                    snippet
                } else {
                    let mut clipped: String = snippet.chars().take(MAX_SNIPPET_CHARS).collect();
                    clipped.push('…');
                    clipped
                }
            }),
    }
}

pub(crate) fn from_search_results_delta(data: &Value) -> Vec<WebSource> {
    data.get("content")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let url = item.get("url")?.as_str()?;
                    Some(source(
                        url,
                        item.get("title").and_then(Value::as_str),
                        item.get("encrypted_content").and_then(Value::as_str),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn render_footer(sources: &[WebSource]) -> Option<String> {
    if sources.is_empty() {
        return None;
    }
    let mut lines = vec!["Sources".to_string()];
    for (index, source) in sources.iter().enumerate() {
        lines.push(format!(
            "  [{}] {}  {}",
            index + 1,
            crate::terminal_text::sanitize_terminal_text(&source.title),
            crate::terminal_text::sanitize_terminal_text(&source.url)
        ));
    }
    Some(lines.join("\n"))
}

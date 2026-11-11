use std::path::PathBuf;

use agiworkforce_desktop_gpui::code_search::{hit_label, CodeSearch, NO_MATCHES};
use agiworkforce_desktop_gpui::config::{NativeContracts, Settings};
use agiworkforce_desktop_gpui::runtime::{consent_timestamp_ms, RuntimeSession};
use agiworkforce_protocol::developer_session::*;

fn hit(id: &str, title: &str, title_matched: bool, snippet: Option<&str>) -> ThreadSearchHit {
    serde_json::from_value(serde_json::json!({
        "thread": {
            "id": id,
            "title": title,
            "trustMode": "local",
            "createdAt": "2026-11-11T00:00:00Z",
            "updatedAt": "2026-11-11T00:00:00Z",
            "createdBy": "cli",
            "status": "idle",
        },
        "titleMatched": title_matched,
        "matches": snippet
            .map(|text| vec![serde_json::json!({"messageIndex": 0, "role": "user", "snippet": text})])
            .unwrap_or_default(),
    }))
    .unwrap()
}

#[test]
fn a_blank_query_shows_the_folder_list_instead_of_searching() {
    let mut search = CodeSearch::default();
    search.set_query("   ");
    assert!(search.begin().is_none());
    assert!(!search.searching());
    assert!(search.results().is_none());
}

#[test]
fn results_replace_the_list_until_the_search_is_cleared() {
    let mut search = CodeSearch::default();
    search.set_query("  budget ");
    let (generation, query) = search.begin().unwrap();
    assert_eq!(query, "budget");
    assert!(search.searching());
    assert!(search.finish(
        generation,
        ThreadSearchResponse {
            hits: vec![hit("a", "Budget", true, None)]
        }
    ));
    let (shown, hits) = search.results().unwrap();
    assert_eq!(shown, "budget");
    assert_eq!(hits.len(), 1);
    search.set_query("");
    assert!(search.results().is_none());
}

#[test]
fn a_slower_older_search_cannot_overwrite_a_newer_one() {
    let mut search = CodeSearch::default();
    search.set_query("first");
    let (first, _) = search.begin().unwrap();
    search.set_query("second");
    let (second, _) = search.begin().unwrap();
    assert!(!search.finish(
        first,
        ThreadSearchResponse {
            hits: vec![hit("old", "Old", true, None)]
        }
    ));
    assert!(!search.fail(first));
    assert!(search.searching());
    assert!(search.finish(second, ThreadSearchResponse { hits: vec![] }));
    let (shown, hits) = search.results().unwrap();
    assert_eq!(shown, "second");
    assert!(hits.is_empty());
}

#[test]
fn clearing_discards_a_search_still_in_flight() {
    let mut search = CodeSearch::default();
    search.set_query("budget");
    let (generation, _) = search.begin().unwrap();
    search.reset();
    assert!(!search.searching());
    assert!(!search.finish(
        generation,
        ThreadSearchResponse {
            hits: vec![hit("a", "Budget", true, None)]
        }
    ));
    assert!(search.results().is_none());
    assert!(search.begin().is_none());
}

#[test]
fn a_transcript_match_names_where_the_text_was_found() {
    assert_eq!(
        hit_label(&hit("a", "Planning", false, Some("  the budget is due  "))),
        "Planning · the budget is due"
    );
    assert_eq!(
        hit_label(&hit("a", "Budget", true, Some("budget again"))),
        "Budget"
    );
    assert_eq!(hit_label(&hit("a", "Budget", false, None)), "Budget");
    assert!(NO_MATCHES.ends_with('.'));
}

async fn connect(binary: &std::path::Path, folder: &std::path::Path) -> RuntimeSession {
    RuntimeSession::connect(
        binary,
        folder,
        consent_timestamp_ms().unwrap(),
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap()
}

async fn start(session: &RuntimeSession, title: &str) -> String {
    let started: ThreadStartResponse = session
        .client()
        .request(
            method::THREAD_START,
            ThreadStartParams {
                model: Some("fixture-local".into()),
                provider: Some(LocalModelProvider::Ollama),
                cwd: None,
                title: Some(title.into()),
            },
        )
        .await
        .unwrap();
    started.thread.id
}

#[tokio::test]
#[ignore = "requires the packaged CLI and an isolated AGIWORKFORCE_HOME"]
async fn real_workspace_session_search_finds_only_this_folders_sessions() {
    assert_eq!(std::env::var("AGI_GPUI_SEARCH_FIXTURE").as_deref(), Ok("1"));
    assert!(std::env::var_os("AGIWORKFORCE_JWT").is_none());
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let folder = tempfile::tempdir().unwrap();
    let other_folder = tempfile::tempdir().unwrap();

    let other = connect(&binary, other_folder.path()).await;
    let elsewhere = start(&other, "Budget in another folder").await;
    other.shutdown().await.unwrap();

    let mut session = connect(&binary, folder.path()).await;
    let budget = start(&session, "Quarterly budget review").await;
    start(&session, "Grocery list").await;

    let mut search = CodeSearch::default();
    search.set_query("BUDGET");
    let (generation, query) = search.begin().unwrap();
    let response = session.search_sessions(query).await.unwrap();
    assert!(search.finish(generation, response));
    let (_, hits) = search.results().unwrap();
    assert_eq!(
        hits.iter()
            .map(|hit| hit.thread.id.as_str())
            .collect::<Vec<_>>(),
        vec![budget.as_str()]
    );
    assert!(hits[0].title_matched);
    assert_ne!(hits[0].thread.id, elsewhere);
    assert_eq!(hit_label(&hits[0]), "Quarterly budget review");

    let none = session
        .search_sessions("no session mentions this".into())
        .await
        .unwrap();
    assert!(none.hits.is_empty());

    let blank = session.search_sessions("   ".into()).await.unwrap_err();
    assert!(
        format!("{blank:#}").contains("thread/search needs a query"),
        "{blank:#}"
    );
    assert!(session.client().is_connected());
    session.shutdown().await.unwrap();
}

#[tokio::test]
#[ignore = "requires the packaged CLI and an isolated AGIWORKFORCE_HOME"]
async fn real_account_connection_cannot_search_coding_sessions() {
    assert_eq!(std::env::var("AGI_GPUI_SEARCH_FIXTURE").as_deref(), Ok("1"));
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let mut session = RuntimeSession::connect_account(
        &binary,
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    let refused = session.search_sessions("budget".into()).await.unwrap_err();
    assert!(refused.to_string().contains("no coding workspace"));
    session.shutdown().await.unwrap();
}

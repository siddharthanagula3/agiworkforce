use agiworkforce_protocol::developer_session::{
    AcknowledgedResponse, ThreadDeleteParams, ThreadDeleteResponse, ThreadRenameParams,
    ThreadRenameResponse, ThreadSearchHit, ThreadSearchParams, ThreadSearchResponse, ThreadSummary,
    THREAD_SEARCH_DEFAULT_LIMIT, THREAD_SEARCH_MAX_LIMIT, THREAD_SEARCH_QUERY_MAX_CHARS,
    THREAD_TITLE_MAX_CHARS,
};
use anyhow::{ensure, Result};

pub fn error_message(error: &anyhow::Error) -> String {
    match error.downcast_ref::<agiworkforce_app_server::DeveloperSessionClientError>() {
        Some(agiworkforce_app_server::DeveloperSessionClientError::Remote { message, .. }) => {
            message.clone()
        }
        Some(_) => "The coding runtime could not confirm this session change. Reopen the folder before trying again.".into(),
        None => error.to_string(),
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KeptArchives {
    pub thread_id: String,
    pub refs: Vec<String>,
}

#[derive(Default)]
pub struct CodeSessions {
    pub query: String,
    pub include_archived: bool,
    pub showing_search: bool,
    pub hits: Vec<ThreadSearchHit>,
    pub operation: Option<uuid::Uuid>,
    pub error: Option<String>,
    pub notice: Option<String>,
    pub renaming: Option<String>,
    pub kept_archives: Option<KeptArchives>,
    pub reset_query: bool,
}

impl CodeSessions {
    pub fn begin(&mut self) -> uuid::Uuid {
        let id = uuid::Uuid::new_v4();
        self.operation = Some(id);
        self.error = None;
        self.notice = None;
        id
    }
}

pub fn search_params(query: &str, include_archived: bool) -> Result<ThreadSearchParams> {
    let query = query.trim();
    ensure!(
        !query.is_empty()
            && !query.contains('\0')
            && query.chars().count() <= THREAD_SEARCH_QUERY_MAX_CHARS,
        "Enter a search of 1 to {THREAD_SEARCH_QUERY_MAX_CHARS} characters"
    );
    Ok(ThreadSearchParams {
        query: query.to_owned(),
        limit: Some(THREAD_SEARCH_DEFAULT_LIMIT),
        include_archived,
    })
}

pub fn accept_search(response: ThreadSearchResponse) -> Result<Vec<ThreadSearchHit>> {
    ensure!(
        response.hits.len() <= THREAD_SEARCH_MAX_LIMIT as usize,
        "The session search returned more hits than it allows"
    );
    for hit in &response.hits {
        ensure!(
            !hit.thread.id.is_empty() && (hit.title_matched || !hit.matches.is_empty()),
            "A session search hit had no session or match"
        );
        ensure!(
            hit.matches
                .iter()
                .all(|item| !item.role.is_empty() && !item.snippet.is_empty()),
            "A session search snippet was empty"
        );
    }
    Ok(response.hits)
}

pub fn rename_params(thread_id: &str, title: &str) -> Result<ThreadRenameParams> {
    let title = title.trim();
    ensure!(!thread_id.is_empty(), "Choose a session before renaming it");
    ensure!(
        !title.is_empty()
            && !title.contains('\0')
            && title.chars().count() <= THREAD_TITLE_MAX_CHARS,
        "A session title is 1 to {THREAD_TITLE_MAX_CHARS} characters"
    );
    Ok(ThreadRenameParams {
        thread_id: thread_id.to_owned(),
        title: title.to_owned(),
    })
}

pub fn accept_rename(request: &ThreadRenameParams, response: &ThreadRenameResponse) -> Result<()> {
    ensure!(
        response.thread.id == request.thread_id && response.thread.title == request.title,
        "The renamed session did not match the requested title"
    );
    Ok(())
}

pub fn replace_thread(threads: &mut [ThreadSummary], thread: ThreadSummary) -> bool {
    let Some(found) = threads.iter_mut().find(|item| item.id == thread.id) else {
        return false;
    };
    *found = thread;
    true
}

pub fn delete_params(thread_id: &str) -> Result<ThreadDeleteParams> {
    ensure!(!thread_id.is_empty(), "Choose a session before deleting it");
    Ok(ThreadDeleteParams {
        thread_id: thread_id.to_owned(),
        discard_worktree_archives: false,
    })
}

pub fn discard_params(kept: &KeptArchives) -> Result<ThreadDeleteParams> {
    ensure!(
        !kept.thread_id.is_empty()
            && !kept.refs.is_empty()
            && kept.refs.iter().all(|item| !item.is_empty()),
        "There are no kept worktree archives to discard"
    );
    Ok(ThreadDeleteParams {
        thread_id: kept.thread_id.clone(),
        discard_worktree_archives: true,
    })
}

pub fn accept_delete(
    request: &ThreadDeleteParams,
    response: &ThreadDeleteResponse,
) -> Result<Option<KeptArchives>> {
    ensure!(
        response.acknowledged,
        "The session delete was not confirmed"
    );
    if !request.discard_worktree_archives {
        ensure!(
            response.removed_worktree_archives.is_empty(),
            "Session delete removed worktree archives that were not reviewed"
        );
    }
    if response.kept_worktree_archives.is_empty() {
        return Ok(None);
    }
    ensure!(
        response
            .kept_worktree_archives
            .iter()
            .all(|item| !item.is_empty()),
        "A kept worktree archive had no name"
    );
    Ok(Some(KeptArchives {
        thread_id: request.thread_id.clone(),
        refs: response.kept_worktree_archives.clone(),
    }))
}

pub fn accept_archive(response: &AcknowledgedResponse) -> Result<()> {
    ensure!(
        response.acknowledged,
        "The session archive was not confirmed"
    );
    Ok(())
}

pub fn remove_thread(threads: &mut Vec<ThreadSummary>, thread_id: &str) -> bool {
    let before = threads.len();
    threads.retain(|thread| thread.id != thread_id);
    threads.len() != before
}

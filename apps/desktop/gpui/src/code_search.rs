use agiworkforce_protocol::developer_session::{ThreadSearchHit, ThreadSearchResponse};

#[derive(Debug, Default)]
pub struct CodeSearch {
    query: String,
    shown: Option<String>,
    hits: Vec<ThreadSearchHit>,
    pending: Option<(u64, String)>,
    generation: u64,
}

impl CodeSearch {
    pub fn set_query(&mut self, query: &str) {
        self.query = query.to_owned();
        if query.trim().is_empty() {
            self.clear();
        }
    }

    pub fn begin(&mut self) -> Option<(u64, String)> {
        let query = self.query.trim().to_owned();
        if query.is_empty() {
            self.clear();
            return None;
        }
        self.generation += 1;
        self.pending = Some((self.generation, query.clone()));
        Some((self.generation, query))
    }

    pub fn finish(&mut self, generation: u64, response: ThreadSearchResponse) -> bool {
        let Some(query) = self.take_pending(generation) else {
            return false;
        };
        self.shown = Some(query);
        self.hits = response.hits;
        true
    }

    pub fn fail(&mut self, generation: u64) -> bool {
        self.take_pending(generation).is_some()
    }

    pub fn clear(&mut self) {
        self.generation += 1;
        self.pending = None;
        self.shown = None;
        self.hits.clear();
    }

    pub fn reset(&mut self) {
        self.clear();
        self.query.clear();
    }

    pub fn searching(&self) -> bool {
        self.pending.is_some()
    }

    pub fn results(&self) -> Option<(&str, &[ThreadSearchHit])> {
        self.shown
            .as_deref()
            .map(|query| (query, self.hits.as_slice()))
    }

    fn take_pending(&mut self, generation: u64) -> Option<String> {
        match self.pending.take() {
            Some((pending, query)) if pending == generation => Some(query),
            other => {
                self.pending = other;
                None
            }
        }
    }
}

pub fn hit_label(hit: &ThreadSearchHit) -> String {
    match hit.matches.first() {
        Some(found) if !hit.title_matched => {
            format!("{} · {}", hit.thread.title, found.snippet.trim())
        }
        _ => hit.thread.title.clone(),
    }
}

pub const NO_MATCHES: &str = "No coding sessions in this folder match this search.";

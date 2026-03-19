pub mod conversation_search;
pub mod fts;
pub mod web_search;

pub use conversation_search::{
    get_recent_conversations, search_past_conversations, ConversationSearchResult,
    ConversationSummary,
};
pub use fts::{FullTextSearch, SearchFilter, SearchOptions, SearchResult};
pub use web_search::{
    web_search, SearchType, WebSearchConfig, WebSearchResponse, WebSearchResult, WebSearchService,
};

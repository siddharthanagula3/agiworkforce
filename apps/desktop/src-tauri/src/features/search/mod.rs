pub mod conversation_search;
pub mod fts;

pub use conversation_search::{
    get_recent_conversations, search_past_conversations, ConversationScope,
    ConversationSearchResult, ConversationSummary,
};
pub use fts::{FullTextSearch, SearchFilter, SearchOptions, SearchResult};

pub mod fts;
pub mod web_search;

pub use fts::{FullTextSearch, SearchFilter, SearchOptions, SearchResult};
pub use web_search::{
    web_search, SearchType, WebSearchConfig, WebSearchResponse, WebSearchResult, WebSearchService,
};

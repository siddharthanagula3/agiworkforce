pub mod connection;
#[cfg(feature = "remote-databases")]
pub mod mysql_client;
#[cfg(feature = "remote-databases")]
pub mod nosql_client;
pub mod pool;
#[cfg(feature = "remote-databases")]
pub mod postgres;
#[cfg(feature = "remote-databases")]
pub mod postgres_client;
pub mod query_builder;
#[cfg(feature = "remote-databases")]
pub mod redis_client;
pub mod security;
pub mod sql_client;
pub mod sqlite_pool;

pub use connection::{ConnectionConfig, DatabaseType, SslConfig};
#[cfg(feature = "remote-databases")]
pub use mysql_client::MySqlClient;
#[cfg(feature = "remote-databases")]
pub use nosql_client::MongoClient;
pub use pool::{ConnectionPool, PoolConfig};
#[cfg(feature = "remote-databases")]
pub use postgres_client::PostgresClient;
pub use query_builder::{DeleteQuery, InsertQuery, QueryBuilder, SelectQuery, UpdateQuery};
#[cfg(feature = "remote-databases")]
pub use redis_client::RedisClient;
pub use security::{ApprovalLevel, QueryType, QueryValidation, SqlSecurityValidator};
pub use sql_client::{QueryResult, SqlClient};
pub use sqlite_pool::{
    ConnectionGuard, PoolStats as SqlitePoolStats, SqlitePool, SqlitePoolConfig, SqlitePoolState,
};

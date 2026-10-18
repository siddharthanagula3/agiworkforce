pub mod connection;
#[cfg(feature = "remote-databases")]
pub mod mysql_client;
pub mod pool;
#[cfg(feature = "remote-databases")]
pub mod postgres_client;
pub mod sql_client;

pub use connection::{ConnectionConfig, DatabaseType, SslConfig};
#[cfg(feature = "remote-databases")]
pub use mysql_client::MySqlClient;
pub use pool::{ConnectionPool, PoolConfig};
#[cfg(feature = "remote-databases")]
pub use postgres_client::PostgresClient;
pub use sql_client::{QueryResult, SqlClient};

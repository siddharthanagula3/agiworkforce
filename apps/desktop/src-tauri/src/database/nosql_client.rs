use bson::{doc, Bson, Document as BsonDocument};
use mongodb::options::{ClientOptions, FindOptions};
use mongodb::{Client, Collection, Database};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::database::ConnectionConfig;
use crate::error::{Error, Result};

/// MongoDB document (JSON-compatible)
pub type Document = HashMap<String, JsonValue>;

/// MongoDB query result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MongoQueryResult {
    pub documents: Vec<Document>,
    pub matched_count: u64,
    pub modified_count: u64,
    pub execution_time_ms: u128,
}

/// MongoDB client for NoSQL operations
pub struct MongoClient {
    connections: Arc<RwLock<HashMap<String, MongoConnection>>>,
}

struct MongoConnection {
    _client: Client,
    database: Database,
    _database_name: String,
}

impl MongoClient {
    /// Create a new MongoDB client
    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a MongoDB connection
    pub async fn connect(&self, connection_id: &str, config: ConnectionConfig) -> Result<()> {
        tracing::info!("Connecting to MongoDB: {}", connection_id);

        config.validate()?;

        let database_name = config
            .database
            .clone()
            .ok_or_else(|| Error::Other("Database name required".to_string()))?;

        // Build connection string
        let connection_string = config.build_connection_string()?;

        // Parse client options
        let mut client_options = ClientOptions::parse(&connection_string)
            .await
            .map_err(|e| {
                Error::Other(format!("Failed to parse MongoDB connection string: {}", e))
            })?;

        // Set application name for monitoring
        client_options.app_name = Some("AGI Workforce".to_string());

        // Create client
        let client = Client::with_options(client_options)
            .map_err(|e| Error::Other(format!("Failed to create MongoDB client: {}", e)))?;

        // Get database
        let database = client.database(&database_name);

        // Test connection by listing collections
        database
            .list_collection_names(None)
            .await
            .map_err(|e| Error::Other(format!("Failed to connect to MongoDB: {}", e)))?;

        let connection = MongoConnection {
            _client: client,
            database,
            _database_name: database_name,
        };

        let mut connections = self.connections.write().await;
        connections.insert(connection_id.to_string(), connection);

        tracing::info!("MongoDB connection established: {}", connection_id);

        Ok(())
    }

    /// Find documents in a collection
    pub async fn find(
        &self,
        connection_id: &str,
        collection_name: &str,
        filter: &Document,
        limit: Option<u64>,
    ) -> Result<MongoQueryResult> {
        let start = std::time::Instant::now();

        tracing::debug!("MongoDB find in collection: {}", collection_name);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let collection: Collection<BsonDocument> = conn.database.collection(collection_name);

        // Convert filter to BSON
        let bson_filter = json_to_bson_document(filter)?;

        // Set options
        let mut options = FindOptions::default();
        if let Some(limit_val) = limit {
            options.limit = Some(limit_val as i64);
        }

        // Execute find
        let mut cursor = collection
            .find(bson_filter, options)
            .await
            .map_err(|e| Error::Other(format!("MongoDB find error: {}", e)))?;

        // Collect results
        let mut documents = Vec::new();
        use futures::stream::TryStreamExt;

        while let Some(doc) = cursor
            .try_next()
            .await
            .map_err(|e| Error::Other(format!("MongoDB cursor error: {}", e)))?
        {
            documents.push(bson_document_to_json(doc)?);
        }

        let matched_count = documents.len() as u64;

        Ok(MongoQueryResult {
            documents,
            matched_count,
            modified_count: 0,
            execution_time_ms: start.elapsed().as_millis(),
        })
    }

    /// Find one document in a collection
    pub async fn find_one(
        &self,
        connection_id: &str,
        collection_name: &str,
        filter: &Document,
    ) -> Result<Option<Document>> {
        tracing::debug!("MongoDB findOne in collection: {}", collection_name);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let collection: Collection<BsonDocument> = conn.database.collection(collection_name);

        // Convert filter to BSON
        let bson_filter = json_to_bson_document(filter)?;

        // Execute find_one
        let result = collection
            .find_one(bson_filter, None)
            .await
            .map_err(|e| Error::Other(format!("MongoDB findOne error: {}", e)))?;

        match result {
            Some(doc) => Ok(Some(bson_document_to_json(doc)?)),
            None => Ok(None),
        }
    }

    /// Insert a document
    pub async fn insert_one(
        &self,
        connection_id: &str,
        collection_name: &str,
        document: &Document,
    ) -> Result<String> {
        tracing::debug!("MongoDB insertOne in collection: {}", collection_name);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let collection: Collection<BsonDocument> = conn.database.collection(collection_name);

        // Convert document to BSON
        let bson_doc = json_to_bson_document(document)?;

        // Execute insert
        let result = collection
            .insert_one(bson_doc, None)
            .await
            .map_err(|e| Error::Other(format!("MongoDB insertOne error: {}", e)))?;

        // Return inserted ID as string
        let id_string = match result.inserted_id {
            Bson::ObjectId(oid) => oid.to_hex(),
            Bson::String(s) => s,
            other => other.to_string(),
        };

        Ok(id_string)
    }

    /// Insert multiple documents
    pub async fn insert_many(
        &self,
        connection_id: &str,
        collection_name: &str,
        documents: &[Document],
    ) -> Result<Vec<String>> {
        tracing::debug!(
            "MongoDB insertMany: {} documents in collection: {}",
            documents.len(),
            collection_name
        );

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let collection: Collection<BsonDocument> = conn.database.collection(collection_name);

        // Convert documents to BSON
        let bson_docs: Result<Vec<BsonDocument>> =
            documents.iter().map(json_to_bson_document).collect();
        let bson_docs = bson_docs?;

        // Execute insert
        let result = collection
            .insert_many(bson_docs, None)
            .await
            .map_err(|e| Error::Other(format!("MongoDB insertMany error: {}", e)))?;

        // Return inserted IDs as strings
        let ids: Vec<String> = result
            .inserted_ids
            .values()
            .map(|bson| match bson {
                Bson::ObjectId(oid) => oid.to_hex(),
                Bson::String(s) => s.clone(),
                other => other.to_string(),
            })
            .collect();

        Ok(ids)
    }

    /// Update documents
    pub async fn update_many(
        &self,
        connection_id: &str,
        collection_name: &str,
        filter: &Document,
        update: &Document,
    ) -> Result<MongoQueryResult> {
        let start = std::time::Instant::now();

        tracing::debug!("MongoDB updateMany in collection: {}", collection_name);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let collection: Collection<BsonDocument> = conn.database.collection(collection_name);

        // Convert filter and update to BSON
        let bson_filter = json_to_bson_document(filter)?;
        let bson_update = json_to_bson_document(update)?;

        // Execute update
        let result = collection
            .update_many(bson_filter, bson_update, None)
            .await
            .map_err(|e| Error::Other(format!("MongoDB updateMany error: {}", e)))?;

        Ok(MongoQueryResult {
            documents: Vec::new(),
            matched_count: result.matched_count,
            modified_count: result.modified_count,
            execution_time_ms: start.elapsed().as_millis(),
        })
    }

    /// Delete documents
    pub async fn delete_many(
        &self,
        connection_id: &str,
        collection_name: &str,
        filter: &Document,
    ) -> Result<u64> {
        tracing::debug!("MongoDB deleteMany in collection: {}", collection_name);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let collection: Collection<BsonDocument> = conn.database.collection(collection_name);

        // Convert filter to BSON
        let bson_filter = json_to_bson_document(filter)?;

        // Execute delete
        let result = collection
            .delete_many(bson_filter, None)
            .await
            .map_err(|e| Error::Other(format!("MongoDB deleteMany error: {}", e)))?;

        Ok(result.deleted_count)
    }

    /// Run aggregation pipeline
    pub async fn aggregate(
        &self,
        connection_id: &str,
        collection_name: &str,
        pipeline: &[Document],
    ) -> Result<MongoQueryResult> {
        let start = std::time::Instant::now();

        tracing::debug!(
            "MongoDB aggregate with {} stages in collection: {}",
            pipeline.len(),
            collection_name
        );

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let collection: Collection<BsonDocument> = conn.database.collection(collection_name);

        // Convert pipeline to BSON
        let bson_pipeline: Result<Vec<BsonDocument>> =
            pipeline.iter().map(json_to_bson_document).collect();
        let bson_pipeline = bson_pipeline?;

        // Execute aggregation
        let mut cursor = collection
            .aggregate(bson_pipeline, None)
            .await
            .map_err(|e| Error::Other(format!("MongoDB aggregate error: {}", e)))?;

        // Collect results
        let mut documents = Vec::new();
        use futures::stream::TryStreamExt;

        while let Some(doc) = cursor
            .try_next()
            .await
            .map_err(|e| Error::Other(format!("MongoDB aggregate cursor error: {}", e)))?
        {
            documents.push(bson_document_to_json(doc)?);
        }

        let matched_count = documents.len() as u64;

        Ok(MongoQueryResult {
            documents,
            matched_count,
            modified_count: 0,
            execution_time_ms: start.elapsed().as_millis(),
        })
    }

    /// List all collections in the database
    pub async fn list_collections(&self, connection_id: &str) -> Result<Vec<String>> {
        tracing::debug!("MongoDB list collections");

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let collection_names = conn
            .database
            .list_collection_names(None)
            .await
            .map_err(|e| Error::Other(format!("MongoDB list collections error: {}", e)))?;

        Ok(collection_names)
    }

    /// Close a MongoDB connection
    pub async fn disconnect(&self, connection_id: &str) -> Result<()> {
        tracing::info!("Disconnecting MongoDB: {}", connection_id);

        let mut connections = self.connections.write().await;

        if connections.remove(connection_id).is_some() {
            Ok(())
        } else {
            Err(Error::Other("Connection not found".to_string()))
        }
    }

    /// List all active connections
    pub async fn list_connections(&self) -> Vec<String> {
        let connections = self.connections.read().await;
        connections.keys().cloned().collect()
    }
}

impl Default for MongoClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Convert JSON document to BSON document
fn json_to_bson_document(json_doc: &Document) -> Result<BsonDocument> {
    let json_value = serde_json::to_value(json_doc)
        .map_err(|e| Error::Other(format!("JSON serialization error: {}", e)))?;

    let bson = bson::to_bson(&json_value)
        .map_err(|e| Error::Other(format!("BSON conversion error: {}", e)))?;

    match bson {
        Bson::Document(doc) => Ok(doc),
        _ => Err(Error::Other("Expected BSON document".to_string())),
    }
}

/// Convert BSON document to JSON document
fn bson_document_to_json(bson_doc: BsonDocument) -> Result<Document> {
    let bson_value = Bson::Document(bson_doc);
    let json_value = bson::from_bson(bson_value)
        .map_err(|e| Error::Other(format!("BSON to JSON conversion error: {}", e)))?;

    match json_value {
        JsonValue::Object(map) => Ok(map.into_iter().collect()),
        _ => Err(Error::Other("Expected JSON object".to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mongo_client_creation() {
        let client = MongoClient::new();
        let connections = client.list_connections().await;
        assert_eq!(connections.len(), 0);
    }

    #[tokio::test]
    async fn test_disconnect() {
        let client = MongoClient::new();
        let config = ConnectionConfig::mongodb("localhost", 27017, "testdb", None, None);

        // Note: This test will fail if MongoDB is not running
        // In real tests, you would use a test MongoDB instance
        if client.connect("test_conn", config).await.is_ok() {
            client.disconnect("test_conn").await.unwrap();
            let connections = client.list_connections().await;
            assert_eq!(connections.len(), 0);
        }
    }

    #[test]
    fn test_json_to_bson_conversion() {
        let mut json_doc = HashMap::new();
        json_doc.insert("name".to_string(), JsonValue::String("test".to_string()));
        json_doc.insert("age".to_string(), JsonValue::Number(25.into()));
        json_doc.insert("active".to_string(), JsonValue::Bool(true));

        let result = json_to_bson_document(&json_doc);
        assert!(result.is_ok());

        let bson_doc = result.unwrap();
        assert_eq!(bson_doc.len(), 3);
    }

    #[test]
    fn test_bson_to_json_conversion() {
        let bson_doc = doc! {
            "name": "test",
            "age": 25,
            "active": true,
        };

        let result = bson_document_to_json(bson_doc);
        assert!(result.is_ok());

        let json_doc = result.unwrap();
        assert_eq!(json_doc.len(), 3);
        assert_eq!(
            json_doc.get("name"),
            Some(&JsonValue::String("test".to_string()))
        );
    }
}

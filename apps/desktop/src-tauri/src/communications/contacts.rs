use rusqlite::{params, Result as SqliteResult};
use tokio::fs;
use tokio_rusqlite::Connection;
use tracing::{debug, info, warn};

use crate::error::{Error, Result};

use super::Contact;

pub struct ContactManager {
    conn: Connection,
}

impl ContactManager {
    pub async fn new(path: impl AsRef<str>) -> Result<Self> {
        let conn = Connection::open(path.as_ref())
            .await
            .map_err(|e| Error::Generic(format!("Failed to open contacts database: {}", e)))?;
        Ok(Self { conn })
    }

    pub async fn create_contact(&self, contact: &Contact) -> Result<i64> {
        debug!("Creating contact: {}", contact.email);
        let now = chrono::Utc::now().timestamp();

        let email = contact.email.clone();
        let display_name = contact.display_name.clone();
        let first_name = contact.first_name.clone();
        let last_name = contact.last_name.clone();
        let phone = contact.phone.clone();
        let company = contact.company.clone();
        let notes = contact.notes.clone();

        self.conn
            .call(move |conn| {
                conn.execute(
                    "INSERT INTO contacts (email, display_name, first_name, last_name, phone, company, notes, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![email, display_name, first_name, last_name, phone, company, notes, now, now],
                )?;
                Ok(conn.last_insert_rowid())
            })
            .await
            .map_err(|e| Error::Generic(format!("Database error: {}", e)))
    }

    pub async fn get_contact(&self, id: i64) -> Result<Option<Contact>> {
        let result = self.conn
            .call(move |conn| {
                let mut stmt = conn
                    .prepare("SELECT id, email, display_name, first_name, last_name, phone, company, notes, created_at, updated_at FROM contacts WHERE id = ?1")?;
                let contact = stmt.query_row(params![id], map_contact_row)?;
                Ok(contact)
            })
            .await;

        match result {
            Ok(contact) => Ok(Some(contact)),
            Err(e) => {
                // tokio_rusqlite wraps rusqlite errors, check if it's QueryReturnedNoRows
                let err_str = format!("{}", e);
                if err_str.contains("Query returned no rows")
                    || err_str.contains("QueryReturnedNoRows")
                {
                    Ok(None)
                } else {
                    Err(Error::Generic(format!("Database error: {}", e)))
                }
            }
        }
    }

    pub async fn update_contact(&self, contact: &Contact) -> Result<()> {
        let now = chrono::Utc::now().timestamp();

        let email = contact.email.clone();
        let display_name = contact.display_name.clone();
        let first_name = contact.first_name.clone();
        let last_name = contact.last_name.clone();
        let phone = contact.phone.clone();
        let company = contact.company.clone();
        let notes = contact.notes.clone();
        let id = contact.id;

        self.conn
            .call(move |conn| {
                conn.execute(
                    "UPDATE contacts SET email = ?1, display_name = ?2, first_name = ?3, last_name = ?4, phone = ?5, company = ?6, notes = ?7, updated_at = ?8 WHERE id = ?9",
                    params![email, display_name, first_name, last_name, phone, company, notes, now, id],
                )?;
                Ok(())
            })
            .await
            .map_err(|e| Error::Generic(format!("Database error: {}", e)))
    }

    pub async fn delete_contact(&self, id: i64) -> Result<()> {
        self.conn
            .call(move |conn| {
                conn.execute("DELETE FROM contacts WHERE id = ?1", params![id])?;
                Ok(())
            })
            .await
            .map_err(|e| Error::Generic(format!("Database error: {}", e)))
    }

    pub async fn list_contacts(
        &self,
        limit: Option<usize>,
        offset: Option<usize>,
    ) -> Result<Vec<Contact>> {
        let limit = limit.unwrap_or(100);
        let offset = offset.unwrap_or(0);

        self.conn
            .call(move |conn| {
                let mut stmt = conn
                    .prepare("SELECT id, email, display_name, first_name, last_name, phone, company, notes, created_at, updated_at FROM contacts ORDER BY display_name, email LIMIT ?1 OFFSET ?2")?;
                let contacts = stmt
                    .query_map(params![limit, offset], map_contact_row)?
                    .collect::<SqliteResult<Vec<_>>>()?;
                Ok(contacts)
            })
            .await
            .map_err(|e| Error::Generic(format!("Database error: {}", e)))
    }

    pub async fn search_contacts(&self, query: &str, limit: usize) -> Result<Vec<Contact>> {
        let search_pattern = format!("%{}%", query);

        self.conn
            .call(move |conn| {
                let mut stmt = conn
                    .prepare("SELECT id, email, display_name, first_name, last_name, phone, company, notes, created_at, updated_at
                          FROM contacts
                          WHERE LOWER(email) LIKE LOWER(?1)
                             OR LOWER(display_name) LIKE LOWER(?1)
                             OR LOWER(first_name) LIKE LOWER(?1)
                             OR LOWER(last_name) LIKE LOWER(?1)
                          ORDER BY display_name, email
                          LIMIT ?2")?;
                let contacts = stmt
                    .query_map(params![search_pattern, limit], map_contact_row)?
                    .collect::<SqliteResult<Vec<_>>>()?;
                Ok(contacts)
            })
            .await
            .map_err(|e| Error::Generic(format!("Database error: {}", e)))
    }

    pub async fn import_vcard(&self, file_path: &str) -> Result<usize> {
        info!("Importing contacts from vCard file {}", file_path);
        let content = fs::read_to_string(file_path)
            .await
            .map_err(|err| Error::Generic(format!("Failed to read vCard file: {}", err)))?;

        let mut imported = 0usize;

        for card in split_vcards(&content) {
            if let Some(contact) = parse_vcard(card) {
                let now = chrono::Utc::now().timestamp();

                let email = contact.email.clone();
                let display_name = contact.display_name.clone();
                let first_name = contact.first_name.clone();
                let last_name = contact.last_name.clone();
                let phone = contact.phone.clone();
                let company = contact.company.clone();
                let notes = contact.notes.clone();

                let changes = self
                    .conn
                    .call(move |conn| {
                        let rows = conn.execute(
                            "INSERT INTO contacts (email, display_name, first_name, last_name, phone, company, notes, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
                             ON CONFLICT(email)
                             DO UPDATE SET
                                display_name = excluded.display_name,
                                first_name = excluded.first_name,
                                last_name = excluded.last_name,
                                phone = excluded.phone,
                                company = excluded.company,
                                notes = excluded.notes,
                                updated_at = excluded.updated_at",
                            params![email, display_name, first_name, last_name, phone, company, notes, now],
                        )?;
                        Ok(rows)
                    })
                    .await
                    .map_err(|e| Error::Generic(format!("Database error: {}", e)))?;

                if changes > 0 {
                    imported += 1;
                }
            } else {
                warn!("Skipping malformed vCard entry");
            }
        }

        Ok(imported)
    }

    pub async fn export_vcard(&self, file_path: &str) -> Result<usize> {
        info!("Exporting contacts to vCard file {}", file_path);

        let contacts = self.list_contacts(None, None).await?;
        if contacts.is_empty() {
            fs::write(file_path, "")
                .await
                .map_err(|err| Error::Generic(format!("Failed to write vCard file: {}", err)))?;
            return Ok(0);
        }

        let mut buffer = String::new();
        for contact in &contacts {
            buffer.push_str("BEGIN:VCARD\r\n");
            buffer.push_str("VERSION:3.0\r\n");
            buffer.push_str(&format!(
                "N:{};{};;;\r\n",
                contact.last_name.as_deref().unwrap_or(""),
                contact.first_name.as_deref().unwrap_or("")
            ));
            let fn_field = contact
                .display_name
                .clone()
                .or_else(|| {
                    let first = contact.first_name.clone().unwrap_or_default();
                    let last = contact.last_name.clone().unwrap_or_default();
                    if first.is_empty() && last.is_empty() {
                        None
                    } else {
                        Some(format!("{} {}", first, last).trim().to_string())
                    }
                })
                .unwrap_or_else(|| contact.email.clone());
            buffer.push_str(&format!("FN:{}\r\n", escape_vcard_value(&fn_field)));
            buffer.push_str(&format!(
                "EMAIL;TYPE=INTERNET:{}\r\n",
                escape_vcard_value(&contact.email)
            ));

            if let Some(phone) = contact.phone.as_ref().filter(|p| !p.is_empty()) {
                buffer.push_str(&format!("TEL;TYPE=CELL:{}\r\n", escape_vcard_value(phone)));
            }

            if let Some(company) = contact.company.as_ref().filter(|c| !c.is_empty()) {
                buffer.push_str(&format!("ORG:{}\r\n", escape_vcard_value(company)));
            }

            if let Some(notes) = contact.notes.as_ref().filter(|n| !n.is_empty()) {
                buffer.push_str(&format!("NOTE:{}\r\n", escape_vcard_value(notes)));
            }

            buffer.push_str("END:VCARD\r\n");
        }

        fs::write(file_path, buffer)
            .await
            .map_err(|err| Error::Generic(format!("Failed to write vCard file: {}", err)))?;

        Ok(contacts.len())
    }
}

fn map_contact_row(row: &rusqlite::Row<'_>) -> SqliteResult<Contact> {
    Ok(Contact {
        id: row.get(0)?,
        email: row.get(1)?,
        display_name: row.get(2)?,
        first_name: row.get(3)?,
        last_name: row.get(4)?,
        phone: row.get(5)?,
        company: row.get(6)?,
        notes: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn split_vcards(content: &str) -> Vec<&str> {
    content
        .split("BEGIN:VCARD")
        .filter(|chunk| !chunk.trim().is_empty())
        .collect()
}

fn parse_vcard(chunk: &str) -> Option<Contact> {
    let mut email = None;
    let mut display_name = None;
    let mut first_name = None;
    let mut last_name = None;
    let mut phone = None;
    let mut company = None;
    let mut notes = None;

    for line in chunk.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("EMAIL") {
            email = trimmed
                .split_once(':')
                .map(|x| x.1)
                .map(|value| value.trim().to_string());
        } else if let Some(stripped) = trimmed.strip_prefix("FN:") {
            display_name = Some(stripped.trim().to_string());
        } else if let Some(stripped) = trimmed.strip_prefix("N:") {
            let parts: Vec<&str> = stripped.split(';').collect();
            last_name = parts
                .first()
                .map(|v| v.trim().to_string())
                .filter(|s| !s.is_empty());
            first_name = parts
                .get(1)
                .map(|v| v.trim().to_string())
                .filter(|s| !s.is_empty());
        } else if trimmed.starts_with("TEL") {
            phone = trimmed
                .split_once(':')
                .map(|x| x.1)
                .map(|value| value.trim().to_string());
        } else if let Some(stripped) = trimmed.strip_prefix("ORG:") {
            company = Some(stripped.trim().to_string());
        } else if let Some(stripped) = trimmed.strip_prefix("NOTE:") {
            notes = Some(stripped.trim().to_string());
        }
    }

    let email = email?;

    Some(Contact {
        id: 0,
        email,
        display_name,
        first_name,
        last_name,
        phone,
        company,
        notes,
        created_at: 0,
        updated_at: 0,
    })
}

fn escape_vcard_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace(',', "\\,")
        .replace(';', "\\;")
}

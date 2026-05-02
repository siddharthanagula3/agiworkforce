// Sprint 0 (FIX-006a): the upstream `agiworkforce_config::schema` module was
// not ported in batch 7; this file re-exposed it solely for the test fixtures
// that lived in `schema_tests.rs`. Both gated off until the schema module
// lands. Restore in Sprint 5.
#[cfg(any())]
use agiworkforce_config::schema::canonicalize;
#[cfg(any())]
use agiworkforce_config::schema::config_schema_json;
#[cfg(any())]
use agiworkforce_config::schema::write_config_schema;

#[cfg(any())]
#[path = "schema_tests.rs"]
mod tests;

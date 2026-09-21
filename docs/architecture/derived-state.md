# Derived state

Status: Current
Owner: Platform/infrastructure
Last updated: 2026-09-20

Every value this product stores that was computed from something else, with the
five facts each one needs: what it derives from, how it is regenerated, how a
reader knows which generation it is looking at, what invalidates it, and what
happens to it when the thing it derives from is deleted.

The rule this file defends is that derived state is never authoritative. If a
derived value and its source disagree, the source wins and the derived value is
rebuilt. Nothing below is a second copy of the truth.

## 1. What counts as derived state here

`apps/web/lib/services/deletion-manifest.ts` classifies every store in the
product, and `derived_content` is one of its five data classes. The membership
of that class is the list in the code, not a list maintained here:
`context_manifests`, `file_lineage`, `retrieval_chunks`, `retrieval_documents`
and `web_artifact_index`. `docs/architecture/RETENTION_MATRIX.md` is rendered
from the same module, and `deletion-manifest.test.ts` fails when the document
and the code disagree, so a new derived store appears in the matrix without
anyone remembering to add it.

## 2. The stored derived values

| Value                 | Derives from                                                      | Regeneration                                                     | Version marker                                                  | Invalidation                                                       | Deletion propagation                                                                  |
| --------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `retrieval_documents` | One source row, exactly one of six kinds                          | The indexer leases a due row and re-reads the source             | `chunk_version`, plus `content_sha256` and `embedding_model`    | `status` returns to `stale`; `next_attempt_at` schedules the retry | Foreign key `on delete cascade` from each of the six source tables                    |
| `retrieval_chunks`    | Its `retrieval_documents` row                                     | Rewritten wholesale at the next `chunk_version`                  | `chunk_version` (at least 1) and `chunk_index`                  | A new document version replaces the whole chunk set                | `on delete cascade` from `retrieval_documents`, and from `organizations`              |
| `context_manifests`   | The context assembled for one turn                                | Not regenerated: a turn happens once                             | `content_digest`, a sha256 over the assembled ids and text      | None; the row records a past decision                              | Cascade from `organizations`; erased with the account                                 |
| `file_lineage`        | An edit, export, conversion, extraction or copy between two files | Written when the derivation happens                              | None; the row is the event                                      | None                                                               | `conversation_id` is `on delete set null`, so lineage survives a deleted conversation |
| `web_artifact_index`  | Artifact blocks in one assistant message markdown                 | `deriveArtifacts` re-derives from the message, which never moves | The deterministic id `uuidv5(conversationId:messageId:ordinal)` | Re-indexing the source message replaces its rows                   | `on delete cascade` from both `web_conversations` and `web_messages`                  |

Two details in that table are load-bearing:

`retrieval_documents` carries `content_sha256` and `embedding_model` beside its
`chunk_version`. Those three together are what let the indexer decide that a
document does not need rebuilding: same content, same model, same version. A
change to the embedding model is therefore an invalidation of the whole index,
not a migration.

`file_lineage.conversation_id` is `on delete set null` rather than a cascade.
Deleting a conversation does not delete the record that a file was derived from
another file; it only forgets which conversation it happened in. That is
deliberate, and it is the one place in this table where derived state outlives
part of its source.

## 3. Derived values that are never stored

Some values a reader might expect to be a table are computed on every read. They
have no version, no invalidation and no deletion propagation, because there is
nothing to go stale.

- **Cost rollups.** `apps/web/lib/services/cost-rollups.ts` aggregates
  `usage_events` per workspace, capability, workload or day inside the query.
  Nothing is materialised, so a corrected event corrects every past report.
- **Credit balance.** `public.get_credit_balance_microusd` (added by
  `apps/web/db/neon/0182_managed_usage_microusd_ledger.sql`) computes allocated,
  used and remaining credits from the ledger at call time. A balance is never
  stored as a number that could drift from the transactions beneath it.
- **Invoice state.** `resolveInvoiceState`
  (`packages/contracts/types/src/enterprise/invoice-terms.ts`) derives an
  invoice's state from its amounts and its due date rather than from a status
  string the provider may not have refreshed.
- **Retention matrix.** `renderRetentionMatrixMarkdown` produces
  `docs/architecture/RETENTION_MATRIX.md` from the erasure inventories.

## 4. Deletion propagation, stated plainly

A deletion of customer content must reach the derived content computed from it,
or the product keeps an answer to a question the user withdrew. Two mechanisms
do this, and they are the only two:

1. **Database cascades.** Every `retrieval_documents` source column is a foreign
   key with `on delete cascade`, and `retrieval_chunks.document_id` cascades
   from `retrieval_documents`. Deleting the source row deletes the index entry
   and its chunks in the same transaction. This is the path that does not
   depend on any application code running.
2. **The erasure inventories.** `apps/web/lib/server/account-erasure.ts` and
   `apps/web/lib/server/organization-erasure.ts` enumerate the tables an account
   or workspace deletion sweeps. A derived store that no cascade reaches has to
   be in one of those lists, which is what
   `apps/web/lib/resources/__tests__/deletion-semantics.test.ts` and
   `deletion-manifest.test.ts` check.

Soft deletion is different from erasure and is covered in
`docs/architecture/RETENTION_MATRIX.md` per store. A soft-deleted source keeps
its derived rows until the purge that removes it runs, and not every purge is
enabled by default; the matrix, not this file, is where that is recorded.

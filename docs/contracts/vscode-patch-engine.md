# VS Code Extension: Patch-Edit Contract

**Status**: Draft v1 — Wave 1 Q2 2026
**Owner**: SYSTEM zone (VS Code Extension)
**Last updated**: 2026-03-19

---

## 1. Current State (Audit Findings)

### 1.1 Edit Paths — Three Independent Mechanisms

The VS Code extension currently has **three separate edit paths** that do not share code or contracts:

| Path | File | Mechanism | Scope |
|------|------|-----------|-------|
| **Agent Mode** | `agentModeProvider.ts` | Whole-file replacement via ````edit:path``` blocks | Multi-file batch |
| **Inline Commands** | `applyEdit.ts` | Selection replacement via extracted code block | Single selection |
| **Diff Decorations** | `diffDecorationProvider.ts` | Range replacement via CodeLens accept/reject | Single range per session |

### 1.2 Weaknesses Identified

1. **Whole-file replacement in Agent Mode**: The LLM must generate the COMPLETE new file content for every edit. For a 500-line file where 3 lines change, the LLM produces ~500 lines of output (497 unchanged). This wastes tokens, increases latency, and raises the chance of accidental mutations in unchanged code.

2. **No conflict detection**: None of the three paths check whether the file has been modified between patch generation and application. `applyEdit.ts` catches the VS Code `WorkspaceEdit` failure but cannot explain what conflicted. `agentModeProvider.ts` has no protection at all — it blindly replaces the full range.

3. **No unified patch format**: The agent uses ````edit:path``` (whole file), inline commands use extracted code blocks (selection-scoped), and diff decorations take raw range+text pairs. There is no shared data structure for "a proposed change."

4. **No batch atomicity**: Agent mode applies edits sequentially via `WorkspaceEdit`. If file 3 of 5 fails, files 1-2 are already modified. The undo mechanism exists (`undoBatch`) but requires manual user action.

5. **Diff decorations are disconnected from agent mode**: The `DiffDecorationProvider` (with its accept/reject CodeLens) is only used by the extension's command system. Agent mode uses its own diff preview via `vscode.diff` with custom URI schemes. These two systems should converge.

6. **File content cap in reads**: `readFiles()` in agent mode caps at 10,000 characters. This is insufficient for most real source files, and there is no indication to the LLM that content was truncated.

---

## 2. Patch Format Specification

### 2.1 Primary Format: Search-and-Replace Blocks

The patch format is **search-and-replace blocks**, chosen over unified diff (fragile line-number dependencies) and AST edits (language-specific, complex to implement).

```
<<<<<<< SEARCH
exact text to find in the file
=======
replacement text
>>>>>>> REPLACE
```

**Rules**:
- The SEARCH block must match exactly one location in the target file (byte-identical, including whitespace and indentation).
- The REPLACE block contains the full replacement text for the matched region.
- Multiple search-and-replace blocks may appear in a single patch for the same file. They are applied top-to-bottom; earlier replacements must not invalidate later SEARCH blocks (the LLM must account for this, or each block must reference the file state after prior blocks are applied).
- An empty SEARCH block means "insert at the beginning of the file."
- An empty REPLACE block means "delete the matched text."

### 2.2 Patch Envelope

Each patch is wrapped in a file-scoped envelope:

```
```patch:path/to/file.ts
<<<<<<< SEARCH
old code
=======
new code
>>>>>>> REPLACE
```​
```

Multiple patches for different files appear as separate ` ```patch:path ``` ` blocks.

### 2.3 File Creation

New files use an empty SEARCH block:

```
```patch:path/to/new-file.ts
<<<<<<< SEARCH
=======
// entire new file content
export function hello() { return "world"; }
>>>>>>> REPLACE
```​
```

### 2.4 File Deletion

File deletion is expressed as a special directive (not a patch):

```
```delete:path/to/old-file.ts
```​
```

### 2.5 Backward Compatibility

During the transition period, the agent mode parser MUST continue to accept the legacy ````edit:path``` ` whole-file format and convert it internally to a single search-and-replace block where SEARCH = entire original file and REPLACE = entire new content. This ensures existing conversations and prompts keep working.

---

## 3. Application Semantics

### 3.1 Open Files (Active Editors)

1. Read the document text from `vscode.workspace.openTextDocument(uri)`, not from disk. This ensures unsaved changes are respected.
2. Execute search: find the SEARCH text in the document. If not found, enter conflict resolution (section 4).
3. Compute the `vscode.Range` of the match.
4. Stage the replacement but DO NOT apply yet — queue it for the review flow (section 5).

### 3.2 Unsaved Files

Same as open files. The `TextDocument` reflects the in-memory (dirty) state. After patch application, the file remains dirty (unsaved) — the user decides when to save.

### 3.3 Files Not in Editor

1. Open the file via `vscode.workspace.openTextDocument(uri)`.
2. Apply the same search-and-match logic.
3. After application, the file is opened in the editor in a dirty state.
4. For new file creation: use `vscode.workspace.fs.writeFile` to create the file, then open it.

### 3.4 Application Order

Within a single file, patches are applied **bottom-to-top** (highest line number first) to preserve line offsets for earlier patches. Across files, application order does not matter since files are independent.

---

## 4. Conflict Handling

### 4.1 Detection

A conflict occurs when the SEARCH text cannot be found in the current document content. Causes:
- The file was edited by the user after the LLM generated the patch.
- The LLM hallucinated content that does not exist in the file.
- A prior patch in the same batch modified the region.

### 4.2 Resolution Strategy

1. **Fuzzy match attempt**: If exact match fails, attempt a fuzzy match using normalized whitespace (collapse runs of whitespace to single spaces, ignore trailing whitespace per line). If a unique fuzzy match is found, use it with a warning badge in the diff preview.

2. **User notification**: If no match (exact or fuzzy) is found, show a warning:
   ```
   Patch conflict in path/to/file.ts: could not locate the target code block.
   The file may have changed since the patch was generated.
   ```
   Offer: `Show Expected Content` | `Skip This Patch` | `Open Diff View`

3. **"Show Expected Content"**: Opens a read-only document showing the SEARCH text so the user can manually locate it.

4. **Batch behavior**: A failed patch in a batch does NOT block other patches. Each patch is independent. The batch result reports which patches succeeded and which failed.

### 4.3 Staleness Guard

Before applying any patch, compute a lightweight hash (first 64 bytes + length + last 64 bytes) of the target file content at patch generation time. Store this in the patch metadata. At application time, recompute and compare. If mismatched, warn the user that the file has changed but still attempt the match.

---

## 5. Accept/Reject Flow

### 5.1 Review Interface

All patches — whether from agent mode, inline commands, or chat participant — flow through the **DiffDecorationProvider** for review. This is the single review surface.

**Flow**:
1. Agent/command generates one or more patches.
2. Each patch is parsed into a `PatchProposal` (new type — see section 7).
3. Each `PatchProposal` is registered with `DiffDecorationProvider.showPatch(editor, proposal)`.
4. The provider renders inline decorations (green=added, red=removed, orange=modified) and CodeLens buttons: `Accept` | `Reject` | `Accept All`.
5. User clicks `Accept` or `Reject` per patch, or `Accept All` for the file.

### 5.2 Batch Review (Agent Mode)

For multi-file agent edits, the existing QuickPick flow is preserved but enhanced:

1. Show QuickPick with file list: `Accept All` | `Reject All` | individual files.
2. For individually selected files, open each in the editor with diff decorations (not the `vscode.diff` command — use inline decorations instead).
3. The user reviews and accepts/rejects per-hunk using CodeLens.
4. A summary notification reports: "Applied 4/5 patches (1 rejected)."

### 5.3 Auto-Accept Mode

When `agiWorkforce.autoApplyFixes` is `true` and the command is `fix`, patches are applied immediately without review. This existing behavior is preserved.

---

## 6. Batch Operations

### 6.1 Batch Identity

Every set of related patches gets a `batchId` (format: `batch-{timestamp}-{random4}`). All patches in a batch share this ID.

### 6.2 Atomic Undo

The existing `undoBatch` mechanism is preserved. When the user clicks "Undo Batch":
1. All files modified in the batch are reverted to their pre-patch content.
2. Files created in the batch are deleted.
3. Files deleted in the batch are restored (requires storing the original content in the batch record).

### 6.3 Partial Application

If the user accepts only some patches in a batch, a new sub-batch is created containing only the accepted patches. The undo button on the sub-batch reverts only those accepted patches.

---

## 7. Data Types

```typescript
/** A single search-and-replace operation within one file. */
interface PatchHunk {
  /** Text to search for in the file. Empty string = insert at beginning. */
  search: string;
  /** Replacement text. Empty string = delete the matched region. */
  replace: string;
}

/** All hunks targeting a single file. */
interface FilePatch {
  /** Relative path from workspace root. */
  filePath: string;
  /** Resolved URI. */
  uri: vscode.Uri;
  /** Ordered list of hunks to apply (top-to-bottom in source order). */
  hunks: PatchHunk[];
  /** Operation type. */
  operation: 'modify' | 'create' | 'delete';
}

/** A batch of patches across multiple files. */
interface PatchBatch {
  id: string;
  timestamp: number;
  description: string;
  patches: FilePatch[];
  /** Snapshot of original content per file, for undo. */
  snapshots: Map<string, string>;
}

/** A single hunk registered with the DiffDecorationProvider for review. */
interface PatchProposal {
  id: string;
  batchId: string;
  filePath: string;
  uri: vscode.Uri;
  range: vscode.Range;
  originalText: string;
  newText: string;
  status: 'pending' | 'accepted' | 'rejected' | 'conflict';
}
```

---

## 8. Integration with Agent Mode

### 8.1 System Prompt Update

The agent mode system prompt (in `agentModeProvider.ts`) must be updated to instruct the LLM to use the new patch format:

```
To edit a file, use search-and-replace blocks:

```patch:path/to/file.ts
<<<<<<< SEARCH
exact existing code to find
=======
replacement code
>>>>>>> REPLACE
```​

Rules:
- The SEARCH block must match exactly in the file.
- You can include multiple SEARCH/REPLACE blocks per file.
- Always read a file before editing it.
- Only include the code that changes, not the entire file.
```

### 8.2 Parser Update

`parseFileEdits()` in `agentModeProvider.ts` must be extended to parse both:
- Legacy: ` ```edit:path ``` ` (whole-file)
- New: ` ```patch:path ``` ` with `<<<<<<< SEARCH ... >>>>>>> REPLACE` blocks

### 8.3 Application Flow

```
LLM response
    |
    v
parsePatches(response) -> FilePatch[]
    |
    v
validatePatches(patches) -> PatchValidationResult[]
    |
    v
showPatchReview(patches) -> user accepts/rejects
    |
    v
applyAcceptedPatches(patches) -> PatchBatch (for undo)
```

---

## 9. Error Recovery

### 9.1 Patch Application Failure

If `vscode.workspace.applyEdit()` returns `false`:
1. Log the failure with the file path and range.
2. Show user notification: "Failed to apply patch to {file}. The file may have been modified."
3. Offer: `Retry` | `Skip` | `Show Diff`
4. `Retry` re-reads the document and re-attempts the search.
5. `Skip` marks the patch as failed and continues with remaining patches.
6. `Show Diff` opens a side-by-side diff view.

### 9.2 Parse Failure

If the LLM response contains malformed patch blocks:
1. Log the raw block for debugging.
2. Show: "Could not parse patch block — the AI response may be malformed."
3. Offer: `View Raw Response` | `Dismiss`

### 9.3 Undo Failure

If undo fails (file moved, deleted, or permissions changed):
1. Report which files could not be reverted.
2. Show the stored original content in a new tab so the user can manually restore.

---

## 10. Migration Plan

### Phase 1 (Wave 2 — this quarter)
- Implement `parsePatchBlocks()` parser alongside existing `parseFileEdits()`.
- Add the `PatchHunk`, `FilePatch`, `PatchBatch`, `PatchProposal` types.
- Update agent mode system prompt to prefer patch format.
- Keep legacy parser as fallback.

### Phase 2 (Wave 3)
- Route inline command results (`applyEdit.ts`) through the patch system.
- Unify diff preview: all edits go through `DiffDecorationProvider`.
- Remove the custom `agi-original`/`agi-modified` URI scheme providers from agent mode.

### Phase 3 (Wave 4)
- Add staleness guard (content hashing).
- Add fuzzy match fallback.
- Deprecate legacy ````edit:path``` ` format (stop generating, keep parsing).
- Add telemetry: patch success rate, conflict rate, undo rate.

---

## 11. Non-Goals (Out of Scope)

- **AST-level edits**: Too language-specific. Search-and-replace is language-agnostic.
- **Streaming patch application**: Patches are applied after the full LLM response. Streaming partial patches introduces ordering and cancellation complexity that is not justified yet.
- **Cross-workspace patches**: All patches are scoped to the first workspace folder.
- **Git integration**: Patches do not auto-commit. The user manages git independently.

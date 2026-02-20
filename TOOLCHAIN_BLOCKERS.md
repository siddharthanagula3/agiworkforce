# TOOLCHAIN BLOCKERS

## Bug 1: Approval Modal "Approve" Fails (Missing requestId)

### Repro Steps
1. Trigger a tool requiring confirmation (e.g., terminal execute)
2. Click "Approve" in the modal
3. Error: "Failed to approve operation" - missing required key `requestId`

### Root Cause
The Rust backend uses `request_id` as a parameter, but Tauri automatically converts snake_case Rust params to camelCase in TypeScript. So `request_id` in Rust becomes `requestId` in TypeScript. The TypeScript code was passing `request_id` (snake_case) instead of `requestId` (camelCase).

### Fix Applied
- File: `apps/desktop/src/api/toolConfirmation.ts`
- Changed `request_id: requestId` to `requestId: requestId`
- Changed `remember_choice: rememberChoice` to `rememberChoice: rememberChoice`

### Verification
[Pending - need to test in app]

### Follow-ups
- [ ] Add defensive UX (disable buttons until requestId is present)
- [ ] Add error handling for missing requestId

---

## Bug 2: File Read Fails ("No such file or directory")

### Repro Steps
1. List files in ~/Documents
2. Try to read a PDF file
3. Error: "No such file or directory (os error 2)"

### Root Cause
The MCP filesystem server (`@modelcontextprotocol/server-filesystem`) expects absolute paths, but when paths contain tilde (`~`), they are passed as-is without expansion. For example, `~/Documents/file.pdf` is passed directly instead of `/Users/siddhartha/Documents/file.pdf`.

### Fix Applied
- File: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs`
- Added `expand_tilde_in_args()` function that expands `~` to home directory in path fields (`path`, `file_path`, `directory`, `dir`, `root`)
- Applied in `execute_mcp_tool()` before passing args to MCP server

### Verification
[Pending - need to test in app]

### Follow-ups
- [ ] Add test for tilde expansion
- [ ] Consider normalizing paths in list_directory results too

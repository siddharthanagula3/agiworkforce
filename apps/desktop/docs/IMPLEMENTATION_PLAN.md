# AGI Workforce Desktop - Advanced Features Implementation Plan

## ✅ Bugs Fixed (Session Start)

- [x] **Fixed: Missing `FloatingModelSelector` import** in `UnifiedAgenticChat/index.tsx`
- [x] **Fixed: Missing `handleInputChange` function** in `ChatInputArea.tsx`

---

## 📋 Master TODO List

### Phase 1: Foundation & Bug Fixes (Days 1-2)

#### 1.1 Critical Bug Fixes

- [ ] Run TypeScript type-check to identify all type errors
- [ ] Fix any ESLint warnings/errors
- [ ] Test FloatingModelSelector renders correctly
- [ ] Test ChatInputArea input functionality works

#### 1.2 Database Schema Migration

- [ ] Create migration file for `tool_executions` table
- [ ] Create migration file for `file_metadata` table
- [ ] Create migration file for `file_tags` table
- [ ] Create migration file for `message_drafts` table
- [ ] Create migration file for `approval_settings` table
- [ ] Create migration file for `execution_plans` table
- [ ] Run migrations and verify schema

#### 1.3 State Management Updates

- [ ] Update `unifiedChatStore.ts` with execution history state
- [ ] Add draft auto-save state management
- [ ] Add file metadata state management

---

### Phase 2: Advanced Tool Execution (Days 3-5)

#### 2.1 Execution History Panel

- [ ] Create `components/ToolExecution/ExecutionHistoryPanel.tsx`
  - Timeline view of all tool executions
  - Filter by tool, status, date range
  - Expandable details (parameters & results)
  - Pause/Resume/Cancel buttons
  - Live status updates via WebSocket/SSE

#### 2.2 Pause/Resume Backend Integration

- [ ] Add `pause_execution` command handler
- [ ] Add `resume_execution` command handler
- [ ] Add `cancel_execution` command handler
- [ ] Add execution streaming updates

#### 2.3 Approval Settings

- [ ] Create `components/ToolExecution/ApprovalSettingsDialog.tsx`
  - Toggle "Auto-approve for this conversation"
  - Duration picker for auto-approve
  - Per-tool approval settings
  - "Always ask" / "Always approve" / "Smart approval" options
  - Warning for destructive operations

#### 2.4 Progressive Streaming View

- [ ] Create `components/ToolExecution/ProgressiveStreamingView.tsx`
  - Real-time log streaming
  - Progress indicators for multi-step tools
  - Intermediate results display
  - Pause button during execution

---

### Phase 3: Enhanced File Handling (Days 6-9)

#### 3.1 PDF Viewer

- [ ] Install `react-pdf` or `@react-pdf-viewer/core`
- [ ] Create `components/FileViewer/PDFViewer.tsx`
  - Page navigation (previous/next, jump to page)
  - Zoom controls
  - Text selection and copy
  - Search within PDF
  - Thumbnail sidebar

#### 3.2 Office File Preview

- [ ] Create `components/FileViewer/OfficePreview.tsx`
  - Strategy: Convert to PDF via backend OR embed
  - Support for .docx, .xlsx, .pptx

#### 3.3 Image with OCR

- [ ] Create `components/FileViewer/ImageWithOCR.tsx`
  - Show image with OCR text overlay
  - Toggle OCR text visibility
  - Copy extracted text
  - Edit/correct OCR text

#### 3.4 Attachment Library

- [ ] Create `components/FileManager/AttachmentLibrary.tsx`
  - Grid/List view of all attachments
  - Filter by type, date, conversation
  - Search by filename or extracted text
  - Tag management
  - Quick preview on hover
  - Bulk operations (delete, tag, download)

---

### Phase 4: Smart Features (Days 10-13)

#### 4.1 Conversation Search

- [ ] Create `components/Search/GlobalSearch.tsx`
  - Search bar in header (Cmd+F hotkey)
  - Real-time search results
  - Grouped by conversation
  - Highlight matching text
  - Filter by date, role, conversation
  - Jump to message in conversation

#### 4.2 Smart Suggestions

- [ ] Create `components/Suggestions/SmartSuggestions.tsx`
  - Show 3-5 suggestions based on context
  - Update as user types
  - Animate in/out
  - Click to use suggestion
  - Thumbs up/down for learning

#### 4.3 Draft Recovery

- [ ] Create `components/Input/DraftRecovery.tsx`
  - Auto-save every 2 seconds
  - Show "Draft saved" indicator
  - Recover draft on conversation switch
  - "Discard draft" option

#### 4.4 Plan Editor

- [ ] Create `components/Planning/PlanEditor.tsx`
  - Drag-and-drop step ordering
  - Add/remove/edit steps
  - Dependency visualization (graph view)
  - Execute plan button
  - Pause/resume during execution
  - Fork plan from any step

---

### Phase 5: Polish & Testing (Days 14-16)

#### 5.1 Integration Testing

- [ ] Write unit tests for new components
- [ ] Integration tests for file processing pipeline
- [ ] Search accuracy tests
- [ ] Pause/resume state machine tests

#### 5.2 Manual Verification

- [ ] Tool Execution: Test long-running tool pause/resume/cancel
- [ ] File Handling: Upload PDF/DOCX/image, verify preview and OCR
- [ ] Search: Search across conversations, verify relevance
- [ ] Drafts: Type message, switch conversation, verify recovery
- [ ] Planning: Create multi-step plan, execute, verify dependencies

#### 5.3 Performance Optimization

- [ ] Search response time < 100ms for 1000+ conversations
- [ ] PDF rendering < 500ms per page
- [ ] OCR processing < 2s for standard image
- [ ] Draft auto-save overhead < 10ms

---

## 📁 Files to Create (Frontend Only)

### ToolExecution Components

```
components/ToolExecution/
├── ExecutionHistoryPanel.tsx    [NEW]
├── ApprovalSettingsDialog.tsx   [NEW]
├── ProgressiveStreamingView.tsx [NEW]
└── index.ts                     [UPDATE]
```

### FileViewer Components

```
components/FileViewer/
├── PDFViewer.tsx               [NEW]
├── OfficePreview.tsx           [NEW]
├── ImageWithOCR.tsx            [NEW]
└── index.ts                    [NEW]
```

### FileManager Components

```
components/FileManager/
├── AttachmentLibrary.tsx       [NEW]
├── FileGrid.tsx                [NEW]
├── FileList.tsx                [NEW]
├── FileTags.tsx                [NEW]
├── FileSearch.tsx              [NEW]
└── index.ts                    [NEW]
```

### Search Components

```
components/Search/
├── GlobalSearch.tsx            [NEW]
├── SearchResults.tsx           [NEW]
├── SearchFilters.tsx           [NEW]
└── index.ts                    [NEW]
```

### Suggestions Components

```
components/Suggestions/
├── SmartSuggestions.tsx        [NEW]
├── SuggestionCard.tsx          [NEW]
└── index.ts                    [NEW]
```

### Input Components

```
components/Input/
├── DraftRecovery.tsx           [NEW]
├── DraftIndicator.tsx          [NEW]
└── index.ts                    [NEW]
```

### Planning Components

```
components/Planning/
├── PlanEditor.tsx              [NEW]
├── PlanStep.tsx                [NEW]
├── PlanGraph.tsx               [NEW]
├── PlanToolbar.tsx             [NEW]
└── index.ts                    [NEW]
```

---

## 📦 Dependencies to Add

### package.json additions:

```json
{
  "react-pdf": "^7.5.1",
  "@react-pdf-viewer/core": "^3.12.0",
  "react-beautiful-dnd": "^13.1.1"
}
```

### Already Available (no changes needed):

- `fuse.js` - ✅ Already installed (for search)
- `framer-motion` - ✅ Already installed (animations)
- `@monaco-editor/react` - ✅ Already installed (code editing)
- `react-markdown` - ✅ Already installed

---

## 🎯 Implementation Priority Matrix

| Feature           | Priority | Complexity | Impact |
| ----------------- | -------- | ---------- | ------ |
| Bug Fixes         | P0       | Low        | High   |
| Execution History | P1       | Medium     | High   |
| Draft Auto-save   | P1       | Low        | High   |
| Global Search     | P1       | Medium     | High   |
| PDF Viewer        | P2       | Medium     | Medium |
| Smart Suggestions | P2       | High       | Medium |
| Plan Editor       | P3       | High       | Medium |
| OCR Integration   | P3       | High       | Low    |

---

## 🔧 Configuration Files to Update

1. **vite.config.ts** - Add react-pdf worker configuration
2. **tailwind.config.js** - Add custom animations for new components
3. **tsconfig.json** - No changes needed

---

## ⚠️ Questions Before Implementation

1. **OCR Provider**: Do you want to use:
   - Local Tesseract (requires system installation)
   - Cloud API (Google Vision, AWS Textract)
   - Both with fallback?

2. **Office File Conversion**: Preference for:
   - LibreOffice headless (local, free)
   - Cloud service (faster, costs money)

3. **Search Implementation**: Prefer:
   - Frontend-only search with Fuse.js (simpler)
   - Full-text search with Tantivy backend (more powerful)

4. **Database Migrations**: Do you want me to:
   - Create Rust migration files now
   - Wait until backend is ready

---

## 📊 Current Project Statistics

- **Total Components**: 200+
- **Stores**: 30+
- **Types Files**: 25
- **Dependencies**: 70+
- **Lines of Code (Frontend)**: ~50,000

---

## Next Steps

1. ✅ Fixed critical bugs
2. Choose which phase to start with
3. Answer the questions above
4. Begin implementation

---

_Created: November 24, 2025_
_Last Updated: November 24, 2025_

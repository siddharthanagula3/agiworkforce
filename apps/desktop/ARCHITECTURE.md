# Architecture Overview - Advanced Chat Features

## Component Hierarchy

```
ChatInterfaceEnhanced
├── MessageList
│   └── MessageEnhanced (multiple)
│       ├── FileAttachmentPreview (multiple)
│       │   └── Image or File Icon
│       ├── ReactMarkdown
│       │   └── SyntaxHighlighter (for inline code)
│       └── ArtifactRenderer (multiple)
│           ├── CodeArtifact
│           │   └── SyntaxHighlighter
│           ├── ChartArtifact
│           │   └── Recharts components
│           ├── TableArtifact
│           │   └── HTML Table
│           └── MermaidArtifact
│               └── Code Block (placeholder)
└── InputComposerEnhanced
    ├── FileDropZone
    │   └── Upload Icon + Instructions
    ├── FileAttachmentPreview (multiple)
    │   └── Remove Button
    ├── Textarea
    │   └── Character Counter
    └── Action Buttons
        ├── Attach Button
        └── Send Button
```

## Data Flow

```
User Action
    ↓
InputComposerEnhanced
    ↓
    ├─→ File Selection
    │       ↓
    │   validateFiles() [fileUtils.ts]
    │       ↓
    │   readFileAsDataURL() [fileUtils.ts]
    │       ↓
    │   FileAttachment objects created
    │       ↓
    │   State updated (attachments array)
    │       ↓
    │   FileAttachmentPreview rendered
    │
    └─→ Send Message
            ↓
        uploadFiles() [fileUpload.ts] (optional)
            ↓
        extractArtifacts() [fileUpload.ts]
            ↓
        onSend callback
            ↓
        ChatStore.sendMessage()
            ↓
        Backend API (Tauri commands)
            ↓
        Message saved to database
            ↓
        State updated (messages array)
            ↓
        MessageEnhanced rendered
            ↓
        ├─→ FileAttachmentPreview (for attachments)
            └─→ ArtifactRenderer (for artifacts)
```

## File Validation Flow

```
File Drop/Select
    ↓
FileDropZone.handleDrop()
    ↓
validateFiles() [fileUtils.ts]
    ↓
    ├─→ For each file:
    │       ↓
    │   validateFile()
    │       ↓
    │       ├─→ Check file size
    │       │   └─→ isValidFileSize()
    │       │
    │       └─→ Check file type
    │           └─→ isSupportedFileType()
    │
    ├─→ Valid files → onFilesSelected()
    │
    └─→ Invalid files → onError()
            ↓
        Toast notification
```

## Type Relationships

```
Message
├── id: string
├── role: 'user' | 'assistant' | 'system'
├── content: string
├── timestamp: Date
├── tokens?: number
├── cost?: number
├── artifacts?: Artifact[]
│   └── Artifact
│       ├── id: string
│       ├── type: ArtifactType
│       ├── title?: string
│       ├── content: string
│       ├── language?: string
│       └── metadata?: Record<string, any>
│
└── attachments?: FileAttachment[]
    └── FileAttachment
        ├── id: string
        ├── name: string
        ├── size: number
        ├── type: string (MIME)
        ├── url?: string
        ├── data?: string (base64)
        ├── uploadProgress?: number
        └── error?: string
```

## Module Dependencies

```
Components Layer
    ├── ChatInterfaceEnhanced
    │   ├── Uses: MessageList, InputComposerEnhanced
    │   ├── Imports: chatStore, fileUpload, sonner
    │   └── Exports: ChatInterface, createExampleArtifacts, createExampleMessage
    │
    ├── MessageEnhanced
    │   ├── Uses: ArtifactRenderer, FileAttachmentPreview
    │   ├── Imports: react-markdown, react-syntax-highlighter
    │   └── Exports: Message
    │
    ├── InputComposerEnhanced
    │   ├── Uses: FileDropZone, FileAttachmentPreview
    │   ├── Imports: fileUtils, sonner
    │   └── Exports: InputComposer
    │
    ├── ArtifactRenderer
    │   ├── Uses: SyntaxHighlighter, Recharts
    │   ├── Imports: useTheme
    │   └── Exports: ArtifactRenderer
    │
    ├── FileAttachmentPreview
    │   ├── Uses: UI components
    │   ├── Imports: fileUtils
    │   └── Exports: FileAttachmentPreview
    │
    └── FileDropZone
        ├── Uses: UI components
        ├── Imports: fileUtils
        └── Exports: FileDropZone

Utils Layer
    ├── fileUtils.ts
    │   ├── Dependencies: None (pure functions)
    │   └── Exports: Validation, formatting, type checks, file operations
    │
    └── fileUpload.ts
        ├── Dependencies: @tauri-apps/api, fileUtils
        └── Exports: Upload, download, artifact extraction

Types Layer
    └── chat.ts
        ├── Dependencies: None
        └── Exports: All type definitions

Store Layer
    └── chatStore.ts (existing, requires updates)
        ├── Dependencies: @tauri-apps/api, chat types
        └── Exports: useChatStore hook
```

## State Management

```
Component State (useState)
├── InputComposerEnhanced
│   ├── content: string
│   ├── attachments: FileAttachment[]
│   └── isProcessing: boolean
│
├── MessageEnhanced
│   └── copied: boolean
│
├── ArtifactRenderer
│   └── copied: boolean
│
└── FileAttachmentPreview
    └── imageError: boolean

Global State (Zustand - chatStore)
├── conversations: ConversationUI[]
├── activeConversationId: number | null
├── messages: MessageUI[]
├── loading: boolean
└── error: string | null
```

## Event Flow

### File Upload Flow

```
1. User Action
   ├── Drag files over input area
   │   └→ FileDropZone.handleDragIn()
   │
   ├── Drop files
   │   └→ FileDropZone.handleDrop()
   │       └→ InputComposerEnhanced.handleFileDrop()
   │
   └── Click attach button
       └→ InputComposerEnhanced.handleFileSelect()

2. File Processing
   └→ InputComposerEnhanced.processFiles()
       ├→ validateFile() for each file
       ├→ readFileAsDataURL() for valid files
       └→ Update attachments state

3. Preview Display
   └→ FileAttachmentPreview renders for each attachment
       ├→ Image: Show preview
       └→ Document: Show metadata

4. Send Message
   └→ InputComposerEnhanced.handleSend()
       └→ onSend(content, attachments)
           └→ ChatStore.sendMessage()
               ├→ uploadFiles() (optional)
               ├→ extractArtifacts()
               └→ API call to backend
```

### Artifact Rendering Flow

```
1. Message Received
   └→ Message includes artifacts array

2. Message Component Renders
   └→ MessageEnhanced component
       └→ Maps over artifacts array

3. Artifact Renderer
   └→ ArtifactRenderer component
       ├→ Determines artifact type
       │   ├→ 'code' → CodeArtifact
       │   ├→ 'chart' → ChartArtifact
       │   ├→ 'table' → TableArtifact
       │   └→ 'mermaid' → MermaidArtifact
       │
       └→ Renders with actions
           ├→ Copy button
           └→ Download button
```

## API Integration Points

```
Frontend Components
    ↓
fileUpload.ts
    ↓
invoke() [Tauri API]
    ↓
Backend Commands (Rust)
├── upload_file(filename, data, mime_type)
├── delete_file(file_id)
└── get_file_url(file_id)
    ↓
File System / Cloud Storage
    ↓
Database
├── messages table
│   ├── id
│   ├── content
│   ├── artifacts (JSON)
│   └── attachments (JSON)
│
├── message_artifacts table (optional)
│   ├── id
│   ├── message_id (FK)
│   ├── type
│   ├── content
│   └── metadata
│
└── message_attachments table (optional)
    ├── id
    ├── message_id (FK)
    ├── name
    ├── type
    └── url
```

## Performance Considerations

```
Optimization Points
├── Component Level
│   ├── React.memo for expensive components
│   ├── useMemo for computed values
│   ├── useCallback for event handlers
│   └── Lazy loading for large files
│
├── Rendering Level
│   ├── Virtual scrolling for long lists
│   ├── Progressive image loading
│   ├── Code splitting for artifact renderers
│   └── Debounced file processing
│
└── Data Level
    ├── Base64 optimization (immediate upload)
    ├── Thumbnail generation for images
    ├── Chunked file upload
    └── IndexedDB caching
```

## Error Handling Strategy

```
Error Sources
├── Validation Errors
│   ├── File too large
│   ├── Unsupported file type
│   └── Invalid file content
│       ↓
│   handleFileError()
│       ↓
│   Toast notification
│       ↓
│   Error state on FileAttachmentPreview
│
├── Upload Errors
│   ├── Network failure
│   ├── Server error
│   └── Timeout
│       ↓
│   try/catch in uploadFile()
│       ↓
│   Toast notification
│       ↓
│   ChatStore.error state
│
└── Rendering Errors
    ├── Invalid artifact data
    ├── Malformed JSON
    └── Missing dependencies
        ↓
    Component error boundaries
        ↓
    Fallback UI
        ↓
    Error message display
```

## Testing Strategy

```
Test Pyramid
├── Unit Tests (Base - 60%)
│   ├── fileUtils.test.ts
│   │   ├── Validation functions
│   │   ├── Formatting functions
│   │   └── Type checking functions
│   │
│   └── fileUpload.test.ts (TODO)
│       ├── Upload logic
│       ├── Artifact extraction
│       └── API preparation
│
├── Component Tests (Middle - 30%)
│   ├── ArtifactRenderer.test.tsx
│   │   ├── Render different types
│   │   ├── User interactions
│   │   └── Error handling
│   │
│   └── FileAttachmentPreview.test.tsx
│       ├── Display variations
│       ├── Remove functionality
│       └── Upload progress
│
└── Integration Tests (Top - 10%)
    ├── File upload flow
    ├── Message with artifacts
    ├── Error recovery
    └── Accessibility compliance
```

## Security Layers

```
Client-Side Security
├── Input Validation
│   ├── File type whitelist
│   ├── File size limits
│   └── Filename sanitization
│
├── Content Security
│   ├── XSS prevention (React escaping)
│   ├── Safe markdown rendering
│   └── Sandboxed code display
│
└── State Management
    ├── No sensitive data in state
    ├── Secure file handling
    └── Clean up on unmount

Backend Security (Required)
├── Server-Side Validation
│   ├── Re-validate file types
│   ├── Re-validate file sizes
│   └── Virus scanning
│
├── Access Control
│   ├── Authentication
│   ├── Authorization
│   └── Rate limiting
│
└── Storage Security
    ├── Encrypted storage
    ├── Secure URLs
    └── Expiring links
```

## Deployment Architecture

```
Development
├── Local Tauri dev server
├── Hot module replacement
└── React DevTools

Testing
├── Vitest runner
├── React Testing Library
└── Coverage reporting

Building
├── Vite bundler
│   ├── Code splitting
│   ├── Minification
│   └── Tree shaking
│
└── Tauri bundler
    ├── Platform-specific builds
    ├── Code signing
    └── Auto-updates

Production
├── Desktop Application
│   ├── Windows (.exe, .msi)
│   ├── macOS (.dmg, .app)
│   └── Linux (.deb, .AppImage)
│
└── Backend Services
    ├── File storage
    ├── Database
    └── API endpoints
```

## Scalability Considerations

```
Current Implementation
├── In-memory file handling
├── Base64 encoding
├── Synchronous processing
└── Local storage

Scalable Implementation
├── Streaming file uploads
│   └── Chunked transfer
│
├── Background processing
│   ├── Web Workers
│   └── Service Workers
│
├── Caching strategy
│   ├── IndexedDB for large files
│   ├── Memory cache for thumbnails
│   └── CDN for public assets
│
└── Progressive enhancement
    ├── Lazy load components
    ├── Defer non-critical features
    └── Optimize critical path
```

## Future Architecture

```
Potential Enhancements
├── Real-time Collaboration
│   ├── WebSocket connections
│   ├── Operational transformation
│   └── Conflict resolution
│
├── Advanced Artifacts
│   ├── Mermaid rendering
│   ├── LaTeX equations
│   ├── Interactive notebooks
│   └── 3D visualizations
│
├── Enhanced File Handling
│   ├── Image editing
│   ├── PDF annotation
│   ├── Video preview
│   └── Audio transcription
│
└── AI Features
    ├── Automatic artifact generation
    ├── Image analysis
    ├── Document summarization
    └── Code explanation
```

## Summary

This architecture provides:
- **Modularity**: Components are independent and reusable
- **Scalability**: Can handle increasing complexity
- **Maintainability**: Clear separation of concerns
- **Testability**: Each layer can be tested independently
- **Extensibility**: Easy to add new features
- **Performance**: Optimized for responsiveness
- **Security**: Multiple layers of protection
- **Accessibility**: Built-in WCAG compliance

The implementation follows React best practices, uses TypeScript for type safety, and integrates seamlessly with the existing Tauri-based architecture.

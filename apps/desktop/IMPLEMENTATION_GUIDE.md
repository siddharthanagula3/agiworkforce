# Implementation Guide: Advanced Chat Features

## Quick Start

### 1. Update Your Chat Interface

Replace the existing chat interface with the enhanced version:

```typescript
// Before
import { ChatInterface } from './components/Chat/ChatInterface';

// After
import { ChatInterfaceEnhanced as ChatInterface } from './components/Chat';
```

### 2. Update Type Definitions

The enhanced chat system uses updated types that include artifacts and attachments. These are already defined in `src/types/chat.ts`.

### 3. Test the Implementation

Run the test suite to ensure everything works:

```bash
npm run test
```

## Component Structure

```
src/
├── components/
│   └── Chat/
│       ├── ChatInterface.tsx (original)
│       ├── ChatInterface.enhanced.tsx (enhanced with artifacts)
│       ├── Message.tsx (original)
│       ├── Message.enhanced.tsx (enhanced with artifacts/attachments)
│       ├── InputComposer.tsx (original)
│       ├── InputComposer.enhanced.tsx (enhanced with file upload)
│       ├── ArtifactRenderer.tsx (new - renders artifacts)
│       ├── FileAttachmentPreview.tsx (new - displays attachments)
│       ├── FileDropZone.tsx (new - drag-and-drop zone)
│       ├── MessageList.tsx (unchanged)
│       ├── ConversationSidebar.tsx (unchanged)
│       ├── index.ts (exports all components)
│       └── __tests__/
│           ├── ArtifactRenderer.test.tsx
│           └── FileAttachmentPreview.test.tsx
├── types/
│   └── chat.ts (updated with Artifact and FileAttachment types)
├── utils/
│   ├── fileUtils.ts (new - file validation and formatting)
│   ├── fileUpload.ts (new - upload logic)
│   └── __tests__/
│       └── fileUtils.test.ts
└── stores/
    └── chatStore.ts (may need updates for artifacts/attachments)
```

## Migration Path

### Option 1: Gradual Migration (Recommended)

Keep both old and new components side by side:

```typescript
// Use enhanced components for new features
import {
  ChatInterfaceEnhanced,
  MessageEnhanced,
  InputComposerEnhanced,
} from './components/Chat';

// Old components still available
import {
  ChatInterface,
  Message,
  InputComposer,
} from './components/Chat';
```

### Option 2: Full Migration

Replace all components at once:

1. Update imports in your main chat view
2. Update the chatStore to handle artifacts and attachments
3. Test thoroughly
4. Remove old component files if desired

## Backend Integration

### Step 1: Update Tauri Commands

Add these commands to your Rust backend:

```rust
// src-tauri/src/main.rs

#[derive(serde::Serialize, serde::Deserialize)]
struct FileUploadResponse {
    id: String,
    url: String,
}

#[tauri::command]
async fn upload_file(
    filename: String,
    data: Vec<u8>,
    mime_type: String,
) -> Result<FileUploadResponse, String> {
    // Save file to disk or cloud storage
    let file_id = uuid::Uuid::new_v4().to_string();
    let file_path = format!("uploads/{}", filename);

    std::fs::write(&file_path, data)
        .map_err(|e| e.to_string())?;

    Ok(FileUploadResponse {
        id: file_id,
        url: format!("/files/{}", filename),
    })
}

#[tauri::command]
async fn delete_file(file_id: String) -> Result<(), String> {
    // Delete file from storage
    Ok(())
}
```

Register commands:

```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            upload_file,
            delete_file,
            // ... other commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### Step 2: Update Frontend Upload Logic

Update `src/utils/fileUpload.ts`:

```typescript
export async function uploadFile(
  file: File,
  config?: UploadConfig
): Promise<FileAttachment> {
  const { onProgress } = config || {};

  try {
    // Read file as base64
    const dataUrl = await readFileAsDataURL(file);
    const base64Data = dataUrl.split(',')[1];

    // Call Tauri command
    const result = await invoke<{ id: string; url: string }>('upload_file', {
      filename: file.name,
      data: Array.from(atob(base64Data)).map(c => c.charCodeAt(0)),
      mimeType: file.type,
    });

    // Update progress
    onProgress?.(100);

    return {
      id: result.id,
      name: file.name,
      size: file.size,
      type: file.type,
      url: result.url,
    };
  } catch (error) {
    throw new Error(`Failed to upload ${file.name}: ${error}`);
  }
}
```

### Step 3: Update Database Schema

Add columns to store artifacts and attachments:

```sql
-- Add to messages table
ALTER TABLE messages
ADD COLUMN artifacts TEXT,  -- JSON array of artifacts
ADD COLUMN attachments TEXT; -- JSON array of attachments

-- Or create separate tables for better normalization

CREATE TABLE message_artifacts (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    language TEXT,
    metadata TEXT,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE TABLE message_attachments (
    id TEXT PRIMARY KEY,
    message_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    type TEXT NOT NULL,
    url TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
```

### Step 4: Update Chat Store

Modify `src/stores/chatStore.ts` to handle artifacts and attachments:

```typescript
sendMessage: async (content: string, attachments?: FileAttachment[]) => {
  const { activeConversationId } = get();

  let conversationId = activeConversationId;
  if (!conversationId) {
    conversationId = await get().createConversation('New Conversation');
  }

  set({ loading: true, error: null });

  try {
    // Extract artifacts from content
    const artifacts = extractArtifacts(content);

    // Create user message with attachments
    const userMessageRequest: CreateMessageRequest = {
      conversation_id: conversationId,
      role: 'user',
      content,
      attachments: attachments ? prepareAttachmentsForApi(attachments) : undefined,
    };

    const userMessage = await invoke<Message>('chat_create_message', {
      request: userMessageRequest,
    });

    set((state) => ({
      messages: [...state.messages, toMessageUI(userMessage)],
    }));

    // Get AI response
    const llmResponse = await invoke<{
      content: string;
      tokens: number | null;
      cost: number | null;
      model: string;
      artifacts?: Artifact[];
    }>('llm_send_message', {
      request: {
        messages: get().messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        model: null,
        provider: null,
        temperature: null,
        max_tokens: null,
      },
    });

    // Save assistant response with artifacts
    const assistantMessageRequest: CreateMessageRequest = {
      conversation_id: conversationId,
      role: 'assistant',
      content: llmResponse.content,
      tokens: llmResponse.tokens,
      cost: llmResponse.cost,
      artifacts: llmResponse.artifacts || extractArtifacts(llmResponse.content),
    };

    const assistantMessage = await invoke<Message>('chat_create_message', {
      request: assistantMessageRequest,
    });

    set((state) => ({
      messages: [...state.messages, toMessageUI(assistantMessage)],
      loading: false,
    }));

    await get().loadConversations();
  } catch (error) {
    console.error('Failed to send message:', error);
    set({ error: String(error), loading: false });
    throw error;
  }
},
```

## Usage Examples

### Example 1: Basic File Upload

```typescript
import { InputComposerEnhanced } from './components/Chat';

function ChatView() {
  const handleSend = async (content: string, attachments?: FileAttachment[]) => {
    console.log('Message:', content);
    console.log('Attachments:', attachments);

    // Send to backend
    await sendMessage(content, attachments);
  };

  return <InputComposerEnhanced onSend={handleSend} />;
}
```

### Example 2: Displaying Messages with Artifacts

```typescript
import { MessageEnhanced } from './components/Chat';

function MessageView({ message }) {
  return (
    <MessageEnhanced
      message={{
        ...message,
        artifacts: [
          {
            id: '1',
            type: 'code',
            language: 'python',
            content: 'def hello():\n    print("Hello, world!")',
          },
        ],
      }}
    />
  );
}
```

### Example 3: Creating Chart Artifacts

```typescript
import { generateId } from './utils/fileUtils';
import type { Artifact } from './types/chat';

function createSalesChart(salesData: any[]): Artifact {
  return {
    id: generateId(),
    type: 'chart',
    title: 'Sales Performance',
    content: JSON.stringify({
      type: 'bar',
      xKey: 'month',
      data: salesData,
      bars: [
        { dataKey: 'sales', color: '#8884d8' },
        { dataKey: 'target', color: '#82ca9d' },
      ],
    }),
  };
}
```

### Example 4: Custom File Validation

```typescript
import { validateFile, MAX_FILE_SIZE } from './utils/fileUtils';

function handleFileSelect(file: File) {
  const result = validateFile(file);

  if (!result.valid) {
    toast.error(result.error);
    return;
  }

  // Custom validation
  if (file.name.includes('confidential')) {
    toast.error('Cannot upload confidential files');
    return;
  }

  // Proceed with upload
  processFile(file);
}
```

## Styling and Theming

All components use Tailwind CSS and support dark mode:

```typescript
// Components automatically respect theme
const { theme } = useTheme();

// Components adapt styling based on theme
<ArtifactRenderer artifact={artifact} />
```

### Customizing Styles

Override component styles using className prop:

```typescript
<FileAttachmentPreview
  attachment={file}
  className="rounded-xl shadow-lg"
/>

<InputComposerEnhanced
  onSend={handleSend}
  className="border-2 border-primary"
/>
```

## Performance Optimization

### 1. Lazy Load Large Files

```typescript
const [imageLoaded, setImageLoaded] = useState(false);

<img
  src={attachment.data}
  loading="lazy"
  onLoad={() => setImageLoaded(true)}
/>
```

### 2. Virtualize Large Attachment Lists

```typescript
import { FixedSizeGrid } from 'react-window';

<FixedSizeGrid
  columnCount={4}
  rowCount={Math.ceil(attachments.length / 4)}
  columnWidth={200}
  rowHeight={200}
>
  {({ columnIndex, rowIndex, style }) => (
    <div style={style}>
      <FileAttachmentPreview
        attachment={attachments[rowIndex * 4 + columnIndex]}
      />
    </div>
  )}
</FixedSizeGrid>
```

### 3. Debounce File Processing

```typescript
import { useDebouncedCallback } from 'use-debounce';

const debouncedProcessFiles = useDebouncedCallback(
  (files: File[]) => processFiles(files),
  300
);
```

## Troubleshooting

### Issue: TypeScript Errors

If you see type errors, ensure you've updated your imports:

```typescript
// Use enhanced types
import type { Message } from './types/chat'; // Has artifacts and attachments
```

### Issue: Components Not Rendering

Check that all required UI components are imported:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
```

### Issue: File Upload Not Working

Verify:
1. Tauri commands are registered
2. File system permissions are set
3. MIME types are correctly identified
4. File size is within limits

### Issue: Charts Not Displaying

Ensure recharts is installed:

```bash
npm install recharts
```

## Testing

### Run All Tests

```bash
npm run test
```

### Run Specific Test Suite

```bash
npm run test -- fileUtils.test.ts
```

### Coverage Report

```bash
npm run test:coverage
```

## Deployment Checklist

Before deploying to production:

- [ ] All tests passing
- [ ] File upload backend implemented
- [ ] File size limits configured
- [ ] Error handling tested
- [ ] Accessibility verified
- [ ] Cross-browser tested
- [ ] Performance profiled
- [ ] Security review completed
- [ ] Documentation updated
- [ ] User guide created

## Support and Resources

- **Documentation**: See `CHAT_FEATURES_DOCUMENTATION.md`
- **Examples**: Check `ChatInterface.enhanced.tsx`
- **Tests**: Review test files for usage examples
- **Types**: See `src/types/chat.ts` for all type definitions

## Contributing

When adding new features:

1. Update type definitions
2. Add comprehensive tests
3. Update documentation
4. Follow existing patterns
5. Ensure accessibility
6. Test on multiple browsers
7. Add usage examples

# Quick Reference Guide - Advanced Chat Features

## Installation & Setup

### 1. Install Dependencies (Already Installed)
```bash
# All dependencies already in package.json
npm install
```

### 2. Import Components
```typescript
// Use enhanced components
import {
  ChatInterfaceEnhanced,
  MessageEnhanced,
  InputComposerEnhanced,
  ArtifactRenderer,
  FileAttachmentPreview,
} from './components/Chat';
```

### 3. Run Tests
```bash
npm run test
```

## Common Patterns

### Pattern 1: Basic File Upload
```typescript
import { InputComposerEnhanced } from './components/Chat';

function MyChat() {
  const handleSend = (content: string, attachments?: FileAttachment[]) => {
    // Your logic here
  };

  return <InputComposerEnhanced onSend={handleSend} />;
}
```

### Pattern 2: Display Message with Artifacts
```typescript
import { MessageEnhanced } from './components/Chat';

<MessageEnhanced
  message={{
    id: '1',
    role: 'assistant',
    content: 'Here is the code:',
    timestamp: new Date(),
    artifacts: [{
      id: '1',
      type: 'code',
      language: 'typescript',
      content: 'const x = 10;',
    }],
  }}
/>
```

### Pattern 3: Validate Files
```typescript
import { validateFile, validateFiles } from './utils/fileUtils';

// Single file
const result = validateFile(file);
if (!result.valid) {
  console.error(result.error);
}

// Multiple files
const { valid, invalid } = validateFiles(files);
console.log(`Valid: ${valid.length}, Invalid: ${invalid.length}`);
```

### Pattern 4: Create Chart Artifact
```typescript
import { generateId } from './utils/fileUtils';

const chartArtifact = {
  id: generateId(),
  type: 'chart',
  title: 'Sales Data',
  content: JSON.stringify({
    type: 'bar',
    xKey: 'month',
    data: [
      { month: 'Jan', value: 100 },
      { month: 'Feb', value: 150 },
    ],
    bars: [{ dataKey: 'value', color: '#8884d8' }],
  }),
};
```

### Pattern 5: Format File Size
```typescript
import { formatFileSize } from './utils/fileUtils';

formatFileSize(1024);        // "1 KB"
formatFileSize(1024 * 1024); // "1 MB"
formatFileSize(1536);        // "1.5 KB"
```

## Type Reference

### Artifact
```typescript
interface Artifact {
  id: string;
  type: 'code' | 'chart' | 'diagram' | 'table' | 'mermaid';
  title?: string;
  content: string;
  language?: string;
  metadata?: Record<string, any>;
}
```

### FileAttachment
```typescript
interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  data?: string;
  uploadProgress?: number;
  error?: string;
}
```

### Message
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
  cost?: number;
  artifacts?: Artifact[];
  attachments?: FileAttachment[];
}
```

## Chart Data Format

### Bar Chart
```json
{
  "type": "bar",
  "xKey": "category",
  "data": [
    { "category": "A", "value": 100 }
  ],
  "bars": [
    { "dataKey": "value", "color": "#8884d8" }
  ]
}
```

### Line Chart
```json
{
  "type": "line",
  "xKey": "date",
  "data": [
    { "date": "2024-01", "revenue": 1000 }
  ],
  "lines": [
    { "dataKey": "revenue", "color": "#8884d8" }
  ]
}
```

### Pie Chart
```json
{
  "type": "pie",
  "nameKey": "name",
  "valueKey": "value",
  "data": [
    { "name": "Category A", "value": 400 }
  ]
}
```

## Utility Functions

### File Validation
```typescript
validateFile(file: File): { valid: boolean; error?: string }
validateFiles(files: File[]): { valid: File[]; invalid: Array<{file: File; error: string}> }
isSupportedFileType(mimeType: string): boolean
isValidFileSize(size: number): boolean
```

### File Type Checks
```typescript
isImageFile(mimeType: string): boolean
isCodeFile(mimeType: string): boolean
isDocumentFile(mimeType: string): boolean
```

### File Operations
```typescript
readFileAsDataURL(file: File): Promise<string>
readFileAsText(file: File): Promise<string>
formatFileSize(bytes: number): string
getFileExtension(filename: string): string
generateId(): string
```

### Upload Operations
```typescript
uploadFile(file: File, config?: UploadConfig): Promise<FileAttachment>
uploadFiles(files: File[], onProgress?: (index: number, progress: number) => void): Promise<FileAttachment[]>
deleteFile(fileId: string): Promise<void>
```

## Constants

```typescript
MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

SUPPORTED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'text/javascript',
  'text/typescript',
  'text/html',
  'text/css',
  'text/markdown',
];
```

## Keyboard Shortcuts

- `Enter` - Send message
- `Shift + Enter` - New line
- `Tab` - Navigate UI elements
- `Space/Enter` - Activate buttons
- `Esc` - Close overlays

## Accessibility

All components include:
- ARIA labels
- Keyboard navigation
- Screen reader support
- Focus management
- 4.5:1 color contrast

## Error Handling

```typescript
// Validation errors
const result = validateFile(file);
if (!result.valid) {
  toast.error(result.error); // Show to user
}

// Upload errors
try {
  await uploadFile(file);
} catch (error) {
  toast.error('Upload failed');
  console.error(error);
}
```

## Testing

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test
npm run test -- fileUtils.test.ts
```

## Component Props Quick Reference

### InputComposerEnhanced
```typescript
{
  onSend: (content: string, attachments?: FileAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}
```

### MessageEnhanced
```typescript
{
  message: Message;
}
```

### ArtifactRenderer
```typescript
{
  artifact: Artifact;
  className?: string;
}
```

### FileAttachmentPreview
```typescript
{
  attachment: FileAttachment;
  onRemove?: () => void;
  removable?: boolean;
  className?: string;
}
```

### FileDropZone
```typescript
{
  onFilesSelected: (files: File[]) => void;
  onError?: (errors: Array<{file: File; error: string}>) => void;
  maxFiles?: number;
  className?: string;
  children?: React.ReactNode;
}
```

## Files Created

### Components (7)
- `src/components/Chat/ArtifactRenderer.tsx`
- `src/components/Chat/FileAttachmentPreview.tsx`
- `src/components/Chat/FileDropZone.tsx`
- `src/components/Chat/InputComposer.enhanced.tsx`
- `src/components/Chat/Message.enhanced.tsx`
- `src/components/Chat/ChatInterface.enhanced.tsx`
- `src/components/Chat/index.ts`

### Utils (2)
- `src/utils/fileUtils.ts`
- `src/utils/fileUpload.ts`

### Tests (3)
- `src/components/Chat/__tests__/ArtifactRenderer.test.tsx`
- `src/components/Chat/__tests__/FileAttachmentPreview.test.tsx`
- `src/utils/__tests__/fileUtils.test.ts`

### Documentation (4)
- `CHAT_FEATURES_DOCUMENTATION.md`
- `IMPLEMENTATION_GUIDE.md`
- `FEATURES_SUMMARY.md`
- `QUICK_REFERENCE.md`

### Modified (1)
- `src/types/chat.ts`

## Troubleshooting

**Files not uploading?**
- Check file size (<10MB)
- Verify file type is supported
- Check browser console

**Images not showing?**
- Verify data URL format
- Check for CORS issues
- Ensure valid image file

**Charts not rendering?**
- Verify JSON format
- Check data structure
- Ensure recharts is installed

**TypeScript errors?**
- Update imports to use enhanced types
- Check artifact/attachment type definitions

## Next Steps

1. Review `IMPLEMENTATION_GUIDE.md` for detailed setup
2. Check `CHAT_FEATURES_DOCUMENTATION.md` for full API reference
3. Look at `ChatInterface.enhanced.tsx` for usage examples
4. Run tests to verify installation
5. Integrate with your backend

## Support

- Full documentation in `CHAT_FEATURES_DOCUMENTATION.md`
- Implementation guide in `IMPLEMENTATION_GUIDE.md`
- Visual reference in `FEATURES_SUMMARY.md`
- Test files show usage examples

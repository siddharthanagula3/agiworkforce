# Screen Capture & OCR Quick Reference

## Quick Start

### Using Screen Capture in a Component

```typescript
import { ScreenCaptureButton } from '@/components/ScreenCapture';
import { useScreenCapture } from '@/hooks/useScreenCapture';

function MyComponent() {
  const { captureFullScreen, captureRegion } = useScreenCapture();

  return (
    <ScreenCaptureButton
      conversationId={123}
      onCaptureComplete={(result) => {
        console.log('Captured:', result);
      }}
    />
  );
}
```

### Using OCR

```typescript
import { useOCR } from '@/hooks/useOCR';

function MyComponent() {
  const { processImage, result, isProcessing } = useOCR();

  const handleExtractText = async () => {
    const ocrResult = await processImage(
      'capture-id',
      '/path/to/image.png',
      'eng' // language
    );
    console.log('Extracted text:', ocrResult.text);
  };

  return (
    <button onClick={handleExtractText} disabled={isProcessing}>
      Extract Text
    </button>
  );
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Capture full screen |
| `Ctrl+Shift+R` | Capture region |
| `Enter` | Confirm region selection |
| `Esc` | Cancel region selection |

## API Commands

### Capture Full Screen
```typescript
const result = await invoke<CaptureResult>('capture_screen_full', {
  conversationId: 123
});
```

### Capture Region
```typescript
const result = await invoke<CaptureResult>('capture_screen_region', {
  x: 100,
  y: 100,
  width: 500,
  height: 400,
  conversationId: 123
});
```

### Process OCR
```typescript
const result = await invoke<OCRResult>('ocr_process_image', {
  captureId: 'capture-id',
  imagePath: '/path/to/image.png',
  language: 'eng'
});
```

### Get Capture History
```typescript
const history = await invoke<CaptureRecord[]>('capture_get_history', {
  conversationId: 123,
  limit: 50
});
```

## Type Definitions

### CaptureResult
```typescript
interface CaptureResult {
  id: string;
  path: string;
  thumbnailPath?: string;
  captureType: 'fullscreen' | 'window' | 'region';
  metadata: {
    width: number;
    height: number;
    windowTitle?: string;
    region?: { x: number; y: number; width: number; height: number };
    screenIndex?: number;
  };
  createdAt: number;
}
```

### OCRResult
```typescript
interface OCRResult {
  id: string;
  captureId: string;
  text: string;
  confidence: number;
  words: WordData[];
  processingTimeMs: number;
  language: string;
}
```

## Database Queries

### Get Captures for Conversation
```sql
SELECT * FROM captures
WHERE conversation_id = ?
ORDER BY created_at DESC
LIMIT 50;
```

### Search OCR Text
```sql
SELECT c.*, o.text, o.confidence
FROM captures c
JOIN ocr_results o ON c.id = o.capture_id
WHERE o.text MATCH ?
ORDER BY o.confidence DESC;
```

### Get Recent Captures
```sql
SELECT * FROM captures
ORDER BY created_at DESC
LIMIT 20;
```

## Component Props

### ScreenCaptureButton
```typescript
interface ScreenCaptureButtonProps {
  conversationId?: number;
  onCaptureComplete?: (result: CaptureResult) => void;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}
```

### CapturePreview
```typescript
interface CapturePreviewProps {
  capture: CaptureResult;
  onClose: () => void;
  onDelete?: () => void;
  showOCR?: boolean;
}
```

### OCRViewer
```typescript
interface OCRViewerProps {
  captureId: string;
  imagePath: string;
  onClose?: () => void;
}
```

## Error Handling

```typescript
const { captureFullScreen, error } = useScreenCapture();

try {
  const result = await captureFullScreen();
  // Success
} catch (err) {
  console.error('Capture failed:', error || err);
  // Show user-friendly message
}
```

## Common Patterns

### Capture and Send to Chat
```typescript
const handleCaptureAndSend = async () => {
  const capture = await captureFullScreen(conversationId);
  onSend('Check out this screenshot', [], [capture]);
};
```

### Capture Region with Preview
```typescript
const [showSelector, setShowSelector] = useState(false);

<RegionSelector
  onConfirm={async (region) => {
    const result = await captureRegion(region);
    setShowSelector(false);
    // Show preview
  }}
  onCancel={() => setShowSelector(false)}
/>
```

### OCR with Language Selection
```typescript
const [language, setLanguage] = useState('eng');
const { getLanguages, processImage } = useOCR();

useEffect(() => {
  getLanguages().then(setAvailableLanguages);
}, []);

const handleOCR = async () => {
  await processImage(captureId, imagePath, language);
};
```

## Troubleshooting

### Capture returns empty image
- Check screen permissions
- Verify screen is not locked
- Try different capture mode

### OCR returns poor results
- Capture at higher resolution
- Use correct language pack
- Try region capture for specific text

### High memory usage
- Delete old captures regularly
- Clear OCR cache periodically
- Limit capture resolution if needed

## Performance Tips

1. **Use thumbnails for lists** - Don't load full images
2. **Lazy load OCR** - Only process when user requests
3. **Batch delete** - Delete multiple captures at once
4. **Use appropriate image format** - PNG for screenshots, JPEG for photos
5. **Index database queries** - Indexes already created, use them

## File Locations

- Captures: `{APP_DATA_DIR}/captures/`
- Database: `{APP_DATA_DIR}/agiworkforce.db`
- Logs: `{APP_DATA_DIR}/logs/`

## Build Commands

```bash
# Development
npm run dev

# Build with OCR
npm run build

# Build without OCR
cargo build --release --no-default-features

# Run tests
npm run test

# Run specific test
npm run test useScreenCapture.test.ts
```

## Feature Flags

### Enable/Disable OCR
```toml
# Cargo.toml
[features]
default = ["ocr"]
ocr = ["tesseract"]
```

```rust
// In code
#[cfg(feature = "ocr")]
fn ocr_enabled() -> bool { true }

#[cfg(not(feature = "ocr"))]
fn ocr_enabled() -> bool { false }
```

## Useful SQL Queries

### Find captures without OCR
```sql
SELECT c.* FROM captures c
LEFT JOIN ocr_results o ON c.id = o.capture_id
WHERE o.id IS NULL;
```

### Get OCR accuracy statistics
```sql
SELECT
  AVG(confidence) as avg_confidence,
  MIN(confidence) as min_confidence,
  MAX(confidence) as max_confidence
FROM ocr_results;
```

### Clean up old captures
```sql
DELETE FROM captures
WHERE created_at < strftime('%s', 'now', '-30 days');
```

## Migration Notes

### From v1 to v2 (adds captures)
- Automatic on app start
- No user action needed
- Backwards compatible
- New tables: captures, ocr_results, ocr_text_fts

## Security Notes

- Never capture password dialogs
- Redact sensitive info before sharing
- Delete captures after use
- Use encrypted storage for sensitive data (planned)

## Support

- Documentation: `/docs/`
- Issues: GitHub Issues
- Examples: `/examples/screen-capture/`
- API Docs: `/docs/api/screen-capture.md`

# Browser Automation Visualization System

Comprehensive browser automation visualization for the AGI Workforce desktop app.

## Overview

The browser visualization system provides real-time visibility into browser automation activities, including:

- **Live View**: Real-time screenshot streaming with element highlighting
- **Action Log**: Timeline of all browser actions with success/failure indicators
- **Debug Panel**: DOM inspector, console logs, network activity, and performance metrics
- **Recorder**: Record user actions and generate Playwright/Puppeteer/Selenium code

## Components

### BrowserVisualization

Main component that integrates all visualization features.

```tsx
import { BrowserVisualization } from '@/components/Browser';

function MyComponent() {
  return <BrowserVisualization tabId="tab-123" />;
}
```

### BrowserViewer

Live browser viewport with screenshot streaming.

**Features:**
- Screenshot streaming (500ms updates)
- Element highlighting with yellow overlay
- Zoom controls (0.5x - 3x)
- Pan/drag support
- Fullscreen mode
- Pause/resume streaming

**Usage:**
```tsx
import { BrowserViewer } from '@/components/Browser';

function MyComponent() {
  return <BrowserViewer tabId="tab-123" />;
}
```

### BrowserActionLog

Timeline view of all browser automation actions.

**Features:**
- Action filtering by type (navigate, click, type, etc.)
- Search functionality
- Success/failure indicators
- Duration tracking
- Export to JSON
- Click to view action screenshot

**Usage:**
```tsx
import { BrowserActionLog } from '@/components/Browser';

function MyComponent() {
  return (
    <BrowserActionLog
      onActionClick={(action) => console.log('Action clicked:', action)}
    />
  );
}
```

### BrowserDebugPanel

Developer tools for browser automation.

**Features:**
- **DOM Inspector**: View and search HTML structure
- **Console Logs**: Capture browser console output (log, warn, error, info)
- **Network Activity**: Monitor HTTP requests with status codes and timings
- **Storage**: Cookie and localStorage viewer (coming soon)
- **Performance**: Page load metrics and profiling (coming soon)

**Usage:**
```tsx
import { BrowserDebugPanel } from '@/components/Browser';

function MyComponent() {
  return <BrowserDebugPanel tabId="tab-123" />;
}
```

### BrowserRecorder

Record user actions and generate automation scripts.

**Features:**
- Record browser interactions
- Step-by-step editor
- Generate code in multiple formats:
  - Playwright (TypeScript)
  - Puppeteer (JavaScript)
  - Selenium (Python)
- Export/download generated code
- Edit individual steps

**Usage:**
```tsx
import { BrowserRecorder } from '@/components/Browser';

function MyComponent() {
  return <BrowserRecorder />;
}
```

## State Management

All components use the `browserStore` Zustand store:

```tsx
import { useBrowserStore } from '@/stores/browserStore';

const {
  // Screenshot streaming
  isStreaming,
  screenshots,
  startStreaming,
  stopStreaming,

  // Actions
  actions,
  addAction,
  clearActions,

  // Visualization
  highlightedElement,
  highlightElement,
  clearHighlight,

  // Debug data
  consoleLogs,
  networkRequests,
  domSnapshots,
  getDOMSnapshot,
  getConsoleLogs,
  getNetworkActivity,

  // Recording
  isRecording,
  recordedSteps,
  startRecording,
  stopRecording,
  generatePlaywrightCode,
} = useBrowserStore();
```

## Backend Commands

The following Tauri commands power the visualization system:

### Screenshot Streaming

```rust
browser_get_screenshot_stream(tab_id: String) -> Result<String, String>
```

Returns base64-encoded PNG screenshot. Called every 500ms during streaming.

### Element Highlighting

```rust
browser_highlight_element(tab_id: String, selector: String) -> Result<ElementBounds, String>
```

Highlights an element and returns its bounding box coordinates.

### DOM Snapshot

```rust
browser_get_dom_snapshot(tab_id: String) -> Result<DOMSnapshot, String>
```

Returns full HTML snapshot with timestamp.

### Console Logs

```rust
browser_get_console_logs(tab_id: String) -> Result<Vec<ConsoleLog>, String>
```

Returns browser console logs (log, warn, error, info).

### Network Activity

```rust
browser_get_network_activity(tab_id: String) -> Result<Vec<NetworkRequest>, String>
```

Returns network requests with URLs, methods, status codes, and timings.

## Data Types

### BrowserAction

```typescript
interface BrowserAction {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'scroll' | 'wait' | 'execute';
  timestamp: number;
  duration?: number;
  success: boolean;
  details: {
    url?: string;
    selector?: string;
    text?: string;
    script?: string;
    result?: any;
    error?: string;
  };
  screenshotId?: string;
}
```

### Screenshot

```typescript
interface Screenshot {
  id: string;
  timestamp: number;
  data: string; // base64
  tabId: string;
}
```

### ElementBounds

```typescript
interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### ConsoleLog

```typescript
interface ConsoleLog {
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}
```

### NetworkRequest

```typescript
interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  duration_ms: number;
  timestamp: number;
}
```

## Integration with BrowserWorkspace

The visualization system integrates seamlessly with the existing `BrowserWorkspace`:

```tsx
import { BrowserWorkspace, BrowserVisualization } from '@/components/Browser';

function BrowserAutomation() {
  return (
    <div className="grid grid-cols-2 gap-4 h-screen">
      {/* Controls */}
      <BrowserWorkspace />

      {/* Visualization */}
      <BrowserVisualization />
    </div>
  );
}
```

## Event System

The visualization system listens for browser automation events:

- `browser:action` - Fired when an action is performed
- `browser:console` - Fired when console output is captured
- `browser:network` - Fired when network request completes

These events are automatically handled by the store.

## Performance Considerations

### Screenshot Streaming

- Default interval: 500ms
- Quality: 60% (configurable)
- Automatic cleanup of temp files
- Max history: 50 screenshots

### Action Log

- Unlimited action history
- Searchable and filterable
- Exportable to JSON

### Memory Management

- Screenshots are stored in base64 format
- Automatic cleanup of old screenshots (keeps last 50)
- DOM snapshots are stored separately

## Future Enhancements

- [ ] Cookie and localStorage viewer
- [ ] Performance metrics (FCP, LCP, TTI)
- [ ] Screenshot comparison (before/after)
- [ ] Action replay with speed controls
- [ ] Video recording of automation
- [ ] Network request interceptor UI
- [ ] Step debugger with breakpoints
- [ ] Element selector helper
- [ ] XPath generator

## Examples

### Basic Usage

```tsx
import { BrowserVisualization } from '@/components/Browser';

export function MyAutomationPanel() {
  return (
    <div className="h-screen">
      <BrowserVisualization />
    </div>
  );
}
```

### Custom Layout

```tsx
import {
  BrowserViewer,
  BrowserActionLog,
  BrowserDebugPanel,
  BrowserRecorder,
} from '@/components/Browser';

export function CustomLayout() {
  return (
    <div className="grid grid-rows-2 grid-cols-2 gap-4 h-screen p-4">
      <BrowserViewer className="row-span-2" />
      <BrowserActionLog />
      <div className="grid grid-cols-2 gap-4">
        <BrowserDebugPanel />
        <BrowserRecorder />
      </div>
    </div>
  );
}
```

### Programmatic Control

```tsx
import { useBrowserStore } from '@/stores/browserStore';
import { BrowserViewer } from '@/components/Browser';

export function ControlledViewer() {
  const { startStreaming, stopStreaming, highlightElement } = useBrowserStore();

  const handleHighlight = async () => {
    await highlightElement('tab-123', '#submit-button');
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => startStreaming('tab-123')}>Start</button>
        <button onClick={stopStreaming}>Stop</button>
        <button onClick={handleHighlight}>Highlight</button>
      </div>
      <BrowserViewer />
    </div>
  );
}
```

## Troubleshooting

### Screenshots not appearing

1. Ensure browser tab is active
2. Check that streaming is enabled
3. Verify Tauri command registration
4. Check browser console for errors

### Element highlighting not working

1. Verify selector is valid CSS selector
2. Ensure element exists in DOM
3. Check that JavaScript execution is enabled

### Console logs empty

Console log capture requires CDP Runtime domain to be enabled. This is currently a simplified implementation using the Performance API.

### Network requests showing 200 status

The current implementation uses the Performance API which doesn't provide HTTP status codes. For full network monitoring, CDP Network domain needs to be enabled.

## License

Part of the AGI Workforce Desktop App project.

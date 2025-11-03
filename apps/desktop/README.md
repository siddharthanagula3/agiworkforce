# AGI Workforce Desktop

A modern, AI-powered desktop application built with Tauri 2.0, React, and TypeScript. Features a complete chat interface with persistent SQLite storage, custom window management, and a professional design system.

## 🎯 Features

### Core Features
- ✅ **AI Chat Interface** - Full-featured chat with markdown support, syntax highlighting, and message history
- ✅ **Persistent Storage** - SQLite database for conversations and messages
- ✅ **Window Management** - Custom frameless window with docking (left/right), always-on-top, and pinning
- ✅ **System Tray** - Minimize to tray with quick actions
- ✅ **Theme System** - Light/dark mode with custom design tokens
- ✅ **Cost Tracking** - Token and cost tracking per conversation
- ✅ **Telemetry** - Structured logging with file rotation

### Chat Features
- **Markdown Rendering** - Full GitHub-flavored markdown with syntax highlighting
- **Code Blocks** - Syntax highlighting for 100+ languages
- **File Attachments** - Attach files to messages (UI ready, backend TODO)
- **Message Actions** - Copy messages, view metadata
- **Conversation Management** - Create, rename, delete conversations
- **Auto-scrolling** - Smooth scroll to latest messages
- **Loading States** - Professional loading indicators

### Design System
- **17+ UI Components** - Button, Input, Card, Dialog, Dropdown, and more
- **Accessible** - Built on Radix UI primitives with ARIA support
- **Responsive** - Adapts to window size and docking state
- **Animated** - Smooth transitions and micro-interactions
- **Type-Safe** - Full TypeScript support

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React 18.3 with TypeScript
- Vite 5.2 for build tooling
- Tailwind CSS 3.4 for styling
- Zustand 4.5 for state management
- Radix UI for accessible components
- React Markdown for content rendering

**Backend:**
- Tauri 2.0 for native desktop framework
- Rust for backend logic
- SQLite with rusqlite for database
- Serde for serialization
- Tracing for structured logging
- Chrono for datetime handling

### Project Structure

```
apps/desktop/
├── src/                          # Frontend source
│   ├── components/
│   │   ├── Chat/                 # Chat interface components
│   │   │   ├── ChatInterface.tsx # Main container
│   │   │   ├── ConversationSidebar.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── Message.tsx
│   │   │   └── InputComposer.tsx
│   │   ├── Layout/               # Layout components
│   │   │   ├── TitleBar.tsx      # Custom title bar
│   │   │   └── DockingSystem.tsx # Docking visualization
│   │   ├── ui/                   # Design system components
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   └── ... (14+ more)
│   │   └── Common/               # Shared components
│   ├── stores/                   # Zustand stores
│   │   ├── chatStore.ts          # Chat state management
│   │   └── ...
│   ├── hooks/                    # Custom React hooks
│   │   ├── useWindowManager.ts   # Window controls
│   │   ├── useTheme.ts           # Theme management
│   │   └── useToast.ts           # Toast notifications
│   ├── types/                    # TypeScript types
│   │   └── chat.ts               # Chat type definitions
│   ├── lib/                      # Utilities
│   │   └── utils.ts              # Helper functions
│   ├── providers/                # React providers
│   │   └── ThemeProvider.tsx    # Theme context
│   └── styles/
│       └── globals.css           # Global styles & design tokens
│
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── commands/             # Tauri commands (IPC)
│       │   ├── chat.rs           # Chat CRUD operations
│       │   └── window.rs         # Window management
│       ├── db/                   # Database layer
│       │   ├── models.rs         # Database entities
│       │   ├── repository.rs     # CRUD operations
│       │   └── migrations.rs     # Schema versioning
│       ├── telemetry/            # Logging & tracing
│       │   ├── logging.rs        # File logging
│       │   ├── tracing.rs        # Structured logging
│       │   └── metrics.rs        # Performance metrics
│       ├── window/               # Window management
│       │   └── mod.rs            # Docking, state persistence
│       ├── state.rs              # App state management
│       ├── tray.rs               # System tray
│       └── main.rs               # Application entry point
│
└── package.json                  # Node dependencies
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** 1.70+ (install via [rustup](https://rustup.rs/))
- **Tauri CLI** (will be installed via npm)

### Installation

1. **Clone the repository**
   ```bash
   cd apps/desktop
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build
   ```

## 💾 Database Schema

The application uses SQLite with the following schema:

### Conversations Table
```sql
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Messages Table
```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens INTEGER,
    cost REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

### Schema Migrations
- Version system for safe schema updates
- Automatic migrations on app startup
- Located in: `src-tauri/src/db/migrations.rs`

## 🎨 Design System

### Color Tokens

The design system uses CSS custom properties for theming:

```css
/* Light Mode */
--background: 0 0% 100%;
--foreground: 222.2 84% 4.9%;
--primary: 221.2 83.2% 53.3%;
--secondary: 210 40% 96.1%;
--muted: 210 40% 96.1%;
--accent: 210 40% 96.1%;
--destructive: 0 84.2% 60.2%;
--border: 214.3 31.8% 91.4%;

/* Dark Mode */
--background: 222.2 84% 4.9%;
--foreground: 210 40% 98%;
--primary: 217.2 91.2% 59.8%;
/* ... */
```

### Component Usage

```tsx
import { Button, Input, Card, Dialog } from '@/components/ui';

// Button variants
<Button variant="default">Primary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>

// Input
<Input type="text" placeholder="Enter text..." />

// Card
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

See [UI Components README](src/components/ui/README.md) for full documentation.

## ⌨️ Keyboard Shortcuts

### Window Management
- `Ctrl+Alt+Left` - Dock window to left
- `Ctrl+Alt+Right` - Dock window to right
- `Ctrl+Alt+Up/Down` - Undock window

### Chat Interface
- `Enter` - Send message
- `Shift+Enter` - New line in message
- `Ctrl+N` - New conversation (planned)
- `Ctrl+/` - Toggle sidebar (planned)

## 🔌 API Reference

### Chat Commands

All commands are exposed via Tauri's IPC system using `invoke()`:

#### Create Conversation
```typescript
import { invoke } from '@tauri-apps/api/core';

const conversation = await invoke<Conversation>('chat_create_conversation', {
  request: { title: 'My Conversation' }
});
```

#### Get Conversations
```typescript
const conversations = await invoke<Conversation[]>('chat_get_conversations');
```

#### Create Message
```typescript
const message = await invoke<Message>('chat_create_message', {
  request: {
    conversation_id: 1,
    role: 'user',
    content: 'Hello!',
    tokens: 10,
    cost: 0.0001
  }
});
```

#### Get Messages
```typescript
const messages = await invoke<Message[]>('chat_get_messages', {
  conversationId: 1
});
```

#### Get Statistics
```typescript
const stats = await invoke<ConversationStats>('chat_get_conversation_stats', {
  conversationId: 1
});
// { message_count: 10, total_tokens: 500, total_cost: 0.05 }
```

### Window Commands

```typescript
// Get window state
const state = await invoke('window_get_state');

// Pin/unpin window
await invoke('window_set_pinned', { pinned: true });

// Always on top
await invoke('window_set_always_on_top', { value: true });

// Dock window
await invoke('window_dock', { position: 'left' }); // 'left' | 'right' | null
```

## 🧪 Development

### Running Tests
```bash
# Frontend tests
npm test

# Rust tests
cd src-tauri && cargo test
```

### Type Checking
```bash
# TypeScript
npm run tsc

# Rust
cd src-tauri && cargo check
```

### Linting
```bash
# Frontend
npm run lint
npm run lint:fix

# Rust
cd src-tauri && cargo clippy
```

### Building
```bash
# Frontend only
npm run build:web

# Full application
npm run build
```

## 📁 Data Storage

### Database Location
- **Windows**: `%APPDATA%\com.agiworkforce.desktop\agiworkforce.db`
- **macOS**: `~/Library/Application Support/com.agiworkforce.desktop/agiworkforce.db`
- **Linux**: `~/.local/share/com.agiworkforce.desktop/agiworkforce.db`

### Logs Location
- **Windows**: `%APPDATA%\com.agiworkforce.desktop\logs\`
- **macOS**: `~/Library/Logs/com.agiworkforce.desktop/`
- **Linux**: `~/.local/share/com.agiworkforce.desktop/logs/`

Logs rotate daily with 7-day retention.

## 🔧 Configuration

### Window State
Window position, size, and docking state are automatically persisted in:
`{app_config_dir}/window_state.json`

### Theme
Theme preference is stored in localStorage:
```javascript
localStorage.getItem('agiworkforce-theme') // 'light' | 'dark' | 'system'
```

## 🐛 Troubleshooting

### Database Locked
If you see "database is locked" errors:
1. Close all application instances
2. Delete the database file (conversation history will be lost)
3. Restart the application

### Window Not Showing
1. Check system tray - the app may be minimized
2. Right-click tray icon → Show
3. Or kill and restart the process

### Build Failures
```bash
# Clear caches
rm -rf node_modules dist src-tauri/target
npm install
npm run build
```

## 📝 License

[Your License Here]

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📮 Contact

[Your Contact Information]

---

Built with ❤️ using Tauri, React, and TypeScript

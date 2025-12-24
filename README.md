# AGI WORKFORCE

### The Next Generation of Agentic Automation

**AGI Workforce** is a cutting-edge platform designed to revolutionize how we interact with AI. By combining a high-performance Rust backend with a sleek React frontend, we deliver a desktop experience that isn't just a chatbot—it's an intelligent, capable workforce living on your machine.

---

## 🌟 Capabilities at a Glance

### 🧠 Intelligent Agentic Chat

Experience conversations that do more than just talk.

- **Thinking Mode**: Toggle "Thinking Mode" for complex reasoning tasks. The agent will pause, plan, and analyze before responding.
- **Smart Model Routing**: Our **QuickModelSelector** automatically routes your prompt to the best model for the job—whether it's `Claude` for coding, `GPT-4` for reasoning, or `Gemini` for large context—optimizing for speed, cost, and capability.
- **Local & Cloud**: Seamlessly switch between cloud giants (OpenAI, Anthropic, Google) and local powerhouses (Ollama) for privacy-first operations.

### 🎨 Creative Studio & Media Generation

Turn ideas into reality with integrated multi-modal capabilities.

- **Video Generation**: Create stunning 4K videos using **Google Veo**.
- **Image Generation**: Generate professional-grade images with support for:
  - **DALL-E 3** (OpenAI)
  - **Stable Diffusion XL** (Stability AI)
  - **Imagen 3 Pro & Nano** (Google)

### 🛠️ Advanced Tools & Automation

Your AI agent has hands and eyes.

- **Computer Use**: The agent can "see" your screen and interact with it.
  - **Screen Capture**: `xcap` integration for real-time vision.
  - **OCR**: High-precision text extraction using `tesseract`.
  - **Input Emulation**: Mouse and keyboard control via `enigo` to perform tasks for you.
- **Browser Automation**: A full-stack browser automation engine allows the agent to navigate the web, fill forms, and gather data autonomously.
- **Terminal & Coding**: Direct integration with your filesystem and terminal allows the agent to write code, execute scripts, and manage projects.
- **Web Search**: Integrated search engine capabilities to fetch real-time information.

---

## 🏗️ Technical Architecture

AGI Workforce is built as a highly optimized monorepo:

- **Desktop Shell & Backend**: `Tauri v2` (Rust) — Providing native performance, system-level access, and security.
- **UI Framework**: `React v18` + `Tailwind CSS` — Delivering a beautiful, responsive, and fluid user interface.
- **Web Services**: `Next.js` — Powering our web platform, management portal, and API services.
- **Database**: `Supabase` (Web) & `Better-SQLite3` (Desktop) — Robust data syncing and offline-first capabilities.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.11.0`+
- **pnpm**: `v9.15.0`+
- **Rust**: Stable toolchain (configured via `rust-toolchain.toml`)

### Installation

```bash
# Install dependencies
pnpm install

# Run the Desktop App (Development)
pnpm dev:desktop

# Build for Production
pnpm build:desktop
```

---

## 🔒 Security & Privacy

We treat your data with the highest priority.

- **Local-First Key Management**: API keys are stored securely using your OS's native keyring (e.g., macOS Keychain), never in plain text.
- **Permission Guards**: All sensitive tool executions (file writes, terminal commands) are gated by our secure `ToolGuard` system, ensuring you always stay in control.

---

_Built for the future of work._

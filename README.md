# AGI WORKFORCE

### The Next Generation of Agentic Automation

**AGI Workforce** is a cutting-edge platform designed to revolutionize how we interact with AI. By combining a high-performance Rust backend with a sleek React frontend, we deliver a desktop experience that isn't just a chatbot—it's an intelligent, capable workforce living on your machine.

**Current Version:** v1.0.0 (January 2026)

---

## 🎯 What AGI Workforce Can Do

AGI Workforce is a comprehensive AI automation platform that enables users to:

- **Automate Complex Workflows**: Create multi-step automations that combine browser automation, file operations, API calls, and AI reasoning
- **Control Desktop & Web Applications**: Use screen capture, OCR, and input emulation to interact with any desktop or web application
- **Manage Code Projects**: Edit code, run tests, manage git operations, and execute scripts all within the platform
- **Generate Creative Content**: Create images, videos, and text using state-of-the-art generative AI models
- **Extract & Process Data**: Scrape websites, extract information from documents, and transform data at scale
- **Collaborate as a Team**: Share automations, workflows, and templates with team members with role-based access
- **Monitor & Optimize**: Track costs, usage analytics, and ROI of your AI automations

---

## 🌟 Capabilities at a Glance

### 🧠 Intelligent Agentic Chat

Experience conversations that do more than just talk.

- **Thinking Mode**: Toggle "Thinking Mode" for complex reasoning tasks. The agent will pause, plan, and analyze before responding.
- **Smart Model Routing**: Our **QuickModelSelector** automatically routes your prompt to the best model for the job—whether it's `Claude` for coding, `GPT-5.2` for reasoning, or `Gemini` for large context—optimizing for speed, cost, and capability.
- **Local & Cloud**: Seamlessly switch between cloud giants (OpenAI, Anthropic, Google) and local powerhouses (Ollama) for privacy-first operations.
- **Multi-Provider Support**: Access 9+ LLM providers with intelligent routing and fallback mechanisms.

### 🎨 Creative Studio & Media Generation

Turn ideas into reality with integrated multi-modal capabilities.

- **Video Generation**: Create stunning 4K videos using **Google Veo 3.1**.
- **Image Generation**: Generate professional-grade images with support for:
  - **DALL-E 3** (OpenAI)
  - **Stable Diffusion XL** (Stability AI)
  - **Imagen 3 Pro & Nano** (Google)
- **Media Gallery**: Organize and manage all generated media in one place.

### 🛠️ Advanced Tools & Automation

Your AI agent has hands and eyes.

- **Computer Use**: The agent can "see" your screen and interact with it.
  - **Screen Capture**: `xcap` integration for real-time vision.
  - **OCR**: High-precision text extraction using `tesseract`.
  - **Input Emulation**: Mouse and keyboard control via `enigo` to perform tasks for you.
- **Browser Automation**: A full-stack browser automation engine allows the agent to navigate the web, fill forms, and gather data autonomously.
- **UI Automation**: Record and replay UI interactions with advanced element detection.
- **Terminal & Coding**: Direct integration with your filesystem and terminal allows the agent to write code, execute scripts, and manage projects.
- **Web Search**: Integrated search engine capabilities to fetch real-time information.

---

## 📦 Project Architecture

AGI Workforce is organized as a **monorepo** with the following structure:

### Applications

- **Desktop** (`apps/desktop`) - Tauri v2 native desktop application with React 18 frontend and Rust backend
- **Web** (`apps/web`) - Next.js 16 web platform with Supabase integration for management portal and API services
- **Extension** (`apps/extension`) - Browser extension component for extended capabilities

### Services

- **API Gateway** (`services/api`) - Express-based gateway for mobile companion and API routing
- **Signaling Server** (`services/signaling`) - WebSocket-based P2P/WebRTC communication for real-time features

### Shared Packages

- **types** - TypeScript type definitions shared across all applications
- **utils** - Common utility functions used across the monorepo

### Backend Technologies (Rust)

- **Tauri 2.9** - Native desktop framework for system-level access
- **Tokio** - Async runtime for concurrent operations
- **SQLite** - Local database for desktop app (offline-first)
- **PostgreSQL** - Cloud database via Supabase
- **Tesseract** - OCR for text extraction from images and screens
- **xcap** - Screen capture and vision capabilities
- **enigo** - Input emulation for mouse and keyboard control
- **portable-pty** - Terminal/PTY support for shell integration
- **WebRTC** - Real-time communication capabilities

---

## 🤖 LLM Providers & Models

AGI Workforce supports a comprehensive range of state-of-the-art language models:

### OpenAI

- **GPT-5.2** ⭐ (Jan 2026 - New Flagship)
- **GPT-5.2 Pro** (High Performance)
- **GPT-5.2 Chat** (Efficient)
- **GPT-5.2 Codex** (Agentic Coding)
- **GPT-5.1** (Jan 2026)
- **GPT-5.1 Chat** (Quick Responses)
- **GPT-5.1 Thinking** 🧠
- **GPT-5.1-Codex-Max**

### Anthropic

- **Claude Sonnet 4.5** ⭐ (Best Coding - 77.2% SWE-bench)
- **Claude Haiku 4.5** ⚡ (Jan 2026 - Fast & Cost Effective)
- **Claude Opus 4.5** 🧠 (Deep Reasoning/Thinking)

### Google

- **Gemini 3 Pro** ⭐ (Jan 2026 - Top Benchmarks)
- **Gemini 3 Flash** (Fast)
- **Gemini 3 Deep Think** 🧠 (Advanced Reasoning/Thinking)

### Local & Open Source

- **Llama 4 Maverick** ⭐ (1M Context, Local via Ollama)

### XAI

- **Grok 4.1** ⭐ (Jan 2026 - Enhanced Reasoning)
- **Grok 4.1 Fast** ⚡ (Tool-calling, 2M Context)

### Qwen

- **Qwen3-Max** ⭐ 🧠 (Jan 2026 - Thinking Mode)

### Moonshot

- **Kimi K2 Thinking** ⭐ 🧠 (Jan 2026 - Advanced Reasoning)

### Additional Providers

- **DeepSeek** (Deep reasoning capabilities)
- **Mistral** (High-performance models)

### 🔧 Key Features for Automation

- **Thinking Mode**: Enables Claude models (Opus 4.5, GPT-5.1) to reason through complex problems before acting, improving accuracy for challenging tasks
- **Computer Use**: Screen capture, OCR, and mouse/keyboard control allow agents to interact with any desktop application
- **Browser Automation**: Full browser control including form filling, navigation, data extraction, and network monitoring
- **Multi-Agent Support**: Orchestrate multiple agents working together on complex tasks
- **RAG Support**: Index and search PDFs and DOCX documents for intelligent content retrieval
- **Extensible Tool System**: MCP servers provide a framework for adding custom tools and integrations

---

## Model Tiers

AGI Workforce organizes AI models into three tiers, each optimized for different use cases and aligned with subscription plans.

### Speed Tier (Hobby Plan)

Ultra-fast, cost-efficient models for quick tasks:

- **GPT-5 Nano** - $0.05/$0.40 per MTok - Cheapest OpenAI option
- **Gemini 2.0 Flash** - $0.10/$0.40 per MTok - Ultra fast multimodal
- **DeepSeek V3.2** - $0.028/$0.42 per MTok - Budget champion
- **Devstral Small 2** - $0.10/$0.30 per MTok - Fast coding
- **Grok 3 Mini** - $0.30/$0.50 per MTok - Affordable general use
- **Claude Haiku 4.5** - $1/$5 per MTok - Best quality/price ratio

**Capabilities**: Vision, basic computer use, image analysis

### Balanced Tier (Pro Plan)

Best balance of speed and quality for everyday tasks:

- **Claude Sonnet 4.5** - $3/$15 per MTok - Best for coding (77.2% SWE-bench)
- **GPT-5 Mini** - $0.25/$2 per MTok - Good balance
- **Gemini 3 Pro** - $1.50/$6 per MTok - Great reasoning
- **Grok 4.1 Fast** - $4/$12 per MTok - 2M context window
- **Qwen3 Max** - $2.50/$10 per MTok - Reasoning capabilities
- **Kimi K2 Thinking** - $1.50/$6 per MTok - Advanced reasoning

**Capabilities**: Full computer use, browser automation, image generation, web search

### Reasoning Tier (Max Plan)

Deep thinking and complex analysis for power users:

- **Claude Opus 4.5** - $5/$25 per MTok - Advanced reasoning & computer use
- **GPT-5.1 Thinking** - $7/$21 per MTok - Deep thinking mode
- **GPT-5.2 Pro** - $10/$30 per MTok - Most capable GPT
- **Gemini 3 Deep Think** - $3/$12 per MTok - Advanced reasoning
- **GPT-5.2 Codex** - $8/$24 per MTok - Agentic coding

**Capabilities**: Deep reasoning, agentic coding, video generation, research

---

## 🏢 Workspaces

AGI Workforce provides specialized workspaces for different tasks and workflows:

### 💻 Code Workspace

- **Monaco Editor**: Full-featured code editor with syntax highlighting
- **File Tree**: Navigate and manage project files
- **Diff Viewer**: Compare code changes side-by-side
- **LSP Support**: Language Server Protocol integration for intelligent code completion
- **Git Integration**: Version control operations directly in the workspace

### 🌐 Browser Workspace

- **Browser Automation**: Navigate, interact, and extract data from websites
- **Action Recording**: Record browser interactions for replay
- **Visualization**: Visual representation of browser actions
- **Debug Panel**: Inspect and debug automation scripts
- **Action Log**: Track all browser operations

### 🗄️ Database Workspace

- **Query Builder**: Visual interface for database queries
- **Connection Management**: Support for multiple database types
- **Data Visualization**: View and analyze query results
- **Schema Explorer**: Browse database structures

### 📄 Document Workspace

- **Document Editor**: Rich text editing capabilities
- **Document Management**: Organize and manage documents
- **OCR Integration**: Extract text from images and PDFs
- **Search & Index**: Full-text search across documents

### 📅 Calendar Workspace

- **Day/Week/Month Views**: Multiple calendar visualization options
- **Event Management**: Create, edit, and manage calendar events
- **Integration Support**: Connect with external calendar services
- **Meeting Scheduler**: Automated meeting scheduling

### 📧 Email Workspace

- **Email Management**: Read, compose, and manage emails
- **Automated Responses**: Set up intelligent email automation
- **Integration**: Connect with email providers
- **Template System**: Pre-built email templates

### 💻 Terminal Workspace

- **Interactive Terminal**: Full terminal emulation
- **Command Execution**: Run system commands and scripts
- **Output Capture**: Capture and analyze command outputs
- **Multi-Shell Support**: Support for various shell environments

### 🔌 API Workspace

- **API Testing**: Test and debug API endpoints
- **Request Builder**: Visual interface for building API requests
- **Response Viewer**: Inspect API responses
- **Collection Management**: Organize API endpoints

### 📁 Filesystem Workspace

- **File Browser**: Navigate local and remote filesystems
- **File Operations**: Read, write, copy, move, and delete files
- **File Watcher**: Monitor file changes in real-time
- **Search**: Fast file search across directories

### 👁️ Vision Workspace

- **Image Analysis**: Analyze images with vision models
- **Screen Capture**: Capture and analyze screen content
- **OCR Processing**: Extract text from images
- **Visual Understanding**: Advanced image understanding capabilities

### 📊 Productivity Workspace

- **Task Management**: Create and manage tasks
- **Project Tracking**: Track project progress
- **Integration**: Connect with productivity tools (Notion, Trello, Asana)
- **Time Tracking**: Monitor time spent on tasks

### 🔗 MCP Workspace

- **MCP Server Management**: Configure and manage Model Context Protocol servers
- **Tool Browser**: Browse available MCP tools
- **Connection Status**: Monitor MCP server connections
- **Credential Management**: Secure credential storage for MCP servers

### 📱 Mobile Companion Workspace

- **Mobile Integration**: Connect and manage mobile devices
- **Cross-Platform Sync**: Sync data across devices
- **Mobile Automation**: Extend automation to mobile devices

---

## 🎯 Automation Capabilities

### UI Automation

- **Click Actions**: Click on UI elements using coordinates, UIA, image matching, or text
- **Type Actions**: Type text into UI elements
- **Screenshot Capture**: Capture screenshots for analysis
- **Element Detection**: Advanced element detection and selection
- **Action Recording**: Record UI interactions for automation
- **Replay System**: Replay recorded actions

### Browser Automation

- **Navigation**: Navigate to URLs and manage browser state
- **Form Filling**: Automatically fill web forms
- **Data Extraction**: Extract data from web pages
- **JavaScript Execution**: Execute custom JavaScript in browser context
- **Cookie Management**: Manage browser cookies and sessions
- **Network Monitoring**: Monitor network requests and responses

### Computer Use

- **Screen Capture**: Real-time screen capture with `xcap`
- **OCR Processing**: High-precision text extraction with `tesseract`
- **Input Emulation**: Mouse and keyboard control via `enigo`
- **Vision Understanding**: AI-powered screen understanding
- **Action Planning**: Intelligent planning of computer interactions

### Workflow Automation

- **Workflow Builder**: Visual workflow configuration
- **Step Sequencing**: Define multi-step automation workflows
- **Conditional Logic**: Add conditional branching to workflows
- **Error Handling**: Robust error handling and retry mechanisms
- **Parallel Execution**: Run multiple automation steps in parallel

---

## 🎨 Media Generation

### Image Generation

- **DALL-E 3** (OpenAI): High-quality image generation
- **Stable Diffusion XL** (Stability AI): Open-source image generation
- **Imagen 3 Pro & Nano** (Google): Advanced image generation with fine control

### Video Generation

- **Google Veo 3.1**: Create stunning 4K videos from text prompts

### Media Management

- **Media Gallery**: Centralized gallery for all generated media
- **Organization**: Tag and organize media files
- **Export Options**: Export media in various formats

---

## 🚀 Advanced Features

### 🎛️ Governance & Approval System

- **Approval Workflows**: Require approval for sensitive operations
- **Audit Trail**: Complete audit log of all actions
- **Permission Management**: Fine-grained permission controls
- **Governance Dashboard**: Monitor and manage governance policies

### 👥 Teams & Collaboration

- **Team Management**: Create and manage teams
- **Role-Based Access**: Assign roles and permissions
- **Shared Workspaces**: Collaborate in shared workspaces
- **Team Billing**: Manage team subscriptions and billing

### 🛒 Marketplace

- **Workflow Marketplace**: Browse and install pre-built workflows
- **Template Library**: Access to community templates
- **Categories**: Workflows organized by category:
  - Customer Support
  - Sales & Marketing
  - Development
  - Operations
  - Personal Productivity
  - Data Analysis
  - Content Creation
  - Finance

### 📋 Templates & Pre-built Agents

**15+ Ready-to-Use Agent Templates** for immediate productivity:

**Finance & Operations:**

1. **Accounts Payable Agent** - Process invoices and manage payables automatically
2. **Expense Report Agent** - Process, categorize, and approve expense reports
3. **Financial Analysis Agent** - Analyze financial data and generate reports

**Sales & Customer Success:** 4. **Customer Support Agent** - Automate customer service responses and ticket routing 5. **Lead Qualification Agent** - Qualify and score leads, prioritize sales opportunities 6. **Social Media Agent** - Automate social media posting and engagement

**Development & DevOps:** 7. **Code Review Agent** - Automated code review with suggestions and quality checks 8. **Testing Agent** - Generate tests, run test suites, and analyze coverage 9. **Deployment Agent** - Automate code deployment and release management

**Documentation & Content:** 10. **Documentation Agent** - Generate and maintain technical documentation 11. **Content Writer Agent** - Generate written content, blog posts, and articles 12. **Meeting Scheduler Agent** - Schedule meetings and manage calendars automatically

**HR & Administrative:** 13. **Job Application Agent** - Process job applications and screen candidates 14. **Data Entry Agent** - Automate data entry tasks from various sources 15. **Research Agent** - Conduct research and compile information from multiple sources

All templates are customizable and can be modified using the Configurator or deployed as-is.

### 📊 Analytics & Cost Tracking

- **Cost Dashboard**: Track LLM usage and costs
- **Usage Analytics**: Monitor API calls and token usage
- **ROI Dashboard**: Measure return on investment
- **Budget Alerts**: Set budgets and receive alerts
- **Cost Optimization**: Recommendations for cost savings

### 🎮 Mission Control

- **Centralized Control**: Manage all agents and workflows from one place
- **Status Monitoring**: Monitor agent status and health
- **Resource Management**: Track resource usage
- **Performance Metrics**: View performance analytics

### ⚙️ Configurator

- **Visual Workflow Builder**: Drag-and-drop workflow creation
- **Capability Library**: Browse available capabilities
- **Training Panel**: Train custom agents
- **Test Employee Modal**: Test workflows before deployment
- **Publish Workflows**: Share workflows with team or marketplace

### 🎼 Orchestration

- **Multi-Agent Orchestration**: Coordinate multiple agents
- **Task Distribution**: Distribute tasks across agents
- **Workflow Coordination**: Manage complex multi-step workflows
- **Resource Allocation**: Optimize resource allocation

### 🎯 Outcomes Tracking

- **Goal Setting**: Define and track goals
- **Outcome Measurement**: Measure goal outcomes
- **Success Metrics**: Track success criteria
- **Outcomes Dashboard**: Visualize outcomes and progress

---

## 🔧 Tool Capabilities

AGI Workforce provides a comprehensive set of tools for the AI agent:

### File Operations

- **File Read**: Read files from disk
- **File Write**: Write content to files
- **File Delete**: Delete files safely
- **Directory Operations**: Create, list, and manage directories
- **File Watching**: Monitor file changes in real-time

### Code Operations

- **Code Execution**: Execute code in various languages
- **Code Analysis**: Analyze code structure and quality
- **Code Generation**: Generate code from descriptions
- **LSP Integration**: Language Server Protocol support

### Database Operations

- **Database Queries**: Execute SQL queries
- **Database Management**: Manage database connections
- **Schema Operations**: Create and modify database schemas

### API Operations

- **API Calls**: Make HTTP requests to APIs
- **API Upload**: Upload files via API
- **API Download**: Download files from APIs
- **Authentication**: Handle various authentication methods

### Image Processing

- **Image Analysis**: Analyze images with AI
- **OCR**: Extract text from images
- **Image Generation**: Generate images from prompts
- **Image Editing**: Basic image editing operations

### Audio Processing

- **Audio Analysis**: Analyze audio files
- **Speech Recognition**: Convert speech to text
- **Audio Generation**: Generate audio content

### Text Processing

- **Text Analysis**: Analyze and process text
- **Text Extraction**: Extract text from various sources
- **Text Generation**: Generate text content

### Data Analysis

- **Data Processing**: Process and transform data
- **Statistical Analysis**: Perform statistical operations
- **Data Visualization**: Create data visualizations

### Network Operations

- **Network Requests**: Make network requests
- **Web Scraping**: Extract data from websites
- **Network Monitoring**: Monitor network activity

### System Operations

- **System Commands**: Execute system commands
- **Process Management**: Manage system processes
- **System Information**: Retrieve system information

---

## 🔌 Integrations

### MCP (Model Context Protocol) Servers

AGI Workforce supports an extensive range of MCP servers for seamless tool integration:

**File & Version Control:**

- **Filesystem**: Read and write files on local filesystem with full access control
- **Git**: Git operations and version control integration
- **GitHub**: GitHub API integration for repository management

**Communication & Automation:**

- **Terminal/Shell**: Execute system commands and shell scripts
- **Slack**: Slack workspace integration for notifications and messaging
- **Email**: Email provider integration

**Cloud & Storage:**

- **Notion**: Notion workspace access for notes and databases
- **Google Drive**: Google Drive file management and synchronization
- **Supabase**: Cloud database and backend integration

**Search & Information:**

- **Brave Search**: Web search capabilities with privacy focus
- **Context7**: Comprehensive library documentation and code examples

**Databases & APIs:**

- **PostgreSQL**: Cloud database operations
- **SQLite**: Local database operations
- **Stripe**: Payment processing and subscription management

**System Integration:**

- **Windows UI**: Windows UI automation and control (Windows only)

### Productivity Integrations

- **Notion**: Task and project management
- **Trello**: Board and card management
- **Asana**: Project and task tracking

### Calendar Integrations

- **Google Calendar**: Calendar synchronization
- **Outlook Calendar**: Microsoft calendar integration
- **iCal**: Standard calendar format support

### Messaging Integrations

- **Slack**: Team communication
- **Email**: Email provider integration

### Cloud Storage

- **Google Drive**: File storage and sync
- **Cloud Storage Panel**: Manage cloud storage connections

### Development Integrations

- **GitHub**: Repository management
- **Git**: Version control operations
- **LSP**: Language Server Protocol support

---

## 🏗️ Technical Architecture

AGI Workforce is built as a highly optimized monorepo supporting multiple platforms and deployment scenarios:

### Desktop Application

**Frontend Stack:**

- **React 18** + **Tailwind CSS** — Modern, responsive UI
- **Radix UI** — Accessible component library
- **Vite** — Fast build system with hot module replacement
- **Zustand** — Lightweight state management
- **React Router** — Client-side routing
- **Monaco Editor** — Advanced code editing capabilities
- **xterm.js** — Terminal emulation
- **Playwright** — End-to-end testing

**Backend Stack (Rust):**

- **Tauri 2.9** — Native desktop framework with IPC bridge
- **Tokio** — Async runtime for concurrent operations
- **SQLite** (with Better-SQLite3 bindings) — Local offline-first database
- **PostgreSQL** — Cloud database integration
- **Tesseract OCR** — Text extraction from images and screens
- **xcap** — Cross-platform screen capture
- **enigo** — Input emulation (mouse, keyboard)
- **portable-pty** — Terminal/shell integration
- **WebRTC** — Real-time peer-to-peer communication

### Web Platform

- **Framework**: `Next.js 16` — Full-stack web application
- **Database**: `Supabase (PostgreSQL)` — Cloud database with real-time capabilities
- **Authentication**: `Supabase Auth` — Secure authentication and session management
- **Payments**: `Stripe` — Payment processing and subscription billing
- **React 19** — Latest React features for web UI

### API Services

- **API Gateway** (Express) — Routes mobile and API requests
- **Signaling Server** (WebSocket) — WebRTC and real-time communication coordination

### Code Quality & Testing

- **TypeScript** — Type-safe development across all packages
- **ESLint** — Code linting and consistency
- **Prettier** — Code formatting
- **Vitest** — Unit testing framework
- **Playwright** — End-to-end testing
- **Husky** — Git hooks for pre-commit checks
- **commitlint** — Commit message standards enforcement

### AI Integration Stack

- **OpenAI API** — GPT-5.2, GPT-5.1 models
- **Anthropic API** — Claude Sonnet 4.5, Haiku 4.5, Opus 4.5
- **Google API** — Gemini 3 models, Veo 3.1 video generation
- **XAI API** — Grok 4.1 models
- **Ollama** — Local model inference
- **Model Context Protocol (MCP)** — Extensible tool integration framework

### Security Features

- **OS Keyring Integration**: Secure credential storage (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Permission System**: Fine-grained permission controls with role-based access
- **Approval Workflows**: Tool Guards for sensitive operations (file writes, terminal commands)
- **Audit Logging**: Complete audit trail of all agent and user actions
- **Encrypted Storage**: Sensitive data encrypted at rest
- **Local-First Architecture**: Option to run entirely locally with no cloud dependency

---

## ✨ What's New in v1.0.0

**January 2026 Release Highlights:**

- **Full Browser Automation Engine** - Complete control over web browsers with form filling, navigation, and data extraction
- **Smart Model Routing (QuickModelSelector)** - Automatically selects the best AI model for each task to optimize cost and performance
- **Enhanced Desktop Automation** - Improved screen capture, OCR, and input emulation for reliable desktop application control
- **Ollama Local Model Support** - Run AI models locally with privacy and no external API costs
- **Subscription & Billing Integration** - Stripe-powered subscription management with flexible pricing tiers
- **Approval Workflow System** - Governance controls and tool guards for sensitive operations
- **RAG Support for Documents** - Extract and index information from PDFs and DOCX files
- **Multi-Agent Orchestration** - Coordinate multiple agents working together on complex workflows
- **Improved UI/UX** - Polished interface with better navigation and workspace organization
- **Enterprise Features** - Team collaboration, role-based access, and audit logging

**Stability Improvements:**

- Resolved failing CI tests across desktop and web packages
- Enhanced sync-subscription robustness
- Improved payment success UX and error handling

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.11.0` or higher
- **pnpm**: `v9.15.0` or higher
- **Rust**: Stable toolchain (configured via `rust-toolchain.toml`)

### Installation

```bash
# Clone the repository
git clone https://github.com/siddhartha/agiworkforce.git
cd agiworkforce

# Install dependencies
pnpm install

# Run the Desktop App (Development)
pnpm dev:desktop

# Build for Production
pnpm build:desktop
```

### First Steps

1. **Configure API Keys**: Add your API keys in Settings for the LLM providers you want to use (or run locally with Ollama)
2. **Set Allowed Directories**: Configure which directories the agent can access for file operations
3. **Choose Your Model**: Select your preferred AI model (Claude Sonnet 4.5 recommended for coding, GPT-5.2 for reasoning)
4. **Try a Template**: Start with a pre-built agent template from the Templates section to see what's possible
5. **Explore a Workspace**: Familiarize yourself with the Code, Browser, or Terminal workspace
6. **Create Your First Automation**: Use the Configurator to build a custom workflow combining multiple tools

### Example Use Cases

**For Developers:**

- Automate code reviews across your codebase
- Generate tests for new features
- Deploy code to production with a single command
- Monitor repositories and send alerts

**For Business Users:**

- Qualify leads from email and web forms
- Automate invoice processing and expense reports
- Generate reports from multiple data sources
- Schedule meetings and manage calendars

**For Content Creators:**

- Generate images and videos from prompts
- Repurpose content across multiple platforms
- Manage social media accounts
- Create documentation from code

### Development Commands

```bash
# Desktop Application
pnpm dev:desktop          # Run desktop app in development mode with hot reload
pnpm build:desktop        # Build desktop app for production (creates binary)
pnpm test:e2e            # Run end-to-end tests with Playwright
pnpm test:smoke          # Run smoke tests
pnpm test:coverage       # Generate test coverage reports

# Web Platform
pnpm dev:web              # Run web platform in development mode
pnpm build:web            # Build web platform for production
pnpm start:web            # Start production server

# All Projects
pnpm build:all            # Build all packages except desktop app
pnpm lint                 # Lint all projects with ESLint
pnpm lint:fix            # Fix linting issues automatically
pnpm format              # Format code with Prettier
pnpm typecheck           # Type check all projects with TypeScript
pnpm test                # Run all tests across projects
pnpm clean               # Clean all build artifacts and dist folders
pnpm clean:build         # Clean only dist folders
```

---

## 💰 Pricing & Plans

AGI Workforce offers flexible pricing plans to suit different needs:

### Free Plan

- **Price**: $0/month
- **Features**:
  - Local LLMs only
  - Basic automations
  - 5 automations per day
  - 50 API calls
  - 512 MB storage
  - 1 team member

### Hobby Plan

- **Price**: $10/month or $59.88/year (save 50%)
- **Features**:
  - Free to use own APIs
  - Core desktop agent
  - Community support
  - 10 automations per day
  - 100 API calls
  - 1 GB storage
  - $1/month token credits
  - 90-day free trial

### Pro Plan ⭐ Most Popular

- **Price**: $29.99/month or $299.88/year (save 17%)
- **Features**:
  - Unlimited automations
  - Web & UI automation
  - Email support
  - 10,000 API calls
  - 10 GB storage
  - $20/month token credits

### Max Plan

- **Price**: $299.99/month or $2,999.88/year (save 17%)
- **Features**:
  - All Pro features
  - Priority support
  - Custom workflows
  - Webhook integration
  - Analytics dashboard
  - Unlimited API calls
  - 50 GB storage
  - $250/month token credits

### Enterprise Plan

- **Price**: Custom pricing
- **Features**:
  - Everything in Max
  - Unlimited team members
  - SSO (Single Sign-On)
  - On-premise deployment
  - Custom integrations
  - Dedicated support
  - SLA guarantees

---

## 🔒 Security & Privacy

We treat your data with the highest priority.

### Security Features

- **Local-First Key Management**: API keys are stored securely using your OS's native keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service), never in plain text
- **Permission Guards**: All sensitive tool executions (file writes, terminal commands) are gated by our secure `ToolGuard` system, ensuring you always stay in control
- **Approval Workflows**: Require explicit approval for sensitive operations
- **Audit Logging**: Complete audit trail of all agent actions
- **Encrypted Storage**: Sensitive data encrypted at rest

### Privacy Features

- **Local Processing**: Use local models (Ollama) for complete privacy
- **No Data Collection**: Your conversations and data stay on your machine
- **Optional Cloud Sync**: Cloud features are opt-in only
- **Transparent Operations**: All agent actions are logged and visible

---

## 📚 Additional Resources

### Documentation & Guides

- **User Guide**: Step-by-step guides for using AGI Workforce features
- **API Documentation**: Complete API reference for custom integrations
- **Workspace Guides**: Detailed documentation for each workspace
- **Template Library**: Browse and customize pre-built agent templates
- **Workflow Examples**: Real-world examples and use cases
- **Troubleshooting**: Common issues and solutions
- **MCP Integration Guide**: Building custom MCP servers

### Staying Updated

- **Release Notes**: Latest features and improvements in each version
- **Blog**: Articles, tutorials, and announcements
- **GitHub**: Source code and project tracking

### Community & Support

- **GitHub Discussions**: Ask questions and share ideas with the community
- **Discord Community**: Real-time chat with developers and users
- **Issue Tracker**: Report bugs and request features
- **Email Support**: Available for Pro and Max plans
- **Priority Support**: Dedicated support for Max and Enterprise plans
- **Community Support**: Free community support through discussions and Discord

### Developer Resources

- **Contributing Guide**: How to contribute to AGI Workforce
- **Development Setup**: Local development environment setup
- **Architecture Documentation**: Understanding the codebase structure
- **CLI Documentation**: Using Claude Code with AGI Workforce

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines for more information.

### How to Contribute

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 🙏 Acknowledgments

- Built with [Tauri](https://tauri.app/) for native desktop performance
- Powered by cutting-edge LLM providers
- Inspired by the Model Context Protocol (MCP) standard

---

_Built for the future of work._

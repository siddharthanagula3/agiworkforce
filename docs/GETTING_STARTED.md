# Getting Started with AGI Workforce

Welcome! This guide will take you from installation to your first automated task in just a few minutes.

## Quick Start (5 Minutes)

### Step 1: Install AGI Workforce

**Download**

1. Visit [agiworkforce.com/download](https://agiworkforce.com/download)
2. Choose your platform:
   - macOS: Download the .dmg file
   - Windows: Download the .exe installer
   - Linux: Download the .AppImage or .deb file

**Install**

**macOS:**

```bash
1. Open the downloaded .dmg file
2. Drag AGI Workforce to Applications folder
3. Open from Applications (right-click → Open first time)
```

**Windows:**

```bash
1. Run the installer .exe file
2. Follow installation wizard
3. Launch from Start Menu or Desktop
```

**Linux:**

```bash
# AppImage
chmod +x AGI-Workforce.AppImage
./AGI-Workforce.AppImage

# Debian/Ubuntu
sudo dpkg -i agi-workforce.deb
```

### Step 2: Create Your Account

1. **Launch Application**
   - First-time welcome screen appears

2. **Sign Up**
   - Click "Create Account"
   - Enter your email address
   - Choose a strong password
   - Click "Sign Up"

3. **Verify Email**
   - Check your inbox
   - Click verification link
   - Return to application

4. **Choose Plan**
   - Start with Free (no credit card required)
   - Upgrade anytime for more messages

### Step 3: Complete Onboarding

The interactive onboarding takes 2-3 minutes:

**Welcome Tour** (30 seconds)

- Quick overview of the interface
- Main features highlighted
- Navigation basics

**Model Selection** (1 minute)

- Choose your default AI provider
- Recommendation: Start with "Auto" mode
- Can change anytime in settings

**Theme Selection** (10 seconds)

- Light, Dark, or System theme
- Preview before selecting
- Can toggle with Cmd/Ctrl+Shift+T

**First Conversation** (1 minute)

- Try the example prompt
- See AI in action
- Learn basic chat controls

### Step 4: Your First Task

Let's accomplish something real!

**Example 1: File Analysis**

```
Prompt: "List all the files in my Downloads folder and organize
them by file type"

AI will:
1. Request permission to access Downloads
2. Scan the folder
3. Create a report organized by type
4. Suggest organization strategies
```

**Example 2: Code Generation**

```
Prompt: "Create a Python script that renames all .txt files in a
directory by adding today's date as a prefix"

AI will:
1. Generate the Python code
2. Add comments and documentation
3. Include error handling
4. Provide usage instructions
```

**Example 3: Research Task**

```
Prompt: "Research the top 3 JavaScript testing frameworks and
create a comparison table"

AI will:
1. Search for current information
2. Compare features
3. Generate formatted table
4. Provide recommendations
```

## Detailed Setup

### System Requirements

**Minimum Requirements:**

- **OS**: macOS 10.15+, Windows 10+, or Linux (Ubuntu 20.04+)
- **RAM**: 4 GB
- **Storage**: 500 MB for application
- **Internet**: Broadband connection

**Recommended:**

- **OS**: Latest macOS, Windows 11, or Ubuntu 22.04+
- **RAM**: 8 GB or more
- **Storage**: 2 GB for application and cache
- **Internet**: High-speed connection for optimal performance

### Configuration

#### AI Model Setup

1. **Open Settings**
   - Click gear icon in sidebar
   - Or press `Cmd/Ctrl + ,`

2. **Navigate to AI Models**
   - Left sidebar: "AI Models"

3. **Configure Providers**

**Using Managed Cloud (Recommended for Beginners)**

```
✓ Provider: Managed Cloud
✓ No API keys needed
✓ All models available
✓ Pay-as-you-go pricing
✓ Included in subscription
```

**Using Your Own API Keys (Advanced)**

```
1. Select provider (OpenAI, Anthropic, etc.)
2. Click "Add API Key"
3. Paste your key
4. Click "Verify"
5. Choose default model
```

**Using Local Models (Privacy-Focused)**

```
1. Install Ollama (ollama.ai)
2. Download models: ollama pull llama2
3. In AGI Workforce: Select "Ollama" provider
4. Choose local model
5. Works offline!
```

#### Workspace Setup

**Set Allowed Directories**

1. Settings → Privacy → Allowed Directories
2. Click "Add Directory"
3. Select your workspace folders
4. AI can only access these folders

**Recommended Directories:**

- `~/Documents` - Personal documents
- `~/Projects` - Development projects
- `~/Downloads` - For organizing downloads

#### Keyboard Shortcuts

**Essential Shortcuts:**

- `Cmd/Ctrl + K` - Command palette (most important!)
- `Cmd/Ctrl + Enter` - Send message
- `Cmd/Ctrl + Shift + O` - New conversation
- `Cmd/Ctrl + /` - Show all shortcuts
- `Escape` - Close/cancel

**Customize Shortcuts:**

1. Settings → Keyboard
2. Click shortcut to edit
3. Press new key combination
4. Save changes

### Theme Customization

**Choose Your Theme**

1. Settings → Appearance
2. Select theme:
   - **Light**: Clean, bright interface
   - **Dark**: Easy on eyes, great for night
   - **System**: Matches your OS theme

**Adjust Font Size**

1. Settings → Appearance → Font Size
2. Options: Small, Medium, Large, Extra Large
3. Changes apply immediately

## First Steps Guide

### Understanding the Interface

#### Sidebar (Left)

**Conversations**

- Recent chats listed chronologically
- Click to switch conversations
- Right-click for options (rename, delete)

**Quick Actions**

- New Conversation
- Open File
- Terminal
- Settings

**Status**

- Current model indicator
- Token usage
- Connection status

#### Main Chat Area (Center)

**Message Display**

- Your messages on the right
- AI responses on the left
- Timestamps (toggle in settings)
- Action cards for file ops, commands, etc.

**Message Actions**

- Copy: Copy message text
- Edit: Modify your message
- Retry: Regenerate AI response
- Delete: Remove message

#### Input Area (Bottom)

**Text Input**

- Type your message
- Shift+Enter for new line
- Cmd/Ctrl+Enter to send

**Toolbar**

- 📎 Attach files
- 🎤 Voice input (coming soon)
- 🎨 Model selector
- ⚙️ Advanced options

#### Status Bar (Bottom)

**Left Side**

- Current model
- Connection status
- Background tasks

**Right Side**

- Token count
- Estimated cost
- Message count today

### Your First Conversations

#### 1. Simple Question

**Try this:**

```
"What can you help me with?"
```

**Expected Response:**
AI will explain its capabilities and suggest ways to help.

**Why this works:**

- Open-ended question
- Helps you discover features
- No setup required

#### 2. File Operation

**Try this:**

```
"Create a new text file called 'tasks.txt' in my Documents folder
with a TODO list template"
```

**Expected Flow:**

1. AI asks permission to access Documents
2. You approve the action
3. AI creates the file
4. AI confirms completion
5. You can click to view the file

**Learn from this:**

- How permissions work
- File operation approval flow
- Action cards in chat

#### 3. Code Generation

**Try this:**

```
"Write a JavaScript function that calculates the factorial of a
number, include comments and example usage"
```

**Expected Response:**

- Clean, documented code
- Example usage
- Explanation of how it works

**Next steps:**

- Ask for modifications: "Make it handle negative numbers"
- Request tests: "Write unit tests for this"
- Save it: "Save this to factorial.js"

#### 4. Research & Analysis

**Try this:**

```
"What are the main differences between React and Vue.js? Create
a simple comparison table."
```

**Expected Response:**

- Structured comparison
- Key differences highlighted
- Use cases for each

**Follow up with:**

- "Which one would you recommend for a beginner?"
- "Show me a simple example in each"

### Using Advanced Features

#### Autonomous Agents

Agents can work independently on complex tasks.

**Example Task:**

```
"Analyze my ~/Projects folder, identify all JavaScript projects,
check for outdated dependencies, and create a report with
recommendations"
```

**What Happens:**

1. Agent creates plan
2. Breaks into subtasks:
   - Find JS projects
   - Check package.json files
   - Compare versions
   - Generate report
3. Executes each step
4. Shows progress
5. Delivers final report

**Monitor Progress:**

- Iteration counter shows steps
- Current action displayed
- Approve high-risk operations
- Cancel anytime with Escape

#### MCP Tools

Extend capabilities with external tools.

**Quick Setup - GitHub Integration:**

1. **Get GitHub Token**
   - Go to github.com/settings/tokens
   - Generate new token (classic)
   - Select scopes: repo, read:org
   - Copy token

2. **Add MCP Server**
   - Settings → MCP Servers
   - Click "Add Server"
   - Configuration:
     ```json
     {
       "name": "github",
       "command": "npx",
       "args": ["-y", "@modelcontextprotocol/server-github"]
     }
     ```

3. **Set Credentials**
   - Click "Set Credential"
   - Key: `GITHUB_TOKEN`
   - Value: Your token
   - Save

4. **Start Server**
   - Click "Start"
   - Wait for "Connected" status
   - Tools now available!

5. **Use in Chat**

   ```
   "Show me all open issues in my-username/my-repo"
   ```

   AI automatically uses GitHub MCP tools!

#### Workflow Automation

Create reusable workflows.

**Example: Daily Standup Report**

1. **Open Automation**
   - Sidebar → Automation
   - Click "New Workflow"

2. **Design Workflow**

   ```
   Name: Daily Standup Report
   Trigger: Every weekday at 9 AM

   Steps:
   1. Get yesterday's commits (Git)
   2. Check calendar for today's meetings
   3. Review active tasks
   4. Generate standup report
   5. Copy to clipboard
   ```

3. **Configure Steps**
   - Drag "Git Commands" action
   - Configure: `git log --since="1 day ago"`
   - Connect to "AI Summary" action
   - Configure prompt: "Summarize commits for standup"

4. **Test Workflow**
   - Click "Test Run"
   - Review output
   - Adjust as needed

5. **Activate**
   - Click "Activate Workflow"
   - Runs automatically on schedule

## Next Steps

### Learning Path

**Week 1: Basics**

- ✓ Complete onboarding
- ✓ Try different types of prompts
- ✓ Explore settings
- ✓ Learn keyboard shortcuts

**Week 2: Intermediate**

- Create your first workflow
- Set up one MCP integration
- Experiment with different AI models
- Organize conversations

**Week 3: Advanced**

- Use autonomous agents for complex tasks
- Build multi-step workflows
- Integrate with your dev tools
- Customize extensively

### Explore More

**Documentation**

- [User Guide](USER_GUIDE.md) - Comprehensive reference
- [Features Guide](FEATURES.md) - All capabilities detailed
- [FAQ](FAQ.md) - Common questions

**Video Tutorials**

- Getting Started (10 min)
- File Operations (5 min)
- Code Generation (8 min)
- Workflow Builder (12 min)
- MCP Setup (6 min)

**Community**

- Forum: community.agiworkforce.com
- Discord: discord.gg/agiworkforce
- GitHub: github.com/agiworkforce

### Get Help

**In-App Help**

- Press `Cmd/Ctrl + /` anytime
- Click "?" icon in any section
- Interactive tooltips on hover

**Support**

- Email: support@agiworkforce.com
- Response time: 24-48 hours
- Premium: Priority support

**Common Issues**

- [Troubleshooting Guide](USER_GUIDE.md#troubleshooting)
- [Known Issues](https://github.com/agiworkforce/issues)
- [Status Page](https://status.agiworkforce.com)

## Tips for Success

### Writing Great Prompts

**Be Specific**

```
Instead of: "Help with Python"
Try: "Write a Python function to parse CSV files and convert to JSON"
```

**Provide Context**

```
Instead of: "This doesn't work"
Try: "This React component isn't re-rendering when props change.
Here's the code: [paste code]"
```

**Iterate**

```
1. Start with basic request
2. Review result
3. Ask for refinements
4. Build on previous responses
```

### Managing Conversations

**Organize Well**

- One topic per conversation
- Rename conversations descriptively
- Archive old conversations
- Use search to find past discussions

**Context Management**

- Start fresh for new topics
- Reference previous messages: "Like you showed in message #5..."
- Attach relevant files to provide context

### Keyboard Efficiency

**Most Used Shortcuts**

1. `Cmd/Ctrl + K` - Command palette (use this constantly!)
2. `Cmd/Ctrl + Enter` - Send message
3. `Alt + P` - Switch models quickly
4. `Cmd/Ctrl + F` - Search in conversation
5. `Escape` - Cancel/close anything

**Pro Tip:** Customize shortcuts for your workflow in Settings → Keyboard.

## Success Checklist

After completing this guide, you should be able to:

- ✓ Navigate the interface confidently
- ✓ Start and manage conversations
- ✓ Switch between AI models
- ✓ Perform file operations
- ✓ Generate code
- ✓ Use keyboard shortcuts
- ✓ Understand privacy settings
- ✓ Know where to get help

**Congratulations!** You're ready to be productive with AGI Workforce. 🎉

---

**Next:** Read the [User Guide](USER_GUIDE.md) for in-depth feature documentation or check out [Features Guide](FEATURES.md) to discover all capabilities.

# Desktop Agent - Natural Language Task Execution

## Overview

The Desktop Agent is an autonomous AI assistant that executes tasks on your machine through natural language commands. Similar to tools like Cursor Agent, Comet's Assistant, and Claude Code, it provides a chat interface where you describe what you want, and the agent handles all the underlying actions autonomously.

## Features

### 🤖 Natural Language Understanding
- Type tasks in plain English
- No need for workflows, diagrams, or explicit scripting
- Automatic intent detection and planning

### 🎯 Autonomous Execution
- Multi-step reasoning and planning
- Intelligent tool orchestration
- Background task processing
- Real-time progress tracking

### 🔧 Powerful Tool Integration
The agent has access to 15+ tools including:
- **File Operations**: Read, write, create, delete, search files
- **UI Automation**: Control desktop applications, mouse, keyboard
- **Browser Automation**: Navigate, click, type, extract data
- **Code Execution**: Run commands, scripts, and programs
- **Database Operations**: Query SQL and NoSQL databases
- **API Calls**: Make HTTP requests with authentication
- **Screen Capture**: Take screenshots, OCR text extraction
- **And more...**

### 📊 Real-Time Visibility
- **Reasoning Panel**: See the agent's thought process
- **Action Logs**: Track every tool call and command
- **Todo List**: View progress on multi-step tasks
- **Progress Bar**: Visual completion status

### 🛡️ Safety & Control
- Permission prompts for sensitive actions
- Sandboxed execution environment
- Ability to pause/stop execution
- Audit trail of all actions

## How to Use

### 1. Navigate to Desktop Agent
Click on "Desktop Agent" in the left sidebar (lightning bolt icon).

### 2. Type Your Request
Describe what you want to accomplish in plain English. Examples:

#### File Management
```
Find all TypeScript files in the current directory
Create a new folder called "test-project" and add a README file
Search for files containing "TODO" comments
```

#### Browser Automation
```
Open Chrome and navigate to github.com/trending
Search for "typescript tutorials" on Google and extract the first 5 results
Fill out a form on example.com with test data
```

#### Development Tasks
```
Run npm install and fix any errors
Find and fix TypeScript type errors in the codebase
Generate a unit test for the UserService class
```

#### System Operations
```
Take a screenshot and save it to my desktop
Check disk space and memory usage
Monitor CPU usage for the next 60 seconds
```

#### Data Processing
```
Read data from users.csv and create a summary report
Query the database for all users created in the last 30 days
Convert all PNG images in this folder to JPEG format
```

### 3. Monitor Execution
Watch the agent work in real-time:
- **Current Step**: Shows what the agent is currently doing
- **Reasoning**: Displays the agent's thought process
- **Actions**: Lists all tool calls and commands
- **Tasks**: Shows progress on multi-step operations

### 4. Control Execution
- **Stop**: Click the "Stop" button to halt execution
- **Approve**: Confirm sensitive operations when prompted
- **View Details**: Expand action logs to see full results

## Architecture

### Frontend (React/TypeScript)
- **DesktopAgentChat.tsx**: Main chat interface component
- Real-time event listeners for AGI updates
- Markdown rendering for rich responses
- Progress tracking and status indicators

### Backend (Rust/Tauri)
- **AGI Core**: Central intelligence orchestrator
- **AGI Planner**: LLM-powered task breakdown
- **AGI Executor**: Step-by-step execution engine
- **Tool Registry**: 15+ integrated tools
- **Knowledge Base**: SQLite-backed memory
- **Resource Manager**: CPU, memory, disk monitoring

### Event System
The agent communicates via Tauri events:
- `agi:goal:submitted` - Goal accepted
- `agi:goal:progress` - Progress updates
- `agi:goal:achieved` - Goal completed
- `agi:step:started` - Step execution started
- `agi:tool:called` - Tool invocation
- `agi:reasoning` - Agent reasoning

## Command Integration

The agent uses the following Tauri commands:

### AGI Commands
- `agi_init` - Initialize AGI system
- `agi_submit_goal` - Submit a goal/task
- `agi_get_goal_status` - Check goal status
- `agi_list_goals` - List active goals
- `agi_stop` - Stop execution

### Runtime Commands
- `runtime_queue_task` - Queue a task
- `runtime_execute_task` - Execute a task
- `runtime_get_task_status` - Get task status
- `runtime_cancel_task` - Cancel task

## Example Workflows

### 1. Automated Testing
```
Run all unit tests and generate a coverage report. If coverage is below 80%,
identify untested files and generate test skeletons for them.
```

### 2. Code Refactoring
```
Find all instances of the deprecated API in the codebase and update them
to use the new API. Run tests after each update to ensure nothing breaks.
```

### 3. Data Migration
```
Export all user data from the production database, anonymize email addresses
and phone numbers, then import into the staging database.
```

### 4. UI Testing
```
Open the web app, login with test credentials, navigate through all main pages,
take screenshots of each page, and check for console errors.
```

### 5. Documentation Generation
```
Analyze all TypeScript files in src/components, extract function signatures
and JSDoc comments, then generate a markdown API reference.
```

## Best Practices

### Be Specific
Good: "Create a React component for user profile with name, email, and avatar fields"
Bad: "Make a component"

### Provide Context
Good: "Search for TODO comments in TypeScript files in the src directory"
Bad: "Find TODOs"

### Break Down Complex Tasks
Good: "First, run the linter. If there are errors, fix them. Then run the type checker."
Bad: "Fix everything"

### Use Natural Language
Good: "Download the latest sales report and save it to Desktop/reports/"
Bad: "wget https://example.com/report.pdf -O ~/Desktop/reports/report.pdf"

## Troubleshooting

### Agent Not Responding
- Check if AGI system is initialized (green status indicator)
- Look for errors in action logs
- Try stopping and restarting the agent

### Tool Execution Failed
- Review error message in action logs
- Check if required permissions are granted
- Verify file paths and URLs are correct

### Slow Performance
- Monitor resource usage in the sidebar
- Close unnecessary applications
- Check network connection for API/web operations

### Unexpected Results
- Review reasoning panel to understand agent's interpretation
- Be more specific in your request
- Break complex tasks into smaller steps

## Safety & Security

### Permission System
The agent will prompt for approval before:
- Deleting files or folders
- Running system commands
- Making external API calls
- Modifying database records
- Accessing sensitive data

### Sandboxing
All operations are executed in a controlled environment with:
- Resource limits (CPU, memory, disk)
- Network restrictions
- File system access control
- Audit logging

### Data Privacy
- All data stays on your local machine
- LLM routing prioritizes local models (Ollama)
- No telemetry or external data sharing
- Secure credential storage (OS keyring)

## Advanced Features

### Background Task Management
Long-running tasks automatically run in the background:
- Continue working while agent executes
- Progress updates in real-time
- Pause/resume support
- Task history and recovery

### Parallel Agent Orchestration
Run multiple agents simultaneously:
- 4-8 concurrent agents
- Isolated execution contexts
- Shared knowledge base
- Resource locking prevents conflicts

### Hook System
Trigger custom scripts on events:
- Session start/end
- Tool execution
- Goal completion
- Error conditions

## Future Enhancements

- [ ] Voice input for commands
- [ ] Vision-based UI automation
- [ ] Multi-agent collaboration
- [ ] Workflow templates and presets
- [ ] Learning from user corrections
- [ ] Custom tool integration

## Support

For issues, questions, or feedback:
- GitHub: [agiworkforce-desktop-app](https://github.com/siddharthanagula3/agiworkforce-desktop-app)
- Documentation: See `CLAUDE.md` for technical details
- Status: See `STATUS.md` for implementation status

## Credits

Built on:
- **Tauri 2.0** - Secure desktop framework
- **Rust** - High-performance backend
- **React 18** - Modern UI framework
- **LLM Router** - Multi-provider orchestration
- **MCP Tools** - Modular control primitives

Inspired by:
- Claude Code (Anthropic)
- Cursor Agent (Anysphere)
- Comet Assistant (Google)

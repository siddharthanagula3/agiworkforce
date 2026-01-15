# Frequently Asked Questions (FAQ)

## General Questions

### What is AGI Workforce?

AGI Workforce is an AI-powered automation platform that helps you accomplish complex tasks through natural language conversations. It combines chat interfaces with autonomous agents, file operations, code generation, and workflow automation to streamline your work.

### What makes AGI Workforce different from ChatGPT or other AI tools?

AGI Workforce goes beyond simple chat:

- **Autonomous Agents**: Can work independently on multi-step tasks
- **System Integration**: Direct access to your files, terminal, and applications
- **Workflow Automation**: Build and share reusable workflows
- **Multi-Provider**: Access multiple AI models (OpenAI, Anthropic, Google, etc.)
- **Desktop Native**: Runs locally with offline support
- **Extensible**: MCP protocol for custom integrations

### Is AGI Workforce free?

Yes! We offer a free tier with:

- 10 messages per day
- Access to all core features
- Local Ollama model support

Paid plans start at $9/month for increased message limits and additional features.

### Do I need to provide my own API keys?

No, you don't need to provide API keys. AGI Workforce includes:

- **Managed Cloud**: All models accessible through our backend (included in subscription)
- **Optional BYOK**: Bring your own keys if you prefer (Advanced users)
- **Local Models**: Use Ollama for completely free, private AI

## Getting Started

### How do I install AGI Workforce?

1. Download from [agiworkforce.com/download](https://agiworkforce.com/download)
2. Install for your platform (macOS, Windows, or Linux)
3. Launch and create an account
4. Start chatting!

See our [Getting Started Guide](GETTING_STARTED.md) for detailed instructions.

### What are the system requirements?

**Minimum:**

- macOS 10.15+, Windows 10+, or Ubuntu 20.04+
- 4 GB RAM
- 500 MB disk space
- Internet connection

**Recommended:**

- Latest OS version
- 8 GB+ RAM
- 2 GB disk space
- High-speed internet

### Do I need to know programming to use AGI Workforce?

No! AGI Workforce is designed for everyone:

- **Beginners**: Use natural language for everything
- **Technical Users**: Direct file access, terminal commands, code generation
- **Developers**: Advanced features like LSP, MCP integration, workflows

### How do I get started quickly?

Follow these steps:

1. Complete the 2-minute onboarding
2. Try a simple task: "List files in my Documents folder"
3. Try code generation: "Create a Python script to..."
4. Read the [Getting Started Guide](GETTING_STARTED.md)

## Using AGI Workforce

### How do I switch between AI models?

**Quick method:**

- Press `Alt + P` to open model selector
- Select your preferred model
- Continue chatting

**Settings method:**

1. Go to Settings → AI Models
2. Set default provider and model
3. Configure task-specific routing

### What's the difference between Simple and Advanced mode?

**Simple Mode** (Default):

- Clean, distraction-free interface
- Best for straightforward tasks
- Hides technical details
- Perfect for beginners

**Advanced Mode**:

- Shows detailed execution logs
- Access to all tools and features
- Process reasoning visualization
- Technical information displayed

Toggle between modes with the switch in the top-right corner.

### How do autonomous agents work?

Agents work independently on complex tasks:

1. **You set a goal**: "Analyze my codebase and create documentation"
2. **Agent plans**: Breaks into subtasks
3. **Agent executes**: Uses tools autonomously
4. **Agent adapts**: Adjusts based on results
5. **Agent delivers**: Provides final result

Safety limits:

- Max 1,000 iterations
- 5-minute timeout
- Requires approval for sensitive operations

### Can AGI Workforce access my files?

Only with your permission:

- You control which directories AI can access (Settings → Privacy → Allowed Directories)
- AI asks for approval before file operations
- All operations are logged
- You can revoke access anytime

### How do I create a workflow?

1. Click "Automation" in sidebar
2. Select "New Workflow"
3. Drag actions onto canvas
4. Connect steps with arrows
5. Configure each action
6. Test and activate

See the [Workflow section in User Guide](USER_GUIDE.md#workflow-automation) for details.

### What is MCP and do I need it?

MCP (Model Context Protocol) extends AGI Workforce with external tools like:

- GitHub integration
- Database access
- Custom APIs
- Third-party services

You don't need MCP for basic use, but it's powerful for advanced integrations.

## Privacy & Security

### Is my data safe?

Yes! Security is our top priority:

- **Local Storage**: All data stored locally by default
- **Encryption**: End-to-end encryption available
- **No Training**: Your data is never used to train AI models
- **Audit Logs**: Complete activity tracking
- **Open Source**: Core components are open source

### Where is my data stored?

**Desktop App:**

- Local SQLite database in: `~/.config/agiworkforce/`
- No cloud storage unless you enable sync
- Complete offline functionality

**Web App:**

- Supabase PostgreSQL (encrypted)
- Hosted in US (SOC 2 compliant)
- Can be self-hosted

### Can I use AGI Workforce offline?

Yes, with limitations:

- **Ollama models**: Work completely offline
- **File operations**: Work offline
- **Code editing**: Works offline
- **Cloud AI models**: Require internet
- **Web features**: Require internet

### Does AGI Workforce see my conversations?

**We cannot see your conversations unless:**

- You explicitly share them for support
- You opt-in to anonymous analytics
- Required by law enforcement with valid warrant

**When using cloud AI providers:**

- They process your messages per their policies
- We don't store messages sent to providers
- Choose Ollama for complete privacy

### How do I delete my data?

**Local Data:**

1. Settings → Privacy → Delete All Data
2. Confirm deletion
3. Data is permanently removed

**Account Data:**

1. Settings → Account → Delete Account
2. Verify with email
3. All cloud data deleted within 30 days

## Technical Questions

### Which AI models are available?

**Cloud Providers:**

- OpenAI: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- Anthropic: Claude 3 Opus, Sonnet, Haiku
- Google: Gemini Pro, Gemini Pro Vision
- DeepSeek: DeepSeek Chat, DeepSeek Coder
- xAI: Grok-1
- More providers added regularly

**Local Models (Ollama):**

- Llama 2 (7B, 13B, 70B)
- Mistral (7B)
- CodeLlama (7B, 13B, 34B)
- 100+ community models

### Can I use my own API keys?

Yes! Advanced users can provide their own keys:

1. Settings → AI Models
2. Select provider
3. Click "Add API Key"
4. Paste your key
5. Verify and save

Benefits:

- Pay directly to provider
- Use specific models
- Higher rate limits
- Full control

### What is Ollama and why should I use it?

Ollama runs AI models locally on your computer:

**Benefits:**

- Completely free
- Works offline
- 100% private
- Fast responses
- No API costs

**Requirements:**

- 8GB+ RAM recommended
- 10GB+ disk space per model
- macOS, Linux, or Windows

**Setup:**

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Download a model: `ollama pull llama2`
3. In AGI Workforce: Select "Ollama" provider
4. Choose your model

### How do I set up MCP servers?

**Example: GitHub Integration**

1. Get GitHub token at github.com/settings/tokens
2. In AGI Workforce: Settings → MCP Servers
3. Click "Add Server"
4. Configuration:
   ```json
   {
     "name": "github",
     "command": "npx",
     "args": ["-y", "@modelcontextprotocol/server-github"]
   }
   ```
5. Set credential: `GITHUB_TOKEN` = your token
6. Click "Start"

See [MCP section in User Guide](USER_GUIDE.md#mcp-integration) for more examples.

### Can I run AGI Workforce on multiple computers?

Yes! Use cloud sync:

1. Sign in with same account
2. Settings → Sync → Enable Sync
3. Choose what to sync:
   - Conversations
   - Settings
   - Workflows
   - Templates

Your data syncs across all devices in real-time.

### Does AGI Workforce work on Linux?

Yes! Supported distributions:

- Ubuntu 20.04+
- Debian 11+
- Fedora 36+
- Arch Linux
- Other modern distros

Available formats:

- AppImage (universal)
- .deb (Debian/Ubuntu)
- .rpm (Fedora/RHEL)
- Snap (coming soon)

### How do I update AGI Workforce?

**Automatic Updates** (Default):

- App checks for updates on launch
- Notifies when update available
- One-click update installation

**Manual Updates:**

1. Settings → About
2. Click "Check for Updates"
3. Download and install if available

**Release Channels:**

- Stable (default): Tested, production-ready
- Beta: Early access to new features
- Dev: Latest changes (may be unstable)

## Billing & Subscriptions

### What payment methods do you accept?

We accept:

- Credit/debit cards (Visa, Mastercard, Amex, Discover)
- PayPal
- Apple Pay
- Google Pay
- ACH bank transfer (Enterprise only)

Payments processed securely through Stripe.

### How does billing work?

**Subscription Plans:**

- Billed monthly or annually
- Annual plans save 20%
- Auto-renews unless cancelled
- Can change plan anytime

**Usage-Based Features:**

- Image generation: Per image
- Video generation: Per second
- Premium models: Per token
- Billed monthly

### Can I cancel anytime?

Yes, cancel anytime:

1. Settings → Subscription
2. Click "Cancel Subscription"
3. Confirm cancellation

**What happens:**

- Access continues until period ends
- No refunds for partial months
- Can reactivate anytime
- Data retained for 90 days

### Do you offer refunds?

**30-Day Money-Back Guarantee:**

- Full refund within 30 days
- No questions asked
- Email support@agiworkforce.com

**After 30 days:**

- No refunds for subscription fees
- Exceptions for technical issues
- Contact support to discuss

### Is there a student or nonprofit discount?

Yes! We offer:

- **Students**: 50% off Pro plan
  - Requires valid .edu email
  - Renewed annually
- **Nonprofits**: 40% off any plan
  - Requires 501(c)(3) verification
  - Contact sales@agiworkforce.com

### What's included in Enterprise?

Enterprise includes everything plus:

- Custom pricing
- Unlimited messages
- Dedicated support
- SLA guarantees
- Custom integrations
- On-premise deployment
- SSO/SAML
- Compliance reports
- Training sessions

Contact sales@agiworkforce.com for details.

## Troubleshooting

### AGI Workforce won't start

**Try these steps:**

1. Restart your computer
2. Update to latest version
3. Clear cache: Delete `~/.config/agiworkforce/cache/`
4. Reinstall application
5. Check logs: `~/.config/agiworkforce/logs/`
6. Contact support with log files

### AI responses are slow

**Possible causes:**

1. **Slow internet**: Test speed, switch networks
2. **Provider issues**: Try different model
3. **Large context**: Start new conversation
4. **High load**: Try later or upgrade plan

**Optimize:**

- Use faster models (GPT-3.5, Claude Haiku)
- Reduce max tokens setting
- Clear old conversations
- Use local Ollama models

### File operations aren't working

**Check these:**

1. Directory in Allowed Directories? (Settings → Privacy)
2. Correct file permissions?
3. Enough disk space?
4. File path correct?
5. File not locked by another app?

**Fix:**

1. Add directory to allowed list
2. Check permissions: `ls -la /path/to/file`
3. Free up disk space
4. Close apps using the file

### Commands fail in terminal

**Common issues:**

1. **Permission denied**: Use `sudo` or check permissions
2. **Command not found**: Install required tool or check PATH
3. **Syntax error**: Verify command syntax
4. **Wrong shell**: Check shell type (bash/zsh/etc.)

**AI can help:**

- "Why did this command fail?"
- "Fix this permission error"
- "Generate correct syntax for..."

### MCP server won't connect

**Troubleshooting:**

1. Verify configuration correct
2. Check credentials saved
3. Review server logs (Settings → MCP → View Logs)
4. Test server manually: `npx @modelcontextprotocol/server-github`
5. Check firewall/antivirus not blocking
6. Update server: `npx -y @modelcontextprotocol/server-github@latest`

### How do I report a bug?

**Report via:**

1. **GitHub**: github.com/agiworkforce/issues
2. **Email**: support@agiworkforce.com
3. **In-app**: Settings → Help → Report Bug

**Include:**

- AGI Workforce version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Log files (Settings → Help → Export Logs)

## Platform-Specific

### macOS: "AGI Workforce can't be opened"

**Solution:**

1. Right-click the app
2. Select "Open"
3. Click "Open" in dialog
4. Or: System Preferences → Security → Allow

**Alternative:**

```bash
xattr -cr /Applications/AGI\ Workforce.app
```

### Windows: "Windows protected your PC"

**Solution:**

1. Click "More info"
2. Click "Run anyway"

App is code-signed but may trigger SmartScreen on first run.

### Linux: AppImage won't run

**Make executable:**

```bash
chmod +x AGI-Workforce.AppImage
```

**Install FUSE:**

```bash
# Ubuntu/Debian
sudo apt install fuse libfuse2

# Fedora
sudo dnf install fuse fuse-libs
```

### Can I run AGI Workforce on ARM/Apple Silicon?

Yes! Native support for:

- Apple Silicon (M1, M2, M3)
- ARM Linux
- ARM Windows

Universal binary includes both architectures.

## Advanced Usage

### Can I script AGI Workforce?

Yes! Use the CLI or API:

**CLI:**

```bash
agi chat "What's the weather?"
agi file read /path/to/file
agi workflow run daily-report
```

**API:**

```javascript
const { invoke } = require('@tauri-apps/api');

const result = await invoke('chat_send_message', {
  message: 'Hello!',
  model: 'gpt-4',
});
```

Documentation: [API Reference](API_REFERENCE.md)

### Can I customize the UI?

Yes! Customization options:

1. **Themes**: Light, dark, or create custom
2. **Layout**: Adjust panel sizes
3. **Fonts**: Change size and family
4. **Colors**: Accent color customization
5. **Shortcuts**: Remap all keyboard shortcuts

Advanced: Edit CSS in `~/.config/agiworkforce/custom.css`

### Can I contribute to AGI Workforce?

Absolutely! We welcome contributions:

- **Code**: github.com/agiworkforce
- **Documentation**: Improvements and translations
- **Bug reports**: Help us find issues
- **Feature requests**: Suggest improvements
- **Community**: Help others on forum

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### Is there an API for integrations?

Yes! AGI Workforce provides:

- **REST API**: HTTP endpoints
- **WebSocket API**: Real-time events
- **Tauri Commands**: Native integration
- **MCP Protocol**: Tool extensions

Documentation: [API Reference](API_REFERENCE.md)

## Support & Community

### How do I get help?

**Free Resources:**

- Documentation: docs.agiworkforce.com
- Video tutorials: youtube.com/@agiworkforce
- Community forum: community.agiworkforce.com
- FAQ: This page!

**Support Channels:**

- **Free/Hobby**: Email + community forum
- **Pro/Max**: Priority email support (24-48h)
- **Enterprise**: Dedicated support + phone + SLA

### Where can I see known issues?

**Status Page**: status.agiworkforce.com

- Real-time status
- Incident history
- Scheduled maintenance
- Subscribe to updates

**GitHub Issues**: github.com/agiworkforce/issues

- Open bugs
- Feature requests
- Roadmap discussions

### How often is AGI Workforce updated?

**Release Schedule:**

- **Major releases**: Every 3-4 months
- **Minor updates**: Every 2-3 weeks
- **Patches**: As needed for bugs
- **Emergency fixes**: Within 24 hours

**Beta Channel:**

- Weekly updates
- Early feature access
- Enable in Settings → Updates → Beta Channel

### Can I request a feature?

Yes! We love feature requests:

**How to request:**

1. Check if already requested: github.com/agiworkforce/issues
2. Create new request if not
3. Describe use case and benefit
4. Vote on others' requests

Popular requests get priority!

### Where can I see the roadmap?

**Public Roadmap**: agiworkforce.com/roadmap

**Upcoming Features:**

- Q1 2026: Mobile apps (iOS/Android)
- Q1 2026: Team collaboration features
- Q2 2026: Custom model training
- Q2 2026: Plugin marketplace
- Q3 2026: Voice interface
- Q3 2026: Advanced analytics

Vote on features to influence priority!

## Still Have Questions?

**Can't find your answer?**

- **Email**: support@agiworkforce.com
- **Forum**: community.agiworkforce.com
- **Chat**: In-app support (Enterprise)
- **Phone**: Enterprise customers only

**Response Times:**

- Free/Hobby: 48-72 hours
- Pro/Max: 24-48 hours
- Enterprise: <4 hours (priority SLA)

We're here to help! 🚀

---

**Related Documentation:**

- [User Guide](USER_GUIDE.md) - Complete user documentation
- [Getting Started](GETTING_STARTED.md) - Quick start tutorial
- [Features](FEATURES.md) - All features explained
- [Troubleshooting](USER_GUIDE.md#troubleshooting) - Common issues

# AGI Workforce Release Notes

## How to Use This Template

This file serves as a template for creating release notes for each version of AGI Workforce. Copy the version template below for each new release.

### Release Note Guidelines

1. **Version Number**: Use semantic versioning (MAJOR.MINOR.PATCH)
2. **Release Date**: Include the actual release date
3. **Summary**: One paragraph overview of the release
4. **Categories**: Organize changes into clear categories
5. **User Impact**: Explain what each change means for users
6. **Migration**: Include any required migration steps
7. **Known Issues**: Be transparent about known problems

---

## Version Template

```markdown
# Version X.Y.Z - Release Name (YYYY-MM-DD)

## Summary

Brief overview of this release in 2-3 sentences. What's the main theme? What should users be excited about?

## What's New

### Major Features

List significant new features that change how users interact with the app.

**Feature Name**

- What it does
- Why it matters
- How to use it
- Screenshot/video link

### New Capabilities

Smaller features and enhancements.

- Feature 1: Description
- Feature 2: Description
- Feature 3: Description

## Improvements

### Performance

- Speed improvements and optimization
- Resource usage reductions
- Scalability enhancements

### User Experience

- UI/UX improvements
- Workflow enhancements
- Accessibility updates

### Developer Experience

- API improvements
- New integrations
- Developer tools

## Bug Fixes

### Critical Fixes

High-priority bugs that affected functionality.

- Fixed: Description of issue and fix
- Fixed: Description of issue and fix

### Minor Fixes

- Fixed: Issue description
- Fixed: Issue description
- Fixed: Issue description

## Security Updates

Any security-related changes.

- Security improvement 1
- Security improvement 2

## Breaking Changes

⚠️ **Important**: Changes that may require action from users.

- Change 1: What changed, why, and what users need to do
- Change 2: What changed, why, and what users need to do

## Deprecations

Features being phased out.

- Feature being deprecated
- Timeline for removal
- Recommended alternative

## Migration Guide

Step-by-step instructions for upgrading from previous version.

### Before You Upgrade

- Backup your data
- Note your current settings
- Close all running workflows

### Upgrade Steps

1. Step one
2. Step two
3. Step three

### After Upgrade

- Verify functionality
- Update configurations if needed
- Review new features

## Known Issues

Issues we're aware of and working on.

- Issue 1: Description and workaround
- Issue 2: Description and workaround

## Coming Next

Preview of what's planned for the next release.

- Upcoming feature 1
- Upcoming feature 2
- Upcoming feature 3

## Links

- [Download](https://agiworkforce.com/download)
- [Documentation](https://docs.agiworkforce.com)
- [Full Changelog](https://github.com/agiworkforce/releases)
- [Report Issues](https://github.com/agiworkforce/issues)
```

---

## Sample Release Notes

# Version 1.1.0 - "Workflow Revolution" (2026-01-15)

## Summary

Version 1.1.0 introduces a completely redesigned workflow automation system with visual editing, 50+ new actions, and marketplace sharing. We've also added real-time collaboration features for Enterprise users and significantly improved performance across the board. This release represents 3 months of development and incorporates feedback from over 5,000 users.

## What's New

### Major Features

**Visual Workflow Builder**

The new drag-and-drop workflow builder makes automation accessible to everyone. No coding required!

- **What it does**: Create complex workflows by dragging actions onto a canvas and connecting them
- **Why it matters**: Reduces workflow creation time by 80% and requires zero programming knowledge
- **How to use it**: Click "Automation" in sidebar → "New Workflow" → Start dragging actions
- **Learn more**: [Workflow Tutorial Video](https://youtube.com/@agiworkforce/workflows)

**Workflow Marketplace**

Share and discover workflows created by the community.

- **What it does**: Browse, clone, and share workflows with the AGI Workforce community
- **Why it matters**: Leverage collective knowledge and get started faster with proven workflows
- **How to use it**: Open Automation → Marketplace tab → Browse or search
- **Stats**: Launch day includes 100+ pre-built workflows from our team and beta users

**Real-Time Collaboration** (Enterprise)

Work together on workflows and conversations in real-time.

- **What it does**: Multiple team members can edit workflows simultaneously with live cursors and presence
- **Why it matters**: Enables true teamwork on AI automation projects
- **How to use it**: Share workspace → Invite team members → Collaborate live
- **Requirements**: Enterprise plan required

### New Capabilities

**Expanded AI Model Support**

- Added Mistral AI support (Mixtral 8x7B, Mistral Large)
- Added Cohere support (Command R+)
- Total of 45+ models now available

**MCP Server Updates**

- 12 new official MCP servers including Notion, Linear, and Jira
- HTTP transport support for cloud-hosted MCP servers
- Improved error handling and reconnection logic

**Browser Automation Enhancements**

- Firefox and Safari support (previously Chrome only)
- Mobile device emulation
- Network throttling for testing
- Automatic wait strategies improved by 60%

**Voice Interface** (Beta)

- Voice-to-text input in chat
- Text-to-speech for AI responses
- 40+ voice options
- Enable in Settings → Experimental Features

## Improvements

### Performance

**50% Faster Startup Time**

- Optimized database initialization
- Lazy-loaded modules
- Improved asset caching
- Typical startup: 2 seconds → 1 second

**3x Faster File Operations**

- Parallel file processing
- Improved search algorithms
- Better caching strategies
- Large directory scans 200% faster

**Reduced Memory Usage**

- 40% reduction in idle memory footprint
- Better garbage collection
- Streaming for large files
- Typical usage: 400MB → 240MB

### User Experience

**Redesigned Chat Interface**

- Cleaner message bubbles
- Better code block rendering
- Improved image preview
- Collapsible long responses

**Enhanced Code Editor**

- Vim keybindings support
- Multiple cursor improvements
- Better syntax highlighting for 20+ new languages
- Integrated terminal in editor pane

**Improved Onboarding**

- Interactive tutorial (2 minutes)
- Contextual help system
- Sample workflows included
- First-run experience completely redesigned

**Accessibility Improvements**

- Full keyboard navigation
- Screen reader optimization
- High contrast mode
- Customizable font sizes

### Developer Experience

**New Tauri Commands API**

- 30+ new commands for deeper system integration
- Better error handling and typing
- Comprehensive documentation
- Example snippets for common tasks

**Webhook Support**

- Trigger workflows from external events
- Secure webhook URLs
- Payload transformation
- Retry logic with exponential backoff

**CLI Tool**

- New `agi` command-line tool
- Run workflows from terminal
- Scriptable automation
- CI/CD integration support

## Bug Fixes

### Critical Fixes

**Fixed: Conversation data loss on crash**

- Issue: Unsaved conversations could be lost if app crashed
- Fix: Implemented auto-save every 10 seconds + crash recovery
- Impact: Prevents data loss for all users

**Fixed: MCP server connection hanging**

- Issue: Some MCP servers would hang during initialization
- Fix: Added 30-second timeout + better error messages
- Impact: Resolves connection issues affecting 15% of MCP users

**Fixed: File watcher memory leak**

- Issue: Watching directories would slowly consume memory
- Fix: Proper cleanup of file system watchers
- Impact: Prevents memory growth over long sessions

### Minor Fixes

- Fixed: Model selector dropdown positioning on small screens
- Fixed: Syntax highlighting for F# code blocks
- Fixed: Copy button not working in Firefox
- Fixed: Terminal scroll position reset on resize
- Fixed: Duplicate notifications for workflow completion
- Fixed: Theme not persisting after restart in some cases
- Fixed: Keyboard shortcuts conflicting with browser shortcuts
- Fixed: Export conversation including deleted messages
- Fixed: Token counter inaccurate for GPT-4 Turbo
- Fixed: File upload progress bar not updating smoothly
- Fixed: Settings search not finding some options
- Fixed: Dark mode contrast issues in workflow builder
- Fixed: Drag and drop file upload not working in some dialogs
- Fixed: Agent approval dialog appearing behind main window
- Fixed: Special characters in file names causing errors

## Security Updates

**Enhanced Credential Storage**

- Now using OS keychain for all API keys and tokens
- Migration from old storage method automatic
- Existing credentials re-encrypted with stronger algorithm

**Improved Sandbox Security**

- Agent file operations now run in isolated environment
- Additional validation for system commands
- Stricter directory access controls

**Dependency Updates**

- Updated 23 dependencies with security patches
- No critical vulnerabilities remain
- Regular security audits now automated

**Audit Logging Enhancements**

- All file operations logged
- API key usage tracked
- Failed authentication attempts recorded
- Export logs for compliance (Enterprise)

## Breaking Changes

⚠️ **Important**: Please review these changes before upgrading.

**Workflow File Format**

We've updated the workflow file format to support new features.

- **What changed**: Workflows are now saved in version 2 format
- **Why**: Enables new features like parallel execution and better error handling
- **Action required**: Old workflows will be automatically migrated on first open
- **Rollback**: If you need to downgrade, export workflows before upgrading

**MCP Configuration**

MCP server configuration has moved to a new location.

- **What changed**: `mcp.json` renamed to `mcp-servers.json` and moved to config directory
- **Why**: Consistency with other configuration files
- **Action required**: None - automatic migration on startup
- **Location**: Old: `~/.agiworkforce/mcp.json` → New: `~/.config/agiworkforce/mcp-servers.json`

**API Endpoint Changes** (Developers only)

Some API endpoints have been updated for consistency.

- `POST /api/chat/message` → `POST /api/v1/chat/messages`
- `GET /api/workflows` → `GET /api/v1/workflows`
- `POST /api/file/read` → `POST /api/v1/files/read`

**Action required for developers**: Update API calls to use new endpoints. Old endpoints will work until version 2.0.0 but will show deprecation warnings.

## Deprecations

**Legacy Workflow Format** (Version 1)

- **Deprecated**: Version 1 workflow format
- **Timeline**: Support ends in Version 2.0.0 (planned Q2 2026)
- **Alternative**: Workflows automatically upgraded to version 2
- **Recommendation**: Export and re-import any critical workflows to ensure compatibility

**Old Chat API** (Unversioned endpoints)

- **Deprecated**: Unversioned API endpoints (`/api/chat` instead of `/api/v1/chat`)
- **Timeline**: Support ends in Version 2.0.0
- **Alternative**: Use versioned endpoints (`/api/v1/`)
- **Recommendation**: Update integrations to use v1 API

## Migration Guide

### Before You Upgrade

1. **Backup Your Data**

   ```bash
   # macOS/Linux
   cp -r ~/.config/agiworkforce ~/.config/agiworkforce-backup

   # Windows
   xcopy %APPDATA%\agiworkforce %APPDATA%\agiworkforce-backup /E /I
   ```

2. **Export Critical Workflows**
   - Open each important workflow
   - Click "Export" → Save to safe location
   - Keep these as backup

3. **Note Current Settings**
   - Screenshot your AI model settings
   - Export keyboard shortcuts if customized
   - List your MCP servers

4. **Close Running Tasks**
   - Cancel any running agents
   - Stop all workflows
   - Close all open files

### Upgrade Steps

**Desktop App:**

1. **Download Update**
   - App will prompt when update available, or
   - Download from [agiworkforce.com/download](https://agiworkforce.com/download)

2. **Install Update**
   - **macOS**: Open DMG, drag to Applications (replace existing)
   - **Windows**: Run installer, follow prompts
   - **Linux**: Install package or replace AppImage

3. **First Launch**
   - App will perform automatic migrations
   - May take 30-60 seconds on first launch
   - Do not interrupt migration process

4. **Verify Migration**
   - Check that conversations are intact
   - Verify workflows open correctly
   - Test MCP server connections

**Web Version:**

- Web version updates automatically
- Hard refresh (Cmd/Ctrl + Shift + R) if issues occur

### After Upgrade

1. **Review New Features**
   - Take the updated onboarding tour
   - Try creating a workflow in new builder
   - Explore the marketplace

2. **Update Configurations**
   - MCP server settings may need credentials re-entered
   - Review workflow triggers (new options available)
   - Check keyboard shortcuts (some new defaults)

3. **Test Critical Workflows**
   - Run your important workflows
   - Verify they work as expected
   - Update if you want to use new features

4. **Provide Feedback**
   - Report any issues immediately
   - Share your thoughts on new features
   - Suggest improvements

## Known Issues

We're actively working on these issues:

**Ollama Model Loading Slow on Windows**

- **Issue**: Ollama models take 20-30 seconds to load first time on Windows
- **Workaround**: Use "Keep models in memory" option in Ollama settings
- **Status**: Working with Ollama team on fix
- **ETA**: Fix expected in version 1.1.1

**Firefox Extension Compatibility**

- **Issue**: Browser automation extension not yet available for Firefox
- **Workaround**: Use Chrome/Edge for browser automation features
- **Status**: Firefox extension in development
- **ETA**: Expected in version 1.2.0

**Large File Upload Progress**

- **Issue**: Files over 100MB don't show accurate upload progress
- **Workaround**: None currently - upload still completes correctly
- **Status**: Fix in progress
- **ETA**: Version 1.1.1

**ARM Linux Performance**

- **Issue**: Slightly slower performance on ARM Linux compared to x86
- **Workaround**: None
- **Status**: Optimization ongoing
- **ETA**: Improvements in version 1.2.0

## Coming Next

Here's a preview of what we're working on for version 1.2.0 (planned for Q2 2026):

**Mobile Apps**

- Native iOS and Android applications
- Full feature parity with desktop
- Cross-device sync
- Cloud workflows

**Advanced Analytics**

- Usage dashboards
- Cost tracking and optimization
- Team productivity metrics
- Custom reports

**Custom Model Training**

- Fine-tune models on your data
- Private model hosting
- Model versioning
- A/B testing

**Enhanced Collaboration**

- Comments and annotations
- @mentions and notifications
- Shared templates library
- Team workspaces

**API Marketplace**

- Pre-built API integrations
- One-click setup
- Community contributions
- OAuth flows included

Vote on features and track progress on our [public roadmap](https://agiworkforce.com/roadmap).

## Upgrade Today

**Desktop Users:**

- Check for updates: Settings → About → Check for Updates
- Or download: [agiworkforce.com/download](https://agiworkforce.com/download)

**Web Users:**

- Already updated automatically!
- Hard refresh if needed: Cmd/Ctrl + Shift + R

## Links & Resources

- **Download**: [agiworkforce.com/download](https://agiworkforce.com/download)
- **Documentation**: [docs.agiworkforce.com](https://docs.agiworkforce.com)
- **Video Tutorials**: [youtube.com/@agiworkforce](https://youtube.com/@agiworkforce)
- **Full Changelog**: [github.com/agiworkforce/releases/v1.1.0](https://github.com/agiworkforce/releases)
- **Report Issues**: [github.com/agiworkforce/issues](https://github.com/agiworkforce/issues)
- **Community Forum**: [community.agiworkforce.com](https://community.agiworkforce.com)
- **Status Page**: [status.agiworkforce.com](https://status.agiworkforce.com)

## Thank You

This release includes contributions from 47 contributors, feedback from 5,000+ beta users, and countless hours of development. Special thanks to our amazing community for their suggestions, bug reports, and enthusiasm.

**Questions or Issues?**

- Email: support@agiworkforce.com
- Forum: community.agiworkforce.com
- Chat: In-app support (Enterprise)

Happy automating! 🚀

---

_AGI Workforce Team_
_January 15, 2026_

---

## Previous Versions

[View full release history](https://github.com/agiworkforce/releases)

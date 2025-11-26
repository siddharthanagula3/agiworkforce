# Security Policy - AGI Workforce

## Overview

AGI Workforce is designed as a **full-power desktop agent** - it can perform any operation a human can on a Windows machine, including file system access, terminal commands, screen capture, input simulation, browser control, and more.

This power is controlled through a **layered security architecture** that balances capability with safety:

1. **Central Policy Engine** - Risk-based approval system
2. **Workspace Scoping** - Operations defaultto trusted project directories
3. **Trust Levels** - Escalatable from Normal → Elevated → Full System
4. **Audit Logging** - Comprehensive tracking of sensitive operations
5. **Content Security Policy** - Network requests limited to whitelisted domains

**Philosophy**: "Powerful by default, dangerous only with explicit consent"

---

## Threat Model

### What AGI Workforce Can Do (By Design)

- **File System**: Read, write, delete files and directories anywhere accessible to the user
- **Shell Access**: Execute arbitrary commands, spawn terminals, run git operations
- **Screen & Input**: Capture screenshots, simulate keyboard/mouse, access clipboard
- **Browser Automation**: Launch browsers, navigate to any URL, interact with web pages
- **Database Access**: Connect to local and remote databases, execute queries
- **Network Requests**: Make HTTP/S requests, WebSocket connections
- **Credentials**: Read and write to OS credential store (Windows Credential Manager)

### Adversary Models Considered

1. **Malicious Automation Script**: User runs an untrusted workflow that attempts destructive operations
   - **Mitigated by**: Policy engine requires approval for destructive actions, workspace scoping limits access

2. **Compromised LLM / Prompt Injection**: AI agent is tricked into performing harmful actions
   - **Mitigated by**: Approval workflow for high-risk operations, dangerous command detection, audit logging

3. **Accidental Data Loss**: User or agent accidentally deletes important files
   - **Mitigated by**: Delete operations always require approval, no workspace = no write access by default

4. **Data Exfiltration**: Agent sends sensitive data to external server
   - **Mitigated by**: CSP limits network destinations, elevated trust required for external DB connections

5. **Privilege Escalation**: Agent attempts to gain admin/system privileges
   - **Mitigated by**: Application runs as normal user (no UAC elevation), system directories are blacklisted

### Out of Scope

AGI Workforce is **NOT** designed to protect against:

- **Intentionally Malicious Users**: If a user with admin rights wants to harm their own system, the app cannot prevent that
- **OS-Level Exploits**: We rely on Windows security model; kernel exploits are out of scope
- **Physical Access Attacks**: We do not protect against hardware keyloggers, RAM dumps, etc.

---

## Security Architecture

### 1. Policy Engine

**Location**: `apps/desktop/src-tauri/src/security/policy/`

Every sensitive operation is evaluated through the central `PolicyEngine` which returns one of three decisions:

- **Allow**: Proceed without user interaction
- **RequireApproval**: Show confirmation dialog with risk level
- **Deny**: Block operation (possibly with suggestion to elevate trust level)

#### Trust Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| **Normal** (default) | Restrictive, workspace-scoped | General use, untrusted automation |
| **Elevated** | Broader permissions, fewer approvals | User has granted more trust for a workspace |
| **Full System** | Minimal restrictions, comprehensive logging | Agent acts as full human operator replacement |

**How to change trust level**: Settings → Security → Trust Level

#### Risk Levels

| Level | Examples | Default Action |
|-------|----------|----------------|
| **Low** | Reading workspace files, listing directories | Allow (Normal mode) |
| **Medium** | Writing files, running benign commands | Allow in workspace, Require Approval outside |
| **High** | Deleting files, external DB connections | Require Approval |
| **Critical** | Recursive directory deletion, system file access | Require Approval or Deny |

### 2. Workspace Scoping

**Location**: `apps/desktop/src-tauri/src/security/policy/scope.rs`

#### How it Works

1. Users designate **workspace roots** (project directories) in Settings → Workspaces
2. File operations within workspace roots are generally **Allow**ed
3. Operations outside workspaces require higher trust level or approval
4. System-critical directories are **blacklisted** and require Full System mode

#### Default Blacklist

- Windows: `C:\Windows\System32`, `C:\Program Files`, `C:\Program Files (x86)`
- User: Paths containing `.ssh`, `.aws`, `.gnupg`, `.kube`, `credentials`, private keys

#### Path Validation

All paths go through normalization and validation:
- Resolve symlinks and `.` / `..` traversal
- Check against blacklist
- Ensure path length < 4096 characters
- Reject null bytes

### 3. Content Security Policy

**Location**: `apps/desktop/src-tauri/tauri.conf.json`

Network connections are restricted to whitelisted domains:

**Currently Whitelisted**:
- **Local**: `localhost`, `127.0.0.1` (all ports)
- **AI APIs**: `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`
- **OAuth**: `accounts.google.com`, `oauth2.googleapis.com`, `graph.microsoft.com`, `login.microsoftonline.com`
- **Development**: `api.github.com`, `github.com`
- **Messaging**: `*.slack.com`
- **Updates**: `releases.agiworkforce.com`, `*.agiworkforce.com`

**To add more domains**: Edit CSP in `tauri.conf.json` or use Settings → Security → Network Policies (planned feature)

### 4. Audit Logging

**Location**: `apps/desktop/src-tauri/src/security/audit_logger.rs`

All sensitive operations are logged with:
- Timestamp
- Action type (file write, shell command, screen capture, etc.)
- Target (file path, URL, command)
- Decision (allowed, approved, denied)
- User context (trust level, workspace)

**Logs stored at**: `%APPDATA%\agiworkforce\audit_logs\`

**Retention**: 90 days (configurable)

### 5. Approval Workflow

**Location**: `apps/desktop/src-tauri/src/agent/approval.rs`

When an operation requires approval:

1. Agent pauses execution
2. Frontend shows modal with:
   - Clear description of the action
   - Risk level (color-coded)
   - Option to "Remember this decision" (for Low/Medium risks)
3. User approves or denies
4. Decision is logged
5. Agent resumes or aborts

**Trusted Workflows**: Users can mark entire workflows as "trusted" to skip approvals for that workflow's actions.

---

## Known Limitations

### Beta Release Constraints

1. **No Auto-Updater**: Auto-update system is disabled for public beta due to incomplete signature verification. Updates must be installed manually.

2. **Limited Network Policy UI**: Currently, adding new allowed domains requires editing configuration file. A UI for this is planned.

3. **Windows Only**: Current release targets Windows. macOS/Linux support is experimental.

4. **No Sandboxing**: Agent runs with full user privileges. We rely on approval workflow and policy engine rather than process isolation.

### Residual Risks

- **Memory Safety**: Application uses 91 `unsafe` blocks for Windows API calls. These have been documented but not formally audited.
- **Clipboard Leakage**: Agent can read clipboard which may contain passwords from password managers. Mitigated by requiring approval in Normal mode.
- **Screen Capture PII**: Screenshots may capture sensitive information. Users should be aware when screen capture is active (tray icon notification).

---

## Deployment Recommendations

### For Individual Users

1. **Start in Normal Trust Level**: Don't elevate unless you understand the implications
2. **Set Up Workspaces**: Designate your project directories as workspaces in Settings
3. **Review Approvals**: Don't blindly approve - read what the agent wants to do
4. **Check Audit Logs**: Periodically review `%APPDATA%\agiworkforce\audit_logs\`
5. **Use VMs for Untrusted Workflows**: Test automation in a virtual machine first

### For Enterprise/Team Use

1. **Dedicated User Accounts**: Run AGI Workforce under dedicated, non-admin accounts
2. **Network Segmentation**: Place machines running AGI Workforce in a monitored network segment
3. **Centralized Audit Collection**: Export audit logs to SIEM for analysis
4. **Code Review for Custom Workflows**: Review any shared automation scripts before execution
5. **Backup Strategy**: Ensure regular backups before enabling aggressive file operations

### For Development/Testing

1. **Use Windows Sandbox**: Test in isolated environment
2. **Snapshot VMs**: Take snapshots before running untested automation
3. **Monitor Resource Usage**: Watch for runaway processes or disk usage
4. **Test Approval Workflow**: Verify that dangerous operations actually trigger approval prompts

---

## Responsible Disclosure

### Reporting Security Vulnerabilities

**DO NOT** open public GitHub issues for security vulnerabilities.

Instead:

1. **Email**: security@agiworkforce.com (preferred)
2. **Encrypted**: Use PGP key (key ID: TBD)
3. **GitHub Security Advisory**: https://github.com/agiworkforce/agiworkforce-desktop-app/security/advisories

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if known)
- Your contact information

### Response Timeline

- **24 hours**: Acknowledgement of report
- **7 days**: Initial assessment and severity classification
- **30 days**: Fix developed and tested
- **60 days**: Public disclosure (coordinated with reporter)

### Bounty Program

We offer rewards for qualifying vulnerabilities:

- **Critical**: $500-$2000 (RCE, data exfiltration, privilege escalation)
- **High**: $200-$500 (authentication bypass, path traversal, command injection)
- **Medium**: $50-$200 (XSS, CSRF, information disclosure)
- **Low**: Recognition in CHANGELOG

---

## Security Updates

### Current Version: 5.0.0 (Beta)

**Status**: PUBLIC BETA - Use with caution in production environments

**Known Security Issues**: None (as of 2025-11-26)

### Update Mechanism

For public beta: **Manual updates only**

1. Download installer from https://releases.agiworkforce.com
2. Verify SHA256 checksum (published in release notes)
3. Run installer (requires admin rights for installation only)
4. Application will migrate settings automatically

**Future**: Auto-updater will be enabled once signature verification is properly implemented.

---

## Compliance Considerations

### Data Privacy

- **Local-First**: All user data stored locally in `%APPDATA%\agiworkforce\`
- **No Telemetry by Default**: Crash reporting (Sentry) is opt-in via environment variable
- **No Account Required**: Application can be used entirely offline

### Data Retention

- **Audit Logs**: 90 days rolling window
- **Chat History**: Indefinite (user can delete)
- **File Cache**: Until manual cleanup or disk space pressure

### Data Export

Users can export all their data:
- Settings → Data & Privacy → Export User Data
- Generates JSON archive with all conversations, settings, workflows

---

## Appendix

### Checklist for Security Review

Before deploying AGI Workforce:

- [ ] Reviewed and understood the threat model
- [ ] Configured workspaces for project directories
- [ ] Set appropriate trust level (start with Normal)
- [ ] Verified CSP includes all needed API domains
- [ ] Set up audit log monitoring
- [ ] Tested approval workflow for destructive operations
- [ ] Created backups of important data
- [ ] Reviewed privacy settings (telemetry opt-in/out)
- [ ] Checked Windows Defender exclusions (if needed for performance)
- [ ] Documented allowed/blocked operations for your team

### Security Resources

- **GitHub Security Advisories**: https://github.com/agiworkforce/agiworkforce-desktop-app/security
- **Issue Tracker**: https://github.com/agiworkforce/agiworkforce-desktop-app/issues (non-security bugs only)
- **Community Forum**: https://community.agiworkforce.com
- **Documentation**: https://docs.agiworkforce.com

### Contact

- **Security**: security@agiworkforce.com
- **Support**: support@agiworkforce.com
- **General**: hello@agiworkforce.com

---

**Last Updated**: 2025-11-26
**Version**: 5.0.0 (Public Beta)

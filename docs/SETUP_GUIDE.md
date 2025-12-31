# Quick Setup Guide for New Features

This guide helps you get started with the newly enabled email, calendar, cloud storage, productivity, and document features.

---

## 🚀 Quick Start (3 Steps)

### Step 1: Rebuild the Desktop App

```bash
cd apps/desktop
pnpm install
pnpm tauri build
```

### Step 2: Connect Your Accounts

Choose which services you want to use:

#### 📧 Email (Gmail Example)

1. Go to **Email Workspace** in the desktop app
2. Click "Add Account"
3. Select **Gmail**
4. Enter your email: `you@gmail.com`
5. Create an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Create app password for "AGI Workforce"
   - Copy the 16-character password
6. Paste the app password (not your regular password!)
7. Click "Connect"

#### 📅 Calendar (Google Example)

1. Go to **Calendar Workspace**
2. Click "Connect Calendar"
3. Choose **Google Calendar**
4. You'll be redirected to Google
5. Authorize the app
6. Done!

#### ☁️ Cloud Storage (Google Drive Example)

1. Go to **Cloud Storage Workspace**
2. Click "Connect Storage"
3. Choose **Google Drive**
4. Authorize the app
5. Done!

#### ✅ Productivity (Notion Example)

1. Go to https://notion.so/my-integrations
2. Create a new integration
3. Copy the **Internal Integration Token**
4. Go to **Productivity Workspace** in desktop app
5. Select **Notion**
6. Paste your token
7. Click "Connect"

#### 📄 Documents

**No setup needed!** Works immediately.

### Step 3: Test in Chat

Open the chat and try:

```
"Send an email to myself with subject 'Test' and body 'Testing AGI Workforce!'"

"Create a calendar event for tomorrow at 2pm titled 'Team Standup'"

"Upload my latest report to Google Drive"

"Create a Notion task for 'Review code changes'"

"Create a Word document with my meeting notes from today"
```

---

## 🔑 Getting API Credentials

### Gmail App Password

1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification (if not already enabled)
3. Go to https://myaccount.google.com/apppasswords
4. Select app: **Mail**
5. Select device: **Other** (enter "AGI Workforce")
6. Click **Generate**
7. Copy the 16-character password (format: `xxxx xxxx xxxx xxxx`)

### Outlook/Hotmail

1. Use your regular Microsoft account password
2. If 2FA is enabled, create an app password:
   - Go to https://account.microsoft.com/security
   - Select "Advanced security options"
   - Create app password

### Google Calendar/Drive OAuth

**Option A: Use Your Own OAuth App**

1. Go to https://console.cloud.google.com/
2. Create a new project
3. Enable APIs:
   - Google Calendar API
   - Google Drive API
4. Create OAuth 2.0 credentials:
   - Application type: **Desktop app**
   - Download JSON
5. Copy `client_id` and `client_secret`

**Option B: Use Desktop App's Built-in Flow**

- The desktop app can guide you through OAuth
- No manual configuration needed
- Works out of the box

### Notion Integration Token

1. Go to https://www.notion.so/my-integrations
2. Click **+ New integration**
3. Name: "AGI Workforce"
4. Select workspace
5. Submit
6. Copy the **Internal Integration Token** (starts with `secret_`)
7. **Important**: Share the Notion pages/databases with this integration:
   - Open the page in Notion
   - Click ⋯ → **Add connections**
   - Select "AGI Workforce"

### Trello API Key & Token

1. Go to https://trello.com/power-ups/admin
2. Click **New** → **API Key**
3. Copy your **API Key**
4. Click the link to manually generate a **Token**
5. Authorize the app
6. Copy the **Token**

### Asana Personal Access Token

1. Go to https://app.asana.com/0/my-apps
2. Click **+ Create new token**
3. Name: "AGI Workforce"
4. Copy the token (starts with `1/`)
5. **Note**: Keep this secure! It has full access to your Asana account.

---

## 🔐 Security Best Practices

### Email Passwords

- ✅ Use App Passwords (not your main password)
- ✅ Revoke app passwords if compromised
- ✅ Keep separate app passwords per device/app

### OAuth Tokens

- ✅ Review connected apps regularly
- ✅ Revoke access if you stop using the feature
- ✅ Tokens are stored encrypted locally

### API Keys

- ✅ Never share your API keys publicly
- ✅ Rotate keys periodically
- ✅ Use workspace/project-specific integrations

### General

- ✅ All credentials stored locally on your machine
- ✅ Nothing sent to external servers except the service itself
- ✅ Encryption at rest for sensitive data
- ✅ Safe mode requires approval for sensitive operations

---

## 🧪 Testing Your Setup

### Test Email

```javascript
// In chat:
"Send me a test email to verify the connection"

// Expected result:
✅ Email sent successfully to your@email.com
```

### Test Calendar

```javascript
// In chat:
"List my events for today"

// Expected result:
✅ Found 3 events: Meeting at 10am, Lunch at 12pm, Review at 3pm
```

### Test Cloud Storage

```javascript
// In chat:
"List files in my Google Drive"

// Expected result:
✅ Found 15 files in root directory
```

### Test Productivity

```javascript
// In chat:
"List my Notion tasks"

// Expected result:
✅ Found 8 tasks (3 in progress, 5 pending)
```

### Test Documents

```javascript
// In chat:
"Read the file report.docx from my desktop"

// Expected result:
✅ Document has 5 pages, extracted 2,431 words
```

---

## ❓ Troubleshooting

### Email Issues

**Problem**: "Failed to send email: Authentication failed"

- **Solution**: Make sure you're using an **App Password**, not your regular password
- **Gmail**: https://myaccount.google.com/apppasswords
- **Outlook**: https://account.microsoft.com/security

**Problem**: "Failed to connect to SMTP server"

- **Solution**: Check firewall/antivirus settings
- Allow outbound connections on port 587 (SMTP) and 993 (IMAP)

### Calendar Issues

**Problem**: "Failed to create event: Unauthorized"

- **Solution**: Re-authenticate your calendar account
- Delete the account and reconnect with fresh OAuth

**Problem**: "Calendar not found"

- **Solution**: Make sure you've granted calendar permissions during OAuth

### Cloud Storage Issues

**Problem**: "File upload failed: Insufficient permissions"

- **Solution**: Check OAuth scopes granted
- Re-authorize with full read/write permissions

**Problem**: "Account not found"

- **Solution**: Make sure you completed the OAuth flow
- Check the Cloud Workspace for connected accounts

### Productivity Issues

**Problem**: "Notion: Integration not found"

- **Solution**: Share the Notion page with your integration:
  1. Open the page
  2. Click ⋯ → Add connections
  3. Select "AGI Workforce"

**Problem**: "Trello: Board access denied"

- **Solution**: Make sure your API token has not expired
- Regenerate the token if needed

**Problem**: "Asana: Invalid token"

- **Solution**: Generate a new Personal Access Token
- Token may have been revoked or expired

### Document Issues

**Problem**: "Failed to read document: File not found"

- **Solution**: Provide the full absolute path to the file
- Use forward slashes: `/Users/you/file.docx`

**Problem**: "Unsupported file format"

- **Solution**: Supported formats:
  - Read: `.docx`, `.xlsx`, `.pdf`
  - Create: `.docx`, `.xlsx`, `.pdf`

---

## 📖 Examples & Use Cases

### Email Automation

```
"Every Monday at 9am, send me a summary of my tasks for the week"

"When I receive an email from boss@company.com, notify me immediately"

"Archive all emails older than 30 days from the 'Newsletters' folder"
```

### Calendar Management

```
"Schedule recurring team standup every weekday at 10am"

"Block out focus time from 2-4pm every afternoon this week"

"Find a 30-minute slot for a meeting with Sarah next week"
```

### Cloud Storage

```
"Backup all files from my Desktop to Google Drive every night"

"Download the latest quarterly report from Drive to my Downloads folder"

"Share the project proposal PDF with view-only access"
```

### Productivity Workflows

```
"Create a Notion task for every email I star in Gmail"

"When I complete a Trello card, create a done log in my journal"

"Add tasks from my morning calendar events to Asana"
```

### Document Processing

```
"Read all PDF invoices in my Documents folder and create an Excel summary"

"Convert my meeting notes from Word to PDF and upload to Drive"

"Search all my documents for mentions of 'Project Phoenix' and create a report"
```

---

## 🎯 Next Steps

1. ✅ Set up accounts for services you use
2. ✅ Test each feature in chat
3. ✅ Create automation workflows
4. ✅ Explore the workspace UIs for advanced settings
5. ✅ Share feedback to improve the features!

---

## 📚 Additional Resources

- **API Documentation**: See `docs/API.md`
- **Feature Details**: See `docs/ENABLED_FEATURES.md`
- **Troubleshooting**: Join our Discord/Slack
- **Examples**: See `examples/` directory

---

## 🎉 You're All Set!

All features are now enabled and ready to use. Start by connecting one service and test it in chat. Once you're comfortable, add more services to unlock the full power of AGI Workforce!

**Need help?** In chat: `"How do I set up email?"`

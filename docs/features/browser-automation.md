# Browser Automation

Control web browsers through natural language commands.

## Overview

Browser automation allows you to automate web tasks by describing what you want in plain English:

- "Book a flight to NYC"
- "Fill out this form with my info"
- "Search for product reviews"

## How It Works

### Visual Context

The AGI uses screenshots to understand the current page state:

```
User: "Click the login button"
     |
     v
Screenshot captured
     |
     v
Vision model identifies login button location
     |
     v
Click action executed at coordinates
```

### Action Types

| Action     | Description                  |
| ---------- | ---------------------------- |
| Navigate   | Go to a URL                  |
| Click      | Click an element             |
| Type       | Enter text into fields       |
| Scroll     | Scroll the page              |
| Screenshot | Capture current state        |
| Wait       | Wait for elements/conditions |

## Natural Language Commands

### Navigation

```
"Go to amazon.com"
"Open the settings page"
"Navigate to my profile"
```

### Interaction

```
"Click the submit button"
"Fill in the email field with john@example.com"
"Select 'Large' from the size dropdown"
```

### Multi-Step

```
"Log into my account, go to settings, and change my password"
"Search for 'wireless headphones' and add the first result to cart"
```

## Configuration

### Browser Settings

The browser extension connects via Native Messaging:

```json
{
  "name": "com.agiworkforce.native",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://..."]
}
```

### Advanced Configuration (Profiles & Proxies)

The browser automation engine supports custom profiles and proxy configurations for enhanced privacy and state management.

```typescript
// Configure via the automation settings API
await invoke('update_automation_settings', {
  settings: {
    use_custom_profile: true,
    profile_path: '/path/to/profile', // Optional: separate profile per task
    proxy: {
      url: 'http://proxy.example.com',
      auth: 'user:pass', // Optional
    },
  },
});
```

### Extension Setup

1. Build extension: `cd apps/extension && pnpm build`
2. Load unpacked in Chrome: `chrome://extensions`
3. Select `apps/extension/dist`

## Integration with Agent Mode

Browser automation is most powerful with Agent Mode:

```
User: "Research the top 5 coffee makers on Amazon
       and create a comparison spreadsheet"

AGI Actions:
1. Navigate to amazon.com
2. Search "coffee makers"
3. Open top 5 results
4. Extract specs from each
5. Create comparison in Google Sheets
```

## Safety Features

### Human-in-the-Loop (Optional)

For sensitive actions, enable approval:

```typescript
// In settings
requireApprovalFor: ['form_submit', 'purchase', 'login'];
```

### No Sensitive Data

Never enters:

- Passwords (unless explicitly enabled)
- Credit card numbers
- Social security numbers

### Undo Navigation

Navigation actions are reversible:

```typescript
// Navigate back
await invoke('browser_back');

// Full navigation history
const history = await invoke('get_browser_history');
```

## Troubleshooting

### Extension Not Connecting

1. Ensure extension is loaded
2. Check native messaging host is installed
3. Verify allowed_origins includes extension ID

### Actions Not Working

1. Check page is fully loaded
2. Try more specific descriptions
3. Enable debug logging

### Timeout Issues

```typescript
// Increase wait time
await invoke('browser_navigate', {
  url: 'https://slow-site.com',
  timeout: 30000, // 30 seconds
});
```

## API Reference

### Navigate

```typescript
await invoke('browser_navigate', { url: 'https://example.com' });
```

### Click

```typescript
await invoke('browser_click', {
  selector: '#submit-button',
  // Or coordinates
  x: 100,
  y: 200,
});
```

### Type

```typescript
await invoke('browser_type', {
  selector: '#email-input',
  text: 'user@example.com',
});
```

### Screenshot

```typescript
const screenshot = await invoke('browser_screenshot', {
  fullPage: false,
});
```

## Related Documentation

- [Agent Mode](agent-mode.md) - Autonomous task completion
- [MCP Integration](mcp.md) - Extensible tools

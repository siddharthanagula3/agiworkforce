# Troubleshooting Guide - Duplicate Windows Issue

## ✅ Good News

The infinite "Loading..." issue is **FIXED**! The app now loads properly with the 3-second timeout.

## 🔧 Current Issue

Multiple duplicate windows/tabs are opening, showing browser tab ID: `ac37371f-11ec-4fbe-8d4a-10bafefdc642`

## Immediate Solutions

### Option 1: Clear Browser State (Recommended)

1. **Close all AGI Workforce windows**
2. **Clear LocalStorage:**
   - If running in browser: Press `F12` → Application tab → Local Storage → Clear all
   - If Tauri desktop app: Delete `%APPDATA%/agiworkforce/browser_state.json` (if exists)
3. **Restart the app**

### Option 2: Reset Database

```bash
# Close the app first, then:
# Windows PowerShell
Remove-Item "$env:APPDATA\agiworkforce\agiworkforce.db" -Force

# Then restart the app
pnpm dev:desktop
```

### Option 3: Fresh Development Start

```bash
# Kill all node/rust processes
taskkill /F /IM node.exe
taskkill /F /IM agiworkforce-desktop.exe

# Clear build artifacts
pnpm clean  # if this command exists

# Start fresh
pnpm dev:desktop
```

## What to Check

### 1. DevTools Console (F12)

Look for errors related to:

- API key parsing
- Provider initialization
- Browser tab management

### 2. Network Tab

Check if API calls to OpenAI/Anthropic are:

- ✅ Status 200 (working)
- ❌ Status 400/401 (API key issues)
- ❌ Stuck pending (timeout/network)

### 3. Test the Chat

Try sending a simple message like "hi" and check:

- Does it send?
- Does response stream back?
- Any error toasts?

## What Was Fixed

**Commit 6edea8f:**

- ✅ Added 3-second timeout to onboarding check
- ✅ Default to skipping onboarding on error
- ✅ Better error logging for OpenAI/Anthropic responses
- ✅ Prevents infinite loading state

**Commit 46bfdea:**

- ✅ OpenAI `max_completion_tokens` support for GPT-5/O3

**Commit e294586:**

- ✅ Calendar Workspace complete
- ✅ API Workspace complete
- ✅ `search_web` tool added

## Next Steps

1. **Try the app** - Can you send a message successfully?
2. **Check console** - Press F12 and look for errors
3. **Report back** with:
   - Console errors (if any)
   - Whether chat works
   - Which option you tried above

---

**Status:** Loading issue FIXED ✅ | Testing chat functionality...

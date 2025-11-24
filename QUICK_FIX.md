# Quick Fix for "Loading..." Issue

## Problem

The app is stuck on "Loading..." screen because the `get_onboarding_status` backend command is hanging or failing silently.

## Immediate Fix

**Option 1: Clear Browser Storage** (Easiest)

1. Close the AGI Workforce app
2. Press `F12` or `Ctrl+Shift+I` to open DevTools in your browser (if running in development)
3. Go to "Application" tab → "Local Storage"
4. Clear all stored data
5. Restart the app

**Option 2: Skip Onboarding** (Fastest)
The app is checking if onboarding is complete. Let's bypass this check temporarily.

Run this SQL query to mark onboarding as complete:

```sql
-- If you have sqlite browser or can access the database
UPDATE settings_v2 SET value = 'true' WHERE key = 'onboarding_complete';
```

**Option 3: Delete Database** (Nuclear option)

1. Close the app
2. Delete the database file at: `%APPDATA%/agiworkforce/agiworkforce.db`
3. Restart the app (will recreate database)

## Root Cause

The backend command `get_onboarding_status` is either:

1. Not responding (async deadlock)
2. Database query hanging
3. Missing error handling

I'm fixing this now in the code by adding a timeout.

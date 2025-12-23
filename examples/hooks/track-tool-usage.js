#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATS_FILE = path.join(os.homedir(), '.agiworkforce', 'tool-stats.json');

const eventJson = process.env.HOOK_EVENT_JSON;
const eventType = process.env.HOOK_EVENT_TYPE;

if (!eventJson) {
  console.error('No event data provided');
  process.exit(1);
}

try {
  const event = JSON.parse(eventJson);

  if (!['PreToolUse', 'PostToolUse', 'ToolError'].includes(eventType)) {
    process.exit(0);
  }

  let stats = {};
  if (fs.existsSync(STATS_FILE)) {
    stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  }

  if (event.context && event.context.tool_name) {
    const toolName = event.context.tool_name;

    if (!stats[toolName]) {
      stats[toolName] = {
        total_uses: 0,
        successful_uses: 0,
        failed_uses: 0,
        total_execution_time_ms: 0,
        first_used: event.timestamp,
        last_used: event.timestamp,
      };
    }

    if (eventType === 'PreToolUse') {
      stats[toolName].total_uses++;
    } else if (eventType === 'PostToolUse') {
      stats[toolName].successful_uses++;
      if (event.context.execution_time_ms) {
        stats[toolName].total_execution_time_ms += event.context.execution_time_ms;
      }
    } else if (eventType === 'ToolError') {
      stats[toolName].failed_uses++;
    }

    stats[toolName].last_used = event.timestamp;
  }

  const dir = path.dirname(STATS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));

  console.log(`Updated tool stats for ${eventType}`);
  process.exit(0);
} catch (error) {
  console.error('Error tracking tool usage:', error.message);
  process.exit(1);
}

#!/usr/bin/env node
// Example hook: Send Slack notifications for important events

const https = require('https');

// Configuration (replace with your webhook URL)
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || 'YOUR_WEBHOOK_URL_HERE';

// Events to notify about
const NOTIFY_EVENTS = ['GoalCompleted', 'GoalError', 'StepError', 'ToolError'];

const eventType = process.env.HOOK_EVENT_TYPE;
const sessionId = process.env.HOOK_SESSION_ID;

// Only notify for specific events
if (!NOTIFY_EVENTS.includes(eventType)) {
  process.exit(0);
}

// Parse event data
const eventJson = process.env.HOOK_EVENT_JSON;
if (!eventJson) {
  console.error('No event data provided');
  process.exit(1);
}

try {
  const event = JSON.parse(eventJson);

  // Determine emoji based on event type
  const emoji = eventType.includes('Error') ? ':x:' : ':white_check_mark:';

  // Build message
  const message = {
    text: `${emoji} *${eventType}*`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${eventType}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Session ID:*\n${sessionId}`
          },
          {
            type: 'mrkdwn',
            text: `*Timestamp:*\n${new Date(event.timestamp).toLocaleString()}`
          }
        ]
      }
    ]
  };

  // Add context-specific information
  if (event.context) {
    const contextFields = [];

    if (event.context.goal_id) {
      contextFields.push({
        type: 'mrkdwn',
        text: `*Goal:*\n${event.context.description || event.context.goal_id}`
      });
    }

    if (event.context.tool_name) {
      contextFields.push({
        type: 'mrkdwn',
        text: `*Tool:*\n${event.context.tool_name}`
      });
    }

    if (event.context.error) {
      message.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error:*\n\`\`\`${event.context.error}\`\`\``
        }
      });
    }

    if (contextFields.length > 0) {
      message.blocks.push({
        type: 'section',
        fields: contextFields
      });
    }
  }

  // Send to Slack
  if (SLACK_WEBHOOK_URL === 'YOUR_WEBHOOK_URL_HERE') {
    console.log('Slack webhook URL not configured');
    console.log('Would send:', JSON.stringify(message, null, 2));
    process.exit(0);
  }

  const url = new URL(SLACK_WEBHOOK_URL);
  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = https.request(options, (res) => {
    if (res.statusCode === 200) {
      console.log('Slack notification sent successfully');
      process.exit(0);
    } else {
      console.error(`Slack notification failed with status ${res.statusCode}`);
      process.exit(1);
    }
  });

  req.on('error', (error) => {
    console.error('Error sending Slack notification:', error.message);
    process.exit(1);
  });

  req.write(JSON.stringify(message));
  req.end();

} catch (error) {
  console.error('Error processing event:', error.message);
  process.exit(1);
}

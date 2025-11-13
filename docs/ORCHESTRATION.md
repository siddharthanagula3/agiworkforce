# Workflow Orchestration System

The AGI Workforce Orchestration System enables users to create, manage, and execute complex multi-agent workflows visually using a drag-and-drop interface powered by React Flow.

## Table of Contents

- [Overview](#overview)
- [Node Types](#node-types)
- [Workflow Execution Model](#workflow-execution-model)
- [Trigger Types](#trigger-types)
- [Getting Started](#getting-started)
- [Best Practices](#best-practices)
- [Example Workflows](#example-workflows)

## Overview

The orchestration system allows you to build sophisticated automation workflows by connecting different types of nodes together. Each workflow consists of:

- **Nodes**: Individual steps or operations in the workflow
- **Edges**: Connections between nodes that define execution flow
- **Triggers**: Events that start workflow execution
- **Execution Context**: Variables and state shared across nodes during execution

## Node Types

### 1. Agent Node (Blue)

**Purpose**: Execute an agent template

The Agent Node allows you to invoke existing agent templates within your workflow. This is the primary action node for leveraging the AGI system's capabilities.

**Configuration**:

- `label`: Display name for the node
- `agent_template_id`: ID of the agent template to execute
- `agent_name`: Human-readable name for the agent
- `input_mapping`: Map workflow variables to agent inputs
- `output_mapping`: Map agent outputs to workflow variables
- `config`: Additional configuration options

**Example Use Case**: Content generation, code analysis, data processing

### 2. Decision Node (Yellow)

**Purpose**: Conditional branching based on conditions

Decision nodes evaluate a condition and route execution flow to different branches based on the result.

**Configuration**:

- `label`: Display name
- `condition`: Expression to evaluate (e.g., `$output.success === true`)
- `condition_type`: Type of condition (`expression`, `output_contains`, `output_equals`, `custom`)
- `true_path`: Node ID for true branch
- `false_path`: Node ID for false branch

**Outputs**: Two handles (true/false)

**Example Use Case**: Error handling, quality checks, conditional processing

### 3. Loop Node (Purple)

**Purpose**: Repeat execution multiple times

Loop nodes enable iteration over collections or repeated execution until a condition is met.

**Configuration**:

- `label`: Display name
- `loop_type`: `count`, `condition`, or `for_each`
- `iterations`: Number of iterations (for count type)
- `condition`: Boolean expression (for condition type)
- `collection`: Variable name containing array (for for_each type)
- `item_variable`: Variable name for current item

**Example Use Case**: Batch processing, data transformation, retry logic

### 4. Parallel Node (Green)

**Purpose**: Execute multiple branches simultaneously

Parallel nodes split execution into multiple concurrent paths that can run independently.

**Configuration**:

- `label`: Display name
- `branches`: Array of branch identifiers
- `wait_for_all`: Whether to wait for all branches to complete
- `timeout_seconds`: Maximum time to wait for all branches

**Outputs**: Multiple handles (one per branch)

**Example Use Case**: Concurrent API calls, parallel data processing

### 5. Wait Node (Orange)

**Purpose**: Delay execution for a specified duration

Wait nodes introduce delays in workflow execution, either for a fixed duration or until a specific time.

**Configuration**:

- `label`: Display name
- `wait_type`: `duration`, `until_time`, or `condition`
- `duration_seconds`: Number of seconds to wait (for duration type)
- `until_time`: Unix timestamp to wait until (for until_time type)
- `condition`: Boolean expression to poll (for condition type)

**Example Use Case**: Rate limiting, scheduled tasks, polling for completion

### 6. Script Node (Red)

**Purpose**: Execute custom code

Script nodes allow you to run custom JavaScript, Python, or Bash scripts within your workflow.

**Configuration**:

- `label`: Display name
- `language`: `javascript`, `python`, or `bash`
- `code`: The script code to execute
- `timeout_seconds`: Maximum execution time

**Security**: Scripts run in a sandboxed environment with limited access

**Example Use Case**: Data transformation, custom validation, API integration

### 7. Tool Node (Indigo)

**Purpose**: Execute a specific tool from the AGI system

Tool nodes provide access to the 15+ tools available in the AGI system (file operations, UI automation, browser, database, etc.).

**Configuration**:

- `label`: Display name
- `tool_name`: Name of the tool to execute
- `tool_input`: Input parameters for the tool
- `timeout_seconds`: Maximum execution time

**Example Use Case**: File operations, browser automation, database queries

## Workflow Execution Model

### Execution Flow

1. **Start**: Workflows begin at nodes with no incoming edges
2. **Sequential**: By default, nodes execute sequentially following edges
3. **Parallel**: Parallel nodes split execution into concurrent branches
4. **Conditional**: Decision nodes route to different paths based on conditions
5. **Loops**: Loop nodes repeat their body based on iteration rules
6. **Completion**: Workflow completes when all branches reach terminal nodes

### Execution Context

Each workflow execution maintains a context containing:

- **Variables**: Key-value pairs accessible to all nodes
- **Current Node**: The node currently being executed
- **Execution Path**: History of nodes that have been executed
- **Loop Counters**: Iteration counts for active loops

### State Management

Workflows can be in one of six states:

- `pending`: Queued for execution
- `running`: Currently executing
- `paused`: Temporarily suspended
- `completed`: Successfully finished
- `failed`: Encountered an error
- `cancelled`: Manually stopped

## Trigger Types

### 1. Manual Trigger

Start workflows on-demand through the UI or API call.

```typescript
{
  type: 'manual';
}
```

### 2. Scheduled Trigger

Execute workflows on a schedule using cron expressions.

```typescript
{
  type: "scheduled",
  cron: "0 0 * * * *",  // Every hour
  timezone: "America/New_York"
}
```

**Cron Format**: `second minute hour day month dayOfWeek`

**Examples**:

- `0 0 * * * *` - Every hour at minute 0
- `0 0 9 * * 1-5` - 9 AM on weekdays
- `0 */15 * * * *` - Every 15 minutes

### 3. Event Trigger

Execute workflows in response to system events.

```typescript
{
  type: "event",
  event_type: "file_changed",
  filter: {
    path: "/path/to/watch",
    extensions: [".txt", ".md"]
  }
}
```

**Supported Event Types**:

- `file_changed` - File system changes
- `email_received` - New email arrival
- `database_updated` - Database record changes
- `api_webhook` - Incoming webhook

### 4. Webhook Trigger

Execute workflows via HTTP POST requests.

```typescript
{
  type: "webhook",
  url: "https://your-domain.com/webhook/workflow-123",
  method: "POST",
  auth_token: "your-secure-token"
}
```

## Getting Started

### Creating Your First Workflow

1. **Open Workflow Builder**
   - Navigate to the Orchestration section
   - Click "New Workflow"

2. **Add Nodes**
   - Drag nodes from the Node Library (left panel)
   - Or click a node type to add it to the canvas

3. **Configure Nodes**
   - Click on a node to select it
   - Edit properties in the Node Editor (right panel)
   - Set labels, conditions, code, etc.

4. **Connect Nodes**
   - Drag from the output handle of one node to the input handle of another
   - Edges show execution flow

5. **Save Workflow**
   - Click the "Save" button in the toolbar
   - Give your workflow a name and description

6. **Execute Workflow**
   - Click the "Execute" button
   - Monitor progress in real-time
   - View execution logs

### Example: Simple Content Generation Workflow

```
[Agent: Generate Content] → [Decision: Quality Check] → [Agent: Publish]
                                        ↓ (if failed)
                              [Agent: Improve Content]
```

1. **Agent Node**: Generates initial content
2. **Decision Node**: Checks if quality score > 0.8
3. If true: **Agent Node** publishes content
4. If false: **Agent Node** improves content, loops back to quality check

## Best Practices

### 1. Workflow Design

- **Keep it Simple**: Start with simple workflows and gradually add complexity
- **Clear Naming**: Use descriptive names for nodes and variables
- **Error Handling**: Always add decision nodes for error paths
- **Documentation**: Add descriptions to workflows and complex nodes

### 2. Performance

- **Minimize Wait Times**: Use appropriate timeouts
- **Parallel Where Possible**: Use parallel nodes for independent operations
- **Avoid Infinite Loops**: Always have exit conditions in loops
- **Resource Limits**: Set reasonable timeout values

### 3. Testing

- **Test Incrementally**: Test each node before adding more
- **Use Manual Triggers**: Start with manual triggers for easier testing
- **Check Logs**: Review execution logs to understand flow
- **Handle Failures**: Test error scenarios

### 4. Maintenance

- **Version Control**: Keep track of workflow changes
- **Monitor Executions**: Review execution history regularly
- **Update Dependencies**: Keep agent templates up to date
- **Clean Up**: Remove unused workflows

## Example Workflows

### Example 1: Daily Report Generation

**Purpose**: Generate and email a daily report every morning

**Nodes**:

1. **Scheduled Trigger** (`0 0 9 * * 1-5` - 9 AM weekdays)
2. **Agent: Collect Data** - Gathers data from multiple sources
3. **Script: Format Report** - Formats data into report structure
4. **Agent: Generate Summary** - Creates executive summary
5. **Tool: Send Email** - Emails report to stakeholders

### Example 2: Content Moderation Pipeline

**Purpose**: Automatically moderate user-generated content

**Nodes**:

1. **Event Trigger** (`content_submitted`)
2. **Agent: Analyze Content** - Checks for violations
3. **Decision: Is Safe?**
   - If yes → **Tool: Publish Content**
   - If no → **Tool: Flag for Review**
4. **Parallel**:
   - Branch 1: **Tool: Notify User**
   - Branch 2: **Tool: Update Database**

### Example 3: Batch File Processing

**Purpose**: Process all files in a directory

**Nodes**:

1. **Tool: List Files** - Gets list of files
2. **Loop: For Each** (over files)
   - **Agent: Process File** - Processes individual file
   - **Decision: Success?**
     - If yes → **Tool: Move to Processed**
     - If no → **Tool: Move to Failed**
3. **Agent: Generate Summary** - Creates processing report

### Example 4: Retry with Exponential Backoff

**Purpose**: Retry an operation with increasing delays

**Nodes**:

1. **Agent: Execute Operation**
2. **Decision: Success?**
   - If yes → **End**
   - If no → **Loop: Retry**
     - **Wait: Exponential Delay** (2^n seconds)
     - **Agent: Execute Operation** (retry)
     - Max iterations: 5

## API Reference

### Workflow Management

```typescript
// Create workflow
await invoke('create_workflow', { definition: WorkflowDefinition });

// Update workflow
await invoke('update_workflow', { id: string, definition: WorkflowDefinition });

// Delete workflow
await invoke('delete_workflow', { id: string });

// Get workflow
await invoke('get_workflow', { id: string });

// Get user workflows
await invoke('get_user_workflows', { userId: string });
```

### Execution Control

```typescript
// Execute workflow
await invoke('execute_workflow', { workflowId: string, inputs: Record<string, any> });

// Pause execution
await invoke('pause_workflow', { executionId: string });

// Resume execution
await invoke('resume_workflow', { executionId: string });

// Cancel execution
await invoke('cancel_workflow', { executionId: string });

// Get execution status
await invoke('get_workflow_status', { executionId: string });

// Get execution logs
await invoke('get_execution_logs', { executionId: string });
```

### Scheduling

```typescript
// Schedule workflow
await invoke('schedule_workflow', {
  workflowId: string,
  cronExpr: string,
  timezone?: string
});

// Get next execution time
await invoke('get_next_execution_time', { cronExpr: string });
```

## Troubleshooting

### Common Issues

**Workflow doesn't start**

- Check that the workflow has a valid start node (no incoming edges)
- Verify all required node configurations are complete
- Check execution logs for errors

**Nodes not connecting**

- Ensure handles are compatible (output to input)
- Check that you're not creating cycles (except with loops)
- Verify edge connections in workflow definition

**Execution hangs**

- Check for infinite loops without exit conditions
- Verify timeout values are set appropriately
- Look for deadlocks in parallel execution

**Variables not passing between nodes**

- Verify input/output mappings are correct
- Check variable names match exactly (case-sensitive)
- Ensure data types are compatible

## Advanced Topics

### Custom Conditions

Decision nodes support various condition types:

- **Expression**: JavaScript-like boolean expressions
- **Output Contains**: Check if output contains a value
- **Output Equals**: Check exact equality
- **Custom**: User-defined condition logic

### Error Handling Patterns

1. **Try-Catch Pattern**: Use decision nodes after operations
2. **Retry Pattern**: Combine loops with wait nodes
3. **Fallback Pattern**: Parallel nodes with timeout
4. **Circuit Breaker**: Track failures, stop after threshold

### Workflow Composition

- **Nested Workflows**: Call workflows from within workflows
- **Modular Design**: Create reusable workflow components
- **Template Library**: Build a library of common patterns

## Support

For additional help:

- Check the main AGI Workforce documentation
- Review example workflows in the workflow library
- Contact support at support@agiworkforce.com

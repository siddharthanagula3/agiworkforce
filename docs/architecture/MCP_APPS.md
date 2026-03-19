# MCP Apps: Interactive Tool UIs

_Updated: 2026-03-19 | Wave 5 Feature_

## Overview

**MCP Apps** allow tool servers to return rich, interactive content instead of plain text responses. Tools can render charts, tables, forms, dashboards, and interactive widgets directly in the chat surface, dramatically improving the user experience for data visualization, configuration, and complex workflows.

The system runs MCP Apps in **sandboxed iframes** with a structured message protocol over `postMessage`, enabling tools to provide UI without executing untrusted code in the main chat context.

## Architecture

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `McpUIComponent` | `packages/types/mcp-apps.ts` | Single UI element (button, input, chart, etc.) |
| `McpAppLayout` | `packages/types/mcp-apps.ts` | Container for components + event handlers |
| `McpAppMessage` | `packages/types/mcp-apps.ts` | Serialized message protocol over postMessage |
| Frontend host | `apps/desktop/src/components/MCP/MCPAppPanel.tsx` | Renders app iframe, routes events |
| Tool server | External MCP server | Returns `McpAppLayout` in tool response |

### Message Flow

```
User triggers tool call
    ↓
Tool server returns McpAppLayout JSON
    ↓
Frontend renders sandbox iframe with initial layout
    ↓
User interaction (click, input change, form submit)
    ↓
Iframe sends McpAppMessage via postMessage
    ↓
Frontend handler routes to tool server via MCP RPC
    ↓
Tool server processes event, returns updated layout
    ↓
Frontend updates iframe with new layout
```

## Component Types

### Primitive Components

```typescript
interface McpUIComponent {
  id: string;                    // Stable component ID within app
  type: string;                  // Component type discriminant
  props: Record<string, unknown>; // Type-specific properties
  events?: Array<{
    name: string;                // 'click', 'change', 'submit', etc.
    handler: string;             // RPC method to call on event
  }>;
}
```

### Built-In Component Types

| Type | Props | Events | Use Case |
|------|-------|--------|----------|
| `button` | `label`, `variant`, `disabled` | `click` | Primary actions |
| `input` | `type`, `placeholder`, `value` | `change`, `submit` | Text/number entry |
| `select` | `options: {label, value}[]` | `change` | Dropdown selection |
| `checkbox` | `label`, `checked` | `change` | Boolean toggle |
| `table` | `columns`, `rows`, `sortable` | `sort`, `select` | Data grid |
| `chart` | `type`, `data`, `options` | `hover` | Visualization (line, bar, scatter, pie) |
| `form` | `fields: Field[]` | `submit`, `validate` | Multi-field input |
| `panel` | `title`, `children` | — | Container / grouping |
| `text` | `content` | — | Static text / markdown |
| `progress` | `value`, `max`, `label` | — | Progress indicator |

### Example: Interactive Dashboard

```typescript
{
  type: 'panel',
  id: 'dashboard',
  props: { title: 'Sales Dashboard' },
  children: [
    {
      type: 'table',
      id: 'sales-table',
      props: {
        columns: [
          { name: 'Date', key: 'date' },
          { name: 'Revenue', key: 'revenue' },
          { name: 'Region', key: 'region' }
        ],
        rows: [ /* data */ ],
        sortable: true
      },
      events: [{ name: 'sort', handler: 'reorder' }]
    },
    {
      type: 'chart',
      id: 'revenue-chart',
      props: {
        type: 'line',
        data: { labels: [ /* dates */ ], datasets: [ /* revenue */ ] }
      }
    }
  ]
}
```

## Frontend Rendering

### Iframe Sandbox Policy

```html
<iframe
  sandbox="allow-scripts allow-popups allow-modals"
  srcdoc="<html>...</html>"
/>
```

**Allowed**: Script execution, basic DOM manipulation
**Blocked**: Navigation, cookie/localStorage access, external resource loading

### Event Routing

When user interacts with component:

1. **Iframe detects event** (click, input change, etc.)
2. **Serializes event to `McpAppMessage`**:
   ```typescript
   {
     type: 'event',
     componentId: 'submit-btn',
     eventName: 'click',
     eventData: { /* form values */ }
   }
   ```
3. **Sends via `postMessage`** to parent window
4. **Frontend routes to MCP RPC handler**
5. **Tool server processes and returns updated layout**
6. **Frontend sends updated layout to iframe** via `postMessage`
7. **Iframe re-renders** with new data

## Tool Server Implementation

### Returning an MCP App

```python
# Example: Python MCP server returning interactive sales form

def handle_tool_call(name, arguments):
    if name == "create_sales_order":
        return {
            "type": "mcp-app",
            "content": {
                "type": "form",
                "id": "order-form",
                "props": {
                    "fields": [
                        {
                            "id": "customer",
                            "label": "Customer",
                            "type": "select",
                            "options": [
                                {"label": "ACME Corp", "value": "acme"},
                                {"label": "Widget Inc", "value": "widget"}
                            ]
                        },
                        {
                            "id": "amount",
                            "label": "Amount",
                            "type": "input",
                            "props": {"type": "number"}
                        }
                    ]
                },
                "events": [
                    {"name": "submit", "handler": "submit_order"}
                ]
            }
        }

def handle_event(component_id, event_name, event_data):
    if event_name == "submit":
        # Process form submission
        customer = event_data.get("customer")
        amount = event_data.get("amount")
        # ... create order ...
        # Return updated layout or confirmation
```

## Security Considerations

1. **Content Security Policy**: Iframe runs with strict CSP, no inline scripts
2. **Message validation**: Frontend validates all incoming `postMessage` events
3. **Type checking**: Runtime type validation of `McpAppLayout` before rendering
4. **XSS prevention**: All user-supplied text escaped before iframe injection
5. **Resource limits**: Iframes have `max-height`, `max-width` constraints
6. **Event spoofing protection**: Events verified against registered handlers

## Performance

- **Lazy rendering**: Components render on-demand as user scrolls
- **Event debouncing**: Rapid events (e.g., input keystroke) batched and debounced
- **Layout caching**: Static layouts cached to avoid re-rendering on event
- **Streaming updates**: Large datasets streamed in chunks for responsiveness

## Example Tools

### SQLite Query UI
Tool returns interactive query builder with table browser, SQL editor, results grid.

### Config Wizard
Tool returns step-by-step form with conditional fields, real-time validation, preview pane.

### Monitoring Dashboard
Tool returns live metrics dashboard with charts, alerts, drill-down capabilities.

### Data Transformer
Tool returns visual ETL pipeline with drag-and-drop transformations, real-time preview.

## Future Enhancements

- **Custom components**: Tool servers register custom component types (requires type registration)
- **File upload**: Support `<input type="file">` for document/data uploads
- **Streaming data**: Progressive loading of large datasets
- **Collaboration**: Multi-user editing of forms (via Conflict-free Replicated Data Type)
- **Theme customization**: Inherit desktop/web app theme tokens

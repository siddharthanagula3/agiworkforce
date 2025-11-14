# Semantic Browser Automation Examples

This document provides examples of using the semantic browser automation system for robust, self-healing web automation.

## Basic Usage

### Finding Elements with Natural Language

```rust
use crate::browser::semantic::SemanticElementFinder;

// Simple natural language query
let selector = SemanticElementFinder::from_natural_language("the login button");

// The selector automatically generates multiple fallback strategies:
// 1. data-testid="login" or data-testid="login-button"
// 2. aria-label="login"
// 3. role="button" with name containing "login"
// 4. Text content "login"
// 5. CSS selectors for buttons containing "login"
```

### Self-Healing Element Finding

```rust
use crate::browser::semantic::{SemanticSelector, SelectorStrategy, SelfHealingFinder};

// Create a selector with multiple fallback strategies
let selector = SemanticSelector::new("the email input field")
    .with_strategy(SelectorStrategy::DataTestId("email-input".into()))
    .with_strategy(SelectorStrategy::AriaLabel("Email address".into()))
    .with_strategy(SelectorStrategy::Role("textbox".into(), "Email".into()))
    .with_strategy(SelectorStrategy::Placeholder("Enter your email".into()))
    .with_strategy(SelectorStrategy::Css("input[type=email]".into()))
    .with_context("form[name=login]");

// Generate JavaScript that tries each strategy in priority order
let find_script = SelfHealingFinder::find_with_healing(&selector);

// Execute in browser - will use first successful strategy
let result = DomOperations::evaluate(&tab_id, &find_script).await?;
```

## Tauri Command Usage

### From Frontend (TypeScript/React)

```typescript
import { invoke } from '@tauri-apps/api/tauri';

// Find element using natural language
const elementInfo = await invoke('find_element_semantic', {
  tabId: 'tab-123',
  query: 'the submit button'
});
console.log('Found element:', elementInfo);

// Click element semantically
await invoke('click_semantic', {
  tabId: 'tab-123',
  query: 'the login button'
});

// Type into element semantically
await invoke('type_semantic', {
  tabId: 'tab-123',
  query: 'email input field',
  text: 'user@example.com'
});

// Get accessibility tree
const a11yTree = await invoke('get_accessibility_tree', {
  tabId: 'tab-123'
});

// Test selector strategies
const strategies = await invoke('test_selector_strategies', {
  tabId: 'tab-123',
  query: 'the search box'
});
console.log('Strategies that work:', strategies.filter(s => s.found));

// Get interactive elements
const elements = await invoke('get_interactive_elements', {
  tabId: 'tab-123'
});
console.log('All interactive elements:', elements);

// Find by ARIA role
const buttons = await invoke('find_by_role', {
  tabId: 'tab-123',
  role: 'button',
  name: 'Submit'
});
```

## Real-World Scenarios

### Scenario 1: Login Form Automation

```rust
// Even if the website redesigns the login form, this will still work
async fn login_to_website(tab_id: &str, email: &str, password: &str) -> Result<()> {
    // Find and fill email field (works with various implementations)
    type_semantic(
        tab_id.to_string(),
        "email input field".to_string(),
        email.to_string(),
    ).await?;

    // Find and fill password field
    type_semantic(
        tab_id.to_string(),
        "password input field".to_string(),
        password.to_string(),
    ).await?;

    // Click login button (works even if CSS class changes)
    click_semantic(
        tab_id.to_string(),
        "the login button".to_string(),
    ).await?;

    Ok(())
}
```

### Scenario 2: Form Filling with Context

```rust
// Use context to disambiguate elements
let selector = SemanticSelector::new("the submit button")
    .with_context("form[id='contact-form']")
    .generate_strategies();

// Will only match submit button within the contact form
```

### Scenario 3: Dynamic Content with Retries

```rust
use crate::browser::semantic::SemanticElementFinder;

async fn wait_and_click_dynamic_button(tab_id: &str) -> Result<()> {
    // Semantic selectors work well with dynamic content
    // Try multiple times if needed
    for attempt in 0..5 {
        match click_semantic(
            tab_id.to_string(),
            "the load more button".to_string(),
        ).await {
            Ok(_) => return Ok(()),
            Err(_) if attempt < 4 => {
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            Err(e) => return Err(e),
        }
    }
    Err(anyhow!("Could not find load more button"))
}
```

### Scenario 4: Accessibility-First Navigation

```rust
use crate::browser::semantic::{AccessibilityAnalyzer, SelectorStrategy};

async fn navigate_by_accessibility(tab_id: &str) -> Result<()> {
    // Get all interactive elements
    let interactive = get_interactive_elements(tab_id.to_string()).await?;

    // Find navigation menu by role
    let nav_items = find_by_role(
        tab_id.to_string(),
        "navigation".to_string(),
        None,
    ).await?;

    // Find specific link by role and name
    let about_link = find_by_role(
        tab_id.to_string(),
        "link".to_string(),
        Some("About Us".to_string()),
    ).await?;

    Ok(())
}
```

## Advanced Patterns

### Custom Selector Builder

```rust
use crate::browser::semantic::{SemanticSelector, SelectorStrategy};

fn build_custom_selector() -> SemanticSelector {
    SemanticSelector::new("the user profile menu")
        .with_strategy(SelectorStrategy::DataTestId("user-menu".into()))
        .with_strategy(SelectorStrategy::AriaLabel("User profile".into()))
        .with_strategy(SelectorStrategy::Role("menu".into(), "User".into()))
        .with_strategy(SelectorStrategy::Css(".user-profile-menu".into()))
        .with_context("nav.header")
}
```

### Testing Selector Strategies

```rust
// Test all strategies and see which ones work
async fn debug_selector(tab_id: &str, query: &str) -> Result<()> {
    let results = test_selector_strategies(
        tab_id.to_string(),
        query.to_string(),
    ).await?;

    println!("Selector test results for '{}':", query);
    for result in results {
        if result.found {
            println!("  ✓ {:?} - Found!", result.strategy);
            if let Some(info) = result.element_info {
                println!("    Selector: {}", info.selector);
                println!("    Text: {:?}", info.text);
            }
        } else {
            println!("  ✗ {:?} - Not found", result.strategy);
            if let Some(err) = result.error {
                println!("    Error: {}", err);
            }
        }
    }

    Ok(())
}
```

### Integration with AGI Tools

```rust
// The semantic browser automation integrates with AGI tool system
use crate::agi::tools::{Tool, ToolRegistry};

// Register semantic browser tools
registry.register_tool(Tool {
    id: "browser_click_semantic".to_string(),
    name: "Click Browser Element (Semantic)".to_string(),
    description: "Click an element using natural language selector".to_string(),
    capabilities: vec![ToolCapability::BrowserAutomation],
    parameters: vec![
        ToolParameter {
            name: "query".to_string(),
            parameter_type: ParameterType::String,
            required: true,
            description: "Natural language description of element (e.g., 'the submit button')".to_string(),
            default: None,
        },
    ],
    // ... rest of tool definition
})?;
```

## Best Practices

1. **Use Descriptive Queries**:
   - Good: "the submit button in the contact form"
   - Bad: "button"

2. **Leverage ARIA Attributes**:
   - Always check if elements have `role`, `aria-label`, or `aria-describedby`
   - These make semantic selectors more reliable

3. **Add Context When Needed**:
   - Use `.with_context()` to disambiguate similar elements
   - Example: Two "Submit" buttons on the same page

4. **Test Strategies**:
   - Use `test_selector_strategies()` during development
   - See which strategies work for your specific website

5. **Combine with Traditional Selectors**:
   - Semantic selectors work alongside CSS/XPath
   - Use them as fallbacks in your strategy list

6. **Monitor and Adapt**:
   - Log which strategies succeed most often
   - Update your selector priorities based on real data

## Common Patterns

### Pattern: Multi-Step Form

```rust
async fn fill_multi_step_form(tab_id: &str) -> Result<()> {
    // Step 1: Personal info
    type_semantic(tab_id.to_string(), "first name field".to_string(), "John".to_string()).await?;
    type_semantic(tab_id.to_string(), "last name field".to_string(), "Doe".to_string()).await?;
    click_semantic(tab_id.to_string(), "the next button".to_string()).await?;

    // Wait for step 2 to load
    tokio::time::sleep(Duration::from_secs(1)).await;

    // Step 2: Contact info
    type_semantic(tab_id.to_string(), "email input".to_string(), "john@example.com".to_string()).await?;
    type_semantic(tab_id.to_string(), "phone number field".to_string(), "555-1234".to_string()).await?;
    click_semantic(tab_id.to_string(), "the submit button".to_string()).await?;

    Ok(())
}
```

### Pattern: Table Interaction

```rust
async fn interact_with_data_table(tab_id: &str) -> Result<()> {
    // Find table by role
    let tables = find_by_role(
        tab_id.to_string(),
        "grid".to_string(), // or "table"
        None,
    ).await?;

    // Click on specific row
    click_semantic(
        tab_id.to_string(),
        "the edit button in the first row".to_string(),
    ).await?;

    Ok(())
}
```

### Pattern: Modal Dialog

```rust
async fn handle_modal_dialog(tab_id: &str) -> Result<()> {
    // Find modal by role
    let dialogs = find_by_role(
        tab_id.to_string(),
        "dialog".to_string(),
        Some("Confirmation".to_string()),
    ).await?;

    // Interact with modal
    click_semantic(
        tab_id.to_string(),
        "the confirm button in the dialog".to_string(),
    ).await?;

    Ok(())
}
```

## Troubleshooting

### Element Not Found

If semantic selectors can't find an element:

1. Use `get_accessibility_tree()` to see what's available
2. Use `get_interactive_elements()` to see all interactive elements
3. Use `test_selector_strategies()` to see which strategies fail
4. Add more specific strategies manually
5. Verify the element is actually in the DOM (not in an iframe)

### Multiple Elements Match

If multiple elements match:

1. Add context with `.with_context()`
2. Be more specific in your query
3. Use modifiers like "first", "last" in your natural language query
4. Use `find_all_elements_semantic()` to see all matches

### Strategies Conflict

If strategies return different elements:

1. Review priority order - higher priority strategies are tried first
2. Remove ambiguous strategies
3. Use more specific selectors
4. Test on actual website to see what works

## Performance Tips

1. **Cache Selectors**: Create selectors once and reuse them
2. **Start with Fast Strategies**: `data-testid` and `aria-label` are fastest
3. **Avoid Text Matching**: It's slower and less reliable than attributes
4. **Use Context**: Narrows down the search space
5. **Limit Strategies**: Don't add too many fallbacks - 3-5 is usually enough

## Migration from Traditional Selectors

```rust
// Before (brittle)
click("#btn-submit-form-123").await?;

// After (self-healing)
click_semantic("the submit button").await?;

// Or with explicit strategies
let selector = SemanticSelector::new("the submit button")
    .with_strategy(SelectorStrategy::DataTestId("submit-btn".into()))
    .with_strategy(SelectorStrategy::Css("#btn-submit-form-123".into()));
```

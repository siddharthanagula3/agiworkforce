#!/bin/bash
for file in agent/planner.rs commands/chat.rs commands/code_editing.rs commands/completion.rs commands/debugging.rs commands/design.rs router/llm_router.rs agi/context_manager.rs; do
  if [ -f "$file" ]; then
    # Use perl for in-place editing with proper newlines
    perl -i -pe 's/, multimodal_content: None,n                },/, multimodal_content: None,\n            }],/g' "$file"
    echo "Fixed $file"
  fi
done

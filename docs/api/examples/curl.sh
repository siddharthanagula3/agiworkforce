#!/bin/bash

# AGI Workforce API - cURL Examples
# These examples demonstrate common API operations using cURL

# Set your authentication token
TOKEN="YOUR_JWT_TOKEN_HERE"
BASE_URL="https://agiworkforce.com/api"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}AGI Workforce API - cURL Examples${NC}\n"

# ============================================================================
# CSRF Token (required for state-changing requests)
# ============================================================================

echo -e "${GREEN}0. Get CSRF Token${NC}"
CSRF_RESPONSE=$(curl -s "$BASE_URL/csrf")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | jq -r '.token')
echo "CSRF Token: ${CSRF_TOKEN:0:20}..."

echo -e "\n"

# ============================================================================
# Health Check
# ============================================================================

echo -e "${GREEN}1. Health Check${NC}"
curl -s "$BASE_URL/health" | jq

echo -e "\n"

# ============================================================================
# User Management
# ============================================================================

echo -e "${GREEN}2. Get Current User${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/me" | jq

echo -e "\n"

# ============================================================================
# Model Catalog (public, no auth required)
# ============================================================================

echo -e "${GREEN}3. Get Model Catalog${NC}"
curl -s "$BASE_URL/models" | jq '.models | length'
echo "(model count shown above)"

echo -e "\n"

# ============================================================================
# LLM API
# ============================================================================

echo -e "${GREEN}4. Get Credit Balance${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/llm/v1/credits/balance" | jq

echo -e "\n"

echo -e "${GREEN}5. Get Usage${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/usage" | jq

echo -e "\n"

echo -e "${GREEN}6. List Available LLM Models${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/llm/v1/models" | jq '.data[] | {id, owned_by}'

echo -e "\n"

echo -e "${GREEN}7. Create Chat Completion${NC}"
curl -s -X POST "$BASE_URL/llm/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant."
      },
      {
        "role": "user",
        "content": "What is the capital of France?"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 150
  }' | jq

echo -e "\n"

echo -e "${GREEN}8. Streaming Chat Completion${NC}"
echo "Note: Streaming output will appear in real-time"
curl -N -X POST "$BASE_URL/llm/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "Write a short haiku about coding."
      }
    ],
    "stream": true
  }'

echo -e "\n\n"

echo -e "${GREEN}9. Ghost-Text Prompt Completion${NC}"
curl -s -X POST "$BASE_URL/completion" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "How do I read a",
    "context": "User is coding in Python"
  }' | jq

echo -e "\n"

# ============================================================================
# Chat Conversations
# ============================================================================

echo -e "${GREEN}10. List Conversations${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/chat/conversations" | jq

echo -e "\n"

echo -e "${GREEN}11. Create Conversation${NC}"
CONV_RESPONSE=$(curl -s -X POST "$BASE_URL/chat/conversations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{
    "title": "Test Conversation",
    "model": "gpt-4o"
  }')
echo "$CONV_RESPONSE" | jq
CONVERSATION_ID=$(echo "$CONV_RESPONSE" | jq -r '.conversation.id')
echo "Conversation ID: $CONVERSATION_ID"

echo -e "\n"

echo -e "${GREEN}12. Send Message${NC}"
curl -s -X POST "$BASE_URL/chat/conversations/$CONVERSATION_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello! What can you do?",
    "model": "gpt-4o"
  }' | jq

echo -e "\n"

# ============================================================================
# Agent Execution
# ============================================================================

echo -e "${GREEN}13. Execute Agent (Streaming)${NC}"
echo "Note: Streaming output will appear in real-time"
curl -N -X POST "$BASE_URL/agents/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "employeeId": "software-engineer",
    "message": "Write a Python function to reverse a string",
    "model": "claude-haiku-4.5"
  }'

echo -e "\n\n"

# ============================================================================
# Memory
# ============================================================================

echo -e "${GREEN}14. List Memories${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/memory?limit=10" | jq

echo -e "\n"

echo -e "${GREEN}15. Create Memory${NC}"
curl -s -X POST "$BASE_URL/memory" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "User prefers dark mode and concise answers",
    "category": "preferences",
    "source": "web"
  }' | jq

echo -e "\n"

echo -e "${GREEN}16. Search Memories${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/memory/search?q=preferences" | jq

echo -e "\n"

# ============================================================================
# Device Management
# ============================================================================

echo -e "${GREEN}17. Generate Device Link Code${NC}"
DEVICE_ID=$(uuidgen)
LINK_RESPONSE=$(curl -s -X POST "$BASE_URL/device/link" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d "{
    \"device_id\": \"$DEVICE_ID\",
    \"device_name\": \"Test Device\",
    \"device_type\": \"desktop\",
    \"device_fingerprint\": \"$(uuidgen)\"
  }")

echo "$LINK_RESPONSE" | jq
LINK_CODE=$(echo "$LINK_RESPONSE" | jq -r '.link_code')
echo -e "Device ID: $DEVICE_ID"
echo -e "Link Code: $LINK_CODE"
echo -e "Expires in: 15 minutes"

echo -e "\n"

echo -e "${GREEN}18. Poll Device Status${NC}"
echo "Polling for authorization..."
DEVICE_FINGERPRINT=$(uuidgen)
for i in {1..3}; do
  sleep 2
  STATUS_RESPONSE=$(curl -s -X POST "$BASE_URL/device/poll" \
    -H "Content-Type: application/json" \
    -d "{\"device_id\": \"$DEVICE_ID\", \"device_fingerprint\": \"$DEVICE_FINGERPRINT\"}")

  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
  echo "Attempt $i: Status = $STATUS"

  if [ "$STATUS" = "approved" ]; then
    echo "$STATUS_RESPONSE" | jq
    break
  fi
done

echo -e "\n"

# ============================================================================
# Subscription Management
# ============================================================================

echo -e "${GREEN}19. Create Checkout Session${NC}"
curl -s -X POST "$BASE_URL/checkout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{
    "plan": "pro",
    "billingInterval": "monthly"
  }' | jq

echo -e "\n"

echo -e "${GREEN}20. Credit Top-Up${NC}"
curl -s -X POST "$BASE_URL/credit-topup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{
    "amount_cents": 10000
  }' | jq

echo -e "\n"

echo -e "${GREEN}21. Sync Subscription${NC}"
curl -s -X POST "$BASE_URL/sync-subscription" \
  -H "Authorization: Bearer $TOKEN" | jq

echo -e "\n"

echo -e "${GREEN}22. Create Billing Portal Session${NC}"
curl -s -X POST "$BASE_URL/portal" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-csrf-token: $CSRF_TOKEN" | jq

echo -e "\n"

# ============================================================================
# Share
# ============================================================================

echo -e "${GREEN}23. Create Share${NC}"
curl -s -X POST "$BASE_URL/share" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -d '{
    "title": "My Shared Chat",
    "messages": [
      {"role": "user", "content": "Hello!"},
      {"role": "assistant", "content": "Hi there! How can I help?"}
    ]
  }' | jq

echo -e "\n"

# ============================================================================
# GDPR
# ============================================================================

echo -e "${GREEN}24. Export User Data (GDPR)${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/user/export" | jq '.data | keys'

echo -e "\n"

# NOTE: Uncomment the following to permanently delete all user data
# echo -e "${GREEN}25. Delete User Data (GDPR) - DESTRUCTIVE${NC}"
# curl -s -X DELETE "$BASE_URL/user/data" \
#   -H "Authorization: Bearer $TOKEN" \
#   -H "x-csrf-token: $CSRF_TOKEN" | jq

# ============================================================================
# Downloads
# ============================================================================

echo -e "${GREEN}25. Download Desktop (Public)${NC}"
echo "Fetches latest release for macOS:"
curl -s -I "$BASE_URL/download?platform=mac" | grep -E "^(HTTP|Location|Content)"

echo -e "\n"

echo -e "\n${BLUE}Examples completed!${NC}\n"

# ============================================================================
# Tips
# ============================================================================

cat << 'EOF'

Tips for using cURL with AGI Workforce API:

1. Always include the Authorization header for authenticated endpoints
2. Include x-csrf-token header for state-changing requests (POST, PUT, DELETE)
3. Fetch CSRF token first: GET /api/csrf
4. Monitor rate limit headers to avoid hitting limits
5. Use jq for pretty-printing JSON responses
6. Add -i flag to see response headers
7. Add -v flag for verbose output (debugging)
8. Use -N flag for streaming responses

Example with all flags:
curl -v -i -H "Authorization: Bearer $TOKEN" "$BASE_URL/me"

EOF

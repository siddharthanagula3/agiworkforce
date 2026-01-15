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
# User Management
# ============================================================================

echo -e "${GREEN}1. Get Current User${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/me" | jq

echo -e "\n"

# ============================================================================
# LLM API
# ============================================================================

echo -e "${GREEN}2. Get Credit Balance${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/llm/v1/credits/balance" | jq

echo -e "\n"

echo -e "${GREEN}3. List Available Models${NC}"
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/llm/v1/models" | jq '.data[] | {id, owned_by, tier_required}'

echo -e "\n"

echo -e "${GREEN}4. Create Chat Completion${NC}"
curl -s -X POST "$BASE_URL/llm/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
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

echo -e "${GREEN}5. Chat Completion with Prompt Caching${NC}"
curl -s -X POST "$BASE_URL/llm/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful coding assistant with expertise in Python, JavaScript, and Rust."
      },
      {
        "role": "user",
        "content": "How do I read a CSV file in Python?"
      }
    ],
    "use_prompt_cache": true
  }' | jq

echo -e "\n"

echo -e "${GREEN}6. Streaming Chat Completion${NC}"
echo "Note: Streaming output will appear in real-time"
curl -N -X POST "$BASE_URL/llm/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "Write a short haiku about coding."
      }
    ],
    "stream": true
  }'

echo -e "\n\n"

# ============================================================================
# Device Management
# ============================================================================

echo -e "${GREEN}7. Generate Device Link Code${NC}"
DEVICE_ID=$(uuidgen)
LINK_RESPONSE=$(curl -s -X POST "$BASE_URL/device/link" \
  -H "Content-Type: application/json" \
  -d "{
    \"device_id\": \"$DEVICE_ID\",
    \"device_name\": \"Test Device\",
    \"device_type\": \"desktop\"
  }")

echo "$LINK_RESPONSE" | jq
LINK_CODE=$(echo "$LINK_RESPONSE" | jq -r '.link_code')
VERIFY_URL=$(echo "$LINK_RESPONSE" | jq -r '.verify_url')

echo -e "\nDevice ID: $DEVICE_ID"
echo -e "Link Code: $LINK_CODE"
echo -e "Verify URL: $VERIFY_URL"
echo -e "Expires in: 15 minutes"

echo -e "\n"

echo -e "${GREEN}8. Poll Device Status${NC}"
echo "Polling for authorization..."
for i in {1..5}; do
  sleep 2
  STATUS_RESPONSE=$(curl -s -X POST "$BASE_URL/device/poll" \
    -H "Content-Type: application/json" \
    -d "{\"device_id\": \"$DEVICE_ID\"}")

  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status')
  echo "Attempt $i: Status = $STATUS"

  if [ "$STATUS" = "authorized" ]; then
    echo "$STATUS_RESPONSE" | jq
    break
  fi
done

echo -e "\n"

# ============================================================================
# Subscription Management
# ============================================================================

echo -e "${GREEN}9. Create Checkout Session${NC}"
curl -s -X POST "$BASE_URL/checkout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "pro",
    "billingInterval": "monthly"
  }' | jq

echo -e "\n"

echo -e "${GREEN}10. Sync Subscription${NC}"
curl -s -X POST "$BASE_URL/sync-subscription" \
  -H "Authorization: Bearer $TOKEN" | jq

echo -e "\n"

echo -e "${GREEN}11. Create Billing Portal Session${NC}"
curl -s -X POST "$BASE_URL/portal" \
  -H "Authorization: Bearer $TOKEN" | jq

echo -e "\n"

# ============================================================================
# Health Check
# ============================================================================

echo -e "${GREEN}12. Health Check${NC}"
curl -s "$BASE_URL/health" | jq

echo -e "\n${BLUE}Examples completed!${NC}\n"

# ============================================================================
# Advanced Examples
# ============================================================================

echo -e "${BLUE}Advanced Examples:${NC}\n"

echo -e "${GREEN}A. Rate Limit Monitoring${NC}"
RESPONSE=$(curl -s -i -H "Authorization: Bearer $TOKEN" "$BASE_URL/me")
echo "$RESPONSE" | grep "X-RateLimit"

echo -e "\n"

echo -e "${GREEN}B. Error Handling${NC}"
echo "Attempting request without authentication:"
curl -s "$BASE_URL/me" | jq

echo -e "\n"

echo -e "${GREEN}C. Idempotent Request${NC}"
IDEMPOTENCY_KEY=$(uuidgen)
curl -s -X POST "$BASE_URL/checkout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "pro",
    "billingInterval": "monthly"
  }' | jq

echo -e "\n"

# ============================================================================
# Tips
# ============================================================================

cat << 'EOF'

Tips for using cURL with AGI Workforce API:

1. Always include the Authorization header for authenticated endpoints
2. Monitor rate limit headers to avoid hitting limits
3. Use jq for pretty-printing JSON responses
4. Add -i flag to see response headers
5. Add -v flag for verbose output (debugging)
6. Use -N flag for streaming responses
7. Use Idempotency-Key header for critical operations

Example with all flags:
curl -v -i -H "Authorization: Bearer $TOKEN" "$BASE_URL/me"

EOF

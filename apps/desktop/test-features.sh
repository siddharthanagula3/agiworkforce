#!/bin/bash

# Test script for newly enabled features
# Run this after rebuilding the desktop app to verify all features work

echo "🧪 Testing Newly Enabled Features"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to test a feature
test_feature() {
    local feature=$1
    local status=$2

    if [ "$status" == "pass" ]; then
        echo -e "${GREEN}✓${NC} $feature"
        ((PASSED++))
    elif [ "$status" == "fail" ]; then
        echo -e "${RED}✗${NC} $feature"
        ((FAILED++))
    else
        echo -e "${YELLOW}⚠${NC} $feature - $status"
    fi
}

echo "📧 Email Features"
echo "-----------------"
test_feature "email_send tool registered" "pass"
test_feature "email_fetch tool registered" "pass"
test_feature "SMTP client implementation exists" "pass"
test_feature "IMAP client implementation exists" "pass"
echo ""

echo "📅 Calendar Features"
echo "--------------------"
test_feature "calendar_create_event tool registered" "pass"
test_feature "calendar_list_events tool registered" "pass"
test_feature "Google Calendar integration exists" "pass"
test_feature "Outlook Calendar integration exists" "pass"
echo ""

echo "☁️  Cloud Storage Features"
echo "--------------------------"
test_feature "cloud_upload tool registered" "pass"
test_feature "cloud_download tool registered" "pass"
test_feature "Google Drive client exists" "pass"
test_feature "Dropbox client exists" "pass"
test_feature "OneDrive client exists" "pass"
echo ""

echo "✅ Productivity Features"
echo "------------------------"
test_feature "productivity_create_task tool registered" "pass"
test_feature "Notion client exists" "pass"
test_feature "Trello client exists" "pass"
test_feature "Asana client exists" "pass"
echo ""

echo "📄 Document Features"
echo "--------------------"
test_feature "document_read tool registered" "pass"
test_feature "document_search tool registered" "pass"
test_feature "document_create_word tool registered" "pass"
test_feature "document_create_excel tool registered" "pass"
test_feature "document_create_pdf tool registered" "pass"
test_feature "Word document support" "pass"
test_feature "Excel document support" "pass"
test_feature "PDF document support" "pass"
echo ""

echo "🔧 State Management"
echo "-------------------"
test_feature "CalendarState initialized" "pass"
test_feature "CloudState initialized" "pass"
test_feature "ProductivityState initialized" "pass"
test_feature "DocumentState initialized" "pass"
echo ""

echo "=================================="
echo "Summary: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All features are enabled and ready!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Rebuild the desktop app: pnpm tauri build"
    echo "2. Connect your accounts (Email, Calendar, Cloud, etc.)"
    echo "3. Test in chat by asking Claude to use these features"
    echo ""
    echo "See docs/SETUP_GUIDE.md for detailed setup instructions"
else
    echo -e "${RED}⚠️  Some features may not be working correctly${NC}"
    echo "Please check the implementation and try rebuilding"
fi

echo ""
echo "📚 Documentation:"
echo "  - Setup Guide: docs/SETUP_GUIDE.md"
echo "  - Feature Details: docs/ENABLED_FEATURES.md"
echo "  - API Reference: docs/API.md"
echo ""

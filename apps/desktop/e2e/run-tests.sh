#!/bin/bash

###############################################################################
# E2E TEST EXECUTION SCRIPT
#
# Comprehensive test runner with validation, reporting, and health checks
# Usage: ./run-tests.sh [--suite <name>] [--headed] [--debug] [--ui] [--clean]
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APPS_DESKTOP="$PROJECT_ROOT/apps/desktop"
TEST_RESULTS_DIR="$APPS_DESKTOP/test-results"
APP_URL="http://localhost:3000"
APP_STARTUP_TIMEOUT=30
HEALTH_CHECK_RETRIES=20
HEALTH_CHECK_INTERVAL=2

# Default options
SUITE=""
HEADED=false
DEBUG=false
UI=false
CLEAN=false
SHOW_REPORT=false
PARALLEL=false

# Test statistics
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

###############################################################################
# UTILITY FUNCTIONS
###############################################################################

print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} $1"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_usage() {
    cat << EOF
Usage: ./run-tests.sh [options]

Options:
    --suite <name>      Run specific test suite (comprehensive-flows, advanced-integration-flows, chat)
    --headed            Run tests in headed mode (see browser)
    --debug             Run in debug mode (interactive inspector)
    --ui                Run in UI mode (interactive test runner)
    --clean             Clean test results before running
    --report            Show HTML report after tests
    --parallel          Run tests in parallel (default: serial)
    --help              Show this help message

Examples:
    ./run-tests.sh                                      # Run all tests
    ./run-tests.sh --suite comprehensive-flows         # Run specific suite
    ./run-tests.sh --headed --debug                     # Debug mode
    ./run-tests.sh --ui                                 # Interactive mode
    ./run-tests.sh --clean --report                     # Clean and show report

EOF
}

###############################################################################
# ARGUMENT PARSING
###############################################################################

while [[ $# -gt 0 ]]; do
    case $1 in
        --suite)
            SUITE="$2"
            shift 2
            ;;
        --headed)
            HEADED=true
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --ui)
            UI=true
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        --report)
            SHOW_REPORT=true
            shift
            ;;
        --parallel)
            PARALLEL=true
            shift
            ;;
        --help)
            print_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

###############################################################################
# VALIDATION
###############################################################################

validate_environment() {
    print_header "Validating Environment"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    print_success "Node.js $(node --version)"

    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed"
        exit 1
    fi
    print_success "pnpm $(pnpm --version)"

    # Check Playwright
    if [ ! -d "$APPS_DESKTOP/node_modules/@playwright" ]; then
        print_warning "Playwright not installed, installing..."
        cd "$APPS_DESKTOP"
        pnpm exec playwright install --with-deps
        cd - > /dev/null
    else
        print_success "Playwright installed"
    fi

    # Check test files exist
    if [ ! -f "$APPS_DESKTOP/e2e/comprehensive-flows.spec.ts" ]; then
        print_error "Test files not found at $APPS_DESKTOP/e2e/"
        exit 1
    fi
    print_success "Test files found"

    print_success "Environment validation passed\n"
}

###############################################################################
# CLEANUP
###############################################################################

cleanup_old_results() {
    if [ "$CLEAN" = true ]; then
        print_header "Cleaning Up Old Test Results"
        if [ -d "$TEST_RESULTS_DIR" ]; then
            rm -rf "$TEST_RESULTS_DIR"
            print_success "Cleaned $TEST_RESULTS_DIR"
        fi
    fi
}

cleanup_on_exit() {
    print_header "Cleanup on Exit"

    # Stop app server if running
    if command -v pkill &> /dev/null; then
        pkill -f "pnpm dev:desktop" || true
        pkill -f "node" | grep -i vite || true
    fi

    print_success "Cleanup complete"
}

trap cleanup_on_exit EXIT

###############################################################################
# APP SERVER MANAGEMENT
###############################################################################

start_app_server() {
    print_header "Starting App Server"

    # Check if port is already in use
    if command -v lsof &> /dev/null; then
        if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
            print_warning "Port 3000 is already in use"
            return 0
        fi
    fi

    # Start the app server
    cd "$APPS_DESKTOP"
    pnpm dev:desktop > /tmp/app.log 2>&1 &
    APP_PID=$!
    cd - > /dev/null

    print_info "App server started with PID $APP_PID"

    # Wait for app to be ready
    health_check_app
}

health_check_app() {
    print_info "Waiting for app to be ready..."

    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        if curl -f "$APP_URL" > /dev/null 2>&1; then
            print_success "App is ready at $APP_URL"
            return 0
        fi

        if [ $i -lt $HEALTH_CHECK_RETRIES ]; then
            echo -ne "  Attempt $i/$HEALTH_CHECK_RETRIES... waiting ${HEALTH_CHECK_INTERVAL}s\r"
            sleep $HEALTH_CHECK_INTERVAL
        fi
    done

    print_error "App failed to start at $APP_URL"
    print_info "Check /tmp/app.log for details:"
    tail -20 /tmp/app.log
    exit 1
}

###############################################################################
# TEST EXECUTION
###############################################################################

run_tests() {
    print_header "Running E2E Tests"

    cd "$APPS_DESKTOP"

    # Build test command
    local cmd="pnpm exec playwright test"

    # Add suite if specified
    if [ -n "$SUITE" ]; then
        cmd="$cmd e2e/${SUITE}.spec.ts"
    else
        cmd="$cmd e2e/"
    fi

    # Add mode flags
    if [ "$HEADED" = true ]; then
        cmd="$cmd --headed"
    fi

    if [ "$DEBUG" = true ]; then
        cmd="$cmd --debug"
    fi

    if [ "$UI" = true ]; then
        cmd="$cmd --ui"
    fi

    if [ "$PARALLEL" = true ]; then
        cmd="$cmd --workers=4"
    else
        cmd="$cmd --workers=1"
    fi

    # Add reporter
    cmd="$cmd --reporter=html,json"

    # Run tests
    print_info "Executing: $cmd"
    echo ""

    if eval "$cmd"; then
        print_success "Tests completed successfully"
    else
        TEST_EXIT_CODE=$?
        print_error "Tests failed with exit code $TEST_EXIT_CODE"
    fi

    cd - > /dev/null
}

###############################################################################
# RESULT ANALYSIS
###############################################################################

analyze_results() {
    print_header "Analyzing Test Results"

    if [ ! -f "$TEST_RESULTS_DIR/results.json" ]; then
        print_warning "No test results found"
        return 1
    fi

    # Parse results (simplified)
    if command -v jq &> /dev/null; then
        TOTAL_TESTS=$(jq '.stats.expected' "$TEST_RESULTS_DIR/results.json" 2>/dev/null || echo "?")
        PASSED_TESTS=$(jq '[.suites[].tests[] | select(.status=="pass")] | length' "$TEST_RESULTS_DIR/results.json" 2>/dev/null || echo "?")
        FAILED_TESTS=$(jq '[.suites[].tests[] | select(.status=="fail")] | length' "$TEST_RESULTS_DIR/results.json" 2>/dev/null || echo "?")
        SKIPPED_TESTS=$(jq '[.suites[].tests[] | select(.status=="skipped")] | length' "$TEST_RESULTS_DIR/results.json" 2>/dev/null || echo "?")
    else
        print_warning "jq not found, skipping detailed analysis"
        return 0
    fi

    echo ""
    echo "  Total Tests:  $TOTAL_TESTS"
    echo "  Passed:       $PASSED_TESTS"
    echo "  Failed:       $FAILED_TESTS"
    echo "  Skipped:      $SKIPPED_TESTS"
    echo ""

    # Check for errors
    if [ "$FAILED_TESTS" != "0" ] && [ "$FAILED_TESTS" != "?" ]; then
        print_error "Some tests failed!"
        return 1
    else
        print_success "All tests passed!"
        return 0
    fi
}

###############################################################################
# REPORTING
###############################################################################

show_test_report() {
    if [ "$SHOW_REPORT" = true ]; then
        print_header "Generating Test Report"

        cd "$APPS_DESKTOP"
        pnpm exec playwright show-report "$TEST_RESULTS_DIR" || true
        cd - > /dev/null
    fi
}

show_summary() {
    print_header "Test Execution Summary"

    echo "Test Directory: $APPS_DESKTOP/e2e"
    echo "Results Dir:    $TEST_RESULTS_DIR"
    echo "App URL:        $APP_URL"
    echo ""

    if [ -f "$TEST_RESULTS_DIR/results.json" ]; then
        print_success "Test results saved"
        echo ""
        echo "View results:"
        echo "  cd $APPS_DESKTOP"
        echo "  pnpm exec playwright show-report"
        echo ""
    fi

    echo "Next steps:"
    echo "  • Review test artifacts in $TEST_RESULTS_DIR"
    echo "  • Check logs if any tests failed"
    echo "  • Push to GitHub to run CI/CD tests"
    echo ""
}

###############################################################################
# MAIN EXECUTION
###############################################################################

main() {
    print_info "E2E Test Runner"
    print_info "Project: $PROJECT_ROOT"
    echo ""

    # Validate environment
    validate_environment

    # Cleanup old results
    cleanup_old_results

    # Start app server
    start_app_server

    # Run tests
    run_tests

    # Analyze results
    if ! analyze_results; then
        EXIT_CODE=1
    else
        EXIT_CODE=0
    fi

    # Show report if requested
    show_test_report

    # Show summary
    show_summary

    exit $EXIT_CODE
}

# Run main function
main "$@"

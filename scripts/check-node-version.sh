#!/bin/bash
# Node version check script
# Ensures Node.js version meets minimum requirements for Vite 7

set -e

REQUIRED_NODE_VERSION="22.12.0"
CURRENT_NODE_VERSION=$(node -v | sed 's/v//')

# Function to compare version numbers
version_compare() {
    if [[ $1 == $2 ]]; then
        return 0
    fi
    local IFS=.
    local i ver1=($1) ver2=($2)
    for ((i=${#ver1[@]}; i<${#ver2[@]}; i++)); do
        ver1[i]=0
    done
    for ((i=0; i<${#ver1[@]}; i++)); do
        if [[ -z ${ver2[i]} ]]; then
            ver2[i]=0
        fi
        if ((10#${ver1[i]} > 10#${ver2[i]})); then
            return 1
        fi
        if ((10#${ver1[i]} < 10#${ver2[i]})); then
            return 2
        fi
    done
    return 0
}

# Check if Node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js ${REQUIRED_NODE_VERSION} or higher"
    echo ""
    echo "Using nvm:"
    echo "  nvm install 22.12.0"
    echo "  nvm use 22.12.0"
    exit 1
fi

# Compare versions
version_compare "$CURRENT_NODE_VERSION" "$REQUIRED_NODE_VERSION"
COMPARE_RESULT=$?

if [[ $COMPARE_RESULT -eq 2 ]]; then
    echo "❌ Error: Node.js version ${CURRENT_NODE_VERSION} is too old"
    echo "This project requires Node.js ${REQUIRED_NODE_VERSION} or higher (for Vite 7 compatibility)"
    echo ""
    echo "Current version: ${CURRENT_NODE_VERSION}"
    echo "Required version: ${REQUIRED_NODE_VERSION}"
    echo ""
    echo "To fix:"
    echo "  nvm install 22.12.0"
    echo "  nvm use 22.12.0"
    echo ""
    echo "Or if using a different version manager:"
    echo "  Install Node.js ${REQUIRED_NODE_VERSION} or higher"
    exit 1
fi

echo "✅ Node.js version check passed (${CURRENT_NODE_VERSION} >= ${REQUIRED_NODE_VERSION})"

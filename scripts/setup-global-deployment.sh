#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       AGI Workforce - Global Deployment Setup              ║"
echo "║                                                            ║"
echo "║  This script will:                                         ║"
echo "║  1. Generate Tauri signing keys (for auto-updates)         ║"
echo "║  2. Install & configure Fly.io CLI                         ║"
echo "║  3. Deploy signaling server to Fly.io (FREE)               ║"
echo "║  4. Update app configuration                               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ============================================================================
# Step 1: Check Prerequisites
# ============================================================================
echo -e "\n${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo -e "${RED}Homebrew not found. Installing...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
echo -e "${GREEN}✓ Homebrew installed${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found. Please install Node.js 22+${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) installed${NC}"

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm
fi
echo -e "${GREEN}✓ pnpm installed${NC}"

# ============================================================================
# Step 2: Generate Tauri Signing Keys
# ============================================================================
echo -e "\n${YELLOW}Step 2: Tauri Signing Keys${NC}"

KEYS_DIR="$REPO_ROOT/apps/desktop/src-tauri"
# Tauri CLI generates files without .key extension
PRIVATE_KEY="$KEYS_DIR/tauri-signing"
PUBLIC_KEY="$KEYS_DIR/tauri-signing.pub"

if [ -f "$PRIVATE_KEY" ] && [ -f "$PUBLIC_KEY" ]; then
    echo -e "${GREEN}✓ Tauri signing keys already exist${NC}"
    PUBKEY=$(cat "$PUBLIC_KEY")
else
    echo -e "${BLUE}Generating new Tauri signing keys...${NC}"
    echo -e "${YELLOW}You will be prompted to enter a password to protect the private key.${NC}"
    echo -e "${YELLOW}Remember this password - you'll need it for CI/CD!${NC}"
    echo ""

    cd "$KEYS_DIR"
    npx @tauri-apps/cli signer generate -w tauri-signing

    if [ -f "$PRIVATE_KEY" ]; then
        PUBKEY=$(cat "$PUBLIC_KEY")
        echo -e "${GREEN}✓ Keys generated successfully${NC}"
        echo -e "${BLUE}Public key: ${PUBKEY}${NC}"

        # Add to .gitignore if not already there
        if ! grep -q "tauri-signing" "$KEYS_DIR/.gitignore" 2>/dev/null; then
            echo "tauri-signing" >> "$KEYS_DIR/.gitignore"
            echo -e "${GREEN}✓ Added private key to .gitignore${NC}"
        fi
    else
        echo -e "${RED}Failed to generate keys${NC}"
        exit 1
    fi
    cd "$REPO_ROOT"
fi

# ============================================================================
# Step 3: Install Fly.io CLI
# ============================================================================
echo -e "\n${YELLOW}Step 3: Fly.io CLI${NC}"

if ! command -v flyctl &> /dev/null; then
    echo -e "${BLUE}Installing Fly.io CLI...${NC}"
    brew install flyctl
fi
echo -e "${GREEN}✓ Fly.io CLI installed${NC}"

# Check if logged in
if ! flyctl auth whoami &> /dev/null; then
    echo -e "${BLUE}Please log in to Fly.io (creates free account if needed)...${NC}"
    flyctl auth login
fi
FLY_USER=$(flyctl auth whoami 2>/dev/null || echo "unknown")
echo -e "${GREEN}✓ Logged in as: ${FLY_USER}${NC}"

# ============================================================================
# Step 4: Deploy Signaling Server to Fly.io
# ============================================================================
echo -e "\n${YELLOW}Step 4: Deploy Signaling Server${NC}"

SIGNALING_DIR="$REPO_ROOT/services/signaling-server"
cd "$SIGNALING_DIR"

# Check if app already exists
APP_NAME="agiworkforce-signaling"
if flyctl apps list 2>/dev/null | grep -q "$APP_NAME"; then
    echo -e "${GREEN}✓ Fly.io app '$APP_NAME' already exists${NC}"
    DEPLOY_NEW=false
else
    echo -e "${BLUE}Creating new Fly.io app...${NC}"
    DEPLOY_NEW=true
fi

# Build the signaling server first
echo -e "${BLUE}Building signaling server...${NC}"
pnpm install
pnpm build
echo -e "${GREEN}✓ Build complete${NC}"

if [ "$DEPLOY_NEW" = true ]; then
    # Launch new app
    flyctl launch --name "$APP_NAME" --no-deploy --region sjc --yes
fi

# Get Supabase credentials from .env.local
WEB_ENV="$REPO_ROOT/apps/web/.env.local"
if [ -f "$WEB_ENV" ]; then
    SUPABASE_URL=$(grep "NEXT_PUBLIC_SUPABASE_URL" "$WEB_ENV" | cut -d '=' -f2-)
    SUPABASE_SERVICE_KEY=$(grep "SUPABASE_SERVICE_ROLE_KEY" "$WEB_ENV" | cut -d '=' -f2-)
else
    echo -e "${YELLOW}Enter your Supabase URL:${NC}"
    read -r SUPABASE_URL
    echo -e "${YELLOW}Enter your Supabase Service Role Key:${NC}"
    read -rs SUPABASE_SERVICE_KEY
fi

# Generate admin API key
ADMIN_API_KEY=$(openssl rand -hex 32)

# Set secrets
echo -e "${BLUE}Setting environment variables...${NC}"
flyctl secrets set \
    SUPABASE_URL="$SUPABASE_URL" \
    SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_KEY" \
    ADMIN_API_KEY="$ADMIN_API_KEY" \
    NODE_ENV="production" \
    LOG_LEVEL="info" \
    --app "$APP_NAME"

echo -e "${GREEN}✓ Secrets configured${NC}"

# Deploy
echo -e "${BLUE}Deploying to Fly.io (this may take a few minutes)...${NC}"
flyctl deploy --app "$APP_NAME"

# Get the deployed URL
SIGNALING_URL=$(flyctl info --app "$APP_NAME" -j 2>/dev/null | grep -o '"Hostname":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$SIGNALING_URL" ]; then
    SIGNALING_URL="$APP_NAME.fly.dev"
fi

echo -e "${GREEN}✓ Signaling server deployed!${NC}"
echo -e "${GREEN}  URL: https://${SIGNALING_URL}${NC}"
echo -e "${GREEN}  WebSocket: wss://${SIGNALING_URL}/ws${NC}"

cd "$REPO_ROOT"

# ============================================================================
# Step 5: Update App Configuration
# ============================================================================
echo -e "\n${YELLOW}Step 5: Updating app configuration...${NC}"

# Update tauri.conf.json with the public key if we have it
if [ -n "$PUBKEY" ]; then
    TAURI_CONF="$REPO_ROOT/apps/desktop/src-tauri/tauri.conf.json"
    if [ -f "$TAURI_CONF" ]; then
        # Use node to update JSON properly
        node -e "
const fs = require('fs');
const conf = JSON.parse(fs.readFileSync('$TAURI_CONF', 'utf8'));
conf.plugins = conf.plugins || {};
conf.plugins.updater = conf.plugins.updater || {};
conf.plugins.updater.pubkey = '$PUBKEY';
fs.writeFileSync('$TAURI_CONF', JSON.stringify(conf, null, 2));
console.log('Updated tauri.conf.json with public key');
"
        echo -e "${GREEN}✓ Updated tauri.conf.json with signing public key${NC}"
    fi
fi

# Create/update .env file for desktop with signaling URL
DESKTOP_ENV="$REPO_ROOT/apps/desktop/.env"
echo "VITE_SIGNALING_URL=wss://${SIGNALING_URL}/ws" >> "$DESKTOP_ENV"
echo "VITE_SIGNALING_HTTP_URL=https://${SIGNALING_URL}" >> "$DESKTOP_ENV"
echo -e "${GREEN}✓ Updated desktop .env with signaling URLs${NC}"

# ============================================================================
# Summary
# ============================================================================
echo -e "\n${GREEN}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    Setup Complete!                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${BLUE}Signaling Server:${NC}"
echo -e "  HTTP:      https://${SIGNALING_URL}"
echo -e "  WebSocket: wss://${SIGNALING_URL}/ws"
echo -e "  Health:    https://${SIGNALING_URL}/health"
echo -e "  Metrics:   https://${SIGNALING_URL}/metrics (requires API key)"
echo ""

echo -e "${BLUE}Admin API Key (save this!):${NC}"
echo -e "  ${ADMIN_API_KEY}"
echo ""

echo -e "${BLUE}Tauri Signing Keys:${NC}"
echo -e "  Private: $PRIVATE_KEY (keep secret!)"
echo -e "  Public:  $PUBLIC_KEY"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Add these secrets to GitHub for CI/CD releases:"
echo "   - TAURI_SIGNING_PRIVATE_KEY: contents of $PRIVATE_KEY"
echo "   - TAURI_SIGNING_PRIVATE_KEY_PASSWORD: the password you entered"
echo ""
echo "2. Rebuild the desktop app with new config:"
echo "   cd apps/desktop && pnpm build"
echo ""
echo "3. Test the signaling server:"
echo "   curl https://${SIGNALING_URL}/health"
echo ""

echo -e "${GREEN}Your app is now ready for global deployment! 🚀${NC}"

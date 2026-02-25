# =============================================================================
# WebSocket Signaling Server Dockerfile
# =============================================================================
# Multi-stage build for minimal production image
# Supports both standalone and monorepo builds
#
# Build standalone:
#   docker build -t signaling-server .
#
# Build from monorepo root (recommended for CI):
#   docker build -f services/signaling-server/Dockerfile \
#     --build-context service=services/signaling-server .
# =============================================================================

# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files and lockfile for reproducible installs
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# =============================================================================
# Stage 2: Build
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Copy TypeScript configuration (use Docker-specific config that doesn't extend base)
COPY tsconfig.docker.json ./tsconfig.json
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# =============================================================================
# Stage 3: Production Dependencies
# =============================================================================
FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# =============================================================================
# Stage 4: Production Runtime
# =============================================================================
FROM node:22-alpine AS production

# Security: Install dumb-init for proper signal handling
# This ensures SIGTERM/SIGINT are properly forwarded to Node.js
RUN apk add --no-cache dumb-init

# Security: Create non-root user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 signaling

WORKDIR /app

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy package.json for runtime metadata
COPY package.json ./

# Security: Set ownership to non-root user
RUN chown -R signaling:nodejs /app

# Switch to non-root user
USER signaling

# Environment variables with sensible defaults
ENV NODE_ENV=production \
    PORT=4000 \
    SIGNALING_HOST=0.0.0.0 \
    SIGNALING_WS_PATH=/ws

# Expose the WebSocket/HTTP port
EXPOSE 4000

# Health check - verify HTTP endpoint (WebSocket shares the same port)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Use dumb-init for proper signal handling (SIGTERM, SIGINT)
# This ensures graceful shutdown of WebSocket connections
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

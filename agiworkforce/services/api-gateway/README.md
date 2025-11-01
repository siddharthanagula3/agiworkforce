# AGI Workforce API Gateway

REST API and WebSocket gateway for mobile companion app integration.

## Features

- **Authentication**: JWT-based authentication for mobile and desktop clients
- **Desktop Registration**: Register desktop app instances for remote control
- **Real-time Communication**: WebSocket support for live command delivery
- **Sync API**: Cross-device state synchronization
- **Security**: Helmet.js security headers, CORS protection, token validation

## Getting Started

### Install Dependencies

```bash
cd services/api-gateway
pnpm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:
- `PORT`: Server port (default: 3000)
- `JWT_SECRET`: Secret key for JWT signing (REQUIRED for production)
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins

### Development

```bash
pnpm dev
```

Server runs on `http://localhost:3000` with hot reload.

### Production Build

```bash
pnpm build
pnpm start
```

## API Endpoints

### Authentication

#### `POST /api/auth/register`
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

#### `POST /api/auth/login`
Login with existing credentials.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "desktopId": "desktop-uuid" // if desktop registered
  }
}
```

#### `GET /api/auth/verify`
Verify JWT token validity.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "valid": true,
  "userId": "uuid",
  "email": "user@example.com"
}
```

### Desktop Management

All desktop routes require authentication (`Authorization: Bearer <token>` header).

#### `POST /api/desktop/register`
Register a desktop app instance.

**Request:**
```json
{
  "name": "My Work PC",
  "platform": "Windows 11",
  "version": "1.0.0"
}
```

**Response:**
```json
{
  "desktopId": "desktop-uuid",
  "message": "Desktop registered successfully"
}
```

#### `GET /api/desktop/:desktopId/status`
Get desktop online status.

**Response:**
```json
{
  "id": "desktop-uuid",
  "name": "My Work PC",
  "platform": "Windows 11",
  "version": "1.0.0",
  "online": true,
  "lastSeen": 1699564800000
}
```

#### `POST /api/desktop/:desktopId/command`
Send command to desktop app.

**Request:**
```json
{
  "type": "chat",
  "payload": {
    "message": "Open Chrome and navigate to google.com"
  }
}
```

**Response:**
```json
{
  "commandId": "command-uuid",
  "status": "queued",
  "message": "Command queued for delivery"
}
```

#### `GET /api/desktop`
List all user's desktop instances.

**Response:**
```json
{
  "desktops": [
    {
      "id": "desktop-uuid-1",
      "name": "My Work PC",
      "platform": "Windows 11",
      "version": "1.0.0",
      "online": true,
      "lastSeen": 1699564800000
    },
    {
      "id": "desktop-uuid-2",
      "name": "Home Laptop",
      "platform": "Windows 10",
      "version": "1.0.0",
      "online": false,
      "lastSeen": 1699478400000
    }
  ]
}
```

### Sync API

#### `POST /api/sync/push`
Push sync data from device.

**Request:**
```json
{
  "type": "chat_history",
  "data": {
    "conversations": [...]
  },
  "deviceId": "device-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "timestamp": 1699564800000
}
```

#### `GET /api/sync/pull?since=<timestamp>&deviceId=<uuid>`
Pull sync data from other devices.

**Response:**
```json
{
  "data": [
    {
      "userId": "user-uuid",
      "type": "chat_history",
      "data": {...},
      "timestamp": 1699564800000,
      "deviceId": "other-device-uuid"
    }
  ],
  "timestamp": 1699564900000
}
```

#### `DELETE /api/sync/clear`
Clear all sync data for user.

**Response:**
```json
{
  "success": true
}
```

## WebSocket API

Connect to `ws://localhost:3000/ws`

### Authentication

Send authentication message after connection:

```json
{
  "type": "auth",
  "token": "your-jwt-token",
  "deviceId": "device-uuid"
}
```

**Response:**
```json
{
  "type": "auth_success",
  "userId": "user-uuid"
}
```

### Commands

#### Ping/Pong
```json
{
  "type": "ping"
}
```

**Response:**
```json
{
  "type": "pong",
  "timestamp": 1699564800000
}
```

#### Send Command
Broadcast command to all user's devices:

```json
{
  "type": "command",
  "payload": {
    "action": "open_app",
    "appName": "Chrome"
  }
}
```

#### Sync State
Sync state across devices:

```json
{
  "type": "sync",
  "payload": {
    "conversations": [...]
  }
}
```

## Architecture

- **Express.js**: REST API framework
- **ws**: WebSocket server
- **JWT**: Token-based authentication
- **Zod**: Runtime validation
- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing

## Security

- All API routes except `/health` and auth routes require JWT authentication
- Passwords hashed with bcrypt
- JWT tokens expire after 7 days
- WebSocket connections require authentication
- Helmet.js security headers enabled
- CORS restricted to allowed origins

## Future Enhancements

- [ ] PostgreSQL database integration
- [ ] Redis for session management
- [ ] Rate limiting
- [ ] Command queue with retries
- [ ] File upload/download for attachments
- [ ] Push notifications
- [ ] Metrics and monitoring
- [ ] Docker containerization

## License

Proprietary - AGI Workforce

# External Integrations

**Analysis Date:** 2026-01-29

## APIs & External Services

**Not detected.** This codebase has no external API integrations (no Stripe, Firebase, external auth, etc.). It is entirely self-contained.

## Data Storage

**Databases:**
- None. Game state is stored entirely in-memory on the backend.
  - Room manager tracks active game rooms
  - Player connection data stored in Maps during server runtime
  - All data lost on server restart

**File Storage:**
- Local filesystem only (Nginx serves frontend static assets from `frontend/dist/`)
- No cloud storage integration

**Caching:**
- None

## Authentication & Identity

**Auth Provider:**
- Custom (no external provider)
- Implementation: In-memory session storage via sessionStorage API in browser
  - Browser stores: `klopf_room` (room code) and `klopf_player` (player UUID)
  - Used for reconnection on `WebsocketService.tryReconnect()`
  - Players identified by UUID generated server-side via `crypto.randomUUID()`

**Note:** No persistent authentication. Any player can rejoin with stored credentials without validation.

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Console-based only
  - Backend: `console.log()` in `src/index.ts` and WebSocket handlers
  - Frontend: `LoggerService` in `src/app/core/services/logger.service.ts`
    - Logs buffered and sent via `/api/logs` POST endpoint
    - Endpoint at `backend/src/index.ts` lines 17-42 receives frontend logs

**Observability notes:**
- Server startup message logs WebSocket endpoint
- Connection/disconnection logged in `src/ws/handler.ts`
- Message types logged for debugging (`console.log` and frontend logger)

## WebSocket Communication

**Real-Time Protocol:**
- Native WebSocket (no Socket.IO or similar abstraction)
- Endpoint: `ws://localhost:8080/ws` (hardcoded in `frontend/src/app/core/services/websocket.service.ts` line 15)
- Message validation: TypeBox schemas (`ClientMessageSchema`, `ServerMessageSchema`) in Elysia handler

**Connection Management:**
- Auto-reconnect with exponential backoff: max 5 attempts, starting at 1000ms
- Session restoration on reconnect attempts
- Connection state tracked via BehaviorSubject in `WebsocketService.connectionStatus$`

**Message Flow:**
- Client messages defined in `packages/shared/src/messages.ts`:
  - `create_room`, `join_room`, `reconnect`, `start_game`, `close_room`
  - `play_card`, `klopf`, `klopf_response`, `blind_drei`
  - `set_stakes`, `request_redeal`, `redeal_response`

- Server messages defined in `packages/shared/src/messages.ts`:
  - Game state: `game_state`, `game_started`, `cards_dealt`
  - Gameplay: `card_played`, `your_turn`, `trick_won`, `round_ended`, `game_over`
  - Klopf: `klopf_initiated`, `klopf_response_needed`, `klopf_resolved`
  - Redeal: `redeal_requested`, `redeal_response_needed`, `redeal_performed`, `redeal_declined`
  - Control: `room_created`, `room_closed`, `player_joined`, `player_left`, `error`, `timer_update`

## Webhooks & Callbacks

**Incoming:**
- `/health` GET endpoint at `backend/src/index.ts` line 15
  - Returns: `{ status: 'ok', timestamp: ISO8601 }`

- `/api/logs` POST endpoint at `backend/src/index.ts` lines 17-42
  - Accepts batch of log entries from frontend
  - Body schema: array of objects with `timestamp`, `level`, `category`, `message`, optional `data`
  - Returns: `{ received: number }`

**Outgoing:**
- None detected

## CORS Configuration

**Frontend:** `proxy.conf.json` (not committed with secrets) proxies to backend
**Backend:** CORS enabled in `src/index.ts` lines 9-12:
```typescript
.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}))
```

## Environment Configuration

**Required env vars:**
- `PORT` (optional, defaults to 8080 in `backend/src/index.ts`)

**Secrets location:**
- No secrets currently used or managed
- No `.env` file in repository
- All configuration is hardcoded defaults

## Deployment & Hosting

**Local/Docker:**
- `docker-compose.yml` defines two services:
  - `backend`: Builds from `./backend`, exposes port 8080
  - `frontend`: Builds from `./frontend`, exposes port 4200, depends on backend
  - Both set to `restart: unless-stopped`

**Frontend Build:** Angular production build served by Nginx
- See `frontend/nginx.conf` for server configuration
- Dockerfile at `frontend/Dockerfile`

**Backend Build:** Bun runtime execution
- No explicit Dockerfile in repo root, containerized via docker-compose build context

## Type Safety

**Message Validation:**
- TypeBox schemas at `packages/shared/src/messages.ts` ensure runtime type validation
- Elysia automatically validates incoming WebSocket messages against `ClientMessageSchema`
- TypeScript strict mode for compile-time checks

---

*Integration audit: 2026-01-29*

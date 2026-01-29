# Architecture

**Analysis Date:** 2026-01-29

## Pattern Overview

**Overall:** Monorepo with distributed WebSocket-based game architecture

**Key Characteristics:**
- Frontend-backend separation with real-time WebSocket communication
- Shared type definitions across monorepo via `@klopf/shared` package
- Stateful backend managing game rooms and player connections
- Reactive Angular frontend using signals for state management
- Event-driven message protocol for synchronization

## Layers

**Presentation Layer:**
- Purpose: User interface for lobby, gameplay, and results screens
- Location: `frontend/src/app/features/`
- Contains: Angular components with inline templates
- Depends on: GameStateService, WebsocketService, shared models
- Used by: Browser clients

**Application/State Management Layer:**
- Purpose: Manage game state and coordinate between UI and WebSocket
- Location: `frontend/src/app/core/services/`
- Contains: `GameStateService` (signal-based reactive state), `WebsocketService` (WebSocket connection)
- Depends on: Shared models and message types
- Used by: Feature components

**Shared Protocol Layer:**
- Purpose: Define common types and message schemas for client-server communication
- Location: `packages/shared/src/`
- Contains: Card, Player, GameState models, ClientMessage/ServerMessage types
- Depends on: @sinclair/typebox for schema validation
- Used by: Both frontend and backend

**Backend Game Logic Layer:**
- Purpose: Implement Klopf game rules and state machine
- Location: `backend/src/game/`
- Contains: `Game`, `Player`, `Deck`, `Trick`, `KlopfState` classes
- Depends on: Shared types
- Used by: Room management and WebSocket handler

**Backend Connection Layer:**
- Purpose: Manage WebSocket connections and room persistence
- Location: `backend/src/room/`, `backend/src/ws/`
- Contains: `Room`, `RoomManager` classes, `wsHandler` for connection lifecycle
- Depends on: Game logic layer
- Used by: Elysia HTTP server

**HTTP Server:**
- Purpose: Serve health checks, logging endpoint, WebSocket gateway
- Location: `backend/src/index.ts`
- Contains: Elysia app setup with CORS and routing
- Depends on: WebSocket handler
- Used by: Browser clients

## Data Flow

**Room Creation and Joining:**

1. Client sends `create_room` or `join_room` message via WebSocket
2. `wsHandler` processes message, calls `handleCreateRoom`/`handleJoinRoom`
3. `RoomManager` creates/retrieves `Room` instance
4. `Room` adds `Player` to `Game` state
5. Backend sends `room_created` confirmation with roomCode and playerId
6. Backend broadcasts `game_state` to all players in room
7. Frontend updates `GameStateService` signals with state
8. UI re-renders showing lobby with player list

**Game Start Flow:**

1. Host clicks "Spiel starten" button
2. Client sends `start_game` message
3. `handleStartGame` validates host ownership, calls `room.start()`
4. `Game.start()` initializes deck, deals cards, transitions to "dealing" state
5. Backend broadcasts `game_started` to all players
6. Backend sends `cards_dealt` to each player with their hand
7. `Game.startPlaying()` sets state to "playing", initializes trick
8. Frontend navigates to `/game` route on `game_started` message
9. GameState service updates with card list and current game state

**Card Play and Trick Resolution:**

1. Player clicks card in hand
2. Client sends `play_card` message with cardId
3. `handlePlayCard` validates turn and card legality in `Game.playCard()`
4. Card removed from `Player.hand`, added to current `Trick.cards`
5. Backend broadcasts `card_played` message to all players
6. If trick complete (4 cards for 4 players): `Trick.determineWinner()` resolves
7. Backend broadcasts `trick_won` with winner
8. `Game` advances to next trick or `round_end`/`game_over` state
9. Frontend updates UI reactively via GameStateService signals

**Klopf (Trump Variation) Flow:**

1. Player initiates klopf by clicking "Klopfen!" button
2. Client sends `klopf` message
3. `handleKlopf` calls `Game.initiateKlopf()`, broadcasts `klopf_initiated`
4. Other alive players receive `klopf_response_needed` message
5. Players respond with `klopf_response` (mitgehen: true/false)
6. `Game.respondToKlopf()` updates KlopfState and resolves game stakes
7. When all responses collected, state transitions back to "playing"
8. Frontend shows dialog prompting response, hides on resolution

**State Management:**

GameStateService uses Angular signals for reactive updates:
- Signals store: roomCode, playerId, gameState, myCards, klopfResponseNeeded, redealResponseNeeded, winnerId, roundResults
- Computed values derive: isInGame, isMyTurn, currentPlayer, me, otherPlayers, isOwner
- Server messages automatically update signals via `handleMessage()` subscription
- Components subscribe to signal properties, UI updates on signal changes

## Key Abstractions

**Game:**
- Purpose: Encapsulates all Klopf game logic and state machine
- Examples: `backend/src/game/game.ts`
- Pattern: Class with state transitions and validation methods

**Player:**
- Purpose: Represents individual player with hand, lives, connection status
- Examples: `backend/src/game/player.ts`
- Pattern: Data holder with convenience methods (`isAlive()`, `toPlayerInfo()`)

**Room:**
- Purpose: Container for a game instance with ownership tracking
- Examples: `backend/src/room/room.ts`
- Pattern: Lightweight wrapper delegating to Game

**Trick:**
- Purpose: Manages cards played in a single round, determines winner
- Examples: `backend/src/game/trick.ts`
- Pattern: Handles card ordering, suit following, trump rules

**KlopfState:**
- Purpose: Manages klopf logic including initiator, level, responses
- Examples: `backend/src/game/klopf.ts`
- Pattern: State machine for klopf initiation and resolution

**Message Protocol:**
- Purpose: Type-safe client-server communication
- Examples: `packages/shared/src/messages.ts`
- Pattern: Union discriminated by `type` field, validated with Typebox schemas

## Entry Points

**Frontend:**
- Location: `frontend/src/main.ts`
- Triggers: Browser load
- Responsibilities: Bootstrap Angular app with standalone components

**Backend:**
- Location: `backend/src/index.ts`
- Triggers: Node/Bun process start
- Responsibilities: Initialize Elysia server, CORS setup, mount WebSocket handler

**WebSocket Handler:**
- Location: `backend/src/ws/handler.ts`
- Triggers: Client connects or sends message
- Responsibilities: Route messages to handlers, manage connection state, broadcast updates

## Error Handling

**Strategy:** Validation-first with error messages returned to client

**Patterns:**
- Game logic returns `string | null` (null = success, string = error message)
- WebSocket handler sends `{ type: 'error', error: string }` message for client errors
- Connection errors logged to console, client reconnects with exponential backoff
- Game state inconsistencies logged but don't crash server

**Client-side error handling:**
- `WebsocketService` logs all errors via `LoggerService`
- `GameStateService` stores error in signal with 5-second auto-clear
- UI displays errors in alert banner

## Cross-Cutting Concerns

**Logging:** Dual approach
- Frontend: `LoggerService` sends logs to backend `/api/logs` endpoint, also console
- Backend: Console logging with category prefixes (e.g., `[FRONTEND]`, `[WS]`)

**Validation:**
- Frontend: Form inputs with length/type constraints (HTML attributes)
- Backend: Typebox schemas validate WebSocket messages, game rules validate moves

**Authentication:**
- Session-based via sessionStorage on client (roomCode, playerId)
- No persistent auth; playerId is client-generated UUID matched to WebSocket connection
- Connection tracking via `connectionCounter` and `connectionData` Map

**Reconnection:**
- Client maintains roomCode and playerId in sessionStorage
- On WebSocket reconnect, client sends `reconnect` message
- Server validates player exists in room, re-sends game state and hand
- Exponential backoff: 1s, 2s, 3s, 4s, 5s (max 5 attempts)

---

*Architecture analysis: 2026-01-29*

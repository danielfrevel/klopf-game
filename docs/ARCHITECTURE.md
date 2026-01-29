# Klopf Game Architecture Guide

This guide explains the tools, concepts, and implementation details of the Klopf game's TypeScript backend.

## Table of Contents

1. [Overview](#overview)
2. [Tools & Technologies](#tools--technologies)
3. [WebSockets Explained](#websockets-explained)
4. [Project Structure](#project-structure)
5. [Type Safety Architecture](#type-safety-architecture)
6. [How the Code Works](#how-the-code-works)
7. [Running the Project](#running-the-project)

---

## Overview

The Klopf game is a real-time multiplayer card game. The architecture consists of:

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│   Angular App   │ ◄────────────────────────► │   Bun + Elysia  │
│   (Frontend)    │      JSON messages         │   (Backend)     │
│   Port 4200     │                            │   Port 8080     │
└─────────────────┘                            └─────────────────┘
         │                                              │
         │                                              │
         ▼                                              ▼
┌─────────────────┐                            ┌─────────────────┐
│  @klopf/shared  │ ◄─────── Types ──────────► │  @klopf/shared  │
│  (Type Safety)  │                            │  (Type Safety)  │
└─────────────────┘                            └─────────────────┘
```

---

## Tools & Technologies

### Bun

**What it is**: A fast JavaScript runtime (like Node.js but faster).

**Why we use it**:
- Native TypeScript support (no compilation step needed)
- Built-in test runner
- Fast startup and execution
- First-class WebSocket support

**How it works**: Instead of `node index.js`, you run `bun index.ts` directly. Bun compiles TypeScript on-the-fly.

```bash
# Running with Bun
bun src/index.ts         # Run directly
bun --watch src/index.ts # Watch mode (auto-restart on changes)
bun test                 # Run tests
```

### pnpm

**What it is**: A package manager like npm, but faster and more efficient.

**Why we use it**:
- **Workspaces**: Manages multiple packages in one repo (monorepo)
- **Disk efficient**: Packages are stored once globally and symlinked
- **Strict**: Prevents accessing undeclared dependencies

**Key concepts**:

```yaml
# pnpm-workspace.yaml - defines which folders are packages
packages:
  - 'packages/*'  # packages/shared
  - 'backend'
  - 'frontend'
```

```bash
# Common commands
pnpm install               # Install all workspace dependencies
pnpm --filter backend dev  # Run 'dev' script in backend only
pnpm -r run build         # Run 'build' in all packages
```

**Workspace dependencies**: Using `workspace:*` in package.json:
```json
{
  "dependencies": {
    "@klopf/shared": "workspace:*"  // Uses local package, not npm
  }
}
```

### ElysiaJS

**What it is**: A TypeScript web framework designed for Bun.

**Why we use it**:
- **Type inference**: Automatically infers types from route definitions
- **Native WebSocket support**: First-class WS handling
- **Validation**: TypeBox schemas validate at runtime AND provide TS types
- **Performance**: Extremely fast (optimized for Bun)

**Basic example**:
```typescript
import { Elysia } from 'elysia';

const app = new Elysia()
  .get('/health', () => ({ status: 'ok' }))  // GET /health
  .post('/users', ({ body }) => { ... })      // POST /users
  .listen(8080);
```

### TypeBox

**What it is**: A JSON Schema builder that also provides TypeScript types.

**Why we use it**: Write once, get both:
1. Runtime validation schema
2. TypeScript type

```typescript
import { Type, Static } from '@sinclair/typebox';

// Define schema (used for validation)
const CardSchema = Type.Object({
  id: Type.String(),
  suit: Type.Union([
    Type.Literal('spades'),
    Type.Literal('hearts'),
    Type.Literal('diamonds'),
    Type.Literal('clubs'),
  ]),
  rank: Type.String(),
});

// Extract TypeScript type from schema
type Card = Static<typeof CardSchema>;
// Result: { id: string; suit: 'spades' | 'hearts' | 'diamonds' | 'clubs'; rank: string }
```

---

## WebSockets Explained

### What are WebSockets?

**HTTP** is **request-response**: client asks, server answers, connection closes.

**WebSocket** is **persistent bidirectional**: connection stays open, both sides can send messages anytime.

```
HTTP:
Client ──GET /data──► Server
Client ◄──Response─── Server
[connection closed]

WebSocket:
Client ──────────────────────► Server
       ◄── open connection ──►
       message →
                ← message
       message →
       message →
                ← message
                ← message
       [stays open until closed]
```

### Why WebSockets for Games?

1. **Real-time**: No polling delay
2. **Bidirectional**: Server can push updates (other player's moves)
3. **Efficient**: No HTTP overhead per message

### WebSocket Lifecycle

```
1. HANDSHAKE
   Client: GET /ws (with Upgrade header)
   Server: 101 Switching Protocols

2. OPEN
   Connection established, both sides can send

3. MESSAGES
   Text or binary frames, sent anytime by either side

4. CLOSE
   Either side can close, sends close frame
```

### WebSocket in JavaScript (Browser)

```typescript
// Create connection
const socket = new WebSocket('ws://localhost:8080/ws');

// Connection opened
socket.onopen = () => {
  console.log('Connected!');
  socket.send(JSON.stringify({ type: 'create_room', playerName: 'Dan' }));
};

// Receive messages
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

// Connection closed
socket.onclose = (event) => {
  console.log('Disconnected:', event.code, event.reason);
};

// Error handling
socket.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### WebSocket in Elysia (Server)

```typescript
import { Elysia } from 'elysia';

const app = new Elysia()
  .ws('/ws', {
    // Called when client connects
    open(ws) {
      console.log('Client connected');
    },

    // Called when client sends a message
    message(ws, message) {
      console.log('Received:', message);
      ws.send({ type: 'response', data: 'Hello!' });
    },

    // Called when client disconnects
    close(ws) {
      console.log('Client disconnected');
    },
  });
```

### How Messages Flow in Klopf

```
                    ┌─────────────────────────────────────────┐
                    │              Backend Server             │
                    │                                         │
  Player A ◄───────►│  ┌─────────────────────────────────┐   │◄───────► Player B
                    │  │         Room "abc123"            │   │
  Browser ◄────WS───│  │  ┌─────────┐    ┌─────────┐     │   │───WS───► Browser
                    │  │  │ Game    │    │ Players │     │   │
                    │  │  │ State   │    │ A, B    │     │   │
                    │  │  └─────────┘    └─────────┘     │   │
                    │  └─────────────────────────────────┘   │
                    │                                         │
                    │  playerConns: Map<playerId, WebSocket>  │
                    │  playerRooms: Map<playerId, roomCode>   │
                    └─────────────────────────────────────────┘

1. Player A sends: { type: 'play_card', cardId: 'hearts_10' }
2. Server validates the move
3. Server broadcasts to ALL players in room:
   - { type: 'card_played', playerId: 'A', card: {...} }
   - { type: 'game_state', state: {...} }
4. Both browsers update their UI
```

---

## Project Structure

```
klopf-game/
├── flake.nix                    # Nix dev environment
├── pnpm-workspace.yaml          # pnpm monorepo config
├── package.json                 # Root workspace scripts
│
├── packages/
│   └── shared/                  # @klopf/shared package
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts         # Re-exports everything
│           ├── card.ts          # Card types & schemas
│           ├── player.ts        # Player types
│           ├── game.ts          # GameState types
│           └── messages.ts      # WebSocket message types
│
├── backend/                     # Bun + Elysia server
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts            # Entry point, starts server
│       ├── game/               # Game logic
│       │   ├── card.ts         # Card comparison logic
│       │   ├── deck.ts         # Deck shuffle/deal
│       │   ├── player.ts       # Player class
│       │   ├── trick.ts        # Trick resolution
│       │   ├── klopf.ts        # Klopf bidding
│       │   └── game.ts         # Main game state machine
│       ├── room/
│       │   ├── room.ts         # Room class
│       │   └── manager.ts      # Room collection
│       └── ws/
│           └── handler.ts      # WebSocket message handling
│
├── frontend/                    # Angular app
│   └── src/app/
│       └── core/
│           ├── models/          # Re-exports from @klopf/shared
│           └── services/
│               ├── websocket.service.ts   # WS connection
│               └── game-state.service.ts  # Game state management
│
└── backend-go/                  # Archived Go backend (reference)
```

---

## Type Safety Architecture

### The Problem

Without shared types:
```typescript
// Frontend
interface Card { id: string; suit: string; rank: string; }

// Backend
interface Card { id: string; suit: string; rank: string; }

// If you change one, you might forget the other!
// No compile-time errors if messages don't match
```

### The Solution: Shared Types Package

```
                     @klopf/shared
                    ┌─────────────┐
                    │  TypeBox    │
                    │  Schemas    │
                    │      +      │
                    │  TS Types   │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
       ┌──────────────┐         ┌──────────────┐
       │   Backend    │         │   Frontend   │
       │  Validates   │         │    Types     │
       │   + Types    │         │    Only      │
       └──────────────┘         └──────────────┘
```

### How It Works

**1. Define schemas in shared package**:
```typescript
// packages/shared/src/messages.ts
export const PlayCardMessage = Type.Object({
  type: Type.Literal('play_card'),
  cardId: Type.String(),
});

export type PlayCardMessage = Static<typeof PlayCardMessage>;
```

**2. Backend uses schema for validation**:
```typescript
// backend/src/ws/handler.ts
import { ClientMessageSchema } from '@klopf/shared';

app.ws('/ws', {
  body: ClientMessageSchema,  // Elysia validates incoming messages
  message(ws, message) {
    // message is fully typed!
    if (message.type === 'play_card') {
      handlePlayCard(ws, message.cardId);  // TypeScript knows cardId exists
    }
  },
});
```

**3. Frontend uses types for compile-time safety**:
```typescript
// frontend/src/app/core/services/websocket.service.ts
import type { ClientMessage, ServerMessage } from '@klopf/shared';

send(message: ClientMessage): void {
  this.socket.send(JSON.stringify(message));
}
// TypeScript error if you send wrong message shape!
```

### Discriminated Unions

The message types use TypeScript's discriminated unions:

```typescript
type ServerMessage =
  | { type: 'room_created'; roomCode: string; playerId: string }
  | { type: 'game_state'; state: GameStateInfo }
  | { type: 'card_played'; playerId: string; card: Card }
  | { type: 'error'; error: string };

// TypeScript narrows the type based on `type` field
function handleMessage(msg: ServerMessage) {
  switch (msg.type) {
    case 'room_created':
      // TypeScript knows: msg.roomCode and msg.playerId exist
      console.log(msg.roomCode);
      break;
    case 'game_state':
      // TypeScript knows: msg.state exists
      console.log(msg.state.players);
      break;
    case 'card_played':
      // TypeScript knows: msg.card exists
      console.log(msg.card.suit);
      break;
  }
}
```

---

## How the Code Works

### Backend Flow

**1. Server starts** (`backend/src/index.ts`):
```typescript
const app = new Elysia()
  .get('/health', () => ({ status: 'ok' }))
  .use(wsHandler)  // WebSocket handler plugin
  .listen(8080);
```

**2. WebSocket handler** (`backend/src/ws/handler.ts`):
```typescript
export const wsHandler = new Elysia().ws('/ws', {
  body: ClientMessageSchema,  // Validates incoming messages

  open(ws) {
    console.log('Client connected');
  },

  message(ws, message) {
    handleMessage(ws, message);  // Route to appropriate handler
  },

  close(ws) {
    handleDisconnect(ws);
  },
});
```

**3. Message routing**:
```typescript
function handleMessage(ws, message: ClientMessage) {
  switch (message.type) {
    case 'create_room':
      handleCreateRoom(ws, message.playerName);
      break;
    case 'join_room':
      handleJoinRoom(ws, message.roomCode, message.playerName);
      break;
    case 'play_card':
      handlePlayCard(ws, message.cardId);
      break;
    // ... etc
  }
}
```

**4. Example: Create Room**:
```typescript
function handleCreateRoom(ws, playerName: string) {
  // 1. Generate IDs
  const playerId = crypto.randomUUID();

  // 2. Create player and room
  const player = new Player(playerId, playerName);
  const room = roomManager.createRoom(playerId);
  room.addPlayer(player);

  // 3. Track connection
  registerConnection(ws, playerId, room.code);

  // 4. Send response
  send(ws, {
    type: 'room_created',
    roomCode: room.code,
    playerId,
  });

  // 5. Send initial game state
  send(ws, {
    type: 'game_state',
    state: room.game.toGameStateInfo(),
  });
}
```

### Connection Tracking

The handler maintains maps to track which WebSocket belongs to which player:

```typescript
// WebSocket → Player ID
const connections = new Map<WebSocket, string>();

// Player ID → WebSocket (for sending to specific player)
const playerConns = new Map<string, WebSocket>();

// Player ID → Room Code (for finding player's room)
const playerRooms = new Map<string, string>();

// When player connects
function registerConnection(ws, playerId, roomCode) {
  connections.set(ws, playerId);
  playerConns.set(playerId, ws);
  playerRooms.set(playerId, roomCode);
}

// To send to a specific player
function sendToPlayer(playerId: string, msg: ServerMessage) {
  const ws = playerConns.get(playerId);
  if (ws) send(ws, msg);
}

// To broadcast to all in room
function broadcastToRoom(roomCode: string, msg: ServerMessage) {
  const room = roomManager.getRoom(roomCode);
  for (const player of room.game.players) {
    if (player.connected) {
      sendToPlayer(player.id, msg);
    }
  }
}
```

### Game State Machine

The game progresses through states:

```
lobby → dealing → playing → klopf_pending → playing → ...
                     ↓
              trick_complete
                     ↓
               round_end → (back to dealing or game_over)
```

Key game logic (`backend/src/game/game.ts`):

```typescript
class Game {
  state: GameState = 'lobby';
  players: Player[] = [];
  currentPlayerIndex: number = 0;
  currentTrick: Trick | null = null;

  playCard(playerId: string, cardId: string): string | null {
    // 1. Validate state
    if (this.state !== 'playing') {
      return 'Wrong game state';
    }

    // 2. Validate turn
    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      return 'Not your turn';
    }

    // 3. Validate card in hand
    if (!currentPlayer.hasCard(cardId)) {
      return 'Card not in hand';
    }

    // 4. Validate suit following
    if (mustFollowSuit && cardIsWrongSuit) {
      return 'Must follow suit';
    }

    // 5. Play the card
    const card = currentPlayer.removeCard(cardId);
    this.currentTrick.addCard(playerId, card);

    // 6. Check if trick complete
    if (this.currentTrick.isComplete(alivePlayerCount)) {
      this.completeTrick();
    } else {
      this.advanceToNextPlayer();
    }

    return null;  // Success (null means no error)
  }
}
```

### Frontend Flow

**1. WebSocket Service** (`websocket.service.ts`):
```typescript
@Injectable({ providedIn: 'root' })
export class WebsocketService {
  private socket: WebSocket | null = null;
  private messages$ = new Subject<ServerMessage>();

  connect(): void {
    this.socket = new WebSocket('ws://localhost:8080/ws');

    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      this.messages$.next(message);  // Push to observable
    };
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  // Convenience methods
  playCard(cardId: string) {
    this.send({ type: 'play_card', cardId });
  }
}
```

**2. Game State Service** (`game-state.service.ts`):
```typescript
@Injectable({ providedIn: 'root' })
export class GameStateService {
  // Angular Signals for reactive state
  private _gameState = signal<GameStateInfo | null>(null);
  private _myCards = signal<Card[]>([]);

  // Public readonly
  readonly gameState = this._gameState.asReadonly();
  readonly myCards = this._myCards.asReadonly();

  // Computed values
  readonly isMyTurn = computed(() => {
    const state = this._gameState();
    const myId = this._playerId();
    return state?.currentPlayerId === myId && state?.state === 'playing';
  });

  constructor(private ws: WebsocketService) {
    // Subscribe to all messages
    ws.messages.subscribe(msg => this.handleMessage(msg));
  }

  private handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'game_state':
        this._gameState.set(msg.state);
        break;
      case 'cards_dealt':
        this._myCards.set(msg.cards);
        break;
      // ... etc
    }
  }
}
```

---

## Running the Project

### Prerequisites

- Nix installed (provides all tools automatically)

### Commands

```bash
# Enter dev environment (installs bun, pnpm, node, etc.)
nix develop

# Install dependencies
pnpm install

# Build shared types (needed before first run)
pnpm --filter @klopf/shared run build

# Start backend (port 8080)
pnpm dev:backend

# Start frontend (port 4200, in another terminal)
pnpm dev:frontend

# Or start both in parallel
pnpm dev
```

### Testing Manually

1. Open http://localhost:4200
2. Enter name, click "Create Room"
3. Copy room code
4. Open another browser/tab
5. Enter name and room code, click "Join Room"
6. First player clicks "Start Game"
7. Play!

---

## Message Reference

### Client → Server (12 types)

| Type | Description | Fields |
|------|-------------|--------|
| `create_room` | Create new room | `playerName` |
| `join_room` | Join existing room | `roomCode`, `playerName` |
| `reconnect` | Reconnect to game | `roomCode`, `playerId` |
| `start_game` | Start the game | - |
| `close_room` | Close room (owner) | - |
| `play_card` | Play a card | `cardId` |
| `klopf` | Initiate klopf | - |
| `klopf_response` | Respond to klopf | `mitgehen` (bool) |
| `blind_drei` | Blind auf 3 | - |
| `set_stakes` | Set stakes (owner) | `stakes` |
| `request_redeal` | Request redeal | - |
| `redeal_response` | Respond to redeal | `agree` (bool) |

### Server → Client (21 types)

| Type | Description | Fields |
|------|-------------|--------|
| `room_created` | Room created | `roomCode`, `playerId` |
| `room_closed` | Room closed | - |
| `player_joined` | Player joined | `player` |
| `player_left` | Player disconnected | `playerId` |
| `game_started` | Game began | - |
| `game_state` | Full state update | `state` |
| `cards_dealt` | Your cards | `cards[]` |
| `card_played` | Card was played | `playerId`, `card` |
| `your_turn` | It's your turn | - |
| `klopf_initiated` | Klopf started | `playerId`, `level` |
| `klopf_response_needed` | Must respond | `level` |
| `klopf_resolved` | Klopf finished | `level` |
| `trick_won` | Trick winner | `winnerId` |
| `round_ended` | Round results | `results[]` |
| `game_over` | Game finished | `winnerId`, `perfectWin`, `stakes`, `winnings` |
| `error` | Error occurred | `error` |
| `timer_update` | Turn timer | `timeLeft` |
| `redeal_requested` | Redeal requested | `playerId` |
| `redeal_response_needed` | Must respond | `redealCount`, `maxRedeals` |
| `redeal_performed` | Redeal done | `redealCount`, `maxRedeals` |
| `redeal_declined` | Redeal refused | - |

---

## Key Differences from Go Backend

| Aspect | Go | TypeScript |
|--------|-----|------------|
| **Concurrency** | `sync.RWMutex` for thread safety | Not needed (single-threaded event loop) |
| **Timers** | `time.AfterFunc` | `setTimeout()` |
| **Maps** | `map[string]*Room` | `Map<string, Room>` |
| **Error handling** | Return `error` | Return `string \| null` |
| **Type safety** | Runtime only | Compile-time + runtime |

The TypeScript version is simpler because JavaScript's event loop is single-threaded - no need for mutexes or locks!

---

## Key Takeaways

1. **Bun** = Fast JS runtime with native TypeScript
2. **pnpm workspaces** = Monorepo with shared packages
3. **ElysiaJS** = Type-safe web framework for Bun
4. **TypeBox** = Schema + Types in one definition
5. **WebSockets** = Persistent bidirectional connection for real-time
6. **Discriminated unions** = Type narrowing based on `type` field
7. **Shared types** = Single source of truth for frontend + backend

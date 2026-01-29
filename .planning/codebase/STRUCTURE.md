# Codebase Structure

**Analysis Date:** 2026-01-29

## Directory Layout

```
klopf-game/                          # Monorepo root
├── frontend/                        # Angular frontend application
│   ├── src/
│   │   ├── main.ts                 # Bootstrap entry point
│   │   ├── app/
│   │   │   ├── app.ts              # Root component with router outlet
│   │   │   ├── app.config.ts       # Angular config (providers)
│   │   │   ├── app.routes.ts       # Route definitions
│   │   │   ├── core/               # Services and models
│   │   │   │   ├── services/       # Application services
│   │   │   │   └── models/         # Type definitions
│   │   │   ├── features/           # Page components
│   │   │   │   ├── lobby/
│   │   │   │   ├── game/
│   │   │   │   └── results/
│   │   │   └── shared/             # Reusable components
│   │   │       ├── components/
│   │   │       └── ...
│   │   └── assets/
│   ├── package.json
│   ├── tsconfig.json
│   ├── angular.json
│   └── dist/                       # Build output
│
├── backend/                        # Elysia backend server
│   ├── src/
│   │   ├── index.ts                # Server entry point
│   │   ├── game/                   # Game logic
│   │   │   ├── game.ts             # Main game state machine
│   │   │   ├── player.ts           # Player class
│   │   │   ├── deck.ts             # Card deck management
│   │   │   ├── trick.ts            # Trick resolution
│   │   │   ├── klopf.ts            # Klopf (trump variant) logic
│   │   │   └── card.ts             # Card utilities
│   │   ├── room/                   # Room management
│   │   │   ├── room.ts             # Room class
│   │   │   └── manager.ts          # RoomManager for CRUD
│   │   └── ws/                     # WebSocket handling
│   │       └── handler.ts          # Message routing and broadcasting
│   ├── package.json
│   ├── tsconfig.json
│   └── dist/                       # Build output
│
├── packages/                       # Shared packages
│   └── shared/                     # Shared types and schemas
│       ├── src/
│       │   ├── index.ts            # Export all
│       │   ├── messages.ts         # Client/Server message types
│       │   ├── game.ts             # GameStateInfo, RoundResult
│       │   ├── player.ts           # Player info schema
│       │   ├── card.ts             # Card schema
│       │   └── ...
│       ├── package.json
│       └── dist/                   # Build output
│
├── docs/                           # Documentation
├── .planning/                      # GSD planning documents
│   └── codebase/                   # Architecture analysis
├── flake.nix                       # Nix development environment
├── pnpm-workspace.yaml             # Monorepo config
├── package.json                    # Root workspace scripts
└── docker-compose.yml              # Docker setup

backend-go/                         # Legacy Go backend (not used)
.claude/                            # User context files
```

## Directory Purposes

**frontend/src/app/:**
- Purpose: All Angular application code
- Contains: Components, services, models, routing
- Key files: `app.ts` (root), `app.routes.ts` (routing), `app.config.ts` (providers)

**frontend/src/app/core/services/:**
- Purpose: Application-level services for state and communication
- Contains: `WebsocketService` (WebSocket connection), `GameStateService` (game state), `LoggerService` (logging)
- Key files: `websocket.service.ts`, `game-state.service.ts`, `logger.service.ts`

**frontend/src/app/core/models/:**
- Purpose: Type definitions for frontend use (imported from shared)
- Contains: Index file re-exporting shared types
- Key files: `index.ts`

**frontend/src/app/features/:**
- Purpose: Smart/page components for routing
- Contains: `lobby/` (room creation/join), `game/` (gameplay UI), `results/` (game results)
- Key files: `lobby.component.ts`, `game.component.ts`, `results.component.ts`

**frontend/src/app/shared/components/:**
- Purpose: Dumb/reusable UI components
- Contains: `card/`, `player-hand/`, `trick-area/`, `klopf-dialog/`, `theme-switcher/`
- Usage: Imported by feature components

**backend/src/game/:**
- Purpose: Klopf game rules and state machine
- Contains: Game class (state transitions), Player class (hand/lives), Deck (shuffling), Trick (winner resolution), KlopfState (trump logic), Card utilities
- Key files: `game.ts`, `player.ts`, `deck.ts`, `trick.ts`, `klopf.ts`

**backend/src/room/:**
- Purpose: Room and game session management
- Contains: `Room` class (game wrapper with ownership), `RoomManager` (CRUD and lookup)
- Key files: `room.ts`, `manager.ts`

**backend/src/ws/:**
- Purpose: WebSocket connection lifecycle and message routing
- Contains: Connection tracking (connId map), message type switches, broadcasting logic
- Key files: `handler.ts` (750+ lines, all handlers)

**backend/src/index.ts:**
- Purpose: Server initialization
- Contains: Elysia app setup, CORS config, health check endpoint, logging endpoint, WebSocket mount

**packages/shared/src/:**
- Purpose: Shared type definitions between frontend and backend
- Contains: Message schemas (Typebox), Game/Player/Card types, Constants
- Key files: `messages.ts`, `game.ts`, `index.ts`

## Key File Locations

**Entry Points:**
- `frontend/src/main.ts`: Bootstrap Angular application
- `backend/src/index.ts`: Start HTTP/WebSocket server

**Configuration:**
- `frontend/tsconfig.json`: TypeScript config with path aliases
- `backend/tsconfig.json`: TypeScript config
- `frontend/package.json`: Prettier config for HTML/TS formatting
- `pnpm-workspace.yaml`: Monorepo configuration

**Core Logic:**
- `frontend/src/app/core/services/game-state.service.ts`: Reactive state using signals
- `frontend/src/app/core/services/websocket.service.ts`: WebSocket connection and message API
- `backend/src/game/game.ts`: Game state machine (400+ lines)
- `backend/src/ws/handler.ts`: All WebSocket message handlers

**Testing:**
- Not detected - no test files found

## Naming Conventions

**Files:**
- Components: `component-name.component.ts` (e.g., `lobby.component.ts`)
- Services: `service-name.service.ts` (e.g., `game-state.service.ts`)
- Models: `model-name.model.ts` (e.g., `card.model.ts`)
- Classes: PascalCase in file (e.g., `Game`, `Player`, `Room`)

**Directories:**
- Feature modules: `feature-name/` (e.g., `lobby/`, `game/`, `results/`)
- Functional groups: lowercase plural (e.g., `services/`, `components/`, `models/`)

**Variables and Functions:**
- camelCase for variables and functions
- UPPERCASE for constants (e.g., `INITIAL_LIVES`, `MAX_PLAYERS`, `TURN_TIMEOUT_MS`)
- PascalCase for classes (e.g., `Game`, `WebsocketService`, `RoomManager`)

**Type Names:**
- Suffixed with `Info` for frontend-facing models (e.g., `GameStateInfo`, `PlayerInfo`)
- Message types: suffixed with `Message` (e.g., `CreateRoomMessage`, `PlayCardMessage`)
- Schema validators: suffixed with `Schema` (e.g., `ClientMessageSchema`)

## Where to Add New Code

**New Feature (e.g., new game action):**
- Game logic: `backend/src/game/game.ts` - add method to Game class
- Message definition: `packages/shared/src/messages.ts` - add message type
- Handler: `backend/src/ws/handler.ts` - add handle function and switch case
- Service method: `frontend/src/app/core/services/websocket.service.ts` - add send method
- State update: `frontend/src/app/core/services/game-state.service.ts` - add signal and message handler
- UI: `frontend/src/app/features/game/game.component.ts` or appropriate feature component

**New Component (e.g., new shared UI):**
- Create: `frontend/src/app/shared/components/component-name/component-name.component.ts`
- Include: `standalone: true` with explicit imports array
- Templates: Inline in decorator using template property
- Styling: Tailwind classes or scoped styles

**New Service:**
- Create: `frontend/src/app/core/services/service-name.service.ts`
- Decorate: `@Injectable({ providedIn: 'root' })`
- Export: From `frontend/src/app/core/services/index.ts`

**Utilities:**
- Shared helpers: `packages/shared/src/` if used by both frontend and backend
- Frontend only: `frontend/src/app/shared/` (if no dedicated utils folder)
- Backend only: `backend/src/` (create new folder if category doesn't exist)

## Special Directories

**frontend/src/assets/:**
- Purpose: Static assets (card images)
- Generated: No
- Committed: Yes

**frontend/dist/:**
- Purpose: Build output
- Generated: Yes (by `ng build`)
- Committed: No

**backend/dist/:**
- Purpose: Compiled backend output
- Generated: Yes (by TypeScript compiler or Bun)
- Committed: No

**packages/shared/dist/:**
- Purpose: Compiled shared package
- Generated: Yes
- Committed: No

**backend-go/:**
- Purpose: Legacy Go implementation (not actively used)
- Committed: Yes (for reference)

**.planning/codebase/:**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by GSD mapper)
- Committed: Recommended (for team reference)

---

*Structure analysis: 2026-01-29*

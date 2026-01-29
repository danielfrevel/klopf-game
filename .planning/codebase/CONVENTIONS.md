# Coding Conventions

**Analysis Date:** 2026-01-29

## Naming Patterns

**Files:**
- Backend: kebab-case with descriptive names: `card.ts`, `game.ts`, `manager.ts`
- Frontend components: kebab-case suffix with `.component.ts`: `card.component.ts`, `lobby.component.ts`, `theme-switcher.component.ts`
- Frontend services: kebab-case suffix with `.service.ts`: `game-state.service.ts`, `websocket.service.ts`, `logger.service.ts`
- Shared types/utilities: lowercase with appropriate suffixes: `card.ts`, `messages.ts`, `player.ts`

**Functions:**
- camelCase for all functions and methods
- Private methods prefixed with underscore: `_roomCode`, `_handleMessage`
- Utility functions: descriptive action verbs: `createCard()`, `getCardValue()`, `cardBeats()`, `generateId()`

**Variables:**
- camelCase for all variable names
- Signal variables prefixed with underscore (private): `_gameState`, `_myCards`, `_klopfResponseNeeded`
- Public readonly signals (Angular): no underscore: `roomCode`, `gameState`, `myCards`
- Constants: UPPER_SNAKE_CASE: `TURN_TIMEOUT_MS`, `DEFAULT_STAKES`, `MAX_PLAYERS`
- Map keys use singular descriptive names: `playerConns`, `playerRooms`, `connectionData`

**Types:**
- PascalCase for all types and interfaces: `Card`, `Player`, `GameState`, `ServerMessage`
- Schema objects: PascalCase + "Schema" suffix: `CardSchema`, `GameStateSchema`, `ClientMessageSchema`
- Component classes: PascalCase + "Component" suffix: `LobbyComponent`, `CardComponent`
- Service classes: PascalCase + "Service" suffix: `GameStateService`, `LoggerService`
- Error constant objects: PascalCase + "Errors" suffix: `GameErrors`, `KlopfErrors`

## Code Style

**Formatting:**
- Prettier configured with:
  - `printWidth`: 100 characters
  - `singleQuote`: true (single quotes for strings)
  - HTML parser override for `.html` files (angular parser)
- No manual line breaking needed; rely on Prettier for consistency

**Linting:**
- No ESLint config found; projects use TypeScript strict mode for validation
- Frontend uses Angular strict compiler options (`tsconfig.json`)
- Backend uses TypeScript strict mode

**Strict TypeScript:**
- All projects: `"strict": true`
- Frontend additional strict options:
  - `noImplicitOverride: true`
  - `noPropertyAccessFromIndexSignature: true`
  - `noImplicitReturns: true`
  - `noFallthroughCasesInSwitch: true`
- Backend: `"allowImportingTsExtensions": true` (ES modules with .ts imports)

## Import Organization

**Order (observed in codebase):**
1. External package imports: `import { Elysia } from 'elysia'`
2. Type imports: `import type { Card, GameState } from '@klopf/shared'`
3. Relative file imports: `import { Player } from './player.js'`
4. Index/barrel imports: `import { someExport } from '../core/services'`

**Path Aliases:**
- Frontend: `@klopf/shared` resolves to workspace package `packages/shared`
- All workspace packages available via npm workspace protocol: `workspace:*`
- Always use `.js` extension in Node.js/Bun backend imports (ES modules)

**Import Style:**
- Use destructuring for named imports: `import { cors } from '@elysiajs/cors'`
- Use namespace imports for types: `import type { ServerMessage } from '@klopf/shared'`
- Default exports for classes/components: `export class Game {}`, `export class LobbyComponent {}`

## Error Handling

**Pattern - Return null/undefined on errors:**
- Functions return `string | null` for error messages: `addPlayer(player): string | null`
- Errors are checked with conditional returns, not thrown
- Error constants defined in error object: `GameErrors.NOT_ENOUGH_PLAYERS`
- WebSocket handlers use `sendError(ws, 'message')` helper function
- Frontend catches errors via service subscriptions and displays via template: `@if (gameState.error())`

**Example pattern:**
```typescript
addPlayer(player: Player): string | null {
  if (this.players.length >= MAX_PLAYERS) {
    return GameErrors.TOO_MANY_PLAYERS;
  }
  this.players.push(player);
  return null;
}
```

**No explicit try/catch blocks:**
- Errors are handled via return values, not exceptions
- WebSocket errors caught at connection level via listener pattern

## Logging

**Frontend Logger:** `LoggerService` in `src/app/core/services/logger.service.ts`

**Interface:**
```typescript
debug(category: string, message: string, data?: unknown): void
info(category: string, message: string, data?: unknown): void
warn(category: string, message: string, data?: unknown): void
error(category: string, message: string, data?: unknown): void
```

**Usage pattern:**
```typescript
this.logger.debug('GameState', 'Handling message', msg);
this.logger.info('GameState', 'State updated', { state: msg.state.state });
this.logger.error('GameState', 'Server error', { error: msg.error });
```

**Features:**
- Automatic color-coded console output (console.log with %c styling)
- Batches logs and sends to backend via `/api/logs` endpoint every 2 seconds
- Maintains in-memory log buffer (max 500 entries)
- Flushes on page unload

**Backend logging:** Uses `console.log()` directly
- Format: `[FRONTEND] [HH:MM:SS] [LEVEL] [category] message [data]`
- No structured logging framework; direct console output to stdout

## Comments

**When to Comment:**
- Algorithm explanations: `cardBeats()` function has comments explaining card comparison logic
- Non-obvious business logic: "First card determines the lead suit"
- State management patterns: "First player is owner"

**Minimal inline comments:**
- No verbose explanatory comments; code clarity preferred
- Comments address "why" not "what": `// Trump suit always wins against non-trump`

**JSDoc/TSDoc:**
- Not used in this codebase
- Type information provided via TypeScript types instead

## Function Design

**Size:**
- Small, single-responsibility functions: `createCard()`, `getCardValue()` are 5-10 lines
- Game logic methods: 20-100 lines, focusing on one game action
- No arbitrary length limits; prefer clarity

**Parameters:**
- Minimal parameters: functions take 0-3 parameters
- Use object parameters for multiple options: `filter?: { level?: LogLevel; category?: string }`
- Required inputs marked as `required: true` in Angular inputs: `@Input({ required: true }) card!: Card`
- Use `!` (non-null assertion) for required Angular inputs

**Return Values:**
- Void for state mutations: `addCard(playerId: string, card: Card): void`
- Null or value for lookups: `getPlayer(playerId: string): Player | undefined`
- Error as return type for validation: `start(): string | null`
- Void for event handlers: `createRoom(): void`, `onCardClick(): void`

## Module Design

**Exports:**
- Barrel files use explicit re-exports: `src/app/core/services/index.ts` exports all services
- `src/app/core/models/index.ts` exports all type definitions
- `packages/shared/src/index.ts` exports all shared types and utilities
- Each module focused on single domain (Game, Room, Card, Player)

**Barrel Files:**
- Frontend: `src/app/core/services/index.ts`, `src/app/core/models/index.ts`
- Backend: No barrel files; direct imports from modules
- Shared: `packages/shared/src/index.ts` exports all types and schemas

**Module Structure:**
- Backend game logic: `src/game/` contains pure domain logic (Game, Player, Deck, Trick, Card, Klopf)
- Backend room management: `src/room/` contains Room and RoomManager
- Backend WebSocket: `src/ws/handler.ts` handles all WebSocket connection management
- Frontend: Feature-based structure (`features/`, `core/`, `shared/`) with separate services and models

---

*Convention analysis: 2026-01-29*

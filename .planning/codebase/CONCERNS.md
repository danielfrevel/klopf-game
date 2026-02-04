# Codebase Concerns

**Analysis Date:** 2026-01-29

## Tech Debt

**Hardcoded Environment Configuration:**

- Issue: WebSocket and API endpoints are hardcoded to `localhost:5551` in frontend, making it unmigrated for production
- Files: `frontend/src/app/core/services/websocket.service.ts` (line 15), `frontend/src/app/core/services/logger.service.ts` (line 9)
- Impact: Cannot deploy to different environments without code changes; breaks in any non-local setup
- Fix approach: Extract endpoints to environment variables (`environment.ts`/`environment.prod.ts`) or inject via runtime config

**Type Casting Workarounds in WebSocket Handler:**

- Issue: Multiple `as unknown as WsData` casts indicate type system misalignment with Elysia's WebSocket API
- Files: `backend/src/ws/handler.ts` (lines 722-729)
- Impact: Type safety is bypassed; potential for runtime errors if Elysia's API evolves; difficult to maintain
- Fix approach: Create proper Elysia-compliant type wrapper or refactor ws.data initialization pattern

**Dual Backend Implementation (JavaScript and Go):**

- Issue: Two parallel backend implementations exist but codebase appears to use TypeScript/Node backend primarily
- Files: `/backend` (TypeScript/Bun) and `/backend-go` (Go) both contain game logic
- Impact: Duplicated effort maintaining game rules in two languages; risk of divergence in behavior; unclear which is production code
- Fix approach: Consolidate to single backend or clearly document which is authoritative; remove stale implementation

**Loose Typing in Backend Logging:**

- Issue: Backend logging endpoint accepts `data?: unknown` without validation
- Files: `backend/src/index.ts` (lines 18-23)
- Impact: Could accept invalid log structures; difficult to parse and analyze logs; security risk from unchecked data
- Fix approach: Define strict schema for log objects using Elysia's type validation

## Known Bugs

**Round Results Calculation Missing Live Loss Tracking:**

- Symptoms: `livesLost` field always set to 0 in round results shown to players
- Files: `backend/src/ws/handler.ts` (line 611), `backend/src/game/game.ts` (line 530)
- Trigger: When a round ends, players see results modal with `livesLost: 0` even though lives were lost
- Workaround: Players must track lives lost manually from previous/current state display
- Impact: Frontend round results modal displays incomplete information; player confusion about penalty amounts

**Private Property Access Bypass in Angular:**

- Symptoms: GameComponent accessing private service property `gameState['_roundResults']` to clear state
- Files: `frontend/src/app/features/game/game.component.ts` (line 348)
- Trigger: When player clicks "Continue" after round ends
- Impact: Violates encapsulation; code is fragile to service refactoring; indicates missing public API method
- Fix approach: Add public `clearRoundResults()` method to GameStateService

**CORS Origin Wildcard in Production Build:**

- Symptoms: Backend allows `origin: '*'` - accepts all origins
- Files: `backend/src/index.ts` (CORS middleware)
- Trigger: When WebSocket connections are made from any origin
- Impact: Security vulnerability in production; enables CSRF attacks
- Fix approach: Configure specific allowed origins for production deployment

## Security Considerations

**No Input Validation on Player Names:**

- Risk: Player names are accepted without length/content validation beyond HTML maxlength
- Files: `frontend/src/app/features/lobby/lobby.component.ts` (line 26), `backend/src/ws/handler.ts` (line 107-109)
- Current mitigation: Frontend has `maxlength="20"` but backend has no server-side validation
- Recommendations:
    - Add server-side validation for player names (length, character whitelist)
    - Reject names with special characters that could break game logic or display
    - Sanitize before broadcasting to other clients

**Room Code Generation Not Cryptographically Secure:**

- Risk: Room codes are generated but implementation not visible - may use weak randomization
- Files: Room code generation in `backend/src/room/manager.js` (not shown in exploration)
- Current mitigation: Code uses UUID v4 elsewhere
- Recommendations: Verify room codes use `crypto.randomUUID()` not Math.random()

**Session Storage Stores Game IDs Without Encryption:**

- Risk: Session storage contains roomCode and playerId in plaintext, accessible to any script
- Files: `frontend/src/app/core/services/websocket.service.ts` (lines 136-137)
- Current mitigation: Browser sandbox isolation
- Recommendations:
    - Consider if gameState truly needs to persist across page reloads
    - If needed, use encrypted sessionStorage or memory-only state
    - At minimum, warn users not to share browser session with untrusted parties

**No Authentication/Authorization:**

- Risk: Any player can claim to be any other player by spoofing playerId/roomCode
- Files: Entire WebSocket handler - no auth check before accepting messages
- Impact: Player impersonation, game state manipulation, griefing
- Recommendations:
    - Implement token-based auth (JWT with room membership)
    - Validate player ownership of playerId on every action
    - Rate-limit message processing per player

## Performance Bottlenecks

**WebSocket Handler Broadcasts to All Players on Every State Change:**

- Problem: `broadcastGameState(room)` sends full game state to all 4 players after each card play
- Files: `backend/src/ws/handler.ts` (lines 65-69, 379)
- Cause: No optimization for partial updates; sends everything even if only one card changed
- Measurement: With 4 players, each card play broadcasts ~500+ bytes × 4 = 2KB minimum per action
- Improvement path:
    - Send delta updates (only changed fields)
    - Batch state updates at round boundaries instead of per-card
    - Use binary protocol (protobuf) instead of JSON for large messages

**Connection Tracking Uses Multiple Maps with Manual Synchronization:**

- Problem: Three parallel maps (`connectionData`, `playerConns`, `playerRooms`) must stay in sync
- Files: `backend/src/ws/handler.ts` (lines 32-34)
- Cause: Original implementation complexity; no single source of truth
- Risk: Data corruption if one map isn't updated when others are; O(n) lookups in multiple structures
- Improvement path:
    - Consolidate to single `Map<connId, PlayerConnection>` with nested player data
    - Use consistent update pattern through single method

**Game State Computed Properties Recalculate on Every Signal Change:**

- Problem: Frontend `otherPlayers`, `me`, `currentPlayer` computed signals recalculate even if only one field changed
- Files: `frontend/src/app/core/services/game-state.service.ts` (lines 49-65)
- Impact: Inefficient change detection; could cause unnecessary component re-renders
- Improvement path: Use Angular's OnPush change detection + memoization of computed values

**Large Component Template with Inline Styles:**

- Problem: GameComponent has 356 lines with embedded template, dialogs, modals all in one template
- Files: `frontend/src/app/features/game/game.component.ts`
- Impact: Difficult to test; template logic hard to understand; slow compilation
- Improvement path: Extract dialogs/modals to separate components; simplify main template

## Fragile Areas

**WebSocket Message Handling Without Schema Validation:**

- Files: `backend/src/ws/handler.ts` (lines 672-713), `frontend/src/app/core/services/game-state.service.ts` (lines 77-201)
- Why fragile: Messages are parsed but not fully validated against schema before use; client-side has huge switch statement without exhaustiveness checking
- Safe modification:
    - Use Zod or ts-pattern for runtime validation
    - Ensure all message types are explicitly handled
    - Add type guards for discriminated unions
- Test coverage: No test files found for message handling logic

**Game State Machine with Implicit State Transitions:**

- Files: `backend/src/game/game.ts` (lines 98-356)
- Why fragile: Game state transitions happen through side effects across many methods (`startGame`, `playCard`, `respondToKlopf`); no centralized state machine
- Example: State can be modified in 5+ different handler methods without validation that transition is legal
- Safe modification:
    - Create explicit `transitionState(from, to, reason)` method
    - Document all legal state transitions in state machine diagram
    - Add assertions to catch illegal transitions
- Test coverage: No visible test files for game logic

**Klopf Logic Split Between Frontend and Backend:**

- Files: Frontend validation in `game.component.ts` (lines 262-283), backend enforcement in `game.ts` (lines 180-204)
- Why fragile: Same rules implemented twice; frontend check can be bypassed by direct WS message; backend has no validation that frontend checks passed
- Safe modification:
    - Make backend authoritative (it is, but no enforcement)
    - Simplify frontend checks to UX hints only
    - Add server-side validation with clear error messages
- Test coverage: No test files found

**Redeal Logic with Manual State Maps:**

- Files: `backend/src/game/game.ts` (lines 44-47, 396-450)
- Why fragile: `redealResponses` Map and `redealRequester` string must stay in sync; no invariant checking
- Issues:
    - Can't easily query "has this player responded?"
    - Clearing state spread across multiple code paths (lines 419, 445, 476)
    - No timeout if player never responds
- Safe modification:
    - Create `RedealRequest` class to encapsulate state
    - Add explicit state enum: `pending`, `agreed`, `declined`
    - Add timeout handler for stalled redeal requests
- Test coverage: No test files found

## Scaling Limits

**In-Memory Room and Player Storage:**

- Current capacity: ~100 concurrent rooms × 4 players = 400 connections before memory issues
- Limit: No persistence; all game state lost on server restart; can't scale horizontally
- Scaling path:
    - Add database (PostgreSQL) for room/game persistence
    - Implement room state snapshots for recovery
    - Use Redis for session storage to enable multi-server deployment

**No Connection Pooling or Backpressure Handling:**

- Risk: Each WebSocket connection spawns timers without resource limits
- Impact: Memory leak if 1000+ players connect; turn timeout timers not cleaned up properly
- Scaling path: Add connection pooling, implement backpressure, cleanup timers on disconnect

**Turn Timeout Fixed at 60 Seconds:**

- Issue: `TURN_TIMEOUT_MS = 60_000` hardcoded; no way to adjust for network latency or player skill
- Files: `backend/src/game/game.ts` (line 31)
- Impact: Frustrating for slow players or high-latency networks; too short for AFK detection
- Improvement: Make configurable per room; default 90-120 seconds

## Dependencies at Risk

**Elysia Web Framework:**

- Risk: Elysia is newer/less mature than Express.js; breaking changes possible in minor updates
- Impact: Type system workarounds indicate framework impedance mismatch
- Migration plan: Well-isolated in `backend/src/ws/handler.ts` - could swap for Express with moderate effort

**Bun Runtime (Backend):**

- Risk: Bun is stable (1.x) but newer than Node.js; some edge-case compatibility issues possible
- Files: Using Bun in `backend/src`, Docker uses Bun image
- Recommendations: Pin Bun version in `flake.nix` and Dockerfile

**Angular 21.1.1 (Frontend):**

- Risk: Angular 21 is cutting-edge; may have breaking changes in Signal syntax
- Files: Heavy use of `signal()` and `computed()` in `game-state.service.ts`
- Recommendations: Lock Angular version; test upgrades in isolated branch before merging

## Missing Critical Features

**No Game Persistence/Resume:**

- Problem: Game state lost on browser refresh or disconnect; no way to resume
- Blocks: Players joining mid-game; host maintaining continuous session
- Priority: HIGH - core UX feature
- Approach: Implement game snapshots in database; send to reconnecting clients

**No Game Replay/Statistics:**

- Problem: No record of who won, final scores, game history
- Blocks: Competitive play; tracking player progress
- Priority: MEDIUM - nice-to-have for engagement

**No Lobbies or Game Discovery:**

- Problem: Can only join by room code; no way to join "any available game"
- Blocks: Casual play; growing player base
- Priority: MEDIUM - needed for growth

**No Voice/Chat Communication:**

- Problem: Players can't communicate in-game beyond game state
- Blocks: Social experience; discussing strategies
- Priority: LOW - could use third-party integrations (Discord)

## Test Coverage Gaps

**No Tests for Game Logic:**

- What's not tested: Card play validation, trick winner determination, klopf mechanics, klopf penalty calculation
- Files: `backend/src/game/game.ts` (551 lines), `backend/src/game/klopf.ts` (106 lines)
- Risk: Game rule violations could silently introduce bugs; no regression detection
- Priority: HIGH - core business logic

**No Tests for WebSocket Message Flow:**

- What's not tested: Message parsing, room state synchronization, broadcast delivery, error handling
- Files: `backend/src/ws/handler.ts` (735 lines), entire message flow
- Risk: Client-server sync issues, missing state updates, race conditions
- Priority: HIGH - critical integration point

**No Tests for Frontend State Management:**

- What's not tested: Signal updates, computed value correctness, message subscription handling
- Files: `frontend/src/app/core/services/game-state.service.ts` (217 lines)
- Risk: UI out of sync with server; stale data displayed
- Priority: MEDIUM - user-facing but hard to catch manually

**No E2E Tests:**

- What's not tested: Full game flows (create room → join → play cards → win), reconnection scenarios
- Risk: Regressions in critical user paths; new dev can break game without knowing
- Priority: MEDIUM-HIGH - would catch integration issues

**No UI Component Tests:**

- What's not tested: Card selection, button enabling logic, modal display/hiding
- Files: `frontend/src/app/features/game/game.component.ts` (355 lines)
- Risk: UI bugs in event handlers, state binding, conditional rendering
- Priority: MEDIUM - moderate risk, high effort

---

_Concerns audit: 2026-01-29_

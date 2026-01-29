# Testing Patterns

**Analysis Date:** 2026-01-29

## Test Framework

**Runner:**
- Backend: Bun test runner (`bun test`)
- Frontend: Angular test runner (Karma/Jasmine via `ng test`)
- No explicit test files found in codebase (testing setup exists but no .test.ts or .spec.ts files)

**Run Commands:**
```bash
# Backend
bun test                 # Run all tests
npm run test            # Via package.json script

# Frontend
ng test                 # Run all tests via Angular CLI
npm start test          # Watch mode
npm run build           # Build includes type checking
```

**Type Checking (both projects):**
```bash
pnpm typecheck          # Root: runs tsc --noEmit across all packages
npm run typecheck       # Individual: tsc --noEmit
```

## Test File Organization

**Location:**
- Backend: No test files present (test infrastructure prepared but not implemented)
- Frontend: No test files present (test infrastructure prepared but not implemented)

**Naming Convention (from configuration):**
- `tsconfig.spec.json` exists for frontend, suggesting `*.spec.ts` pattern would be used
- Bun test would use `*.test.ts` pattern for backend

**Structure:**
Tests not implemented in codebase. Configuration files indicate intention but no actual test suite.

## Testing Architecture

**No testing patterns established:**
- No example test files to reference
- No mocking utilities observed
- No test fixtures or factories found

**Based on infrastructure:**

**Frontend (Angular):**
- Would use Jasmine for assertions
- Karma test runner (configured via `angular.json`)
- Can test components, services, directives
- Strict template checking enabled: `"strictTemplates": true`

**Backend (Bun):**
- Native Bun test API (similar to Jest)
- No additional test libraries configured
- Would use Node assertions or external assertion library

## Mocking

**Not established in codebase:**
- No mock utilities found
- No test doubles or stubs
- Services designed with dependency injection (Angular) but no mock providers set up

**Potential patterns (based on architecture):**

**Frontend (Angular):**
- Would use `TestBed.configureTestingModule()` with mock services
- Mock `WebsocketService` for testing components that depend on it
- Mock `GameStateService` via provider override

**Backend:**
- Would need to mock `RoomManager` for isolated game tests
- Connection tracking via maps (`playerConns`, `playerRooms`) would need reset between tests

## Fixtures and Factories

**Not implemented:**
- No test data generators found
- No factory utilities for creating test objects

**Expected patterns (based on domain):**
- Card factory: `createCard(suit: Suit, rank: Rank)` already exists in `src/game/card.ts` (could be reused)
- Player factory needed for game tests
- Room factory needed for room manager tests
- Game state builders for testing game logic

## Coverage

**Requirements:** Not enforced

**No coverage configuration:**
- No `nyc`, `c8`, or `codecov` configuration
- No coverage thresholds set in `tsconfig` or test configs

**Viewing coverage (if tests added):**
```bash
# Would be:
# Bun: bun test --coverage
# Angular: ng test --code-coverage
```

## Test Types

**No test examples in codebase**

**Expected approach (based on architecture):**

**Unit Tests:**
- Backend: Game logic (`game.ts`, `player.ts`, `trick.ts`, `klopf.ts`)
- Frontend: Services (`GameStateService`, `LoggerService`, `WebsocketService`)
- Frontend: Components (`CardComponent`, `LobbyComponent`, `GameComponent`)
- Scope: Individual functions and methods, no external dependencies

**Integration Tests:**
- Backend WebSocket handler (`ws/handler.ts`) testing message flow
- Room creation and player joining
- Game state updates across WebSocket connections
- Scope: Multiple modules working together

**End-to-End Tests:**
- Not implemented
- Would test full user flows: create room → join → start game → play → complete

## Code Quality Practices

**Type Safety:**
- Strict TypeScript enforced at all levels
- No `any` types visible in codebase
- All functions have explicit return types

**Testing Aids:**
- Good separation of concerns (game logic vs. room management vs. WebSocket)
- Services have clear interfaces suitable for testing
- Error handling via return values (not exceptions) makes testing easier
- Reactive signals in Angular services are testable via subscription patterns

**Current Gaps:**
- No test files written despite infrastructure in place
- Services lack mock implementations
- No test data generators
- No CI/CD pipeline configured for automated testing

---

*Testing analysis: 2026-01-29*

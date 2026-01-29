# Technology Stack

**Analysis Date:** 2026-01-29

## Languages

**Primary:**
- TypeScript 5.9.2 - All source code (frontend, backend, shared packages)
- HTML - Angular component templates
- CSS - Styling via Tailwind CSS and PostCSS

**Secondary:**
- JavaScript - Runtime module system (ESNext modules)
- Go - Archived backend implementation (present in `backend-go/` for reference only)

## Runtime

**Environment:**
- Bun (latest) - Primary runtime for backend server at `backend/src/index.ts`
- Node.js 22 - Installed via nix flake but not primary runtime
- Browser - Frontend runs in modern web browsers (Angular bootstrapped)

**Package Manager:**
- pnpm 10.6.1 - Monorepo package manager
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- Angular 21.1.0 - Frontend SPA framework
  - `@angular/core` 21.1.0 - Core framework
  - `@angular/platform-browser` 21.1.0 - Browser support
  - `@angular/router` 21.1.0 - Client-side routing
  - `@angular/forms` 21.1.0 - Form handling
  - `@angular/build` 21.1.1 - Build tooling
  - `@angular/cli` 21.1.1 - Development CLI

- Elysia 1.3.3 - Lightweight TypeScript HTTP/WebSocket server
  - `@elysiajs/cors` 1.4.1 - CORS middleware

**Styling:**
- Tailwind CSS 4.1.18 - Utility-first CSS framework
- DaisyUI 5.5.14 - Tailwind component library
- PostCSS 8.5.6 - CSS transformation

**Testing:**
- Bun test (built-in) - Backend test runner

**Build/Dev:**
- TypeScript 5.9.2 - Language compiler
- Angular CLI - Frontend dev server and build
- Bun CLI - Backend dev server with watch mode

## Key Dependencies

**Critical:**
- `@sinclair/typebox` 0.34.30 (shared package) - Schema validation and TypeScript type generation
  - Used in `packages/shared/src/messages.ts` for Elysia body validation
  - Defines all message types between client and server

- RxJS 7.8.0 - Reactive programming library
  - Used in frontend for observable patterns and WebSocket message handling
  - Angular dependency for async operations

**Infrastructure:**
- `tslib` 2.3.0 - TypeScript runtime helpers

**Monorepo:**
- `@klopf/shared` (workspace) - Shared types and constants across frontend/backend
  - Located at `packages/shared/`
  - Exports: Card, Player, GameState, and message types via TypeBox schemas
  - Built to `dist/` with ESM exports

## Configuration

**Environment:**
- No `.env` file (not required)
- Hardcoded defaults: Backend PORT=8080, Frontend WS_URL=ws://localhost:8080/ws
- No environment variables explicitly listed as required

**Build:**
- `tsconfig.json` - Root TypeScript configuration (ES2022 target, ESNext modules)
- `tsconfig.app.json` - Frontend application config
- `tsconfig.spec.json` - Frontend test config
- `angular.json` - Angular CLI configuration
- `flake.nix` - Nix development environment
- `.envrc` - direnv configuration for Nix

**Development:**
- `pnpm-workspace.yaml` - Monorepo configuration with 3 workspaces:
  - `frontend/`
  - `backend/`
  - `packages/shared/`

## Platform Requirements

**Development:**
- Linux/macOS with Nix (via `flake.nix`)
- Bun runtime for backend
- Node.js 22 and pnpm for frontend/shared
- 60 second timeout per turn in gameplay

**Production:**
- Docker container orchestration (see `docker-compose.yml`)
- Backend: Bun server on port 8080
- Frontend: Nginx serving static assets on port 4200 (via `nginx.conf`)

## Compilation & Module System

**Output:**
- Backend: ESM modules (no bundling, direct Bun execution)
- Frontend: Angular esbuild/webpack output (production: main.js, styles in main.css)
- Shared: TypeScript to ESM JavaScript (compiled to `dist/` with `.d.ts` files)

**Module Resolution:**
- ES2022 target with ESNext module system
- TypeScript strict mode enabled
- Bundler module resolution strategy
- Allows importing TypeScript files directly in backend (`.ts` imports in index.ts)

---

*Stack analysis: 2026-01-29*

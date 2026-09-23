# Klopf

Browser-Kartenspiel für 2 bis 4 Spieler über WebSockets. Übergabe-Doku mit Regeln, Architektur und Protokoll: `ubergabe.md`. Glossar: `CONTEXT.md`.

## Stack

- pnpm-Monorepo, Nix-Flake (`direnv allow`)
- Backend: Bun + Elysia (`backend/`)
- Frontend: Angular 21 + TailwindCSS v4 + DaisyUI (`frontend/`)
- Geteilte Typen: `@klopf/shared` mit TypeBox (`packages/shared/`)

## Kommandos

```bash
pnpm install
pnpm --filter @klopf/shared run build   # nach jeder Änderung in packages/shared
pnpm dev                                # Backend :5551, Frontend :4200 mit Proxy auf /ws
pnpm typecheck
cd backend && bun test
```

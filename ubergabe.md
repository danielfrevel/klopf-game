# Klopf Game - Übergabedokument

## Projekt-Übersicht

Multiplayer-Kartenspiel "Klopf" (bayerisches Kartenspiel), spielbar im Browser über WebSockets.
2-4 Spieler treten mit 32 Karten gegeneinander an. Ziel: als letzter Spieler mit Leben übrig bleiben.

## Architektur

```
┌──────────────┐     WebSocket      ┌──────────────────┐
│   Angular    │ ◄──────────────► │  Bun + ElysiaJS  │
│   Frontend   │                    │     Backend       │
│  (DaisyUI)   │                    │                   │
└──────────────┘                    └──────────────────┘
       │                                     │
       └──────── @klopf/shared ──────────────┘
                (TypeBox Schemas)
```

- **Monorepo** mit pnpm workspaces
- **Shared Package** (`packages/shared/`): TypeBox-Schemas die sowohl als TypeScript-Types als auch als Runtime-Validation dienen
- **Backend**: Rein funktional, kein OOP. Spiellogik in reinen Funktionen die auf Plain Objects operieren
- **Frontend**: Angular mit Standalone Components und Signals

## Code-Struktur

### Backend (`backend/src/`)

#### `game/types.ts` - Zentrale Interfaces
- `PlayerState` - Spieler-Zustand (Hand, Leben, connected)
- `TrickState` - Ein Stich (gespielte Karten, Lead-Farbe, Gewinner)
- `KlopfData` - Klopf-Zustand (aktiv, Stufe, Teilnehmer, Antworten)
- `GameData` - Gesamter Spielzustand
- `RoomData` - Raum (Code, Owner, GameData)

#### `game/game.ts` - Haupt-Spiellogik
Alle Funktionen nehmen `GameData` als ersten Parameter und mutieren in-place:
- `createGame()` → neues GameData
- `startGame(game)` → Spiel starten
- `playCard(game, playerId, cardId)` → Karte spielen
- `initiateGameKlopf(game, playerId)` → Klopfen
- `respondToGameKlopf(game, playerId, mitgehen)` → Klopf beantworten
- `toGameStateInfo(game)` → Serialisierung für WebSocket

Alle Funktionen geben `string | null` zurück: `null` = Erfolg, `string` = Fehlermeldung.

#### `game/room.ts` - Raum-Verwaltung
Module-level `Map<string, RoomData>` für Räume. Funktionen: `createRoom()`, `getRoom()`, `removeRoom()`, `isOwner()`.

#### `ws/` - WebSocket Layer
- `handler.ts` - Elysia WS-Setup + Message-Router (switch/case)
- `connections.ts` - Connection-Tracking (connId ↔ playerId ↔ roomCode)
- `broadcast.ts` - `send()`, `broadcastToRoom()`, `broadcastGameState()`
- `handlers/room.ts` - create/join/reconnect/close
- `handlers/game.ts` - start/play_card + `processCardPlayed()` (shared zwischen manuellem Spiel und Timeout)
- `handlers/klopf.ts` - klopf/response/blind_drei
- `handlers/redeal.ts` - request/response (Einigung)

### Frontend (`frontend/src/app/`)

- `core/services/websocket.service.ts` - Raw WebSocket-Verbindung, messages als Observable
- `core/services/game-state.service.ts` - Signals-basierter State. Reagiert auf alle Server-Messages
- `core/services/logger.service.ts` - Console-Wrapper
- `features/lobby/` - Raum erstellen/beitreten
- `features/game/` - Haupt-Spielscreen (Karten, Stiche, Klopf-Dialoge)
- `features/results/` - Spiel-Ergebnis
- `shared/components/` - Card, PlayerHand, TrickArea, TrickHistory, KlopfDialog

Types werden direkt aus `@klopf/shared` importiert (kein Re-Export-Layer).

## Game State Machine

```
lobby → dealing → playing → trick_complete → playing (nächster Stich)
                                            → round_end → dealing (nächste Runde)
                                            → round_end → game_over
         ↕                ↕
    klopf_pending     klopf_pending
         ↕
    redeal_pending
```

**States:**
- `lobby` - Warten auf Spieler
- `dealing` - Karten ausgeteilt, Spieler können "Blind auf 3" oder "Einigung" starten
- `klopf_pending` - Jemand hat geklopft, warten auf Antworten
- `playing` - Spieler sind am Zug (60s Timer pro Spieler)
- `trick_complete` - Stich abgeschlossen (transient, wird sofort weiterverarbeitet)
- `round_end` - Runde beendet, Verlierer verliert Leben (transient)
- `redeal_pending` - Einigung angefragt, warten auf Antwort
- `game_over` - Nur noch 1 Spieler mit Leben

## WebSocket-Protokoll

### Ablauf einer Runde

1. Host sendet `start_game`
2. Server: `game_started` + `cards_dealt` (pro Spieler) + `game_state`
3. Falls 1-Leben-Spieler: automatisches Klopf → `klopf_initiated`
4. Spieler am Zug sendet `play_card { cardId }`
5. Server: `card_played` + `game_state` (oder `trick_won` wenn Stich komplett)
6. Nach 4 Stichen: `round_ended` + automatisch neue Runde
7. Letzter Spieler: `game_over { winnerId, perfectWin, stakes, winnings }`

### Message-Payloads (Client → Server)

| Type | Payload |
|------|---------|
| `create_room` | `{ playerName }` |
| `join_room` | `{ roomCode, playerName }` |
| `reconnect` | `{ roomCode, playerId }` |
| `start_game` | - |
| `close_room` | - |
| `play_card` | `{ cardId }` |
| `klopf` | - |
| `klopf_response` | `{ mitgehen: boolean }` |
| `blind_drei` | - |
| `set_stakes` | `{ stakes: number }` |
| `request_redeal` | - |
| `redeal_response` | `{ agree: boolean }` |

### Message-Payloads (Server → Client)

| Type | Payload |
|------|---------|
| `room_created` | `{ roomCode, playerId }` |
| `game_state` | `{ state: GameStateInfo }` |
| `cards_dealt` | `{ cards: Card[] }` |
| `card_played` | `{ playerId, card }` |
| `trick_won` | `{ winnerId }` |
| `klopf_initiated` | `{ playerId, level }` |
| `klopf_response_needed` | `{ level }` |
| `klopf_resolved` | `{ level }` |
| `round_ended` | `{ results: RoundResult[] }` |
| `game_over` | `{ winnerId, perfectWin, stakes, winnings }` |
| `redeal_requested` | `{ playerId }` |
| `redeal_response_needed` | `{ redealCount, maxRedeals }` |
| `redeal_performed` | `{ redealCount, maxRedeals }` |
| `redeal_declined` | - |
| `player_joined` | `{ player: PlayerInfo }` |
| `player_left` | `{ playerId }` |
| `room_closed` | - |
| `error` | `{ error: string }` |

## Wie man Features hinzufügt

### Neue Spielregel / Message-Type

1. Schema in `packages/shared/src/messages.ts` hinzufügen
2. Zum `ClientMessageSchema` / `ServerMessageSchema` Union hinzufügen
3. Export in `packages/shared/src/index.ts`
4. `pnpm --filter @klopf/shared run build`
5. Handler in `backend/src/ws/handlers/` schreiben
6. Case in `backend/src/ws/handler.ts` switch hinzufügen
7. Frontend: Message in `game-state.service.ts` handleMessage() behandeln

### Neue Karten-Eigenschaft

1. `packages/shared/src/card.ts` - Schema erweitern
2. `backend/src/game/card.ts` - createCard() anpassen
3. Frontend-Komponenten updaten

### Spiellogik ändern

1. `backend/src/game/game.ts` - Funktionen anpassen
2. Falls neuer State: `packages/shared/src/game.ts` GameStateSchema erweitern
3. Rebuild shared: `pnpm --filter @klopf/shared run build`

## Dev Setup

```bash
# Nix (empfohlen)
nix develop
pnpm install
pnpm --filter @klopf/shared run build

# Alles starten
./dev.sh

# Oder manuell:
# Terminal 1: cd backend && bun --watch src/index.ts
# Terminal 2: cd frontend && pnpm start
```

**Build**: `pnpm run build` (baut shared + frontend)

**Deployment**: Docker Compose (`docker compose up --build`)

## Bekannte Limitierungen

- Kein Persistenz-Layer (alles in-memory, Server-Restart = alle Spiele weg)
- Kein Auth (Spieler-ID ist nur eine UUID im Client)
- `RoundResult.livesLost` und `.isLoser` werden nicht korrekt gesetzt (immer 0/false)
- Reconnect funktioniert nur wenn der Server noch läuft
- Keine Tests vorhanden
- Timer-Updates werden nicht an Clients gesendet (`TimerUpdateMessage` ist definiert aber nicht implementiert)

## Dependencies

### Backend
- `bun` - Runtime
- `elysia` - Web-Framework + WebSocket
- `@elysiajs/cors` - CORS
- `@klopf/shared` - Geteilte Types

### Frontend
- `angular` 21 - Framework
- `tailwindcss` v4 - Styling
- `daisyui` - UI-Komponenten
- `@klopf/shared` - Geteilte Types

### Shared
- `@sinclair/typebox` - Runtime-validierbare TypeScript Schemas

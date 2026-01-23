# Klopf-Kartenspiel - Projektdokumentation

## Spielregeln (Kompakt)

- 2-4 Spieler, 32 Karten (7-A in ♠♥♦♣)
- Rang: 10 > 9 > 8 > 7 > B > D > K > A
- 7 Leben, 4 Karten/Runde
- Erste Karte = Stichfarbe, höchste gewinnt
- Verlierer: -1 Leben

**Klopfen:**
- Unterbricht Spiel, andere müssen reagieren
- Mitgehen oder -1 Leben
- Verlierer: -(1 + Stufe) Leben
- Konter möglich, nicht 2x hintereinander

**Sonder:**
- 1 Leben = Auto-Klopf, muss mitgehen
- Blind auf 3: Klopf vor Kartenansicht
- 60s Timeout

## Tech Stack

- Backend: Go + gorilla/websocket (Port 8080)
- Frontend: Angular 19 + TailwindCSS v4 + DaisyUI (Port 4200)
- Dev: Nix Flake

## Projektstart

```bash
# Terminal 1 - Backend
cd backend && go run cmd/server/main.go

# Terminal 2 - Frontend
cd frontend && npm start
```

## Projektstruktur

```
backend/
├── cmd/server/main.go
└── internal/
    ├── game/          # Spiellogik (card, deck, player, trick, klopf, game)
    ├── room/          # Raumverwaltung (room, manager)
    └── ws/            # WebSocket (handler, messages)

frontend/src/app/
├── core/
│   ├── models/        # Card, Player, GameState
│   └── services/      # WebSocket, GameState
├── features/          # Lobby, Game, Results
└── shared/components/ # Card, PlayerHand, TrickArea, KlopfDialog
```

## WebSocket-Protokoll

### Client → Server
```typescript
{ type: "create_room", playerName: string }
{ type: "join_room", roomCode: string, playerName: string }
{ type: "start_game" }
{ type: "play_card", cardId: string }
{ type: "klopf" }
{ type: "klopf_response", mitgehen: boolean }
{ type: "blind_drei" }
```

### Server → Client
```typescript
{ type: "room_created", roomCode: string, playerId: string }
{ type: "game_state", state: GameStateInfo }
{ type: "cards_dealt", cards: Card[] }
{ type: "card_played", playerId: string, card: Card }
{ type: "klopf_initiated", playerId: string, level: number }
{ type: "klopf_response_needed" }
{ type: "game_over", winnerId: string }
```

## State Machine

```
LOBBY → DEALING → PLAYING ←→ KLOPF_PENDING → PLAYING
                    ↓
              TRICK_COMPLETE → ROUND_END → DEALING (oder GAME_OVER)
```

## Kritische Code-Stellen

### Klopf-Logik (`backend/internal/game/klopf.go`)
- `KlopfState` struct mit Active, Level, Participants, LastKlopper
- `Initiate()` prüft LastKlopper != playerID
- `Respond()` behandelt MustMitgehen

### Auto-Klopf (`backend/internal/game/game.go:startRound()`)
- Spieler mit 1 Leben triggert automatisch Klopf
- Setzt `MustMitgehen = true`

### Timeout (`backend/internal/game/game.go`)
- 60s Timer pro Spieler
- Bei Ablauf: `PlayRandomCard()`

### Reconnect (`backend/internal/ws/handler.go:handleReconnect()`)
- Über SessionStorage (roomCode, playerId)
- Sendet aktuellen GameState + Karten

## DaisyUI Komponenten

- `card` - Spielkarten
- `btn` - Buttons (Klopfen, Mitgehen)
- `modal` - Dialoge
- `badge` - Leben-Anzeige
- `alert` - Fehler/Warnungen

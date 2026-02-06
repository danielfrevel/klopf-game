# Klopf - Kartenspiel

Ein Multiplayer-Kartenspiel mit WebSocket-Unterstützung.

## Spielregeln

- 2-4 Spieler, 32 Karten (7-8-9-10-B-D-K-A in allen vier Farben)
- Rang (hoch zu niedrig): 10 > 9 > 8 > 7 > Bube > Dame > König > Ass
- Jeder Spieler startet mit 7 Leben und erhält 4 Karten pro Runde
- Erste Karte bestimmt die Stich-Farbe, höchste Karte gewinnt
- Verlierer einer Runde verliert 1 Leben

### Klopfen

- Jederzeit möglich, unterbricht das Spiel
- Andere Spieler können mitgehen oder sofort 1 Leben verlieren
- Bei Niederlage verlieren Mitgehende: 1 + Klopf-Stufe Leben
- Konter-Klopfen erhöht die Stufe
- Nicht zweimal hintereinander vom selben Spieler möglich

### Sonderregeln

- **1 Leben**: Automatisches Klopfen bei Rundenstart, muss immer mitgehen
- **Blind auf 3**: Vor Kartenansicht mit +3 klopfen
- **Timeout**: 60 Sekunden pro Zug, dann wird eine zufällige Karte gespielt

## Tech Stack

- **Backend**: Bun + Elysia (TypeScript)
- **Frontend**: Angular 21 + TailwindCSS v4 + DaisyUI
- **Shared Types**: @klopf/shared (TypeBox)
- **Dev Environment**: Nix Flake + pnpm Monorepo

## Entwicklung

### Schnellstart (tmux)

```bash
./dev.sh
```

Startet tmux mit 3 Fenstern:

- `shell` - Nix-Shell für Befehle
- `backend` - Bun-Server auf Port 8080
- `frontend` - Angular auf Port 4200

### Mit Nix (manuell)

```bash
cd klopf-game

# Nix-Shell aktivieren (mit direnv automatisch)
direnv allow
# oder manuell:
nix develop

# Shared Types bauen (einmalig)
pnpm --filter @klopf/shared run build

# Backend starten
cd backend && bun --watch src/index.ts

# Frontend starten (neues Terminal)
cd frontend && npm start
```

### Ohne Nix

Benötigt:

- Bun (latest)
- Node.js 22+
- pnpm

```bash
pnpm install
pnpm --filter @klopf/shared run build

# Backend
cd backend && bun --watch src/index.ts

# Frontend
cd frontend && pnpm start
```

### Mit Docker

```bash
docker compose up --build
```

Zugriff:

- Frontend: http://localhost:4200
- Backend WebSocket: ws://localhost:5551/ws

## Projektstruktur

```
klopf-game/
├── packages/shared/            # @klopf/shared - Geteilte Types
│   └── src/
│       ├── card.ts             # Card Types & Schemas
│       ├── player.ts           # Player Types
│       ├── game.ts             # GameState Types
│       └── messages.ts         # WebSocket Message Types
├── backend/
│   └── src/
│       ├── index.ts            # Server-Einstiegspunkt
│       ├── game/               # Spiellogik (funktional)
│       │   ├── types.ts        # Interfaces (PlayerState, GameData, etc.)
│       │   ├── card.ts         # Karten-Vergleiche
│       │   ├── deck.ts         # Deck erstellen, mischen, austeilen
│       │   ├── player.ts       # Spieler-Funktionen
│       │   ├── trick.ts        # Stich-Funktionen
│       │   ├── klopf.ts        # Klopf-Logik
│       │   ├── game.ts         # Haupt-Spiellogik
│       │   └── room.ts         # Raum-Verwaltung
│       └── ws/                 # WebSocket-Handler
│           ├── handler.ts      # Router (Elysia WS setup)
│           ├── connections.ts  # Connection-Tracking
│           ├── broadcast.ts    # Nachrichten senden
│           └── handlers/       # Message-Handler
│               ├── room.ts     # create/join/reconnect/close
│               ├── game.ts     # start/play_card/stakes
│               ├── klopf.ts    # klopf/response/blind_drei
│               └── redeal.ts   # request/response
├── frontend/
│   └── src/app/
│       ├── core/services/      # GameStateService, WebsocketService, Logger
│       ├── features/           # Lobby, Game, Results
│       └── shared/components/  # Card, PlayerHand, TrickArea, etc.
└── docker-compose.yml
```

## WebSocket-Protokoll

### Client -> Server

- `create_room` - Neuen Raum erstellen
- `join_room` - Raum beitreten
- `reconnect` - Reconnect nach Disconnect
- `start_game` - Spiel starten (nur Host)
- `play_card` - Karte ausspielen
- `klopf` - Klopfen
- `klopf_response` - Auf Klopfen antworten
- `blind_drei` - Blind auf 3
- `set_stakes` - Einsatz setzen
- `request_redeal` - Einigung anfragen
- `redeal_response` - Auf Einigung antworten
- `close_room` - Raum schließen

### Server -> Client

- `room_created` - Raum wurde erstellt
- `game_state` - Aktueller Spielzustand
- `cards_dealt` - Karten wurden ausgeteilt
- `card_played` - Karte wurde gespielt
- `klopf_initiated` - Jemand hat geklopft
- `klopf_response_needed` - Klopf-Antwort benötigt
- `klopf_resolved` - Klopf wurde aufgelöst
- `trick_won` - Stich gewonnen
- `round_ended` - Runde beendet
- `game_over` - Spiel ist beendet
- `redeal_requested` - Einigung angefragt
- `redeal_performed` - Neu ausgeteilt
- `redeal_declined` - Einigung abgelehnt
- `player_joined` / `player_left` - Spieler-Events
- `room_closed` - Raum geschlossen
- `error` - Fehlermeldung

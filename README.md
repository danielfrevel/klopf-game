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
# In das Projektverzeichnis wechseln
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
# Dependencies installieren
pnpm install

# Shared Types bauen
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
│       ├── game/               # Spiellogik
│       ├── room/               # Raumverwaltung
│       └── ws/                 # WebSocket-Handler
├── frontend/
│   └── src/app/
│       ├── core/               # Services & Models
│       ├── features/           # Lobby, Game, Results
│       └── shared/             # Wiederverwendbare Komponenten
└── backend-go/                 # Archiviertes Go Backend (nur Referenz)
```

## WebSocket-Protokoll

### Client -> Server

- `create_room` - Neuen Raum erstellen
- `join_room` - Raum beitreten
- `start_game` - Spiel starten (nur Host)
- `play_card` - Karte ausspielen
- `klopf` - Klopfen
- `klopf_response` - Auf Klopfen antworten

### Server -> Client

- `room_created` - Raum wurde erstellt
- `game_state` - Aktueller Spielzustand
- `cards_dealt` - Karten wurden ausgeteilt
- `card_played` - Karte wurde gespielt
- `klopf_initiated` - Jemand hat geklopft
- `game_over` - Spiel ist beendet

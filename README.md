# Klopf

Kartenspiel für 2 bis 4 Spieler im Browser. Einer erstellt einen Raum und teilt den Link, die anderen treten über den Link bei.

## Spielregeln

2 bis 4 Spieler, 32 Karten (7, 8, 9, 10, B, D, K, A in allen vier Farben). Begriffe: `CONTEXT.md`.

| Regel | Entscheidung |
|---|---|
| Karten und Rang | 32 Karten, 4 je Spieler und Runde, 4 Stiche. Rang 10 > 9 > 8 > 7 > A > K > Q > J |
| Stich | Die Vorhand-Farbe (erste Karte) muss bedient werden, wenn möglich. Die höchste Karte der Vorhand-Farbe gewinnt |
| Runde | Wer den letzten Stich gewinnt, gewinnt die Runde. Alle anderen aktiven Spieler verlieren 1 Leben |
| Leben | Start mit 7. Ausgeschieden mit 0, schaut dann bis Spielende zu |
| Klopf-Sperre "nicht zweimal hintereinander" | gilt nur innerhalb einer Runde, `lastKlopper` wird pro Runde zurückgesetzt |
| Aussteigen | Spieler zahlt **Stufe** Leben (Stufe 1 = 1 Leben), ist für den Rest der Runde raus (folded): spielt nicht, wird bei Konter nicht gefragt, kein Rundenverlust |
| Mitgehen + verlieren | 1 + Stufe Leben |
| Alle steigen aus | Klopfer gewinnt Runde sofort |
| Karte eines Aussteigers im laufenden Stich | bleibt liegen, kann nicht gewinnen, Vorhand-Farbe bleibt |
| Klopf-Limit | keins (Leben können nicht unter 0) |
| Ausspieler neue Runde | Rundengewinner |
| Austeilphase | 30 s. Karten verdeckt bis "Aufdecken". Buttons: Aufdecken, Blind auf 3 (nur solange nicht aufgedeckt), Einigung (nur 2 Spieler). Start, wenn alle aufgedeckt haben oder der Timer abläuft |
| Klopf während der Austeilphase | beendet die Austeilphase, nach Auflösung direkt `playing` |
| Antwort-Timeout Klopf | 30 s. Keine Antwort = Aussteigen (zahlt Stufe). Spieler mit 1 Leben geht automatisch mit |
| Antwort-Timeout Einigung | 30 s. Keine Antwort = Einigung abgelehnt, zurück in die Austeilphase mit der Restzeit |
| Zug-Timeout | 60 s, dann spielt der Server eine zufällige gültige Karte |
| Auto-Klopf | Der erste Spieler mit 1 Leben klopft zu Rundenbeginn automatisch. Spieler mit 1 Leben müssen mitgehen |
| Blind auf 3 | Klopf direkt auf Stufe 3, nur vor dem Aufdecken |
| Disconnect in der Lobby | 60 s Frist (Reload überlebt), dann fliegt der Spieler aus dem Raum, sein Token wird ungültig |
| Host | dynamisch: erster Spieler in Sitzreihenfolge mit `connected=true`. `hostId` geht im GameState an alle |
| Disconnect im Spiel | Spieler bleibt, Timer spielen für ihn (Zufallskarte, Klopf aussteigen). Kein Entfernen |
| Einigung-Limit | 3 pro Runde, `redealCount` wird in `startRound` auf 0 gesetzt |
| Revanche | Host sendet `restart_game` in `game_over`. Alle Spieler 7 Leben, Zähler auf null, State `lobby`, Raum, URL und Sessions bleiben. Spieler mit `connected=false` fliegen dabei raus |
| Einsatz | Der Host setzt ihn in der Lobby. Der Sieger bekommt (Spieler − 1) × Einsatz, beim Perfekten Spiel (Sieg mit 7 Leben) das Doppelte |

## Tech Stack

- Backend: Bun + Elysia (TypeScript), SQLite über `bun:sqlite`
- Frontend: Angular 21 + TailwindCSS v4 + DaisyUI
- Geteilte Typen: `@klopf/shared` (TypeBox)
- Dev-Umgebung: Nix Flake + pnpm-Monorepo

## Entwicklung

### Mit Nix

```bash
direnv allow        # oder: nix develop
pnpm install
pnpm --filter @klopf/shared run build
pnpm dev
```

`pnpm dev` startet Backend und Frontend parallel:

- Backend: Bun-Server auf Port 5551 (`ws://localhost:5551/ws`)
- Frontend: Angular auf http://localhost:4200, der Dev-Server leitet `/ws` an Port 5551 weiter

### Ohne Nix

Benötigt:

- Bun (latest)
- Node.js 22+
- pnpm

```bash
pnpm install
pnpm --filter @klopf/shared run build

pnpm dev
```

### Mit Docker

```bash
docker compose up --build
```

Zugriff:

- Frontend: http://localhost:4200 (nginx leitet `/ws` an das Backend weiter)
- Backend: Port 8080 (`ws://localhost:8080/ws`, Health unter `/health`)

Im Container läuft das Backend auf 8080, lokal im Dev-Modus auf 5551.

Das Backend speichert Räume in SQLite unter `/app/data/klopf.sqlite` im Volume `klopf-data`. `docker compose restart klopf-backend` behält laufende Spiele, `docker compose down -v` löscht sie.

### Tests

```bash
cd backend && bun test
```

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
│       ├── index.ts            # Server-Einstiegspunkt, lädt Räume aus SQLite
│       ├── persistence/
│       │   └── db.ts           # SQLite-Store (bun:sqlite)
│       ├── game/               # Spiellogik (funktional)
│       │   ├── types.ts        # Interfaces (PlayerState, GameData, etc.)
│       │   ├── card.ts         # Karten-Vergleiche
│       │   ├── deck.ts         # Deck erstellen, mischen, austeilen
│       │   ├── player.ts       # Spieler-Funktionen
│       │   ├── trick.ts        # Stich-Funktionen
│       │   ├── klopf.ts        # Klopf-Logik
│       │   ├── game.ts         # Haupt-Spiellogik
│       │   ├── serialize.ts    # Snapshot für die Persistenz
│       │   └── room.ts         # Raum-Verwaltung
│       ├── utils/
│       │   └── logger.ts       # Structured Logging ([Game], [WS], [Klopf], [Room])
│       └── ws/                 # WebSocket-Handler
│           ├── handler.ts      # Router (Elysia WS setup)
│           ├── connections.ts  # Connection-Tracking
│           ├── broadcast.ts    # Nachrichten senden
│           └── handlers/       # Message-Handler
│               ├── room.ts     # create/join/reconnect/close/disconnect
│               ├── game.ts     # start/reveal/play_card/stakes/restart
│               ├── klopf.ts    # klopf/response/blind_drei
│               └── redeal.ts   # request/response
├── frontend/
│   └── src/app/
│       ├── core/services/      # GameStateService, WebsocketService, SessionService, Logger
│       ├── features/           # Start, Room (Shell für /room/:code), Lobby, Game, Results
│       └── shared/components/  # Card, PlayerHand, TrickArea, etc.
└── docker-compose.yml
```

## WebSocket-Protokoll

### Client -> Server

- `create_room` - Neuen Raum erstellen
- `join_room` - Raum beitreten
- `reconnect` - Wiedereinstieg mit Token nach Reload oder Disconnect
- `start_game` - Spiel starten (nur Host)
- `restart_game` - Revanche nach Spielende (nur Host)
- `reveal_cards` - Karten aufdecken in der Austeilphase
- `play_card` - Karte ausspielen
- `klopf` - Klopfen
- `klopf_response` - Auf Klopfen antworten
- `blind_drei` - Blind auf 3
- `set_stakes` - Einsatz setzen
- `request_redeal` - Einigung anfragen
- `redeal_response` - Auf Einigung antworten
- `close_room` - Raum schließen

### Server -> Client

- `room_created` - Beitritt bestätigt, enthält das Session-Token
- `game_state` - Aktueller Spielzustand
- `cards_dealt` - Karten wurden ausgeteilt
- `card_played` - Karte wurde gespielt
- `klopf_initiated` - Jemand hat geklopft
- `klopf_response_needed` - Klopf-Antwort benötigt
- `klopf_resolved` - Klopf wurde aufgelöst
- `round_ended` - Runde beendet
- `game_over` - Spiel ist beendet
- `redeal_requested` - Einigung angefragt
- `redeal_performed` - Neu ausgeteilt
- `redeal_declined` - Einigung abgelehnt
- `player_joined` / `player_left` - Spieler-Events
- `room_closed` - Raum geschlossen
- `error` - Fehlermeldung, optional mit `code` (`room_not_found`, `invalid_session`, `name_taken`)

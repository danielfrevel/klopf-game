# Klopf Game: Übergabedokument

## Projekt-Übersicht

Multiplayer-Kartenspiel "Klopf", spielbar im Browser über WebSockets.
2 bis 4 Spieler spielen mit 32 Karten gegeneinander. Wer als Letzter noch Leben hat, gewinnt.
Begriffe stehen im Glossar `CONTEXT.md`, Architekturentscheidungen in `docs/adr/`.

## Architektur

```
┌──────────────┐     WebSocket      ┌──────────────────┐     ┌────────────┐
│   Angular    │ ◄────────────────► │  Bun + ElysiaJS  │ ──► │  SQLite    │
│   Frontend   │                    │     Backend      │     │ (bun:sqlite)│
└──────────────┘                    └──────────────────┘     └────────────┘
       │                                     │
       └──────── @klopf/shared ──────────────┘
                (TypeBox Schemas)
```

- pnpm-Monorepo mit drei Paketen
- `packages/shared/` definiert TypeBox-Schemas. Daraus kommen die TypeScript-Typen und die Runtime-Validierung
- Das Backend ist funktional, ohne Klassen. Die Spiellogik mutiert Plain Objects synchron in-place (ADR 0001)
- Das Frontend nutzt Angular mit Standalone Components und Signals

## Spielregeln

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

## Code-Struktur

### Backend (`backend/src/`)

#### `game/types.ts`

- `PlayerState`: `id`, `token` (geheim, nie im GameState), `name`, `lives`, `hand`, `connected`, `mustMitgehen`, `folded`, `revealed`, `roundLivesLost`
- `TrickState`: gespielte Karten, `leadSuit`, `winnerId`
- `KlopfData`: `active`, `initiator`, `level`, `participants`, `responses` (Map), `lastKlopper`
- `GameData`: Spielzustand plus `turnTimer`, `phaseTimer`, `phaseEndsAt`, `dealingRemainingMs`, `timeouts` (`turnMs`, `dealingMs`, `responseMs`, `lobbyLeaveMs`), Callbacks `onTimeout` und `onPhaseExpired`, `lastRoundResults`
- `RoomData`: `code`, `game`, `lobbyLeaveTimers`

#### `game/game.ts`

Alle Funktionen nehmen `GameData` als ersten Parameter, mutieren in-place und geben `string | null` zurück (`null` = Erfolg, sonst Fehlermeldung).

- `startGame`, `revealCards`, `blindDrei`, `initiateGameKlopf`, `respondToGameKlopf`, `playCard`, `requestRedeal`, `respondToRedeal`, `restartGame`, `setStakes`
- `activePlayers(game)`: lebend und nicht ausgestiegen. Nur aktive Spieler legen Karten und antworten auf Klopfs
- `getHostId(game)`: erster verbundener Spieler, sonst der erste Spieler
- `resumeTimers(game)`: setzt nach dem Laden den passenden Timer mit der Restzeit aus `phaseEndsAt` auf
- `toGameStateInfo(game)`: Serialisierung für den Client

Zwei Timer-Slots: `turnTimer` für den Zug, `phaseTimer` für Austeilphase, Klopf-Antwort und Einigung-Antwort. Es läuft nie mehr als ein Phasen-Timer gleichzeitig. Jeder Timer-Callback prüft State und Spieler, bevor er handelt.

Am Rundenende schreibt `endRound` die Ergebnisse nach `game.lastRoundResults`. Der Handler-Layer sendet sie und leert das Feld.

#### `game/serialize.ts`

`toSnapshot(room)` und `fromSnapshot(snapshot)` wandeln Räume in JSON und zurück. Maps werden zu Entry-Arrays, Timer und Callbacks fallen weg, nach dem Laden sind alle Spieler `connected=false`. `RoomSnapshotSchema` validiert beim Laden.

#### `game/room.ts`

Module-level `Map<string, RoomData>` als Cache. `createRoom()`, `getRoom()`, `removeRoom()`, `restoreRoom()`, `isHost()`.

#### `persistence/db.ts`

`openRoomStore(path)` liefert `saveRoom`, `loadRooms`, `deleteRoom`, `purgeOlderThan`. Die Modul-Funktionen gleichen Namens nutzen den Standard-Store unter `DB_PATH`.

#### `ws/`

- `handler.ts`: Elysia-WS-Setup, Message-Router, speichert nach jeder Nachricht den Raum
- `connections.ts`: Verbindungs-Tracking (connId, playerId, roomCode). Ein alter Socket räumt beim Schließen nur seine eigenen Einträge ab
- `broadcast.ts`: `send()`, `sendError(ws, error, code?)`, `broadcastToRoom()`, `broadcastGameState()`
- `handlers/room.ts`: create, join, reconnect, close, disconnect, Lobby-Frist
- `handlers/game.ts`: start, reveal, play_card, stakes, restart. `finishAction(room)` sendet nach jeder Aktion Rundenergebnis, neue Karten, Auto-Klopf, Game Over und GameState. `attachRoomCallbacks(room)` verdrahtet die Timer mit dem Handler-Layer
- `handlers/klopf.ts`: klopf, klopf_response, blind_drei
- `handlers/redeal.ts`: request_redeal, redeal_response
- `utils/logger.ts`: Logging mit Kontext-Prefix (`[Game]`, `[WS]`, `[Klopf]`, `[Room]`)

### Frontend (`frontend/src/app/`)

- `app.ts`: öffnet die WebSocket-Verbindung einmal beim App-Start
- `core/services/websocket.service.ts`: WebSocket, Nachrichten als Observable, Reconnect mit exponentiellem Backoff (30 Versuche, maximal 30 s)
- `core/services/session.service.ts`: Session je Raum in localStorage
- `core/services/game-state.service.ts`: Signals-basierter State. `klopfResponseNeeded` kommt aus `game_state.klopf.responses` und `klopf_response_needed`, `phaseSecondsLeft` aus `phaseEndsAt`
- `features/start/`: Name, Raum erstellen, Code eingeben
- `features/room/`: Shell für `/room/:code`, zeigt je nach State Lobby, Spiel oder Ergebnis. Kümmert sich um Reconnect und Beitritt
- `features/lobby/`, `features/game/`, `features/results/`: die drei Ansichten im Raum
- `shared/components/`: Card, PlayerHand (mit verdeckter Hand), TrickArea, TrickHistory, KlopfDialog

## State Machine

```
lobby          ──start_game──────────────► dealing
dealing        ──alle aufgedeckt / Timer─► playing
dealing        ──Klopf / Blind auf 3─────► klopf_pending
dealing        ──Einigung────────────────► redeal_pending
redeal_pending ──zugestimmt──────────────► dealing (neue Karten, volle Zeit)
redeal_pending ──abgelehnt / Timer───────► dealing (Restzeit)
playing        ──Klopf───────────────────► klopf_pending
klopf_pending  ──alle haben geantwortet──► playing
klopf_pending  ──nur Klopfer aktiv───────► round_end
playing        ──4. Stich────────────────► round_end
round_end      ──────────────────────────► dealing | klopf_pending (Auto-Klopf) | game_over
game_over      ──restart_game────────────► lobby
```

- `lobby`: Warten auf Spieler
- `dealing`: Austeilphase, 30 s für Aufdecken, Blind auf 3, Einigung
- `klopf_pending`: warten auf Antworten, 30 s
- `playing`: Spieler am Zug, 60 s je Zug
- `redeal_pending`: Einigung angefragt, 30 s
- `round_end`: transient, der Server startet sofort die nächste Runde
- `game_over`: nur noch ein Spieler mit Leben
- `trick_complete` steht noch im Schema, der Server setzt es nicht mehr

## WebSocket-Protokoll

### Ablauf einer Runde

1. Host sendet `start_game`
2. Server: `game_started`, `cards_dealt` je Spieler, `game_state` mit `state: 'dealing'` und `phaseEndsAt`
3. Spieler senden `reveal_cards`. Haben alle aufgedeckt oder läuft die Zeit ab, wechselt der State auf `playing`
4. Spieler am Zug sendet `play_card { cardId }`, Server: `card_played` und `game_state`
5. Klopf: `klopf_initiated` an alle, `klopf_response_needed` nur an aktive Nicht-Klopfer, nach der Auflösung `klopf_resolved`
6. Rundenende: `round_ended`, danach neue `cards_dealt` und bei Auto-Klopf `klopf_initiated`
7. Spielende: `round_ended`, `game_over { winnerId, perfectWin, stakes, winnings }`, `game_state`

### Client → Server

| Type              | Payload                         |
| ----------------- | ------------------------------- |
| `create_room`     | `{ playerName }`                |
| `join_room`       | `{ roomCode, playerName }`      |
| `reconnect`       | `{ roomCode, playerId, token }` |
| `start_game`      | -                               |
| `close_room`      | -                               |
| `restart_game`    | -                               |
| `reveal_cards`    | -                               |
| `play_card`       | `{ cardId }`                    |
| `klopf`           | -                               |
| `klopf_response`  | `{ mitgehen: boolean }`         |
| `blind_drei`      | -                               |
| `set_stakes`      | `{ stakes: number }`            |
| `request_redeal`  | -                               |
| `redeal_response` | `{ agree: boolean }`            |

### Server → Client

| Type                     | Payload                                      |
| ------------------------ | -------------------------------------------- |
| `room_created`           | `{ roomCode, playerId, token }`              |
| `game_state`             | `{ state: GameStateInfo }`                   |
| `cards_dealt`            | `{ cards: Card[] }`                          |
| `card_played`            | `{ playerId, card }`                         |
| `klopf_initiated`        | `{ playerId, level }`                        |
| `klopf_response_needed`  | `{ level }`                                  |
| `klopf_resolved`         | `{ level }`                                  |
| `round_ended`            | `{ results: RoundResult[] }`                 |
| `game_over`              | `{ winnerId, perfectWin, stakes, winnings }` |
| `redeal_requested`       | `{ playerId }`                               |
| `redeal_response_needed` | `{ redealCount, maxRedeals }`                |
| `redeal_performed`       | `{ redealCount, maxRedeals }`                |
| `redeal_declined`        | -                                            |
| `player_joined`          | `{ player: Player }`                         |
| `player_left`            | `{ playerId }`                               |
| `room_closed`            | -                                            |
| `error`                  | `{ error: string, code?: ErrorCode }`        |

`ErrorCode` ist `room_not_found`, `invalid_session` oder `name_taken`. Das Frontend reagiert auf `code`, nicht auf den Text.

`GameStateInfo` enthält neben Spielern, Stich und Zähler immer `klopf` (mit `lastKlopper` und `responses` nur für aktive Nicht-Klopfer), `phaseEndsAt` (Epoch-ms oder `null`) und `hostId`. `Player` enthält `folded` und `revealed`. `RoundResult` enthält `folded`.

`trick_won` und `timer_update` gibt es nicht mehr. `your_turn` steht im Schema, der Server sendet es nicht.

## Sessions

- Der Raumcode steht in der URL (`/room/:code`), der Link ist teilbar
- Beim Beitritt gibt der Server jedem Spieler ein geheimes Token (`crypto.randomUUID()`). Der Browser speichert `{ playerId, token }` in localStorage unter `klopf_session_<code>`
- Reload und neuer Tab im selben Browser senden `reconnect` mit Token und landen wieder im Spiel
- Falsches Token oder unbekannter Spieler liefert `invalid_session`, ein unbekannter Raum `room_not_found`. Das Frontend löscht dann die Session und zeigt das Namensformular
- Namen sind pro Raum eindeutig (getrimmt, case-insensitive, 1 bis 20 Zeichen)
- Details: ADR 0002

## Persistenz

- SQLite über `bun:sqlite`, Tabelle `rooms(code, data, updated_at)`, ein JSON-Snapshot je Raum, WAL-Modus
- Pfad: `DB_PATH`, Standard `data/klopf.sqlite` relativ zum Arbeitsverzeichnis (lokal `backend/data/`, in Git ignoriert). Docker nutzt `/app/data/klopf.sqlite` im Volume `klopf-data`
- Der Server speichert nach jeder Client-Nachricht, nach jedem Timer-Ablauf und nach dem Lobby-Rauswurf. `close_room` löscht den Raum
- Beim Start löscht der Server Räume, die länger als 24 h unverändert sind, lädt den Rest und setzt die Timer mit der Restzeit wieder auf. Danach läuft der Purge stündlich
- Details: ADR 0003

## Tests

```bash
cd backend && bun test
```

Tests liegen neben dem Code (`src/**/*.test.ts`). `src/test-setup.ts` setzt `LOG_LEVEL=error` und `DB_PATH=':memory:'`. Timeouts lassen sich pro Spiel über `createGame(timeouts)` auf wenige Millisekunden setzen. Helfer stehen in `game/test-helpers.ts` und `ws/test-helpers.ts` (Fake-Socket).

## Wie man Features hinzufügt

### Neuer Message-Type

1. Schema in `packages/shared/src/messages.ts` anlegen
2. In `ClientMessageSchema` oder `ServerMessageSchema` aufnehmen
3. In `packages/shared/src/index.ts` exportieren
4. `pnpm --filter @klopf/shared run build`
5. Handler in `backend/src/ws/handlers/` schreiben, Case in `backend/src/ws/handler.ts` ergänzen
6. Frontend: Nachricht in `game-state.service.ts` behandeln
7. `pnpm typecheck`

### Spiellogik ändern

1. Test in `backend/src/game/*.test.ts` schreiben
2. `backend/src/game/game.ts` anpassen
3. Neues Feld in `GameData`: auch `game/serialize.ts` und `RoomSnapshotSchema` erweitern, sonst überlebt es keinen Neustart

## Dev Setup

```bash
direnv allow        # oder: nix develop
pnpm install
pnpm --filter @klopf/shared run build
pnpm dev            # Backend :5551, Frontend :4200
```

- Build: `pnpm run build`
- Typecheck: `pnpm typecheck` (Shared, Backend, Frontend)
- Deployment: `docker compose up --build`, Backend auf 8080, Frontend auf 4200

## Bekannte Limitierungen

- Kein Seat-Takeover: Wer das Gerät wechselt, tritt neu bei. Im laufenden Spiel geht das nicht
- Kein Auth: Wer Raumcode, Spieler-ID und Token kennt, spielt als dieser Spieler
- Countdown im Browser rechnet mit der Server-Uhr (`phaseEndsAt`). Weicht die Browser-Uhr ab, stimmt die Anzeige nicht, die Spiellogik schon
- Nach einem Reload im Zustand `game_over` fehlen Gewinnsumme und Perfektes Spiel, weil der Server `game_over` beim Reconnect nicht erneut sendet
- Tritt ein Tab ohne Reload einem anderen Raum bei, übernimmt der neue Spieler den Socket. Der alte Spieler bleibt als verbunden markiert, bis der Tab neu lädt

## Dependencies

- Backend: `bun`, `elysia`, `@elysiajs/cors`, `@sinclair/typebox` (Snapshot-Validierung), `@klopf/shared`
- Frontend: Angular 21, TailwindCSS v4, DaisyUI, `@klopf/shared`
- Shared: `@sinclair/typebox`

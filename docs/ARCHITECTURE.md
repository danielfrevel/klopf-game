# Klopf Game - Architecture Documentation

This document provides a detailed explanation of the backend architecture and how it connects to the frontend.

## Table of Contents

1. [Overview](#overview)
2. [Backend Structure](#backend-structure)
3. [Game Logic](#game-logic)
4. [WebSocket Communication](#websocket-communication)
5. [Frontend Integration](#frontend-integration)
6. [Data Flow](#data-flow)
7. [State Management](#state-management)

---

## Overview

The Klopf game uses a client-server architecture:

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│                 │  ◄─────────────────────►   │                 │
│  Angular App    │         JSON Messages      │   Go Server     │
│  (Frontend)     │                            │   (Backend)     │
│                 │                            │                 │
│  Port 4200      │                            │   Port 8080     │
└─────────────────┘                            └─────────────────┘
```

- **Frontend**: Angular 19 SPA that renders the UI and manages local state
- **Backend**: Go server that manages game logic, rooms, and broadcasts state changes
- **Communication**: Bidirectional WebSocket connection with JSON messages

---

## Backend Structure

### Directory Layout

```
backend/
├── cmd/server/main.go      # Application entry point
├── internal/
│   ├── game/               # Core game logic
│   │   ├── card.go         # Card and suit definitions
│   │   ├── deck.go         # Deck management
│   │   ├── player.go       # Player state
│   │   ├── trick.go        # Trick (Stich) logic
│   │   ├── klopf.go        # Klopf system
│   │   └── game.go         # Main game state machine
│   ├── room/               # Room management
│   │   ├── room.go         # Single room
│   │   └── manager.go      # Room registry
│   └── ws/                 # WebSocket layer
│       ├── handler.go      # Connection handling
│       └── messages.go     # Message types
├── go.mod
└── go.sum
```

### Entry Point (`cmd/server/main.go`)

```go
func main() {
    roomManager := room.NewManager()
    wsHandler := ws.NewHandler(roomManager)

    http.Handle("/ws", wsHandler)
    http.ListenAndServe(":8080", nil)
}
```

The server:
1. Creates a `RoomManager` to track all active game rooms
2. Creates a `WebSocket Handler` that processes all client connections
3. Listens on port 8080 with the `/ws` endpoint

---

## Game Logic

### Cards (`internal/game/card.go`)

Defines the 32-card deck used in Klopf:

```go
type Suit string
const (
    Spades   Suit = "spades"
    Hearts   Suit = "hearts"
    Diamonds Suit = "diamonds"
    Clubs    Suit = "clubs"
)

type Rank string
const (
    Seven Rank = "7"
    Eight Rank = "8"
    // ... through Ace
)
```

**Card Ranking** (highest to lowest): 10 > 9 > 8 > 7 > J > Q > K > A

The `RankValue()` function returns a numeric value for comparison:

```go
func RankValue(r Rank) int {
    switch r {
    case Ten:   return 8  // Highest
    case Nine:  return 7
    case Eight: return 6
    case Seven: return 5
    case Jack:  return 4
    case Queen: return 3
    case King:  return 2
    case Ace:   return 1  // Lowest
    }
}
```

### Deck (`internal/game/deck.go`)

Manages the 32-card deck:

```go
type Deck struct {
    Cards []Card
}

func NewDeck() *Deck           // Creates all 32 cards
func (d *Deck) Shuffle()       // Randomizes card order
func (d *Deck) Deal(n int) []Card  // Removes and returns n cards
```

### Player (`internal/game/player.go`)

Tracks individual player state:

```go
type Player struct {
    ID           string          // Unique identifier (UUID)
    Name         string          // Display name
    Lives        int             // Remaining lives (starts at 7)
    Hand         []Card          // Current cards (hidden from others)
    Connected    bool            // WebSocket connection status
    Conn         *websocket.Conn // Active connection
    MustMitgehen bool            // True if player has 1 life
    HasSeenCards bool            // False for "Blind auf 3"
}
```

Key methods:
- `HasCard(cardID)` - Check if player holds a specific card
- `RemoveCard(cardID)` - Remove and return a card from hand
- `GetCardsOfSuit(suit)` - Get all cards of a suit (for follow-suit rule)
- `LoseLives(n)` - Reduce lives by n

### Trick (`internal/game/trick.go`)

Represents a single trick (Stich) in a round:

```go
type Trick struct {
    Cards    []TrickCard  // Cards played in order
    LeadSuit Suit         // Suit of first card played
    WinnerID string       // Determined after trick completes
}

type TrickCard struct {
    PlayerID string
    Card     Card
}
```

The `DetermineWinner()` method finds the highest card of the lead suit:

```go
func (t *Trick) DetermineWinner() string {
    winningIdx := 0
    winningCard := t.Cards[0].Card

    for i := 1; i < len(t.Cards); i++ {
        currentCard := t.Cards[i].Card
        if currentCard.Beats(winningCard, t.LeadSuit) {
            winningIdx = i
            winningCard = currentCard
        }
    }
    return t.Cards[winningIdx].PlayerID
}
```

### Klopf System (`internal/game/klopf.go`)

The signature mechanic of the game:

```go
type KlopfState struct {
    Active       bool            // Is a klopf in progress?
    Initiator    string          // Who started it
    Level        int             // Escalation level (affects penalty)
    Participants []string        // Players who chose to "mitgehen"
    Responses    map[string]bool // Player responses
    LastKlopper  string          // Cannot klopf twice in a row
}
```

**Klopf Rules Implemented:**

1. **Initiation**: Any player can klopf during play
   ```go
   func (k *KlopfState) Initiate(playerID string) error {
       if k.LastKlopper == playerID {
           return ErrCannotKlopfTwice  // Cannot klopf twice in a row
       }
       k.Level++
       k.Active = true
       k.Initiator = playerID
       k.LastKlopper = playerID
       return nil
   }
   ```

2. **Response**: Other players must respond
   ```go
   func (k *KlopfState) Respond(playerID string, mitgehen bool, mustMitgehen bool) error {
       if mustMitgehen && !mitgehen {
           return ErrMustMitgehen  // Players with 1 life cannot refuse
       }
       k.Responses[playerID] = mitgehen
       if mitgehen {
           k.Participants = append(k.Participants, playerID)
       }
       return nil
   }
   ```

3. **Penalty Calculation**:
   ```go
   func (k *KlopfState) GetPenalty() int {
       return 1 + k.Level  // Base 1 + escalation level
   }
   ```

### Game State Machine (`internal/game/game.go`)

The main game controller with states:

```go
type GameState string
const (
    StateLobby         GameState = "lobby"          // Waiting for players
    StateDealing       GameState = "dealing"        // Cards being dealt
    StatePlaying       GameState = "playing"        // Active play
    StateKlopfPending  GameState = "klopf_pending"  // Waiting for klopf responses
    StateTrickComplete GameState = "trick_complete" // Trick just finished
    StateRoundEnd      GameState = "round_end"      // Round finished
    StateGameOver      GameState = "game_over"      // Winner determined
)
```

**State Transitions:**

```
LOBBY ──[start]──► DEALING ──► PLAYING ◄──► KLOPF_PENDING
                                  │
                                  ▼
                          TRICK_COMPLETE
                                  │
                                  ▼
                            ROUND_END
                              │     │
              [lives > 1] ◄───┘     └───► GAME_OVER [1 player left]
                    │
                    ▼
                 DEALING
```

**Key Methods:**

```go
// Start a new round
func (g *Game) startRound() {
    g.Deck = NewDeck()
    g.Deck.Shuffle()

    // Auto-klopf for 1-life players
    for _, p := range g.Players {
        if p.Lives == 1 {
            g.Klopf.Initiate(p.ID)
            p.MustMitgehen = true
        }
    }

    // Deal 4 cards to each player
    for _, p := range alivePlayers {
        p.Hand = g.Deck.Deal(4)
    }
}

// Play a card
func (g *Game) PlayCard(playerID, cardID string) error {
    // Validate: correct player, has card, follows suit
    // Add card to current trick
    // Check if trick complete → determine winner
    // Check if round complete → apply penalties
}

// 60-second timeout handler
func (g *Game) PlayRandomCard(playerID string) {
    validCards := player.Hand
    if len(g.CurrentTrick.Cards) > 0 {
        // Must follow suit if possible
        suitCards := player.GetCardsOfSuit(g.CurrentTrick.LeadSuit)
        if len(suitCards) > 0 {
            validCards = suitCards
        }
    }
    randomCard := validCards[rand.Intn(len(validCards))]
    g.PlayCard(playerID, randomCard.ID)
}
```

---

## WebSocket Communication

### Message Types (`internal/ws/messages.go`)

**Client → Server:**

| Type | Description | Payload |
|------|-------------|---------|
| `create_room` | Create new room | `playerName` |
| `join_room` | Join existing room | `roomCode`, `playerName` |
| `reconnect` | Reconnect to game | `roomCode`, `playerId` |
| `start_game` | Start the game | - |
| `play_card` | Play a card | `cardId` |
| `klopf` | Initiate klopf | - |
| `klopf_response` | Respond to klopf | `mitgehen` (bool) |
| `blind_drei` | Blind auf 3 | - |

**Server → Client:**

| Type | Description | Payload |
|------|-------------|---------|
| `room_created` | Room created | `roomCode`, `playerId` |
| `player_joined` | Player joined | `player` |
| `player_left` | Player disconnected | `playerId` |
| `game_started` | Game began | `state` |
| `game_state` | Full state update | `state` |
| `cards_dealt` | Your cards | `cards[]` |
| `card_played` | Card was played | `playerId`, `card` |
| `klopf_initiated` | Klopf started | `playerId`, `level` |
| `klopf_response_needed` | Must respond | - |
| `klopf_resolved` | Klopf finished | - |
| `trick_won` | Trick winner | `winnerId` |
| `round_ended` | Round results | `results[]` |
| `game_over` | Game finished | `winnerId` |
| `error` | Error occurred | `error` |

### Handler (`internal/ws/handler.go`)

Manages WebSocket connections and routes messages:

```go
type Handler struct {
    roomManager *room.Manager
    connections map[*websocket.Conn]string  // conn → playerID
    playerConns map[string]*websocket.Conn  // playerID → conn
    playerRooms map[string]string           // playerID → roomCode
}
```

**Connection Lifecycle:**

```go
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // 1. Upgrade HTTP to WebSocket
    conn, _ := upgrader.Upgrade(w, r, nil)
    defer h.handleDisconnect(conn)

    // 2. Message loop
    for {
        _, message, err := conn.ReadMessage()
        if err != nil {
            break  // Connection closed
        }
        h.handleMessage(conn, message)
    }
}
```

**Message Routing:**

```go
func (h *Handler) handleMessage(conn *websocket.Conn, message []byte) {
    var msg ClientMessage
    json.Unmarshal(message, &msg)

    switch msg.Type {
    case MsgCreateRoom:
        h.handleCreateRoom(conn, msg)
    case MsgJoinRoom:
        h.handleJoinRoom(conn, msg)
    case MsgPlayCard:
        h.handlePlayCard(conn, msg)
    case MsgKlopf:
        h.handleKlopf(conn)
    // ... etc
    }
}
```

**Broadcasting:**

```go
// Send to single client
func (h *Handler) send(conn *websocket.Conn, msg ServerMessage) {
    data, _ := json.Marshal(msg)
    conn.WriteMessage(websocket.TextMessage, data)
}

// Send to all players in a room
func (h *Handler) broadcastToRoom(roomCode string, msg ServerMessage) {
    room := h.roomManager.GetRoom(roomCode)
    for _, player := range room.Game.Players {
        if player.Conn != nil && player.Connected {
            h.send(player.Conn, msg)
        }
    }
}
```

---

## Frontend Integration

### WebSocket Service (`frontend/src/app/core/services/websocket.service.ts`)

Manages the WebSocket connection:

```typescript
@Injectable({ providedIn: 'root' })
export class WebsocketService {
    private socket: WebSocket | null = null;
    private messages$ = new Subject<ServerMessage>();

    connect(): void {
        this.socket = new WebSocket('ws://localhost:8080/ws');

        this.socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.messages$.next(message);
        };

        this.socket.onopen = () => {
            this.tryReconnect();  // Auto-reconnect if session exists
        };
    }

    // Typed methods for sending messages
    createRoom(playerName: string): void {
        this.send({ type: 'create_room', playerName });
    }

    playCard(cardId: string): void {
        this.send({ type: 'play_card', cardId });
    }

    klopf(): void {
        this.send({ type: 'klopf' });
    }
}
```

### Game State Service (`frontend/src/app/core/services/game-state.service.ts`)

Manages reactive state using Angular signals:

```typescript
@Injectable({ providedIn: 'root' })
export class GameStateService {
    // Signals for reactive updates
    private _gameState = signal<GameStateInfo | null>(null);
    private _myCards = signal<Card[]>([]);
    private _klopfResponseNeeded = signal<boolean>(false);

    // Computed values
    readonly isMyTurn = computed(() => {
        const state = this._gameState();
        const myId = this._playerId();
        return state?.currentPlayerId === myId && state?.state === 'playing';
    });

    constructor(private ws: WebsocketService) {
        // Subscribe to all messages and update state
        this.ws.messages.subscribe(msg => this.handleMessage(msg));
    }

    private handleMessage(msg: ServerMessage): void {
        switch (msg.type) {
            case 'game_state':
                this._gameState.set(msg.state);
                break;
            case 'cards_dealt':
                this._myCards.set(msg.cards);
                break;
            case 'klopf_response_needed':
                this._klopfResponseNeeded.set(true);
                break;
            // ... etc
        }
    }
}
```

### Session Persistence

The frontend stores session info in `sessionStorage` for reconnection:

```typescript
// On room_created message
sessionStorage.setItem('klopf_room', message.roomCode);
sessionStorage.setItem('klopf_player', message.playerId);

// On connect, try to reconnect
private tryReconnect(): void {
    const roomCode = sessionStorage.getItem('klopf_room');
    const playerId = sessionStorage.getItem('klopf_player');
    if (roomCode && playerId) {
        this.send({ type: 'reconnect', roomCode, playerId });
    }
}
```

---

## Data Flow

### Creating a Room

```
┌──────────┐                              ┌──────────┐
│ Frontend │                              │ Backend  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  {type: "create_room", playerName: "A"} │
     │ ───────────────────────────────────────►│
     │                                         │
     │                         Create room "abc123"
     │                         Create player UUID
     │                         Add player to room
     │                                         │
     │  {type: "room_created",                 │
     │   roomCode: "abc123",                   │
     │   playerId: "uuid-..."}                 │
     │ ◄───────────────────────────────────────│
     │                                         │
     │  {type: "game_state", state: {...}}     │
     │ ◄───────────────────────────────────────│
     │                                         │
```

### Playing a Card

```
┌──────────┐                              ┌──────────┐
│ Frontend │                              │ Backend  │
└────┬─────┘                              └────┬─────┘
     │                                         │
     │  {type: "play_card", cardId: "hearts_10"}
     │ ───────────────────────────────────────►│
     │                                         │
     │                         Validate turn
     │                         Validate card in hand
     │                         Validate follows suit
     │                         Add to trick
     │                         Advance player
     │                                         │
     │  {type: "card_played",                  │
     │   playerId: "...",                      │
     │   card: {suit: "hearts", rank: "10"}}   │
     │ ◄─────────────────── (broadcast to all) │
     │                                         │
     │  {type: "game_state", state: {...}}     │
     │ ◄─────────────────── (broadcast to all) │
     │                                         │
```

### Klopf Sequence

```
Player A                    Server                    Player B
   │                          │                          │
   │ {type: "klopf"}          │                          │
   │ ────────────────────────►│                          │
   │                          │                          │
   │                          │ {type: "klopf_initiated",│
   │                          │  playerId: "A", level: 1}│
   │ ◄────────────────────────│─────────────────────────►│
   │                          │                          │
   │                          │ {type: "klopf_response_needed"}
   │                          │─────────────────────────►│
   │                          │                          │
   │                          │  {type: "klopf_response",│
   │                          │   mitgehen: true}        │
   │                          │◄─────────────────────────│
   │                          │                          │
   │ {type: "klopf_resolved"} │                          │
   │ ◄────────────────────────│─────────────────────────►│
   │                          │                          │
   │ {type: "game_state"}     │                          │
   │ ◄────────────────────────│─────────────────────────►│
   │                          │                          │
```

---

## State Management

### Server-Side (Go)

The server is the **source of truth** for all game state:

- Game state is protected by `sync.RWMutex` for concurrent access
- All game logic runs on the server
- Clients only send actions, not state changes
- Server validates all actions before applying

```go
type Game struct {
    mu sync.RWMutex  // Protects all fields

    State         GameState
    Players       []*Player
    CurrentPlayer int
    Deck          *Deck
    CurrentTrick  *Trick
    Klopf         *KlopfState
    // ...
}
```

### Client-Side (Angular)

The frontend maintains a **local copy** of relevant state:

- Uses Angular signals for reactivity
- State updates only come from server messages
- Local state is derived/computed from server state
- User actions trigger server requests, not local state changes

```typescript
// Signals hold server-provided state
private _gameState = signal<GameStateInfo | null>(null);
private _myCards = signal<Card[]>([]);

// Computed values derive from state
readonly isMyTurn = computed(() => {
    const state = this._gameState();
    return state?.currentPlayerId === this._playerId();
});

// User actions send to server (don't modify local state directly)
playCard(cardId: string): void {
    this.ws.playCard(cardId);  // Server will broadcast new state
}
```

### Synchronization

The server broadcasts `game_state` messages after every significant action:

1. **Broadcast triggers**: Card played, klopf initiated/resolved, round end, etc.
2. **Selective data**: Cards in hand are only sent to the owning player
3. **Consistency**: All clients receive the same game state simultaneously

```go
func (h *Handler) broadcastGameState(rm *room.Room) {
    // Send public state to all
    h.broadcastToRoom(rm.Code, ServerMessage{
        Type:  MsgGameState,
        State: NewGameStateInfo(rm.Game),
    })
}

// Cards are sent individually to each player
for _, p := range rm.Game.Players {
    h.send(p.Conn, ServerMessage{
        Type:  MsgCardsDealt,
        Cards: p.Hand,  // Only this player's cards
    })
}
```

---

## Error Handling

### Server Validation

All actions are validated before execution:

```go
func (g *Game) PlayCard(playerID, cardID string) error {
    if g.State != StatePlaying {
        return ErrWrongState
    }
    if g.getCurrentPlayer().ID != playerID {
        return ErrNotYourTurn
    }
    if !player.HasCard(cardID) {
        return ErrCardNotInHand
    }
    // Must follow suit if possible
    if len(g.CurrentTrick.Cards) > 0 {
        leadSuit := g.CurrentTrick.LeadSuit
        if len(player.GetCardsOfSuit(leadSuit)) > 0 && card.Suit != leadSuit {
            return ErrMustFollowSuit
        }
    }
    // ... proceed with valid action
}
```

### Error Messages to Client

```go
func (h *Handler) handlePlayCard(conn *websocket.Conn, msg ClientMessage) {
    err := rm.Game.PlayCard(playerID, msg.CardID)
    if err != nil {
        h.sendError(conn, err.Error())
        return
    }
    // ... broadcast success
}

func (h *Handler) sendError(conn *websocket.Conn, errMsg string) {
    h.send(conn, ServerMessage{
        Type:  MsgError,
        Error: errMsg,
    })
}
```

### Frontend Error Display

```typescript
// In GameStateService
case 'error':
    this._error.set(msg.error);
    setTimeout(() => this._error.set(null), 5000);  // Auto-clear
    break;

// In component template
@if (gameState.error()) {
    <div class="alert alert-error">{{ gameState.error() }}</div>
}
```

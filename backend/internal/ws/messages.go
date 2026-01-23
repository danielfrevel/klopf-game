package ws

import "klopf-game/internal/game"

// MessageType represents the type of WebSocket message
type MessageType string

// Client -> Server message types
const (
	MsgCreateRoom     MessageType = "create_room"
	MsgJoinRoom       MessageType = "join_room"
	MsgReconnect      MessageType = "reconnect"
	MsgStartGame      MessageType = "start_game"
	MsgCloseRoom      MessageType = "close_room"
	MsgPlayCard       MessageType = "play_card"
	MsgKlopf          MessageType = "klopf"
	MsgKlopfResponse  MessageType = "klopf_response"
	MsgBlindDrei      MessageType = "blind_drei"
)

// Server -> Client message types
const (
	MsgRoomCreated        MessageType = "room_created"
	MsgRoomClosed         MessageType = "room_closed"
	MsgPlayerJoined       MessageType = "player_joined"
	MsgPlayerLeft         MessageType = "player_left"
	MsgGameStarted        MessageType = "game_started"
	MsgCardsDealt         MessageType = "cards_dealt"
	MsgCardPlayed         MessageType = "card_played"
	MsgKlopfInitiated     MessageType = "klopf_initiated"
	MsgKlopfResponseNeeded MessageType = "klopf_response_needed"
	MsgKlopfResolved      MessageType = "klopf_resolved"
	MsgTrickWon           MessageType = "trick_won"
	MsgRoundEnded         MessageType = "round_ended"
	MsgGameOver           MessageType = "game_over"
	MsgYourTurn           MessageType = "your_turn"
	MsgGameState          MessageType = "game_state"
	MsgError              MessageType = "error"
	MsgTimerUpdate        MessageType = "timer_update"
)

// BaseMessage is the base structure for all messages
type BaseMessage struct {
	Type MessageType `json:"type"`
}

// ClientMessage represents incoming messages from clients
type ClientMessage struct {
	Type       MessageType `json:"type"`
	PlayerName string      `json:"playerName,omitempty"`
	RoomCode   string      `json:"roomCode,omitempty"`
	PlayerID   string      `json:"playerId,omitempty"`
	CardID     string      `json:"cardId,omitempty"`
	Mitgehen   bool        `json:"mitgehen,omitempty"`
}

// ServerMessage represents outgoing messages to clients
type ServerMessage struct {
	Type     MessageType `json:"type"`
	RoomCode string      `json:"roomCode,omitempty"`
	PlayerID string      `json:"playerId,omitempty"`
	Player   *PlayerInfo `json:"player,omitempty"`
	State    *GameStateInfo `json:"state,omitempty"`
	Cards    []game.Card `json:"cards,omitempty"`
	Card     *game.Card  `json:"card,omitempty"`
	Level    int         `json:"level,omitempty"`
	WinnerID string      `json:"winnerId,omitempty"`
	Results  []RoundResult `json:"results,omitempty"`
	Error    string      `json:"error,omitempty"`
	TimeLeft int         `json:"timeLeft,omitempty"`
}

// PlayerInfo is the public info about a player
type PlayerInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Lives     int    `json:"lives"`
	CardCount int    `json:"cardCount"`
	Connected bool   `json:"connected"`
}

// GameStateInfo is the full game state sent to clients
type GameStateInfo struct {
	State           game.GameState `json:"state"`
	Players         []PlayerInfo   `json:"players"`
	CurrentPlayerID string         `json:"currentPlayerId"`
	TrickNumber     int            `json:"trickNumber"`
	RoundNumber     int            `json:"roundNumber"`
	CurrentTrick    *game.Trick    `json:"currentTrick,omitempty"`
	Klopf           *game.KlopfState `json:"klopf,omitempty"`
}

// RoundResult shows the outcome for a player in a round
type RoundResult struct {
	PlayerID   string `json:"playerId"`
	PlayerName string `json:"playerName"`
	LivesLost  int    `json:"livesLost"`
	LivesLeft  int    `json:"livesLeft"`
	IsLoser    bool   `json:"isLoser"`
}

// NewPlayerInfo creates a PlayerInfo from a game.Player
func NewPlayerInfo(p *game.Player) *PlayerInfo {
	return &PlayerInfo{
		ID:        p.ID,
		Name:      p.Name,
		Lives:     p.Lives,
		CardCount: len(p.Hand),
		Connected: p.Connected,
	}
}

// NewGameStateInfo creates a GameStateInfo from a game.Game
func NewGameStateInfo(g *game.Game) *GameStateInfo {
	players := make([]PlayerInfo, len(g.Players))
	for i, p := range g.Players {
		players[i] = *NewPlayerInfo(p)
	}

	return &GameStateInfo{
		State:           g.State,
		Players:         players,
		CurrentPlayerID: g.GetCurrentPlayerID(),
		TrickNumber:     g.TrickNumber,
		RoundNumber:     g.RoundNumber,
		CurrentTrick:    g.CurrentTrick,
		Klopf:           g.Klopf,
	}
}

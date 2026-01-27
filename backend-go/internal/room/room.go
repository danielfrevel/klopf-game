package room

import (
	"klopf-game/internal/game"
	"sync"
)

type Room struct {
	mu sync.RWMutex

	Code    string      `json:"code"`
	OwnerID string      `json:"ownerId"`
	Game    *game.Game  `json:"game"`
}

func NewRoom(code, ownerID string) *Room {
	return &Room{
		Code:    code,
		OwnerID: ownerID,
		Game:    game.NewGame(),
	}
}

// AddPlayer adds a player to the room's game
func (r *Room) AddPlayer(player *game.Player) error {
	return r.Game.AddPlayer(player)
}

// RemovePlayer removes a player from the room
func (r *Room) RemovePlayer(playerID string) {
	r.Game.RemovePlayer(playerID)
}

// GetPlayer returns a player by ID
func (r *Room) GetPlayer(playerID string) *game.Player {
	return r.Game.GetPlayer(playerID)
}

// IsEmpty returns true if there are no players
func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Game.Players) == 0
}

// PlayerCount returns the number of players
func (r *Room) PlayerCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.Game.Players)
}

// IsOwner checks if a player is the room owner
func (r *Room) IsOwner(playerID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.OwnerID == playerID
}

// Start starts the game
func (r *Room) Start() error {
	return r.Game.Start()
}

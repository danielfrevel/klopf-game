package game

import "errors"

var (
	ErrCannotKlopfTwice    = errors.New("cannot klopf twice in a row")
	ErrKlopfAlreadyActive  = errors.New("klopf is already active")
	ErrMustMitgehen        = errors.New("player must mitgehen (1 life)")
	ErrAlreadyResponded    = errors.New("player has already responded")
	ErrNotInKlopf          = errors.New("no active klopf")
	ErrKlopfLimitExceeded  = errors.New("klopf level would exceed lives + 1")
)

// KlopfState tracks the current klopf status
type KlopfState struct {
	Active       bool            `json:"active"`
	Initiator    string          `json:"initiator"`
	Level        int             `json:"level"`
	Participants []string        `json:"participants"` // Players who are still in (mitgegangen)
	Responses    map[string]bool `json:"-"`            // true = mitgehen, false = not mitgehen
	LastKlopper  string          `json:"-"`            // Cannot klopf twice in a row
}

// NewKlopfState creates a fresh klopf state
func NewKlopfState() *KlopfState {
	return &KlopfState{
		Active:       false,
		Level:        0,
		Participants: make([]string, 0),
		Responses:    make(map[string]bool),
	}
}

// Reset clears the klopf state for a new round
func (k *KlopfState) Reset() {
	k.Active = false
	k.Initiator = ""
	k.Level = 0
	k.Participants = make([]string, 0)
	k.Responses = make(map[string]bool)
	// LastKlopper persists across rounds
}

// ResetForNewGame clears everything including LastKlopper
func (k *KlopfState) ResetForNewGame() {
	k.Reset()
	k.LastKlopper = ""
}

// Initiate starts a new klopf or counter-klopf
func (k *KlopfState) Initiate(playerID string) error {
	if k.LastKlopper == playerID {
		return ErrCannotKlopfTwice
	}

	k.Active = true
	k.Initiator = playerID
	k.Level++
	k.Responses = make(map[string]bool)
	k.LastKlopper = playerID

	// The initiator is automatically a participant
	k.Participants = append(k.Participants, playerID)

	return nil
}

// Respond records a player's response to the klopf
func (k *KlopfState) Respond(playerID string, mitgehen bool, mustMitgehen bool) error {
	if !k.Active {
		return ErrNotInKlopf
	}

	if _, exists := k.Responses[playerID]; exists {
		return ErrAlreadyResponded
	}

	if mustMitgehen && !mitgehen {
		return ErrMustMitgehen
	}

	k.Responses[playerID] = mitgehen

	if mitgehen {
		k.Participants = append(k.Participants, playerID)
	}

	return nil
}

// AllResponded checks if all players have responded
func (k *KlopfState) AllResponded(playerIDs []string) bool {
	for _, id := range playerIDs {
		if id == k.Initiator {
			continue // Initiator doesn't need to respond
		}
		if _, exists := k.Responses[id]; !exists {
			return false
		}
	}
	return true
}

// GetPenalty returns the life penalty for losing this klopf
func (k *KlopfState) GetPenalty() int {
	return 1 + k.Level
}

// IsParticipant checks if a player is participating in the klopf
func (k *KlopfState) IsParticipant(playerID string) bool {
	for _, id := range k.Participants {
		if id == playerID {
			return true
		}
	}
	return false
}

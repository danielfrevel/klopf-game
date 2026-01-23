package game

// TrickCard represents a card played in a trick along with who played it
type TrickCard struct {
	PlayerID string `json:"playerId"`
	Card     Card   `json:"card"`
}

// Trick represents a single trick in the game
type Trick struct {
	Cards     []TrickCard `json:"cards"`
	LeadSuit  Suit        `json:"leadSuit"`
	WinnerID  string      `json:"winnerId,omitempty"`
}

// NewTrick creates a new empty trick
func NewTrick() *Trick {
	return &Trick{
		Cards: make([]TrickCard, 0, 4),
	}
}

// AddCard adds a card to the trick
func (t *Trick) AddCard(playerID string, card Card) {
	// First card determines the lead suit
	if len(t.Cards) == 0 {
		t.LeadSuit = card.Suit
	}

	t.Cards = append(t.Cards, TrickCard{
		PlayerID: playerID,
		Card:     card,
	})
}

// IsComplete returns true if all expected players have played
func (t *Trick) IsComplete(numPlayers int) bool {
	return len(t.Cards) >= numPlayers
}

// DetermineWinner finds the winning card and returns the player ID
func (t *Trick) DetermineWinner() string {
	if len(t.Cards) == 0 {
		return ""
	}

	winningIdx := 0
	winningCard := t.Cards[0].Card

	for i := 1; i < len(t.Cards); i++ {
		currentCard := t.Cards[i].Card
		// A card beats the current winner if it's the same suit with higher value
		// or if it's the lead suit and the current winner isn't
		if currentCard.Beats(winningCard, t.LeadSuit) {
			winningIdx = i
			winningCard = currentCard
		}
	}

	t.WinnerID = t.Cards[winningIdx].PlayerID
	return t.WinnerID
}

// GetLeadSuit returns the suit of the first card played
func (t *Trick) GetLeadSuit() Suit {
	return t.LeadSuit
}

package game

import "github.com/gorilla/websocket"

type Player struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Lives        int             `json:"lives"`
	Hand         []Card          `json:"-"` // Hidden from other players
	Connected    bool            `json:"connected"`
	Conn         *websocket.Conn `json:"-"`
	MustMitgehen bool            `json:"-"` // Player with 1 life must always mitgehen
	HasSeenCards bool            `json:"-"` // For Blind auf 3
}

func NewPlayer(id, name string) *Player {
	return &Player{
		ID:           id,
		Name:         name,
		Lives:        7,
		Hand:         make([]Card, 0, 4),
		Connected:    true,
		HasSeenCards: true,
	}
}

// HasCard checks if the player has a specific card
func (p *Player) HasCard(cardID string) bool {
	for _, c := range p.Hand {
		if c.ID == cardID {
			return true
		}
	}
	return false
}

// RemoveCard removes and returns a card from the player's hand
func (p *Player) RemoveCard(cardID string) *Card {
	for i, c := range p.Hand {
		if c.ID == cardID {
			card := c
			p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)
			return &card
		}
	}
	return nil
}

// GetCardsOfSuit returns all cards of a specific suit
func (p *Player) GetCardsOfSuit(suit Suit) []Card {
	cards := make([]Card, 0)
	for _, c := range p.Hand {
		if c.Suit == suit {
			cards = append(cards, c)
		}
	}
	return cards
}

// IsAlive returns true if the player has lives remaining
func (p *Player) IsAlive() bool {
	return p.Lives > 0
}

// LoseLives removes lives from the player
func (p *Player) LoseLives(n int) {
	p.Lives -= n
	if p.Lives < 0 {
		p.Lives = 0
	}
}

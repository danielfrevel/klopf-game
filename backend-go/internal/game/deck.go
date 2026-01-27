package game

import (
	"math/rand"
)

type Deck struct {
	Cards []Card
}

// NewDeck creates a new 32-card deck (7-8-9-10-J-Q-K-A in all suits)
func NewDeck() *Deck {
	cards := make([]Card, 0, 32)

	for _, suit := range AllSuits {
		for _, rank := range AllRanks {
			cards = append(cards, NewCard(suit, rank))
		}
	}

	return &Deck{Cards: cards}
}

// Shuffle randomizes the deck
func (d *Deck) Shuffle() {
	rand.Shuffle(len(d.Cards), func(i, j int) {
		d.Cards[i], d.Cards[j] = d.Cards[j], d.Cards[i]
	})
}

// Deal removes and returns n cards from the deck
func (d *Deck) Deal(n int) []Card {
	if n > len(d.Cards) {
		n = len(d.Cards)
	}

	dealt := d.Cards[:n]
	d.Cards = d.Cards[n:]

	return dealt
}

// Remaining returns the number of cards left in the deck
func (d *Deck) Remaining() int {
	return len(d.Cards)
}

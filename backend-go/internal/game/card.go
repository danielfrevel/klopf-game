package game

import "fmt"

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
	Nine  Rank = "9"
	Ten   Rank = "10"
	Jack  Rank = "J"
	Queen Rank = "Q"
	King  Rank = "K"
	Ace   Rank = "A"
)

// RankValue returns the value of a rank for comparison
// Higher value wins: 10 > 9 > 8 > 7 > J > Q > K > A
func RankValue(r Rank) int {
	switch r {
	case Ten:
		return 8
	case Nine:
		return 7
	case Eight:
		return 6
	case Seven:
		return 5
	case Jack:
		return 4
	case Queen:
		return 3
	case King:
		return 2
	case Ace:
		return 1
	default:
		return 0
	}
}

type Card struct {
	ID   string `json:"id"`
	Suit Suit   `json:"suit"`
	Rank Rank   `json:"rank"`
}

func NewCard(suit Suit, rank Rank) Card {
	return Card{
		ID:   fmt.Sprintf("%s_%s", suit, rank),
		Suit: suit,
		Rank: rank,
	}
}

func (c Card) Value() int {
	return RankValue(c.Rank)
}

// Beats returns true if this card beats the other card given the trump suit
func (c Card) Beats(other Card, trumpSuit Suit) bool {
	// Same suit - higher value wins
	if c.Suit == other.Suit {
		return c.Value() > other.Value()
	}
	// Trump suit always wins against non-trump
	if c.Suit == trumpSuit && other.Suit != trumpSuit {
		return true
	}
	// Non-trump cannot beat trump
	if c.Suit != trumpSuit && other.Suit == trumpSuit {
		return false
	}
	// Different non-trump suits - first card (other) wins
	return false
}

var AllSuits = []Suit{Spades, Hearts, Diamonds, Clubs}
var AllRanks = []Rank{Seven, Eight, Nine, Ten, Jack, Queen, King, Ace}

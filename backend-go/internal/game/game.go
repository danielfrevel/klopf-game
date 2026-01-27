package game

import (
	"errors"
	"log"
	"math/rand"
	"sync"
	"time"
)

type GameState string

const (
	StateLobby          GameState = "lobby"
	StateDealing        GameState = "dealing"
	StatePlaying        GameState = "playing"
	StateKlopfPending   GameState = "klopf_pending"
	StateTrickComplete  GameState = "trick_complete"
	StateRoundEnd       GameState = "round_end"
	StateGameOver       GameState = "game_over"
	StateRedealPending  GameState = "redeal_pending"
)

var (
	ErrNotEnoughPlayers    = errors.New("not enough players")
	ErrTooManyPlayers      = errors.New("too many players")
	ErrGameAlreadyStart    = errors.New("game already started")
	ErrWrongState          = errors.New("wrong game state")
	ErrNotYourTurn         = errors.New("not your turn")
	ErrCardNotInHand       = errors.New("card not in hand")
	ErrMustFollowSuit      = errors.New("must follow suit if possible")
	ErrPlayerNotFound      = errors.New("player not found")
	ErrRedealLimitReached  = errors.New("redeal limit reached")
	ErrRedealNotAllowed    = errors.New("redeal only allowed with 2 players")
	ErrAlreadyRequestedRedeal = errors.New("already requested redeal")
)

const (
	TurnTimeout   = 60 * time.Second
	MinPlayers    = 2
	MaxPlayers    = 4
	CardsPerRound = 4
	StartingLives = 7
	MaxRedeals    = 3
)

type Game struct {
	mu sync.RWMutex

	State         GameState              `json:"state"`
	Players       []*Player              `json:"players"`
	CurrentPlayer int                    `json:"currentPlayer"`
	Deck          *Deck                  `json:"-"`
	CurrentTrick  *Trick                 `json:"currentTrick"`
	TrickNumber   int                    `json:"trickNumber"`
	Klopf         *KlopfState            `json:"klopf"`
	RoundNumber   int                    `json:"roundNumber"`
	Stakes        int                    `json:"stakes"`
	Timers        map[string]*time.Timer `json:"-"`

	// Redeal tracking (Einigung)
	RedealCount     int               `json:"redealCount"`
	RedealRequester string            `json:"-"`
	RedealResponses map[string]bool   `json:"-"`

	OnTimeout func(playerID string) `json:"-"`
	OnUpdate  func()                `json:"-"`
}

func NewGame() *Game {
	return &Game{
		State:           StateLobby,
		Players:         make([]*Player, 0, MaxPlayers),
		Klopf:           NewKlopfState(),
		Timers:          make(map[string]*time.Timer),
		RoundNumber:     0,
		TrickNumber:     0,
		RedealCount:     0,
		RedealResponses: make(map[string]bool),
	}
}

// AddPlayer adds a player to the game
func (g *Game) AddPlayer(player *Player) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.State != StateLobby {
		return ErrGameAlreadyStart
	}

	if len(g.Players) >= MaxPlayers {
		return ErrTooManyPlayers
	}

	g.Players = append(g.Players, player)
	return nil
}

// RemovePlayer removes a player from the game
func (g *Game) RemovePlayer(playerID string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	for i, p := range g.Players {
		if p.ID == playerID {
			g.Players = append(g.Players[:i], g.Players[i+1:]...)
			return
		}
	}
}

// GetPlayer returns a player by ID
func (g *Game) GetPlayer(playerID string) *Player {
	g.mu.RLock()
	defer g.mu.RUnlock()

	for _, p := range g.Players {
		if p.ID == playerID {
			return p
		}
	}
	return nil
}

// GetAlivePlayers returns players with lives > 0
func (g *Game) GetAlivePlayers() []*Player {
	g.mu.RLock()
	defer g.mu.RUnlock()

	alive := make([]*Player, 0)
	for _, p := range g.Players {
		if p.IsAlive() {
			alive = append(alive, p)
		}
	}
	return alive
}

// Start begins the game
func (g *Game) Start() error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.State != StateLobby {
		return ErrGameAlreadyStart
	}

	if len(g.Players) < MinPlayers {
		return ErrNotEnoughPlayers
	}

	g.State = StateDealing
	g.Klopf.ResetForNewGame()
	g.startRound()

	return nil
}

// startRound begins a new round
func (g *Game) startRound() {
	g.RoundNumber++
	g.TrickNumber = 0
	g.Klopf.Reset()

	// Create and shuffle deck
	g.Deck = NewDeck()
	g.Deck.Shuffle()

	// Check for 1-life auto-klopf
	alivePlayers := make([]*Player, 0)
	for _, p := range g.Players {
		if p.IsAlive() {
			alivePlayers = append(alivePlayers, p)
			p.HasSeenCards = true
			if p.Lives == 1 {
				p.MustMitgehen = true
				g.Klopf.Initiate(p.ID)
			} else {
				p.MustMitgehen = false
			}
		}
	}

	// Deal cards
	for _, p := range alivePlayers {
		p.Hand = g.Deck.Deal(CardsPerRound)
	}

	g.CurrentTrick = NewTrick()
	g.State = StateDealing

	// If there's an auto-klopf, go to klopf pending
	if g.Klopf.Active {
		g.State = StateKlopfPending
	}
}

// StartPlaying transitions from dealing to playing
func (g *Game) StartPlaying() {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.State == StateDealing || g.State == StateKlopfPending {
		g.State = StatePlaying
		g.TrickNumber = 1
		g.startPlayerTimer()
	}
}

// BlindDrei allows a player to klopf blind for +3
func (g *Game) BlindDrei(playerID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.State != StateDealing {
		return ErrWrongState
	}

	player := g.getPlayerUnsafe(playerID)
	if player == nil {
		return ErrPlayerNotFound
	}

	// Player hasn't seen their cards yet
	if !player.HasSeenCards {
		return errors.New("already declared blind")
	}

	player.HasSeenCards = false
	g.Klopf.Level = 2 // Will become 3 when klopf is initiated
	g.Klopf.Initiate(playerID)
	g.State = StateKlopfPending

	return nil
}

// InitiateKlopf starts a klopf
func (g *Game) InitiateKlopf(playerID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.State != StatePlaying && g.State != StateDealing {
		return ErrWrongState
	}

	// Check klopf limit: new level cannot exceed player's lives + 1
	player := g.getPlayerUnsafe(playerID)
	if player == nil {
		return ErrPlayerNotFound
	}
	newLevel := g.Klopf.Level + 1
	if newLevel > player.Lives+1 {
		return ErrKlopfLimitExceeded
	}

	if err := g.Klopf.Initiate(playerID); err != nil {
		return err
	}

	g.cancelPlayerTimer()
	g.State = StateKlopfPending

	return nil
}

// RespondToKlopf records a player's klopf response
func (g *Game) RespondToKlopf(playerID string, mitgehen bool) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.State != StateKlopfPending {
		return ErrWrongState
	}

	player := g.getPlayerUnsafe(playerID)
	if player == nil {
		return ErrPlayerNotFound
	}

	if err := g.Klopf.Respond(playerID, mitgehen, player.MustMitgehen); err != nil {
		return err
	}

	// If player doesn't mitgehen, they lose 1 life immediately
	if !mitgehen {
		player.LoseLives(1)
	}

	// Check if all alive players have responded
	aliveIDs := make([]string, 0)
	for _, p := range g.Players {
		if p.IsAlive() {
			aliveIDs = append(aliveIDs, p.ID)
		}
	}

	if g.Klopf.AllResponded(aliveIDs) {
		g.State = StatePlaying
		g.startPlayerTimer()
	}

	return nil
}

// PlayCard plays a card from a player's hand
func (g *Game) PlayCard(playerID string, cardID string) error {
	log.Printf("[Game.PlayCard] Acquiring lock for player %s, card %s", playerID, cardID)
	g.mu.Lock()
	defer g.mu.Unlock()
	log.Printf("[Game.PlayCard] Lock acquired, state: %s", g.State)

	if g.State != StatePlaying {
		log.Printf("[Game.PlayCard] Wrong state: %s (expected playing)", g.State)
		return ErrWrongState
	}

	// Check if it's this player's turn
	currentPlayer := g.getCurrentPlayerUnsafe()
	if currentPlayer == nil {
		log.Printf("[Game.PlayCard] No current player")
		return ErrNotYourTurn
	}
	if currentPlayer.ID != playerID {
		log.Printf("[Game.PlayCard] Not this player's turn. Current: %s, Requested: %s", currentPlayer.ID, playerID)
		return ErrNotYourTurn
	}
	log.Printf("[Game.PlayCard] Player turn verified")

	// Check if player has the card
	if !currentPlayer.HasCard(cardID) {
		log.Printf("[Game.PlayCard] Card not in hand: %s", cardID)
		return ErrCardNotInHand
	}
	log.Printf("[Game.PlayCard] Card found in hand")

	// Get the card
	var cardToPlay *Card
	for _, c := range currentPlayer.Hand {
		if c.ID == cardID {
			card := c
			cardToPlay = &card
			break
		}
	}

	// Check if must follow suit
	if len(g.CurrentTrick.Cards) > 0 {
		leadSuit := g.CurrentTrick.GetLeadSuit()
		suitCards := currentPlayer.GetCardsOfSuit(leadSuit)
		if len(suitCards) > 0 && cardToPlay.Suit != leadSuit {
			log.Printf("[Game.PlayCard] Must follow suit %s", leadSuit)
			return ErrMustFollowSuit
		}
	}

	// Remove card from hand and add to trick
	log.Printf("[Game.PlayCard] Removing card from hand and adding to trick")
	currentPlayer.RemoveCard(cardID)
	g.CurrentTrick.AddCard(playerID, *cardToPlay)

	log.Printf("[Game.PlayCard] Cancelling player timer")
	g.cancelPlayerTimer()

	// Check if trick is complete
	log.Printf("[Game.PlayCard] Counting alive players...")
	aliveCount := g.countAlivePlayers()
	log.Printf("[Game.PlayCard] Alive count: %d, trick cards: %d", aliveCount, len(g.CurrentTrick.Cards))

	if g.CurrentTrick.IsComplete(aliveCount) {
		log.Printf("[Game.PlayCard] Trick complete, completing...")
		g.completeTrick()
	} else {
		log.Printf("[Game.PlayCard] Advancing to next player")
		g.advanceToNextPlayer()
		g.startPlayerTimer()
	}

	log.Printf("[Game.PlayCard] Done, final state: %s", g.State)
	return nil
}

// countAlivePlayers counts players with lives > 0 without locking
func (g *Game) countAlivePlayers() int {
	count := 0
	for _, p := range g.Players {
		if p.IsAlive() {
			count++
		}
	}
	return count
}

// PlayRandomCard plays a random valid card for the player (timeout)
func (g *Game) PlayRandomCard(playerID string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	player := g.getPlayerUnsafe(playerID)
	if player == nil || len(player.Hand) == 0 {
		return
	}

	// Find valid cards
	validCards := player.Hand
	if len(g.CurrentTrick.Cards) > 0 {
		leadSuit := g.CurrentTrick.GetLeadSuit()
		suitCards := player.GetCardsOfSuit(leadSuit)
		if len(suitCards) > 0 {
			validCards = suitCards
		}
	}

	// Pick random valid card
	card := validCards[rand.Intn(len(validCards))]

	// Play it (unlock first to avoid deadlock)
	g.mu.Unlock()
	g.PlayCard(playerID, card.ID)
	g.mu.Lock()
}

// completeTrick handles end of a trick
func (g *Game) completeTrick() {
	winnerID := g.CurrentTrick.DetermineWinner()
	g.State = StateTrickComplete

	// If this is the last trick of the round
	if g.TrickNumber >= CardsPerRound {
		g.endRound(winnerID)
	} else {
		// Set winner as next player
		for i, p := range g.Players {
			if p.ID == winnerID {
				g.CurrentPlayer = i
				break
			}
		}

		// Start new trick
		g.TrickNumber++
		g.CurrentTrick = NewTrick()
		g.State = StatePlaying
		g.startPlayerTimer()
	}
}

// endRound handles end of a round
func (g *Game) endRound(loserID string) {
	g.State = StateRoundEnd

	loser := g.getPlayerUnsafe(loserID)
	if loser == nil {
		return
	}

	// Calculate penalty
	penalty := 1
	if g.Klopf.Active && g.Klopf.IsParticipant(loserID) {
		penalty = g.Klopf.GetPenalty()
	}

	loser.LoseLives(penalty)

	// Check for game over (use unsafe version - we already hold the lock)
	aliveCount := g.countAlivePlayers()
	if aliveCount <= 1 {
		g.State = StateGameOver
		return
	}

	// Start new round
	g.startRound()
}

// advanceToNextPlayer moves to the next alive player
func (g *Game) advanceToNextPlayer() {
	startIdx := g.CurrentPlayer
	for {
		g.CurrentPlayer = (g.CurrentPlayer + 1) % len(g.Players)
		if g.Players[g.CurrentPlayer].IsAlive() {
			break
		}
		// Safety check to prevent infinite loop
		if g.CurrentPlayer == startIdx {
			break
		}
	}
}

// getCurrentPlayerUnsafe returns current player without locking
func (g *Game) getCurrentPlayerUnsafe() *Player {
	if g.CurrentPlayer < 0 || g.CurrentPlayer >= len(g.Players) {
		return nil
	}
	return g.Players[g.CurrentPlayer]
}

// getPlayerUnsafe returns a player without locking
func (g *Game) getPlayerUnsafe(playerID string) *Player {
	for _, p := range g.Players {
		if p.ID == playerID {
			return p
		}
	}
	return nil
}

// Timer management
func (g *Game) startPlayerTimer() {
	currentPlayer := g.getCurrentPlayerUnsafe()
	if currentPlayer == nil {
		return
	}

	g.cancelPlayerTimer()

	timer := time.AfterFunc(TurnTimeout, func() {
		if g.OnTimeout != nil {
			g.OnTimeout(currentPlayer.ID)
		} else {
			g.PlayRandomCard(currentPlayer.ID)
		}
	})

	g.Timers[currentPlayer.ID] = timer
}

func (g *Game) cancelPlayerTimer() {
	for id, timer := range g.Timers {
		timer.Stop()
		delete(g.Timers, id)
	}
}

// GetCurrentPlayerID returns the ID of the current player
func (g *Game) GetCurrentPlayerID() string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	player := g.getCurrentPlayerUnsafe()
	if player == nil {
		return ""
	}
	return player.ID
}

// GetWinner returns the winner if game is over
func (g *Game) GetWinner() *Player {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if g.State != StateGameOver {
		return nil
	}

	for _, p := range g.Players {
		if p.IsAlive() {
			return p
		}
	}
	return nil
}

// SetStakes sets the stakes for the game (only in lobby state)
func (g *Game) SetStakes(stakes int) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.State != StateLobby {
		return ErrWrongState
	}

	if stakes < 0 {
		stakes = 0
	}

	g.Stakes = stakes
	return nil
}

// GetStakes returns the current stakes
func (g *Game) GetStakes() int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.Stakes
}

// RequestRedeal initiates a redeal request (Einigung)
func (g *Game) RequestRedeal(playerID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Only allowed in dealing state
	if g.State != StateDealing {
		return ErrWrongState
	}

	// Only allowed with exactly 2 alive players
	aliveCount := g.countAlivePlayers()
	if aliveCount != 2 {
		return ErrRedealNotAllowed
	}

	// Check redeal limit
	if g.RedealCount >= MaxRedeals {
		return ErrRedealLimitReached
	}

	// Check if already requested
	if g.RedealRequester == playerID {
		return ErrAlreadyRequestedRedeal
	}

	g.RedealRequester = playerID
	g.RedealResponses = make(map[string]bool)
	g.State = StateRedealPending

	return nil
}

// RespondToRedeal handles a player's response to a redeal request
func (g *Game) RespondToRedeal(playerID string, agree bool) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.State != StateRedealPending {
		return ErrWrongState
	}

	// The requester doesn't respond - they already agreed by requesting
	if playerID == g.RedealRequester {
		return nil
	}

	g.RedealResponses[playerID] = agree

	// Check if the other player responded
	if agree {
		// Both players agree - perform redeal
		g.RedealCount++
		g.performRedeal()
	} else {
		// Other player declined - go back to dealing state
		g.RedealRequester = ""
		g.RedealResponses = make(map[string]bool)
		g.State = StateDealing
	}

	return nil
}

// performRedeal redeals cards to all alive players
func (g *Game) performRedeal() {
	g.Klopf.Reset()

	// Create and shuffle new deck
	g.Deck = NewDeck()
	g.Deck.Shuffle()

	// Deal new cards to alive players
	for _, p := range g.Players {
		if p.IsAlive() {
			p.Hand = g.Deck.Deal(CardsPerRound)
			p.HasSeenCards = true
			if p.Lives == 1 {
				p.MustMitgehen = true
				g.Klopf.Initiate(p.ID)
			} else {
				p.MustMitgehen = false
			}
		}
	}

	g.CurrentTrick = NewTrick()
	g.RedealRequester = ""
	g.RedealResponses = make(map[string]bool)
	g.State = StateDealing

	// If there's an auto-klopf, go to klopf pending
	if g.Klopf.Active {
		g.State = StateKlopfPending
	}
}

// CanRequestRedeal checks if a player can request a redeal
func (g *Game) CanRequestRedeal(playerID string) bool {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if g.State != StateDealing {
		return false
	}

	if g.countAlivePlayers() != 2 {
		return false
	}

	if g.RedealCount >= MaxRedeals {
		return false
	}

	return true
}

// GetRedealInfo returns info about the current redeal state
func (g *Game) GetRedealInfo() (requester string, count int, maxRedeals int) {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.RedealRequester, g.RedealCount, MaxRedeals
}

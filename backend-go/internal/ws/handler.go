package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/google/uuid"
	"klopf-game/internal/game"
	"klopf-game/internal/room"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

type Handler struct {
	roomManager *room.Manager
	connections map[*websocket.Conn]string // conn -> playerID
	playerConns map[string]*websocket.Conn // playerID -> conn
	playerRooms map[string]string          // playerID -> roomCode
	mu          sync.RWMutex
}

func NewHandler(rm *room.Manager) *Handler {
	return &Handler{
		roomManager: rm,
		connections: make(map[*websocket.Conn]string),
		playerConns: make(map[string]*websocket.Conn),
		playerRooms: make(map[string]string),
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer h.handleDisconnect(conn)

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		h.handleMessage(conn, message)
	}
}

func (h *Handler) handleMessage(conn *websocket.Conn, message []byte) {
	var msg ClientMessage
	if err := json.Unmarshal(message, &msg); err != nil {
		log.Printf("[WS] Failed to unmarshal message: %v", err)
		h.sendError(conn, "Invalid message format")
		return
	}

	playerID := h.getPlayerID(conn)
	log.Printf("[WS] Received %s from player %s: %s", msg.Type, playerID, string(message))

	switch msg.Type {
	case MsgCreateRoom:
		h.handleCreateRoom(conn, msg)
	case MsgJoinRoom:
		h.handleJoinRoom(conn, msg)
	case MsgReconnect:
		h.handleReconnect(conn, msg)
	case MsgStartGame:
		h.handleStartGame(conn)
	case MsgCloseRoom:
		h.handleCloseRoom(conn)
	case MsgPlayCard:
		h.handlePlayCard(conn, msg)
	case MsgKlopf:
		h.handleKlopf(conn)
	case MsgKlopfResponse:
		h.handleKlopfResponse(conn, msg)
	case MsgBlindDrei:
		h.handleBlindDrei(conn)
	case MsgSetStakes:
		h.handleSetStakes(conn, msg)
	case MsgRequestRedeal:
		h.handleRequestRedeal(conn)
	case MsgRedealResponse:
		h.handleRedealResponse(conn, msg)
	default:
		log.Printf("[WS] Unknown message type: %s", msg.Type)
		h.sendError(conn, "Unknown message type")
	}
}

func (h *Handler) handleCreateRoom(conn *websocket.Conn, msg ClientMessage) {
	playerID := uuid.New().String()
	player := game.NewPlayer(playerID, msg.PlayerName)
	player.Conn = conn

	rm := h.roomManager.CreateRoom(playerID)
	if err := rm.AddPlayer(player); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	h.registerConnection(conn, playerID, rm.Code)

	h.send(conn, ServerMessage{
		Type:     MsgRoomCreated,
		RoomCode: rm.Code,
		PlayerID: playerID,
	})

	// Send initial game state to host
	h.send(conn, ServerMessage{
		Type:  MsgGameState,
		State: NewGameStateInfo(rm.Game),
	})
}

func (h *Handler) handleJoinRoom(conn *websocket.Conn, msg ClientMessage) {
	rm := h.roomManager.GetRoom(msg.RoomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	playerID := uuid.New().String()
	player := game.NewPlayer(playerID, msg.PlayerName)
	player.Conn = conn

	if err := rm.AddPlayer(player); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	h.registerConnection(conn, playerID, rm.Code)

	// Send confirmation to joining player
	h.send(conn, ServerMessage{
		Type:     MsgRoomCreated,
		RoomCode: rm.Code,
		PlayerID: playerID,
	})

	// Notify all players in room
	h.broadcastToRoom(rm.Code, ServerMessage{
		Type:   MsgPlayerJoined,
		Player: NewPlayerInfo(player),
	})

	// Send current game state to all players
	h.broadcastGameState(rm)
}

func (h *Handler) handleReconnect(conn *websocket.Conn, msg ClientMessage) {
	rm := h.roomManager.GetRoom(msg.RoomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	player := rm.GetPlayer(msg.PlayerID)
	if player == nil {
		h.sendError(conn, "Player not found")
		return
	}

	// Update connection
	player.Conn = conn
	player.Connected = true

	h.registerConnection(conn, msg.PlayerID, msg.RoomCode)

	// Send current game state
	h.send(conn, ServerMessage{
		Type:     MsgRoomCreated,
		RoomCode: rm.Code,
		PlayerID: msg.PlayerID,
	})

	h.send(conn, ServerMessage{
		Type:  MsgGameState,
		State: NewGameStateInfo(rm.Game),
	})

	// Send player's cards if in game
	if rm.Game.State != game.StateLobby {
		h.send(conn, ServerMessage{
			Type:  MsgCardsDealt,
			Cards: player.Hand,
		})
	}
}

func (h *Handler) handleStartGame(conn *websocket.Conn) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	if !rm.IsOwner(playerID) {
		h.sendError(conn, "Only room owner can start the game")
		return
	}

	if err := rm.Start(); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	// Set up timeout handler
	rm.Game.OnTimeout = func(pID string) {
		rm.Game.PlayRandomCard(pID)
		h.broadcastGameState(rm)
	}

	// Notify all players
	h.broadcastToRoom(roomCode, ServerMessage{
		Type:  MsgGameStarted,
		State: NewGameStateInfo(rm.Game),
	})

	// Send cards to each player
	for _, p := range rm.Game.Players {
		if p.Conn != nil {
			h.send(p.Conn, ServerMessage{
				Type:  MsgCardsDealt,
				Cards: p.Hand,
			})
		}
	}

	// If there's a klopf pending (1-life auto-klopf), notify
	if rm.Game.Klopf.Active {
		h.broadcastToRoom(roomCode, ServerMessage{
			Type:     MsgKlopfInitiated,
			PlayerID: rm.Game.Klopf.Initiator,
			Level:    rm.Game.Klopf.Level,
		})
	}

	// Start playing
	rm.Game.StartPlaying()
	h.broadcastGameState(rm)
}

func (h *Handler) handleCloseRoom(conn *websocket.Conn) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	if !rm.IsOwner(playerID) {
		h.sendError(conn, "Only room owner can close the room")
		return
	}

	// Notify all players that the room is closed
	h.broadcastToRoom(roomCode, ServerMessage{
		Type: MsgRoomClosed,
	})

	// Clean up player connections
	for _, p := range rm.Game.Players {
		h.mu.Lock()
		delete(h.playerRooms, p.ID)
		h.mu.Unlock()
	}

	// Remove the room
	h.roomManager.RemoveRoom(roomCode)
}

func (h *Handler) handlePlayCard(conn *websocket.Conn, msg ClientMessage) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)
	log.Printf("[PlayCard] Player %s playing card %s in room %s", playerID, msg.CardID, roomCode)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		log.Printf("[PlayCard] ERROR: Room not found: %s", roomCode)
		h.sendError(conn, "Room not found")
		return
	}

	log.Printf("[PlayCard] Game state before: %s, CurrentPlayer: %d", rm.Game.State, rm.Game.CurrentPlayer)

	// Get the card before playing
	player := rm.GetPlayer(playerID)
	if player == nil {
		log.Printf("[PlayCard] ERROR: Player not found: %s", playerID)
		h.sendError(conn, "Player not found")
		return
	}

	log.Printf("[PlayCard] Player hand has %d cards", len(player.Hand))

	var playedCard *game.Card
	for _, c := range player.Hand {
		if c.ID == msg.CardID {
			card := c
			playedCard = &card
			break
		}
	}

	if playedCard == nil {
		log.Printf("[PlayCard] ERROR: Card not found in hand: %s", msg.CardID)
	} else {
		log.Printf("[PlayCard] Found card: %s %s", playedCard.Rank, playedCard.Suit)
	}

	log.Printf("[PlayCard] Calling Game.PlayCard...")
	if err := rm.Game.PlayCard(playerID, msg.CardID); err != nil {
		log.Printf("[PlayCard] ERROR from Game.PlayCard: %v", err)
		h.sendError(conn, err.Error())
		return
	}
	log.Printf("[PlayCard] Game.PlayCard succeeded, new state: %s", rm.Game.State)

	// Broadcast card played
	log.Printf("[PlayCard] Broadcasting card_played")
	h.broadcastToRoom(roomCode, ServerMessage{
		Type:     MsgCardPlayed,
		PlayerID: playerID,
		Card:     playedCard,
	})

	// Check for trick completion
	if rm.Game.State == game.StateTrickComplete || rm.Game.State == game.StateRoundEnd || rm.Game.State == game.StateGameOver {
		log.Printf("[PlayCard] Trick complete, state: %s", rm.Game.State)
		if rm.Game.CurrentTrick != nil {
			h.broadcastToRoom(roomCode, ServerMessage{
				Type:     MsgTrickWon,
				WinnerID: rm.Game.CurrentTrick.WinnerID,
			})
		}
	}

	// Check for round end
	if rm.Game.State == game.StateRoundEnd || rm.Game.State == game.StateDealing {
		log.Printf("[PlayCard] Round ending")
		h.handleRoundEnd(rm)
	}

	// Check for game over
	if rm.Game.State == game.StateGameOver {
		log.Printf("[PlayCard] Game over")
		winner := rm.Game.GetWinner()
		if winner != nil {
			// Check for perfect victory (winner still has all 7 lives)
			perfectWin := winner.Lives == game.StartingLives
			stakes := rm.Game.GetStakes()
			playerCount := len(rm.Game.Players)

			// Calculate winnings: (players - 1) * stakes, doubled for perfect win
			winnings := (playerCount - 1) * stakes
			if perfectWin {
				winnings *= 2
			}

			h.broadcastToRoom(roomCode, ServerMessage{
				Type:       MsgGameOver,
				WinnerID:   winner.ID,
				PerfectWin: perfectWin,
				Stakes:     stakes,
				Winnings:   winnings,
			})
		}
		return
	}

	log.Printf("[PlayCard] Broadcasting game state")
	h.broadcastGameState(rm)
	log.Printf("[PlayCard] Done")
}

func (h *Handler) handleKlopf(conn *websocket.Conn) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	if err := rm.Game.InitiateKlopf(playerID); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	h.broadcastToRoom(roomCode, ServerMessage{
		Type:     MsgKlopfInitiated,
		PlayerID: playerID,
		Level:    rm.Game.Klopf.Level,
	})

	// Request response from other players
	for _, p := range rm.Game.Players {
		if p.ID != playerID && p.IsAlive() && p.Conn != nil {
			h.send(p.Conn, ServerMessage{
				Type: MsgKlopfResponseNeeded,
			})
		}
	}
}

func (h *Handler) handleKlopfResponse(conn *websocket.Conn, msg ClientMessage) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	if err := rm.Game.RespondToKlopf(playerID, msg.Mitgehen); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	// If klopf is resolved, notify everyone
	if rm.Game.State == game.StatePlaying {
		h.broadcastToRoom(roomCode, ServerMessage{
			Type: MsgKlopfResolved,
		})
	}

	h.broadcastGameState(rm)
}

func (h *Handler) handleBlindDrei(conn *websocket.Conn) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	if err := rm.Game.BlindDrei(playerID); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	h.broadcastToRoom(roomCode, ServerMessage{
		Type:     MsgKlopfInitiated,
		PlayerID: playerID,
		Level:    3,
	})

	// Request response from other players
	for _, p := range rm.Game.Players {
		if p.ID != playerID && p.IsAlive() && p.Conn != nil {
			h.send(p.Conn, ServerMessage{
				Type: MsgKlopfResponseNeeded,
			})
		}
	}
}

func (h *Handler) handleSetStakes(conn *websocket.Conn, msg ClientMessage) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	if !rm.IsOwner(playerID) {
		h.sendError(conn, "Only room owner can set stakes")
		return
	}

	if err := rm.Game.SetStakes(msg.Stakes); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	// Broadcast updated game state to all players
	h.broadcastGameState(rm)
}

func (h *Handler) handleRequestRedeal(conn *websocket.Conn) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	if err := rm.Game.RequestRedeal(playerID); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	requester, redealCount, maxRedeals := rm.Game.GetRedealInfo()
	player := rm.GetPlayer(playerID)
	playerName := ""
	if player != nil {
		playerName = player.Name
	}

	// Notify all players about the redeal request
	h.broadcastToRoom(roomCode, ServerMessage{
		Type:        MsgRedealRequested,
		PlayerID:    requester,
		RedealCount: redealCount,
		MaxRedeals:  maxRedeals,
	})

	// Request response from the other player
	for _, p := range rm.Game.Players {
		if p.ID != playerID && p.IsAlive() && p.Conn != nil {
			h.send(p.Conn, ServerMessage{
				Type:        MsgRedealResponseNeeded,
				PlayerID:    playerID,
				RedealCount: redealCount,
				MaxRedeals:  maxRedeals,
				Error:       playerName, // Use Error field to pass requester name
			})
		}
	}
}

func (h *Handler) handleRedealResponse(conn *websocket.Conn, msg ClientMessage) {
	playerID := h.getPlayerID(conn)
	roomCode := h.getPlayerRoom(playerID)

	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		h.sendError(conn, "Room not found")
		return
	}

	if err := rm.Game.RespondToRedeal(playerID, msg.Agree); err != nil {
		h.sendError(conn, err.Error())
		return
	}

	if msg.Agree {
		// Redeal was performed - send new cards to players
		_, redealCount, maxRedeals := rm.Game.GetRedealInfo()

		h.broadcastToRoom(roomCode, ServerMessage{
			Type:        MsgRedealPerformed,
			RedealCount: redealCount,
			MaxRedeals:  maxRedeals,
		})

		// Send new cards to each alive player
		for _, p := range rm.Game.Players {
			if p.Conn != nil && p.IsAlive() {
				h.send(p.Conn, ServerMessage{
					Type:  MsgCardsDealt,
					Cards: p.Hand,
				})
			}
		}

		// If there's a klopf pending (1-life auto-klopf), notify
		if rm.Game.Klopf.Active {
			h.broadcastToRoom(roomCode, ServerMessage{
				Type:     MsgKlopfInitiated,
				PlayerID: rm.Game.Klopf.Initiator,
				Level:    rm.Game.Klopf.Level,
			})
		}
	} else {
		// Redeal was declined
		h.broadcastToRoom(roomCode, ServerMessage{
			Type: MsgRedealDeclined,
		})
	}

	h.broadcastGameState(rm)
}

func (h *Handler) handleRoundEnd(rm *room.Room) {
	results := make([]RoundResult, len(rm.Game.Players))
	for i, p := range rm.Game.Players {
		results[i] = RoundResult{
			PlayerID:   p.ID,
			PlayerName: p.Name,
			LivesLeft:  p.Lives,
		}
	}

	h.broadcastToRoom(rm.Code, ServerMessage{
		Type:    MsgRoundEnded,
		Results: results,
	})

	// Send new cards if game continues
	if rm.Game.State == game.StateDealing {
		for _, p := range rm.Game.Players {
			if p.Conn != nil && p.IsAlive() {
				h.send(p.Conn, ServerMessage{
					Type:  MsgCardsDealt,
					Cards: p.Hand,
				})
			}
		}

		// Start playing the new round
		rm.Game.StartPlaying()
	}
}

func (h *Handler) handleDisconnect(conn *websocket.Conn) {
	h.mu.Lock()
	playerID, exists := h.connections[conn]
	if exists {
		delete(h.connections, conn)
		delete(h.playerConns, playerID)

		roomCode := h.playerRooms[playerID]
		delete(h.playerRooms, playerID)

		h.mu.Unlock()

		if roomCode != "" {
			rm := h.roomManager.GetRoom(roomCode)
			if rm != nil {
				player := rm.GetPlayer(playerID)
				if player != nil {
					player.Connected = false

					h.broadcastToRoom(roomCode, ServerMessage{
						Type:     MsgPlayerLeft,
						PlayerID: playerID,
					})
				}
			}
		}
	} else {
		h.mu.Unlock()
	}

	conn.Close()
}

// Helper methods

func (h *Handler) registerConnection(conn *websocket.Conn, playerID, roomCode string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.connections[conn] = playerID
	h.playerConns[playerID] = conn
	h.playerRooms[playerID] = roomCode
}

func (h *Handler) getPlayerID(conn *websocket.Conn) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.connections[conn]
}

func (h *Handler) getPlayerRoom(playerID string) string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.playerRooms[playerID]
}

func (h *Handler) send(conn *websocket.Conn, msg ServerMessage) {
	if conn == nil {
		return
	}
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Error marshaling message: %v", err)
		return
	}
	conn.WriteMessage(websocket.TextMessage, data)
}

func (h *Handler) sendError(conn *websocket.Conn, errMsg string) {
	h.send(conn, ServerMessage{
		Type:  MsgError,
		Error: errMsg,
	})
}

func (h *Handler) broadcastToRoom(roomCode string, msg ServerMessage) {
	rm := h.roomManager.GetRoom(roomCode)
	if rm == nil {
		return
	}

	for _, p := range rm.Game.Players {
		if p.Conn != nil && p.Connected {
			h.send(p.Conn, msg)
		}
	}
}

func (h *Handler) broadcastGameState(rm *room.Room) {
	h.broadcastToRoom(rm.Code, ServerMessage{
		Type:  MsgGameState,
		State: NewGameStateInfo(rm.Game),
	})
}

package room

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"sync"
)

type Manager struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

func NewManager() *Manager {
	return &Manager{
		rooms: make(map[string]*Room),
	}
}

// CreateRoom creates a new room with a random code
func (m *Manager) CreateRoom(ownerID string) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	code := m.generateCode()
	room := NewRoom(code, ownerID)
	m.rooms[code] = room

	return room
}

// GetRoom returns a room by code (case-insensitive)
func (m *Manager) GetRoom(code string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[strings.ToLower(code)]
}

// RemoveRoom removes a room (case-insensitive)
func (m *Manager) RemoveRoom(code string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rooms, strings.ToLower(code))
}

// CleanupEmptyRooms removes all empty rooms
func (m *Manager) CleanupEmptyRooms() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for code, room := range m.rooms {
		if room.IsEmpty() {
			delete(m.rooms, code)
		}
	}
}

// generateCode generates a random 6-character room code
func (m *Manager) generateCode() string {
	for {
		bytes := make([]byte, 3)
		rand.Read(bytes)
		code := hex.EncodeToString(bytes)
		code = code[:6]

		// Make sure code doesn't exist
		if _, exists := m.rooms[code]; !exists {
			return code
		}
	}
}

// RoomCount returns the number of active rooms
func (m *Manager) RoomCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

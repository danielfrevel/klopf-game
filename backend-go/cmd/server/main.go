package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"klopf-game/internal/room"
	"klopf-game/internal/ws"
)

var (
	frontendLogFile *os.File
	frontendLogMu   sync.Mutex
)

func setupLogging() (*os.File, error) {
	// Create logs directory
	logsDir := "logs"
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create logs directory: %w", err)
	}

	// Create log file with timestamp
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logFileName := filepath.Join(logsDir, fmt.Sprintf("backend_%s.log", timestamp))

	logFile, err := os.OpenFile(logFileName, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open log file: %w", err)
	}

	// Write to both file and stdout
	multiWriter := io.MultiWriter(os.Stdout, logFile)
	log.SetOutput(multiWriter)
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)

	// Setup frontend log file
	frontendLogFileName := filepath.Join(logsDir, fmt.Sprintf("frontend_%s.log", timestamp))
	frontendLogFile, err = os.OpenFile(frontendLogFileName, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open frontend log file: %w", err)
	}

	log.Printf("Backend logs: %s", logFileName)
	log.Printf("Frontend logs: %s", frontendLogFileName)

	return logFile, nil
}

type FrontendLogEntry struct {
	Timestamp string      `json:"timestamp"`
	Level     string      `json:"level"`
	Category  string      `json:"category"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
}

func handleFrontendLog(w http.ResponseWriter, r *http.Request) {
	// CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var entries []FrontendLogEntry
	if err := json.NewDecoder(r.Body).Decode(&entries); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	frontendLogMu.Lock()
	defer frontendLogMu.Unlock()

	for _, entry := range entries {
		var logLine string
		if entry.Data != nil {
			dataJSON, _ := json.Marshal(entry.Data)
			logLine = fmt.Sprintf("[%s] [%s] [%s] %s %s\n",
				entry.Timestamp, entry.Level, entry.Category, entry.Message, string(dataJSON))
		} else {
			logLine = fmt.Sprintf("[%s] [%s] [%s] %s\n",
				entry.Timestamp, entry.Level, entry.Category, entry.Message)
		}
		frontendLogFile.WriteString(logLine)
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func main() {
	logFile, err := setupLogging()
	if err != nil {
		log.Fatal("Failed to setup logging:", err)
	}
	defer logFile.Close()
	defer frontendLogFile.Close()

	roomManager := room.NewManager()
	wsHandler := ws.NewHandler(roomManager)

	http.Handle("/ws", wsHandler)

	// Frontend log endpoint
	http.HandleFunc("/api/logs", handleFrontendLog)

	// Health check endpoint
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	log.Println("Klopf Game Server starting on :8080")
	log.Println("WebSocket endpoint: ws://localhost:5551/ws")
	log.Println("Frontend log endpoint: http://localhost:5551/api/logs")

	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("Server error:", err)
	}
}

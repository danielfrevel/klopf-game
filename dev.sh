#!/usr/bin/env bash

SESSION="klopf"
PROJECT_DIR="$HOME/code/klopf-game"

# Kill existing session if it exists
tmux kill-session -t $SESSION 2>/dev/null

# Create new session with first window (shell)
tmux new-session -d -s $SESSION -n "shell" -c "$PROJECT_DIR"

# Window 1: Shell with nix develop
tmux send-keys -t $SESSION:shell "nix develop" C-m

# Window 2: Backend (Go server)
tmux new-window -t $SESSION -n "backend" -c "$PROJECT_DIR/backend"
tmux send-keys -t $SESSION:backend "nix develop -c bash -c 'go run cmd/server/main.go'" C-m

# Window 3: Frontend (Angular)
tmux new-window -t $SESSION -n "frontend" -c "$PROJECT_DIR/frontend"
tmux send-keys -t $SESSION:frontend "nix develop -c bash -c 'npm start'" C-m

# Select first window
tmux select-window -t $SESSION:shell

# Attach to session
tmux attach-session -t $SESSION

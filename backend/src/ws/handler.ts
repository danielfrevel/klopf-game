import { Elysia } from 'elysia';
import type { ServerWebSocket } from 'bun';
import type {
  ClientMessage,
  ServerMessage,
  Card,
  Player as PlayerInfo,
  GameStateInfo,
  RoundResult,
} from '@klopf/shared';
import { ClientMessageSchema, INITIAL_LIVES } from '@klopf/shared';
import { RoomManager } from '../room/manager.js';
import { Room } from '../room/room.js';
import { Player } from '../game/player.js';
import { Game } from '../game/game.js';

// Extended WebSocket with player data
interface PlayerSocket {
  connId: number;
  playerId: string;
  roomCode: string;
}

// WebSocket data type
type WsData = PlayerSocket;

// Global state
const roomManager = new RoomManager();

// Connection tracking using unique IDs to avoid ws object reference issues
let connectionCounter = 0;
const connectionData = new Map<number, { playerId: string; roomCode: string }>(); // connId -> player data
const playerConns = new Map<string, { ws: ServerWebSocket<WsData>; connId: number }>(); // playerId -> ws+connId
const playerRooms = new Map<string, string>(); // playerId -> roomCode

// Helper to generate UUID
function generateId(): string {
  return crypto.randomUUID();
}

// Send a message to a WebSocket
function send(ws: ServerWebSocket<WsData>, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg));
}

// Send error message
function sendError(ws: ServerWebSocket<WsData>, error: string): void {
  send(ws, { type: 'error', error });
}

// Broadcast to all players in a room
function broadcastToRoom(roomCode: string, msg: ServerMessage): void {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  for (const player of room.game.players) {
    const connInfo = playerConns.get(player.id);
    if (connInfo && player.connected) {
      send(connInfo.ws, msg);
    }
  }
}

// Broadcast game state to all players in a room
function broadcastGameState(room: Room): void {
  broadcastToRoom(room.code, {
    type: 'game_state',
    state: room.game.toGameStateInfo(),
  });
}

// Register a connection
function registerConnection(
  ws: ServerWebSocket<WsData>,
  playerId: string,
  roomCode: string
): void {
  const connId = ws.data?.connId ?? connectionCounter;
  connectionData.set(connId, { playerId, roomCode });
  playerConns.set(playerId, { ws, connId });
  playerRooms.set(playerId, roomCode);
  // Update ws.data to include player info (may or may not persist)
  if (ws.data) {
    ws.data.playerId = playerId;
    ws.data.roomCode = roomCode;
  }
}

// Get player ID from connection
function getPlayerId(ws: ServerWebSocket<WsData>): string {
  // Use ws.data.connId to look up player data
  const connId = ws.data?.connId;
  if (connId !== undefined) {
    const data = connectionData.get(connId);
    if (data) return data.playerId;
  }
  // Fallback to ws.data.playerId
  return ws.data?.playerId ?? '';
}

// Get room code for a player
function getPlayerRoom(playerId: string): string {
  return playerRooms.get(playerId) ?? '';
}

// Handle create room
function handleCreateRoom(ws: ServerWebSocket<WsData>, playerName: string): void {
  const playerId = generateId();
  const player = new Player(playerId, playerName);

  const room = roomManager.createRoom(playerId);
  const err = room.addPlayer(player);
  if (err) {
    sendError(ws, err);
    return;
  }

  registerConnection(ws, playerId, room.code);

  send(ws, {
    type: 'room_created',
    roomCode: room.code,
    playerId,
  });

  // Send initial game state
  send(ws, {
    type: 'game_state',
    state: room.game.toGameStateInfo(),
  });
}

// Handle join room
function handleJoinRoom(
  ws: ServerWebSocket<WsData>,
  roomCode: string,
  playerName: string
): void {
  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const playerId = generateId();
  const player = new Player(playerId, playerName);

  const err = room.addPlayer(player);
  if (err) {
    sendError(ws, err);
    return;
  }

  registerConnection(ws, playerId, room.code);

  // Send confirmation to joining player
  send(ws, {
    type: 'room_created',
    roomCode: room.code,
    playerId,
  });

  // Notify all players
  broadcastToRoom(room.code, {
    type: 'player_joined',
    player: player.toPlayerInfo(),
  });

  // Send current game state to all
  broadcastGameState(room);
}

// Handle reconnect
function handleReconnect(
  ws: ServerWebSocket<WsData>,
  roomCode: string,
  playerId: string
): void {
  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const player = room.getPlayer(playerId);
  if (!player) {
    sendError(ws, 'Player not found');
    return;
  }

  // Update connection
  player.connected = true;
  registerConnection(ws, playerId, roomCode);

  // Send current game state
  send(ws, {
    type: 'room_created',
    roomCode: room.code,
    playerId,
  });

  send(ws, {
    type: 'game_state',
    state: room.game.toGameStateInfo(),
  });

  // Send player's cards if in game
  if (room.game.state !== 'lobby') {
    send(ws, {
      type: 'cards_dealt',
      cards: player.hand,
    });
  }
}

// Handle start game
function handleStartGame(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  if (!room.isOwner(playerId)) {
    sendError(ws, 'Only room owner can start the game');
    return;
  }

  const err = room.start();
  if (err) {
    sendError(ws, err);
    return;
  }

  // Set up timeout handler
  room.game.onTimeout = (pId: string) => {
    room.game.playRandomCard(pId);
    broadcastGameState(room);
  };

  // Notify all players
  broadcastToRoom(roomCode, {
    type: 'game_started',
  });

  // Send cards to each player
  for (const player of room.game.players) {
    const connInfo = playerConns.get(player.id);
    if (connInfo) {
      send(connInfo.ws, {
        type: 'cards_dealt',
        cards: player.hand,
      });
    }
  }

  // If there's a klopf pending (1-life auto-klopf), notify
  if (room.game.klopf.active) {
    broadcastToRoom(roomCode, {
      type: 'klopf_initiated',
      playerId: room.game.klopf.initiator,
      level: room.game.klopf.level,
    });
  }

  // Start playing
  room.game.startPlaying();
  broadcastGameState(room);
}

// Handle close room
function handleCloseRoom(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  if (!room.isOwner(playerId)) {
    sendError(ws, 'Only room owner can close the room');
    return;
  }

  // Notify all players
  broadcastToRoom(roomCode, { type: 'room_closed' });

  // Clean up player connections
  for (const player of room.game.players) {
    playerRooms.delete(player.id);
  }

  // Remove the room
  roomManager.removeRoom(roomCode);
}

// Handle play card
function handlePlayCard(ws: ServerWebSocket<WsData>, cardId: string): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const player = room.getPlayer(playerId);
  if (!player) {
    sendError(ws, 'Player not found');
    return;
  }

  // Get the card before playing
  const playedCard = player.hand.find((c) => c.id === cardId);

  const err = room.game.playCard(playerId, cardId);
  if (err) {
    sendError(ws, err);
    return;
  }

  // Broadcast card played
  if (playedCard) {
    broadcastToRoom(roomCode, {
      type: 'card_played',
      playerId,
      card: playedCard,
    });
  }

  // Check for trick completion
  if (
    room.game.state === 'trick_complete' ||
    room.game.state === 'round_end' ||
    room.game.state === 'game_over'
  ) {
    if (room.game.currentTrick) {
      broadcastToRoom(roomCode, {
        type: 'trick_won',
        winnerId: room.game.currentTrick.winnerId ?? '',
      });
    }
  }

  // Check for round end
  if (room.game.state === 'round_end' || room.game.state === 'dealing') {
    handleRoundEnd(room);
  }

  // Check for game over
  if (room.game.state === 'game_over') {
    const winner = room.game.getWinner();
    if (winner) {
      const perfectWin = winner.lives === INITIAL_LIVES;
      const stakes = room.game.stakes;
      const playerCount = room.game.players.length;
      let winnings = (playerCount - 1) * stakes;
      if (perfectWin) {
        winnings *= 2;
      }

      broadcastToRoom(roomCode, {
        type: 'game_over',
        winnerId: winner.id,
        perfectWin,
        stakes,
        winnings,
      });
    }
    return;
  }

  broadcastGameState(room);
}

// Handle klopf
function handleKlopf(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const err = room.game.initiateKlopf(playerId);
  if (err) {
    sendError(ws, err);
    return;
  }

  broadcastToRoom(roomCode, {
    type: 'klopf_initiated',
    playerId,
    level: room.game.klopf.level,
  });

  // Request response from other players
  for (const player of room.game.players) {
    if (player.id !== playerId && player.isAlive()) {
      const connInfo = playerConns.get(player.id);
      if (connInfo) {
        send(connInfo.ws, {
          type: 'klopf_response_needed',
          level: room.game.klopf.level,
        });
      }
    }
  }
}

// Handle klopf response
function handleKlopfResponse(ws: ServerWebSocket<WsData>, mitgehen: boolean): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const err = room.game.respondToKlopf(playerId, mitgehen);
  if (err) {
    sendError(ws, err);
    return;
  }

  // If klopf is resolved, notify everyone
  if (room.game.state === 'playing') {
    broadcastToRoom(roomCode, {
      type: 'klopf_resolved',
      level: room.game.klopf.level,
    });
  }

  broadcastGameState(room);
}

// Handle blind drei
function handleBlindDrei(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const err = room.game.blindDrei(playerId);
  if (err) {
    sendError(ws, err);
    return;
  }

  broadcastToRoom(roomCode, {
    type: 'klopf_initiated',
    playerId,
    level: 3,
  });

  // Request response from other players
  for (const player of room.game.players) {
    if (player.id !== playerId && player.isAlive()) {
      const connInfo = playerConns.get(player.id);
      if (connInfo) {
        send(connInfo.ws, {
          type: 'klopf_response_needed',
          level: 3,
        });
      }
    }
  }
}

// Handle set stakes
function handleSetStakes(ws: ServerWebSocket<WsData>, stakes: number): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  if (!room.isOwner(playerId)) {
    sendError(ws, 'Only room owner can set stakes');
    return;
  }

  const err = room.game.setStakes(stakes);
  if (err) {
    sendError(ws, err);
    return;
  }

  broadcastGameState(room);
}

// Handle request redeal
function handleRequestRedeal(ws: ServerWebSocket<WsData>): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const err = room.game.requestRedeal(playerId);
  if (err) {
    sendError(ws, err);
    return;
  }

  const { requester, count, maxRedeals } = room.game.getRedealInfo();
  const player = room.getPlayer(playerId);

  // Notify all players
  broadcastToRoom(roomCode, {
    type: 'redeal_requested',
    playerId: requester,
  });

  // Request response from the other player
  for (const p of room.game.players) {
    if (p.id !== playerId && p.isAlive()) {
      const connInfo = playerConns.get(p.id);
      if (connInfo) {
        send(connInfo.ws, {
          type: 'redeal_response_needed',
          redealCount: count,
          maxRedeals,
        });
      }
    }
  }
}

// Handle redeal response
function handleRedealResponse(ws: ServerWebSocket<WsData>, agree: boolean): void {
  const playerId = getPlayerId(ws);
  const roomCode = getPlayerRoom(playerId);

  const room = roomManager.getRoom(roomCode);
  if (!room) {
    sendError(ws, 'Room not found');
    return;
  }

  const err = room.game.respondToRedeal(playerId, agree);
  if (err) {
    sendError(ws, err);
    return;
  }

  if (agree) {
    // Redeal was performed
    const { count, maxRedeals } = room.game.getRedealInfo();

    broadcastToRoom(roomCode, {
      type: 'redeal_performed',
      redealCount: count,
      maxRedeals,
    });

    // Send new cards to each alive player
    for (const player of room.game.players) {
      if (player.isAlive()) {
        const connInfo = playerConns.get(player.id);
        if (connInfo) {
          send(connInfo.ws, {
            type: 'cards_dealt',
            cards: player.hand,
          });
        }
      }
    }

    // If there's a klopf pending, notify
    if (room.game.klopf.active) {
      broadcastToRoom(roomCode, {
        type: 'klopf_initiated',
        playerId: room.game.klopf.initiator,
        level: room.game.klopf.level,
      });
    }
  } else {
    // Redeal was declined
    broadcastToRoom(roomCode, { type: 'redeal_declined' });
  }

  broadcastGameState(room);
}

// Handle round end
function handleRoundEnd(room: Room): void {
  const results: RoundResult[] = room.game.players.map((p) => ({
    playerId: p.id,
    playerName: p.name,
    livesLost: 0,
    livesLeft: p.lives,
    isLoser: false,
  }));

  broadcastToRoom(room.code, {
    type: 'round_ended',
    results,
  });

  // Send new cards if game continues
  if (room.game.state === 'dealing') {
    for (const player of room.game.players) {
      if (player.isAlive()) {
        const connInfo = playerConns.get(player.id);
        if (connInfo) {
          send(connInfo.ws, {
            type: 'cards_dealt',
            cards: player.hand,
          });
        }
      }
    }

    // Start playing the new round
    room.game.startPlaying();
  }
}

// Handle disconnect
function handleDisconnect(ws: ServerWebSocket<WsData>): void {
  const connId = ws.data?.connId;
  if (connId === undefined) return;

  const data = connectionData.get(connId);
  if (!data || !data.playerId) return;

  const playerId = data.playerId;
  connectionData.delete(connId);
  playerConns.delete(playerId);

  const roomCode = playerRooms.get(playerId);
  playerRooms.delete(playerId);

  if (roomCode) {
    const room = roomManager.getRoom(roomCode);
    if (room) {
      const player = room.getPlayer(playerId);
      if (player) {
        player.connected = false;

        broadcastToRoom(roomCode, {
          type: 'player_left',
          playerId,
        });
      }
    }
  }
}

// Handle incoming message
function handleMessage(ws: ServerWebSocket<WsData>, message: ClientMessage): void {
  switch (message.type) {
    case 'create_room':
      handleCreateRoom(ws, message.playerName);
      break;
    case 'join_room':
      handleJoinRoom(ws, message.roomCode, message.playerName);
      break;
    case 'reconnect':
      handleReconnect(ws, message.roomCode, message.playerId);
      break;
    case 'start_game':
      handleStartGame(ws);
      break;
    case 'close_room':
      handleCloseRoom(ws);
      break;
    case 'play_card':
      handlePlayCard(ws, message.cardId);
      break;
    case 'klopf':
      handleKlopf(ws);
      break;
    case 'klopf_response':
      handleKlopfResponse(ws, message.mitgehen);
      break;
    case 'blind_drei':
      handleBlindDrei(ws);
      break;
    case 'set_stakes':
      handleSetStakes(ws, message.stakes);
      break;
    case 'request_redeal':
      handleRequestRedeal(ws);
      break;
    case 'redeal_response':
      handleRedealResponse(ws, message.agree);
      break;
    default:
      sendError(ws, 'Unknown message type');
  }
}

// Create Elysia WebSocket handler
export const wsHandler = new Elysia().ws('/ws', {
  body: ClientMessageSchema,

  open(ws) {
    // Assign unique connection ID that persists for this connection
    const connId = ++connectionCounter;
    (ws.data as unknown as WsData).connId = connId;
    (ws.data as unknown as WsData).playerId = '';
    (ws.data as unknown as WsData).roomCode = '';
    console.log(`WebSocket connection opened (connId: ${connId})`);
  },

  message(ws, message) {
    handleMessage(ws as unknown as ServerWebSocket<WsData>, message);
  },

  close(ws) {
    handleDisconnect(ws as unknown as ServerWebSocket<WsData>);
  },
});

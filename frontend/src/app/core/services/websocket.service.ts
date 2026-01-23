import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Card, GameStateInfo, Player, RoundResult } from '../models';
import { LoggerService } from './logger.service';

export type MessageType =
  | 'create_room'
  | 'join_room'
  | 'reconnect'
  | 'start_game'
  | 'close_room'
  | 'play_card'
  | 'klopf'
  | 'klopf_response'
  | 'blind_drei';

export interface ClientMessage {
  type: MessageType;
  playerName?: string;
  roomCode?: string;
  playerId?: string;
  cardId?: string;
  mitgehen?: boolean;
}

export interface ServerMessage {
  type: string;
  roomCode?: string;
  playerId?: string;
  player?: Player;
  state?: GameStateInfo;
  cards?: Card[];
  card?: Card;
  level?: number;
  winnerId?: string;
  results?: RoundResult[];
  error?: string;
  timeLeft?: number;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService implements OnDestroy {
  private logger = inject(LoggerService);
  private socket: WebSocket | null = null;
  private readonly WS_URL = 'ws://localhost:8080/ws';

  private connectionStatus$ = new BehaviorSubject<boolean>(false);
  private messages$ = new Subject<ServerMessage>();

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  get isConnected$(): Observable<boolean> {
    return this.connectionStatus$.asObservable();
  }

  get messages(): Observable<ServerMessage> {
    return this.messages$.asObservable();
  }

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.logger.debug('WS', 'Already connected, skipping');
      return;
    }

    this.logger.info('WS', 'Connecting to WebSocket', { url: this.WS_URL });
    this.socket = new WebSocket(this.WS_URL);

    this.socket.onopen = () => {
      this.logger.info('WS', 'WebSocket connected');
      this.connectionStatus$.next(true);
      this.reconnectAttempts = 0;

      // Try to reconnect to existing game
      this.tryReconnect();
    };

    this.socket.onclose = (event) => {
      this.logger.warn('WS', 'WebSocket disconnected', { code: event.code, reason: event.reason });
      this.connectionStatus$.next(false);
      this.attemptReconnect();
    };

    this.socket.onerror = (error) => {
      this.logger.error('WS', 'WebSocket error', error);
    };

    this.socket.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        this.logger.debug('WS', `Received: ${message.type}`, message);
        this.handleMessage(message);
        this.messages$.next(message);
      } catch (e) {
        this.logger.error('WS', 'Failed to parse message', { error: e, data: event.data });
      }
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.logger.debug('WS', `Sending: ${message.type}`, message);
      this.socket.send(JSON.stringify(message));
    } else {
      this.logger.warn('WS', 'Cannot send - WebSocket not connected', message);
    }
  }

  createRoom(playerName: string): void {
    this.send({ type: 'create_room', playerName });
  }

  joinRoom(roomCode: string, playerName: string): void {
    this.send({ type: 'join_room', roomCode, playerName });
  }

  startGame(): void {
    this.send({ type: 'start_game' });
  }

  closeRoom(): void {
    this.send({ type: 'close_room' });
  }

  playCard(cardId: string): void {
    this.logger.info('WS', 'Playing card', { cardId });
    this.send({ type: 'play_card', cardId });
  }

  klopf(): void {
    this.send({ type: 'klopf' });
  }

  respondToKlopf(mitgehen: boolean): void {
    this.send({ type: 'klopf_response', mitgehen });
  }

  blindDrei(): void {
    this.send({ type: 'blind_drei' });
  }

  private handleMessage(message: ServerMessage): void {
    // Store session info for reconnect
    if (message.type === 'room_created' && message.roomCode && message.playerId) {
      sessionStorage.setItem('klopf_room', message.roomCode);
      sessionStorage.setItem('klopf_player', message.playerId);
    }
  }

  private tryReconnect(): void {
    const roomCode = sessionStorage.getItem('klopf_room');
    const playerId = sessionStorage.getItem('klopf_player');

    if (roomCode && playerId) {
      this.send({ type: 'reconnect', roomCode, playerId });
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      console.log(`Attempting reconnect in ${delay}ms...`);
      setTimeout(() => this.connect(), delay);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}

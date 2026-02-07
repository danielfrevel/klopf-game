import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type { ClientMessage, ServerMessage } from '@klopf/shared';
import { LoggerService } from './logger.service';

// Re-export types for convenience
export type { ClientMessage, ServerMessage } from '@klopf/shared';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService implements OnDestroy {
  private logger = inject(LoggerService);
  private socket: WebSocket | null = null;
  private readonly WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

  private connectionStatus$ = new BehaviorSubject<boolean>(false);
  private messages$ = new Subject<ServerMessage>();

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 30;
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

  setStakes(stakes: number): void {
    this.send({ type: 'set_stakes', stakes });
  }

  requestRedeal(): void {
    this.send({ type: 'request_redeal' });
  }

  respondToRedeal(agree: boolean): void {
    this.send({ type: 'redeal_response', agree });
  }

  private handleMessage(message: ServerMessage): void {
    if (message.type === 'room_created') {
      sessionStorage.setItem('klopf_room', message.roomCode);
      sessionStorage.setItem('klopf_player', message.playerId);
    }
    if (message.type === 'error' && message.error === 'Room not found') {
      sessionStorage.removeItem('klopf_room');
      sessionStorage.removeItem('klopf_player');
    }
    if (message.type === 'room_closed') {
      sessionStorage.removeItem('klopf_room');
      sessionStorage.removeItem('klopf_player');
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
    const hasSession = sessionStorage.getItem('klopf_room') && sessionStorage.getItem('klopf_player');
    if (!hasSession) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
      this.logger.info('WS', `Reconnect attempt ${this.reconnectAttempts} in ${Math.round(delay)}ms`);
      setTimeout(() => this.connect(), delay);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}

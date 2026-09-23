import { Injectable } from '@angular/core';

export interface Session {
  playerId: string;
  token: string;
}

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  save(roomCode: string, playerId: string, token: string): void {
    localStorage.setItem(this.key(roomCode), JSON.stringify({ playerId, token }));
  }

  load(roomCode: string): Session | null {
    const raw = localStorage.getItem(this.key(roomCode));
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as Partial<Session>;
      return session.playerId && session.token ? { playerId: session.playerId, token: session.token } : null;
    } catch {
      return null;
    }
  }

  clear(roomCode: string): void {
    localStorage.removeItem(this.key(roomCode));
  }

  private key(roomCode: string): string {
    return `klopf_session_${roomCode.toLowerCase()}`;
  }
}

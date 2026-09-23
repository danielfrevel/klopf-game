import type { ServerWebSocket } from 'bun';
import type { ServerMessage } from '@klopf/shared';
import type { WsData } from './handler.js';
import { nextConnId } from './connections.js';

export type FakeWs = ServerWebSocket<WsData> & { sent: ServerMessage[] };

export function fakeWs(): FakeWs {
  const sent: ServerMessage[] = [];
  return {
    data: { connId: nextConnId(), playerId: '', roomCode: '' },
    sent,
    send: (raw: string) => sent.push(JSON.parse(raw)),
  } as unknown as FakeWs;
}

export function lastOfType<T extends ServerMessage['type']>(
  ws: FakeWs,
  type: T,
): Extract<ServerMessage, { type: T }> | undefined {
  return ws.sent.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1);
}

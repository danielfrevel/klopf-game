import type { Card, Suit, GameState } from '@klopf/shared';

export interface PlayerState {
  readonly id: string;
  name: string;
  lives: number;
  hand: Card[];
  connected: boolean;
  mustMitgehen: boolean;
  hasSeenCards: boolean;
}

export interface TrickState {
  cards: { playerId: string; card: Card }[];
  leadSuit: Suit | '';
  winnerId: string | undefined;
}

export interface KlopfData {
  active: boolean;
  initiator: string;
  level: number;
  participants: string[];
  responses: Map<string, boolean>;
  lastKlopper: string;
}

export interface GameData {
  state: GameState;
  players: PlayerState[];
  currentPlayerIndex: number;
  currentTrick: TrickState | null;
  completedTricks: TrickState[];
  trickNumber: number;
  klopf: KlopfData;
  roundNumber: number;
  stakes: number;
  redealCount: number;
  redealRequester: string;
  redealResponses: Map<string, boolean>;
  turnTimer: ReturnType<typeof setTimeout> | null;
  onTimeout?: (playerId: string) => void;
  lastRoundResults?: { winnerId: string; results: import('@klopf/shared').RoundResult[] };
}

export interface RoomData {
  code: string;
  ownerId: string;
  game: GameData;
}

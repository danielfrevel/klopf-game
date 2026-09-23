import type { Card, Suit, GameState, RoundResult } from '@klopf/shared';

export interface PlayerState {
  readonly id: string;
  readonly token: string;
  name: string;
  lives: number;
  hand: Card[];
  connected: boolean;
  mustMitgehen: boolean;
  folded: boolean;
  revealed: boolean;
  roundLivesLost: number;
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

export interface GameTimeouts {
  turnMs: number;
  dealingMs: number;
  responseMs: number;
  lobbyLeaveMs: number;
}

export type PhaseKind = 'dealing' | 'klopf' | 'redeal';

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
  turnTimer: ReturnType<typeof setTimeout> | null;
  phaseTimer: ReturnType<typeof setTimeout> | null;
  phaseEndsAt: number | null;
  dealingRemainingMs: number | null;
  timeouts: GameTimeouts;
  onTimeout?: (playerId: string) => void;
  onPhaseExpired?: (kind: PhaseKind, klopfLevel: number) => void;
  lastRoundResults?: { winnerId: string; results: RoundResult[] };
}

export interface RoomData {
  code: string;
  game: GameData;
  lobbyLeaveTimers: Map<string, ReturnType<typeof setTimeout>>;
}

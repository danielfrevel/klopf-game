import { Card } from './card.model';
import { Player } from './player.model';

export type GameState =
  | 'lobby'
  | 'dealing'
  | 'playing'
  | 'klopf_pending'
  | 'trick_complete'
  | 'round_end'
  | 'game_over';

export interface TrickCard {
  playerId: string;
  card: Card;
}

export interface Trick {
  cards: TrickCard[];
  leadSuit: string;
  winnerId?: string;
}

export interface KlopfState {
  active: boolean;
  initiator: string;
  level: number;
  participants: string[];
}

export interface GameStateInfo {
  state: GameState;
  players: Player[];
  currentPlayerId: string;
  trickNumber: number;
  roundNumber: number;
  currentTrick?: Trick;
  klopf?: KlopfState;
}

export interface RoundResult {
  playerId: string;
  playerName: string;
  livesLost: number;
  livesLeft: number;
  isLoser: boolean;
}

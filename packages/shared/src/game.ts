import { Type, type Static } from '@sinclair/typebox';
import { CardSchema, SuitSchema } from './card.js';
import { PlayerSchema } from './player.js';

// Game state enum
export const GameStateSchema = Type.Union([
  Type.Literal('lobby'),
  Type.Literal('dealing'),
  Type.Literal('playing'),
  Type.Literal('klopf_pending'),
  Type.Literal('trick_complete'),
  Type.Literal('round_end'),
  Type.Literal('game_over'),
  Type.Literal('redeal_pending'),
]);
export type GameState = Static<typeof GameStateSchema>;

// Trick card (a card played in a trick)
export const TrickCardSchema = Type.Object({
  playerId: Type.String(),
  card: CardSchema,
});
export type TrickCard = Static<typeof TrickCardSchema>;

// Trick (a round of cards)
export const TrickSchema = Type.Object({
  cards: Type.Array(TrickCardSchema),
  leadSuit: Type.String(),
  winnerId: Type.Optional(Type.String()),
});
export type Trick = Static<typeof TrickSchema>;

// Klopf state
export const KlopfStateSchema = Type.Object({
  active: Type.Boolean(),
  initiator: Type.String(),
  level: Type.Number(),
  participants: Type.Array(Type.String()),
});
export type KlopfState = Static<typeof KlopfStateSchema>;

// Full game state info (sent to clients)
export const GameStateInfoSchema = Type.Object({
  state: GameStateSchema,
  players: Type.Array(PlayerSchema),
  currentPlayerId: Type.String(),
  trickNumber: Type.Number(),
  roundNumber: Type.Number(),
  stakes: Type.Number(),
  redealCount: Type.Number(),
  maxRedeals: Type.Number(),
  currentTrick: Type.Optional(TrickSchema),
  klopf: Type.Optional(KlopfStateSchema),
});
export type GameStateInfo = Static<typeof GameStateInfoSchema>;

// Round result (shown at end of round)
export const RoundResultSchema = Type.Object({
  playerId: Type.String(),
  playerName: Type.String(),
  livesLost: Type.Number(),
  livesLeft: Type.Number(),
  isLoser: Type.Boolean(),
});
export type RoundResult = Static<typeof RoundResultSchema>;

// Default stakes
export const DEFAULT_STAKES = 1;

// Max redeals allowed per round series
export const MAX_REDEALS = 3;

// Tricks per round
export const TRICKS_PER_ROUND = 4;

import { Type, type Static } from '@sinclair/typebox';

// Player info schema (public info visible to all players)
export const PlayerSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  lives: Type.Number(),
  cardCount: Type.Number(),
  connected: Type.Boolean(),
});
export type Player = Static<typeof PlayerSchema>;

// Initial lives for new players
export const INITIAL_LIVES = 7;

// Min/max players for a game
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

// Cards per player per round
export const CARDS_PER_PLAYER = 4;

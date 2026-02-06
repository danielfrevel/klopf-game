import { Type, type Static } from '@sinclair/typebox';

// Suit schema and type
export const SuitSchema = Type.Union([
  Type.Literal('spades'),
  Type.Literal('hearts'),
  Type.Literal('diamonds'),
  Type.Literal('clubs'),
]);
export type Suit = Static<typeof SuitSchema>;

// Rank schema and type
export const RankSchema = Type.Union([
  Type.Literal('7'),
  Type.Literal('8'),
  Type.Literal('9'),
  Type.Literal('10'),
  Type.Literal('J'),
  Type.Literal('Q'),
  Type.Literal('K'),
  Type.Literal('A'),
]);
export type Rank = Static<typeof RankSchema>;

// Card schema and type
export const CardSchema = Type.Object({
  id: Type.String(),
  suit: SuitSchema,
  rank: RankSchema,
});
export type Card = Static<typeof CardSchema>;

// Suit symbols for display
export const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

// Suit colors for display (CSS color values for inline styles - avoids DaisyUI overrides)
export const SUIT_COLORS: Record<Suit, string> = {
  spades: '#111827',
  hearts: '#dc2626',
  diamonds: '#dc2626',
  clubs: '#111827',
};

// Get card display string (e.g., "7♠")
export function getCardDisplay(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

// All suits in order
export const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

// All ranks in order (game order: 10 is highest)
export const RANKS: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Rank values for comparison (higher = better)
// In Klopf: 10 > 9 > 8 > 7 > A > K > Q > J
export const RANK_VALUES: Record<Rank, number> = {
  'J': 1,
  'Q': 2,
  'K': 3,
  'A': 4,
  '7': 5,
  '8': 6,
  '9': 7,
  '10': 8,
};

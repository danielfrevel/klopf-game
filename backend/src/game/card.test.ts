import { describe, expect, test } from 'bun:test';
import { RANKS } from '@klopf/shared';
import { cardBeats } from './card.js';
import { card } from './test-helpers.js';

describe('cardBeats', () => {
  test('ranks 10 > 9 > 8 > 7 > A > K > Q > J within a suit', () => {
    const order = ['10', '9', '8', '7', 'A', 'K', 'Q', 'J'] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(cardBeats(card(order[i], 'hearts'), card(order[i + 1], 'hearts'), 'hearts')).toBe(true);
      expect(cardBeats(card(order[i + 1], 'hearts'), card(order[i], 'hearts'), 'hearts')).toBe(false);
    }
    expect(RANKS.length).toBe(order.length);
  });

  test('lead suit beats any other suit', () => {
    expect(cardBeats(card('J', 'hearts'), card('10', 'spades'), 'hearts')).toBe(true);
    expect(cardBeats(card('10', 'spades'), card('J', 'hearts'), 'hearts')).toBe(false);
  });

  test('off-suit card never beats another off-suit card', () => {
    expect(cardBeats(card('10', 'spades'), card('J', 'clubs'), 'hearts')).toBe(false);
  });
});

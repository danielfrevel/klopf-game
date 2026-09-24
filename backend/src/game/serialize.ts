import { Type, type Static } from '@sinclair/typebox';
import { CardSchema, GameStateSchema, RoundResultSchema, SuitSchema } from '@klopf/shared';
import type { RoomData, TrickState } from './types.js';

const Entries = Type.Array(Type.Tuple([Type.String(), Type.Boolean()]));

const TrickSnapshotSchema = Type.Object({
  cards: Type.Array(Type.Object({ playerId: Type.String(), card: CardSchema })),
  leadSuit: Type.Union([SuitSchema, Type.Literal('')]),
  winnerId: Type.Optional(Type.String()),
});

const PlayerSnapshotSchema = Type.Object({
  id: Type.String(),
  token: Type.String(),
  name: Type.String(),
  lives: Type.Number(),
  hand: Type.Array(CardSchema),
  connected: Type.Boolean(),
  mustMitgehen: Type.Boolean(),
  folded: Type.Boolean(),
  revealed: Type.Boolean(),
  roundLivesLost: Type.Number(),
  autoKlopfDone: Type.Boolean(),
});

const GameSnapshotSchema = Type.Object({
  state: GameStateSchema,
  players: Type.Array(PlayerSnapshotSchema),
  currentPlayerIndex: Type.Number(),
  currentTrick: Type.Union([TrickSnapshotSchema, Type.Null()]),
  completedTricks: Type.Array(TrickSnapshotSchema),
  trickNumber: Type.Number(),
  klopf: Type.Object({
    active: Type.Boolean(),
    initiator: Type.String(),
    level: Type.Number(),
    participants: Type.Array(Type.String()),
    responses: Entries,
    lastKlopper: Type.String(),
  }),
  roundNumber: Type.Number(),
  stakes: Type.Number(),
  redealCount: Type.Number(),
  redealRequester: Type.String(),
  phaseEndsAt: Type.Union([Type.Number(), Type.Null()]),
  dealingRemainingMs: Type.Union([Type.Number(), Type.Null()]),
  timeouts: Type.Object({
    turnMs: Type.Number(),
    dealingMs: Type.Number(),
    responseMs: Type.Number(),
    lobbyLeaveMs: Type.Number(),
  }),
  lastRoundResults: Type.Optional(Type.Object({
    winnerId: Type.String(),
    results: Type.Array(RoundResultSchema),
  })),
});

export const RoomSnapshotSchema = Type.Object({
  code: Type.String(),
  game: GameSnapshotSchema,
});
export type RoomSnapshot = Static<typeof RoomSnapshotSchema>;

export function toSnapshot(room: RoomData): RoomSnapshot {
  const { turnTimer, phaseTimer, onTimeout, onPhaseExpired, ...game } = room.game;
  return {
    code: room.code,
    game: {
      ...game,
      klopf: { ...game.klopf, responses: [...game.klopf.responses] },
    },
  };
}

export function fromSnapshot(snapshot: RoomSnapshot): RoomData {
  const { game } = snapshot;
  return {
    code: snapshot.code,
    lobbyLeaveTimers: new Map(),
    game: {
      ...game,
      currentTrick: game.currentTrick as TrickState | null,
      completedTricks: game.completedTricks as TrickState[],
      players: game.players.map((p) => ({ ...p, connected: false })),
      klopf: { ...game.klopf, responses: new Map(game.klopf.responses) },
      turnTimer: null,
      phaseTimer: null,
    },
  };
}

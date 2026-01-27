import { Type, type Static } from '@sinclair/typebox';
import { CardSchema } from './card.js';
import { PlayerSchema } from './player.js';
import { GameStateInfoSchema, RoundResultSchema } from './game.js';

// ============================================
// Client -> Server Messages
// ============================================

export const CreateRoomMessage = Type.Object({
  type: Type.Literal('create_room'),
  playerName: Type.String(),
});

export const JoinRoomMessage = Type.Object({
  type: Type.Literal('join_room'),
  roomCode: Type.String(),
  playerName: Type.String(),
});

export const ReconnectMessage = Type.Object({
  type: Type.Literal('reconnect'),
  roomCode: Type.String(),
  playerId: Type.String(),
});

export const StartGameMessage = Type.Object({
  type: Type.Literal('start_game'),
});

export const CloseRoomMessage = Type.Object({
  type: Type.Literal('close_room'),
});

export const PlayCardMessage = Type.Object({
  type: Type.Literal('play_card'),
  cardId: Type.String(),
});

export const KlopfMessage = Type.Object({
  type: Type.Literal('klopf'),
});

export const KlopfResponseMessage = Type.Object({
  type: Type.Literal('klopf_response'),
  mitgehen: Type.Boolean(),
});

export const BlindDreiMessage = Type.Object({
  type: Type.Literal('blind_drei'),
});

export const SetStakesMessage = Type.Object({
  type: Type.Literal('set_stakes'),
  stakes: Type.Number(),
});

export const RequestRedealMessage = Type.Object({
  type: Type.Literal('request_redeal'),
});

export const RedealResponseMessage = Type.Object({
  type: Type.Literal('redeal_response'),
  agree: Type.Boolean(),
});

// Union of all client messages
export const ClientMessageSchema = Type.Union([
  CreateRoomMessage,
  JoinRoomMessage,
  ReconnectMessage,
  StartGameMessage,
  CloseRoomMessage,
  PlayCardMessage,
  KlopfMessage,
  KlopfResponseMessage,
  BlindDreiMessage,
  SetStakesMessage,
  RequestRedealMessage,
  RedealResponseMessage,
]);
export type ClientMessage = Static<typeof ClientMessageSchema>;

// ============================================
// Server -> Client Messages
// ============================================

export const RoomCreatedMessage = Type.Object({
  type: Type.Literal('room_created'),
  roomCode: Type.String(),
  playerId: Type.String(),
});

export const RoomClosedMessage = Type.Object({
  type: Type.Literal('room_closed'),
});

export const PlayerJoinedMessage = Type.Object({
  type: Type.Literal('player_joined'),
  player: PlayerSchema,
});

export const PlayerLeftMessage = Type.Object({
  type: Type.Literal('player_left'),
  playerId: Type.String(),
});

export const GameStartedMessage = Type.Object({
  type: Type.Literal('game_started'),
});

export const CardsDealtMessage = Type.Object({
  type: Type.Literal('cards_dealt'),
  cards: Type.Array(CardSchema),
});

export const CardPlayedMessage = Type.Object({
  type: Type.Literal('card_played'),
  playerId: Type.String(),
  card: CardSchema,
});

export const YourTurnMessage = Type.Object({
  type: Type.Literal('your_turn'),
});

export const KlopfInitiatedMessage = Type.Object({
  type: Type.Literal('klopf_initiated'),
  playerId: Type.String(),
  level: Type.Number(),
});

export const KlopfResponseNeededMessage = Type.Object({
  type: Type.Literal('klopf_response_needed'),
  level: Type.Number(),
});

export const KlopfResolvedMessage = Type.Object({
  type: Type.Literal('klopf_resolved'),
  level: Type.Number(),
});

export const TrickWonMessage = Type.Object({
  type: Type.Literal('trick_won'),
  winnerId: Type.String(),
});

export const RoundEndedMessage = Type.Object({
  type: Type.Literal('round_ended'),
  results: Type.Array(RoundResultSchema),
});

export const GameOverMessage = Type.Object({
  type: Type.Literal('game_over'),
  winnerId: Type.String(),
  perfectWin: Type.Boolean(),
  stakes: Type.Number(),
  winnings: Type.Number(),
});

export const GameStateMessage = Type.Object({
  type: Type.Literal('game_state'),
  state: GameStateInfoSchema,
});

export const ErrorMessage = Type.Object({
  type: Type.Literal('error'),
  error: Type.String(),
});

export const TimerUpdateMessage = Type.Object({
  type: Type.Literal('timer_update'),
  timeLeft: Type.Number(),
});

export const RedealRequestedMessage = Type.Object({
  type: Type.Literal('redeal_requested'),
  playerId: Type.String(),
});

export const RedealResponseNeededMessage = Type.Object({
  type: Type.Literal('redeal_response_needed'),
  redealCount: Type.Number(),
  maxRedeals: Type.Number(),
});

export const RedealPerformedMessage = Type.Object({
  type: Type.Literal('redeal_performed'),
  redealCount: Type.Number(),
  maxRedeals: Type.Number(),
});

export const RedealDeclinedMessage = Type.Object({
  type: Type.Literal('redeal_declined'),
});

// Union of all server messages
export const ServerMessageSchema = Type.Union([
  RoomCreatedMessage,
  RoomClosedMessage,
  PlayerJoinedMessage,
  PlayerLeftMessage,
  GameStartedMessage,
  CardsDealtMessage,
  CardPlayedMessage,
  YourTurnMessage,
  KlopfInitiatedMessage,
  KlopfResponseNeededMessage,
  KlopfResolvedMessage,
  TrickWonMessage,
  RoundEndedMessage,
  GameOverMessage,
  GameStateMessage,
  ErrorMessage,
  TimerUpdateMessage,
  RedealRequestedMessage,
  RedealResponseNeededMessage,
  RedealPerformedMessage,
  RedealDeclinedMessage,
]);
export type ServerMessage = Static<typeof ServerMessageSchema>;

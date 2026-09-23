import type { KlopfState as KlopfStateInfo } from '@klopf/shared';
import type { KlopfData } from './types.js';

export const KlopfErrors = {
  CANNOT_KLOPF_TWICE: 'Cannot klopf twice in a row',
  MUST_MITGEHEN: 'Player must mitgehen (1 life)',
  ALREADY_RESPONDED: 'Player has already responded',
  NOT_IN_KLOPF: 'No active klopf',
} as const;

export function createKlopfData(): KlopfData {
  return {
    active: false,
    initiator: '',
    level: 0,
    participants: [],
    responses: new Map(),
    lastKlopper: '',
  };
}

export function resetKlopf(klopf: KlopfData): void {
  klopf.active = false;
  klopf.initiator = '';
  klopf.level = 0;
  klopf.participants = [];
  klopf.responses = new Map();
  klopf.lastKlopper = '';
}

export function initiateKlopf(klopf: KlopfData, playerId: string): string | null {
  if (klopf.lastKlopper === playerId) {
    return KlopfErrors.CANNOT_KLOPF_TWICE;
  }

  klopf.active = true;
  klopf.initiator = playerId;
  klopf.level++;
  klopf.responses = new Map();
  klopf.lastKlopper = playerId;
  klopf.participants = [playerId];

  return null;
}

export function respondKlopf(
  klopf: KlopfData,
  playerId: string,
  mitgehen: boolean,
  mustMitgehen: boolean,
): string | null {
  if (!klopf.active) return KlopfErrors.NOT_IN_KLOPF;
  if (klopf.responses.has(playerId)) return KlopfErrors.ALREADY_RESPONDED;
  if (mustMitgehen && !mitgehen) return KlopfErrors.MUST_MITGEHEN;

  klopf.responses.set(playerId, mitgehen);
  if (mitgehen) {
    klopf.participants.push(playerId);
  }

  return null;
}

export function allKlopfResponded(klopf: KlopfData, playerIds: string[]): boolean {
  for (const id of playerIds) {
    if (id === klopf.initiator) continue;
    if (!klopf.responses.has(id)) return false;
  }
  return true;
}

export function getDeclinePenalty(klopf: KlopfData): number {
  return klopf.level;
}

export function getLosePenalty(klopf: KlopfData): number {
  return 1 + klopf.level;
}

export function toKlopfStateInfo(
  klopf: KlopfData,
  activePlayers: { id: string; name: string }[],
): KlopfStateInfo {
  return {
    active: klopf.active,
    initiator: klopf.initiator,
    level: klopf.level,
    participants: [...klopf.participants],
    lastKlopper: klopf.lastKlopper,
    responses: activePlayers
      .filter((p) => p.id !== klopf.initiator)
      .map((p) => ({
        playerId: p.id,
        playerName: p.name,
        mitgehen: klopf.responses.get(p.id) ?? null,
      })),
  };
}

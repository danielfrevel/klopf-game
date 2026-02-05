import type { KlopfState as KlopfStateInfo } from '@klopf/shared';

// Error messages for klopf operations
export const KlopfErrors = {
  CANNOT_KLOPF_TWICE: 'Cannot klopf twice in a row',
  KLOPF_ALREADY_ACTIVE: 'Klopf is already active',
  MUST_MITGEHEN: 'Player must mitgehen (1 life)',
  ALREADY_RESPONDED: 'Player has already responded',
  NOT_IN_KLOPF: 'No active klopf',
  KLOPF_LIMIT_EXCEEDED: 'Klopf level would exceed lives + 1',
} as const;

export class KlopfState {
  active: boolean = false;
  initiator: string = '';
  level: number = 0;
  participants: string[] = []; // Players who are still in (mitgegangen)
  responses: Map<string, boolean> = new Map(); // true = mitgehen, false = not mitgehen
  lastKlopper: string = ''; // Cannot klopf twice in a row

  // Reset for a new round (keeps lastKlopper)
  reset(): void {
    this.active = false;
    this.initiator = '';
    this.level = 0;
    this.participants = [];
    this.responses = new Map();
    // lastKlopper persists across rounds
  }

  // Reset for a new game (clears everything)
  resetForNewGame(): void {
    this.reset();
    this.lastKlopper = '';
  }

  // Initiate a new klopf or counter-klopf
  initiate(playerId: string): string | null {
    if (this.lastKlopper === playerId) {
      return KlopfErrors.CANNOT_KLOPF_TWICE;
    }

    this.active = true;
    this.initiator = playerId;
    this.level++;
    this.responses = new Map();
    this.lastKlopper = playerId;

    // Reset participants and add initiator
    this.participants = [playerId];

    return null;
  }

  // Record a player's response to the klopf
  respond(playerId: string, mitgehen: boolean, mustMitgehen: boolean): string | null {
    if (!this.active) {
      return KlopfErrors.NOT_IN_KLOPF;
    }

    if (this.responses.has(playerId)) {
      return KlopfErrors.ALREADY_RESPONDED;
    }

    if (mustMitgehen && !mitgehen) {
      return KlopfErrors.MUST_MITGEHEN;
    }

    this.responses.set(playerId, mitgehen);

    if (mitgehen) {
      this.participants.push(playerId);
    }

    return null;
  }

  // Check if all players have responded
  allResponded(playerIds: string[]): boolean {
    for (const id of playerIds) {
      if (id === this.initiator) continue; // Initiator doesn't need to respond
      if (!this.responses.has(id)) return false;
    }
    return true;
  }

  // Get the life penalty for losing this klopf
  getPenalty(): number {
    return 1 + this.level;
  }

  // Check if a player is participating in the klopf
  isParticipant(playerId: string): boolean {
    return this.participants.includes(playerId);
  }

  // Convert to KlopfStateInfo for broadcasting
  toKlopfStateInfo(): KlopfStateInfo {
    return {
      active: this.active,
      initiator: this.initiator,
      level: this.level,
      participants: [...this.participants],
    };
  }
}

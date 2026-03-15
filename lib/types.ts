export type Element = 'fire' | 'water' | 'grass' | 'rock' | 'electric' | 'ice';

export interface Card {
  id: string;
  name: string;
  element: Element;
  attack: number;
  defense: number;
  speed: number;
}

export interface RoundResult {
  round: 1 | 2 | 3;
  primaryAttr: 'attack' | 'defense' | 'speed';
  creatorCardId: string;
  opponentCardId: string;
  creatorFinalAttack: number;
  creatorFinalDefense: number;
  creatorFinalSpeed: number;
  opponentFinalAttack: number;
  opponentFinalDefense: number;
  opponentFinalSpeed: number;
  creatorWinsAttack: boolean;
  creatorWinsDefense: boolean;
  creatorWinsSpeed: boolean;
  creatorHasAdvantage: boolean;
  opponentHasAdvantage: boolean;
  winner: 'creator' | 'opponent' | 'draw';
}

export type BetStatus = 'open' | 'in_progress' | 'finished';

export interface Bet {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorCards: [string, string, string];
  betAmount: number;
  status: BetStatus;
  createdAt: number;
  opponentId?: string;
  opponentName?: string;
  opponentCards?: [string, string, string];
  roundResults?: RoundResult[];
  winnerId?: string;
  winnerName?: string;
}

export interface User {
  id: string;
  name: string;
  balance: number;
}

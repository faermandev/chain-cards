import { Card, Element, RoundResult } from './types';

// Each element is strong against 2 others (×1.5 to primary stat)
// Fire   > Grass, Ice
// Water  > Fire, Rock
// Grass  > Water, Rock
// Rock   > Fire, Electric
// Electric > Water, Ice
// Ice    > Grass, Electric
const ADVANTAGE: Record<Element, Element[]> = {
  fire:     ['grass', 'ice'],
  water:    ['fire',  'rock'],
  grass:    ['water', 'rock'],
  rock:     ['fire',  'electric'],
  electric: ['water', 'ice'],
  ice:      ['grass', 'electric'],
};

export function hasElementAdvantage(attacker: Element, defender: Element): boolean {
  return ADVANTAGE[attacker].includes(defender);
}

export function resolveRound(
  creatorCard: Card,
  opponentCard: Card,
  round: 1 | 2 | 3
): RoundResult {
  const primaryAttr = round === 1 ? 'attack' : round === 2 ? 'defense' : 'speed';

  const creatorHasAdvantage = hasElementAdvantage(creatorCard.element, opponentCard.element);
  const opponentHasAdvantage = hasElementAdvantage(opponentCard.element, creatorCard.element);

  let cAtk = creatorCard.attack;
  let cDef = creatorCard.defense;
  let cSpd = creatorCard.speed;
  let oAtk = opponentCard.attack;
  let oDef = opponentCard.defense;
  let oSpd = opponentCard.speed;

  if (creatorHasAdvantage) {
    if (primaryAttr === 'attack') cAtk = Math.floor(cAtk * 1.5);
    if (primaryAttr === 'defense') cDef = Math.floor(cDef * 1.5);
    if (primaryAttr === 'speed') cSpd = Math.floor(cSpd * 1.5);
  }
  if (opponentHasAdvantage) {
    if (primaryAttr === 'attack') oAtk = Math.floor(oAtk * 1.5);
    if (primaryAttr === 'defense') oDef = Math.floor(oDef * 1.5);
    if (primaryAttr === 'speed') oSpd = Math.floor(oSpd * 1.5);
  }

  const creatorWinsAttack = cAtk > oAtk;
  const creatorWinsDefense = cDef > oDef;
  const creatorWinsSpeed = cSpd > oSpd;

  const creatorAttrWins =
    (creatorWinsAttack ? 1 : 0) +
    (creatorWinsDefense ? 1 : 0) +
    (creatorWinsSpeed ? 1 : 0);
  const opponentAttrWins =
    (cAtk < oAtk ? 1 : 0) +
    (cDef < oDef ? 1 : 0) +
    (cSpd < oSpd ? 1 : 0);

  let winner: 'creator' | 'opponent' | 'draw';
  if (creatorAttrWins > opponentAttrWins) {
    winner = 'creator';
  } else if (opponentAttrWins > creatorAttrWins) {
    winner = 'opponent';
  } else {
    // Tiebreak: sum of all final stats
    const cTotal = cAtk + cDef + cSpd;
    const oTotal = oAtk + oDef + oSpd;
    if (cTotal > oTotal) winner = 'creator';
    else if (oTotal > cTotal) winner = 'opponent';
    else winner = 'draw';
  }

  return {
    round,
    primaryAttr,
    creatorCardId: creatorCard.id,
    opponentCardId: opponentCard.id,
    creatorFinalAttack: cAtk,
    creatorFinalDefense: cDef,
    creatorFinalSpeed: cSpd,
    opponentFinalAttack: oAtk,
    opponentFinalDefense: oDef,
    opponentFinalSpeed: oSpd,
    creatorWinsAttack,
    creatorWinsDefense,
    creatorWinsSpeed,
    creatorHasAdvantage,
    opponentHasAdvantage,
    winner,
  };
}

export function resolveMatch(roundResults: RoundResult[]): 'creator' | 'opponent' | 'draw' {
  const creatorRoundWins = roundResults.filter((r) => r.winner === 'creator').length;
  const opponentRoundWins = roundResults.filter((r) => r.winner === 'opponent').length;

  if (creatorRoundWins > opponentRoundWins) return 'creator';
  if (opponentRoundWins > creatorRoundWins) return 'opponent';
  return 'draw';
}

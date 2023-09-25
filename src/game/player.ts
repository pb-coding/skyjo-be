import { Card, ObfuscatedCard } from "./card";

export type ObfuscatedPlayer = {
  id: number;
  socketId: string;
  name: string;
  cards: ObfuscatedCard[];
  knownCardPositions: boolean[];
  playersTurn: boolean;
  cardCache: Card | null;
  tookDispiledCard: boolean;
  roundPoints: number;
  totalPoints: number;
  closedRound: boolean;
};

type ColumnPosition = [number, number, number];

type ThreeOfAKind = {
  position: ColumnPosition;
  value: number;
};

const COLUMN_POSITIONS: ColumnPosition[] = [
  [0, 4, 8],
  [1, 5, 9],
  [2, 6, 10],
  [3, 7, 11],
];

export class Player {
  id: number;
  socketId: string;
  name: string;
  cards: Card[];
  knownCardPositions: boolean[];
  playersTurn: boolean;
  cardCache: Card | null; // this is where the card is temporarily stored when a player draws a card
  tookDispiledCard: boolean; // this is used to check if a player took a dispiled card in the current turn
  roundPoints: number;
  totalPoints: number;
  closedRound: boolean;
  place: number | null; // indicates the place the player got in the last round
  constructor(id: number, socketId: string, name: string, cards: Card[]) {
    this.id = id;
    this.socketId = socketId;
    this.name = name;
    this.cards = cards;
    this.knownCardPositions = new Array(12).fill(false);
    this.playersTurn = true;
    this.cardCache = null;
    this.tookDispiledCard = false;
    this.roundPoints = 0;
    this.totalPoints = 0;
    this.closedRound = false;
    this.place = null;
  }

  hasInitialCardsRevealed(): boolean {
    const revealedCards = this.knownCardPositions.filter(
      (knownCard) => knownCard === true
    );
    if (revealedCards.length > 1) return true;
    else return false;
  }

  getRevealedCardCount(): number {
    return this.knownCardPositions.filter((position) => position).length;
  }

  getThreeOfAKinds(): ThreeOfAKind[] {
    const revealedCardPositions = this.getRevealedCardPositions();
    const columns: ColumnPosition[] = COLUMN_POSITIONS;
    const threeOfAKinds: ThreeOfAKind[] = [];
    columns.forEach((column) => {
      const columnValues = column.map((position) => this.cards[position].value);
      const columnHasSameValues = columnValues.every(
        (value) => value === columnValues[0]
      );
      const columnIsRevealed = column.every((position) =>
        revealedCardPositions.includes(position)
      );
      if (columnHasSameValues && columnIsRevealed) {
        threeOfAKinds.push({
          position: column,
          value: columnValues[0],
        });
      }
    });
    return threeOfAKinds;
  }

  getRevealedCardPositions(): number[] {
    const revealedCardPositions: number[] = [];
    this.knownCardPositions.forEach((position, index) => {
      if (position) revealedCardPositions.push(index);
    });
    return revealedCardPositions;
  }

  getRevealedCards(): Card[] {
    const revealedCards: Card[] = [];
    this.knownCardPositions.forEach((position, index) => {
      if (position) revealedCards.push(this.cards[index]);
    });
    return revealedCards;
  }

  getRevealedCardsValueSum(): number {
    const revealedCards = this.getRevealedCards();
    const revealedCardsValueSum = revealedCards.reduce(
      (sum, card) => sum + card.value,
      0
    );
    return revealedCardsValueSum;
  }

  getHighestRevealedCardValue(): number {
    const revealedCards = this.getRevealedCards();
    const highestRevealedCardValue = revealedCards.reduce(
      (highestValue, card) => {
        if (card.value > highestValue) return card.value;
        else return highestValue;
      },
      0
    );
    return highestRevealedCardValue;
  }
}

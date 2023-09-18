import { Card, ObfuscatedCard } from "./card";

export type ObfuscatedPlayer = {
  id: number;
  socketId: string;
  name: string;
  cards: ObfuscatedCard[];
  knownCardPositions: boolean[];
  playersTurn: boolean;
  cardCache: Card | null;
};

export class Player {
  id: number;
  socketId: string;
  name: string;
  cards: Card[];
  knownCardPositions: boolean[];
  playersTurn: boolean;
  cardCache: Card | null; // this is where the card is temporarily stored when a player draws a card
  constructor(id: number, socketId: string, name: string, cards: Card[]) {
    this.id = id;
    this.socketId = socketId;
    this.name = name;
    this.cards = cards;
    this.knownCardPositions = new Array(12).fill(false);
    this.playersTurn = true;
    this.cardCache = null;
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

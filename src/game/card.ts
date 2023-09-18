type CardValue = -2 | -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type ObfuscatedCardValue = CardValue | "X";

type CardColor =
  | "darkblue"
  | "lightblue"
  | "green"
  | "yellow"
  | "red"
  | "black";

// TODO: use smarter types like Omit<>, Pick<>, etc.
export type ObfuscatedCard = {
  id: number;
  name: string;
  value: ObfuscatedCardValue;
  color: CardColor;
};

export class Card {
  id: number;
  name: string;
  value: CardValue;
  color: CardColor;
  constructor(id: number, value: CardValue) {
    this.id = id;
    this.value = value;
    this.name = `${value} Card`;
    this.color = this.matchColorToCardValue(value);
  }

  matchColorToCardValue(value: CardValue | ObfuscatedCardValue): CardColor {
    switch (value) {
      case -2:
        return "darkblue";
      case -1:
        return "darkblue";
      case 0:
        return "lightblue";
      case 1:
        return "green";
      case 2:
        return "green";
      case 3:
        return "green";
      case 4:
        return "green";
      case 5:
        return "yellow";
      case 6:
        return "yellow";
      case 7:
        return "yellow";
      case 8:
        return "yellow";
      case 9:
        return "red";
      case 10:
        return "red";
      case 11:
        return "red";
      case 12:
        return "red";
      case "X":
        return "black";
      default:
        return "red";
    }
  }
}

export type ObfuscatedCardStack = {
  cards: ObfuscatedCard[];
};

export class CardStack {
  cards: Card[];
  constructor() {
    this.cards = [];
    this.generateCards();
  }

  generateCards() {
    for (let cardNumber = 1; cardNumber <= 150; cardNumber++) {
      if (cardNumber <= 5) {
        this.cards.push(new Card(cardNumber, -2));
        continue;
      }

      if (cardNumber > 5 && cardNumber <= 15) {
        this.cards.push(new Card(cardNumber, -1));
        continue;
      }

      if (cardNumber > 15 && cardNumber <= 30) {
        this.cards.push(new Card(cardNumber, 0));
        continue;
      }

      if (cardNumber > 30 && cardNumber <= 40) {
        this.cards.push(new Card(cardNumber, 1));
        continue;
      }

      if (cardNumber > 40 && cardNumber <= 50) {
        this.cards.push(new Card(cardNumber, 2));
        continue;
      }

      if (cardNumber > 50 && cardNumber <= 60) {
        this.cards.push(new Card(cardNumber, 3));
        continue;
      }

      if (cardNumber > 60 && cardNumber <= 70) {
        this.cards.push(new Card(cardNumber, 4));
        continue;
      }

      if (cardNumber > 70 && cardNumber <= 80) {
        this.cards.push(new Card(cardNumber, 5));
        continue;
      }

      if (cardNumber > 80 && cardNumber <= 90) {
        this.cards.push(new Card(cardNumber, 6));
        continue;
      }

      if (cardNumber > 90 && cardNumber <= 100) {
        this.cards.push(new Card(cardNumber, 7));
        continue;
      }

      if (cardNumber > 100 && cardNumber <= 110) {
        this.cards.push(new Card(cardNumber, 8));
        continue;
      }

      if (cardNumber > 110 && cardNumber <= 120) {
        this.cards.push(new Card(cardNumber, 9));
        continue;
      }

      if (cardNumber > 120 && cardNumber <= 130) {
        this.cards.push(new Card(cardNumber, 10));
        continue;
      }

      if (cardNumber > 130 && cardNumber <= 140) {
        this.cards.push(new Card(cardNumber, 11));
        continue;
      }

      if (cardNumber > 140 && cardNumber <= 150) {
        this.cards.push(new Card(cardNumber, 12));
        continue;
      }
    }
  }

  // Fisher-Yates shuffle algorithm
  shuffleCards() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
}

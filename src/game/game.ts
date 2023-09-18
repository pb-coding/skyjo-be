import { Player, ObfuscatedPlayer } from "./player";
import { CardStack } from "./card";
import { Card, ObfuscatedCardStack } from "./card";
import { Socket } from "socket.io";
import { io } from "../server";

type PlayerSocketSet = Set<string>;

type PlayerActions = Array<
  [string, (playerSocketId: string, data: any) => void]
>;

// obfuscated types are used to send only necessary data to the client
export type ObfuscatedGame = {
  sessionId: string;
  playerCount: number;
  players: ObfuscatedPlayer[];
  cardStack: ObfuscatedCardStack;
  discardPile: Card[];
  phase: string;
};

const gamePhase = {
  revealTwoCards: "reveal two cards",
  pickUpCard: "pick up card",
  placeCard: "place card",
  revealCard: "reveal card",
  revealedLastCard: "revealed last card",
  gameEnded: "game ended",
};

export class Game {
  socket: Socket;
  sessionId: string;
  playerCount: number;
  players: Player[];
  cardStack: CardStack;
  discardPile: Card[];
  phase: string;

  constructor(socket: Socket, sessionId: string, playerIds: PlayerSocketSet) {
    this.socket = socket;
    this.sessionId = sessionId;

    this.cardStack = new CardStack();
    this.cardStack.shuffleCards();

    this.playerCount = playerIds.size;
    this.players = this.initializePlayers(playerIds, this.cardStack);

    // get the first card from the cardStack and put it in the discard pile
    this.discardPile = [this.cardStack.cards.pop()!];
    this.phase = gamePhase.revealTwoCards;

    console.log(`New Game created with ${this.playerCount} players!`);
    this.gameLoop();
  }

  initializePlayers(
    playerIds: PlayerSocketSet,
    cardStack: CardStack
  ): Player[] {
    let players: Player[] = [];

    let index = 0;
    playerIds.forEach((socketId) => {
      index++;
      const playerCards = cardStack.cards.splice(0, 12);
      const player = new Player(
        index,
        socketId,
        `Player ${index}`,
        playerCards
      );
      players.push(player);
    });

    this.cardStack = cardStack;

    return players;
  }

  async gameLoop() {
    console.log("Game started!");
    while (this.phase !== gamePhase.gameEnded) {
      switch (this.phase) {
        case gamePhase.revealTwoCards:
          console.log("Game phase: revealTwoCards");
          this.listPlayerSocketListeners();
          await this.revealInitialCards();
          this.phase = gamePhase.pickUpCard;
          break;
        case gamePhase.pickUpCard:
          console.log("Game phase: pickUpCard");
          this.listPlayerSocketListeners();
          await this.pickUpCard();
          this.phase = gamePhase.placeCard;
          break;
        case gamePhase.placeCard:
          console.log("Game phase: placeCard");
          this.listPlayerSocketListeners();
          await this.placeCard();
          break;
        case gamePhase.revealCard:
          console.log("Game phase: revealCard");
          this.listPlayerSocketListeners();
          await this.revealCard();
          this.phase = gamePhase.pickUpCard;
        case gamePhase.revealedLastCard:
          console.log("Game phase: revealedLastCard");
          // add logic of last round
          this.phase = gamePhase.gameEnded;
          break;
        default:
          throw new Error(`Invalid game phase: ${this.phase}`);
      }
    }
  }

  getPlayersWithRevealedInitialCards(): Player[] {
    return this.players.filter((player) => {
      return player.hasInitialCardsRevealed();
    });
  }

  allPlayersRevealedInitialCards() {
    const playersWithRevealedInitialCards =
      this.getPlayersWithRevealedInitialCards();
    return playersWithRevealedInitialCards.length === this.playerCount;
  }

  setInitialPlayersTurn() {
    const playersWithHighestRevealedCardsValueSum = this.players.reduce(
      (playersWithHighestRevealedCardsValueSum, player) => {
        if (
          player.getRevealedCardsValueSum() ===
          playersWithHighestRevealedCardsValueSum[0].getRevealedCardsValueSum()
        ) {
          if (
            player.getHighestRevealedCardValue() >
            playersWithHighestRevealedCardsValueSum[0].getHighestRevealedCardValue()
          ) {
            playersWithHighestRevealedCardsValueSum = [player];
          } else if (
            player.getHighestRevealedCardValue() ===
            playersWithHighestRevealedCardsValueSum[0].getHighestRevealedCardValue()
          ) {
            playersWithHighestRevealedCardsValueSum.push(player);
          }
        } else if (
          player.getRevealedCardsValueSum() >
          playersWithHighestRevealedCardsValueSum[0].getRevealedCardsValueSum()
        ) {
          playersWithHighestRevealedCardsValueSum = [player];
        }
        return playersWithHighestRevealedCardsValueSum;
      },
      [this.players[0]]
    );

    const playerWithHighestRevealedCardsValueSum =
      playersWithHighestRevealedCardsValueSum[
        Math.floor(
          Math.random() * playersWithHighestRevealedCardsValueSum.length
        )
      ];

    this.players.forEach((player) => {
      if (player === playerWithHighestRevealedCardsValueSum) {
        player.playersTurn = true;
      } else {
        player.playersTurn = false;
      }
    });
  }

  nextPlayersTurn() {
    const playersTurn = this.players.find((player) => player.playersTurn);
    const playersTurnIndex = this.players.indexOf(playersTurn!);
    const nextPlayersTurnIndex = (playersTurnIndex + 1) % this.playerCount;
    this.players[playersTurnIndex].playersTurn = false;
    this.players[nextPlayersTurnIndex].playersTurn = true;
  }

  getPlayerBySocketId(playerSocketId: string): Player | undefined {
    return this.players.find((player) => player.socketId === playerSocketId);
  }

  revealCardAction(playerSocketId: string, cardPosition: number) {
    const player = this.getPlayerBySocketId(playerSocketId)!; // TODO: handle player not found
    const revealedCard = player.cards[cardPosition];
    console.log(`Revealed card ${revealedCard} at position ${cardPosition}`);
    const playerIndex = this.players.indexOf(player!);
    this.players[playerIndex].knownCardPositions[cardPosition] = true;
    this.sendObfuscatedGameUpdate();
  }

  async revealInitialCards() {
    while (!this.allPlayersRevealedInitialCards()) {
      const playersWithRevealedInitialCards =
        this.getPlayersWithRevealedInitialCards();
      const playersWithUnrevealedInitialCards = this.players.filter(
        (player) => !playersWithRevealedInitialCards.includes(player)
      );
      const playersSocketIds = playersWithUnrevealedInitialCards.map(
        (player) => player.socketId
      );
      await this.waitForPlayerActions(
        [["click-card", this.revealCardAction.bind(this)]],
        playersSocketIds
      );
    }
    this.setInitialPlayersTurn();
  }

  drawCardAction(playerSocketId: string, data: any) {
    const player = this.getPlayerBySocketId(playerSocketId)!; // TODO: handle player not found
    console.log(`Player ${player.name} drawed a card.`);
    const drawnCard = this.cardStack.cards.pop()!;
    player.cardCache = drawnCard;
    this.sendObfuscatedGameUpdate();
  }

  takeDiscardPileAction(playerSocketId: string, data: any) {
    const player = this.getPlayerBySocketId(playerSocketId)!; // TODO: handle player not found
    console.log(`Player ${player.name} took the card from discard pile.`);
    const discardPileCard = this.discardPile.pop()!;
    player.cardCache = discardPileCard;
    this.sendObfuscatedGameUpdate();
  }

  discardCardToPileAction(playerSocketId: string, data: any) {
    const player = this.getPlayerBySocketId(playerSocketId)!; // TODO: handle player not found
    console.log(`Player ${player.name} discarded a card to the pile.`);
    const discardedCard = player.cardCache!;
    this.discardPile.push(discardedCard);
    player.cardCache = null;
    this.sendObfuscatedGameUpdate();
    this.phase = gamePhase.revealCard;
  }

  placeCardAction(playerSocketId: string, cardPosition: number) {
    const player = this.getPlayerBySocketId(playerSocketId)!; // TODO: handle player not found
    console.log(`Player ${player.name} placed a card.`);
    const placedCard = player.cardCache!;
    player.cardCache = null;
    const replacedCard = player.cards[cardPosition];
    this.discardPile.push(replacedCard);
    player.cards[cardPosition] = placedCard;
    player.knownCardPositions[cardPosition] = true;
    this.nextPlayersTurn();
    this.phase = gamePhase.pickUpCard;
    this.sendObfuscatedGameUpdate();
  }

  async pickUpCard() {
    const playersTurn = this.players.find((player) => player.playersTurn);
    console.log(`Waiting for ${playersTurn?.name} to pick up card`);
    await this.waitForPlayerActions(
      [
        ["draw-from-card-stack", this.drawCardAction.bind(this)],
        ["click-discard-pile", this.takeDiscardPileAction.bind(this)],
      ],
      [playersTurn!.socketId]
    );
  }

  async placeCard(tookDiscardPileCard: boolean = false) {
    console.log("Waiting for player to place card");
    const playersTurn = this.players.find((player) => player.playersTurn);
    const allowedActions: PlayerActions = [
      ["click-card", this.placeCardAction.bind(this)],
    ];
    if (!tookDiscardPileCard) {
      allowedActions.push([
        "click-discard-pile",
        this.discardCardToPileAction.bind(this),
      ]);
    }
    await this.waitForPlayerActions(allowedActions, [playersTurn!.socketId]);
  }

  async revealCard() {
    console.log("Waiting for player to reveal a card");
    const playersTurn = this.players.find((player) => player.playersTurn);
    await this.waitForPlayerActions(
      [["click-card", this.revealCardAction.bind(this)]],
      [playersTurn!.socketId]
    );
    this.nextPlayersTurn();
  }

  waitForPlayerActions(
    expectedActions: PlayerActions,
    expectedFrom: Player["socketId"][]
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const eventListeners: Array<(playerSocketId: string, data: any) => void> =
        [];
      expectedFrom.forEach((playerSocketId) => {
        const playerSocket = io.sockets.sockets.get(playerSocketId);
        if (playerSocket) {
          expectedActions.forEach((expectedAction) => {
            const [actionName, processAction] = expectedAction;
            const eventListener = (data: any) => {
              console.log(`Received ${actionName} from ${playerSocketId}`);
              processAction(playerSocketId, data);
              // remove current and event listeners of alternative expected actions
              eventListeners.forEach((eventListener) => {
                playerSocket.off(actionName, eventListener);
              });
              resolve(data);
            };
            playerSocket.on(actionName, eventListener);
            eventListeners.push(eventListener);
          });
        } else {
          // TODO: handle error
        }
      });
    });
  }

  sendObfuscatedGameUpdate() {
    // console.trace("sendObfuscatedGameUpdate");
    const obfuscatedGame: ObfuscatedGame = {
      sessionId: this.sessionId,
      playerCount: this.playerCount,
      players: this.players.map((player: Player) => {
        return {
          id: player.id,
          socketId: player.socketId,
          name: player.name,
          cards: player.cards.map((card: Card, index: number) => {
            // unknown cards are obfuscated to 0
            return {
              id: player.knownCardPositions[index] ? card.id : 0,
              value: player.knownCardPositions[index] ? card.value : "X",
              name: player.knownCardPositions[index]
                ? card.name
                : "Facedown Card",
              color: player.knownCardPositions[index] ? card.color : "black",
              matchColorToCardValue: card.matchColorToCardValue,
            };
          }),
          knownCardPositions: player.knownCardPositions,
          playersTurn: player.playersTurn,
          cardCache: player.cardCache,
        };
      }),
      cardStack: {
        cards: this.cardStack.cards.map((card: Card) => {
          // player may not see the value of the facedown cards in the cardStack
          return {
            id: 0,
            value: "X",
            name: "Facedown Card",
            color: "black",
          };
        }),
      },
      discardPile: this.discardPile,
      phase: this.phase,
    };
    console.log("Sending game update");
    io.to(this.sessionId).emit("game-update", obfuscatedGame);
  }

  listPlayerSocketListeners() {
    console.log("Player socket listeners:");
    io.sockets.sockets.forEach((socket) => {
      console.log(socket.id);
      socket.eventNames().forEach((eventName) => {
        console.log(`${eventName.toString()}`);
      });
    });
  }
}

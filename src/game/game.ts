import { Player, ObfuscatedPlayer } from "./player";
import { CardStack } from "./card";
import { Card, ObfuscatedCardStack } from "./card";
import { Socket } from "socket.io";
import { io } from "../server";

type PlayerSocketSet = Set<string>;

type PlayerActionEventName = string;
type PlayerActionCallback = (playerSocketId: string, data: any) => void;

type ExpectedPlayerActions = Array<
  [PlayerActionEventName, PlayerActionCallback]
>;

type PlayerAction<ActionDataType> = {
  playerSocketId: string;
  data: ActionDataType;
};

type CardPosition = number;

// obfuscated types are used to send only necessary data to the client
export type ObfuscatedGame = {
  sessionId: string;
  playerCount: number;
  players: ObfuscatedPlayer[];
  cardStack: ObfuscatedCardStack;
  discardPile: Card[];
  phase: string;
  round: number;
};

const gamePhase = {
  newRound: "new round",
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
  round: number;

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
    this.round = 1;

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

  initializeNewRound(startOver: boolean = false) {
    this.round = startOver ? 1 : this.round + 1;
    this.cardStack = new CardStack();
    this.cardStack.shuffleCards();
    this.players.forEach((player) => {
      player.cards = this.cardStack.cards.splice(0, 12);
      player.knownCardPositions = new Array(12).fill(false);
      player.playersTurn = false;
      player.cardCache = null;
      player.tookDispiledCard = false;
      player.roundPoints = 0;
      player.totalPoints = startOver ? 0 : player.totalPoints;
      player.closedRound = false;
    });
    this.discardPile = [this.cardStack.cards.pop()!];
    this.phase = gamePhase.revealTwoCards;
  }

  async gameLoop() {
    console.log("Game started!");
    while (this.phase !== gamePhase.gameEnded) {
      this.checkForFullRevealedCards();
      switch (this.phase) {
        case gamePhase.revealTwoCards:
          console.log("\nGame phase: revealTwoCards");
          await this.revealInitialCards();
          break;
        case gamePhase.pickUpCard:
          console.log("\nGame phase: pickUpCard");
          await this.pickUpCard();
          break;
        case gamePhase.placeCard:
          console.log("\nGame phase: placeCard");
          await this.placeCard();
          break;
        case gamePhase.revealCard:
          console.log("\nGame phase: revealCard");
          await this.revealCard();
          break;
        case gamePhase.revealedLastCard:
          console.log("\nGame phase: revealedLastCard");
          await this.revealedLastCard();
          break;
        case gamePhase.newRound:
          console.log("\nGame phase: newRound");
          await this.nextRound();
          break;
        default:
          throw new Error(`Invalid game phase: ${this.phase}`);
      }
    }
  }

  // Game Phases

  async revealInitialCards() {
    this.sendMessageToAllPlayers("Reveal two cards");
    while (!this.allPlayersRevealedInitialCards()) {
      const playersWithRevealedInitialCards =
        this.getPlayersWithRevealedInitialCards();
      const playersWithUnrevealedInitialCards = this.players.filter(
        (player) => !playersWithRevealedInitialCards.includes(player)
      );
      const playersSocketIds = playersWithUnrevealedInitialCards.map(
        (player) => player.socketId
      );
      await this.waitForPlayerActions<CardPosition>(
        [["click-card", this.revealCardAction.bind(this)]],
        playersSocketIds
      );
    }
    this.setInitialPlayersTurn();
    this.phase = gamePhase.pickUpCard;
    this.sendObfuscatedGameUpdate();
  }

  async pickUpCard() {
    const playerOnTurn = this.getPlayersTurn();
    if (playerOnTurn.closedRound) {
      this.phase = gamePhase.revealedLastCard;
      this.sendObfuscatedGameUpdate();
      return;
    }
    this.sendMessageToAllPlayers(
      `Waiting for ${playerOnTurn.name} to pick up card`
    );
    await this.waitForPlayerActions(
      [
        ["draw-from-card-stack", this.drawCardAction.bind(this)],
        ["click-discard-pile", this.takeDiscardPileAction.bind(this)],
      ],
      [playerOnTurn.socketId]
    );
    this.phase = gamePhase.placeCard;
    this.sendObfuscatedGameUpdate();
  }

  async placeCard() {
    const playerOnTurn = this.getPlayersTurn();
    this.sendMessageToAllPlayers(
      `Waiting for ${playerOnTurn.name} to place card`
    );

    const expectedActions: ExpectedPlayerActions = [
      ["click-card", this.placeCardAction.bind(this)],
    ];
    if (!playerOnTurn.tookDispiledCard) {
      expectedActions.push([
        "click-discard-pile",
        this.discardCardToPileAction.bind(this),
      ]);
    }
    playerOnTurn.tookDispiledCard = false;
    await this.waitForPlayerActions(expectedActions, [playerOnTurn.socketId]);
    this.sendObfuscatedGameUpdate();
  }

  async revealCard() {
    const playerOnTurn = this.getPlayersTurn();
    this.sendMessageToAllPlayers(
      `Waiting for ${playerOnTurn.name} to reveal a card`
    );

    const numberOfRevealedCards = playerOnTurn.getRevealedCardCount();
    // ensures that the player does not select an already revealed card
    while (playerOnTurn.getRevealedCardCount() <= numberOfRevealedCards) {
      await this.waitForPlayerActions(
        [["click-card", this.revealCardAction.bind(this)]],
        [playerOnTurn.socketId]
      );
    }
    this.nextPlayersTurn();
    this.phase = gamePhase.pickUpCard;
    this.sendObfuscatedGameUpdate();
  }

  async revealedLastCard() {
    this.revealAllCards();
    this.evaluateAndSavePoints();
    this.phase = gamePhase.newRound;
    this.sendObfuscatedGameUpdate();
    this.sendMessageToAllPlayers("Waiting for next round");
  }

  async nextRound() {
    const playerSocketIds = this.players.map((player) => player.socketId);
    await this.waitForPlayerActions(
      [["next-round", this.nextRoundAction.bind(this)]],
      playerSocketIds
    );
  }

  // Player Action Callbacks

  revealCardAction(playerSocketId: string, cardPosition: number) {
    const player = this.getPlayerBySocketId(playerSocketId);
    const revealedCard = player.cards[cardPosition];
    console.log(`Revealed card ${revealedCard} at position ${cardPosition}`);
    const playerIndex = this.players.indexOf(player!);
    this.players[playerIndex].knownCardPositions[cardPosition] = true;
    this.sendObfuscatedGameUpdate();
  }

  drawCardAction(playerSocketId: string, data: any) {
    const player = this.getPlayerBySocketId(playerSocketId);
    console.log(`Player ${player.name} drawed a card.`);
    const drawnCard = this.cardStack.cards.pop()!;
    player.cardCache = drawnCard;
    this.sendObfuscatedGameUpdate();
  }

  takeDiscardPileAction(playerSocketId: string, data: any) {
    const player = this.getPlayerBySocketId(playerSocketId);
    console.log(`Player ${player.name} took the card from discard pile.`);
    const discardPileCard = this.discardPile.pop()!;
    player.cardCache = discardPileCard;
    player.tookDispiledCard = true;
    this.sendObfuscatedGameUpdate();
  }

  discardCardToPileAction(playerSocketId: string, data: any) {
    const player = this.getPlayerBySocketId(playerSocketId);
    console.log(`Player ${player.name} discarded a card to the pile.`);
    const discardedCard = player.cardCache!;
    this.discardPile.push(discardedCard);
    player.cardCache = null;
    this.phase = gamePhase.revealCard;
    this.sendObfuscatedGameUpdate();
  }

  placeCardAction(playerSocketId: string, cardPosition: number) {
    const player = this.getPlayerBySocketId(playerSocketId);
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

  nextRoundAction(playerSocketId: string, data: any) {
    this.initializeNewRound();
    this.sendObfuscatedGameUpdate();
  }

  /**
   * This function waits for a player to perform one of the expected actions.
   * When a player performs one of the expected actions, the corresponding callback is called and further processes the player data.
   * All event listeners are removed after every player defined in expectedFrom performed the expected action.
   * The function also returns a promise that resolves with the data sent by the player.
   * @param expectedActions
   * @param expectedFrom
   * @returns playerSocketId and data sent by the player
   */
  waitForPlayerActions<ActionDataType>(
    expectedActions: ExpectedPlayerActions,
    expectedFrom: Player["socketId"][]
  ): Promise<PlayerAction<ActionDataType>> {
    const eventListeners = new Map<string, (...args: any[]) => void>();

    const addPlayerActionListeners = (
      resolve: (
        value:
          | PlayerAction<ActionDataType>
          | PromiseLike<PlayerAction<ActionDataType>>
      ) => void
    ) => {
      expectedFrom.forEach((playerSocketId) => {
        const playerSocket = io.sockets.sockets.get(playerSocketId);
        if (playerSocket) {
          expectedActions.forEach((expectedAction) => {
            const [actionName, processAction] = expectedAction;
            const eventListener = (data: ActionDataType) => {
              console.log(`Received ${actionName} from ${playerSocketId}`);
              processAction(playerSocketId, data);
              // remove current and event listeners of alternative expected actions
              removePlayerActionListeners();
              const playerResponse = { playerSocketId, data };
              resolve(playerResponse);
            };
            playerSocket.on(actionName, eventListener);
            eventListeners.set(
              `${playerSocketId}-${actionName}`,
              eventListener
            );
          });
        }
      });
    };

    const removePlayerActionListeners = () => {
      expectedFrom.forEach((playerSocketId) => {
        const playerSocket = io.sockets.sockets.get(playerSocketId);
        if (playerSocket) {
          expectedActions.forEach((expectedAction) => {
            const [actionName] = expectedAction;

            const eventListener = eventListeners.get(
              `${playerSocketId}-${actionName}`
            );
            if (eventListener) {
              playerSocket.off(actionName, eventListener);
              eventListeners.delete(`${playerSocketId}-${actionName}`);
            }
          });
        }
      });
    };

    return new Promise<PlayerAction<ActionDataType>>((resolve) => {
      addPlayerActionListeners(resolve);
    });
  }

  sendObfuscatedGameUpdate() {
    // console.trace("sendObfuscatedGameUpdate");
    this.updatePlayerRoundPoints();
    const obfuscatedGame: ObfuscatedGame = {
      sessionId: this.sessionId,
      playerCount: this.playerCount,
      phase: this.phase,
      round: this.round,
      discardPile: this.discardPile,
      players: this.players.map(({ cards, ...player }) => {
        return {
          id: player.id,
          socketId: player.socketId,
          name: player.name,
          playersTurn: player.playersTurn,
          cardCache: player.cardCache,
          tookDispiledCard: player.tookDispiledCard,
          knownCardPositions: player.knownCardPositions,
          roundPoints: player.roundPoints,
          totalPoints: player.totalPoints,
          closedRound: player.closedRound,
          cards: cards.map((card: Card, index: number) => {
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
    };
    console.log("Sending game update");
    io.to(this.sessionId).emit("game-update", obfuscatedGame);
  }

  updatePlayerRoundPoints() {
    this.players.forEach((player) => {
      const revealedCardValuesSum = player.getRevealedCardsValueSum();
      const threeOfAKinds = player.getThreeOfAKinds();
      const threeOfAKindPoints = threeOfAKinds.reduce(
        (points, threeOfAKind) => points + threeOfAKind.value * 3,
        0
      );

      player.roundPoints = revealedCardValuesSum - threeOfAKindPoints;
    });
  }

  getPlayersWithLowestPoints(): Player[] {
    this.updatePlayerRoundPoints();
    const lowestScore = Math.min(
      ...this.players.map((player) => player.roundPoints)
    );
    const playersWithLowestPoints = this.players.filter(
      (player) => player.roundPoints === lowestScore
    );
    return playersWithLowestPoints;
  }

  evaluateAndSavePoints() {
    const playersWithLowestPoints = this.getPlayersWithLowestPoints();
    const playerClosedRound = this.getPlayerThatClosedRound();
    if (
      playersWithLowestPoints.includes(playerClosedRound) &&
      playersWithLowestPoints.length === 1
    ) {
      this.sendMessageToAllPlayers(`${playerClosedRound.name} won the round!`);
      this.players.forEach((player) => {
        player.totalPoints += player.roundPoints;
      });
      return;
    } else if (playersWithLowestPoints.length === 1) {
      this.sendMessageToAllPlayers(
        `${playersWithLowestPoints[0].name} won the round!`
      );
    } else if (playersWithLowestPoints.length > 1) {
      this.sendMessageToAllPlayers(
        `${playersWithLowestPoints
          .map((player) => player.name)
          .join(", ")} scored equally the lowest points!`
      );
    }
    this.players.forEach((player) => {
      if (player.closedRound) player.totalPoints += player.roundPoints * 2;
      else player.totalPoints += player.roundPoints;
    });
    this.sendMessageToAllPlayers(
      `${playerClosedRound.name} points are doubled!`
    );
  }

  checkForFullRevealedCards() {
    const alreadyClosedPlayers = this.players.filter(
      (player) => player.closedRound
    );
    if (alreadyClosedPlayers) return;

    const playerWithAllCardsRevealed = this.players.find((player) =>
      player.knownCardPositions.every(
        (knownCardPosition) => knownCardPosition === true
      )
    );
    if (playerWithAllCardsRevealed) {
      playerWithAllCardsRevealed.closedRound = true;
    }
  }

  revealAllCards() {
    this.players.forEach((player) => {
      player.knownCardPositions = player.knownCardPositions.map(
        (knownCardPosition) => true
      );
    });
  }

  // Helpers

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
    const playerOnTurn = this.getPlayersTurn();
    const playersTurnIndex = this.players.indexOf(playerOnTurn);
    const nextPlayersTurnIndex = (playersTurnIndex + 1) % this.playerCount;
    this.players[playersTurnIndex].playersTurn = false;
    this.players[nextPlayersTurnIndex].playersTurn = true;
  }

  getPlayersTurn(): Player {
    const playerOnTurn = this.players.find(
      (player) => player.playersTurn === true
    );
    if (playerOnTurn) return playerOnTurn;
    else throw new Error("No player on turn found!");
  }

  getPlayerThatClosedRound(): Player {
    const playerThatClosedRound = this.players.find(
      (player) => player.closedRound === true
    );
    if (playerThatClosedRound) return playerThatClosedRound;
    else throw new Error("No player that closed the round found!");
  }

  getPlayerBySocketId(playerSocketId: string): Player {
    const player = this.players.find(
      (player) => player.socketId === playerSocketId
    );
    if (player) return player;
    else throw new Error(`No player with socketId ${playerSocketId} found!`);
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

  sendMessageToAllPlayers(message: string) {
    io.to(this.sessionId).emit("message", message);
    console.log(`Sent Message (Session): ${message}`);
  }
}

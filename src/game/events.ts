import { Socket } from "socket.io";
import { io } from "../server";
import { Game } from "./game";
import { Player, ObfuscatedPlayer } from "./player";
import { Card } from "./card";

export const handleJoinSession = (socket: Socket, sessionId: string) => {
  socket.join(sessionId);
  console.log("User joined session:", sessionId);

  const numberOfClients = io.sockets.adapter.rooms.get(sessionId)?.size ?? 0;
  console.log("Clients in room:", numberOfClients);
  io.to(sessionId).emit("clients-in-session", numberOfClients);
};

export const handleNewGame = (
  socket: Socket,
  gameDetails: { sessionId: string }
) => {
  console.log("Received game details:", gameDetails);
  const { sessionId } = gameDetails;

  const players = io.sockets.adapter.rooms.get(sessionId);

  if (players && players.size > 1) {
    const game = new Game(socket, sessionId, players);
    game.sendObfuscatedGameUpdate();
  } else {
    // error handling
    console.log("Not enough players to start a game");
  }
};

const obfuscatePlayerCards = (player: Player): ObfuscatedPlayer => {
  return {
    id: player.id,
    socketId: player.socketId,
    name: player.name,
    cards: player.cards.map((card: Card, index: number) => {
      return {
        id: card.id,
        value: player.knownCardPositions[index] ? card.value : 0, // unknown cards are obfuscated to 0
        name: card.name,
        color: card.color,
        matchColorToCardValue: card.matchColorToCardValue,
      };
    }),
    knownCardPositions: player.knownCardPositions,
    playersTurn: player.playersTurn,
    cardCache: player.cardCache,
  };
};

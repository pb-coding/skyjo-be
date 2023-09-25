import { Socket } from "socket.io";
import { io } from "../server";
import { Game } from "./game";

import { allGames } from "./game";

export const handleJoinSession = (socket: Socket, sessionId: string) => {
  socket.join(sessionId);
  console.log("User joined session:", sessionId);

  const numberOfClients = io.sockets.adapter.rooms.get(sessionId)?.size ?? 0;
  console.log("Clients in room:", numberOfClients);
  io.to(sessionId).emit("clients-in-session", numberOfClients);
};

export const handleLeaveSession = (socket: Socket, sessionId: string) => {
  socket.emit("game-update", null);
  socket.leave(sessionId);
  console.log("User left session:", sessionId);

  const numberOfClients = io.sockets.adapter.rooms.get(sessionId)?.size ?? 0;
  console.log("Clients in room:", numberOfClients);
  io.to(sessionId).emit("clients-in-session", numberOfClients);

  const relatedGame = allGames.find((game) => game.sessionId === sessionId);
  if (!relatedGame) return;
  relatedGame.checkForPlayerLeave();
};

export const handleNewGame = (
  socket: Socket,
  gameDetails: { sessionId: string }
) => {
  console.log("Received game details:", gameDetails);
  const { sessionId } = gameDetails;

  const players = io.sockets.adapter.rooms.get(sessionId);
  // get players based on socket
  const playersInSession = io.sockets.adapter.sids.get(socket.id);
  console.log("Players in session:", playersInSession?.size);

  if (players && players.size > 1) {
    const game = new Game(socket, sessionId, players);
    allGames.push(game);
    console.log(`New Game created with ${game.playerCount} players!`);
    game.gameLoop();
  } else {
    // TODO: error handling & send message to client
    console.log("Not enough players to start a game");
  }
};

export const handleDisconnect = (socket: Socket) => {
  console.log("A user disconnected:", socket.id);
  // TODO: update clients-in-room and delete game object
  console.log("socket rooms", socket.rooms.size);
  allGames.forEach((game) => {
    game.checkForPlayerLeave();
  });
  const allSessions = io.sockets.adapter.rooms;
  allSessions.forEach((socketIds, sessionName) => {
    io.to(sessionName).emit("clients-in-session", socketIds.size);
  });
};

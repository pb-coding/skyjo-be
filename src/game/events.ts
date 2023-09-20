import { Socket } from "socket.io";
import { io } from "../server";
import { Game } from "./game";

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

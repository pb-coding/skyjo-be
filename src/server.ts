// thanks to https://github.com/Apollon77/meross-cloud for the Meross Cloud API

import express, { Request, Response } from "express";
import { Server } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import app from "./lib/app";
import * as path from "path";
import logger, { log } from "./middleware/logEvents";
import errorHandler from "./middleware/errorHandler";
import credentials from "./middleware/credentials";
import cors from "cors";
import corsOptions from "./config/corsOptions";
import cookieParser from "cookie-parser";
import rootRouter from "./routes/root";
import { handleJoinSession, handleNewGame } from "./game/events";

const httpServer = new Server(app);
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "https://skyjo.voltvector.org",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket: Socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join-session", (sessionId: string) =>
    handleJoinSession(socket, sessionId)
  );

  socket.on("new-game", (gameDetails: { sessionId: string }) =>
    handleNewGame(socket, gameDetails)
  );

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
    // TODO: remove players from session and delete game object
  });
});

// helps to debug reading envs
const environment = process.env.ENVIRONMENT ?? "can not read envs";
const PORT = process.env.PORT || 3001;

app.use(logger);

app.use(credentials);

app.use(cors(corsOptions));

app.use(express.json());

app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, "..", "public")));

app.use(cookieParser());

app.use("/", rootRouter);

app.all("*", (req: Request, res: Response) => {
  res.status(404).send("Not Found");
});

app.use(errorHandler);

httpServer.listen(PORT, () => {
  log("ExpressJS", `Server listening on ${PORT} - Environment: ${environment}`);
});

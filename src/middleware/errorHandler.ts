import { Request, Response, NextFunction } from "express";
import { logEvents } from "./logEvents";

import { log } from "./logEvents";

const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // TODO: Handle loads of different errors
  console.error(error);
  let errorMessage = "An unknown error occurred!";
  let statusCode = 500;

  if (error instanceof Error) {
    logEvents(`${error.name}: ${error.message}`, "errorLog.txt");
    errorMessage = error.message;
  }

  log("Error Handler", errorMessage);

  res.status(statusCode).json({
    error: errorMessage,
  });
};

export const asyncHandler = (fn: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default errorHandler;

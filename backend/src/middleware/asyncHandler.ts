import { RequestHandler } from "express";

/** Forward rejected async controller promises to Express 4's error middleware. */
export function asyncHandler(handler: (...args: any[]) => any): RequestHandler {
  return (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); };
}

import jwt from "jsonwebtoken";
import { env } from "../config/env";

export function signToken(userId: string) {
  return jwt.sign({ userId }, env.jwtSecret, { expiresIn: "7d" });
}
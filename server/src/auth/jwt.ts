import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { env } from "../config.js";

export type JwtPayload = {
  sub: string;
  role: UserRole;
  mfa?: boolean;
};

type JwtExpiresIn = jwt.SignOptions["expiresIn"];

export function signToken(payload: JwtPayload, expiresIn: JwtExpiresIn = "7d"): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function verifyTokenIgnoringExpiration(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET, { ignoreExpiration: true }) as JwtPayload;
}

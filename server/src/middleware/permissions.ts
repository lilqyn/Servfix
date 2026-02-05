import type { NextFunction, Request, Response } from "express";
import { hasPermission, type Permission } from "../utils/permissions.js";

export const requirePermission = (...permissions: Permission[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const role = req.user.role;
    const allowed = permissions.some((permission) => hasPermission(role, permission));

    if (!allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
};

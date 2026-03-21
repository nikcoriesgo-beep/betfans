import type { Request, Response, NextFunction } from "express";

export { setupAuth } from "./replitAuth";
export { authStorage } from "./storage";

export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any)?.userId) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

export function registerAuthRoutes(_app: any) {}

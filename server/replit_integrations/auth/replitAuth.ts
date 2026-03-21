import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authStorage } from "./storage";
import { storage } from "../../storage";

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  const PgStore = connectPgSimple(session);

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { phone, password, firstName, lastName } = req.body;
      if (!phone || !password) {
        return res.status(400).json({ message: "Phone number and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length < 10) {
        return res.status(400).json({ message: "Please enter a valid phone number" });
      }

      const existing = await authStorage.getUserByPhone(cleanPhone);
      if (existing) {
        return res.status(409).json({ message: "An account with this phone number already exists" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const userId = crypto.randomUUID();

      const user = await authStorage.upsertUser({
        id: userId,
        phone: cleanPhone,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
        email: null,
        profileImageUrl: null,
      });

      try {
        await storage.generateReferralCode(user.id);
      } catch (e) {
        console.error("Failed to generate referral code:", e);
      }

      try {
        const { db: dbConn } = await import("../../db");
        const { users: usersTable } = await import("@shared/schema");
        const { eq: eqFn } = await import("drizzle-orm");
        await dbConn.update(usersTable).set({ referredBy: "NIKCOX" }).where(eqFn(usersTable.id, user.id));
      } catch (e) {
        console.error("Failed to set default NIKCOX referral:", e);
      }

      (req.session as any).userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({ user });
      });
    } catch (error: any) {
      console.error("Signup error:", error.message);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) {
        return res.status(400).json({ message: "Phone number and password are required" });
      }

      const cleanPhone = phone.replace(/\D/g, "");
      const user = await authStorage.getUserByPhone(cleanPhone);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      if (!user.referralCode) {
        try { await storage.generateReferralCode(user.id); } catch (e) {}
      }

      (req.session as any).userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.json({ user });
      });
    } catch (error: any) {
      console.error("Login error:", error.message);
      res.status(500).json({ message: "Failed to log in" });
    }
  });

  app.get("/api/auth/user", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const user = await authStorage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to log out" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/logout", (_req, res) => {
    res.redirect("/");
  });
}

import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { authStorage } from "./storage";
import { storage } from "../../storage";

type PhoneUser = Awaited<ReturnType<typeof authStorage.getUserByPhone>>;

export async function authenticatePhoneUser(
  phone: string,
  password: string,
  getUserByPhone: (phone: string) => Promise<PhoneUser> = (cleanPhone) =>
    authStorage.getUserByPhone(cleanPhone),
): Promise<NonNullable<PhoneUser> | null> {
  const cleanPhone = phone.replace(/\D/g, "");
  const user = await getUserByPhone(cleanPhone);
  if (!user?.passwordHash) return null;

  return (await bcrypt.compare(password, user.passwordHash)) ? user : null;
}

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
    rolling: true, // extend session on each request so active users never get silently logged out
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: "sessions",
      ttl: 30 * 24 * 60 * 60, // 30 days, matches cookie maxAge below
    }),
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — persistent session, refreshed on activity
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { phone, password, firstName, lastName, email, referralCode } = req.body;
      if (!phone || !password) {
        return res.status(400).json({ message: "Phone number and password are required" });
      }
      const FOUNDER_EMAIL = (process.env.FOUNDER_EMAIL || "nikcox@betfans.us").toLowerCase();
      // New signups never receive paid access from an unverified email address.
      const isFounderSignup = false;
      const code = typeof referralCode === "string" ? referralCode.trim().toUpperCase() : "";
      const { pool } = await import("../../db");
      const affiliate = await pool.query("SELECT id FROM users WHERE UPPER(referral_code)=$1 LIMIT 1", [code]);
      if (!code || affiliate.rows.length !== 1) {
        return res.status(400).json({ message: "A valid affiliate code is required to sign up for Free Play." });
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
        email: email?.trim().toLowerCase() || null,
        profileImageUrl: null,
        membershipTier: "free_play",
        referredBy: affiliate.rows[0].id,
      });

      const { db: dbConn } = await import("../../db");
      const { users: usersTable, referrals: referralsTable } = await import("@shared/schema");
      const { eq: eqFn } = await import("drizzle-orm");

      if (isFounderSignup) {
        try {
          await dbConn.update(usersTable)
            .set({ referralCode: "NIKCOX", referredBy: null, membershipTier: "legend" })
            .where(eqFn(usersTable.id, user.id));
        } catch (e) {
          console.error("Failed to set founder code:", e);
        }
      } else {
        // Resolve the affiliate/referral code submitted at signup.
        // Default to the founder (NIKCOX) if no code is provided or code is invalid.
        let referredById: string | null = null;
        const upperCode = code;

        try {
          // Look up the referrer — works for NIKCOX and any affiliate code
          const [referrer] = await dbConn.select().from(usersTable)
            .where(eqFn(usersTable.referralCode, upperCode))
            .limit(1);

          if (referrer && referrer.id !== userId) {
            referredById = referrer.id;
            // Create a referrals record so the affiliate sees this member
            try {
              await dbConn.insert(referralsTable).values({
                referrerId: referrer.id,
                referredId: userId,
              } as any).onConflictDoNothing();
            } catch {}
            console.log(`[signup] Referral: ${upperCode} (${referrer.id}) -> ${userId}`);
          }
        } catch (e) {
          console.error("Failed to resolve referral code:", e);
        }

        // Fallback: if code lookup failed, store code string so it can be resolved later
        const referredByValue = referredById ?? upperCode;

        try {
          await dbConn.update(usersTable)
            .set({ membershipTier: "free_play", referredBy: referredByValue })
            .where(eqFn(usersTable.id, user.id));
        } catch (e) {
          console.error("Failed to set free tier / referral:", e);
        }
        try {
          await storage.generateReferralCode(user.id);
        } catch (e) {
          console.error("Failed to generate referral code:", e);
        }
      }

      (req.session as any).userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to create session" });
        }
        const { passwordHash: _hash, ...safeUser } = user;
        res.json({ user: safeUser });
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

      const user = await authenticatePhoneUser(phone, password);
      if (!user) {
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
        const { passwordHash: _hash, ...safeUser } = user;
        res.json({ user: safeUser });
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

  app.post("/api/auth/change-password", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    try {
      const user = await authStorage.getUser(userId);
      if (!user || !user.passwordHash) {
        return res.status(400).json({ message: "Account not found" });
      }

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      const { db: dbConn } = await import("../../db");
      const { users: usersTable } = await import("@shared/schema");
      const { eq: eqFn } = await import("drizzle-orm");
      await dbConn.update(usersTable).set({ passwordHash: newHash } as any).where(eqFn(usersTable.id, userId));

      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Change password error:", error.message);
      res.status(500).json({ message: "Failed to update password" });
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

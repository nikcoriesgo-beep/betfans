import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Assets with stable filenames — must-revalidate so browsers always check for updates
  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: 0,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
    },
  }));

  // Audio files — short cache (1 hour) so updates propagate same day
  app.use("/audio", express.static(path.join(distPath, "audio"), {
    maxAge: "1h",
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
    },
  }));

  // Service worker — never cache so it always reflects the latest version
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.sendFile(path.resolve(distPath, "sw.js"));
  });

  // All other static files (icons, manifest, etc.) — never serve index.html here
  app.use(express.static(distPath, { maxAge: "1h", index: false }));

  // HTML — never cache so deploys are always visible immediately
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

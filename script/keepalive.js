const https = require("https");
const url = "https://betfans.us/api/health";
https.get(url, (res) => {
  let d = "";
  res.on("data", (c) => (d += c));
  res.on("end", () => console.log(`[keepalive] ${res.statusCode} ${d.slice(0, 80)}`));
}).on("error", (e) => {
  console.error("[keepalive] error:", e.message);
  process.exit(1);
});

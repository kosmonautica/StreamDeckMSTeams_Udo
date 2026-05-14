// Manual probe for the Microsoft Teams third-party app API WebSocket.
//
// Run this while Teams is open (ideally during a meeting) and watch both the
// terminal output AND the Teams window for a pairing dialog.
//
// Usage:
//   node tools/ws-test.mjs              connect WITHOUT a token param (clean first-time pairing)
//   node tools/ws-test.mjs --empty      connect WITH an empty token= param (the plugin's current behaviour)
//   node tools/ws-test.mjs <token>      connect with a specific token
//
// The script stays connected for 60 s, then exits.

import WebSocket from "ws";

const arg = process.argv[2];

const params = new URLSearchParams({
  "protocol-version": "2.0.0",
  manufacturer: "Kosmonautica",
  device: "StreamDeck",
  app: "TeamsControl",
  "app-version": "1.0.0",
});

let mode;
if (arg === "--empty") {
  params.set("token", "");
  mode = "empty token= param";
} else if (arg && arg !== "--no-token") {
  params.set("token", arg);
  mode = "explicit token";
} else {
  mode = "no token param at all";
}

const url = `ws://localhost:8124?${params.toString()}`;
console.log(`[ws-test] mode: ${mode}`);
console.log(`[ws-test] connecting: ${url}`);

const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("[ws-test] OPEN — watch the Teams window for a pairing dialog now");
});
ws.on("message", (data) => {
  console.log("[ws-test] MSG:", data.toString());
});
ws.on("error", (err) => {
  console.log("[ws-test] ERROR:", err.message);
});
ws.on("close", (code, reason) => {
  console.log(`[ws-test] CLOSE: code=${code} reason=${reason.toString()}`);
});

setTimeout(() => {
  console.log("[ws-test] 60 s elapsed, closing");
  ws.close();
  process.exit(0);
}, 60_000);

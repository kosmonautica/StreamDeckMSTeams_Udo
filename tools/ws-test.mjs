// Manual probe for the Microsoft Teams third-party app API WebSocket.
//
// Run this while Teams is open and you are IN A MEETING. Watch the Teams
// window for a pairing dialog/banner/notification.
//
// Usage:
//   node tools/ws-test.mjs              no token param — tries auto-pairing when canPair becomes true
//   node tools/ws-test.mjs --empty      empty token= param (the bug we fixed — Teams ignores this)
//   node tools/ws-test.mjs <token>      connect with a specific token

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
  mode = "empty token= (broken)";
} else if (arg && arg !== "--no-token") {
  params.set("token", arg);
  mode = "explicit token";
} else {
  mode = "no token param — will send pair request when canPair=true";
}

const url = `ws://localhost:8124?${params.toString()}`;
console.log(`[ws-test] mode: ${mode}`);
console.log(`[ws-test] connecting: ${url}`);

let requestId = 0;
let pairRequested = false;
const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("[ws-test] OPEN");
});

ws.on("message", (data) => {
  const raw = data.toString();
  console.log("[ws-test] MSG:", raw);

  try {
    const msg = JSON.parse(raw);

    // When canPair becomes true, send an explicit pair request.
    // Some Teams versions require this instead of showing a dialog automatically.
    const perms = msg?.meetingUpdate?.meetingPermissions;
    if (perms?.canPair === true && !pairRequested && !arg) {
      pairRequested = true;
      const payload = JSON.stringify({ action: "pair", parameters: {}, requestId: ++requestId });
      console.log("[ws-test] sending pair request:", payload);
      ws.send(payload);
      console.log("[ws-test] >>> now watch Teams carefully for a pairing dialog or notification");
    }
  } catch {
    // ignore parse errors
  }
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

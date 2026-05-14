import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ── WS mock ──────────────────────────────────────────────────────────────────

let lastWsInstance: MockWs | null = null;
let wsInstanceCount = 0;

class MockWs extends EventEmitter {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;

  url: string;
  readyState = MockWs.OPEN;
  send = vi.fn();
  // Default close: emit close event (caller can override per-test with mockImplementation)
  close = vi.fn(() => {
    this.readyState = MockWs.CLOSED;
    this.emit("close", 1000);
  });

  constructor(url: string) {
    super();
    this.url = url;
    lastWsInstance = this;
    wsInstanceCount++;
  }
}

vi.mock("ws", () => ({ default: MockWs }));

// ── @elgato/streamdeck mock ───────────────────────────────────────────────────

const mockGetGlobalSettings = vi.fn().mockResolvedValue({});
const mockSetGlobalSettings = vi.fn().mockResolvedValue(undefined);
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock("@elgato/streamdeck", () => ({
  default: {
    settings: {
      getGlobalSettings: mockGetGlobalSettings,
      setGlobalSettings: mockSetGlobalSettings,
    },
    logger: mockLogger,
    actions: { registerAction: vi.fn() },
    connect: vi.fn(),
  },
  LogLevel: { INFO: "info" },
  SingletonAction: class {},
  action: () => (cls: unknown) => cls,
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function ws(): MockWs {
  if (!lastWsInstance) throw new Error("No WS instance created yet");
  return lastWsInstance;
}

async function makeConnectedClient(opts: { token?: string } = {}) {
  mockGetGlobalSettings.mockResolvedValueOnce({ teamsToken: opts.token });
  const { TeamsClient } = await import("../teams-client.js");
  const client = new TeamsClient();
  await client.start();
  return client;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("TeamsClient", () => {
  beforeEach(() => {
    lastWsInstance = null;
    wsInstanceCount = 0;
    vi.clearAllMocks();
    mockGetGlobalSettings.mockResolvedValue({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Reset module so each test group gets a fresh singleton path
    vi.resetModules();
  });

  describe("start()", () => {
    it("connects to Teams on ws://localhost:8124", async () => {
      await makeConnectedClient();
      expect(ws().url).toMatch("ws://localhost:8124");
    });

    it("includes protocol-version, manufacturer, device, app query params", async () => {
      await makeConnectedClient();
      const url = new URL(ws().url.replace("/?", "/?"));
      expect(url.searchParams.get("protocol-version")).toBe("2.0.0");
      expect(url.searchParams.get("manufacturer")).toBe("Kosmonautica");
      expect(url.searchParams.get("device")).toBe("StreamDeck");
      expect(url.searchParams.get("app")).toBe("TeamsControl");
    });

    it("includes an empty token param when not yet paired", async () => {
      await makeConnectedClient({ token: undefined });
      // Teams needs the token param present (empty) to trigger the pairing prompt.
      expect(new URL(ws().url).searchParams.get("token")).toBe("");
    });

    it("appends stored token as query param", async () => {
      await makeConnectedClient({ token: "saved-token-abc" });
      expect(ws().url).toContain("token=saved-token-abc");
    });

    it("is idempotent – a second call creates no new connection", async () => {
      const { TeamsClient } = await import("../teams-client.js");
      const client = new TeamsClient();
      await client.start();
      await client.start();
      expect(wsInstanceCount).toBe(1);
    });

    it("sets status to 'connecting' immediately", async () => {
      const statuses: string[] = [];
      const { TeamsClient } = await import("../teams-client.js");
      const client = new TeamsClient();
      client.on("status", (s) => statuses.push(s));
      await client.start();
      expect(statuses).toContain("connecting");
    });
  });

  describe("on WebSocket open", () => {
    it("does not send any message (Teams pushes state automatically)", async () => {
      await makeConnectedClient();
      ws().emit("open");
      expect(ws().send).not.toHaveBeenCalled();
    });

    it("resets reconnect counter so next failure starts fresh backoff", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      ws().emit("close", 1000);
      // First retry fires after 2000 ms
      vi.advanceTimersByTime(2001);
      const ws2 = lastWsInstance!;
      ws2.emit("open"); // reconnect success
      ws2.emit("close", 1000);
      // After successful reconnect, backoff should restart at 2 s, not 4 s
      vi.advanceTimersByTime(2001);
      expect(wsInstanceCount).toBe(3);
    });
  });

  describe("message: tokenRefresh", () => {
    it("saves token via setGlobalSettings", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      ws().emit("message", JSON.stringify({ tokenRefresh: "fresh-token" }));
      expect(mockSetGlobalSettings).toHaveBeenCalledWith({ teamsToken: "fresh-token" });
    });

    it("closes the current connection to reconnect with the new token", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      ws().emit("message", JSON.stringify({ tokenRefresh: "fresh-token" }));
      expect(ws().close).toHaveBeenCalled();
    });
  });

  describe("message: meetingUpdate", () => {
    const fullState = {
      isMuted: true,
      isVideoOn: false,
      isHandRaised: false,
      isInMeeting: true,
      isRecordingOn: false,
      isBackgroundBlurred: false,
      isSharing: false,
    };

    it("updates client.state with incoming fields", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      ws().emit("message", JSON.stringify({ meetingUpdate: { meetingState: fullState } }));
      expect(client.state.isMuted).toBe(true);
      expect(client.state.isInMeeting).toBe(true);
    });

    it("emits 'state' event with the new state", async () => {
      const client = await makeConnectedClient();
      const listener = vi.fn();
      client.on("state", listener);
      ws().emit("open");
      ws().emit("message", JSON.stringify({ meetingUpdate: { meetingState: fullState } }));
      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(client.state);
    });

    it("sets status to 'paired'", async () => {
      const client = await makeConnectedClient({ token: "t" });
      ws().emit("open");
      ws().emit("message", JSON.stringify({ meetingUpdate: { meetingState: fullState } }));
      expect(client.status).toBe("paired");
    });

    it("fills missing state fields with defaults", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      // Partial state: only isMuted provided
      ws().emit("message", JSON.stringify({ meetingUpdate: { meetingState: { isMuted: true } } }));
      expect(client.state.isVideoOn).toBe(false);
      expect(client.state.isSharing).toBe(false);
    });
  });

  describe("message: response Success (Teams handshake)", () => {
    it("sets status to 'paired'", async () => {
      const client = await makeConnectedClient({ token: "t" });
      ws().emit("open");
      ws().emit("message", JSON.stringify({ response: "Success", requestId: 0 }));
      expect(client.status).toBe("paired");
    });
  });

  describe("message: meetingUpdate with only meetingPermissions (no meeting active)", () => {
    it("sets status to 'paired' without emitting a state event", async () => {
      const client = await makeConnectedClient({ token: "t" });
      const stateListener = vi.fn();
      client.on("state", stateListener);
      ws().emit("open");
      ws().emit(
        "message",
        JSON.stringify({
          meetingUpdate: {
            meetingPermissions: { canToggleMute: true, canToggleVideo: true, canLeave: true },
          },
        }),
      );
      expect(client.status).toBe("paired");
      expect(stateListener).not.toHaveBeenCalled();
    });

    it("does not change isInMeeting from its default false", async () => {
      const client = await makeConnectedClient({ token: "t" });
      ws().emit("open");
      ws().emit(
        "message",
        JSON.stringify({ meetingUpdate: { meetingPermissions: { canLeave: true } } }),
      );
      expect(client.state.isInMeeting).toBe(false);
    });
  });

  describe("message: errorMsg field", () => {
    it("logs a warning and does not throw", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      expect(() => {
        ws().emit("message", JSON.stringify({ errorMsg: "Does not fit protocol standardInvalid action" }));
      }).not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Does not fit protocol"),
      );
    });
  });

  describe("message: invalid JSON", () => {
    it("logs a warning and does not throw", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      expect(() => {
        ws().emit("message", "this is not json{{");
      }).not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Unparseable"),
      );
    });
  });

  describe("WebSocket close", () => {
    it("sets status to 'unpaired' when no token exists", async () => {
      const client = await makeConnectedClient({ token: undefined });
      ws().emit("close", 1000);
      expect(client.status).toBe("unpaired");
    });

    it("sets status to 'disconnected' when a token exists", async () => {
      const client = await makeConnectedClient({ token: "tok" });
      ws().emit("close", 1006);
      expect(client.status).toBe("disconnected");
    });

    it("schedules a reconnect attempt", async () => {
      const client = await makeConnectedClient();
      ws().emit("close", 1000);
      vi.advanceTimersByTime(2001);
      expect(wsInstanceCount).toBe(2);
    });

    it("uses exponential backoff for successive failures", async () => {
      await makeConnectedClient();

      // First close → first reconnect fires at 2 s
      ws().emit("close", 1000);
      vi.advanceTimersByTime(1999);
      expect(wsInstanceCount).toBe(1); // not yet

      vi.advanceTimersByTime(2);
      expect(wsInstanceCount).toBe(2); // second WS created

      // Second close → second reconnect fires at 4 s
      lastWsInstance!.emit("close", 1000);
      vi.advanceTimersByTime(3999);
      expect(wsInstanceCount).toBe(2); // not yet

      vi.advanceTimersByTime(2);
      expect(wsInstanceCount).toBe(3); // third WS created
    });

    it("caps backoff at 30 s", async () => {
      await makeConnectedClient();
      // Simulate many failures to push past the 30 s cap
      for (let i = 0; i < 10; i++) {
        lastWsInstance!.emit("close", 1000);
        vi.advanceTimersByTime(30001); // always advance enough to trigger
      }
      // All 10 reconnects should have fired (wsInstanceCount includes the first)
      expect(wsInstanceCount).toBe(11);
    });
  });

  describe("toggleMute() / toggleVideo()", () => {
    it("sends toggle-mute action", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      client.toggleMute();
      const payload = JSON.parse(ws().send.mock.calls.at(-1)![0]);
      expect(payload.action).toBe("toggle-mute");
      expect(payload.apiVersion).toBe("2.0.0");
    });

    it("sends toggle-video action", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      client.toggleVideo();
      const payload = JSON.parse(ws().send.mock.calls.at(-1)![0]);
      expect(payload.action).toBe("toggle-video");
    });

    it("increments requestId on each send", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      client.toggleMute();
      client.toggleMute();
      const [first, second] = ws().send.mock.calls.map((c) => JSON.parse(c[0]));
      expect(second.requestId).toBeGreaterThan(first.requestId);
    });

    it("logs a warning when not connected", async () => {
      const { TeamsClient } = await import("../teams-client.js");
      const client = new TeamsClient();
      client.toggleMute();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("toggle-mute"),
      );
    });
  });

  describe("ensureConnected()", () => {
    it("starts the client if it was never started", async () => {
      const { TeamsClient } = await import("../teams-client.js");
      const client = new TeamsClient();
      client.ensureConnected();
      // start() is async; allow the microtask queue to flush
      await Promise.resolve();
      await Promise.resolve();
      expect(wsInstanceCount).toBe(1);
    });

    it("does nothing while the socket is open", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      client.ensureConnected();
      expect(wsInstanceCount).toBe(1);
    });

    it("reconnects immediately when the socket has dropped", async () => {
      const client = await makeConnectedClient();
      ws().emit("open");
      ws().readyState = MockWs.CLOSED;
      ws().emit("close", 1006);
      // A reconnect is scheduled with backoff; ensureConnected should bypass it.
      client.ensureConnected();
      expect(wsInstanceCount).toBe(2);
    });
  });
});

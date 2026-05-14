import { EventEmitter } from "node:events";
import WebSocket from "ws";
import streamDeck from "@elgato/streamdeck";

/** Meeting state as reported by the Teams third-party app API. */
export type MeetingState = {
  isMuted: boolean;
  isVideoOn: boolean;
  isHandRaised: boolean;
  isInMeeting: boolean;
  isRecordingOn: boolean;
  isBackgroundBlurred: boolean;
  isSharing: boolean;
};

const DEFAULT_STATE: MeetingState = {
  isMuted: false,
  isVideoOn: false,
  isHandRaised: false,
  isInMeeting: false,
  isRecordingOn: false,
  isBackgroundBlurred: false,
  isSharing: false,
};

/** Connection status surfaced to the actions for diagnostics. */
export type ConnectionStatus = "connecting" | "paired" | "unpaired" | "disconnected";

type GlobalSettings = { teamsToken?: string };

const HOST = "ws://localhost:8124";
const MANUFACTURER = "Kosmonautica";
const DEVICE = "StreamDeck";
const APP = "TeamsControl";
const APP_VERSION = "1.0.0";

/**
 * Singleton WebSocket client for the Microsoft Teams third-party app API.
 *
 * A single connection is shared by every action. State changes are broadcast
 * via the `"state"` event; connection changes via the `"status"` event.
 */
class TeamsClient extends EventEmitter {
  private ws?: WebSocket;
  private token?: string;
  private requestId = 0;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private started = false;

  public state: MeetingState = { ...DEFAULT_STATE };
  public status: ConnectionStatus = "disconnected";

  /** Begins connecting. Safe to call multiple times; only the first call has an effect. */
  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
    this.token = settings.teamsToken;
    this.connect();
  }

  public toggleMute(): void {
    this.send("toggle-mute");
  }

  public toggleVideo(): void {
    this.send("toggle-video");
  }

  private connect(): void {
    clearTimeout(this.reconnectTimer);
    this.setStatus("connecting");

    const params = new URLSearchParams({
      "protocol-version": "2.0.0",
      manufacturer: MANUFACTURER,
      device: DEVICE,
      app: APP,
      "app-version": APP_VERSION,
    });
    if (this.token) params.set("token", this.token);

    const ws = new WebSocket(`${HOST}/?${params.toString()}`);
    this.ws = ws;

    ws.on("open", () => {
      this.reconnectAttempts = 0;
      // A token-less connection stays open until the user accepts the pairing
      // dialog in Teams; querying state confirms whether we are already paired.
      this.send("query-meeting-state");
    });

    ws.on("message", (data) => this.handleMessage(data.toString()));

    ws.on("error", (err) => {
      streamDeck.logger.error("Teams WebSocket error", err);
    });

    ws.on("close", (code) => {
      this.ws = undefined;
      // Code 1000 with no token typically means the pairing prompt was declined.
      if (!this.token) {
        this.setStatus("unpaired");
      } else {
        this.setStatus("disconnected");
      }
      this.scheduleReconnect();
      streamDeck.logger.info(`Teams WebSocket closed (code ${code})`);
    });
  }

  private handleMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      streamDeck.logger.warn(`Unparseable Teams message: ${raw}`);
      return;
    }

    if (typeof msg.tokenRefresh === "string") {
      this.token = msg.tokenRefresh;
      void streamDeck.settings.setGlobalSettings<GlobalSettings>({ teamsToken: this.token });
      streamDeck.logger.info("Received Teams pairing token; reconnecting with token.");
      // Reconnect so the token is applied as a query parameter.
      this.ws?.close();
      return;
    }

    const update = msg.meetingUpdate as { meetingState?: Partial<MeetingState> } | undefined;
    if (update?.meetingState) {
      this.state = { ...DEFAULT_STATE, ...update.meetingState };
      this.setStatus("paired");
      this.emit("state", this.state);
    } else if (msg.meetingUpdate !== undefined || msg.response === "Success") {
      // Any successful response means the token is valid.
      this.setStatus("paired");
    }

    if (typeof msg.error === "string") {
      streamDeck.logger.warn(`Teams API error: ${msg.error}`);
    }
  }

  private send(action: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      streamDeck.logger.warn(`Cannot send "${action}": Teams not connected.`);
      return;
    }
    this.ws.send(
      JSON.stringify({
        apiVersion: "2.0.0",
        action,
        parameters: {},
        requestId: ++this.requestId,
      }),
    );
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    // Exponential backoff capped at 30s.
    const delay = Math.min(2000 * 2 ** (this.reconnectAttempts - 1), 30000);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
  }
}

export const teamsClient = new TeamsClient();

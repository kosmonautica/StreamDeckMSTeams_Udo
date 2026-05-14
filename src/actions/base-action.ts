import {
  SingletonAction,
  type Action,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { teamsClient, type MeetingState } from "../teams-client.js";

/** Per-action configuration: how to read state, what to toggle, which icons to show. */
export type ActionConfig = {
  /** Reads the relevant boolean (e.g. `isMuted`) from the meeting state. */
  isActive: (state: MeetingState) => boolean;
  /** Sends the toggle command to Teams. */
  toggle: () => void;
  /** Icon when the feature is "on" (e.g. mic live, camera on). */
  onIcon: string;
  /** Icon when the feature is "off" (e.g. muted, camera off). */
  offIcon: string;
  /** Icon shown when not in a meeting; the key is inert in this state. */
  inactiveIcon: string;
};

/**
 * Shared behaviour for the mute and camera toggle keys: subscribe to the Teams
 * client, render the current state, and forward key presses while in a meeting.
 */
export abstract class TeamsToggleAction extends SingletonAction {
  protected abstract readonly config: ActionConfig;

  /** Subscribes to Teams client events and renders the key's initial state. */
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    teamsClient.on("state", this.render);
    teamsClient.on("status", this.render);
    await teamsClient.start();
    this.renderOne(ev.action);
  }

  /** Cleans up event subscriptions when the key leaves the visible layout. */
  override onWillDisappear(): void {
    teamsClient.off("state", this.render);
    teamsClient.off("status", this.render);
  }

  /** Forwards the press to the Teams client; silently ignored outside a meeting. */
  override onKeyDown(_ev: KeyDownEvent): void {
    // Recover a dropped connection (and re-trigger pairing) on demand.
    teamsClient.ensureConnected();
    // Outside a meeting the Teams API rejects the toggle, so the key is inert.
    if (!teamsClient.state.isInMeeting) return;
    this.config.toggle();
  }

  /** Re-renders every visible instance of this action. */
  private render = (): void => {
    for (const action of this.actions) {
      this.renderOne(action);
    }
  };

  private renderOne(action: Action): void {
    // The plugin only registers Keypad controllers, so every action is a key.
    if (!action.isKey()) return;
    const { state } = teamsClient;
    if (!state.isInMeeting) {
      void action.setImage(this.config.inactiveIcon);
      void action.setState(0);
      return;
    }
    const active = this.config.isActive(state);
    void action.setImage(active ? this.config.onIcon : this.config.offIcon);
    void action.setState(active ? 0 : 1);
  }
}

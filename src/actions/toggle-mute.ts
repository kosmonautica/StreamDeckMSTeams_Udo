import { action } from "@elgato/streamdeck";
import { teamsClient } from "../teams-client.js";
import { TeamsToggleAction, type ActionConfig } from "./base-action.js";

/**
 * Stream Deck key that toggles Microsoft Teams microphone mute.
 * Green (state 0) = live mic; red (state 1) = muted; grey = not in a meeting.
 */
@action({ UUID: "com.kosmonautica.teams-control.mute" })
export class ToggleMuteAction extends TeamsToggleAction {
  protected readonly config: ActionConfig = {
    isActive: (state) => !state.isMuted,
    toggle: () => teamsClient.toggleMute(),
    onIcon: "imgs/actions/mic-on",
    offIcon: "imgs/actions/mic-off",
    inactiveIcon: "imgs/actions/mic-inactive",
  };
}

import { action } from "@elgato/streamdeck";
import { teamsClient } from "../teams-client.js";
import { TeamsToggleAction, type ActionConfig } from "./base-action.js";

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

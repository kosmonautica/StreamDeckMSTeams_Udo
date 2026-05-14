import { action } from "@elgato/streamdeck";
import { teamsClient } from "../teams-client.js";
import { TeamsToggleAction, type ActionConfig } from "./base-action.js";

/**
 * Stream Deck key that toggles the Microsoft Teams camera.
 * Green (state 0) = camera on; red (state 1) = camera off; grey = not in a meeting.
 */
@action({ UUID: "com.kosmonautica.teams-control.camera" })
export class ToggleCameraAction extends TeamsToggleAction {
  protected readonly config: ActionConfig = {
    isActive: (state) => state.isVideoOn,
    toggle: () => teamsClient.toggleVideo(),
    onIcon: "imgs/actions/camera-on",
    offIcon: "imgs/actions/camera-off",
    inactiveIcon: "imgs/actions/camera-inactive",
  };
}

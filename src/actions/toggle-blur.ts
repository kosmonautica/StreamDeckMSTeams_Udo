import { action } from "@elgato/streamdeck";
import { teamsClient } from "../teams-client.js";
import { TeamsToggleAction, type ActionConfig } from "./base-action.js";

/**
 * Stream Deck key that toggles the Microsoft Teams background blur.
 * Green (state 0) = blur on; red (state 1) = blur off; grey = not in a meeting.
 */
@action({ UUID: "com.kosmonautica.teams-control.blur" })
export class ToggleBlurAction extends TeamsToggleAction {
  protected readonly config: ActionConfig = {
    isActive: (state) => state.isBackgroundBlurred,
    toggle: () => teamsClient.toggleBackgroundBlur(),
    onIcon: "imgs/actions/blur-on",
    offIcon: "imgs/actions/blur-off",
    inactiveIcon: "imgs/actions/blur-inactive",
  };
}

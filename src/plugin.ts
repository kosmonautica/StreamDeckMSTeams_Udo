import streamDeck, { LogLevel } from "@elgato/streamdeck";
import { ToggleMuteAction } from "./actions/toggle-mute.js";
import { ToggleCameraAction } from "./actions/toggle-camera.js";

streamDeck.logger.setLevel(LogLevel.INFO);

streamDeck.actions.registerAction(new ToggleMuteAction());
streamDeck.actions.registerAction(new ToggleCameraAction());

streamDeck.connect();

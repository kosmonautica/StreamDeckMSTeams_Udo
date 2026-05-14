/**
 * Tests for the action-specific logic in ToggleMuteAction and ToggleCameraAction:
 * the isActive predicate, the toggle function, and the icon paths.
 *
 * These tests use inline config objects matching the action definitions to stay
 * independent of the Stream Deck SDK decorator machinery.
 */
import { describe, it, expect, vi } from "vitest";
import type { MeetingState } from "../../teams-client.js";

const BASE: MeetingState = {
  isMuted: false,
  isVideoOn: true,
  isHandRaised: false,
  isInMeeting: true,
  isRecordingOn: false,
  isBackgroundBlurred: false,
  isSharing: false,
};

// ── Mute action config ────────────────────────────────────────────────────────

const muteClient = { toggleMute: vi.fn(), toggleVideo: vi.fn() };

const muteConfig = {
  isActive: (state: MeetingState) => !state.isMuted,
  toggle: () => muteClient.toggleMute(),
  onIcon: "imgs/actions/mic-on",
  offIcon: "imgs/actions/mic-off",
  inactiveIcon: "imgs/actions/mic-inactive",
};

describe("ToggleMuteAction config", () => {
  describe("isActive()", () => {
    it("returns true when mic is live (not muted)", () => {
      expect(muteConfig.isActive({ ...BASE, isMuted: false })).toBe(true);
    });

    it("returns false when muted", () => {
      expect(muteConfig.isActive({ ...BASE, isMuted: true })).toBe(false);
    });
  });

  describe("icons", () => {
    it("onIcon shows active mic", () => {
      expect(muteConfig.onIcon).toContain("mic-on");
    });

    it("offIcon shows muted mic", () => {
      expect(muteConfig.offIcon).toContain("mic-off");
    });

    it("inactiveIcon shows inactive mic", () => {
      expect(muteConfig.inactiveIcon).toContain("mic-inactive");
    });
  });

  describe("toggle()", () => {
    it("calls toggleMute on the Teams client", () => {
      muteConfig.toggle();
      expect(muteClient.toggleMute).toHaveBeenCalledOnce();
    });
  });
});

// ── Camera action config ──────────────────────────────────────────────────────

const cameraClient = { toggleMute: vi.fn(), toggleVideo: vi.fn() };

const cameraConfig = {
  isActive: (state: MeetingState) => state.isVideoOn,
  toggle: () => cameraClient.toggleVideo(),
  onIcon: "imgs/actions/camera-on",
  offIcon: "imgs/actions/camera-off",
  inactiveIcon: "imgs/actions/camera-inactive",
};

describe("ToggleCameraAction config", () => {
  describe("isActive()", () => {
    it("returns true when camera is on", () => {
      expect(cameraConfig.isActive({ ...BASE, isVideoOn: true })).toBe(true);
    });

    it("returns false when camera is off", () => {
      expect(cameraConfig.isActive({ ...BASE, isVideoOn: false })).toBe(false);
    });
  });

  describe("icons", () => {
    it("onIcon shows active camera", () => {
      expect(cameraConfig.onIcon).toContain("camera-on");
    });

    it("offIcon shows camera off", () => {
      expect(cameraConfig.offIcon).toContain("camera-off");
    });

    it("inactiveIcon shows inactive camera", () => {
      expect(cameraConfig.inactiveIcon).toContain("camera-inactive");
    });
  });

  describe("toggle()", () => {
    it("calls toggleVideo on the Teams client", () => {
      cameraConfig.toggle();
      expect(cameraClient.toggleVideo).toHaveBeenCalledOnce();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MeetingState, ConnectionStatus } from "../../teams-client.js";

// ── @elgato/streamdeck mock ───────────────────────────────────────────────────

vi.mock("@elgato/streamdeck", () => ({
  default: {
    settings: { getGlobalSettings: vi.fn(), setGlobalSettings: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    actions: { registerAction: vi.fn() },
    connect: vi.fn(),
  },
  SingletonAction: class FakeSingletonAction {
    _mockActions: ReturnType<typeof makeMockAction>[] = [];
    get actions() {
      return this._mockActions;
    }
  },
  action: () => (cls: unknown) => cls,
  LogLevel: { INFO: "info" },
}));

// ── teams-client mock ─────────────────────────────────────────────────────────

const DEFAULT_MEETING_STATE: MeetingState = {
  isMuted: false,
  isVideoOn: true,
  isHandRaised: false,
  isInMeeting: false,
  isRecordingOn: false,
  isBackgroundBlurred: false,
  isSharing: false,
};

const mockClient = {
  on: vi.fn(),
  off: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  ensureConnected: vi.fn(),
  state: { ...DEFAULT_MEETING_STATE } as MeetingState,
  status: "disconnected" as ConnectionStatus,
  toggleMute: vi.fn(),
  toggleVideo: vi.fn(),
};

vi.mock("../../teams-client.js", () => ({
  teamsClient: mockClient,
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMockAction() {
  return {
    isKey: vi.fn(() => true as const),
    setImage: vi.fn().mockResolvedValue(undefined),
    setState: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
  };
}

/** Creates a concrete subclass of TeamsToggleAction for testing. */
async function makeTestAction(config?: Partial<{
  isActive: (s: MeetingState) => boolean;
  toggle: () => void;
  onIcon: string;
  offIcon: string;
  inactiveIcon: string;
}>) {
  const { TeamsToggleAction } = await import("../../actions/base-action.js");

  class TestAction extends TeamsToggleAction {
    protected readonly config = {
      isActive: config?.isActive ?? (() => true),
      toggle: config?.toggle ?? vi.fn(),
      onIcon: config?.onIcon ?? "imgs/on",
      offIcon: config?.offIcon ?? "imgs/off",
      inactiveIcon: config?.inactiveIcon ?? "imgs/inactive",
    };
  }

  return new TestAction();
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("TeamsToggleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.state = { ...DEFAULT_MEETING_STATE };
    vi.resetModules();
  });

  describe("onWillAppear()", () => {
    it("starts the Teams client", async () => {
      const action = await makeTestAction();
      await action.onWillAppear({ action: makeMockAction() } as never);
      expect(mockClient.start).toHaveBeenCalledOnce();
    });

    it("subscribes to 'state' and 'status' events", async () => {
      const action = await makeTestAction();
      await action.onWillAppear({ action: makeMockAction() } as never);
      expect(mockClient.on).toHaveBeenCalledWith("state", expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith("status", expect.any(Function));
    });

    it("renders the key immediately", async () => {
      const action = await makeTestAction();
      const mockAction = makeMockAction();
      await action.onWillAppear({ action: mockAction } as never);
      // Not in meeting → inactive icon expected
      expect(mockAction.setImage).toHaveBeenCalledWith("imgs/inactive");
    });
  });

  describe("onWillDisappear()", () => {
    it("unsubscribes from 'state' and 'status' events", async () => {
      const action = await makeTestAction();
      const mockAction = makeMockAction();
      await action.onWillAppear({ action: mockAction } as never);
      action.onWillDisappear({ action: mockAction } as never);
      expect(mockClient.off).toHaveBeenCalledWith("state", expect.any(Function));
      expect(mockClient.off).toHaveBeenCalledWith("status", expect.any(Function));
    });
  });

  describe("onKeyDown() – not in a meeting", () => {
    it("does NOT call toggle when isInMeeting is false", async () => {
      const toggleFn = vi.fn();
      const action = await makeTestAction({ toggle: toggleFn });
      mockClient.state.isInMeeting = false;
      action.onKeyDown({} as never);
      expect(toggleFn).not.toHaveBeenCalled();
    });

    it("still kicks a reconnect attempt", async () => {
      const action = await makeTestAction();
      mockClient.state.isInMeeting = false;
      action.onKeyDown({} as never);
      expect(mockClient.ensureConnected).toHaveBeenCalledOnce();
    });
  });

  describe("onKeyDown() – in a meeting", () => {
    it("calls the toggle function", async () => {
      const toggleFn = vi.fn();
      const action = await makeTestAction({ toggle: toggleFn });
      mockClient.state.isInMeeting = true;
      action.onKeyDown({} as never);
      expect(toggleFn).toHaveBeenCalledOnce();
    });
  });

  describe("rendering – not in a meeting", () => {
    it("shows the inactive icon", async () => {
      const action = await makeTestAction({ inactiveIcon: "imgs/inactive-test" });
      const mockAction = makeMockAction();
      (action as unknown as { _mockActions: unknown[] })._mockActions = [mockAction];
      mockClient.state.isInMeeting = false;
      await action.onWillAppear({ action: mockAction } as never);
      expect(mockAction.setImage).toHaveBeenCalledWith("imgs/inactive-test");
    });

    it("sets state index to 0", async () => {
      const action = await makeTestAction();
      const mockAction = makeMockAction();
      mockClient.state.isInMeeting = false;
      await action.onWillAppear({ action: mockAction } as never);
      expect(mockAction.setState).toHaveBeenCalledWith(0);
    });
  });

  describe("rendering – in a meeting, feature active", () => {
    it("shows the on-icon", async () => {
      const action = await makeTestAction({
        isActive: () => true,
        onIcon: "imgs/active",
        offIcon: "imgs/inactive",
      });
      const mockAction = makeMockAction();
      mockClient.state.isInMeeting = true;
      await action.onWillAppear({ action: mockAction } as never);
      expect(mockAction.setImage).toHaveBeenCalledWith("imgs/active");
    });

    it("sets state index to 0 (active / normal state)", async () => {
      const action = await makeTestAction({ isActive: () => true });
      const mockAction = makeMockAction();
      mockClient.state.isInMeeting = true;
      await action.onWillAppear({ action: mockAction } as never);
      expect(mockAction.setState).toHaveBeenCalledWith(0);
    });
  });

  describe("rendering – in a meeting, feature inactive", () => {
    it("shows the off-icon", async () => {
      const action = await makeTestAction({
        isActive: () => false,
        onIcon: "imgs/on",
        offIcon: "imgs/off-test",
      });
      const mockAction = makeMockAction();
      mockClient.state.isInMeeting = true;
      await action.onWillAppear({ action: mockAction } as never);
      expect(mockAction.setImage).toHaveBeenCalledWith("imgs/off-test");
    });

    it("sets state index to 1 (alert state)", async () => {
      const action = await makeTestAction({ isActive: () => false });
      const mockAction = makeMockAction();
      mockClient.state.isInMeeting = true;
      await action.onWillAppear({ action: mockAction } as never);
      expect(mockAction.setState).toHaveBeenCalledWith(1);
    });
  });

  describe("rendering – isKey() returns false (e.g. dial)", () => {
    it("skips the action silently", async () => {
      const action = await makeTestAction();
      const mockAction = makeMockAction();
      mockAction.isKey.mockReturnValue(false);
      await action.onWillAppear({ action: mockAction } as never);
      expect(mockAction.setImage).not.toHaveBeenCalled();
    });
  });
});

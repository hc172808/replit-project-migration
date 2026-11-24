import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  idleActivityStorageKey,
  idleLockPreferenceKey,
  IDLE_SESSION_TIMEOUT_MS,
  readIdleLockEnabled,
  saveIdleLockEnabled,
  subscribeIdleLockPreference,
  watchIdleSession,
} from "@/lib/idle-session";

describe("idle session timeout", () => {
  const originalVisibilityState = document.visibilityState;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T12:00:00Z"));
    localStorage.clear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: originalVisibilityState,
    });
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("expires after 15 minutes without activity", () => {
    const onIdle = vi.fn();
    const stop = watchIdleSession({ userId: "user-1", onIdle });

    vi.advanceTimersByTime(IDLE_SESSION_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
    stop();
  });

  it("resets the timeout after keyboard and pointer activity", () => {
    const onIdle = vi.fn();
    const stop = watchIdleSession({ userId: "user-1", onIdle });

    vi.advanceTimersByTime(IDLE_SESSION_TIMEOUT_MS - 1000);
    document.dispatchEvent(new Event("pointerdown"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    vi.advanceTimersByTime(IDLE_SESSION_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
    stop();
  });

  it("shares activity with other tabs for the same user", () => {
    const userId = "user-1";
    const onIdle = vi.fn();
    const stop = watchIdleSession({ userId, onIdle });

    vi.advanceTimersByTime(14 * 60 * 1000);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: idleActivityStorageKey(userId),
        newValue: String(Date.now()),
      }),
    );
    vi.advanceTimersByTime(IDLE_SESSION_TIMEOUT_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
    stop();
  });

  it("saves the automatic-lock choice for this browser and syncs it immediately", () => {
    const userId = "user-1";
    const changes = vi.fn();
    const unsubscribe = subscribeIdleLockPreference(userId, changes);

    expect(readIdleLockEnabled(userId)).toBe(true);
    saveIdleLockEnabled(userId, false);
    expect(localStorage.getItem(idleLockPreferenceKey(userId))).toBe("disabled");
    expect(readIdleLockEnabled(userId)).toBe(false);
    expect(changes).toHaveBeenLastCalledWith(false);

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: idleLockPreferenceKey(userId),
        newValue: null,
      }),
    );
    expect(changes).toHaveBeenLastCalledWith(true);

    saveIdleLockEnabled(userId, true);
    expect(localStorage.getItem(idleLockPreferenceKey(userId))).toBeNull();
    expect(readIdleLockEnabled(userId)).toBe(true);
    expect(changes).toHaveBeenLastCalledWith(true);
    unsubscribe();
  });
});

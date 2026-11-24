export const IDLE_SESSION_TIMEOUT_MS = 15 * 60 * 1000;

export function idleActivityStorageKey(userId: string) {
  return `gyds:last-activity:${userId}`;
}

type IdleSessionOptions = {
  userId: string;
  onIdle: () => void;
  timeoutMs?: number;
  windowTarget?: Window;
  documentTarget?: Document;
  now?: () => number;
};

/** Watch for meaningful activity across this user's open dashboard tabs. */
export function watchIdleSession({
  userId,
  onIdle,
  timeoutMs = IDLE_SESSION_TIMEOUT_MS,
  windowTarget = window,
  documentTarget = document,
  now = Date.now,
}: IdleSessionOptions): () => void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("The idle timeout must be a positive number.");
  }

  const storageKey = idleActivityStorageKey(userId);
  let stopped = false;
  let didExpire = false;
  let timer: number | undefined;
  let lastActivityAt = now();
  let lastPublishedAt = 0;

  const readSharedActivity = () => {
    try {
      const value = Number(windowTarget.localStorage.getItem(storageKey));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  };

  const publishActivity = (timestamp: number) => {
    if (timestamp - lastPublishedAt < 1000) return;
    try {
      windowTarget.localStorage.setItem(storageKey, String(timestamp));
      lastPublishedAt = timestamp;
    } catch {
      // Keep the per-tab timeout working if browser storage is unavailable.
    }
  };

  const checkDeadline = () => {
    if (stopped || didExpire) return;
    lastActivityAt = Math.max(lastActivityAt, readSharedActivity());
    const remaining = timeoutMs - (now() - lastActivityAt);
    if (remaining <= 0) {
      didExpire = true;
      onIdle();
      return;
    }
    timer = windowTarget.setTimeout(checkDeadline, Math.ceil(remaining));
  };

  const scheduleCheck = () => {
    if (timer !== undefined) windowTarget.clearTimeout(timer);
    timer = undefined;
    checkDeadline();
  };

  const recordActivity = () => {
    if (stopped || didExpire || documentTarget.visibilityState === "hidden") return;
    lastActivityAt = Math.max(now(), readSharedActivity());
    publishActivity(lastActivityAt);
    scheduleCheck();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== storageKey || event.newValue === null) return;
    const timestamp = Number(event.newValue);
    if (!Number.isFinite(timestamp) || timestamp <= lastActivityAt) return;
    lastActivityAt = timestamp;
    lastPublishedAt = Math.max(lastPublishedAt, timestamp);
    scheduleCheck();
  };

  const checkOnReturn = () => {
    if (documentTarget.visibilityState === "visible") scheduleCheck();
  };

  const activityEvents: Array<keyof DocumentEventMap> = [
    "pointerdown",
    "pointermove",
    "keydown",
    "touchstart",
    "wheel",
    "scroll",
  ];
  for (const eventName of activityEvents) {
    documentTarget.addEventListener(eventName, recordActivity, { capture: true, passive: true });
  }
  documentTarget.addEventListener("visibilitychange", checkOnReturn);
  windowTarget.addEventListener("focus", checkOnReturn);
  windowTarget.addEventListener("storage", onStorage);

  lastActivityAt = Math.max(lastActivityAt, readSharedActivity());
  publishActivity(lastActivityAt);
  scheduleCheck();

  return () => {
    stopped = true;
    if (timer !== undefined) windowTarget.clearTimeout(timer);
    for (const eventName of activityEvents) {
      documentTarget.removeEventListener(eventName, recordActivity, true);
    }
    documentTarget.removeEventListener("visibilitychange", checkOnReturn);
    windowTarget.removeEventListener("focus", checkOnReturn);
    windowTarget.removeEventListener("storage", onStorage);
  };
}

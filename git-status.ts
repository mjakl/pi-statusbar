import { spawn } from "node:child_process";
import { resolve } from "node:path";

import type { GitStatus } from "./types.js";

interface GitCommandResult {
  stdout: string;
  code: number | null;
}

interface CachedGitStatus {
  staged: number;
  unstaged: number;
  untracked: number;
  timestamp: number;
}

const CACHE_TTL_MS = 1000;
const STATUS_GIT_TIMEOUT_MS = 1500;
const FAILURE_BACKOFF_BASE_MS = 1000;
const FAILURE_BACKOFF_MAX_MS = 5000;
const KILL_GRACE_MS = 100;
const MAX_AUTOMATIC_RETRIES = 3;

let currentCwd = resolve(process.cwd());
let cachedStatus: CachedGitStatus | null = null;
let pendingFetch: Promise<void> | null = null;
let invalidationCounter = 0;
let forceStatusRefresh = true;
let statusFailureCount = 0;
let nextStatusFetchAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const statusChangeListeners = new Set<() => void>();

function getFailureBackoffMs(failureCount: number): number {
  const multiplier = 2 ** Math.max(0, failureCount - 1);
  return Math.min(FAILURE_BACKOFF_BASE_MS * multiplier, FAILURE_BACKOFF_MAX_MS);
}

/**
 * Parse `git status --porcelain` output.
 *
 * Format: XY filename
 * X = index status, Y = working tree status
 * ?? = untracked
 */
export function parseGitStatusOutput(output: string): Pick<GitStatus, "staged" | "unstaged" | "untracked"> {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;

  for (const line of output.split("\n")) {
    if (!line) continue;
    const x = line[0];
    const y = line[1];

    if (x === "?" && y === "?") {
      untracked++;
      continue;
    }

    if (x && x !== " " && x !== "?") {
      staged++;
    }

    if (y && y !== " ") {
      unstaged++;
    }
  }

  return { staged, unstaged, untracked };
}

function runGit(args: string[], cwd: string, timeoutMs: number): Promise<GitCommandResult | null> {
  return new Promise((resolveResult) => {
    const proc = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let stdout = "";
    let settled = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: GitCommandResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolveResult(result);
    };

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.on("close", (code) => {
      // Keep porcelain output byte-for-byte: its leading column is significant.
      finish(timedOut ? null : { stdout, code });
    });

    proc.on("error", () => {
      finish(null);
    });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      if (!proc.kill()) {
        finish(null);
        return;
      }

      killTimer = setTimeout(() => {
        proc.kill("SIGKILL");
        finish(null);
      }, KILL_GRACE_MS);
    }, timeoutMs);
  });
}

async function fetchGitStatus(cwd: string): Promise<Pick<GitStatus, "staged" | "unstaged" | "untracked"> | null> {
  const result = await runGit(["status", "--porcelain"], cwd, STATUS_GIT_TIMEOUT_MS);
  if (result === null) return null;

  // A non-repository is a valid clean state, not a transient failure to retry.
  return result.code === 0
    ? parseGitStatusOutput(result.stdout)
    : { staged: 0, unstaged: 0, untracked: 0 };
}

function statusesEqual(
  cached: CachedGitStatus | null,
  next: Pick<GitStatus, "staged" | "unstaged" | "untracked">,
): boolean {
  return cached !== null
    && cached.staged === next.staged
    && cached.unstaged === next.unstaged
    && cached.untracked === next.untracked;
}

function notifyStatusChanged(): void {
  for (const listener of statusChangeListeners) {
    listener();
  }
}

function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function recordFetchFailure(): void {
  statusFailureCount += 1;
  nextStatusFetchAt = Date.now() + getFailureBackoffMs(statusFailureCount);
  clearRetryTimer();

  if (statusFailureCount <= MAX_AUTOMATIC_RETRIES) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      startStatusFetch();
    }, Math.max(1, nextStatusFetchAt - Date.now()));
  }
}

function startStatusFetch(): void {
  const now = Date.now();
  if (pendingFetch || now < nextStatusFetchAt) {
    return;
  }

  const fetchCwd = currentCwd;
  const fetchId = invalidationCounter;
  let promise!: Promise<void>;

  promise = fetchGitStatus(fetchCwd)
    .then((result) => {
      if (fetchCwd !== currentCwd || fetchId !== invalidationCounter) {
        return;
      }

      if (result === null) {
        recordFetchFailure();
        return;
      }

      const changed = !statusesEqual(cachedStatus, result);
      cachedStatus = { ...result, timestamp: Date.now() };
      forceStatusRefresh = false;
      statusFailureCount = 0;
      nextStatusFetchAt = 0;
      clearRetryTimer();

      if (changed) {
        notifyStatusChanged();
      }
    })
    .catch(() => {
      if (fetchCwd === currentCwd && fetchId === invalidationCounter) {
        recordFetchFailure();
      }
    })
    .finally(() => {
      if (pendingFetch !== promise) {
        return;
      }

      pendingFetch = null;

      // An invalidation during the fetch discarded its result. Start the
      // replacement fetch without waiting for unrelated UI activity.
      if (fetchCwd === currentCwd && fetchId !== invalidationCounter) {
        startStatusFetch();
      }
    });

  pendingFetch = promise;
}

export function setGitStatusCwd(cwd: string): void {
  const resolvedCwd = resolve(cwd);
  if (resolvedCwd === currentCwd) {
    return;
  }

  currentCwd = resolvedCwd;
  cachedStatus = null;
  pendingFetch = null;
  invalidationCounter += 1;
  forceStatusRefresh = true;
  statusFailureCount = 0;
  nextStatusFetchAt = 0;
  clearRetryTimer();
}

export function subscribeGitStatus(listener: () => void): () => void {
  statusChangeListeners.add(listener);
  return () => statusChangeListeners.delete(listener);
}

/**
 * Return the last known counters and refresh them asynchronously when stale.
 * Branch updates come from Pi's cwd-aware footer data provider.
 */
export function getGitStatus(providerBranch: string | null, cwd: string): GitStatus {
  setGitStatusCwd(cwd);

  const now = Date.now();
  const hasFreshCache = cachedStatus !== null && now - cachedStatus.timestamp < CACHE_TTL_MS;
  if (!hasFreshCache || forceStatusRefresh) {
    startStatusFetch();
  }

  const status = cachedStatus;
  return {
    branch: providerBranch,
    staged: status?.staged ?? 0,
    unstaged: status?.unstaged ?? 0,
    untracked: status?.untracked ?? 0,
  };
}

/** Keep the last known values while forcing a completion-driven refresh. */
export function invalidateGitStatus(): void {
  invalidationCounter += 1;
  forceStatusRefresh = true;
  statusFailureCount = 0;
  nextStatusFetchAt = 0;
  clearRetryTimer();

  if (!pendingFetch) {
    startStatusFetch();
  }
}

export function disposeGitStatus(): void {
  invalidationCounter += 1;
  pendingFetch = null;
  forceStatusRefresh = true;
  statusFailureCount = 0;
  nextStatusFetchAt = 0;
  clearRetryTimer();
}

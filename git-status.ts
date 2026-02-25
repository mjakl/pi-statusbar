import { spawn } from "node:child_process";
import type { GitStatus } from "./types.js";

interface CachedGitStatus {
  staged: number;
  unstaged: number;
  untracked: number;
  timestamp: number;
}

interface CachedBranch {
  branch: string | null;
  timestamp: number;
}

const CACHE_TTL_MS = 1000; // 1 second for file status
const BRANCH_TTL_MS = 500; // Shorter TTL so branch updates quickly after invalidation

const DEFAULT_GIT_TIMEOUT_MS = 600;
const STATUS_GIT_TIMEOUT_MS = 1500;
const FAILURE_BACKOFF_BASE_MS = 1000;
const FAILURE_BACKOFF_MAX_MS = 5000;

let cachedStatus: CachedGitStatus | null = null;
let cachedBranch: CachedBranch | null = null;
let pendingFetch: Promise<void> | null = null;
let pendingBranchFetch: Promise<void> | null = null;
let invalidationCounter = 0; // Track invalidations to prevent stale updates
let branchInvalidationCounter = 0;
let forceStatusRefresh = false;
let forceBranchRefresh = false;
let statusFailureCount = 0;
let branchFailureCount = 0;
let nextStatusFetchAt = 0;
let nextBranchFetchAt = 0;

function getFailureBackoffMs(failureCount: number): number {
  const multiplier = 2 ** Math.max(0, failureCount - 1);
  return Math.min(FAILURE_BACKOFF_BASE_MS * multiplier, FAILURE_BACKOFF_MAX_MS);
}

/**
 * Parse git status --porcelain output
 * 
 * Format: XY filename
 * X = index status, Y = working tree status
 * ?? = untracked
 * Other X values = staged
 * Other Y values = unstaged
 */
function parseGitStatusOutput(output: string): { staged: number; unstaged: number; untracked: number } {
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

    // X position (index/staged)
    if (x && x !== " " && x !== "?") {
      staged++;
    }

    // Y position (working tree/unstaged)
    if (y && y !== " ") {
      unstaged++;
    }
  }

  return { staged, unstaged, untracked };
}

function runGit(args: string[], timeoutMs = DEFAULT_GIT_TIMEOUT_MS): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let resolved = false;

    const finish = (result: string | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.on("close", (code) => {
      finish(code === 0 ? stdout.trim() : null);
    });

    proc.on("error", () => {
      finish(null);
    });

    const timeoutId = setTimeout(() => {
      proc.kill();
      finish(null);
    }, timeoutMs);
  });
}

/**
 * Fetch current git branch asynchronously.
 * For detached HEAD, returns the short commit SHA (matches provider's "detached" behavior).
 */
async function fetchGitBranch(): Promise<string | null> {
  const branch = await runGit(["branch", "--show-current"]);
  if (branch === null) return null;
  if (branch) return branch;

  const sha = await runGit(["rev-parse", "--short", "HEAD"]);
  return sha ? `${sha} (detached)` : "detached";
}

/**
 * Fetch git status asynchronously
 */
async function fetchGitStatus(): Promise<{ staged: number; unstaged: number; untracked: number } | null> {
  const output = await runGit(["status", "--porcelain"], STATUS_GIT_TIMEOUT_MS);
  if (output === null) return null;
  return parseGitStatusOutput(output);
}

/**
 * Get the current git branch with caching.
 * Falls back to provider branch if our cache is empty.
 */
export function getCurrentBranch(providerBranch: string | null): string | null {
  const now = Date.now();
  const hasFreshCache = cachedBranch !== null && now - cachedBranch.timestamp < BRANCH_TTL_MS;

  // Return cached if fresh and no forced refresh pending.
  if (hasFreshCache && !forceBranchRefresh) {
    return cachedBranch.branch;
  }

  // Trigger background fetch if not already pending and not in backoff.
  if (!pendingBranchFetch && now >= nextBranchFetchAt) {
    const fetchId = branchInvalidationCounter;
    pendingBranchFetch = fetchGitBranch()
      .then((result) => {
        if (fetchId !== branchInvalidationCounter) {
          return;
        }

        if (result !== null) {
          cachedBranch = {
            branch: result,
            timestamp: Date.now(),
          };
          forceBranchRefresh = false;
          branchFailureCount = 0;
          nextBranchFetchAt = 0;
          return;
        }

        branchFailureCount += 1;
        nextBranchFetchAt = Date.now() + getFailureBackoffMs(branchFailureCount);
      })
      .catch(() => {
        if (fetchId !== branchInvalidationCounter) {
          return;
        }

        branchFailureCount += 1;
        nextBranchFetchAt = Date.now() + getFailureBackoffMs(branchFailureCount);
      })
      .finally(() => {
        pendingBranchFetch = null;
      });
  }

  // Return stale cache while refreshing; only use provider before first fetch.
  return cachedBranch ? cachedBranch.branch : providerBranch;
}

/**
 * Get git status with caching.
 * Returns cached value if within TTL, otherwise triggers async fetch.
 * This is designed for synchronous render() calls - returns last known value
 * while refreshing in background.
 */
export function getGitStatus(providerBranch: string | null): GitStatus {
  const now = Date.now();
  const branch = getCurrentBranch(providerBranch);
  const hasFreshCache = cachedStatus !== null && now - cachedStatus.timestamp < CACHE_TTL_MS;

  // Return cached if fresh and no forced refresh pending.
  if (hasFreshCache && !forceStatusRefresh) {
    return {
      branch,
      staged: cachedStatus.staged,
      unstaged: cachedStatus.unstaged,
      untracked: cachedStatus.untracked,
    };
  }

  // Trigger background fetch if not already pending and not in backoff.
  if (!pendingFetch && now >= nextStatusFetchAt) {
    const fetchId = invalidationCounter;
    pendingFetch = fetchGitStatus()
      .then((result) => {
        if (fetchId !== invalidationCounter) {
          return;
        }

        if (result) {
          cachedStatus = {
            staged: result.staged,
            unstaged: result.unstaged,
            untracked: result.untracked,
            timestamp: Date.now(),
          };
          forceStatusRefresh = false;
          statusFailureCount = 0;
          nextStatusFetchAt = 0;
          return;
        }

        statusFailureCount += 1;
        nextStatusFetchAt = Date.now() + getFailureBackoffMs(statusFailureCount);
      })
      .catch(() => {
        if (fetchId !== invalidationCounter) {
          return;
        }

        statusFailureCount += 1;
        nextStatusFetchAt = Date.now() + getFailureBackoffMs(statusFailureCount);
      })
      .finally(() => {
        pendingFetch = null;
      });
  }

  // Return last cached or empty.
  if (cachedStatus) {
    return {
      branch,
      staged: cachedStatus.staged,
      unstaged: cachedStatus.unstaged,
      untracked: cachedStatus.untracked,
    };
  }

  return { branch, staged: 0, unstaged: 0, untracked: 0 };
}

/**
 * Force refresh git status (call when you know files changed).
 * Keeps last known values to avoid UI flicker while refresh is in-flight.
 */
export function invalidateGitStatus(): void {
  invalidationCounter++; // Invalidate any pending fetch result
  forceStatusRefresh = true;
  nextStatusFetchAt = 0;
}

/**
 * Force refresh git branch (call when you know branch might have changed).
 * Keeps last known value to avoid UI flicker while refresh is in-flight.
 */
export function invalidateGitBranch(): void {
  branchInvalidationCounter++;
  forceBranchRefresh = true;
  nextBranchFetchAt = 0;
}

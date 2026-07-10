import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  getGitStatus,
  invalidateGitStatus,
  parseGitStatusOutput,
  setGitStatusCwd,
  subscribeGitStatus,
} from "../git-status.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

function waitForStatusChange(): { promise: Promise<void>; unsubscribe: () => void } {
  let unsubscribe = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for Git status refresh"));
    }, 3000);

    unsubscribe = subscribeGitStatus(() => {
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
  return { promise, unsubscribe };
}

test("porcelain parser preserves staged and unstaged columns", () => {
  assert.deepEqual(parseGitStatusOutput(" M unstaged.ts\n"), {
    staged: 0,
    unstaged: 1,
    untracked: 0,
  });

  assert.deepEqual(parseGitStatusOutput("M  staged.ts\nMM both.ts\n?? new.ts\n"), {
    staged: 2,
    unstaged: 1,
    untracked: 1,
  });
});

test("async refresh publishes completed status for the selected cwd", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "pi-statusbar-git-"));

  try {
    await git(cwd, "init", "-q", "-b", "main");
    await git(cwd, "config", "user.email", "test@example.com");
    await git(cwd, "config", "user.name", "Test");
    await writeFile(path.join(cwd, "tracked.txt"), "before\n");
    await git(cwd, "add", "tracked.txt");
    await git(cwd, "commit", "-qm", "initial");
    await writeFile(path.join(cwd, "tracked.txt"), "after\n");

    setGitStatusCwd(cwd);
    const update = waitForStatusChange();
    invalidateGitStatus();

    assert.deepEqual(getGitStatus("main", cwd), {
      branch: "main",
      staged: 0,
      unstaged: 0,
      untracked: 0,
    });

    await update.promise;
    assert.deepEqual(getGitStatus("main", cwd), {
      branch: "main",
      staged: 0,
      unstaged: 1,
      untracked: 0,
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("config respects PI_CODING_AGENT_DIR and filters invalid colors", async () => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), "pi-statusbar-config-"));
  const projectDir = path.resolve(import.meta.dirname, "..");
  const script = `
    import { getStatusbarConfigPath, loadStatusbarConfig, saveStatusbarConfig } from "./config.ts";
    const saved = saveStatusbarConfig({ preset: "focused", theme: { model: "primary", path: "#00afaf" } });
    console.log(JSON.stringify({ saved, path: getStatusbarConfigPath(), config: loadStatusbarConfig() }));
  `;

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: projectDir,
        env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
      },
    );

    const result = JSON.parse(stdout.trim()) as {
      saved: boolean;
      path: string;
      config: { preset?: string; theme?: Record<string, string> };
    };

    assert.equal(result.saved, true);
    assert.equal(result.path, path.join(agentDir, "extensions", "pi-statusbar.json"));
    assert.equal(result.config.preset, "focused");
    assert.deepEqual(result.config.theme, { path: "#00afaf" });

    const stored = JSON.parse(await readFile(result.path, "utf8"));
    assert.deepEqual(stored.theme, { path: "#00afaf" });
  } finally {
    await rm(agentDir, { recursive: true, force: true });
  }
});

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { ColorScheme } from "./types.js";

export interface StatusbarConfig {
  preset?: string;
  theme?: ColorScheme;
  [key: string]: unknown;
}

const CONFIG_PATH = join(homedir(), ".pi", "agent", "extensions", "pi-statusbar.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTheme(themeValue: unknown): ColorScheme | undefined {
  if (!isRecord(themeValue)) {
    return undefined;
  }

  // Backward-compatible shape support: { theme: { colors: { ... } } }
  const nestedColors = themeValue.colors;
  if (isRecord(nestedColors)) {
    return nestedColors as ColorScheme;
  }

  return themeValue as ColorScheme;
}

function readRawConfig(): StatusbarConfig {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return {};
    }

    const content = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(content);
    if (!isRecord(parsed)) {
      return {};
    }

    return parsed as StatusbarConfig;
  } catch {
    return {};
  }
}

export function getStatusbarConfigPath(): string {
  return CONFIG_PATH;
}

export function loadStatusbarConfig(): StatusbarConfig {
  const raw = readRawConfig();
  const theme = normalizeTheme(raw.theme);

  return {
    ...raw,
    preset: typeof raw.preset === "string" ? raw.preset : undefined,
    theme,
  };
}

export function saveStatusbarConfig(update: Partial<StatusbarConfig>): void {
  try {
    const current = readRawConfig();
    const merged: StatusbarConfig = {
      ...current,
      ...update,
    };

    // Keep theme normalized when writing.
    if (Object.prototype.hasOwnProperty.call(update, "theme")) {
      merged.theme = normalizeTheme(update.theme);
    }

    const directory = dirname(CONFIG_PATH);
    mkdirSync(directory, { recursive: true });
    writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  } catch {
    // Ignore write failures to avoid breaking command flow.
  }
}

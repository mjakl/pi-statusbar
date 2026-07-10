import type { ThemeColor } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { SEMANTIC_COLORS, type ColorScheme, type ColorValue } from "./types.js";

export interface StatusbarConfig {
  preset?: string;
  theme?: ColorScheme;
  [key: string]: unknown;
}

const CONFIG_PATH = join(getAgentDir(), "extensions", "pi-statusbar.json");

const PI_THEME_COLORS = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "userMessageText",
  "customMessageText",
  "customMessageLabel",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "thinkingMax",
  "bashMode",
] as const satisfies readonly ThemeColor[];

const PI_THEME_COLOR_SET = new Set<string>(PI_THEME_COLORS);
const SEMANTIC_COLOR_SET = new Set<string>(SEMANTIC_COLORS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeColor(value: unknown): ColorValue | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value as `#${string}`;
  }

  return PI_THEME_COLOR_SET.has(value) ? value as ThemeColor : undefined;
}

function normalizeTheme(themeValue: unknown): ColorScheme | undefined {
  if (!isRecord(themeValue)) {
    return undefined;
  }

  // Backward-compatible shape support: { theme: { colors: { ... } } }
  const source = isRecord(themeValue.colors) ? themeValue.colors : themeValue;
  const theme: ColorScheme = {};

  for (const [key, value] of Object.entries(source)) {
    if (!SEMANTIC_COLOR_SET.has(key)) {
      continue;
    }

    const color = normalizeColor(value);
    if (color) {
      theme[key as keyof ColorScheme] = color;
    }
  }

  return theme;
}

function readRawConfig(): StatusbarConfig {
  try {
    if (!existsSync(CONFIG_PATH)) {
      return {};
    }

    const content = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? parsed as StatusbarConfig : {};
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

export function saveStatusbarConfig(update: Partial<StatusbarConfig>): boolean {
  try {
    const current = readRawConfig();
    const merged: StatusbarConfig = {
      ...current,
      ...update,
    };

    if (Object.prototype.hasOwnProperty.call(update, "theme")) {
      merged.theme = normalizeTheme(update.theme);
    }

    const directory = dirname(CONFIG_PATH);
    mkdirSync(directory, { recursive: true });
    writeFileSync(CONFIG_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}

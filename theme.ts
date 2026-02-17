/**
 * Theme system for pi-statusbar
 *
 * Colors are resolved in order:
 * 1. User overrides from ~/.pi/agent/extensions/pi-statusbar.json (theme)
 * 2. Legacy overrides from extension-local theme.json (if present)
 * 3. Preset colors
 * 4. Default colors
 */

import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadStatusbarConfig } from "./config.js";
import type { ColorScheme, ColorValue, SemanticColor } from "./types.js";

const DEFAULT_COLORS: Required<ColorScheme> = {
  pi: "accent",
  model: "#d787af",
  path: "#00afaf",
  git: "success",
  gitDirty: "warning",
  gitClean: "success",
  thinking: "muted",
  thinkingHigh: "accent",
  context: "dim",
  contextWarn: "warning",
  contextError: "error",
  cost: "text",
  tokens: "muted",
  separator: "dim",
  border: "borderMuted",
};

const RAINBOW_COLORS = [
  "#b281d6", "#d787af", "#febc38", "#e4c00f",
  "#89d281", "#00afaf", "#178fb9", "#b281d6",
];

let userThemeCache: ColorScheme | null = null;
let userThemeCacheTime = 0;
const CACHE_TTL_MS = 5000;

function getLegacyThemePath(): string {
  const extDir = dirname(fileURLToPath(import.meta.url));
  return join(extDir, "theme.json");
}

function loadLegacyTheme(): ColorScheme {
  const legacyThemePath = getLegacyThemePath();
  try {
    if (!existsSync(legacyThemePath)) {
      return {};
    }

    const content = readFileSync(legacyThemePath, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      return (parsed.colors ?? parsed.theme ?? {}) as ColorScheme;
    }
  } catch {
    // Ignore malformed legacy files
  }

  return {};
}

function loadUserTheme(): ColorScheme {
  const now = Date.now();
  if (userThemeCache && now - userThemeCacheTime < CACHE_TTL_MS) {
    return userThemeCache;
  }

  const configTheme = loadStatusbarConfig().theme;
  userThemeCache = configTheme ?? loadLegacyTheme();
  userThemeCacheTime = now;
  return userThemeCache;
}

export function resolveColor(
  semantic: SemanticColor,
  presetColors?: ColorScheme,
): ColorValue {
  const userTheme = loadUserTheme();
  return userTheme[semantic]
    ?? presetColors?.[semantic]
    ?? DEFAULT_COLORS[semantic];
}

function isHexColor(color: ColorValue): color is `#${string}` {
  return typeof color === "string" && color.startsWith("#");
}

function hexToAnsi(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function applyColor(theme: Theme, color: ColorValue, text: string): string {
  if (isHexColor(color)) {
    return `${hexToAnsi(color)}${text}\x1b[0m`;
  }
  return theme.fg(color as ThemeColor, text);
}

export function fg(
  theme: Theme,
  semantic: SemanticColor,
  text: string,
  presetColors?: ColorScheme,
): string {
  return applyColor(theme, resolveColor(semantic, presetColors), text);
}

export function rainbow(text: string): string {
  let result = "";
  let colorIndex = 0;
  for (const char of text) {
    if (char === " " || char === ":") {
      result += char;
    } else {
      result += hexToAnsi(RAINBOW_COLORS[colorIndex % RAINBOW_COLORS.length]) + char;
      colorIndex++;
    }
  }
  return result + "\x1b[0m";
}

export function getDefaultColors(): Required<ColorScheme> {
  return { ...DEFAULT_COLORS };
}

export function clearThemeCache(): void {
  userThemeCache = null;
  userThemeCacheTime = 0;
}

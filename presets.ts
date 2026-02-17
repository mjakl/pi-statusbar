import type { ColorScheme, PresetDef, StatusLinePreset, StatusLineSegmentOptions } from "./types.js";
import { getDefaultColors } from "./theme.js";

// Single source of truth for base semantic colors.
const DEFAULT_COLORS: ColorScheme = getDefaultColors();

// Slightly flatter palette for low-noise presets.
const MINIMAL_COLORS: ColorScheme = {
  ...DEFAULT_COLORS,
  pi: "dim",
  model: "text",
  path: "text",
  git: "dim",
  gitClean: "dim",
};

// More saturated palette for dense setups.
const NERD_COLORS: ColorScheme = {
  ...DEFAULT_COLORS,
  pi: "accent",
  model: "accent",
  path: "success",
  tokens: "primary",
  cost: "warning",
};

const GIT_ALL: NonNullable<StatusLineSegmentOptions["git"]> = {
  showBranch: true,
  showStaged: true,
  showUnstaged: true,
  showUntracked: true,
};

const GIT_BRANCH_ONLY: NonNullable<StatusLineSegmentOptions["git"]> = {
  showBranch: true,
  showStaged: false,
  showUnstaged: false,
  showUntracked: false,
};

const GIT_NO_UNTRACKED: NonNullable<StatusLineSegmentOptions["git"]> = {
  showBranch: true,
  showStaged: true,
  showUnstaged: true,
  showUntracked: false,
};

/**
 * Presets are intentionally simple to edit:
 *
 * - leftSegments/rightSegments/secondarySegments define order and placement.
 * - separator controls visual separators between segments.
 * - segmentOptions adjusts per-segment behavior (path/git/model/time).
 * - colors swaps semantic color mappings per preset.
 */
export const PRESETS: Record<StatusLinePreset, PresetDef> = {
  // Balanced default: practical signal with one compact overflow line.
  default: {
    leftSegments: ["pi", "model", "thinking", "path", "git", "context_pct", "cache_read", "cost"],
    rightSegments: [],
    secondarySegments: ["extension_statuses"],
    separator: "powerline-thin",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "basename" },
      git: GIT_ALL,
    },
  },

  // Like default, but without cache-read and cost segments.
  focused: {
    leftSegments: ["pi", "path", "model", "thinking", "context_pct", "git"],
    rightSegments: [],
    secondarySegments: ["extension_statuses"],
    separator: "powerline-thin",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "basename" },
      git: GIT_ALL,
    },
  },

  // Lowest-noise preset for narrow terminals.
  minimal: {
    leftSegments: ["path", "git"],
    rightSegments: ["context_pct"],
    separator: "slash",
    colors: MINIMAL_COLORS,
    segmentOptions: {
      path: { mode: "basename" },
      git: GIT_BRANCH_ONLY,
    },
  },

  // Compact daily-driver with a small cost/context tail.
  compact: {
    leftSegments: ["model", "git"],
    rightSegments: ["cost", "context_pct"],
    separator: "powerline-thin",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      git: GIT_NO_UNTRACKED,
    },
  },

  // Information-rich preset without cache-write/context-total details.
  full: {
    leftSegments: ["pi", "hostname", "model", "thinking", "path", "git"],
    rightSegments: [
      "token_in",
      "token_out",
      "cache_read",
      "cost",
      "context_pct",
      "time_spent",
      "time",
      "extension_statuses",
    ],
    separator: "powerline",
    colors: DEFAULT_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "abbreviated", maxLength: 50 },
      git: GIT_ALL,
      time: { format: "24h", showSeconds: false },
    },
  },

  // Max-detail preset for wide terminals and nerd-font users.
  nerd: {
    leftSegments: ["pi", "hostname", "model", "thinking", "path", "git", "session"],
    rightSegments: [
      "token_in",
      "token_out",
      "cache_read",
      "cache_write",
      "cost",
      "context_pct",
      "context_total",
      "time_spent",
      "time",
      "extension_statuses",
    ],
    separator: "powerline",
    colors: NERD_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: false },
      path: { mode: "abbreviated", maxLength: 60 },
      git: GIT_ALL,
      time: { format: "24h", showSeconds: true },
    },
  },

  // Font-safe preset for environments where powerline glyphs are undesirable.
  ascii: {
    leftSegments: ["model", "path", "git"],
    rightSegments: ["token_total", "cost", "context_pct"],
    separator: "ascii",
    colors: MINIMAL_COLORS,
    segmentOptions: {
      model: { showThinkingLevel: true },
      path: { mode: "abbreviated", maxLength: 40 },
      git: GIT_ALL,
    },
  },
};

export function getPreset(name: StatusLinePreset): PresetDef {
  return PRESETS[name] ?? PRESETS.default;
}

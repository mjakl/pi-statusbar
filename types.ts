import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";

// Theme color - either a Pi theme color name or a custom hex color.
export type ColorValue = ThemeColor | `#${string}`;

export const SEMANTIC_COLORS = [
  "pi",
  "model",
  "path",
  "gitDirty",
  "gitClean",
  "thinking",
  "thinkingMax",
  "context",
  "contextWarn",
  "contextError",
  "cost",
  "tokens",
  "separator",
  "border",
] as const;

export type SemanticColor = (typeof SEMANTIC_COLORS)[number];

// Color scheme mapping semantic names to actual colors.
export type ColorScheme = Partial<Record<SemanticColor, ColorValue>>;

// Segment identifiers.
export type StatusLineSegmentId =
  | "pi"
  | "model"
  | "model_key"
  | "model_name"
  | "path"
  | "git"
  | "token_in"
  | "token_out"
  | "token_total"
  | "cost"
  | "context_pct"
  | "context_total"
  | "time_spent"
  | "time"
  | "session"
  | "hostname"
  | "cache_read"
  | "cache_write"
  | "thinking"
  | "extension_statuses";

// Separator styles.
export type StatusLineSeparatorStyle =
  | "powerline"
  | "powerline-thin"
  | "slash"
  | "pipe"
  | "block"
  | "none"
  | "ascii"
  | "dot"
  | "chevron"
  | "star";

// Preset names.
export type StatusLinePreset =
  | "default"
  | "focused"
  | "minimal"
  | "compact"
  | "full"
  | "nerd"
  | "ascii";

// Per-segment options.
export interface StatusLineSegmentOptions {
  model?: { showThinkingLevel?: boolean };
  path?: {
    mode?: "basename" | "abbreviated" | "full";
    maxLength?: number;
  };
  git?: { showBranch?: boolean; showStaged?: boolean; showUnstaged?: boolean; showUntracked?: boolean };
  time?: { format?: "12h" | "24h"; showSeconds?: boolean };
}

// Preset definition.
export interface PresetDef {
  leftSegments: StatusLineSegmentId[];
  rightSegments: StatusLineSegmentId[];
  /** Segments reserved for the second status-bar row. */
  secondarySegments?: StatusLineSegmentId[];
  separator: StatusLineSeparatorStyle;
  segmentOptions?: StatusLineSegmentOptions;
  /** Color scheme for this preset. */
  colors?: ColorScheme;
}

// Separator definition.
export interface SeparatorDef {
  left: string;
  right: string;
  endCaps?: {
    left: string;
    right: string;
    useBgAsFg: boolean;
  };
}

// Git status data.
export interface GitStatus {
  branch: string | null;
  staged: number;
  unstaged: number;
  untracked: number;
}

// Usage statistics.
export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

// Context passed to segment render functions.
export interface SegmentContext {
  model: Model<any> | undefined;
  thinkingLevel: ThinkingLevel;
  sessionId: string | undefined;
  cwd: string;

  usageStats: UsageStats;
  contextPercent: number | null;
  contextWindow: number;
  usingSubscription: boolean;
  sessionStartTime: number;

  git: GitStatus;
  extensionStatuses: ReadonlyMap<string, string>;
  options: StatusLineSegmentOptions;
  theme: Theme;
  colors: ColorScheme;
}

export interface RenderedSegment {
  content: string;
  visible: boolean;
}

export interface StatusLineSegment {
  id: StatusLineSegmentId;
  render(ctx: SegmentContext): RenderedSegment;
}

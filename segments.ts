import { hostname as osHostname } from "node:os";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";

import type { RenderedSegment, SegmentContext, SemanticColor, StatusLineSegment, StatusLineSegmentId } from "./types.js";
import { fg, rainbow, applyColor, resolveColor } from "./theme.js";
import { getIcons, SEP_DOT, getThinkingText } from "./icons.js";

// Helper to apply semantic color from context
function color(ctx: SegmentContext, semantic: SemanticColor, text: string): string {
  return fg(ctx.theme, semantic, text, ctx.colors);
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m${seconds % 60}s`;
  return `${seconds}s`;
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function toMutedHex(hex: string): `#${string}` {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  // Desaturate toward neutral gray while preserving readability.
  const gray = 128;
  const keep = 0.62;
  const nr = Math.round(r * keep + gray * (1 - keep));
  const ng = Math.round(g * keep + gray * (1 - keep));
  const nb = Math.round(b * keep + gray * (1 - keep));

  const muted = `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
  return muted as `#${string}`;
}

function colorMutedModelKey(ctx: SegmentContext, text: string): string {
  const modelColor = resolveColor("model", ctx.colors);

  if (typeof modelColor === "string" && isHexColor(modelColor)) {
    return applyColor(ctx.theme, toMutedHex(modelColor), text);
  }

  // Theme tokens cannot be desaturated directly; use dim as a muted fallback.
  return applyColor(ctx.theme, "dim", text);
}

function formatInlineThinking(ctx: SegmentContext, level: string): string {
  const thinkingText = getThinkingText(level);
  if (!thinkingText) return "";

  const semantic: SemanticColor = level === "max" ? "thinkingMax" : "model";
  return color(ctx, semantic, `${SEP_DOT}${thinkingText}`);
}

const TERMINAL_SEQUENCE_PATTERN = (() => {
  const stringTerminator = "(?:\\u0007|\\u001B\\u005C|\\u009C)";
  const osc = `(?:\\u001B\\][\\s\\S]*?${stringTerminator})`;
  const csi = "[\\u001B\\u009B][[\\]\\()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]";
  return new RegExp(`${osc}|${csi}`, "g");
})();

export function sanitizeStatusText(input: string): string {
  return input
    .replace(TERMINAL_SEQUENCE_PATTERN, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function colorAsSeparator(ctx: SegmentContext, text: string): string {
  return color(ctx, "separator", text);
}

function getModelName(model: SegmentContext["model"]): string {
  let name = sanitizeStatusText(model?.name || model?.id || "no-model") || "no-model";
  if (name.startsWith("Claude ")) {
    name = name.slice(7);
  }
  return name;
}

function getModelKey(model: SegmentContext["model"]): string | undefined {
  const provider = sanitizeStatusText(model?.provider?.trim() ?? "") || undefined;
  const modelId = sanitizeStatusText(model?.id?.trim() ?? "") || undefined;
  return provider && modelId ? `${provider}/${modelId}` : modelId || provider;
}

function formatCwd(cwd: string, home: string | undefined): string {
  if (!home) return cwd;

  const resolvedCwd = resolve(cwd);
  const resolvedHome = resolve(home);
  const relativeToHome = relative(resolvedHome, resolvedCwd);
  const isInsideHome = relativeToHome === ""
    || (relativeToHome !== ".." && !relativeToHome.startsWith(`..${sep}`) && !isAbsolute(relativeToHome));

  if (!isInsideHome) return cwd;
  return relativeToHome === "" ? "~" : `~${sep}${relativeToHome}`;
}

function truncatePathFromStart(path: string, maxWidth: number): string {
  const width = visibleWidth(path);
  if (width <= maxWidth) return path;
  if (maxWidth <= 1) return "…";

  return `…${sliceByColumn(path, width - (maxWidth - 1), maxWidth - 1, true)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Segment Implementations
// ═══════════════════════════════════════════════════════════════════════════

const piSegment: StatusLineSegment = {
  id: "pi",
  render(ctx) {
    const icons = getIcons();
    if (!icons.pi) return { content: "", visible: false };
    const content = `${icons.pi} `;
    return { content: color(ctx, "pi", content), visible: true };
  },
};

const modelSegment: StatusLineSegment = {
  id: "model",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.model ?? {};

    const modelName = getModelName(ctx.model);
    const modelKey = getModelKey(ctx.model);

    let content = color(ctx, "model", withIcon(icons.model, modelName));

    if (modelKey && modelKey !== modelName) {
      content += colorMutedModelKey(ctx, ` (${modelKey})`);
    }

    // Add thinking level with dot separator
    if (opts.showThinkingLevel !== false && ctx.model?.reasoning) {
      const level = ctx.thinkingLevel || "off";
      if (level !== "off") {
        content += formatInlineThinking(ctx, level);
      }
    }

    return { content, visible: true };
  },
};

const modelKeySegment: StatusLineSegment = {
  id: "model_key",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.model ?? {};

    const modelKey = getModelKey(ctx.model) || "no-model";

    let content = color(ctx, "model", withIcon(icons.model, modelKey));

    // Add thinking level with dot separator
    if (opts.showThinkingLevel !== false && ctx.model?.reasoning) {
      const level = ctx.thinkingLevel || "off";
      if (level !== "off") {
        content += formatInlineThinking(ctx, level);
      }
    }

    return { content, visible: true };
  },
};

const modelNameSegment: StatusLineSegment = {
  id: "model_name",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.model ?? {};

    const modelName = getModelName(ctx.model);
    let content = color(ctx, "model", withIcon(icons.model, modelName));

    // Add thinking level with dot separator
    if (opts.showThinkingLevel !== false && ctx.model?.reasoning) {
      const level = ctx.thinkingLevel || "off";
      if (level !== "off") {
        content += formatInlineThinking(ctx, level);
      }
    }

    return { content, visible: true };
  },
};

const pathSegment: StatusLineSegment = {
  id: "path",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.path ?? {};
    const mode = opts.mode ?? "basename";

    let pwd = ctx.cwd;
    const home = process.env.HOME || process.env.USERPROFILE;

    if (mode === "basename") {
      pwd = basename(pwd) || pwd;
    } else {
      pwd = formatCwd(pwd, home);

      // Strip /work/ prefix (common in containers).
      if (pwd.startsWith("/work/")) {
        pwd = pwd.slice(6);
      }

    }

    pwd = sanitizeStatusText(pwd);
    if (mode === "abbreviated") {
      pwd = truncatePathFromStart(pwd, opts.maxLength ?? 40);
    }

    const content = withIcon(icons.folder, pwd);
    return { content: color(ctx, "path", content), visible: true };
  },
};

const gitSegment: StatusLineSegment = {
  id: "git",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.git ?? {};
    const { branch, staged, unstaged, untracked } = ctx.git;
    const gitStatus = (staged > 0 || unstaged > 0 || untracked > 0) 
      ? { staged, unstaged, untracked } 
      : null;

    if (!branch && !gitStatus) return { content: "", visible: false };

    const isDirty = gitStatus && (gitStatus.staged > 0 || gitStatus.unstaged > 0 || gitStatus.untracked > 0);
    const showBranch = opts.showBranch !== false;
    const branchColor: SemanticColor = isDirty ? "gitDirty" : "gitClean";

    // Build content - color branch separately from indicators
    let content = "";
    if (showBranch && branch) {
      // Color just the branch name (icon + branch text)
      content = color(ctx, branchColor, withIcon(icons.branch, branch));
    }

    // Add status indicators (each with their own color, not wrapped)
    if (gitStatus) {
      const indicators: string[] = [];
      if (opts.showUnstaged !== false && gitStatus.unstaged > 0) {
        indicators.push(applyColor(ctx.theme, "warning", `*${gitStatus.unstaged}`));
      }
      if (opts.showStaged !== false && gitStatus.staged > 0) {
        indicators.push(applyColor(ctx.theme, "success", `+${gitStatus.staged}`));
      }
      if (opts.showUntracked !== false && gitStatus.untracked > 0) {
        indicators.push(applyColor(ctx.theme, "muted", `?${gitStatus.untracked}`));
      }
      if (indicators.length > 0) {
        const indicatorText = indicators.join(" ");
        if (!content && showBranch === false) {
          // No branch shown, color the git icon with branch color
          content = color(ctx, branchColor, icons.git ? `${icons.git} ` : "") + indicatorText;
        } else {
          content += content ? ` ${indicatorText}` : indicatorText;
        }
      }
    }

    if (!content) return { content: "", visible: false };

    return { content, visible: true };
  },
};

const thinkingSegment: StatusLineSegment = {
  id: "thinking",
  render(ctx) {
    const level = ctx.thinkingLevel || "off";

    // Text label for each level
    const levelText: Record<string, string> = {
      off: "off",
      minimal: "min",
      low: "low",
      medium: "med",
      high: "high",
      xhigh: "xhigh",
      max: "max",
    };
    const label = levelText[level] || level;
    const content = `think:${label}`;

    if (level === "max") {
      return { content: color(ctx, "thinkingMax", content), visible: true };
    }

    // Use rainbow effect for high/xhigh (like Claude Code ultrathink)
    if (level === "high" || level === "xhigh") {
      return { content: rainbow(ctx.theme, content), visible: true };
    }

    // Use thinking color for lower levels
    return { content: color(ctx, "thinking", content), visible: true };
  },
};

const tokenInSegment: StatusLineSegment = {
  id: "token_in",
  render(ctx) {
    const icons = getIcons();
    const { input } = ctx.usageStats;
    if (!input) return { content: "", visible: false };

    const content = withIcon(icons.input, formatTokens(input));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const tokenOutSegment: StatusLineSegment = {
  id: "token_out",
  render(ctx) {
    const icons = getIcons();
    const { output } = ctx.usageStats;
    if (!output) return { content: "", visible: false };

    const content = withIcon(icons.output, formatTokens(output));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const tokenTotalSegment: StatusLineSegment = {
  id: "token_total",
  render(ctx) {
    const icons = getIcons();
    const { input, output, cacheRead, cacheWrite } = ctx.usageStats;
    const total = input + output + cacheRead + cacheWrite;
    if (!total) return { content: "", visible: false };

    const content = withIcon(icons.tokens, formatTokens(total));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const costSegment: StatusLineSegment = {
  id: "cost",
  render(ctx) {
    const { cost } = ctx.usageStats;
    const usingSubscription = ctx.usingSubscription;

    if (!cost && !usingSubscription) {
      return { content: "", visible: false };
    }

    const costDisplay = usingSubscription
      ? cost ? `$${cost.toFixed(2)} (sub)` : "(sub)"
      : `$${cost.toFixed(2)}`;
    return { content: color(ctx, "cost", costDisplay), visible: true };
  },
};

const contextPctSegment: StatusLineSegment = {
  id: "context_pct",
  render(ctx) {
    const icons = getIcons();
    const pct = ctx.contextPercent;
    const window = ctx.contextWindow;
    if (!window) return { content: "", visible: false };

    if (pct === null) {
      const text = `?/${formatTokens(window)}`;
      return {
        content: withIcon(icons.contextMedium || icons.context, color(ctx, "context", text)),
        visible: true,
      };
    }

    const text = `${pct.toFixed(1)}%/${formatTokens(window)}`;
    const contextIcon = pct < 20
      ? icons.contextLow
      : pct <= 80
        ? icons.contextMedium
        : icons.contextHigh;

    // Icon outside color, text inside - use semantic colors for thresholds
    let content: string;
    if (pct > 90) {
      content = withIcon(contextIcon, color(ctx, "contextError", text));
    } else if (pct > 70) {
      content = withIcon(contextIcon, color(ctx, "contextWarn", text));
    } else {
      content = withIcon(contextIcon, color(ctx, "context", text));
    }

    return { content, visible: true };
  },
};

const contextTotalSegment: StatusLineSegment = {
  id: "context_total",
  render(ctx) {
    const icons = getIcons();
    const window = ctx.contextWindow;
    if (!window) return { content: "", visible: false };

    return {
      content: color(ctx, "context", withIcon(icons.context, formatTokens(window))),
      visible: true,
    };
  },
};

const timeSpentSegment: StatusLineSegment = {
  id: "time_spent",
  render(ctx) {
    const icons = getIcons();
    const elapsed = Date.now() - ctx.sessionStartTime;
    if (elapsed < 1000) return { content: "", visible: false };

    // No explicit color
    return { content: withIcon(icons.time, formatDuration(elapsed)), visible: true };
  },
};

const timeSegment: StatusLineSegment = {
  id: "time",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.time ?? {};
    const now = new Date();

    let hours = now.getHours();
    let suffix = "";
    if (opts.format === "12h") {
      suffix = hours >= 12 ? "pm" : "am";
      hours = hours % 12 || 12;
    }

    const mins = now.getMinutes().toString().padStart(2, "0");
    let timeStr = `${hours}:${mins}`;
    if (opts.showSeconds) {
      timeStr += `:${now.getSeconds().toString().padStart(2, "0")}`;
    }
    timeStr += suffix;

    // No explicit color
    return { content: withIcon(icons.time, timeStr), visible: true };
  },
};

const sessionSegment: StatusLineSegment = {
  id: "session",
  render(ctx) {
    const icons = getIcons();
    const sessionId = ctx.sessionId;
    const display = sessionId?.slice(0, 8) || "new";

    // No explicit color
    return { content: withIcon(icons.session, display), visible: true };
  },
};

const hostnameSegment: StatusLineSegment = {
  id: "hostname",
  render(_ctx) {
    const icons = getIcons();
    const name = osHostname().split(".")[0];
    // No explicit color
    return { content: withIcon(icons.host, name), visible: true };
  },
};

const cacheReadSegment: StatusLineSegment = {
  id: "cache_read",
  render(ctx) {
    const icons = getIcons();
    const { cacheRead } = ctx.usageStats;
    if (!cacheRead) return { content: "", visible: false };

    // Space-separated parts
    const parts = [icons.cache, icons.input, formatTokens(cacheRead)].filter(Boolean);
    const content = parts.join(" ");
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const cacheWriteSegment: StatusLineSegment = {
  id: "cache_write",
  render(ctx) {
    const icons = getIcons();
    const { cacheWrite } = ctx.usageStats;
    if (!cacheWrite) return { content: "", visible: false };

    // Space-separated parts
    const parts = [icons.cache, icons.output, formatTokens(cacheWrite)].filter(Boolean);
    const content = parts.join(" ");
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const extensionStatusesSegment: StatusLineSegment = {
  id: "extension_statuses",
  render(ctx) {
    const statuses = ctx.extensionStatuses;
    if (!statuses || statuses.size === 0) return { content: "", visible: false };

    // Recolor extension statuses to match the statusbar separator. Extension
    // statuses are often bright because they are authored for the default footer;
    // stripping ANSI here keeps them visible but visually secondary.
    const parts = Array.from(statuses.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => sanitizeStatusText(value ?? ""))
      .filter(Boolean);

    if (parts.length === 0) return { content: "", visible: false };

    const content = colorAsSeparator(ctx, parts.join(SEP_DOT));
    return { content, visible: true };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Segment Registry
// ═══════════════════════════════════════════════════════════════════════════

export const SEGMENTS: Record<StatusLineSegmentId, StatusLineSegment> = {
  pi: piSegment,
  model: modelSegment,
  model_key: modelKeySegment,
  model_name: modelNameSegment,
  path: pathSegment,
  git: gitSegment,
  thinking: thinkingSegment,
  token_in: tokenInSegment,
  token_out: tokenOutSegment,
  token_total: tokenTotalSegment,
  cost: costSegment,
  context_pct: contextPctSegment,
  context_total: contextTotalSegment,
  time_spent: timeSpentSegment,
  time: timeSegment,
  session: sessionSegment,
  hostname: hostnameSegment,
  cache_read: cacheReadSegment,
  cache_write: cacheWriteSegment,
  extension_statuses: extensionStatusesSegment,
};

export function renderSegment(id: StatusLineSegmentId, ctx: SegmentContext): RenderedSegment {
  const segment = SEGMENTS[id];
  if (!segment) {
    return { content: "", visible: false };
  }
  return segment.render(ctx);
}

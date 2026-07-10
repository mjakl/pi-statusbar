import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

import { loadStatusbarConfig, saveStatusbarConfig } from "./config.js";
import {
  disposeGitStatus,
  invalidateGitStatus,
  setGitStatusCwd,
  subscribeGitStatus,
} from "./git-status.js";
import { computeResponsiveLayout, ResponsiveLayoutCache, type StatusLayout } from "./layout.js";
import { getPreset, PRESETS } from "./presets.js";
import { buildSegmentContext } from "./segment-context.js";
import { setupStatusBarUi } from "./status-bar-ui.js";
import { fg } from "./theme.js";
import type { StatusLinePreset } from "./types.js";

const USER_BASH_REFRESH_DELAYS_MS = [100, 500, 1500, 5000, 15_000] as const;
const HORIZONTAL_BORDER = "─";

interface PowerlineState {
  enabled: boolean;
  preset: StatusLinePreset;
  sessionStartTime: number;
  runtimeContext: ExtensionContext | null;
  thinkingLevel: ThinkingLevel;
  footerDataProvider: ReadonlyFooterDataProvider | null;
  tui: TUI | null;
  layoutCache: ResponsiveLayoutCache;
  disposeUi: (() => void) | null;
  unsubscribeGitStatus: (() => void) | null;
  clockTimer: ReturnType<typeof setTimeout> | null;
  scheduledTimers: Set<ReturnType<typeof setTimeout>>;
}

function isKnownPreset(value: string): value is StatusLinePreset {
  return Object.prototype.hasOwnProperty.call(PRESETS, value);
}

function getInitialPreset(): StatusLinePreset {
  const configuredPreset = loadStatusbarConfig().preset;
  return typeof configuredPreset === "string" && isKnownPreset(configuredPreset)
    ? configuredPreset
    : "default";
}

function createInitialState(): PowerlineState {
  return {
    enabled: true,
    preset: getInitialPreset(),
    sessionStartTime: Date.now(),
    runtimeContext: null,
    thinkingLevel: "off",
    footerDataProvider: null,
    tui: null,
    layoutCache: new ResponsiveLayoutCache(),
    disposeUi: null,
    unsubscribeGitStatus: null,
    clockTimer: null,
    scheduledTimers: new Set(),
  };
}

function getFooterDataCacheKey(provider: ReadonlyFooterDataProvider | null): string {
  if (!provider) {
    return "footer:none";
  }

  return JSON.stringify({
    branch: provider.getGitBranch(),
    statuses: Array.from(provider.getExtensionStatuses().entries()),
  });
}

function getLayout(state: PowerlineState, width: number, theme: Theme): StatusLayout {
  const context = state.runtimeContext;
  if (!context) {
    return { topContent: "", secondaryContent: "" };
  }

  const footerDataCacheKey = getFooterDataCacheKey(state.footerDataProvider);
  return state.layoutCache.get(width, footerDataCacheKey, () => {
    const segmentContext = buildSegmentContext({
      runtimeContext: context,
      thinkingLevel: state.thinkingLevel,
      presetName: state.preset,
      sessionStartTime: state.sessionStartTime,
      footerData: state.footerDataProvider,
      theme,
    });

    return computeResponsiveLayout(segmentContext, getPreset(state.preset), width);
  });
}

function renderBorder(state: PowerlineState, width: number, theme: Theme): string {
  return fg(theme, "border", HORIZONTAL_BORDER.repeat(width), getPreset(state.preset).colors);
}

function clearClockTimer(state: PowerlineState): void {
  if (state.clockTimer) {
    clearTimeout(state.clockTimer);
    state.clockTimer = null;
  }
}

function getClockInterval(state: PowerlineState): number | null {
  const preset = getPreset(state.preset);
  const segmentIds = [
    ...preset.leftSegments,
    ...preset.rightSegments,
    ...(preset.secondarySegments ?? []),
  ];

  if (segmentIds.includes("time_spent") || preset.segmentOptions?.time?.showSeconds) {
    return 1000;
  }
  return segmentIds.includes("time") ? 60_000 : null;
}

function refreshStatusBar(state: PowerlineState, context?: ExtensionContext): void {
  if (context) {
    state.runtimeContext = context;
  }

  state.layoutCache.invalidate();
  state.tui?.requestRender();
}

function syncClockTimer(state: PowerlineState): void {
  clearClockTimer(state);

  const interval = state.enabled && state.tui ? getClockInterval(state) : null;
  if (!interval) return;

  const delay = interval - (Date.now() % interval);
  state.clockTimer = setTimeout(() => {
    state.clockTimer = null;
    refreshStatusBar(state);
    syncClockTimer(state);
  }, delay);
}

function clearScheduledTimers(state: PowerlineState): void {
  for (const timer of state.scheduledTimers) {
    clearTimeout(timer);
  }
  state.scheduledTimers.clear();
}

function scheduleUserBashRefresh(state: PowerlineState, cwd: string): void {
  clearScheduledTimers(state);

  for (const delay of USER_BASH_REFRESH_DELAYS_MS) {
    const timer = setTimeout(() => {
      state.scheduledTimers.delete(timer);
      if (state.runtimeContext?.cwd !== cwd) return;

      invalidateGitStatus();
      refreshStatusBar(state);
    }, delay);
    state.scheduledTimers.add(timer);
  }
}

function installStatusBarUi(state: PowerlineState, context: ExtensionContext): void {
  if (context.mode !== "tui" || state.disposeUi) {
    return;
  }

  state.disposeUi = setupStatusBarUi({
    context,
    getLayout: (width, theme) => getLayout(state, width, theme),
    renderBorder: (width, theme) => renderBorder(state, width, theme),
    onFooterDataProviderChanged: (provider) => {
      state.footerDataProvider = provider;
      refreshStatusBar(state);
    },
    onTuiChanged: (tui) => {
      state.tui = tui;
      syncClockTimer(state);
    },
    onBranchChanged: () => {
      invalidateGitStatus();
      refreshStatusBar(state);
    },
    onInvalidate: () => state.layoutCache.invalidate(),
  });
}

function uninstallStatusBarUi(state: PowerlineState): void {
  const dispose = state.disposeUi;
  state.disposeUi = null;
  dispose?.();

  state.footerDataProvider = null;
  state.tui = null;
  state.layoutCache.invalidate();
  clearClockTimer(state);
}

function setRuntimeContext(
  state: PowerlineState,
  context: ExtensionContext,
  thinkingLevel: ThinkingLevel,
): void {
  state.runtimeContext = context;
  state.thinkingLevel = thinkingLevel;
  state.sessionStartTime = Date.now();
  state.layoutCache.invalidate();

  setGitStatusCwd(context.cwd);
  invalidateGitStatus();
}

function applyPreset(state: PowerlineState, preset: StatusLinePreset): void {
  state.preset = preset;
  refreshStatusBar(state);
  syncClockTimer(state);
}

function toggleStatusBar(state: PowerlineState, context: ExtensionContext): void {
  state.enabled = !state.enabled;

  if (state.enabled) {
    installStatusBarUi(state, context);
    syncClockTimer(state);
    if (context.hasUI) context.ui.notify("Powerline enabled", "info");
    return;
  }

  uninstallStatusBarUi(state);
  if (context.hasUI) context.ui.notify("Defaults restored", "info");
}

export default function powerlineFooter(pi: ExtensionAPI) {
  const state = createInitialState();

  pi.on("session_start", async (_event, context) => {
    setRuntimeContext(state, context, pi.getThinkingLevel());

    state.unsubscribeGitStatus?.();
    state.unsubscribeGitStatus = subscribeGitStatus(() => refreshStatusBar(state));

    if (state.enabled) {
      installStatusBarUi(state, context);
    }
  });

  pi.on("session_shutdown", async () => {
    clearScheduledTimers(state);
    clearClockTimer(state);
    state.unsubscribeGitStatus?.();
    state.unsubscribeGitStatus = null;
    disposeGitStatus();
    uninstallStatusBarUi(state);
    state.runtimeContext = null;
  });

  pi.on("tool_result", async (event, context) => {
    const mayHaveMutatedFiles = event.toolName === "bash"
      || (!event.isError && (event.toolName === "write" || event.toolName === "edit"));
    if (!mayHaveMutatedFiles) return;

    setGitStatusCwd(context.cwd);
    invalidateGitStatus();
    refreshStatusBar(state, context);
  });

  pi.on("user_bash", async (event, context) => {
    state.runtimeContext = context;
    setGitStatusCwd(event.cwd);
    scheduleUserBashRefresh(state, event.cwd);
  });

  pi.on("thinking_level_select", async (event, context) => {
    state.thinkingLevel = event.level;
    refreshStatusBar(state, context);
  });

  pi.on("model_select", async (_event, context) => {
    state.thinkingLevel = pi.getThinkingLevel();
    refreshStatusBar(state, context);
  });

  pi.on("session_compact", async (_event, context) => {
    refreshStatusBar(state, context);
  });

  pi.on("session_tree", async (_event, context) => {
    refreshStatusBar(state, context);
  });

  pi.on("turn_end", async (_event, context) => {
    refreshStatusBar(state, context);
  });

  pi.on("agent_settled", async (_event, context) => {
    refreshStatusBar(state, context);
  });

  pi.registerCommand("powerline", {
    description: "Configure powerline status (toggle, preset)",
    handler: async (args, context) => {
      state.runtimeContext = context;
      state.thinkingLevel = pi.getThinkingLevel();

      if (!args?.trim()) {
        toggleStatusBar(state, context);
        return;
      }

      const presetCandidate = args.trim().toLowerCase();
      if (!isKnownPreset(presetCandidate)) {
        if (context.hasUI) {
          context.ui.notify(`Available presets: ${Object.keys(PRESETS).join(", ")}`, "info");
        }
        return;
      }

      applyPreset(state, presetCandidate);
      const saved = saveStatusbarConfig({ preset: presetCandidate });

      if (state.enabled) {
        installStatusBarUi(state, context);
      }

      if (context.hasUI) {
        context.ui.notify(
          saved ? `Preset set to: ${presetCandidate}` : `Preset applied but could not be saved: ${presetCandidate}`,
          saved ? "info" : "warning",
        );
      }
    },
  });
}

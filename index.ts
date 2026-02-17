import type { ExtensionAPI, ReadonlyFooterDataProvider, Theme } from "@mariozechner/pi-coding-agent";

import { saveStatusbarConfig, loadStatusbarConfig } from "./config.js";
import { invalidateGitBranch, invalidateGitStatus } from "./git-status.js";
import { computeResponsiveLayout, ResponsiveLayoutCache, type StatusLayout } from "./layout.js";
import { PRESETS, getPreset } from "./presets.js";
import type {
  RuntimeContextLike,
  ToolResultEventLike,
  TuiLike,
  UserBashEventLike,
} from "./runtime-types.js";
import { buildSegmentContext } from "./segment-context.js";
import { clearStatusBarUi, setupStatusBarUi } from "./status-bar-ui.js";
import type { StatusLinePreset } from "./types.js";

const GIT_BRANCH_CHANGE_PATTERNS = [
  /\bgit\s+(checkout|switch|branch\s+-[dDmM]|merge|rebase|pull|reset|worktree)/,
  /\bgit\s+stash\s+(pop|apply)/,
] as const;

const FAST_BRANCH_RERENDER_DELAYS_MS = [100] as const;
const BRANCH_RERENDER_DELAYS_MS = [100, 300, 500] as const;

interface PowerlineState {
  enabled: boolean;
  preset: StatusLinePreset;
  sessionStartTime: number;
  runtimeContext: RuntimeContextLike | null;
  footerDataProvider: ReadonlyFooterDataProvider | null;
  tui: TuiLike | null;
  thinkingLevelGetter: (() => string) | null;
  layoutCache: ResponsiveLayoutCache;
}

function isKnownPreset(value: string): value is StatusLinePreset {
  return Object.prototype.hasOwnProperty.call(PRESETS, value);
}

function getInitialPreset(): StatusLinePreset {
  const configuredPreset = loadStatusbarConfig().preset;
  if (typeof configuredPreset === "string" && isKnownPreset(configuredPreset)) {
    return configuredPreset;
  }
  return "default";
}

function createInitialState(): PowerlineState {
  return {
    enabled: true,
    preset: getInitialPreset(),
    sessionStartTime: Date.now(),
    runtimeContext: null,
    footerDataProvider: null,
    tui: null,
    thinkingLevelGetter: null,
    layoutCache: new ResponsiveLayoutCache(),
  };
}

function mightChangeGitBranch(command: string): boolean {
  return GIT_BRANCH_CHANGE_PATTERNS.some((pattern) => pattern.test(command));
}

function requestRenderWithDelays(tui: TuiLike | null, delays: readonly number[]): void {
  if (!tui) {
    return;
  }

  for (const delay of delays) {
    setTimeout(() => tui.requestRender(), delay);
  }
}

function invalidateGitAndRender(state: PowerlineState, delays: readonly number[]): void {
  invalidateGitStatus();
  invalidateGitBranch();
  requestRenderWithDelays(state.tui, delays);
}

function getLayout(state: PowerlineState, width: number, theme: Theme): StatusLayout {
  const context = state.runtimeContext;
  if (!context) {
    return { topContent: "", secondaryContent: "" };
  }

  return state.layoutCache.get(width, () => {
    const segmentContext = buildSegmentContext({
      runtimeContext: context,
      presetName: state.preset,
      sessionStartTime: state.sessionStartTime,
      footerData: state.footerDataProvider,
      theme,
      fallbackThinkingLevel: state.thinkingLevelGetter?.(),
    });

    return computeResponsiveLayout(segmentContext, getPreset(state.preset), width);
  });
}

function installStatusBarUi(state: PowerlineState, context: RuntimeContextLike): void {
  if (!context.hasUI) {
    return;
  }

  setupStatusBarUi({
    context,
    getLayout: (width, theme) => getLayout(state, width, theme),
    onFooterDataProviderChanged: (provider) => {
      state.footerDataProvider = provider;
    },
    onTuiChanged: (tui) => {
      state.tui = tui;
    },
  });
}

function uninstallStatusBarUi(state: PowerlineState, context: RuntimeContextLike): void {
  if (context.hasUI) {
    clearStatusBarUi(context.ui);
  }

  state.footerDataProvider = null;
  state.tui = null;
  state.layoutCache.invalidate();
}

function applyPreset(state: PowerlineState, preset: StatusLinePreset): void {
  state.preset = preset;
  state.layoutCache.invalidate();
}

function toggleStatusBar(state: PowerlineState, context: RuntimeContextLike): void {
  state.enabled = !state.enabled;

  if (state.enabled) {
    installStatusBarUi(state, context);
    if (context.hasUI) {
      context.ui.notify("Powerline enabled", "info");
    }
    return;
  }

  uninstallStatusBarUi(state, context);
  if (context.hasUI) {
    context.ui.notify("Defaults restored", "info");
  }
}

function setRuntimeContext(state: PowerlineState, context: RuntimeContextLike): void {
  state.runtimeContext = context;
  state.sessionStartTime = Date.now();
  state.layoutCache.invalidate();
  state.thinkingLevelGetter = typeof context.getThinkingLevel === "function"
    ? () => context.getThinkingLevel?.() ?? "off"
    : null;
}

export default function powerlineFooter(pi: ExtensionAPI) {
  const state = createInitialState();

  pi.on("session_start", async (_event, rawContext) => {
    const context = rawContext as RuntimeContextLike;
    setRuntimeContext(state, context);

    if (state.enabled && context.hasUI) {
      installStatusBarUi(state, context);
    }
  });

  pi.on("tool_result", async (rawEvent) => {
    const event = rawEvent as ToolResultEventLike;

    if (event.toolName === "write" || event.toolName === "edit") {
      invalidateGitStatus();
    }

    if (event.toolName === "bash" && event.input?.command) {
      const command = String(event.input.command);
      if (mightChangeGitBranch(command)) {
        invalidateGitAndRender(state, FAST_BRANCH_RERENDER_DELAYS_MS);
      }
    }
  });

  pi.on("user_bash", async (rawEvent) => {
    const event = rawEvent as UserBashEventLike;
    if (!mightChangeGitBranch(event.command)) {
      return;
    }

    invalidateGitAndRender(state, BRANCH_RERENDER_DELAYS_MS);
  });

  pi.registerCommand("powerline", {
    description: "Configure powerline status (toggle, preset)",
    handler: async (args, rawContext) => {
      const context = rawContext as RuntimeContextLike;
      state.runtimeContext = context;

      if (!args?.trim()) {
        toggleStatusBar(state, context);
        return;
      }

      const presetCandidate = args.trim().toLowerCase();
      if (!isKnownPreset(presetCandidate)) {
        if (context.hasUI) {
          const presetList = Object.keys(PRESETS).join(", ");
          context.ui.notify(`Available presets: ${presetList}`, "info");
        }
        return;
      }

      applyPreset(state, presetCandidate);
      saveStatusbarConfig({ preset: presetCandidate });

      if (state.enabled) {
        installStatusBarUi(state, context);
      }

      if (context.hasUI) {
        context.ui.notify(`Preset set to: ${presetCandidate}`, "info");
      }
    },
  });
}

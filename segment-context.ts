import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type {
  ExtensionContext,
  ReadonlyFooterDataProvider,
  SessionEntry,
  Theme,
} from "@earendil-works/pi-coding-agent";

import { getGitStatus } from "./git-status.js";
import { getPreset } from "./presets.js";
import { getDefaultColors } from "./theme.js";
import type { ColorScheme, SegmentContext, UsageStats } from "./types.js";

type AssistantMessageLike = Partial<AssistantMessage> & {
  role?: string;
  usage?: Partial<AssistantMessage["usage"]> & {
    cost?: Partial<AssistantMessage["usage"]["cost"]>;
  };
};

export interface SegmentContextInput {
  runtimeContext: ExtensionContext;
  thinkingLevel: ThinkingLevel;
  presetName: Parameters<typeof getPreset>[0];
  sessionStartTime: number;
  footerData: ReadonlyFooterDataProvider | null;
  theme: Theme;
}

function createEmptyUsageStats(): UsageStats {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}

function getUsageValue(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readUsage(message: AssistantMessageLike): UsageStats {
  return {
    input: getUsageValue(message.usage?.input),
    output: getUsageValue(message.usage?.output),
    cacheRead: getUsageValue(message.usage?.cacheRead),
    cacheWrite: getUsageValue(message.usage?.cacheWrite),
    cost: getUsageValue(message.usage?.cost?.total),
  };
}

function getAssistantMessage(entry: SessionEntry): AssistantMessageLike | null {
  if (entry.type !== "message" || entry.message.role !== "assistant") {
    return null;
  }
  return entry.message as AssistantMessageLike;
}

function collectUsageStats(sessionEntries: readonly SessionEntry[]): UsageStats {
  const usageStats = createEmptyUsageStats();

  for (const entry of sessionEntries) {
    const message = getAssistantMessage(entry);
    if (!message) continue;

    // Usage can still be billable for aborted/error responses, matching Pi's
    // built-in session-total semantics.
    const usage = readUsage(message);
    usageStats.input += usage.input;
    usageStats.output += usage.output;
    usageStats.cacheRead += usage.cacheRead;
    usageStats.cacheWrite += usage.cacheWrite;
    usageStats.cost += usage.cost;
  }

  return usageStats;
}

function findLastUsableAssistant(branchEntries: readonly SessionEntry[]): AssistantMessageLike | null {
  for (let index = branchEntries.length - 1; index >= 0; index--) {
    const message = getAssistantMessage(branchEntries[index]!);
    if (message && message.stopReason !== "error" && message.stopReason !== "aborted") {
      return message;
    }
  }
  return null;
}

function computeContextPercent(lastAssistant: AssistantMessageLike | null, contextWindow: number): number | null {
  if (!lastAssistant || contextWindow <= 0) {
    return 0;
  }

  const usage = readUsage(lastAssistant);
  const totalTokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  return (totalTokens / contextWindow) * 100;
}

function getContextStats(
  runtimeContext: ExtensionContext,
  lastAssistant: AssistantMessageLike | null,
): { contextWindow: number; contextPercent: number | null } {
  const contextUsage = runtimeContext.getContextUsage();
  if (contextUsage) {
    return {
      contextWindow: contextUsage.contextWindow || (runtimeContext.model?.contextWindow ?? 0),
      contextPercent: typeof contextUsage.percent === "number" && Number.isFinite(contextUsage.percent)
        ? contextUsage.percent
        : null,
    };
  }

  const contextWindow = runtimeContext.model?.contextWindow ?? 0;
  return {
    contextWindow,
    contextPercent: computeContextPercent(lastAssistant, contextWindow),
  };
}

export function buildSegmentContext(input: SegmentContextInput): SegmentContext {
  const {
    runtimeContext,
    thinkingLevel,
    presetName,
    sessionStartTime,
    footerData,
    theme,
  } = input;

  const preset = getPreset(presetName);
  const colors: ColorScheme = preset.colors ?? getDefaultColors();
  const sessionEntries = runtimeContext.sessionManager.getEntries();
  const branchEntries = runtimeContext.sessionManager.getBranch();
  const lastAssistant = findLastUsableAssistant(branchEntries);
  const { contextWindow, contextPercent } = getContextStats(runtimeContext, lastAssistant);

  const gitBranch = footerData?.getGitBranch() ?? null;
  const gitStatus = getGitStatus(gitBranch, runtimeContext.cwd);
  const usingSubscription = runtimeContext.model
    ? runtimeContext.modelRegistry.isUsingOAuth(runtimeContext.model)
    : false;

  return {
    model: runtimeContext.model,
    thinkingLevel,
    sessionId: runtimeContext.sessionManager.getSessionId(),
    cwd: runtimeContext.cwd,
    usageStats: collectUsageStats(sessionEntries),
    contextPercent,
    contextWindow,
    usingSubscription,
    sessionStartTime,
    git: gitStatus,
    extensionStatuses: footerData?.getExtensionStatuses() ?? new Map(),
    options: preset.segmentOptions ?? {},
    theme,
    colors,
  };
}

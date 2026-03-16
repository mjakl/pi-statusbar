import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ReadonlyFooterDataProvider, Theme } from "@mariozechner/pi-coding-agent";

import { getGitStatus } from "./git-status.js";
import { getPreset } from "./presets.js";
import type { ModelLike, RuntimeContextLike, SessionEventLike } from "./runtime-types.js";
import { getDefaultColors } from "./theme.js";
import type { ColorScheme, SegmentContext, UsageStats } from "./types.js";

interface UsageSnapshot {
  usageStats: UsageStats;
  lastAssistant: AssistantMessageLike | null;
  thinkingLevel: string;
}

type AssistantMessageLike = Partial<AssistantMessage> & {
  role?: string;
  usage?: Partial<AssistantMessage["usage"]> & {
    cost?: Partial<AssistantMessage["usage"]["cost"]>;
  };
};

export interface SegmentContextInput {
  runtimeContext: RuntimeContextLike;
  modelOverride?: ModelLike;
  presetName: Parameters<typeof getPreset>[0];
  sessionStartTime: number;
  footerData: ReadonlyFooterDataProvider | null;
  theme: Theme;
  fallbackThinkingLevel?: string;
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

function isAssistantMessageEvent(event: SessionEventLike): boolean {
  return event.type === "message" && event.message?.role === "assistant";
}

function isUsableAssistantMessage(message: AssistantMessageLike): boolean {
  return message.stopReason !== "error" && message.stopReason !== "aborted";
}

function collectUsageSnapshot(sessionEvents: SessionEventLike[]): UsageSnapshot {
  const usageStats = createEmptyUsageStats();

  let thinkingLevel = "off";
  let lastAssistant: AssistantMessageLike | null = null;

  for (const event of sessionEvents) {
    if (event.type === "thinking_level_change" && event.thinkingLevel) {
      thinkingLevel = event.thinkingLevel;
    }

    if (!isAssistantMessageEvent(event) || !event.message) {
      continue;
    }

    const assistantMessage = event.message as AssistantMessageLike;
    if (!isUsableAssistantMessage(assistantMessage)) {
      continue;
    }

    const usage = readUsage(assistantMessage);
    usageStats.input += usage.input;
    usageStats.output += usage.output;
    usageStats.cacheRead += usage.cacheRead;
    usageStats.cacheWrite += usage.cacheWrite;
    usageStats.cost += usage.cost;
    lastAssistant = assistantMessage;
  }

  return {
    usageStats,
    lastAssistant,
    thinkingLevel,
  };
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
  runtimeContext: RuntimeContextLike,
  activeModel: ModelLike | undefined,
  lastAssistant: AssistantMessageLike | null,
): { contextWindow: number; contextPercent: number | null } {
  const contextUsage = runtimeContext.getContextUsage?.();
  if (contextUsage) {
    return {
      contextWindow: contextUsage.contextWindow || (activeModel?.contextWindow ?? 0),
      contextPercent: typeof contextUsage.percent === "number" && Number.isFinite(contextUsage.percent)
        ? contextUsage.percent
        : null,
    };
  }

  const contextWindow = activeModel?.contextWindow ?? 0;
  return {
    contextWindow,
    contextPercent: computeContextPercent(lastAssistant, contextWindow),
  };
}

export function buildSegmentContext(input: SegmentContextInput): SegmentContext {
  const {
    runtimeContext,
    modelOverride,
    presetName,
    sessionStartTime,
    footerData,
    theme,
    fallbackThinkingLevel,
  } = input;

  const preset = getPreset(presetName);
  const colors: ColorScheme = preset.colors ?? getDefaultColors();

  const sessionEvents = runtimeContext.sessionManager?.getBranch?.() ?? [];
  const usageSnapshot = collectUsageSnapshot(sessionEvents);

  const activeModel = modelOverride ?? runtimeContext.model;

  const { contextWindow, contextPercent } = getContextStats(
    runtimeContext,
    activeModel,
    usageSnapshot.lastAssistant,
  );

  const gitBranch = footerData?.getGitBranch() ?? null;
  const gitStatus = getGitStatus(gitBranch);

  const usingSubscription = activeModel
    ? runtimeContext.modelRegistry?.isUsingOAuth?.(activeModel) ?? false
    : false;

  return {
    model: activeModel,
    thinkingLevel: usageSnapshot.thinkingLevel || fallbackThinkingLevel || "off",
    sessionId: runtimeContext.sessionManager?.getSessionId?.(),
    usageStats: usageSnapshot.usageStats,
    contextPercent,
    contextWindow,
    autoCompactEnabled: runtimeContext.settingsManager?.getCompactionSettings?.()?.enabled ?? true,
    usingSubscription,
    sessionStartTime,
    git: gitStatus,
    extensionStatuses: footerData?.getExtensionStatuses() ?? new Map(),
    options: preset.segmentOptions ?? {},
    theme,
    colors,
  };
}

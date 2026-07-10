import type { Theme } from "@earendil-works/pi-coding-agent";

import type { SegmentContext } from "../types.js";

export function createTestTheme(): Theme {
  return {
    fg: (_color: string, text: string) => text,
    getColorMode: () => "truecolor",
  } as unknown as Theme;
}

export function createSegmentContext(overrides: Partial<SegmentContext> = {}): SegmentContext {
  return {
    model: undefined,
    thinkingLevel: "off",
    sessionId: undefined,
    cwd: "/tmp/project",
    usageStats: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    contextPercent: null,
    contextWindow: 0,
    usingSubscription: false,
    sessionStartTime: Date.now(),
    git: { branch: null, staged: 0, unstaged: 0, untracked: 0 },
    extensionStatuses: new Map(),
    options: {},
    theme: createTestTheme(),
    colors: {},
    ...overrides,
  };
}

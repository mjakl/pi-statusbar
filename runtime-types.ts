import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ReadonlyFooterDataProvider, Theme } from "@mariozechner/pi-coding-agent";

export type NotificationLevel = "info" | "warning" | "error";

export interface TuiLike {
  requestRender(): void;
}

export interface EditorLike {
  handleInput(data: string): void;
  render(width: number): string[];
  autocompleteProvider?: unknown;
}

export interface FooterComponentLike {
  dispose(): void;
  invalidate(): void;
  render(): string[];
}

export interface WidgetComponentLike {
  dispose(): void;
  invalidate(): void;
  render(width: number): string[];
}

export interface UiLike {
  theme: Theme;
  setEditorComponent(
    factory?: ((tui: TuiLike, editorTheme: unknown, keybindings: unknown) => EditorLike) | undefined,
  ): void;
  setFooter(
    factory?: ((tui: TuiLike, theme: Theme, footerData: ReadonlyFooterDataProvider) => FooterComponentLike) | undefined,
  ): void;
  setWidget(
    id: string,
    factory?: ((tui: TuiLike, theme: Theme) => WidgetComponentLike) | undefined,
    options?: { placement: "belowEditor" | "aboveEditor" },
  ): void;
  notify(message: string, level: NotificationLevel): void;
}

export interface ModelLike {
  id: string;
  name?: string;
  provider?: string;
  reasoning?: boolean;
  contextWindow?: number;
}

export interface SessionEventLike {
  type: string;
  thinkingLevel?: string;
  message?: Partial<AssistantMessage> & { role?: string };
}

export interface SessionManagerLike {
  getBranch?(): SessionEventLike[];
  getSessionId?(): string | undefined;
}

export interface SettingsManagerLike {
  getCompactionSettings?(): { enabled?: boolean } | undefined;
}

export interface ModelRegistryLike {
  isUsingOAuth?(model: ModelLike): boolean;
}

export interface RuntimeContextLike {
  hasUI: boolean;
  ui: UiLike;
  model?: ModelLike;
  getThinkingLevel?(): string;
  sessionManager?: SessionManagerLike;
  settingsManager?: SettingsManagerLike;
  modelRegistry?: ModelRegistryLike;
}

export interface ToolResultEventLike {
  toolName: string;
  input?: {
    command?: unknown;
  };
}

export interface UserBashEventLike {
  command: string;
}


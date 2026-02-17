import { CustomEditor, type ReadonlyFooterDataProvider, type Theme } from "@mariozechner/pi-coding-agent";

import { ansi, getFgAnsiCode } from "./colors.js";
import type {
  EditorLike,
  FooterComponentLike,
  RuntimeContextLike,
  TuiLike,
  UiLike,
  WidgetComponentLike,
} from "./runtime-types.js";
import type { StatusLayout } from "./layout.js";

export const SECONDARY_WIDGET_ID = "powerline-secondary";

const MIN_EDITOR_WIDTH = 10;
const CONTENT_PREFIX_WIDTH = 3;
const HORIZONTAL_BORDER = "─";

interface SetupStatusBarUiParams {
  context: RuntimeContextLike;
  getLayout: (width: number, theme: Theme) => StatusLayout;
  onFooterDataProviderChanged: (provider: ReadonlyFooterDataProvider | null) => void;
  onTuiChanged: (tui: TuiLike | null) => void;
}

function createBorderLine(width: number): string {
  const borderColor = getFgAnsiCode("sep");
  const border = `${borderColor}${HORIZONTAL_BORDER.repeat(width - 2)}${ansi.reset}`;
  return ` ${border}`;
}

function createPromptPrefix(): string {
  const prompt = `${ansi.getFgAnsi(200, 200, 200)}>${ansi.reset}`;
  return ` ${prompt} `;
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function findBottomBorderIndex(lines: string[]): number {
  for (let i = lines.length - 1; i >= 1; i--) {
    const stripped = stripAnsi(lines[i] ?? "");
    if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
      return i;
    }
  }

  return lines.length - 1;
}

function decorateEditorLines(
  width: number,
  originalLines: string[],
  statusLine: string,
): string[] {
  if (originalLines.length === 0) {
    return originalLines;
  }

  const contentWidth = Math.max(1, width - CONTENT_PREFIX_WIDTH);
  const promptPrefix = createPromptPrefix();
  const continuationPrefix = "   ";

  const result: string[] = [];
  const bottomBorderIndex = findBottomBorderIndex(originalLines);

  result.push(statusLine);
  result.push(createBorderLine(width));

  for (let i = 1; i < bottomBorderIndex; i++) {
    const prefix = i === 1 ? promptPrefix : continuationPrefix;
    result.push(`${prefix}${originalLines[i] || ""}`);
  }

  if (bottomBorderIndex === 1) {
    result.push(`${promptPrefix}${" ".repeat(contentWidth)}`);
  }

  result.push(createBorderLine(width));

  for (let i = bottomBorderIndex + 1; i < originalLines.length; i++) {
    result.push(originalLines[i] || "");
  }

  return result;
}

function createEmptyFooterComponent(dispose: () => void): FooterComponentLike {
  return {
    dispose,
    invalidate() {},
    render(): string[] {
      return [];
    },
  };
}

function createSecondaryWidget(
  getLayout: (width: number, theme: Theme) => StatusLayout,
  theme: Theme,
): WidgetComponentLike {
  return {
    dispose() {},
    invalidate() {},
    render(width: number): string[] {
      const layout = getLayout(width, theme);
      return layout.secondaryContent ? [layout.secondaryContent] : [];
    },
  };
}

export function clearStatusBarUi(ui: UiLike): void {
  ui.setEditorComponent(undefined);
  ui.setFooter(undefined);
  ui.setWidget(SECONDARY_WIDGET_ID, undefined);
}

export function setupStatusBarUi(params: SetupStatusBarUiParams): void {
  const { context, getLayout, onFooterDataProviderChanged, onTuiChanged } = params;

  let currentEditor: EditorLike | null = null;
  let autocompleteFixed = false;

  const editorFactory = (tui: TuiLike, editorTheme: unknown, keybindings: unknown): EditorLike => {
    const editor = new CustomEditor(tui, editorTheme, keybindings);
    currentEditor = editor;

    const originalHandleInput = editor.handleInput.bind(editor);
    editor.handleInput = (data: string) => {
      if (!autocompleteFixed && !editor.autocompleteProvider) {
        autocompleteFixed = true;
        context.ui.setEditorComponent(editorFactory);
        currentEditor?.handleInput(data);
        return;
      }

      originalHandleInput(data);
    };

    const originalRender = editor.render.bind(editor);
    editor.render = (width: number): string[] => {
      if (width < MIN_EDITOR_WIDTH) {
        return originalRender(width);
      }

      const contentWidth = Math.max(1, width - CONTENT_PREFIX_WIDTH);
      const lines = originalRender(contentWidth);
      const layout = getLayout(width, context.ui.theme);

      return decorateEditorLines(width, lines, layout.topContent);
    };

    return editor;
  };

  context.ui.setEditorComponent(editorFactory);

  context.ui.setFooter((tui, _theme, footerData) => {
    onFooterDataProviderChanged(footerData);
    onTuiChanged(tui);

    const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
    return createEmptyFooterComponent(() => {
      unsubscribe();
      onFooterDataProviderChanged(null);
      onTuiChanged(null);
    });
  });

  context.ui.setWidget(
    SECONDARY_WIDGET_ID,
    (_tui, theme) => createSecondaryWidget(getLayout, theme),
    { placement: "belowEditor" },
  );
}

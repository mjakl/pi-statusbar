import { CustomEditor, type ReadonlyFooterDataProvider, type Theme } from "@earendil-works/pi-coding-agent";

import { ansi, getFgAnsiCode } from "./colors.js";
import type {
  EditorLike,
  FooterComponentLike,
  RuntimeContextLike,
  TuiLike,
  UiLike,
} from "./runtime-types.js";
import type { StatusLayout } from "./layout.js";

export const SECONDARY_WIDGET_ID = "powerline-secondary";

const MIN_EDITOR_WIDTH = 10;
const HORIZONTAL_BORDER = "─";

interface SetupStatusBarUiParams {
  context: RuntimeContextLike;
  getLayout: (width: number, theme: Theme) => StatusLayout;
  onFooterDataProviderChanged: (provider: ReadonlyFooterDataProvider | null) => void;
  onTuiChanged: (tui: TuiLike | null) => void;
}

function createBorderLine(width: number): string {
  const borderColor = getFgAnsiCode("sep");
  return `${borderColor}${HORIZONTAL_BORDER.repeat(width)}${ansi.reset}`;
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function stripTrailingSpaces(input: string): string {
  return input.replace(/ +$/g, "");
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
  statusLines: string[],
): string[] {
  if (originalLines.length === 0) {
    return originalLines;
  }

  const result: string[] = [];
  const bottomBorderIndex = findBottomBorderIndex(originalLines);

  for (const statusLine of statusLines) {
    if (statusLine) {
      result.push(statusLine);
    }
  }
  result.push(createBorderLine(width));

  for (let i = 1; i < bottomBorderIndex; i++) {
    result.push(stripTrailingSpaces(originalLines[i] || ""));
  }

  if (bottomBorderIndex === 1) {
    result.push("");
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

      const lines = originalRender(width);
      const layout = getLayout(width, context.ui.theme);

      return decorateEditorLines(width, lines, [layout.topContent, layout.secondaryContent]);
    };

    return editor;
  };

  context.ui.setEditorComponent(editorFactory);

  context.ui.setFooter((tui, _theme, footerData) => {
    onTuiChanged(tui);
    onFooterDataProviderChanged(footerData);

    const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
    return createEmptyFooterComponent(() => {
      unsubscribe();
      onFooterDataProviderChanged(null);
      onTuiChanged(null);
    });
  });

  context.ui.setWidget(SECONDARY_WIDGET_ID, undefined);
}

import {
  CustomEditor,
  type ExtensionContext,
  type KeybindingsManager,
  type ReadonlyFooterDataProvider,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";

import type { StatusLayout } from "./layout.js";

export const STATUS_WIDGET_ID = "powerline-status";

const MIN_EDITOR_WIDTH = 10;
const HORIZONTAL_BORDER = "─";

interface SetupStatusBarUiParams {
  context: ExtensionContext;
  getLayout: (width: number, theme: Theme) => StatusLayout;
  renderBorder: (width: number, theme: Theme) => string;
  onFooterDataProviderChanged: (provider: ReadonlyFooterDataProvider | null) => void;
  onTuiChanged: (tui: TUI | null) => void;
  onBranchChanged: () => void;
  onInvalidate: () => void;
}

function stripAnsi(input: string): string {
  return input.replace(/\x1b\[[0-9;]*m/g, "");
}

function stripTrailingSpaces(input: string): string {
  return input.replace(/ +$/g, "");
}

function findBottomBorderIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 1; index--) {
    const stripped = stripAnsi(lines[index] ?? "");
    if (stripped.length > 0 && /^─{3,}/.test(stripped)) {
      return index;
    }
  }

  return lines.length - 1;
}

function decorateEditorLines(
  originalLines: string[],
  statusLines: string[],
  borderLine: string,
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
  result.push(borderLine);

  for (let index = 1; index < bottomBorderIndex; index++) {
    result.push(stripTrailingSpaces(originalLines[index] ?? ""));
  }

  if (bottomBorderIndex === 1) {
    result.push("");
  }

  result.push(borderLine);

  for (let index = bottomBorderIndex + 1; index < originalLines.length; index++) {
    result.push(originalLines[index] ?? "");
  }

  return result;
}

function createStatusWidget(
  getLayout: (width: number, theme: Theme) => StatusLayout,
  theme: Theme,
  onInvalidate: () => void,
): Component {
  return {
    render(width: number): string[] {
      const layout = getLayout(width, theme);
      return [layout.topContent, layout.secondaryContent].filter(Boolean);
    },
    invalidate(): void {
      onInvalidate();
    },
  };
}

/**
 * Install the status bar and return an idempotent cleanup function.
 *
 * If another extension already owns the editor, render as a widget instead of
 * assuming that editor has CustomEditor's border shape.
 */
export function setupStatusBarUi(params: SetupStatusBarUiParams): () => void {
  if (params.context.mode !== "tui") {
    return () => {};
  }

  const {
    context,
    getLayout,
    renderBorder,
    onFooterDataProviderChanged,
    onTuiChanged,
    onBranchChanged,
    onInvalidate,
  } = params;

  const previousEditorFactory = context.ui.getEditorComponent();
  let installedEditorFactory: ReturnType<typeof context.ui.getEditorComponent>;
  let ownsFooter = false;
  let disposed = false;

  if (previousEditorFactory) {
    context.ui.setWidget(
      STATUS_WIDGET_ID,
      (tui, theme) => {
        onTuiChanged(tui);
        return createStatusWidget(getLayout, theme, onInvalidate);
      },
      { placement: "aboveEditor" },
    );
  } else {
    class StatusBarEditor extends CustomEditor {
      constructor(tui: TUI, editorTheme: EditorTheme, keybindings: KeybindingsManager) {
        super(tui, editorTheme, keybindings);
        onTuiChanged(tui);
      }

      override render(width: number): string[] {
        const originalLines = super.render(width);
        if (width < MIN_EDITOR_WIDTH) {
          return originalLines;
        }

        const layout = getLayout(width, context.ui.theme);
        return decorateEditorLines(
          originalLines,
          [layout.topContent, layout.secondaryContent],
          renderBorder(width, context.ui.theme),
        );
      }

      override invalidate(): void {
        super.invalidate();
        onInvalidate();
      }
    }

    installedEditorFactory = (tui, theme, keybindings) => new StatusBarEditor(tui, theme, keybindings);
    context.ui.setEditorComponent(installedEditorFactory);
    context.ui.setWidget(STATUS_WIDGET_ID, undefined);
  }

  ownsFooter = true;
  context.ui.setFooter((tui, _theme, footerData) => {
    ownsFooter = true;
    onTuiChanged(tui);
    onFooterDataProviderChanged(footerData);

    const unsubscribe = footerData.onBranchChange(() => {
      onBranchChanged();
      tui.requestRender();
    });
    return {
      dispose(): void {
        ownsFooter = false;
        unsubscribe();
        onFooterDataProviderChanged(null);
      },
      invalidate(): void {
        onInvalidate();
      },
      render(): string[] {
        return [];
      },
    };
  });

  return () => {
    if (disposed) return;
    disposed = true;

    if (installedEditorFactory && context.ui.getEditorComponent() === installedEditorFactory) {
      context.ui.setEditorComponent(previousEditorFactory);
    }

    context.ui.setWidget(STATUS_WIDGET_ID, undefined);
    if (ownsFooter) {
      context.ui.setFooter(undefined);
    }
    onFooterDataProviderChanged(null);
    onTuiChanged(null);
  };
}

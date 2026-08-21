import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExtensionContext,
  ExtensionUIContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";

import { setupStatusBarUi, STATUS_WIDGET_ID } from "../status-bar-ui.js";
import { createTestTheme } from "./helpers.js";

type EditorFactory = NonNullable<ReturnType<ExtensionUIContext["getEditorComponent"]>>;
type WidgetFactory = (tui: TUI, theme: Theme) => Component;

function createUiHarness(
  previousEditor?: EditorFactory,
  mode: ExtensionContext["mode"] = "tui",
) {
  const theme = createTestTheme();
  const tui = { requestRender() {} } as unknown as TUI;
  const footerData = {
    getGitBranch: () => null,
    getExtensionStatuses: () => new Map(),
    getAvailableProviderCount: () => 1,
    onBranchChange: () => () => {},
  } as ReadonlyFooterDataProvider;

  let editorFactory = previousEditor;
  let widgetFactory: WidgetFactory | undefined;
  let footerComponent: (Component & { dispose?: () => void }) | undefined;

  const ui = {
    theme,
    getEditorComponent: () => editorFactory,
    setEditorComponent: (factory: EditorFactory | undefined) => {
      editorFactory = factory;
    },
    setWidget: (id: string, factory: WidgetFactory | undefined) => {
      assert.equal(id, STATUS_WIDGET_ID);
      widgetFactory = factory;
    },
    setFooter: (
      factory?: (tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider) => Component,
    ) => {
      footerComponent?.dispose?.();
      footerComponent = factory?.(tui, theme, footerData);
    },
  } as unknown as ExtensionUIContext;

  const context = { mode, ui } as unknown as ExtensionContext;
  return {
    context,
    getEditorFactory: () => editorFactory,
    getWidgetFactory: () => widgetFactory,
    getFooterComponent: () => footerComponent,
  };
}

const setupDefaults = {
  getLayout: () => ({ topContent: "status", secondaryContent: "" }),
  renderBorder: (width: number) => "─".repeat(width),
  onFooterDataProviderChanged: () => {},
  onTuiChanged: () => {},
  onBranchChanged: () => {},
  onInvalidate: () => {},
};

test("setup is inert and cleanup is safe outside TUI mode", () => {
  for (const mode of ["rpc", "json", "print"] as const) {
    const previousEditor = (() => ({ render: () => [], invalidate() {} })) as unknown as EditorFactory;
    const harness = createUiHarness(previousEditor, mode);
    let callbackCount = 0;

    const dispose = setupStatusBarUi({
      context: harness.context,
      ...setupDefaults,
      onFooterDataProviderChanged: () => callbackCount++,
      onTuiChanged: () => callbackCount++,
      onBranchChanged: () => callbackCount++,
      onInvalidate: () => callbackCount++,
    });

    assert.equal(harness.getEditorFactory(), previousEditor);
    assert.equal(harness.getWidgetFactory(), undefined);
    assert.equal(harness.getFooterComponent(), undefined);
    assert.equal(callbackCount, 0);
    dispose();
    dispose();
    assert.equal(callbackCount, 0);
  }
});

test("an existing custom editor is preserved and status uses a widget", () => {
  const previousEditor = (() => ({ render: () => [], invalidate() {} })) as unknown as EditorFactory;
  const harness = createUiHarness(previousEditor);

  const dispose = setupStatusBarUi({ context: harness.context, ...setupDefaults });

  assert.equal(harness.getEditorFactory(), previousEditor);
  assert.ok(harness.getWidgetFactory());

  dispose();
  assert.equal(harness.getEditorFactory(), previousEditor);
  assert.equal(harness.getWidgetFactory(), undefined);
});

test("the installed default-editor decoration is restored on cleanup", () => {
  const harness = createUiHarness();

  const dispose = setupStatusBarUi({ context: harness.context, ...setupDefaults });
  assert.ok(harness.getEditorFactory());

  dispose();
  assert.equal(harness.getEditorFactory(), undefined);
});

test("cleanup does not remove a footer installed by a later extension", () => {
  const harness = createUiHarness();
  const dispose = setupStatusBarUi({ context: harness.context, ...setupDefaults });
  const statusbarFooter = harness.getFooterComponent();

  harness.context.ui.setFooter(() => ({ render: () => ["other"], invalidate() {} }));
  const laterFooter = harness.getFooterComponent();
  assert.notEqual(laterFooter, statusbarFooter);

  dispose();
  assert.equal(harness.getFooterComponent(), laterFooter);
});

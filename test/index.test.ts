import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionAPI,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";

import powerlineFooter from "../index.js";
import { createTestTheme } from "./helpers.js";

type RuntimeHandler = (event: unknown, context: ExtensionContext) => unknown | Promise<unknown>;
type CommandHandler = (args: string, context: ExtensionCommandContext) => Promise<void>;

function createExtensionHarness() {
  const handlers = new Map<string, RuntimeHandler>();
  let commandHandler: CommandHandler | undefined;
  let thinkingLevelReads = 0;

  const pi = {
    on(name: string, handler: RuntimeHandler) {
      handlers.set(name, handler);
    },
    registerCommand(name: string, options: { handler: CommandHandler }) {
      assert.equal(name, "powerline");
      commandHandler = options.handler;
    },
    getThinkingLevel() {
      thinkingLevelReads++;
      return "off";
    },
  } as unknown as ExtensionAPI;

  powerlineFooter(pi);

  return {
    getHandler(name: string): RuntimeHandler {
      const handler = handlers.get(name);
      assert.ok(handler, `missing ${name} handler`);
      return handler;
    },
    getCommandHandler(): CommandHandler {
      assert.ok(commandHandler);
      return commandHandler;
    },
    getThinkingLevelReads: () => thinkingLevelReads,
  };
}

function createNonTuiContext(mode: "rpc" | "json" | "print"): ExtensionContext {
  return new Proxy({ mode } as ExtensionContext, {
    get(target, property, receiver) {
      if (property === "mode") return Reflect.get(target, property, receiver);
      throw new Error(`non-TUI handler accessed context.${String(property)}`);
    },
  });
}

const CONTEXTUAL_EVENTS = [
  "session_start",
  "tool_result",
  "user_bash",
  "thinking_level_select",
  "model_select",
  "session_compact",
  "session_tree",
  "turn_end",
  "agent_settled",
] as const;

test("all runtime behavior is inert outside TUI mode", async () => {
  for (const mode of ["rpc", "json", "print"] as const) {
    const harness = createExtensionHarness();
    const context = createNonTuiContext(mode);

    for (const eventName of CONTEXTUAL_EVENTS) {
      await harness.getHandler(eventName)({}, context);
    }

    const command = harness.getCommandHandler();
    await command("", context as ExtensionCommandContext);
    await command("minimal", context as ExtensionCommandContext);
    await command("not-a-preset", context as ExtensionCommandContext);
    await harness.getHandler("session_shutdown")({}, context);

    assert.equal(harness.getThinkingLevelReads(), 0);
  }
});

test("TUI startup installs the status bar and powerline toggle remains active", async () => {
  const harness = createExtensionHarness();
  let editorFactory: unknown;
  let footerInstalled = false;
  const notifications: string[] = [];

  const ui = {
    theme: createTestTheme(),
    getEditorComponent: () => editorFactory,
    setEditorComponent: (factory: unknown) => {
      editorFactory = factory;
    },
    setWidget: () => {},
    setFooter: (factory: unknown) => {
      footerInstalled = factory !== undefined;
    },
    notify: (message: string) => notifications.push(message),
  } as unknown as ExtensionUIContext;
  const context = {
    mode: "tui",
    hasUI: true,
    cwd: process.cwd(),
    ui,
  } as unknown as ExtensionCommandContext;

  await harness.getHandler("session_start")({}, context);
  assert.equal(harness.getThinkingLevelReads(), 1);
  assert.notEqual(editorFactory, undefined);
  assert.equal(footerInstalled, true);

  await harness.getCommandHandler()("", context);
  assert.equal(editorFactory, undefined);
  assert.equal(footerInstalled, false);
  assert.deepEqual(notifications, ["Defaults restored"]);

  await harness.getHandler("session_shutdown")({}, context);
});

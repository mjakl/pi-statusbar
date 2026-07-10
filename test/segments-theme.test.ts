import assert from "node:assert/strict";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";

import { renderSegment, sanitizeStatusText } from "../segments.js";
import { applyColor, rainbow } from "../theme.js";
import type { ColorValue, SegmentContext } from "../types.js";
import { createSegmentContext } from "./helpers.js";

process.env.POWERLINE_NERD_FONTS = "0";

test("path rendering uses the active Pi cwd", () => {
  const rendered = renderSegment("path", createSegmentContext({
    cwd: "/tmp/statusbar-active-project",
    options: { path: { mode: "basename" } },
  }));

  assert.equal(rendered.visible, true);
  assert.match(rendered.content, /statusbar-active-project/);
  assert.doesNotMatch(rendered.content, new RegExp(process.cwd().split("/").at(-1) ?? "^$"));
});

test("model and path labels cannot inject terminal controls", () => {
  const unsafeModel = {
    id: "model\nname",
    name: "Claude safe\x1b[2Jname",
    provider: "provider\tname",
    reasoning: true,
  } as unknown as SegmentContext["model"];
  const context = createSegmentContext({
    model: unsafeModel,
    cwd: "/tmp/path\nname\x1b]8;;https://example.com\x07link\x1b]8;;\x07",
    options: { path: { mode: "basename" } },
  });

  for (const segment of ["model", "model_key", "model_name", "path"] as const) {
    const rendered = renderSegment(segment, context);
    const withoutStyling = rendered.content.replace(/\x1b\[[0-9;]*m/g, "");
    assert.doesNotMatch(withoutStyling, /[\r\n\t\x1b]/);
  }
});

test("extension statuses are sanitized, sorted, and kept on one line", () => {
  const unsafe = "\x1b[31mred\x1b[0m\nnext\t\x1b]8;;https://example.com\x07link\x1b]8;;\x07";
  assert.equal(sanitizeStatusText(unsafe), "red next link");

  const rendered = renderSegment("extension_statuses", createSegmentContext({
    extensionStatuses: new Map([
      ["z-last", "second"],
      ["a-first", "first\nline"],
    ]),
  }));

  assert.equal(rendered.content, "first line · second");
  assert.doesNotMatch(rendered.content, /[\r\n\t\x1b]/);
});

test("invalid configured colors fall back instead of crashing", () => {
  const theme = {
    fg(color: string, text: string): string {
      if (color === "invalid") throw new Error("Unknown theme color");
      return `[${color}]${text}`;
    },
    getColorMode: () => "truecolor",
  } as unknown as Theme;

  assert.equal(applyColor(theme, "invalid" as ColorValue, "safe"), "[text]safe");
});

test("custom and rainbow colors respect 256-color terminals", () => {
  const theme = {
    fg: (_color: string, text: string) => text,
    getColorMode: () => "256color",
  } as unknown as Theme;

  assert.match(applyColor(theme, "#ff0000", "red"), /^\x1b\[38;5;\d+mred/);
  assert.match(rainbow(theme, "high"), /^\x1b\[38;5;\d+m/);
  assert.doesNotMatch(rainbow(theme, "high"), /38;2;/);
});

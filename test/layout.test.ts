import assert from "node:assert/strict";
import { hostname } from "node:os";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";

import { computeResponsiveLayout } from "../layout.js";
import type { PresetDef } from "../types.js";
import { createSegmentContext } from "./helpers.js";

process.env.POWERLINE_NERD_FONTS = "0";

test("explicit secondary segments stay on the second row", () => {
  const preset: PresetDef = {
    leftSegments: ["thinking"],
    rightSegments: [],
    secondarySegments: ["hostname"],
    separator: "pipe",
  };

  const layout = computeResponsiveLayout(createSegmentContext(), preset, 200);
  const shortHostname = hostname().split(".")[0]!;

  assert.match(layout.topContent, /think:off/);
  assert.doesNotMatch(layout.topContent, new RegExp(shortHostname));
  assert.match(layout.secondaryContent, new RegExp(shortHostname));
});

test("an oversized overflow segment does not suppress later short segments", () => {
  const preset: PresetDef = {
    leftSegments: ["path", "thinking"],
    rightSegments: [],
    separator: "pipe",
    segmentOptions: { path: { mode: "full" } },
  };
  const context = createSegmentContext({ cwd: `/tmp/${"very-long-directory/".repeat(8)}` });

  const layout = computeResponsiveLayout(context, preset, 15);

  assert.equal(layout.topContent, "");
  assert.match(layout.secondaryContent, /think:off/);
  assert.ok(visibleWidth(layout.secondaryContent) <= 15);
});

test("a lone oversized secondary segment is truncated to terminal width", () => {
  const preset: PresetDef = {
    leftSegments: [],
    rightSegments: [],
    secondarySegments: ["extension_statuses"],
    separator: "pipe",
  };
  const context = createSegmentContext({
    extensionStatuses: new Map([["long", "x".repeat(100)]]),
  });

  const layout = computeResponsiveLayout(context, preset, 20);

  assert.equal(layout.topContent, "");
  assert.ok(layout.secondaryContent.length > 0);
  assert.ok(visibleWidth(layout.secondaryContent) <= 20);
});

import { visibleWidth } from "@mariozechner/pi-tui";

import { ansi, getFgAnsiCode } from "./colors.js";
import { renderSegment } from "./segments.js";
import { getSeparator } from "./separators.js";
import type { PresetDef, SegmentContext, StatusLineSegmentId, StatusLineSeparatorStyle } from "./types.js";

export interface StatusLayout {
  topContent: string;
  secondaryContent: string;
}

interface MeasuredSegment {
  content: string;
  width: number;
}

const LAYOUT_CACHE_TTL_MS = 50;
const LAYOUT_BASE_OVERHEAD = 2; // leading + trailing spaces

function renderSegmentWithWidth(
  segmentId: StatusLineSegmentId,
  context: SegmentContext,
): MeasuredSegment | null {
  const rendered = renderSegment(segmentId, context);
  if (!rendered.visible || !rendered.content) {
    return null;
  }

  return {
    content: rendered.content,
    width: visibleWidth(rendered.content),
  };
}

function measureSegments(segmentIds: StatusLineSegmentId[], context: SegmentContext): MeasuredSegment[] {
  return segmentIds
    .map((segmentId) => renderSegmentWithWidth(segmentId, context))
    .filter((segment): segment is MeasuredSegment => segment !== null);
}

function buildContentFromParts(parts: string[], separatorStyle: StatusLineSeparatorStyle): string {
  if (parts.length === 0) {
    return "";
  }

  const separatorDef = getSeparator(separatorStyle);
  const separator = separatorDef.left;
  const separatorAnsi = getFgAnsiCode("sep");

  return ` ${parts.join(` ${separatorAnsi}${separator}${ansi.reset} `)}${ansi.reset} `;
}

function takeFittingSegments(
  segments: MeasuredSegment[],
  availableWidth: number,
  separatorWidth: number,
): { fitting: string[]; overflow: MeasuredSegment[] } {
  const fitting: string[] = [];
  const overflow: MeasuredSegment[] = [];

  let usedWidth = LAYOUT_BASE_OVERHEAD;
  let hasOverflow = false;

  for (const segment of segments) {
    const neededWidth = segment.width + (fitting.length > 0 ? separatorWidth : 0);

    if (!hasOverflow && usedWidth + neededWidth <= availableWidth) {
      fitting.push(segment.content);
      usedWidth += neededWidth;
      continue;
    }

    hasOverflow = true;
    overflow.push(segment);
  }

  return { fitting, overflow };
}

function takeFittingOverflowSegments(
  overflow: MeasuredSegment[],
  availableWidth: number,
  separatorWidth: number,
): string[] {
  const fitting: string[] = [];
  let usedWidth = LAYOUT_BASE_OVERHEAD;

  for (const segment of overflow) {
    const neededWidth = segment.width + (fitting.length > 0 ? separatorWidth : 0);
    if (usedWidth + neededWidth > availableWidth) {
      break;
    }

    fitting.push(segment.content);
    usedWidth += neededWidth;
  }

  return fitting;
}

export function computeResponsiveLayout(
  context: SegmentContext,
  presetDef: PresetDef,
  availableWidth: number,
): StatusLayout {
  const separatorDef = getSeparator(presetDef.separator);
  const separatorWidth = visibleWidth(separatorDef.left) + 2; // separator + surrounding spaces

  const primarySegmentIds = [...presetDef.leftSegments, ...presetDef.rightSegments];
  const secondarySegmentIds = presetDef.secondarySegments ?? [];
  const allSegmentIds = [...primarySegmentIds, ...secondarySegmentIds];

  const measuredSegments = measureSegments(allSegmentIds, context);
  if (measuredSegments.length === 0) {
    return { topContent: "", secondaryContent: "" };
  }

  const { fitting: topSegments, overflow } = takeFittingSegments(
    measuredSegments,
    availableWidth,
    separatorWidth,
  );
  const secondarySegments = takeFittingOverflowSegments(overflow, availableWidth, separatorWidth);

  return {
    topContent: buildContentFromParts(topSegments, presetDef.separator),
    secondaryContent: buildContentFromParts(secondarySegments, presetDef.separator),
  };
}

export class ResponsiveLayoutCache {
  private width = 0;
  private updatedAt = 0;
  private layout: StatusLayout | null = null;

  invalidate(): void {
    this.layout = null;
    this.updatedAt = 0;
  }

  get(width: number, build: () => StatusLayout): StatusLayout {
    const now = Date.now();
    const isFresh =
      this.layout !== null &&
      this.width === width &&
      now - this.updatedAt < LAYOUT_CACHE_TTL_MS;

    if (isFresh) {
      return this.layout;
    }

    this.width = width;
    this.layout = build();
    this.updatedAt = now;
    return this.layout;
  }
}

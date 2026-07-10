import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { renderSegment } from "./segments.js";
import { getSeparator } from "./separators.js";
import { fg } from "./theme.js";
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

function buildContentFromParts(
  parts: string[],
  separatorStyle: StatusLineSeparatorStyle,
  context: SegmentContext,
): string {
  if (parts.length === 0) {
    return "";
  }

  const separator = getSeparator(separatorStyle).left;
  const coloredSeparator = fg(context.theme, "separator", separator, context.colors);
  return `${parts.join(` ${coloredSeparator} `)}\x1b[0m`;
}

function takeFittingPrimarySegments(
  segments: MeasuredSegment[],
  availableWidth: number,
  separatorWidth: number,
): { fitting: string[]; overflow: MeasuredSegment[] } {
  const fitting: string[] = [];
  const overflow: MeasuredSegment[] = [];
  let usedWidth = 0;
  let hasOverflow = false;

  for (const segment of segments) {
    const neededWidth = segment.width + (fitting.length > 0 ? separatorWidth : 0);

    if (!hasOverflow && usedWidth + neededWidth <= availableWidth) {
      fitting.push(segment.content);
      usedWidth += neededWidth;
      continue;
    }

    // Preserve primary ordering: once one segment overflows, the remainder is
    // considered for the second row.
    hasOverflow = true;
    overflow.push(segment);
  }

  return { fitting, overflow };
}

function takeFittingSecondarySegments(
  segments: MeasuredSegment[],
  availableWidth: number,
  separatorWidth: number,
): string[] {
  const fitting: string[] = [];
  let usedWidth = 0;
  let oversizedFallback: MeasuredSegment | null = null;

  for (const segment of segments) {
    const neededWidth = segment.width + (fitting.length > 0 ? separatorWidth : 0);
    if (usedWidth + neededWidth > availableWidth) {
      if (segment.width > availableWidth && !oversizedFallback) {
        oversizedFallback = segment;
      }
      // A large segment must not suppress useful shorter segments after it.
      continue;
    }

    fitting.push(segment.content);
    usedWidth += neededWidth;
  }

  if (fitting.length > 0 || !oversizedFallback || availableWidth <= 0) {
    return fitting;
  }

  return [truncateToWidth(oversizedFallback.content, availableWidth, "…")];
}

export function computeResponsiveLayout(
  context: SegmentContext,
  presetDef: PresetDef,
  availableWidth: number,
): StatusLayout {
  const separatorDef = getSeparator(presetDef.separator);
  const separatorWidth = visibleWidth(separatorDef.left) + 2;

  // `secondarySegments` are low-priority additions to the top row. They move
  // to the second row only when the complete row no longer fits.
  const segmentIds = [
    ...presetDef.leftSegments,
    ...presetDef.rightSegments,
    ...(presetDef.secondarySegments ?? []),
  ];
  const segments = measureSegments(segmentIds, context);

  const { fitting: topSegments, overflow } = takeFittingPrimarySegments(
    segments,
    availableWidth,
    separatorWidth,
  );
  const secondarySegments = takeFittingSecondarySegments(
    overflow,
    availableWidth,
    separatorWidth,
  );

  return {
    topContent: buildContentFromParts(topSegments, presetDef.separator, context),
    secondaryContent: buildContentFromParts(secondarySegments, presetDef.separator, context),
  };
}

export class ResponsiveLayoutCache {
  private width = 0;
  private cacheKey = "";
  private updatedAt = 0;
  private layout: StatusLayout | null = null;

  invalidate(): void {
    this.layout = null;
    this.cacheKey = "";
    this.updatedAt = 0;
  }

  get(width: number, cacheKey: string, build: () => StatusLayout): StatusLayout {
    const now = Date.now();
    const isFresh = this.layout !== null
      && this.width === width
      && this.cacheKey === cacheKey
      && now - this.updatedAt < LAYOUT_CACHE_TTL_MS;

    if (isFresh && this.layout) {
      return this.layout;
    }

    const layout = build();
    this.width = width;
    this.cacheKey = cacheKey;
    this.layout = layout;
    this.updatedAt = now;
    return layout;
  }
}

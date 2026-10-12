import { describe, expect, it } from "vitest";
import { contrastRatio, contrastText } from "@/lib/color";
import { PALETTE, TEAM_COLORS } from "@/lib/engine/factory";

const AVATAR_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#9333ea",
  "#f97316",
  "#0891b2",
  "#db2777",
  "#64748b",
];

describe("contrastText", () => {
  it("picks dark text on light colors and white on dark ones", () => {
    expect(contrastText("#ffffff")).toBe("#111827");
    expect(contrastText("#eab308")).toBe("#111827");
    expect(contrastText("#f97316")).toBe("#111827");
    expect(contrastText("#1e3a8a")).toBe("#ffffff");
  });

  it("keeps avatar initials at WCAG AA", () => {
    for (const c of AVATAR_COLORS) expect(contrastRatio(c, contrastText(c)), c).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps bold token numbers at the large-text threshold", () => {
    for (const c of [...PALETTE, ...Object.values(TEAM_COLORS)]) {
      expect(contrastRatio(c, contrastText(c)), c).toBeGreaterThanOrEqual(3);
    }
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FingerGuideStroke } from "../keyboard/resolveFingerGuideStroke";
import { FingerGuide } from "./FingerGuide";

const shiftedStroke: FingerGuideStroke = {
  code: "KeyF",
  legend: "F",
  primary: { hand: "left", finger: "index" },
  shift: {
    code: "ShiftRight",
    assignment: { hand: "right", finger: "pinky" },
  },
};

describe("FingerGuide", () => {
  it("does not render when the saved mode is off", () => {
    expect(renderToStaticMarkup(
      <FingerGuide isMuted={false} mode="off" pulse={0} stroke={shiftedStroke} />,
    )).toBe("");
  });

  it("keeps Auto compact and describes the accepted stroke without exposing a full keyboard", () => {
    const html = renderToStaticMarkup(
      <FingerGuide isMuted={false} mode="auto" pulse={1} stroke={shiftedStroke} />,
    );

    expect(html).toContain("Pressed F");
    expect(html).toContain("Recommended: Left index");
    expect(html).toContain("Shift: Right little finger");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("ANSI QWERTY map");
  });

  it("renders the full ANSI map as an expanded, collapsible layer in Full mode", () => {
    const html = renderToStaticMarkup(
      <FingerGuide isMuted={false} mode="full" pulse={2} stroke={shiftedStroke} />,
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("ANSI QWERTY map");
    expect(html).toContain('data-code="Escape"');
    expect(html).toContain("Primary key and modifier use different highlights");
  });

  it("returns to a static home-row reminder while Practice is muted", () => {
    const html = renderToStaticMarkup(
      <FingerGuide isMuted mode="full" pulse={2} stroke={shiftedStroke} />,
    );

    expect(html).toContain("Home row");
    expect(html).toContain("Rest on ASDF · JKL;");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Pressed F");
    expect(html).not.toContain("ANSI QWERTY map");
  });
});

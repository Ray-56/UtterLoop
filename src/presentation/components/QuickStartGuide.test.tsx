import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuickStartGuide } from "./QuickStartGuide";

describe("QuickStartGuide", () => {
  it("explains only the current beginner step and can be dismissed", () => {
    const html = renderToStaticMarkup(
      <QuickStartGuide onDismiss={vi.fn()} step={1} />,
    );

    expect(html).toContain("Quick Start");
    expect(html).toContain("Step 1 of 6");
    expect(html).toContain("Meet the sentence first");
    expect(html).toContain("Skip Quick Start");
    expect(html).not.toContain("Spaced Review");
  });

  it("frames the final step around independent recall and spaced review", () => {
    const html = renderToStaticMarkup(
      <QuickStartGuide onDismiss={vi.fn()} step={6} />,
    );

    expect(html).toContain("Step 6 of 6");
    expect(html).toContain("Independent recall");
    expect(html).toContain("spaced Review");
  });

  it("waits until recall begins before inviting Step 3 typing", () => {
    const exposureHtml = renderToStaticMarkup(
      <QuickStartGuide onDismiss={vi.fn()} phase="first-exposure" step={3} />,
    );
    const recallHtml = renderToStaticMarkup(
      <QuickStartGuide onDismiss={vi.fn()} phase="recall" step={3} />,
    );

    expect(exposureHtml).toContain("Meet the next sentence first");
    expect(exposureHtml).toContain("Start recall when you&#x27;re ready");
    expect(exposureHtml).not.toContain("in your own typing");
    expect(recallHtml).toContain("Recall the next sentence");
    expect(recallHtml).toContain("Prompt and word track");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OptionalActivityBoundary, OptionalActivityLoadError, OptionalActivityLoading } from "./OptionalActivityBoundary";

describe("optional activity loading", () => {
  it("keeps loading accessible and names the pending activity", () => {
    const html = renderToStaticMarkup(<OptionalActivityLoading title="Fluency Pass" />);
    expect(html).toContain("Opening Fluency Pass");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("explains that explicit retry reloads the document after a module failure", () => {
    const html = renderToStaticMarkup(<OptionalActivityLoadError title="Learning Studio" onRetry={() => {}} />);
    expect(html).toContain("Learning Studio could not be opened");
    expect(html).toContain("Retry loading activity");
    expect(html).toContain("Retry reloads this page");
    expect(html).toContain('role="alert"');
  });

  it("passes a loaded activity through without changing its content", () => {
    const html = renderToStaticMarkup(<OptionalActivityBoundary title="Typing" onRetry={() => {}}>
      <p>Loaded activity</p>
    </OptionalActivityBoundary>);
    expect(html).toBe("<p>Loaded activity</p>");
  });
});

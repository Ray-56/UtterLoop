import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Keyboard } from "lucide-react";
import { Shell } from "./Shell";

describe("Shell storage status", () => {
  it("keeps a storage initialization failure recoverable without a page reload", () => {
    const html = renderToStaticMarkup(
      <Shell
        activeView="practice"
        error="IndexedDB could not be opened."
        navigation={[{ id: "practice", label: "Practice", icon: Keyboard }]}
        onNavigate={vi.fn()}
        onRetryStartup={vi.fn()}
        snapshot={null}
        status="error"
      >
        <p>Practice child</p>
      </Shell>,
    );

    expect(html).toContain("Local data could not be loaded");
    expect(html).toContain("UtterLoop could not access local storage.");
    expect(html).not.toContain("IndexedDB could not be opened.");
    expect(html).toContain("Retry startup");
    expect(html).not.toContain("Practice child");
  });

  it("keeps the Practice title accessible without rendering a visible page header", () => {
    const html = renderToStaticMarkup(
      <Shell
        activeView="practice"
        error={null}
        navigation={[{ id: "practice", label: "Practice", icon: Keyboard }]}
        onNavigate={vi.fn()}
        onRetryStartup={vi.fn()}
        snapshot={null}
        status="write-error"
      >
        <p>Practice child</p>
      </Shell>,
    );

    expect(html).toContain('data-storage-status="write-error"');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain("Practice session");
    expect(html).not.toContain("workspace-header");
    expect(html).not.toContain("Focus mode");
    expect(html).not.toContain("Save needs attention");
    expect(html).toContain("Practice child");
    expect(html).not.toContain("Retry startup");
  });

  it("keeps the visible page header and storage status on supporting views", () => {
    const html = renderToStaticMarkup(
      <Shell
        activeView="settings"
        error={null}
        navigation={[{ id: "settings", label: "Settings", icon: Keyboard }]}
        onNavigate={vi.fn()}
        onRetryStartup={vi.fn()}
        snapshot={null}
        status="write-error"
      >
        <p>Settings child</p>
      </Shell>,
    );

    expect(html).toContain('data-storage-status="write-error"');
    expect(html).toContain("workspace-header");
    expect(html).toContain("Preferences &amp; data");
    expect(html).toContain("Save needs attention");
    expect(html).toContain("Settings child");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildCourseCatalogUrl,
  parseCourseCatalogUrl,
  resolveAppViewFromUrl,
  updateAppViewInUrl,
} from "./courseCatalogUrlState";

describe("course catalog URL state", () => {
  it("parses a deep-linked detail with catalog filters", () => {
    expect(
      parseCourseCatalogUrl(
        "?view=courses&course=work-study-essentials&q=team%20update&category=work-study&cefr=B1&status=in-progress&sort=progress",
      ),
    ).toEqual({
      isCoursesView: true,
      selectedCourseId: "work-study-essentials",
      query: {
        text: "team update",
        categoryId: "work-study",
        cefr: "B1",
        status: "in-progress",
        sort: "progress",
      },
    });
  });

  it("falls back safely for unknown filter values", () => {
    expect(parseCourseCatalogUrl("?view=courses&cefr=Z9&status=paused&sort=random")).toEqual({
      isCoursesView: true,
      selectedCourseId: null,
      query: {
        text: "",
        categoryId: null,
        cefr: null,
        status: null,
        sort: "recommended",
      },
    });
  });

  it("serializes only active catalog criteria in a stable order", () => {
    expect(
      buildCourseCatalogUrl({
        selectedCourseId: "voa-lle1-sentence-recall",
        query: {
          text: "  VOA  ",
          categoryId: "everyday-communication",
          cefr: "A1",
          status: "not-started",
          sort: "title",
        },
      }),
    ).toBe(
      "?view=courses&course=voa-lle1-sentence-recall&q=VOA&category=everyday-communication&cefr=A1&status=not-started&sort=title",
    );
  });

  it("keeps discovery filters but drops course detail when leaving Courses", () => {
    expect(
      updateAppViewInUrl(
        "?view=courses&course=course-1&q=work&category=work-study&sort=progress",
        "practice",
      ),
    ).toBe("?view=practice&q=work&category=work-study&sort=progress");
  });

  it("opens a copied course detail URL in Courses and rejects unknown views", () => {
    expect(resolveAppViewFromUrl("?view=courses&course=course-1")).toBe("courses");
    expect(resolveAppViewFromUrl("?view=unknown")).toBe("practice");
    expect(resolveAppViewFromUrl("")).toBe("practice");
  });
});

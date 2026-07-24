import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../domain/curriculum/Course";
import { DEFAULT_COURSE_CATALOG_QUERY } from "../../domain/curriculum/queryCourseCatalog";
import type { ReviewState } from "../../domain/review/ReviewState";
import { CoursesView } from "./CoursesView";

const learningPaths: LearningPath[] = [
  {
    id: "path-1",
    title: "Structured Foundations",
    description: "Build a dependable base one lesson at a time.",
    courseIds: ["course-1"],
  },
];

const categories: CourseCategory[] = [
  {
    id: "everyday-communication",
    title: "Everyday Communication",
    description: "Useful English for daily conversations.",
    sortOrder: 0,
  },
  {
    id: "work-study",
    title: "Work & Study",
    description: "English for collaboration and learning.",
    sortOrder: 1,
  },
];

const courses: Course[] = [
  {
    id: "course-1",
    title: "Conversation Basics",
    description: "Recall useful sentences for a first conversation.",
    categoryId: "everyday-communication",
    tags: ["conversation", "introductions"],
    level: { label: "Beginner · A1", cefrFrom: "A1", cefrTo: "A1" },
    provider: {
      kind: "curated",
      name: "VOA Learning English",
      url: "https://learningenglish.voanews.com/",
    },
    revision: 2,
    license: {
      name: "Voice of America Public Domain",
      url: "https://learningenglish.voanews.com/p/6861.html",
      attribution: "VOA Learning English (learningenglish.voanews.com)",
    },
    units: [
      {
        id: "unit-1",
        title: "Introductions",
        description: "Meet someone and keep the exchange moving.",
        lessons: [
          {
            id: "lesson-1",
            title: "Meet Someone New",
            objective: "Greet someone and exchange names.",
            sourceUrl: "https://learningenglish.voanews.com/a/example/1.html",
            cardIds: ["card-1", "card-2"],
          },
          {
            id: "lesson-2",
            title: "Close the Conversation",
            objective: "End an introduction politely.",
            cardIds: ["card-3"],
          },
        ],
      },
    ],
  },
];

const workCourse: Course = {
  id: "course-2",
  title: "Project Update Basics",
  description: "Give a concise update at work.",
  categoryId: "work-study",
  tags: ["work", "updates"],
  level: { label: "Elementary · A2–B1", cefrFrom: "A2", cefrTo: "B1" },
  provider: { kind: "original", name: "UtterLoop Original" },
  revision: 1,
  license: {
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: "No attribution required.",
  },
  units: [],
};

const cards: SentenceCard[] = [
  card("card-1", "VOA Learning English — Lesson 1"),
  card("card-2", "VOA Learning English — Lesson 1"),
  card("card-3", "VOA Learning English — Lesson 1"),
];

const reviewStates: ReviewState[] = [reviewState("card-1"), reviewState("card-3")];

describe("CoursesView", () => {
  it("shows compact course summaries without rendering course details", () => {
    const html = renderToStaticMarkup(
      <CoursesView
        catalogQuery={DEFAULT_COURSE_CATALOG_QUERY}
        categories={categories}
        learningPaths={learningPaths}
        courses={courses}
        cards={cards}
        selectedCourseId={null}
        reviewStates={reviewStates}
        onCatalogQueryChange={vi.fn()}
        onStartLesson={vi.fn()}
        onReplayLesson={vi.fn()}
        onSelectCourse={vi.fn()}
      />,
    );

    expect(html).toContain("Structured Foundations");
    expect(html).toContain("Conversation Basics");
    expect(html).not.toContain("Unit 1");
    expect(html).not.toContain("Greet someone and exchange names.");
    expect(html).not.toContain("Voice of America Public Domain");
  });

  it("replaces the catalog with the selected course detail", () => {
    const html = renderToStaticMarkup(
      <CoursesView
        catalogQuery={DEFAULT_COURSE_CATALOG_QUERY}
        categories={categories}
        learningPaths={learningPaths}
        courses={courses}
        cards={cards}
        selectedCourseId="course-1"
        reviewStates={reviewStates}
        onCatalogQueryChange={vi.fn()}
        onStartLesson={vi.fn()}
        onReplayLesson={vi.fn()}
        onSelectCourse={vi.fn()}
      />,
    );

    expect(html).toContain("All courses");
    expect(html).toContain("Conversation Basics");
    expect(html).toContain("Introductions");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Meet Someone New");
    expect(html).toContain("1 of 2 sentences passed");
    expect(html).toContain("Continue course");
    expect(html).toContain("Continue lesson");
    expect(html).toContain("Voice of America Public Domain");
    expect(html).toContain("opens in a new tab");
    expect(html).not.toContain("Course catalog");
  });

  it("shows the first incomplete learning-path recommendation", () => {
    const html = renderToStaticMarkup(
      <CoursesView
        catalogQuery={DEFAULT_COURSE_CATALOG_QUERY}
        categories={categories}
        learningPaths={learningPaths}
        courses={courses}
        cards={cards}
        selectedCourseId={null}
        reviewStates={reviewStates}
        onCatalogQueryChange={vi.fn()}
        onStartLesson={vi.fn()}
        onReplayLesson={vi.fn()}
        onSelectCourse={vi.fn()}
      />,
    );

    expect(html).toContain("Continue your path");
    expect(html).toContain("Structured Foundations");
    expect(html).toContain("Conversation Basics");
    expect(html).toContain("Meet Someone New");
    expect(html).toContain("Continue");
  });

  it("celebrates a completed learning path without inventing a recommendation", () => {
    const html = renderToStaticMarkup(
      <CoursesView
        catalogQuery={DEFAULT_COURSE_CATALOG_QUERY}
        categories={categories}
        learningPaths={learningPaths}
        courses={courses}
        cards={cards}
        selectedCourseId={null}
        reviewStates={[...reviewStates, reviewState("card-2")]}
        onCatalogQueryChange={vi.fn()}
        onStartLesson={vi.fn()}
        onReplayLesson={vi.fn()}
        onSelectCourse={vi.fn()}
      />,
    );

    expect(html).toContain("Learning paths complete");
    expect(html).toContain("Every recommended course is complete");
    expect(html).not.toContain("Continue your path");
  });

  it("renders controlled discovery filters and the matching result", () => {
    const html = renderToStaticMarkup(
      <CoursesView
        catalogQuery={{
          text: "project update",
          categoryId: "work-study",
          cefr: "B1",
          status: "not-started",
          sort: "title",
        }}
        categories={categories}
        learningPaths={learningPaths}
        courses={[...courses, workCourse]}
        cards={cards}
        selectedCourseId={null}
        reviewStates={reviewStates}
        onCatalogQueryChange={vi.fn()}
        onStartLesson={vi.fn()}
        onReplayLesson={vi.fn()}
        onSelectCourse={vi.fn()}
      />,
    );

    expect(html).toContain("Search courses");
    expect(html).toContain('type="search"');
    expect(html).toContain('value="project update"');
    expect(html).toContain("Categories");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("CEFR level");
    expect(html).toContain("Learning status");
    expect(html).toContain("Sort by");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("1 course found");
    expect(html).toContain("Clear filters");
    expect(html).toContain("Project Update Basics");
    expect(html).not.toContain('aria-label="View course Conversation Basics"');
  });

  it("limits the initial catalog window to 24 courses", () => {
    const manyCourses = Array.from({ length: 25 }, (_, index) => ({
      ...workCourse,
      id: `bulk-course-${index + 1}`,
      title: `Bulk Course ${String(index + 1).padStart(2, "0")}`,
    }));
    const html = renderToStaticMarkup(
      <CoursesView
        catalogQuery={DEFAULT_COURSE_CATALOG_QUERY}
        categories={categories}
        learningPaths={[]}
        courses={manyCourses}
        cards={[]}
        selectedCourseId={null}
        reviewStates={[]}
        onCatalogQueryChange={vi.fn()}
        onStartLesson={vi.fn()}
        onReplayLesson={vi.fn()}
        onSelectCourse={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="View course Bulk Course 24"');
    expect(html).not.toContain('aria-label="View course Bulk Course 25"');
    expect(html).toContain("Showing 24 of 25 courses");
    expect(html).toContain("Load more");
  });

  it("offers a recoverable empty result with the active criteria", () => {
    const html = renderToStaticMarkup(
      <CoursesView
        catalogQuery={{
          ...DEFAULT_COURSE_CATALOG_QUERY,
          text: "submarine negotiations",
          categoryId: "work-study",
        }}
        categories={categories}
        learningPaths={learningPaths}
        courses={[...courses, workCourse]}
        cards={cards}
        selectedCourseId={null}
        reviewStates={reviewStates}
        onCatalogQueryChange={vi.fn()}
        onStartLesson={vi.fn()}
        onReplayLesson={vi.fn()}
        onSelectCourse={vi.fn()}
      />,
    );

    expect(html).toContain("No courses match your filters");
    expect(html).toContain("submarine negotiations");
    expect(html).toContain("Work &amp; Study");
    expect(html).toContain("Clear filters");
    expect(html).not.toContain("course-row\"");
  });

  it("shows a recoverable state for a missing course detail", () => {
    const html = renderToStaticMarkup(
      <CoursesView
        catalogQuery={DEFAULT_COURSE_CATALOG_QUERY}
        categories={categories}
        learningPaths={learningPaths}
        courses={courses}
        cards={cards}
        selectedCourseId="removed-course"
        reviewStates={reviewStates}
        onCatalogQueryChange={vi.fn()}
        onStartLesson={vi.fn()}
        onReplayLesson={vi.fn()}
        onSelectCourse={vi.fn()}
      />,
    );

    expect(html).toContain("Course not found");
    expect(html).toContain("All courses");
    expect(html).not.toContain("course-filter-bar");
  });
});

function card(id: string, source: string): SentenceCard {
  return {
    id,
    english: `Sentence ${id}`,
    prompt: `Prompt ${id}`,
    source,
    tags: [],
    acceptableAnswers: [],
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function reviewState(cardId: string): ReviewState {
  return {
    cardId,
    stage: 1,
    dueAt: "2026-07-20T00:00:00.000Z",
    lastReviewedAt: "2026-07-19T00:00:00.000Z",
    streak: 1,
    lapseCount: 0,
  };
}

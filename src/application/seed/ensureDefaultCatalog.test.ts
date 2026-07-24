import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../domain/curriculum/Course";
import type { CourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import { defaultCatalog } from "./defaultCatalog";
import { ensureDefaultCatalog } from "./ensureDefaultCatalog";

describe("ensureDefaultCatalog", () => {
  it("installs the complete default catalog atomically into an empty repository", async () => {
    const repository = new CatalogRepository();

    await ensureDefaultCatalog(repository);

    expect(repository.writes).toHaveLength(1);
    expect(repository.writes[0]).toEqual(defaultCatalog);
  });

  it("does not write when the current default catalog is already installed", async () => {
    const repository = new CatalogRepository(
      defaultCatalog.learningPaths,
      defaultCatalog.courses,
      defaultCatalog.cards,
      defaultCatalog.categories,
    );

    await ensureDefaultCatalog(repository);

    expect(repository.writes).toEqual([]);
  });

  it("reinstalls an outdated course with its cards and adds individually missing cards", async () => {
    const voaCourse = defaultCatalog.courses[1];
    const missingCardId = "sf-003";
    const repository = new CatalogRepository(
      defaultCatalog.learningPaths,
      defaultCatalog.courses.map((course) =>
        course.id === voaCourse.id ? { ...course, revision: course.revision - 1 } : course,
      ),
      defaultCatalog.cards.filter((card) => card.id !== missingCardId),
      defaultCatalog.categories,
    );

    await ensureDefaultCatalog(repository);

    expect(defaultCatalog.cards.some((card) => card.id === missingCardId)).toBe(true);
    expect(repository.writes).toHaveLength(1);
    expect(repository.writes[0].learningPaths).toEqual([]);
    expect(repository.writes[0].courses).toEqual([voaCourse]);
    expect(repository.writes[0].cards).toHaveLength(21);
    expect(new Set(repository.writes[0].cards.map((card) => card.id))).toEqual(
      new Set([
        missingCardId,
        ...voaCourse.units.flatMap((unit) =>
          unit.lessons.flatMap((lesson) => lesson.cardIds),
        ),
      ]),
    );
  });

  it("installs a missing category without rewriting current course content", async () => {
    const missingCategory = defaultCatalog.categories[1];
    const repository = new CatalogRepository(
      defaultCatalog.learningPaths,
      defaultCatalog.courses,
      defaultCatalog.cards,
      defaultCatalog.categories.filter((category) => category.id !== missingCategory.id),
    );

    await ensureDefaultCatalog(repository);

    expect(repository.writes).toEqual([
      {
        categories: [missingCategory],
        learningPaths: [],
        courses: [],
        cards: [],
      },
    ]);
  });
});

class CatalogRepository {
  readonly writes: CourseCatalog[] = [];

  constructor(
    private readonly learningPaths: LearningPath[] = [],
    private readonly courses: Course[] = [],
    private readonly cards: SentenceCard[] = [],
    private readonly categories: CourseCategory[] = [],
  ) {}

  async listCourseCategories(): Promise<CourseCategory[]> {
    return this.categories;
  }

  async listLearningPaths(): Promise<LearningPath[]> {
    return this.learningPaths;
  }

  async listCourses(): Promise<Course[]> {
    return this.courses;
  }

  async listSentenceCards(): Promise<SentenceCard[]> {
    return this.cards;
  }

  async saveCourseCatalog(catalog: CourseCatalog): Promise<void> {
    this.writes.push(catalog);
  }
}

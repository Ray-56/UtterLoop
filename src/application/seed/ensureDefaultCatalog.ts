import type { TrainingRepository } from "../ports/TrainingRepository";
import { validateCourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import type { LearningPath } from "../../domain/curriculum/Course";
import { defaultCatalog } from "./defaultCatalog";

type DefaultCatalogRepository = Pick<
  TrainingRepository,
  | "listCourseCategories"
  | "listLearningPaths"
  | "listCourses"
  | "listSentenceCards"
  | "saveCourseCatalog"
>;

export async function ensureDefaultCatalog(
  repository: DefaultCatalogRepository,
): Promise<void> {
  validateCourseCatalog(defaultCatalog);

  const [existingCategories, existingPaths, existingCourses, existingCards] = await Promise.all([
    repository.listCourseCategories(),
    repository.listLearningPaths(),
    repository.listCourses(),
    repository.listSentenceCards(),
  ]);
  const existingCategoryIds = new Set(
    existingCategories.map((category) => category.id),
  );
  const existingPathsById = new Map(existingPaths.map((path) => [path.id, path]));
  const existingCoursesById = new Map(
    existingCourses.map((course) => [course.id, course]),
  );
  const existingCardIds = new Set(existingCards.map((card) => card.id));

  const categories = defaultCatalog.categories.filter(
    (category) => !existingCategoryIds.has(category.id),
  );

  const learningPaths = defaultCatalog.learningPaths.filter(
    (path) => {
      const existingPath = existingPathsById.get(path.id);
      return !existingPath || !sameLearningPath(existingPath, path);
    },
  );
  const courses = defaultCatalog.courses.filter((course) => {
    const existingCourse = existingCoursesById.get(course.id);
    return !existingCourse || existingCourse.revision < course.revision;
  });
  const courseIdsToInstall = new Set(courses.map((course) => course.id));
  const courseCardIdsToInstall = new Set(
    defaultCatalog.courses
      .filter((course) => courseIdsToInstall.has(course.id))
      .flatMap((course) =>
        course.units.flatMap((unit) =>
          unit.lessons.flatMap((lesson) => lesson.cardIds),
        ),
      ),
  );
  const cards = defaultCatalog.cards.filter(
    (card) =>
      !existingCardIds.has(card.id) || courseCardIdsToInstall.has(card.id),
  );

  if (
    categories.length === 0 &&
    learningPaths.length === 0 &&
    courses.length === 0 &&
    cards.length === 0
  ) {
    return;
  }

  await repository.saveCourseCatalog({
    categories,
    learningPaths,
    courses,
    cards,
  });
}

function sameLearningPath(left: LearningPath, right: LearningPath): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.description === right.description &&
    left.courseIds.length === right.courseIds.length &&
    left.courseIds.every((courseId, index) => courseId === right.courseIds[index])
  );
}

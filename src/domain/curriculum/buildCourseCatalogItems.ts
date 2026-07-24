import type { ReviewState } from "../review/ReviewState";
import type { Course, CourseCategory, LearningPath } from "./Course";
import {
  deriveCourseProgress,
  type CourseProgress,
} from "./deriveCourseProgress";

export interface CourseCatalogItem {
  course: Course;
  category: CourseCategory;
  progress: CourseProgress;
  pathIds: string[];
  unitCount: number;
  lessonCount: number;
  cardCount: number;
  recommendationRank: number | null;
}

export interface BuildCourseCatalogItemsInput {
  categories: CourseCategory[];
  courses: Course[];
  learningPaths: LearningPath[];
  reviewStates: ReviewState[];
}

export function buildCourseCatalogItems({
  categories,
  courses,
  learningPaths,
  reviewStates,
}: BuildCourseCatalogItemsInput): CourseCatalogItem[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const pathIdsByCourseId = new Map<string, string[]>();
  const recommendationRankByCourseId = new Map<string, number>();
  let nextRecommendationRank = 0;

  for (const path of learningPaths) {
    for (const courseId of path.courseIds) {
      const pathIds = pathIdsByCourseId.get(courseId) ?? [];
      if (!pathIds.includes(path.id)) {
        pathIds.push(path.id);
        pathIdsByCourseId.set(courseId, pathIds);
      }

      if (!recommendationRankByCourseId.has(courseId)) {
        recommendationRankByCourseId.set(courseId, nextRecommendationRank);
        nextRecommendationRank += 1;
      }
    }
  }

  return courses.map((course) => {
    const category = categoryById.get(course.categoryId);

    if (!category) {
      throw new Error(`Course ${course.id} references unknown CourseCategory: ${course.categoryId}`);
    }

    const lessonCount = course.units.reduce(
      (total, unit) => total + unit.lessons.length,
      0,
    );
    const cardCount = course.units.reduce(
      (courseTotal, unit) =>
        courseTotal +
        unit.lessons.reduce(
          (unitTotal, lesson) => unitTotal + lesson.cardIds.length,
          0,
        ),
      0,
    );

    return {
      course,
      category,
      progress: deriveCourseProgress(course, reviewStates),
      pathIds: pathIdsByCourseId.get(course.id) ?? [],
      unitCount: course.units.length,
      lessonCount,
      cardCount,
      recommendationRank: recommendationRankByCourseId.get(course.id) ?? null,
    };
  });
}

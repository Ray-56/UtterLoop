import type { Course, CourseId, CourseLessonId, LearningPath } from "./Course";
import type { CourseProgress } from "./deriveCourseProgress";

export interface NextLessonAction {
  courseId: CourseId;
  courseTitle: string;
  lessonId: CourseLessonId;
  lessonTitle: string;
  scope: {
    kind: "lesson";
    courseId: CourseId;
    lessonId: CourseLessonId;
    mode: "learn";
  };
}

export interface ResolveNextLessonActionInput {
  completedCourseId: CourseId;
  completedLessonId: CourseLessonId;
  learningPaths: LearningPath[];
  courses: Course[];
  courseProgress: CourseProgress[];
}

export function resolveNextLessonAction(
  input: ResolveNextLessonActionInput,
): NextLessonAction | null {
  const path = input.learningPaths.find((candidate) => candidate.courseIds.includes(input.completedCourseId));

  if (!path) {
    return resolveStandaloneCourse(input);
  }

  const progressByCourseId = new Map(input.courseProgress.map((progress) => [progress.courseId, progress]));
  const recommendedCourseId = path.courseIds.find((courseId) => {
    const progress = progressByCourseId.get(courseId);
    return Boolean(progress?.recommendedLessonId);
  });

  if (!recommendedCourseId) {
    return null;
  }

  const lessonId = progressByCourseId.get(recommendedCourseId)?.recommendedLessonId;
  return lessonId ? actionFor(input.courses, recommendedCourseId, lessonId) : null;
}

function resolveStandaloneCourse(
  input: ResolveNextLessonActionInput,
): NextLessonAction | null {
  const course = input.courses.find((candidate) => candidate.id === input.completedCourseId);
  const progress = input.courseProgress.find((candidate) => candidate.courseId === input.completedCourseId);

  if (!course || !progress) {
    return null;
  }

  const lessons = course.units.flatMap((unit) => unit.lessons);
  const completedIndex = lessons.findIndex((lesson) => lesson.id === input.completedLessonId);

  if (completedIndex < 0) {
    return null;
  }

  const incompleteLessonIds = new Set(
    progress.units
      .flatMap((unit) => unit.lessons)
      .filter((lesson) => lesson.status !== "completed")
      .map((lesson) => lesson.lessonId),
  );
  const lesson = [
    ...lessons.slice(completedIndex + 1),
    ...lessons.slice(0, completedIndex),
  ].find((candidate) => incompleteLessonIds.has(candidate.id));

  return lesson ? actionFor(input.courses, course.id, lesson.id) : null;
}

function actionFor(
  courses: Course[],
  courseId: CourseId,
  lessonId: CourseLessonId,
): NextLessonAction | null {
  const course = courses.find((candidate) => candidate.id === courseId);
  const lesson = course?.units
    .flatMap((unit) => unit.lessons)
    .find((candidate) => candidate.id === lessonId);

  if (!course || !lesson) {
    return null;
  }

  return {
    courseId: course.id,
    courseTitle: course.title,
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    scope: {
      kind: "lesson",
      courseId: course.id,
      lessonId: lesson.id,
      mode: "learn",
    },
  };
}

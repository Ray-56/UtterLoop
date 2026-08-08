import type { SentenceLearningState } from "../learning/SentenceLearningState";
import { deriveCourseProgress, type CourseProgress } from "./deriveCourseProgress";
import type { Course, LearningPath } from "./Course";

export interface LearningPathProgress {
  pathId: string;
  status: "not-started" | "in-progress" | "completed";
  completedCourses: number;
  totalCourses: number;
  passedCards: number;
  totalCards: number;
  recommendedCourseId: string | null;
  recommendedLessonId: string | null;
  courses: CourseProgress[];
}

export function deriveLearningPathProgress(
  path: LearningPath,
  courses: Course[],
  learningStates: SentenceLearningState[],
): LearningPathProgress {
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const courseProgress = path.courseIds.map((courseId) => {
    const course = courseById.get(courseId);

    if (!course) {
      throw new Error(`LearningPath ${path.id} references unknown Course: ${courseId}`);
    }

    return deriveCourseProgress(course, learningStates);
  });
  const completedCourses = courseProgress.filter((progress) => progress.status === "completed").length;
  const totalCourses = courseProgress.length;
  const passedCards = courseProgress.reduce((sum, progress) => sum + progress.passedCards, 0);
  const totalCards = courseProgress.reduce((sum, progress) => sum + progress.totalCards, 0);
  const recommended = courseProgress.find((progress) => progress.status !== "completed");

  return {
    pathId: path.id,
    status:
      totalCourses > 0 && completedCourses === totalCourses
        ? "completed"
        : courseProgress.some((progress) => progress.status !== "not-started")
          ? "in-progress"
          : "not-started",
    completedCourses,
    totalCourses,
    passedCards,
    totalCards,
    recommendedCourseId: recommended?.courseId ?? null,
    recommendedLessonId: recommended?.recommendedLessonId ?? null,
    courses: courseProgress,
  };
}

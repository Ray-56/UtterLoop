import type { SentenceCard } from "../../domain/content/SentenceCard";
import type {
  Course,
  CourseCategory,
  LearningPath,
} from "../../domain/curriculum/Course";
import type { CourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import { originalCourseCards, originalCourses } from "./originalCourses";
import { voaCourse, voaCourseCards } from "./voaCourse";

const starterFoundations = originalCourses[0];
const workStudyEssentials = originalCourses[1];

export const defaultCourseCategories: CourseCategory[] = [
  {
    id: "everyday-communication",
    title: "Everyday Communication",
    description:
      "Introductions, routines, practical needs, and everyday conversation.",
    sortOrder: 0,
  },
  {
    id: "work-study",
    title: "Work & Study",
    description:
      "Updates, requests, planning, and feedback for shared work and study.",
    sortOrder: 1,
  },
];

export const defaultCourses: Course[] = [
  starterFoundations,
  voaCourse,
  workStudyEssentials,
];

export const defaultLearningPath: LearningPath = {
  id: "utterloop-core-path",
  title: "Everyday Output Path",
  description:
    "A recommended path from everyday foundations through guided beginner practice to work and study communication.",
  courseIds: defaultCourses.map((course) => course.id),
};

export const defaultCourseCards: SentenceCard[] = defaultCourses.flatMap((course) =>
  cardsForCourse(course),
);

export const defaultCatalog: CourseCatalog = {
  categories: defaultCourseCategories,
  learningPaths: [defaultLearningPath],
  courses: defaultCourses,
  cards: defaultCourseCards,
};

function cardsForCourse(course: Course): SentenceCard[] {
  const cardIds = new Set(
    course.units.flatMap((unit) =>
      unit.lessons.flatMap((lesson) => lesson.cardIds),
    ),
  );
  const availableCards =
    course.id === voaCourse.id ? voaCourseCards : originalCourseCards;

  return availableCards.filter((card) => cardIds.has(card.id));
}

import type { SentenceCard } from "../content/SentenceCard";
import { validateSentenceLearningSupport } from "../content/validateSentenceLearningSupport";
import type { CefrLevel, Course, CourseCategory, LearningPath } from "./Course";

export interface CourseCatalog {
  categories: CourseCategory[];
  learningPaths: LearningPath[];
  courses: Course[];
  cards: SentenceCard[];
}

const CEFR_LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const PROVIDER_KINDS = new Set(["original", "curated", "imported"]);

export function validateCourseCatalog(catalog: CourseCatalog): void {
  assertUnique(catalog.categories.map((category) => category.id), "CourseCategory");
  assertUnique(catalog.learningPaths.map((path) => path.id), "LearningPath");
  assertUnique(catalog.courses.map((course) => course.id), "Course");
  assertUnique(catalog.cards.map((card) => card.id), "SentenceCard");

  const categoryIds = new Set(catalog.categories.map((category) => category.id));
  const courseIds = new Set(catalog.courses.map((course) => course.id));
  const cardIds = new Set(catalog.cards.map((card) => card.id));

  for (const category of catalog.categories) {
    requireText(category.id, "CourseCategory id");
    requireText(category.title, `CourseCategory ${category.id} title`);
    requireText(category.description, `CourseCategory ${category.id} description`);

    if (!Number.isInteger(category.sortOrder) || category.sortOrder < 0) {
      throw new Error(`CourseCategory ${category.id} sort order must be a non-negative integer.`);
    }
  }

  for (const path of catalog.learningPaths) {
    requireText(path.id, "LearningPath id");
    requireText(path.title, `LearningPath ${path.id} title`);
    requireText(path.description, `LearningPath ${path.id} description`);
    assertUnique(path.courseIds, `LearningPath ${path.id} course`);

    for (const courseId of path.courseIds) {
      if (!courseIds.has(courseId)) {
        throw new Error(`LearningPath ${path.id} references unknown Course: ${courseId}`);
      }
    }
  }

  const globalUnitIds: string[] = [];
  const globalLessonIds: string[] = [];

  for (const course of catalog.courses) {
    requireText(course.id, "Course id");
    requireText(course.title, `Course ${course.id} title`);
    requireText(course.description, `Course ${course.id} description`);
    requireText(course.categoryId, `Course ${course.id} category id`);

    if (!categoryIds.has(course.categoryId)) {
      throw new Error(`Course ${course.id} references unknown CourseCategory: ${course.categoryId}`);
    }

    validateTags(course);
    validateLevel(course);
    validateProvider(course);

    if (!Number.isInteger(course.revision) || course.revision <= 0) {
      throw new Error(`Course ${course.id} revision must be a positive integer.`);
    }

    requireText(course.license.name, `Course ${course.id} license name`);
    requireText(course.license.url, `Course ${course.id} license URL`);
    requireText(course.license.attribution, `Course ${course.id} license attribution`);

    const usedCardIds = new Set<string>();

    for (const unit of course.units) {
      globalUnitIds.push(unit.id);
      requireText(unit.id, `Course ${course.id} Unit id`);
      requireText(unit.title, `CourseUnit ${unit.id} title`);
      requireText(unit.description, `CourseUnit ${unit.id} description`);

      for (const lesson of unit.lessons) {
        globalLessonIds.push(lesson.id);
        requireText(lesson.id, `CourseUnit ${unit.id} Lesson id`);
        requireText(lesson.title, `CourseLesson ${lesson.id} title`);
        requireText(lesson.objective, `CourseLesson ${lesson.id} objective`);

        if (lesson.cardIds.length === 0) {
          throw new Error(`CourseLesson ${lesson.id} must contain at least one SentenceCard.`);
        }

        for (const cardId of lesson.cardIds) {
          if (!cardIds.has(cardId)) {
            throw new Error(`CourseLesson ${lesson.id} references unknown SentenceCard: ${cardId}`);
          }

          if (usedCardIds.has(cardId)) {
            throw new Error(`Course ${course.id} references SentenceCard more than once: ${cardId}`);
          }

          usedCardIds.add(cardId);
        }
      }
    }
  }

  assertUnique(globalUnitIds, "CourseUnit");
  assertUnique(globalLessonIds, "CourseLesson");

  for (const card of catalog.cards) {
    requireText(card.id, "SentenceCard id");
    requireText(card.english, `SentenceCard ${card.id} target sentence`);
    requireText(card.prompt, `SentenceCard ${card.id} prompt`);
    requireText(card.source, `SentenceCard ${card.id} source`);

    validateSentenceLearningSupport(card);
  }
}

function validateTags(course: Course): void {
  const normalizedTags = new Set<string>();

  for (const tag of course.tags) {
    requireText(tag, `Course ${course.id} tag`);

    if (tag !== tag.trim()) {
      throw new Error(`Course ${course.id} tag must be trimmed: ${tag}`);
    }

    const normalizedTag = tag.toLowerCase();
    if (normalizedTags.has(normalizedTag)) {
      throw new Error(`Duplicate Course ${course.id} tag: ${tag}`);
    }
    normalizedTags.add(normalizedTag);
  }
}

function validateLevel(course: Course): void {
  requireText(course.level.label, `Course ${course.id} level label`);
  const fromIndex = CEFR_LEVELS.indexOf(course.level.cefrFrom);
  const toIndex = CEFR_LEVELS.indexOf(course.level.cefrTo);

  if (fromIndex < 0 || toIndex < 0) {
    throw new Error(`Course ${course.id} uses an unknown CEFR level.`);
  }

  if (fromIndex > toIndex) {
    throw new Error(`Course ${course.id} CEFR range must run from lower to higher level.`);
  }
}

function validateProvider(course: Course): void {
  if (!PROVIDER_KINDS.has(course.provider.kind)) {
    throw new Error(`Course ${course.id} provider kind is invalid: ${course.provider.kind}`);
  }

  requireText(course.provider.name, `Course ${course.id} provider name`);

  if (course.provider.url !== undefined) {
    requireText(course.provider.url, `Course ${course.id} provider URL`);
  }
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label} identifier: ${value}`);
    }
    seen.add(value);
  }
}

function requireText(value: string, label: string): void {
  if (!value.trim()) {
    throw new Error(`${label} cannot be empty.`);
  }
}

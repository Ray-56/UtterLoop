import type { SentenceCardId } from "../content/SentenceCard";
import type { ContentLicense } from "../content/ContentLicense";

export type { ContentLicense } from "../content/ContentLicense";

export type LearningPathId = string;
export type CourseId = string;
export type CourseUnitId = string;
export type CourseLessonId = string;

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface CourseCategory {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
}

export interface CourseLevel {
  label: string;
  cefrFrom: CefrLevel;
  cefrTo: CefrLevel;
}

export interface CourseProvider {
  kind: "original" | "curated" | "imported";
  name: string;
  url?: string;
}

export interface LearningPath {
  id: LearningPathId;
  title: string;
  description: string;
  courseIds: CourseId[];
}

export interface Course {
  id: CourseId;
  title: string;
  description: string;
  categoryId: string;
  tags: string[];
  level: CourseLevel;
  provider: CourseProvider;
  revision: number;
  license: ContentLicense;
  units: CourseUnit[];
}

export interface CourseUnit {
  id: CourseUnitId;
  title: string;
  description: string;
  lessons: CourseLesson[];
}

export interface CourseLesson {
  id: CourseLessonId;
  title: string;
  objective: string;
  sourceUrl?: string;
  cardIds: SentenceCardId[];
}

import type { CefrLevel } from "../domain/curriculum/Course";
import {
  DEFAULT_COURSE_CATALOG_QUERY,
  type CourseCatalogQuery,
} from "../domain/curriculum/queryCourseCatalog";

export type AppView = "practice" | "courses" | "review" | "progress" | "settings";

export type UrlPracticeScope =
  | { kind: "lesson"; courseId: string; lessonId: string; mode: "learn" | "replay" }
  | { kind: "review"; courseId?: string }
  | { kind: "vocabulary"; cardId?: string; courseId?: string }
  | { kind: "course"; courseId: string }
  | { kind: "focused"; cardId: string };

export interface AppUrlState {
  view: AppView;
  catalog: {
    query: CourseCatalogQuery;
    selectedCourseId: string | null;
    resultLimit: number;
  };
  reviewCourseId: string | null;
  practiceScope: UrlPracticeScope | null;
  practiceScopeWasInvalid: boolean;
}

export const DEFAULT_COURSE_RESULT_LIMIT = 24;

export const DEFAULT_APP_URL_STATE: AppUrlState = {
  view: "practice",
  catalog: {
    query: { ...DEFAULT_COURSE_CATALOG_QUERY },
    selectedCourseId: null,
    resultLimit: DEFAULT_COURSE_RESULT_LIMIT,
  },
  reviewCourseId: null,
  practiceScope: null,
  practiceScopeWasInvalid: false,
};

const VIEWS = new Set<AppView>(["practice", "courses", "review", "progress", "settings"]);
const CEFR_LEVELS = new Set<CefrLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);
const PROGRESS_STATUSES = new Set<NonNullable<CourseCatalogQuery["status"]>>([
  "not-started",
  "in-progress",
  "completed",
]);
const SORTS = new Set<CourseCatalogQuery["sort"]>(["recommended", "title", "progress"]);

export function parseAppUrlState(search: string): AppUrlState {
  const parameters = new URLSearchParams(search);
  const view = oneOf(parameters.get("view"), VIEWS);

  if (!view) {
    return cloneDefaultState();
  }

  const practiceScope = view === "practice" ? parsePracticeScope(parameters) : null;
  const hasRequestedPracticeScope = view === "practice"
    && textOrNull(parameters.get("scope")) !== null;

  return {
    view,
    catalog: {
      selectedCourseId: view === "courses" ? textOrNull(parameters.get("course")) : null,
      resultLimit: parseCourseResultLimit(parameters.get("limit")),
      query: {
        text: parameters.get("q")?.trim() ?? "",
        categoryId: textOrNull(parameters.get("category")),
        cefr: oneOf(parameters.get("cefr"), CEFR_LEVELS),
        status: oneOf(parameters.get("status"), PROGRESS_STATUSES),
        sort: oneOf(parameters.get("sort"), SORTS) ?? "recommended",
      },
    },
    reviewCourseId: view === "review" ? textOrNull(parameters.get("reviewCourse")) : null,
    practiceScope,
    practiceScopeWasInvalid: hasRequestedPracticeScope && practiceScope === null,
  };
}

export function buildAppUrlState(state: AppUrlState): string {
  const parameters = new URLSearchParams();
  parameters.set("view", state.view);

  if (state.view === "practice" && state.practiceScope) {
    serializePracticeScope(parameters, state.practiceScope);
  }

  if (state.view === "review") {
    setWhenPresent(parameters, "reviewCourse", state.reviewCourseId);
  }

  if (state.view === "courses") {
    setWhenPresent(parameters, "course", state.catalog.selectedCourseId);
  }

  if (state.catalog.resultLimit !== DEFAULT_COURSE_RESULT_LIMIT) {
    parameters.set("limit", String(state.catalog.resultLimit));
  }

  setWhenPresent(parameters, "q", state.catalog.query.text.trim());
  setWhenPresent(parameters, "category", state.catalog.query.categoryId);
  setWhenPresent(parameters, "cefr", state.catalog.query.cefr);
  setWhenPresent(parameters, "status", state.catalog.query.status);
  if (state.catalog.query.sort !== "recommended") {
    parameters.set("sort", state.catalog.query.sort);
  }

  return `?${parameters.toString()}`;
}

function parsePracticeScope(parameters: URLSearchParams): UrlPracticeScope | null {
  const kind = parameters.get("scope");
  const courseId = textOrNull(parameters.get("practiceCourse"));
  const cardId = textOrNull(parameters.get("practiceCard"));

  if (kind === "lesson") {
    const lessonId = textOrNull(parameters.get("practiceLesson"));
    const mode = parameters.get("practiceMode");
    return courseId && lessonId && (mode === "learn" || mode === "replay")
      ? { kind, courseId, lessonId, mode }
      : null;
  }

  if (kind === "review") {
    return courseId ? { kind, courseId } : { kind };
  }

  if (kind === "course") {
    return courseId ? { kind, courseId } : null;
  }

  if (kind === "vocabulary") {
    return {
      kind,
      ...(courseId ? { courseId } : {}),
      ...(cardId ? { cardId } : {}),
    };
  }

  if (kind === "focused") {
    return cardId ? { kind, cardId } : null;
  }

  return null;
}

function serializePracticeScope(parameters: URLSearchParams, scope: UrlPracticeScope): void {
  parameters.set("scope", scope.kind);

  if (scope.kind === "lesson") {
    parameters.set("practiceCourse", scope.courseId);
    parameters.set("practiceLesson", scope.lessonId);
    parameters.set("practiceMode", scope.mode);
    return;
  }

  if (scope.kind === "review" || scope.kind === "course" || scope.kind === "vocabulary") {
    setWhenPresent(parameters, "practiceCourse", scope.courseId ?? null);
  }

  if (scope.kind === "vocabulary") {
    setWhenPresent(parameters, "practiceCard", scope.cardId ?? null);
  } else if (scope.kind === "focused") {
    parameters.set("practiceCard", scope.cardId);
  }
}

function cloneDefaultState(): AppUrlState {
  return {
    ...DEFAULT_APP_URL_STATE,
    catalog: {
      ...DEFAULT_APP_URL_STATE.catalog,
      query: { ...DEFAULT_APP_URL_STATE.catalog.query },
    },
  };
}

function oneOf<T extends string>(value: string | null, values: ReadonlySet<T>): T | null {
  return value !== null && values.has(value as T) ? value as T : null;
}

function textOrNull(value: string | null): string | null {
  return value?.trim() || null;
}

function parseCourseResultLimit(value: string | null): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= DEFAULT_COURSE_RESULT_LIMIT
    ? parsed
    : DEFAULT_COURSE_RESULT_LIMIT;
}

function setWhenPresent(
  parameters: URLSearchParams,
  name: string,
  value: string | null | undefined,
): void {
  if (value?.trim()) {
    parameters.set(name, value.trim());
  }
}

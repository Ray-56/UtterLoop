import type { CefrLevel } from "../domain/curriculum/Course";
import type { CourseCatalogQuery } from "../domain/curriculum/queryCourseCatalog";

export type CourseCatalogProgressStatus = NonNullable<CourseCatalogQuery["status"]>;
export type CourseCatalogSort = CourseCatalogQuery["sort"];
export type UrlAppView = "practice" | "courses" | "review" | "progress" | "settings";

export type CourseCatalogQueryState = CourseCatalogQuery;

export interface CourseCatalogUrlState {
  isCoursesView: boolean;
  selectedCourseId: string | null;
  query: CourseCatalogQueryState;
}

export const DEFAULT_COURSE_CATALOG_URL_QUERY: CourseCatalogQueryState = {
  text: "",
  categoryId: null,
  cefr: null,
  status: null,
  sort: "recommended",
};

const CEFR_LEVELS = new Set<CefrLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);
const PROGRESS_STATUSES = new Set<CourseCatalogProgressStatus>(["not-started", "in-progress", "completed"]);
const SORTS = new Set<CourseCatalogSort>(["recommended", "title", "progress"]);
const APP_VIEWS = new Set<UrlAppView>(["practice", "courses", "review", "progress", "settings"]);

export function parseCourseCatalogUrl(search: string): CourseCatalogUrlState {
  const parameters = new URLSearchParams(search);

  return {
    isCoursesView: parameters.get("view") === "courses",
    selectedCourseId: textOrNull(parameters.get("course")),
    query: {
      text: parameters.get("q")?.trim() ?? "",
      categoryId: textOrNull(parameters.get("category")),
      cefr: oneOf(parameters.get("cefr"), CEFR_LEVELS),
      status: oneOf(parameters.get("status"), PROGRESS_STATUSES),
      sort: oneOf(parameters.get("sort"), SORTS) ?? "recommended",
    },
  };
}

export function buildCourseCatalogUrl(input: {
  selectedCourseId: string | null;
  query: CourseCatalogQueryState;
}): string {
  const parameters = new URLSearchParams();
  parameters.set("view", "courses");
  setWhenPresent(parameters, "course", input.selectedCourseId);
  setWhenPresent(parameters, "q", input.query.text.trim());
  setWhenPresent(parameters, "category", input.query.categoryId);
  setWhenPresent(parameters, "cefr", input.query.cefr);
  setWhenPresent(parameters, "status", input.query.status);

  if (input.query.sort !== "recommended") {
    parameters.set("sort", input.query.sort);
  }

  return `?${parameters.toString()}`;
}

export function updateAppViewInUrl(search: string, view: string): string {
  const parameters = new URLSearchParams(search);
  parameters.set("view", view);

  if (view !== "courses") {
    parameters.delete("course");
  }

  return `?${parameters.toString()}`;
}

export function resolveAppViewFromUrl(search: string): UrlAppView {
  return oneOf(new URLSearchParams(search).get("view"), APP_VIEWS) ?? "practice";
}

function oneOf<T extends string>(value: string | null, values: ReadonlySet<T>): T | null {
  return value !== null && values.has(value as T) ? value as T : null;
}

function textOrNull(value: string | null): string | null {
  return value?.trim() || null;
}

function setWhenPresent(parameters: URLSearchParams, name: string, value: string | null): void {
  if (value?.trim()) {
    parameters.set(name, value.trim());
  }
}

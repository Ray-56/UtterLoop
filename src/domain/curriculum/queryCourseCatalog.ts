import type { CourseProgress } from "./deriveCourseProgress";
import type { CefrLevel } from "./Course";
import type { CourseCatalogItem } from "./buildCourseCatalogItems";

export interface CourseCatalogQuery {
  text: string;
  categoryId: string | null;
  cefr: CefrLevel | null;
  status: CourseProgress["status"] | null;
  sort: "recommended" | "title" | "progress";
}

export const DEFAULT_COURSE_CATALOG_QUERY: CourseCatalogQuery = {
  text: "",
  categoryId: null,
  cefr: null,
  status: null,
  sort: "recommended",
};

const CEFR_RANK: Record<CefrLevel, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
  C2: 5,
};

const PROGRESS_STATUS_RANK: Record<CourseProgress["status"], number> = {
  "in-progress": 0,
  "not-started": 1,
  completed: 2,
};

export function queryCourseCatalog(
  items: CourseCatalogItem[],
  query: CourseCatalogQuery,
): CourseCatalogItem[] {
  const textTokens = normalizeText(query.text).split(" ").filter(Boolean);
  const filteredItems = items.filter((item) => {
    if (query.categoryId && item.course.categoryId !== query.categoryId) {
      return false;
    }

    if (query.cefr && !includesCefr(item, query.cefr)) {
      return false;
    }

    if (query.status && item.progress.status !== query.status) {
      return false;
    }

    if (textTokens.length > 0) {
      const searchableText = normalizeText(
        [
          item.course.title,
          item.course.description,
          item.category.title,
          ...item.course.tags,
          item.course.level.label,
          item.course.provider.name,
        ].join(" "),
      );

      if (!textTokens.every((token) => searchableText.includes(token))) {
        return false;
      }
    }

    return true;
  });

  return filteredItems.sort(comparatorFor(query.sort));
}

function includesCefr(item: CourseCatalogItem, cefr: CefrLevel): boolean {
  const selectedRank = CEFR_RANK[cefr];
  return (
    selectedRank >= CEFR_RANK[item.course.level.cefrFrom] &&
    selectedRank <= CEFR_RANK[item.course.level.cefrTo]
  );
}

function comparatorFor(
  sort: CourseCatalogQuery["sort"],
): (left: CourseCatalogItem, right: CourseCatalogItem) => number {
  if (sort === "title") {
    return compareByTitle;
  }

  if (sort === "progress") {
    return compareByProgress;
  }

  return compareByRecommendation;
}

function compareByRecommendation(
  left: CourseCatalogItem,
  right: CourseCatalogItem,
): number {
  const leftRank = left.recommendationRank;
  const rightRank = right.recommendationRank;

  if (leftRank !== null || rightRank !== null) {
    if (leftRank === null) return 1;
    if (rightRank === null) return -1;
    if (leftRank !== rightRank) return leftRank - rightRank;
  }

  if (left.category.sortOrder !== right.category.sortOrder) {
    return left.category.sortOrder - right.category.sortOrder;
  }

  return compareByTitle(left, right);
}

function compareByProgress(left: CourseCatalogItem, right: CourseCatalogItem): number {
  const statusDifference =
    PROGRESS_STATUS_RANK[left.progress.status] -
    PROGRESS_STATUS_RANK[right.progress.status];

  if (statusDifference !== 0) {
    return statusDifference;
  }

  if (left.progress.status === "in-progress") {
    const ratioDifference = passedRatio(right) - passedRatio(left);
    if (ratioDifference !== 0) {
      return ratioDifference;
    }
  }

  return compareByTitle(left, right);
}

function passedRatio(item: CourseCatalogItem): number {
  return item.progress.totalCards > 0
    ? item.progress.passedCards / item.progress.totalCards
    : 0;
}

function compareByTitle(left: CourseCatalogItem, right: CourseCatalogItem): number {
  const leftTitle = normalizeText(left.course.title);
  const rightTitle = normalizeText(right.course.title);

  if (leftTitle < rightTitle) return -1;
  if (leftTitle > rightTitle) return 1;
  if (left.course.id < right.course.id) return -1;
  if (left.course.id > right.course.id) return 1;
  return 0;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

import type { CourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import { validateCourseCatalog } from "../../domain/curriculum/validateCourseCatalog";
import { validateSentenceLearningSupport } from "../../domain/content/validateSentenceLearningSupport";

export interface ContentAuditRow {
  cardId: string;
  courseId: string | null;
  target: string;
  prompt: string;
  acceptableAnswers: string[];
  sourceUrl: string | null;
  license: string | null;
  learningSupport: "authored" | "fallback";
  errors: string[];
}

export function auditCatalogContent(catalog: CourseCatalog) {
  const catalogErrors: string[] = [];
  try {
    validateCourseCatalog(catalog);
  } catch (error) {
    catalogErrors.push(error instanceof Error ? error.message : "Invalid course catalog.");
  }

  const owners = new Map(catalog.courses.flatMap((course) => course.units.flatMap((unit) =>
    unit.lessons.flatMap((lesson) => lesson.cardIds.map((id) => [id, course] as const)),
  )));
  const rows: ContentAuditRow[] = catalog.cards.map((card) => {
    const course = owners.get(card.id);
    const license = card.license ?? course?.license;
    const errors: string[] = [];
    try {
      validateSentenceLearningSupport(card);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Invalid learning support.");
    }
    if (!card.source.trim()) errors.push("Missing content source.");
    if (!license?.name.trim() || !license?.attribution.trim() || !isHttpsUrl(license?.url)) {
      errors.push("Missing license name, attribution, or HTTPS reference.");
    }
    if (course?.provider.kind === "curated" && !isHttpsUrl(card.sourceUrl)) {
      errors.push("Curated content must keep its original HTTPS source URL.");
    }
    if (card.learningSupport) {
      const support = card.learningSupport;
      const tokens = support.grammar.chunks.flatMap((chunk) => chunk.tokens ?? []);
      if (support.grammar.chunks.some((chunk) => !chunk.tokens?.length)) {
        errors.push("Authored grammar chunks require word annotations.");
      }
      if (tokens.some((token) => !/^\/\S+\/$/.test(token.ipa))) {
        errors.push("Each authored word requires slash-delimited IPA without spaces.");
      }
      const chunkIpa = support.pronunciation.chunks.map((chunk) => chunk.ipa.slice(1, -1)).join(" ");
      if (chunkIpa !== support.pronunciation.sentenceIpa.slice(1, -1)) {
        errors.push("Pronunciation chunks must reconstruct the sentence IPA.");
      }
    }
    return {
      cardId: card.id,
      courseId: course?.id ?? null,
      target: card.english,
      prompt: card.prompt,
      acceptableAnswers: card.acceptableAnswers,
      sourceUrl: card.sourceUrl ?? null,
      license: license?.name ?? null,
      learningSupport: card.learningSupport ? "authored" : "fallback",
      errors,
    };
  });
  return {
    courses: catalog.courses.length,
    cards: rows.length,
    authoredSupport: rows.filter((row) => row.learningSupport === "authored").length,
    catalogErrors,
    errorCount: catalogErrors.length + rows.reduce((sum, row) => sum + row.errors.length, 0),
    rows,
  };
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

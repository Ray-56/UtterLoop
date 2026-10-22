import { describe, expect, it } from "vitest";
import { auditCatalogContent } from "./auditCatalogContent";
import { defaultCatalog } from "./defaultCatalog";

describe("course-content audit", () => {
  it("audits all default cards and truthfully reports support coverage", () => {
    const audit = auditCatalogContent(defaultCatalog);
    expect(audit.catalogErrors).toEqual([]);
    expect(audit.rows.filter((row) => row.errors.length)).toEqual([]);
    expect(audit).toMatchObject({ courses: 6, cards: 120, authoredSupport: 40, errorCount: 0 });
    expect(audit.rows.filter((row) => row.learningSupport === "fallback")).toHaveLength(80);
    expect(audit.rows.filter((row) => row.sourceUrl)).toHaveLength(20);
  });

  it("rejects leaked prompts and missing curated source provenance", () => {
    const catalog = structuredClone(defaultCatalog);
    catalog.cards[0].prompt = catalog.cards[0].english;
    const curated = catalog.cards.find((card) => card.id.startsWith("voa-"))!;
    delete curated.sourceUrl;
    const audit = auditCatalogContent(catalog);
    expect(audit.errorCount).toBeGreaterThan(0);
    expect(audit.rows[0].errors.join(" ")).toContain("must not expose");
    expect(audit.rows.find((row) => row.cardId === curated.id)?.errors)
      .toContain("Curated content must keep its original HTTPS source URL.");
  });

  it("flags incomplete annotations and IPA disagreement before publishing", () => {
    const catalog = structuredClone(defaultCatalog);
    const support = catalog.cards[0].learningSupport!;
    delete support.grammar.chunks[0].tokens;
    support.pronunciation.sentenceIpa = "/incorrect/";
    expect(auditCatalogContent(catalog).rows[0].errors).toEqual(expect.arrayContaining([
      "Authored grammar chunks require word annotations.",
      "Pronunciation chunks must reconstruct the sentence IPA.",
    ]));
  });
});

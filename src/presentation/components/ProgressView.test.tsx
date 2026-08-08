import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  BetaReadinessSnapshot,
  EvidenceCoverage,
} from "../../application/beta-readiness/BetaReadiness";
import type { ProgressDashboard, WeakCard } from "../../domain/progress/deriveProgressDashboard";
import { ProgressView } from "./ProgressView";

describe("ProgressView", () => {
  it("renders a calm loading state while the complete dashboard is unavailable", () => {
    const html = renderToStaticMarkup(<ProgressView dashboard={null} />);

    expect(html).toContain("Preparing your progress");
    expect(html).toContain("Reading your complete local learning history");
  });

  it("explains the zero-data state without claiming a misleading success rate", () => {
    const html = renderToStaticMarkup(
      <ProgressView
        dashboard={dashboardFixture({
          hasPracticeData: false,
          overview: {
            firstPassed: 0,
            totalCards: 20,
            dueNow: 0,
            independentAccuracy: null,
            currentStreak: 0,
          },
        })}
        recentActivity={{ limit: 500, totalEntries: 0, isTruncated: false }}
      />,
    );

    expect(html).toContain("Overview");
    expect(html).toContain("Learning path coverage");
    expect(html).toContain("Retention health");
    expect(html).toContain("Needs attention");
    expect(html).toContain("Not measured yet");
    expect(html).toContain("Your first recall check will start retention history");
    expect(html).toContain("0 events recorded locally");
    expect(html).not.toContain("Independent accuracy</span><strong>0%");
  });

  it("renders complete coverage, all-time retention, textual trend values, and recent sample metadata", () => {
    const html = renderToStaticMarkup(
      <ProgressView
        dashboard={dashboardFixture()}
        recentActivity={{ limit: 500, totalEntries: 1_234, isTruncated: true }}
      />,
    );

    expect(html).toContain("8 / 20");
    expect(html).toContain("42%");
    expect(html).toContain("Starter path");
    expect(html).toContain("Starter Foundations");
    expect(html).toContain("Greetings unit");
    expect(html).toContain("Say hello lesson");
    expect(html).toContain("Stage 0 focused review");
    expect(html).toContain("All local history");
    expect(html).toContain("Latest 500 of 1,234 events");
    expect(html).toContain("Perfect recalls");
    expect(html).toContain("2026-07-30");
    expect(html).toContain("3 checks");
    expect(html).toContain("2 perfect");
    expect(html).toContain("1 first pass");
    expect(html).toContain("75% accuracy");
  });

  it("shows target-free weak-card prompts and optional practice actions", () => {
    const onPracticeWeakCard = vi.fn();
    const weakCardWithLeakProbe = {
      ...weakCardFixture(),
      target: "This target sentence must stay hidden.",
    };
    const fixture = dashboardFixture();
    fixture.needsAttention = { weakCards: [weakCardWithLeakProbe], isEmpty: false };

    const html = renderToStaticMarkup(
      <ProgressView dashboard={fixture} onPracticeWeakCard={onPracticeWeakCard} />,
    );

    expect(html).toContain("你想礼貌地问候同事。");
    expect(html).toContain("Starter Foundations");
    expect(html).toContain("Practice this card");
    expect(html).not.toContain("This target sentence must stay hidden.");

    const withoutAction = renderToStaticMarkup(<ProgressView dashboard={fixture} />);
    expect(withoutAction).not.toContain("Practice this card");
  });

  it("does not offer Practice for quarantined weak content", () => {
    const fixture = dashboardFixture();
    fixture.needsAttention = {
      weakCards: [{
        ...weakCardFixture(),
        prompt: "Prompt unavailable — replace or re-import this content.",
        contentSafety: "blocked-content",
      }],
      isEmpty: false,
    };

    const html = renderToStaticMarkup(
      <ProgressView dashboard={fixture} onPracticeWeakCard={vi.fn()} />,
    );

    expect(html).toContain("Content blocked");
    expect(html).not.toContain("Practice this card");
  });

  it("surfaces data-integrity warnings as an accessible alert", () => {
    const html = renderToStaticMarkup(
      <ProgressView
        dashboard={dashboardFixture({
          integrityWarnings: ["First-passed Card sf-001 is missing ReviewState."],
        })}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Data needs attention");
    expect(html).toContain("First-passed Card sf-001 is missing ReviewState.");
  });

  it("separates learner-facing retention signals from local Beta diagnostics", () => {
    const html = renderToStaticMarkup(
      <ProgressView dashboard={dashboardFixture()} betaReadiness={betaReadinessFixture()} />,
    );

    expect(html).toContain("Learning evidence");
    expect(html).toContain("Weekly retained independent sentences");
    expect(html).toContain("3 of 4 eligible sentences");
    expect(html).toContain("Due Review completion");
    expect(html).toContain("75% · 6 of 8 occurrences");
    expect(html).toContain("Next-day recall");
    expect(html).toContain("50% · 2 of 4 sentences");
    expect(html).toContain("7-day recall");
    expect(html).toContain("Cohort still maturing");
    expect(html).toContain("Active practice days");
    expect(html).toContain("5 of 14 days");

    expect(html).toContain("Beta Inspector");
    expect(html).toContain("Session outcomes");
    expect(html).toContain("4 completed");
    expect(html).toContain("1 abandoned");
    expect(html).toContain("1 inferred");
    expect(html).toContain("2 legacy rows excluded");
    expect(html).toContain("Weekly retained coverage");
    expect(html).toContain("Next-day cohort coverage");
    expect(html).toContain("7-day cohort coverage");
    expect(html).toContain("30-day cohort coverage");
    expect(html).toContain("Instrumentation started");
  });

  it("reports unavailable evidence honestly instead of rendering zero-percent success", () => {
    const betaReadiness = betaReadinessFixture();
    betaReadiness.retention.weeklyRetainedIndependentSentences = {
      numerator: 0,
      denominator: 0,
      availability: { status: "unavailable", reason: "no-evidence" },
      coverage: evidenceCoverage(),
    };
    betaReadiness.retention.cohorts.day30 = {
      numerator: 0,
      denominator: 0,
      availability: { status: "unavailable", reason: "immature-cohort" },
      coverage: evidenceCoverage(),
    };

    const html = renderToStaticMarkup(
      <ProgressView dashboard={dashboardFixture()} betaReadiness={betaReadiness} />,
    );

    expect(html).toContain("No qualifying evidence yet");
    expect(html).toContain("Cohort still maturing");
    expect(html).not.toContain("Weekly retained sentences</span><strong>0%");
  });
});

function betaReadinessFixture(): BetaReadinessSnapshot {
  const coverage = evidenceCoverage({
    eligibleRows: 10,
    contextBearingRows: 8,
    excludedLegacyRows: 2,
    measurementEpoch: "2026-08-01T00:00:00.000Z",
    containsInferred: true,
  });
  const available = { status: "available" } as const;
  const noEvidence = { status: "unavailable", reason: "no-evidence" } as const;

  return {
    asOf: "2026-08-01T12:00:00.000Z",
    timeZone: "Asia/Shanghai",
    sessionWindowDays: 14,
    activation: {
      firstEngagedSessionCompletion: {
        numerator: 1,
        denominator: 1,
        availability: available,
        coverage,
      },
      quickStartDisposition: {
        completed: 1,
        dismissed: 0,
        availability: available,
        coverage,
      },
      timeToFirstPass: {
        medianMs: 90_000,
        sampleSize: 3,
        availability: available,
        coverage,
      },
    },
    acquisition: {
      sameRoundIndependentFirstPass: {
        numerator: 3,
        denominator: 5,
        availability: available,
        coverage,
      },
      highestSupportBeforeFirstPass: {
        denominator: 5,
        levels: { 0: 2, 1: 1, 2: 1, 3: 1, 4: 0 },
        availability: available,
        coverage,
      },
      revealBeforeFirstPass: {
        numerator: 1,
        denominator: 5,
        availability: available,
        coverage,
      },
      skipBeforeFirstPass: {
        numerator: 1,
        denominator: 5,
        availability: available,
        coverage,
      },
      requeueCap: {
        cardRoundPairs: 2,
        distinctCards: 2,
        repeatedCards: 1,
        availability: available,
        coverage,
      },
    },
    retention: {
      weeklyRetainedIndependentSentences: {
        numerator: 3,
        denominator: 4,
        availability: available,
        coverage,
      },
      dueReviewCompletion: {
        numerator: 6,
        denominator: 8,
        availability: available,
        coverage,
      },
      cohorts: {
        nextDay: {
          numerator: 2,
          denominator: 4,
          availability: available,
          coverage,
        },
        day7: {
          numerator: 0,
          denominator: 0,
          availability: { status: "unavailable", reason: "immature-cohort" },
          coverage,
        },
        day30: {
          numerator: 0,
          denominator: 0,
          availability: noEvidence,
          coverage,
        },
      },
      dueBacklog: {
        count: 3,
        availability: available,
        coverage,
      },
    },
    habit: {
      sessions: {
        completed: 4,
        abandoned: 1,
        presumedAbandoned: 1,
        interrupted: 1,
        invalidated: 0,
        dismissed: 0,
        completion: {
          numerator: 4,
          denominator: 5,
          availability: available,
          coverage,
        },
        coverage,
      },
      activePracticeDays: {
        numerator: 5,
        denominator: 14,
        availability: available,
        coverage,
      },
    },
  };
}

function evidenceCoverage(
  overrides: Partial<EvidenceCoverage> = {},
): EvidenceCoverage {
  return {
    eligibleRows: 0,
    contextBearingRows: 0,
    excludedLegacyRows: 0,
    excludedPreContextRows: 0,
    measurementEpoch: null,
    containsInferred: false,
    ...overrides,
  };
}

function dashboardFixture(
  overrides: Partial<ProgressDashboard> = {},
): ProgressDashboard {
  return {
    timeZone: "Asia/Shanghai",
    hasPracticeData: true,
    overview: {
      firstPassed: 8,
      totalCards: 20,
      dueNow: 3,
      independentAccuracy: 0.42,
      currentStreak: 4,
    },
    coverage: {
      paths: [{
        id: "starter-path",
        title: "Starter path",
        passedCards: 8,
        totalCards: 20,
        courses: [{
          id: "starter-foundations",
          title: "Starter Foundations",
          passedCards: 8,
          totalCards: 20,
          units: [{
            id: "greetings",
            title: "Greetings unit",
            passedCards: 4,
            totalCards: 5,
            lessons: [{
              id: "say-hello",
              title: "Say hello lesson",
              passedCards: 4,
              totalCards: 5,
            }],
          }],
        }],
      }],
      courses: [],
    },
    retention: {
      masteryDistribution: {
        untouched: 5,
        acquiring: 2,
        stage0FocusedReview: 3,
        stage1: 2,
        stage2: 1,
        stage3: 1,
        stage4: 1,
        stage5: 1,
        stage6: 1,
        mastered: 3,
      },
      allTime: {
        totalEvents: 1_234,
        practiceActivityAttempts: 900,
        submissions: 800,
        retrievalChecks: 600,
        independentAccuracy: 0.75,
        perfectRecallCount: 410,
        closeCount: 120,
        retryCount: 70,
        correctionsCompleted: 66,
        revealCount: 20,
        skipCount: 14,
      },
      longestStreak: 9,
      trend: [{
        date: "2026-07-30",
        practiceAttempts: 4,
        nonVoluntaryAttempts: 3,
        retrievalChecks: 3,
        perfectRecalls: 2,
        averageIndependentAccuracy: 0.75,
        firstPassCount: 1,
      }],
    },
    needsAttention: {
      weakCards: [weakCardFixture()],
      isEmpty: false,
    },
    integrityWarnings: [],
    ...overrides,
  };
}

function weakCardFixture(): WeakCard {
  return {
    cardId: "sf-001",
    prompt: "你想礼貌地问候同事。",
    contentSafety: "safe",
    courseId: "starter-foundations",
    courseTitle: "Starter Foundations",
    stage: 1,
    lapseCount: 2,
    recentNonPerfectChecks: 3,
    independentAccuracy: 0.5,
    recentResult: "retry",
    mostRecentCheckAt: "2026-07-30T10:00:00.000Z",
    dueAt: "2026-07-31T10:00:00.000Z",
  };
}

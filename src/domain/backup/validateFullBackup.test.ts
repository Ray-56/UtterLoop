import { describe, expect, it } from "vitest";
import type { SentenceCard } from "../content/SentenceCard";
import type { PracticeAttemptLogEntry, PracticeSignalLogEntry } from "../practice/PracticeLogEntry";
import type { PracticeSessionEvidence } from "../practice/PracticeSessionEvidence";
import type { UtterLoopFullBackup } from "./UtterLoopFullBackup";
import { validateFullBackup } from "./validateFullBackup";

describe("validateFullBackup", () => {
  it("accepts and returns a complete backup with more than 500 log rows", () => {
    const backup = validBackup(502);

    const validated = validateFullBackup(backup, "2026-08-01T00:00:00.000Z");

    expect(validated.schemaVersion).toBe(2);
    expect(validated.databaseSchemaVersion).toBe(6);
    expect(validated.learning.practiceLog).toHaveLength(502);
    expect(validated.learning.practiceLog[501]?.id).toBe("turn-attempt:turn-501:0");
    expect(validated.learning.practiceSessionEvidence).toEqual([]);
    expect(validated.learning.measurementEpoch).toBe("2026-08-01T00:00:00.000Z");
    expect(JSON.stringify(validated)).not.toMatch(/checkpoint|draft/i);
  });

  it("round-trips grammar tokens while keeping token-free learning support restorable", () => {
    const current = currentBackup();
    current.catalog.cards[0]!.learningSupport = learningSupportWithTokens();

    expect(
      validateFullBackup(current).catalog.cards[0]!.learningSupport!.grammar.chunks[2].tokens,
    ).toEqual([
      {
        text: "ready.",
        ipa: "/ˈrɛdi/",
        gloss: "准备好的",
        partOfSpeech: "形容词",
      },
    ]);

    const tokenFree = validBackup();
    const tokenFreeSupport = learningSupportWithTokens();
    tokenFreeSupport.grammar.chunks.forEach((chunk) => {
      delete chunk.tokens;
    });
    tokenFree.catalog.cards[0]!.learningSupport = tokenFreeSupport;

    expect(
      validateFullBackup(tokenFree).catalog.cards[0]!.learningSupport!.grammar.chunks,
    ).toEqual(tokenFreeSupport.grammar.chunks);
  });

  it("rejects malformed grammar tokens with their full backup path", () => {
    const untrimmed = currentBackup();
    untrimmed.catalog.cards[0]!.learningSupport = learningSupportWithTokens();
    untrimmed.catalog.cards[0]!.learningSupport!.grammar.chunks[0].tokens![0].gloss = "我 ";
    expect(() => validateFullBackup(untrimmed)).toThrow(
      "catalog.cards[0].learningSupport.grammar.chunks[0].tokens[0].gloss",
    );

    const wrongOrder = currentBackup();
    wrongOrder.catalog.cards[0]!.learningSupport = learningSupportWithTokens();
    wrongOrder.catalog.cards[0]!.learningSupport!.grammar.chunks[2].tokens![0].text = "waiting";
    expect(() => validateFullBackup(wrongOrder)).toThrow(
      "catalog.cards[0].learningSupport.grammar.chunks[2].tokens",
    );

    const unknownField = currentBackup();
    unknownField.catalog.cards[0]!.learningSupport = learningSupportWithTokens();
    Object.assign(
      unknownField.catalog.cards[0]!.learningSupport!.grammar.chunks[0].tokens![0],
      { hint: "first person" },
    );
    expect(() => validateFullBackup(unknownField)).toThrow(
      "catalog.cards[0].learningSupport.grammar.chunks[0].tokens[0].hint",
    );
  });

  it("normalizes legacy and current backups that predate Finger Guide preferences", () => {
    const legacy = validBackup() as unknown as { preferences: Record<string, unknown> };
    const current = currentBackup() as unknown as { preferences: Record<string, unknown> };
    delete legacy.preferences.fingerGuideMode;
    delete current.preferences.fingerGuideMode;

    expect(validateFullBackup(legacy).preferences.fingerGuideMode).toBe("auto");
    expect(validateFullBackup(current).preferences.fingerGuideMode).toBe("auto");
  });

  it.each(["auto", "compact", "full", "off"] as const)(
    "accepts the %s Finger Guide preference",
    (fingerGuideMode) => {
      const backup = currentBackup();
      backup.preferences.fingerGuideMode = fingerGuideMode;

      expect(validateFullBackup(backup).preferences.fingerGuideMode).toBe(fingerGuideMode);
    },
  );

  it("accepts v2 evidence with dangling historical catalog identifiers", () => {
    const backup = currentBackup();
    backup.learning.practiceSessionEvidence.push({
      ...sessionEvidence("session-removed"),
      scope: {
        kind: "lesson",
        courseId: "removed-course",
        lessonId: "removed-lesson",
        mode: "learn",
      },
      round: {
        ...sessionEvidence("unused").round,
        introducedCardIds: ["removed-card"],
        firstPassCardIds: ["removed-card"],
      },
    });

    expect(validateFullBackup(backup).learning.practiceSessionEvidence)
      .toEqual(backup.learning.practiceSessionEvidence);
  });

  it("restores a structurally valid legacy card even when its Prompt exposes the target", () => {
    const backup = currentBackup();
    backup.catalog.cards[0]!.prompt = "I am ready.";

    expect(validateFullBackup(backup).catalog.cards[0]?.prompt).toBe("I am ready.");
  });

  it("rejects duplicate, malformed, or target-bearing additions in session evidence", () => {
    const duplicate = currentBackup();
    duplicate.learning.practiceSessionEvidence = [
      sessionEvidence("duplicate"),
      sessionEvidence("duplicate"),
    ];
    expect(() => validateFullBackup(duplicate))
      .toThrow("learning.practiceSessionEvidence[1].sessionId");

    const malformed = currentBackup();
    malformed.learning.practiceSessionEvidence = [sessionEvidence("malformed")];
    malformed.learning.practiceSessionEvidence[0]!.endedAt = "not-a-time";
    expect(() => validateFullBackup(malformed))
      .toThrow("learning.practiceSessionEvidence[0].endedAt");

    const dueWithoutAttempt = currentBackup();
    const dueEvidence = sessionEvidence("due-without-attempt");
    dueEvidence.round.attemptedOccurrenceIds = [];
    dueWithoutAttempt.learning.practiceSessionEvidence = [dueEvidence];
    expect(() => validateFullBackup(dueWithoutAttempt))
      .toThrow("learning.practiceSessionEvidence[0].round.dueReviewCompletedOccurrenceIds");

    const targetBearing = currentBackup() as unknown as {
      learning: { practiceSessionEvidence: Array<Record<string, unknown>> };
    };
    targetBearing.learning.practiceSessionEvidence = [{
      ...sessionEvidence("target-bearing"),
      answer: "I am ready.",
    }];
    expect(() => validateFullBackup(targetBearing))
      .toThrow("learning.practiceSessionEvidence[0].answer");
  });

  it.each([
    ["format", (backup: UtterLoopFullBackup) => Object.assign(backup, { format: "course-bundle" })],
    ["preferences.id", (backup: UtterLoopFullBackup) => Object.assign(backup.preferences, { id: "other-device" })],
  ])("rejects an invalid %s discriminator", (path, mutate) => {
    const backup = validBackup();
    mutate(backup);

    expect(() => validateFullBackup(backup)).toThrow(path);
  });

  it("rejects an unsupported schema version with its path", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    backup.schemaVersion = 3;

    expect(() => validateFullBackup(backup)).toThrow("schemaVersion");
  });

  it("rejects a backup from an unknown database schema", () => {
    const backup = validBackup() as unknown as Record<string, unknown>;
    backup.databaseSchemaVersion = 6;

    expect(() => validateFullBackup(backup)).toThrow("databaseSchemaVersion");
  });

  it("rejects duplicate primary IDs with the duplicate collection path", () => {
    const backup = validBackup();
    backup.catalog.cards.push({ ...backup.catalog.cards[0]! });

    expect(() => validateFullBackup(backup)).toThrow("catalog.cards[1].id");
  });

  it.each([
    ["catalog.categories[1].id", (backup: UtterLoopFullBackup) => backup.catalog.categories.push({ ...backup.catalog.categories[0]! })],
    ["catalog.learningPaths[1].id", (backup: UtterLoopFullBackup) => backup.catalog.learningPaths.push({ ...backup.catalog.learningPaths[0]!, courseIds: [] })],
    ["catalog.courses[1].id", (backup: UtterLoopFullBackup) => backup.catalog.courses.push({ ...backup.catalog.courses[0]!, units: [] })],
    ["learning.sentenceLearningStates[1].cardId", (backup: UtterLoopFullBackup) => backup.learning.sentenceLearningStates.push({ ...backup.learning.sentenceLearningStates[0]! })],
    ["learning.reviewStates[1].cardId", (backup: UtterLoopFullBackup) => backup.learning.reviewStates.push({ ...backup.learning.reviewStates[0]! })],
    ["learning.practiceLog[1].id", (backup: UtterLoopFullBackup) => backup.learning.practiceLog.push({ ...backup.learning.practiceLog[0]! })],
    ["learning.vocabularyEntries[1].cardId", (backup: UtterLoopFullBackup) => backup.learning.vocabularyEntries.push({ ...backup.learning.vocabularyEntries[0]! })],
  ])("rejects the duplicate identifier at %s", (path, mutate) => {
    const backup = validBackup();
    mutate(backup);

    expect(() => validateFullBackup(backup)).toThrow(path);
  });

  it.each([
    ["catalog.learningPaths[0].courseIds[0]", (backup: UtterLoopFullBackup) => { backup.catalog.learningPaths[0]!.courseIds[0] = "missing"; }],
    ["catalog.courses[0].categoryId", (backup: UtterLoopFullBackup) => { backup.catalog.courses[0]!.categoryId = "missing"; }],
    ["catalog.courses[0].units[0].lessons[0].cardIds[0]", (backup: UtterLoopFullBackup) => { backup.catalog.courses[0]!.units[0]!.lessons[0]!.cardIds[0] = "missing"; }],
    ["learning.sentenceLearningStates[0].cardId", (backup: UtterLoopFullBackup) => { backup.learning.sentenceLearningStates[0]!.cardId = "missing"; }],
    ["learning.reviewStates[0].cardId", (backup: UtterLoopFullBackup) => { backup.learning.reviewStates[0]!.cardId = "missing"; }],
    ["learning.practiceLog[0].cardId", (backup: UtterLoopFullBackup) => { backup.learning.practiceLog[0]!.cardId = "missing"; }],
    ["learning.vocabularyEntries[0].cardId", (backup: UtterLoopFullBackup) => { backup.learning.vocabularyEntries[0]!.cardId = "missing"; }],
  ])("rejects the missing reference at %s", (path, mutate) => {
    const backup = validBackup();
    mutate(backup);

    expect(() => validateFullBackup(backup)).toThrow(path);
  });

  it.each([
    ["exportedAt", (backup: UtterLoopFullBackup) => { backup.exportedAt = "not-a-date"; }],
    ["catalog.cards[0].updatedAt", (backup: UtterLoopFullBackup) => { backup.catalog.cards[0]!.updatedAt = "2026-02-30T00:00:00.000Z"; }],
    ["learning.reviewStates[0].dueAt", (backup: UtterLoopFullBackup) => { backup.learning.reviewStates[0]!.dueAt = "yesterday"; }],
    ["learning.practiceLog[0].submittedAt", (backup: UtterLoopFullBackup) => { backup.learning.practiceLog[0]!.submittedAt = "2026-07-04"; }],
    ["learning.vocabularyEntries[0].savedAt", (backup: UtterLoopFullBackup) => { backup.learning.vocabularyEntries[0]!.savedAt = "invalid"; }],
  ])("rejects the invalid date at %s", (path, mutate) => {
    const backup = validBackup();
    mutate(backup);

    expect(() => validateFullBackup(backup)).toThrow(path);
  });

  it.each([
    ["preferences.theme", (backup: UtterLoopFullBackup) => { Object.assign(backup.preferences, { theme: "neon" }); }],
    ["preferences.keySoundMuted", (backup: UtterLoopFullBackup) => { Object.assign(backup.preferences, { keySoundMuted: "off" }); }],
    ["preferences.fingerGuideMode", (backup: UtterLoopFullBackup) => { Object.assign(backup.preferences, { fingerGuideMode: "floating" }); }],
    ["preferences.quickStart.version", (backup: UtterLoopFullBackup) => { Object.assign(backup.preferences.quickStart!, { version: 2 }); }],
    ["preferences.quickStart.status", (backup: UtterLoopFullBackup) => { Object.assign(backup.preferences.quickStart!, { status: "skipped" }); }],
  ])("rejects the invalid preference at %s", (path, mutate) => {
    const backup = validBackup();
    mutate(backup);

    expect(() => validateFullBackup(backup)).toThrow(path);
  });

  it.each([
    ["learning.sentenceLearningStates[0]", (backup: UtterLoopFullBackup) => { delete backup.learning.sentenceLearningStates[0]!.firstPassSource; }],
    ["learning.reviewStates[0].stage", (backup: UtterLoopFullBackup) => {
      backup.learning.sentenceLearningStates[0] = {
        cardId: "card-1",
        introducedAt: "2026-07-03T00:00:00.000Z",
        acquisitionStatus: "needs-guided",
      };
    }],
    ["learning.practiceLog[0].id", (backup: UtterLoopFullBackup) => { backup.learning.practiceLog[0]!.id = "random-id"; }],
    ["learning.practiceLog[0].answerWasRevealed", (backup: UtterLoopFullBackup) => { backup.learning.practiceLog[0]!.answerWasRevealed = true; }],
    ["learning.practiceLog[0].phase", (backup: UtterLoopFullBackup) => { backup.learning.practiceLog[0]!.phase = "first-exposure"; }],
  ])("rejects the Guided invariant at %s", (path, mutate) => {
    const backup = validBackup();
    mutate(backup);

    expect(() => validateFullBackup(backup)).toThrow(path);
  });

  it("validates aggregate Guided signal evidence", () => {
    const backup = validBackup();
    backup.learning.practiceLog = [revealedSignal()];

    expect(validateFullBackup(backup).learning.practiceLog[0]).toMatchObject({
      id: "turn-signal:signal-turn",
      signalKinds: ["support-used", "revealed"],
      supportLevelUsed: 4,
    });

    const missingAnswer = validBackup();
    const signal = revealedSignal();
    signal.supportKindsUsed = ["pattern"];
    signal.supportLevelUsed = 1;
    signal.answerWasRevealed = false;
    missingAnswer.learning.practiceLog = [signal];
    expect(() => validateFullBackup(missingAnswer)).toThrow("learning.practiceLog[0].supportKindsUsed");
  });

  it("round-trips target-free PracticeLog context and rejects unknown context fields", () => {
    const backup = currentBackup();
    Object.assign(backup.learning.practiceLog[0]!, {
      context: {
        sessionId: "session-1",
        roundId: "round-session-1",
        occurrenceId: "occurrence-1",
        queueReason: "due-review",
        scheduledReviewDueAt: "2026-07-03T00:00:00.000Z",
      },
    });

    expect(validateFullBackup(backup).learning.practiceLog[0]).toMatchObject({
      context: {
        sessionId: "session-1",
        roundId: "round-session-1",
        occurrenceId: "occurrence-1",
        queueReason: "due-review",
        scheduledReviewDueAt: "2026-07-03T00:00:00.000Z",
      },
    });

    const unsafeContext = currentBackup();
    Object.assign(unsafeContext.learning.practiceLog[0]!, {
      context: {
        sessionId: "session-1",
        roundId: "round-session-1",
        occurrenceId: "occurrence-1",
        queueReason: "due-review",
        answer: "I am ready.",
      },
    });
    expect(() => validateFullBackup(unsafeContext))
      .toThrow("learning.practiceLog[0].context.answer");

    const legacyWithFutureContext = validBackup();
    Object.assign(legacyWithFutureContext.learning.practiceLog[0]!, {
      context: {
        sessionId: "session-1",
        roundId: "round-session-1",
        occurrenceId: "occurrence-1",
        queueReason: "due-review",
      },
    });
    expect(() => validateFullBackup(legacyWithFutureContext))
      .toThrow("learning.practiceLog[0].context");
  });

  it("rejects one turn ID being reused for another Card", () => {
    const backup = validBackup();
    backup.catalog.cards.push({ ...backup.catalog.cards[0]!, id: "card-2" });
    backup.learning.sentenceLearningStates.push({ ...backup.learning.sentenceLearningStates[0]!, cardId: "card-2" });
    backup.learning.reviewStates.push({ ...backup.learning.reviewStates[0]!, cardId: "card-2" });
    backup.learning.practiceLog.push({ ...revealedSignal(), turnId: "turn-0", id: "turn-signal:turn-0", cardId: "card-2" });

    expect(() => validateFullBackup(backup)).toThrow("learning.practiceLog[1].cardId");
  });

  it.each([
    ["learning.reviewStates[0].stage", (backup: UtterLoopFullBackup) => Object.assign(backup.learning.reviewStates[0]!, { stage: 7 })],
    ["learning.reviewStates[0].lapseCount", (backup: UtterLoopFullBackup) => Object.assign(backup.learning.reviewStates[0]!, { lapseCount: -1 })],
    ["learning.practiceLog[0].accuracy", (backup: UtterLoopFullBackup) => Object.assign(backup.learning.practiceLog[0]!, { accuracy: Number.NaN })],
    ["learning.practiceLog[0].durationMs", (backup: UtterLoopFullBackup) => Object.assign(backup.learning.practiceLog[0]!, { durationMs: Number.POSITIVE_INFINITY })],
  ])("rejects an invalid bounded number at %s", (path, mutate) => {
    const backup = validBackup();
    mutate(backup);

    expect(() => validateFullBackup(backup)).toThrow(path);
  });

  it("rejects malformed collection structure before domain validation", () => {
    const backup = validBackup() as unknown as { learning: { practiceLog: unknown } };
    backup.learning.practiceLog = {};

    expect(() => validateFullBackup(backup)).toThrow("learning.practiceLog");
  });

  it("rejects a checkpoint or draft added outside the durable backup schema", () => {
    const backup = validBackup() as UtterLoopFullBackup & { checkpoint?: unknown };
    backup.checkpoint = { draft: "I am" };

    expect(() => validateFullBackup(backup)).toThrow("$backup.checkpoint");
  });
});

function validBackup(logCount = 1): UtterLoopFullBackup {
  return {
    format: "utterloop-full-backup",
    schemaVersion: 1,
    exportedAt: "2026-07-31T10:00:00.000Z",
    databaseSchemaVersion: 5,
    catalog: {
      categories: [{ id: "category-1", title: "Foundations", description: "Start here", sortOrder: 0 }],
      learningPaths: [{ id: "path-1", title: "Core", description: "Core path", courseIds: ["course-1"] }],
      courses: [{
        id: "course-1",
        title: "Course",
        description: "Course description",
        categoryId: "category-1",
        tags: ["core"],
        level: { label: "Beginner", cefrFrom: "A1", cefrTo: "A1" },
        provider: { kind: "original", name: "UtterLoop" },
        revision: 1,
        license: { name: "CC BY 4.0", url: "https://example.com/license", attribution: "UtterLoop" },
        units: [{
          id: "unit-1",
          title: "Unit",
          description: "Unit description",
          lessons: [{ id: "lesson-1", title: "Lesson", objective: "Recall", cardIds: ["card-1"] }],
        }],
      }],
      cards: [{
        id: "card-1",
        english: "I am ready.",
        prompt: "表达我准备好了",
        source: "UtterLoop",
        tags: ["core"],
        acceptableAnswers: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
      }],
    },
    learning: {
      sentenceLearningStates: [{
        cardId: "card-1",
        introducedAt: "2026-07-03T00:00:00.000Z",
        firstPassedAt: "2026-07-04T00:00:00.000Z",
        firstPassSource: "independent-recall",
      }],
      reviewStates: [{
        cardId: "card-1",
        stage: 1,
        dueAt: "2026-08-01T00:00:00.000Z",
        lastReviewedAt: "2026-07-04T00:00:00.000Z",
        streak: 1,
        lapseCount: 0,
      }],
      practiceLog: Array.from({ length: logCount }, (_, index) => attempt(index)),
      vocabularyEntries: [{ cardId: "card-1", savedAt: "2026-07-05T00:00:00.000Z" }],
    },
    preferences: {
      id: "device",
      theme: "system",
      speechVoiceUri: null,
      keySoundMuted: false,
      fingerGuideMode: "auto",
      quickStart: { version: 1, status: "completed" },
    },
  };
}

function currentBackup() {
  const legacy = validBackup();
  return {
    ...legacy,
    schemaVersion: 2 as const,
    databaseSchemaVersion: 6 as const,
    learning: {
      ...legacy.learning,
      measurementEpoch: "2026-08-01T00:00:00.000Z",
      practiceSessionEvidence: [] as PracticeSessionEvidence[],
    },
  };
}

function learningSupportWithTokens(): NonNullable<SentenceCard["learningSupport"]> {
  return {
    context: "在开始前说明自己已经准备好。",
    communicativeFunction: "表达准备完毕",
    pattern: "S + be + adjective.",
    keywords: ["ready"],
    frame: "I am ___.",
    pronunciation: {
      dialect: "en-US",
      sentenceIpa: "/aɪ æm ˈrɛdi/",
      chunks: [
        { text: "I am", ipa: "/aɪ æm/" },
        { text: "ready.", ipa: "/ˈrɛdi/" },
      ],
    },
    grammar: {
      structure: "S + be + C",
      explanation: "am 连接主语和表语。",
      points: ["be 动词"],
      chunks: [
        {
          text: "I",
          role: "subject",
          label: "主语 S",
          tokens: [
            { text: "I", ipa: "/aɪ/", gloss: "我", partOfSpeech: "人称代词" },
          ],
        },
        {
          text: "am",
          role: "predicate",
          label: "系动词 V",
          tokens: [
            { text: "am", ipa: "/æm/", gloss: "是", partOfSpeech: "动词" },
          ],
        },
        {
          text: "ready.",
          role: "complement",
          label: "表语 C",
          tokens: [
            {
              text: "ready.",
              ipa: "/ˈrɛdi/",
              gloss: "准备好的",
              partOfSpeech: "形容词",
            },
          ],
        },
      ],
    },
  };
}

function sessionEvidence(sessionId: string): PracticeSessionEvidence {
  return {
    schemaVersion: 1,
    sessionId,
    roundId: `round-${sessionId}`,
    scope: { kind: "review" },
    entryPoint: "standard",
    startedAt: "2026-08-01T00:00:00.000Z",
    engagedAt: "2026-08-01T00:01:00.000Z",
    endedAt: "2026-08-01T00:05:00.000Z",
    terminal: { kind: "completed", reason: "scope-complete" },
    round: {
      initialOccurrenceIds: ["occurrence-1"],
      scheduledOccurrenceIds: ["occurrence-1"],
      attemptedOccurrenceIds: ["occurrence-1"],
      completedOccurrenceIds: ["occurrence-1"],
      skippedOccurrenceIds: [],
      remainingOccurrenceIds: [],
      dueReviewScheduledOccurrenceIds: ["occurrence-1"],
      dueReviewCompletedOccurrenceIds: ["occurrence-1"],
      introducedCardIds: [],
      firstPassCardIds: [],
      requeue: {
        insertedReturnOccurrenceIds: [],
        deferredNoRoomCardIds: [],
        capReachedCardIds: [],
      },
    },
  };
}

function attempt(index: number): PracticeAttemptLogEntry {
  const turnId = `turn-${index}`;
  return {
    kind: "attempt",
    id: `turn-attempt:${turnId}:0`,
    turnId,
    cardId: "card-1",
    phase: "independent-recall",
    submissionIndex: 0,
    submittedAt: new Date(Date.UTC(2026, 6, 4, 0, index)).toISOString(),
    answer: "I am ready.",
    outcome: "perfect",
    accuracy: 1,
    answerWasRevealed: false,
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 1200,
    supportLevelUsed: 0,
    supportKindsUsed: [],
    receivedCorrection: false,
  };
}

function revealedSignal(): PracticeSignalLogEntry {
  return {
    kind: "signal" as const,
    id: "turn-signal:signal-turn",
    turnId: "signal-turn",
    cardId: "card-1",
    phase: "guided-recall" as const,
    submittedAt: "2026-07-04T01:00:00.000Z",
    updatedAt: "2026-07-04T01:01:00.000Z",
    signalKinds: ["support-used", "revealed"],
    reviewFailureRecorded: true,
    answer: "",
    accuracy: 0,
    answerWasRevealed: true,
    hadEdits: false,
    audioPlayCount: 0,
    durationMs: 100,
    supportLevelUsed: 4,
    supportKindsUsed: ["answer"],
    receivedCorrection: false,
  };
}

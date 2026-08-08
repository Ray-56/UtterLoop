import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, BookOpen, Keyboard, RotateCcw, Settings } from "lucide-react";
import type { TrainingSnapshot } from "../application/use-cases/getTrainingSnapshot";
import type { PracticeScope } from "../application/use-cases/buildPracticeSession";
import { resolveDefaultPracticeScope } from "../application/use-cases/resolveDefaultPracticeScope";
import type { CourseCatalogQuery } from "../domain/curriculum/queryCourseCatalog";
import {
  buildQuickStartSession,
  type QuickStartSession,
} from "../application/use-cases/buildQuickStartSession";
import {
  resolveQuickStartEligibility,
} from "../application/use-cases/quickStartLifecycle";
import {
  filterReviewDashboard,
  type ReviewDashboard,
} from "../domain/review/buildReviewDashboard";
import { CoursesView } from "./components/CoursesView";
import { PracticeWorkbench } from "./components/PracticeWorkbench";
import { ProgressView } from "./components/ProgressView";
import { ReviewView } from "./components/ReviewView";
import { SettingsView } from "./components/SettingsView";
import { Shell } from "./components/Shell";
import { usePersonalizationPreferences } from "./hooks/usePersonalizationPreferences";
import {
  useTrainingController,
  type ActivePracticeSessionSummary,
} from "./hooks/useTrainingController";
import { practiceScopeKey } from "./practice-session";
import {
  buildAppUrlState,
  DEFAULT_COURSE_RESULT_LIMIT,
  parseAppUrlState,
  type AppUrlState,
  type AppView,
} from "./appUrlState";
import {
  resolvePracticeRoute,
  resolveReviewCourseFilter,
} from "./routeAvailability";

export type { AppView } from "./appUrlState";

const navigation = [
  { id: "practice", label: "Practice", icon: Keyboard },
  { id: "courses", label: "Courses", icon: BookOpen },
  { id: "review", label: "Review", icon: RotateCcw },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{ id: AppView; label: string; icon: typeof Keyboard }>;

export function App() {
  const [urlState, setUrlState] = useState<AppUrlState>(() => readInitialAppUrlState());
  const [reviewRouteNotice, setReviewRouteNotice] = useState<string | null>(null);
  const controller = useTrainingController();
  const snapshot = controller.snapshot;
  const [activePracticeLookup, setActivePracticeLookup] = useState<{
    snapshot: TrainingSnapshot;
    session: ActivePracticeSessionSummary | null;
  } | null>(null);
  const activePracticeSession = snapshot && activePracticeLookup?.snapshot === snapshot
    ? activePracticeLookup.session
    : undefined;
  const personalization = usePersonalizationPreferences(
    snapshot?.preferences ?? null,
    (patch) => controller.updateAppPreferences(patch),
  );
  const activeView = urlState.view;
  const practiceScope = urlState.practiceScope as PracticeScope | null;
  const catalogQuery = urlState.catalog.query;
  const catalogResultLimit = urlState.catalog.resultLimit;
  const selectedCourseId = urlState.catalog.selectedCourseId;
  const selectedReviewCourseId = snapshot
    ? resolveReviewCourseFilter(urlState.reviewCourseId, snapshot.courses).courseId
    : urlState.reviewCourseId;
  const reviewDashboard = useMemo<ReviewDashboard>(() => {
    if (!snapshot) {
      return EMPTY_REVIEW_DASHBOARD;
    }

    return filterReviewDashboard(snapshot.reviewDashboard, selectedReviewCourseId);
  }, [selectedReviewCourseId, snapshot]);
  const progressDashboard = snapshot?.progressDashboard ?? null;
  const activeQuickStartRef = useRef<QuickStartSession | null>(null);

  useEffect(() => {
    if (!snapshot) return;
    const currentSnapshot = snapshot;
    let isCancelled = false;

    async function readActivePracticeSession() {
      try {
        const activeSession = await controller.getActivePracticeSession();
        if (isCancelled) return;
        if (activeSession && resolvePracticeRoute(activeSession.scope, {
          courses: currentSnapshot.courses,
          cardIds: new Set(currentSnapshot.cards.map((card) => card.id)),
        }).kind === "available") {
          setActivePracticeLookup({ snapshot: currentSnapshot, session: activeSession });
        } else {
          setActivePracticeLookup({ snapshot: currentSnapshot, session: null });
        }
      } catch {
        if (!isCancelled) {
          setActivePracticeLookup({ snapshot: currentSnapshot, session: null });
        }
      }
    }

    void readActivePracticeSession();
    return () => {
      isCancelled = true;
    };
  }, [snapshot]);

  const quickStartSession = useMemo(() => {
    const isNotQuickStartScope = practiceScope?.kind !== "lesson"
      || practiceScope.courseId !== "starter-foundations"
      || practiceScope.lessonId !== "sf-u1-l1"
      || practiceScope.mode !== "learn";

    if (!snapshot || isNotQuickStartScope) {
      activeQuickStartRef.current = null;
      return null;
    }

    if (snapshot.preferences.quickStart?.version === 1) {
      activeQuickStartRef.current = null;
      return null;
    }

    if (activeQuickStartRef.current) {
      return activeQuickStartRef.current;
    }

    if (!resolveQuickStartEligibility({
      activeEntryPoint: activePracticeSession
        && activePracticeSession.scopeKey === practiceScopeKey(practiceScope)
        ? activePracticeSession.entryPoint
        : null,
      learningStates: snapshot.sentenceLearningStates,
      preference: snapshot.preferences.quickStart,
    }).eligible) {
      return null;
    }

    activeQuickStartRef.current = buildQuickStartSession({
      courses: snapshot.courses,
      cards: snapshot.cards,
    });
    return activeQuickStartRef.current;
  }, [activePracticeSession, practiceScope, snapshot]);
  const practiceRoute = useMemo(() => snapshot && practiceScope
    ? resolvePracticeRoute(practiceScope, {
        courses: snapshot.courses,
        cardIds: new Set(snapshot.cards.map((card) => card.id)),
      })
    : null, [practiceScope, snapshot]);
  const activePracticeScope = practiceRoute?.kind === "available" ? practiceScope : null;
  const practiceLinkUnavailable = urlState.practiceScopeWasInvalid
    || practiceRoute?.kind === "unavailable";

  function applyUrlState(
    state: AppUrlState,
    mode: HistoryWriteMode,
    isCourseDetail = false,
  ): void {
    const canonicalState = state.practiceScope
      ? { ...state, practiceScopeWasInvalid: false }
      : state;
    setUrlState(canonicalState);
    writeBrowserUrl(canonicalState, mode, isCourseDetail);
  }

  useEffect(() => {
    if (
      !snapshot
      || practiceScope
      || urlState.practiceScopeWasInvalid
      || activeView !== "practice"
      || activePracticeSession === undefined
    ) {
      return;
    }

    const resolvedScope = defaultPracticeScope(snapshot, activePracticeSession?.scope ?? null);
    if (resolvedScope) {
      applyUrlState({ ...urlState, practiceScope: resolvedScope }, "replace");
    }
  }, [activePracticeSession, activeView, practiceScope, snapshot, urlState]);

  useEffect(() => {
    if (!snapshot || !urlState.reviewCourseId) {
      return;
    }

    const resolution = resolveReviewCourseFilter(urlState.reviewCourseId, snapshot.courses);
    if (!resolution.wasUnavailable) {
      return;
    }

    setReviewRouteNotice("That Review course is no longer available. Showing all courses instead.");
    applyUrlState({ ...urlState, reviewCourseId: null }, "replace");
  }, [snapshot, urlState]);

  useEffect(() => {
    function syncFromBrowserHistory() {
      setReviewRouteNotice(null);
      setUrlState(parseAppUrlState(window.location.search));
    }

    window.addEventListener("popstate", syncFromBrowserHistory);
    return () => window.removeEventListener("popstate", syncFromBrowserHistory);
  }, []);

  function startLesson(courseId: string, lessonId: string, mode: "learn" | "replay") {
    applyUrlState({
      ...urlState,
      view: "practice",
      catalog: { ...urlState.catalog, selectedCourseId: null },
      practiceScope: { kind: "lesson", courseId, lessonId, mode },
    }, "push");
  }

  function startReview(courseId?: string) {
    applyUrlState({
      ...urlState,
      view: "practice",
      catalog: { ...urlState.catalog, selectedCourseId: null },
      practiceScope: buildReviewScope(courseId),
    }, "push");
  }

  function replayCourse(courseId: string) {
    applyUrlState({
      ...urlState,
      view: "practice",
      catalog: { ...urlState.catalog, selectedCourseId: null },
      practiceScope: buildCourseReplayScope(courseId),
    }, "push");
  }

  function startVocabulary(courseId?: string, cardId?: string) {
    applyUrlState({
      ...urlState,
      view: "practice",
      catalog: { ...urlState.catalog, selectedCourseId: null },
      practiceScope: {
        kind: "vocabulary",
        ...(courseId ? { courseId } : {}),
        ...(cardId ? { cardId } : {}),
      },
    }, "push");
  }

  function startFocusedPractice(cardId: string) {
    applyUrlState({
      ...urlState,
      view: "practice",
      catalog: { ...urlState.catalog, selectedCourseId: null },
      practiceScope: buildFocusedPracticeScope(cardId),
    }, "push");
  }

  function navigate(view: AppView) {
    if (view === activeView && (view !== "courses" || !selectedCourseId)) {
      return;
    }

    setReviewRouteNotice(null);
    applyUrlState(buildPrimaryNavigationState(urlState, view), "push");
  }

  function changeCatalogQuery(query: CourseCatalogQuery) {
    applyUrlState({
      ...urlState,
      catalog: {
        selectedCourseId,
        query,
        resultLimit: DEFAULT_COURSE_RESULT_LIMIT,
      },
    }, "replace", selectedCourseId !== null);
  }

  function changeCourseResultLimit(resultLimit: number) {
    const navigation = buildCourseResultLimitNavigation(urlState, resultLimit);
    applyUrlState(navigation.state, navigation.mode, selectedCourseId !== null);
  }

  function selectCourse(courseId: string | null) {
    if (courseId) {
      applyUrlState({
        ...urlState,
        view: "courses",
        catalog: { ...urlState.catalog, selectedCourseId: courseId },
      }, "push", true);
      return;
    }

    if (window.history.state?.utterloopCourseDetail === true) {
      window.history.back();
      return;
    }

    applyUrlState({
      ...urlState,
      view: "courses",
      catalog: { ...urlState.catalog, selectedCourseId: null },
    }, "replace");
  }

  function openCourse(courseId: string) {
    applyUrlState({
      ...urlState,
      view: "courses",
      catalog: { ...urlState.catalog, selectedCourseId: courseId },
    }, "push", true);
  }

  function changeReviewCourse(courseId: string | null) {
    setReviewRouteNotice(null);
    applyUrlState({ ...urlState, reviewCourseId: courseId }, "replace");
  }

  function openCourseReview(courseId: string) {
    setReviewRouteNotice(null);
    applyUrlState({
      ...urlState,
      view: "review",
      reviewCourseId: courseId,
    }, "push");
  }

  function continueRecommendedPractice() {
    if (!snapshot) {
      return;
    }

    const nextScope = defaultPracticeScope(snapshot);
    if (nextScope) {
      applyUrlState({ ...urlState, view: "practice", practiceScope: nextScope }, "push");
      return;
    }

    navigate("courses");
  }

  return (
    <Shell
      activeView={activeView}
      error={controller.error}
      navigation={navigation}
      onNavigate={navigate}
      onRetryStartup={() => void controller.retryStartup()}
      snapshot={controller.snapshot}
      status={controller.status}
    >
      {activeView === "practice" && (
        snapshot && !practiceScope && activePracticeSession === undefined ? (
          <section aria-live="polite" className="center-panel">
            <Keyboard aria-hidden="true" size={28} />
            <h3>Checking your active Practice Session</h3>
            <p>Looking for a safe local checkpoint before choosing what comes next.</p>
          </section>
        ) : practiceLinkUnavailable ? (
          <PracticeLinkUnavailable
            onBrowseCourses={() => navigate("courses")}
            onContinueRecommended={continueRecommendedPractice}
          />
        ) : (
          <PracticeWorkbench
            controller={controller}
            fingerGuideMode={personalization.preferences.fingerGuideMode}
            keySoundMuted={snapshot?.preferences.keySoundMuted ?? false}
            onContinueRecommended={continueRecommendedPractice}
            onCompleteQuickStart={() => controller.refresh()}
            onDismissQuickStart={() => controller.refresh()}
            onKeySoundMutedChange={(isMuted) => controller.updateAppPreferences({ keySoundMuted: isMuted })}
            onOpenCourse={openCourse}
            onOpenCourses={() => navigate("courses")}
            onOpenReview={openCourseReview}
            onResumeActivePractice={(scope) => applyUrlState({
              ...urlState,
              view: "practice",
              practiceScope: scope,
            }, "replace")}
            onStartLesson={(courseId, lessonId) => startLesson(courseId, lessonId, "learn")}
            quickStartSession={quickStartSession}
            scope={activePracticeScope}
            speechVoiceUri={personalization.preferences.speechVoiceUri}
          />
        )
      )}
      {activeView === "courses" && (
        <CoursesView
          catalogQuery={catalogQuery}
          cards={snapshot?.cards ?? []}
          categories={snapshot?.categories ?? []}
          courses={snapshot?.courses ?? []}
          learningStates={snapshot?.sentenceLearningStates ?? []}
          learningPaths={snapshot?.learningPaths ?? []}
          onCatalogQueryChange={changeCatalogQuery}
          onResultLimitChange={changeCourseResultLimit}
          onReplayCourse={replayCourse}
          onReplayLesson={(courseId, lessonId) => startLesson(courseId, lessonId, "replay")}
          onSelectCourse={selectCourse}
          onStartLesson={(courseId, lessonId) => startLesson(courseId, lessonId, "learn")}
          resultLimit={catalogResultLimit}
          selectedCourseId={selectedCourseId}
        />
      )}
      {activeView === "review" && (
        <>
          {reviewRouteNotice && (
            <p className="route-notice" role="status">{reviewRouteNotice}</p>
          )}
          <ReviewView
            dashboard={reviewDashboard}
            onPracticeVocabularyCard={(cardId, courseId) => startVocabulary(courseId, cardId)}
            onRemoveVocabulary={async (cardId) => {
              await controller.setVocabularyStatus(cardId, false);
            }}
            onReturnToNew={async (cardId) => {
              await controller.setReviewLearningStatus(cardId, "new");
            }}
            onReviewCourseChange={changeReviewCourse}
            onSetVocabulary={async (cardId, isSaved) => {
              await controller.setVocabularyStatus(cardId, isSaved);
            }}
            onStartReview={startReview}
            onStartVocabulary={startVocabulary}
          />
        </>
      )}
      {activeView === "progress" && (
        <ProgressView
          betaReadiness={snapshot?.betaReadiness ?? null}
          dashboard={progressDashboard}
          onPracticeWeakCard={startFocusedPractice}
          recentActivity={snapshot?.recentPracticeActivity}
        />
      )}
      {activeView === "settings" && (
        <SettingsView controller={controller} personalization={personalization} />
      )}
    </Shell>
  );
}

const EMPTY_REVIEW_DASHBOARD: ReviewDashboard = {
  selectedCourseId: null,
  courseOptions: [],
  due: [],
  upcoming: [],
  mastered: [],
  vocabulary: [],
};

export function buildCourseReplayScope(courseId: string): PracticeScope {
  return { kind: "course", courseId };
}

export function buildReviewScope(courseId?: string): PracticeScope {
  return courseId ? { kind: "review", courseId } : { kind: "review" };
}

export function buildFocusedPracticeScope(cardId: string): PracticeScope {
  return { kind: "focused", cardId };
}

export function buildCourseResultLimitNavigation(
  state: AppUrlState,
  resultLimit: number,
): { state: AppUrlState; mode: "replace" } {
  return {
    mode: "replace",
    state: {
      ...state,
      catalog: {
        ...state.catalog,
        resultLimit,
      },
    },
  };
}

export function buildPrimaryNavigationState(
  state: AppUrlState,
  view: AppView,
): AppUrlState {
  return {
    ...state,
    view,
    practiceScope: null,
    practiceScopeWasInvalid: false,
    catalog: {
      ...state.catalog,
      selectedCourseId: null,
    },
  };
}

function PracticeLinkUnavailable({
  onBrowseCourses,
  onContinueRecommended,
}: {
  onBrowseCourses(): void;
  onContinueRecommended(): void;
}) {
  return (
    <section className="practice-link-unavailable" aria-labelledby="practice-link-unavailable-title">
      <p className="eyebrow">Practice link</p>
      <h3 id="practice-link-unavailable-title">Practice link is no longer available</h3>
      <p>The linked course, lesson, or sentence may have been removed or replaced.</p>
      <div className="practice-link-unavailable-actions">
        <button className="primary-button" onClick={onContinueRecommended} type="button">
          Continue recommended
        </button>
        <button className="secondary-button" onClick={onBrowseCourses} type="button">
          Browse courses
        </button>
      </div>
    </section>
  );
}

function readInitialAppUrlState(): AppUrlState {
  return parseAppUrlState(typeof window === "undefined" ? "" : window.location.search);
}

type HistoryWriteMode = "push" | "replace";

function writeBrowserUrl(
  state: AppUrlState,
  mode: HistoryWriteMode,
  isCourseDetail = false,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const search = buildAppUrlState(state);
  const historyState = {
    ...window.history.state,
    utterloopCourseDetail: isCourseDetail,
  };
  window.history[mode === "push" ? "pushState" : "replaceState"](
    historyState,
    "",
    `${window.location.pathname}${search}${window.location.hash}`,
  );
}

function defaultPracticeScope(
  snapshot: TrainingSnapshot,
  activeScope: PracticeScope | null = null,
): PracticeScope | null {
  return resolveDefaultPracticeScope({
    explicitScope: null,
    activeScope,
    reviewStates: snapshot.reviewStates,
    pathProgress: snapshot.pathProgress,
    courses: snapshot.courses,
    now: new Date(),
  });
}

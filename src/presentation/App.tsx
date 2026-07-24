import { useEffect, useState } from "react";
import { BarChart3, BookOpen, Keyboard, RotateCcw, Settings } from "lucide-react";
import type { TrainingSnapshot } from "../application/use-cases/getTrainingSnapshot";
import type { PracticeScope } from "../application/use-cases/buildPracticeSession";
import {
  DEFAULT_COURSE_CATALOG_QUERY,
  type CourseCatalogQuery,
} from "../domain/curriculum/queryCourseCatalog";
import { CoursesView } from "./components/CoursesView";
import { PracticeWorkbench } from "./components/PracticeWorkbench";
import { ProgressView } from "./components/ProgressView";
import { ReviewView } from "./components/ReviewView";
import { SettingsView } from "./components/SettingsView";
import { Shell } from "./components/Shell";
import { useTrainingController } from "./hooks/useTrainingController";
import {
  buildCourseCatalogUrl,
  parseCourseCatalogUrl,
  resolveAppViewFromUrl,
  updateAppViewInUrl,
} from "./courseCatalogUrlState";

export type AppView = "practice" | "courses" | "review" | "progress" | "settings";

const navigation = [
  { id: "practice", label: "Practice", icon: Keyboard },
  { id: "courses", label: "Courses", icon: BookOpen },
  { id: "review", label: "Review", icon: RotateCcw },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
] satisfies Array<{ id: AppView; label: string; icon: typeof Keyboard }>;

export function App() {
  const initialCatalogState = readCourseCatalogUrl();
  const [activeView, setActiveView] = useState<AppView>(() => readInitialAppView());
  const [practiceScope, setPracticeScope] = useState<PracticeScope | null>(null);
  const [catalogQuery, setCatalogQuery] = useState<CourseCatalogQuery>(initialCatalogState.query);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(initialCatalogState.selectedCourseId);
  const controller = useTrainingController();
  const snapshot = controller.snapshot;
  const activePracticeScope = snapshot && practiceScope && isScopeAvailable(practiceScope, snapshot)
    ? practiceScope
    : null;

  useEffect(() => {
    if (!snapshot || activePracticeScope) {
      return;
    }

    setPracticeScope(defaultPracticeScope(snapshot));
  }, [activePracticeScope, snapshot]);

  useEffect(() => {
    function syncFromBrowserHistory() {
      const nextCatalogState = readCourseCatalogUrl();
      setActiveView(readInitialAppView());
      setCatalogQuery(nextCatalogState.query);
      setSelectedCourseId(nextCatalogState.selectedCourseId);
    }

    window.addEventListener("popstate", syncFromBrowserHistory);
    return () => window.removeEventListener("popstate", syncFromBrowserHistory);
  }, []);

  function startLesson(courseId: string, lessonId: string, mode: "learn" | "replay") {
    setPracticeScope({ kind: "lesson", courseId, lessonId, mode });
    navigate("practice");
  }

  function startReview() {
    setPracticeScope({ kind: "review" });
    navigate("practice");
  }

  function startVocabulary() {
    setPracticeScope({ kind: "vocabulary" });
    navigate("practice");
  }

  function navigate(view: AppView) {
    setActiveView(view);

    if (view !== "courses") {
      setSelectedCourseId(null);
    }

    replaceBrowserUrl(updateAppViewInUrl(window.location.search, view), false);
  }

  function changeCatalogQuery(query: CourseCatalogQuery) {
    setCatalogQuery(query);
    replaceBrowserUrl(buildCourseCatalogUrl({ selectedCourseId, query }), selectedCourseId !== null);
  }

  function selectCourse(courseId: string | null) {
    if (courseId) {
      setSelectedCourseId(courseId);
      pushBrowserUrl(buildCourseCatalogUrl({ selectedCourseId: courseId, query: catalogQuery }));
      return;
    }

    if (window.history.state?.utterloopCourseDetail === true) {
      window.history.back();
      return;
    }

    setSelectedCourseId(null);
    replaceBrowserUrl(buildCourseCatalogUrl({ selectedCourseId: null, query: catalogQuery }), false);
  }

  return (
    <Shell
      activeView={activeView}
      navigation={navigation}
      onNavigate={navigate}
      snapshot={controller.snapshot}
      status={controller.status}
    >
      {activeView === "practice" && (
        <PracticeWorkbench
          controller={controller}
          onOpenCourses={() => navigate("courses")}
          scope={activePracticeScope}
        />
      )}
      {activeView === "courses" && (
        <CoursesView
          catalogQuery={catalogQuery}
          cards={snapshot?.cards ?? []}
          categories={snapshot?.categories ?? []}
          courses={snapshot?.courses ?? []}
          learningPaths={snapshot?.learningPaths ?? []}
          onCatalogQueryChange={changeCatalogQuery}
          onReplayLesson={(courseId, lessonId) => startLesson(courseId, lessonId, "replay")}
          onSelectCourse={selectCourse}
          onStartLesson={(courseId, lessonId) => startLesson(courseId, lessonId, "learn")}
          reviewStates={snapshot?.reviewStates ?? []}
          selectedCourseId={selectedCourseId}
        />
      )}
      {activeView === "review" && (
        <ReviewView
          controller={controller}
          onStartReview={startReview}
          onStartVocabulary={startVocabulary}
        />
      )}
      {activeView === "progress" && <ProgressView controller={controller} />}
      {activeView === "settings" && <SettingsView controller={controller} />}
    </Shell>
  );
}

function readCourseCatalogUrl() {
  return typeof window === "undefined"
    ? {
        isCoursesView: false,
        selectedCourseId: null,
        query: DEFAULT_COURSE_CATALOG_QUERY,
      }
    : parseCourseCatalogUrl(window.location.search);
}

function readInitialAppView(): AppView {
  return typeof window === "undefined" ? "practice" : resolveAppViewFromUrl(window.location.search);
}

function replaceBrowserUrl(search: string, isCourseDetail: boolean): void {
  const nextState = { ...window.history.state, utterloopCourseDetail: isCourseDetail };
  window.history.replaceState(nextState, "", `${window.location.pathname}${search}${window.location.hash}`);
}

function pushBrowserUrl(search: string): void {
  const nextState = { ...window.history.state, utterloopCourseDetail: true };
  window.history.pushState(nextState, "", `${window.location.pathname}${search}${window.location.hash}`);
}

function defaultPracticeScope(snapshot: TrainingSnapshot): PracticeScope | null {
  const recommendation = snapshot.pathProgress.find((path) => path.recommendedLessonId);

  if (recommendation?.recommendedCourseId && recommendation.recommendedLessonId) {
    return {
      kind: "lesson",
      courseId: recommendation.recommendedCourseId,
      lessonId: recommendation.recommendedLessonId,
      mode: "learn",
    };
  }

  const firstCourse = snapshot.courses[0];
  const firstLesson = firstCourse?.units[0]?.lessons[0];

  return firstCourse && firstLesson
    ? { kind: "lesson", courseId: firstCourse.id, lessonId: firstLesson.id, mode: "replay" }
    : null;
}

function isScopeAvailable(scope: PracticeScope, snapshot: TrainingSnapshot): boolean {
  if (scope.kind === "review") {
    return !scope.courseId || snapshot.courses.some((course) => course.id === scope.courseId);
  }

  if (scope.kind === "vocabulary") {
    return true;
  }

  const course = snapshot.courses.find((candidate) => candidate.id === scope.courseId);

  if (!course) {
    return false;
  }

  return scope.kind === "course"
    || course.units.some((unit) => unit.lessons.some((lesson) => lesson.id === scope.lessonId));
}

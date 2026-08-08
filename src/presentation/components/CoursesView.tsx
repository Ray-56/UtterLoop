import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ExternalLink,
  Eye,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { SentenceLearningState } from "../../domain/learning/SentenceLearningState";
import type {
  Course,
  CourseCategory,
  CourseId,
  CourseLesson,
  CourseLessonId,
  CefrLevel,
  LearningPath,
} from "../../domain/curriculum/Course";
import {
  buildCourseCatalogItems,
  type CourseCatalogItem,
} from "../../domain/curriculum/buildCourseCatalogItems";
import {
  DEFAULT_COURSE_CATALOG_QUERY,
  queryCourseCatalog,
  type CourseCatalogQuery,
} from "../../domain/curriculum/queryCourseCatalog";
import { DEFAULT_COURSE_RESULT_LIMIT } from "../appUrlState";

export interface CoursesViewProps {
  categories: CourseCategory[];
  learningPaths: LearningPath[];
  courses: Course[];
  cards: SentenceCard[];
  learningStates: SentenceLearningState[];
  catalogQuery: CourseCatalogQuery;
  selectedCourseId: CourseId | null;
  onCatalogQueryChange(query: CourseCatalogQuery): void;
  onResultLimitChange(resultLimit: number): void;
  onSelectCourse(courseId: CourseId | null): void;
  onStartLesson(courseId: CourseId, lessonId: CourseLessonId): void;
  onReplayCourse(courseId: CourseId): void;
  onReplayLesson(courseId: CourseId, lessonId: CourseLessonId): void;
  resultLimit: number;
}

export function CoursesView(props: CoursesViewProps) {
  const items = useMemo(
    () =>
      buildCourseCatalogItems({
        categories: props.categories,
        courses: props.courses,
        learningPaths: props.learningPaths,
        learningStates: props.learningStates,
      }),
    [props.categories, props.courses, props.learningPaths, props.learningStates],
  );
  const results = useMemo(
    () => queryCourseCatalog(items, props.catalogQuery),
    [items, props.catalogQuery],
  );
  const visibleCount = Math.max(DEFAULT_COURSE_RESULT_LIMIT, props.resultLimit);
  const visibleResults = results.slice(0, visibleCount);
  const catalogReturnRef = useRef<{ courseId: CourseId; scrollY: number } | null>(null);
  const previousSelectedCourseIdRef = useRef(props.selectedCourseId);
  const selectedItem = props.selectedCourseId
    ? items.find((item) => item.course.id === props.selectedCourseId)
    : undefined;

  useEffect(() => {
    const previousCourseId = previousSelectedCourseIdRef.current;
    previousSelectedCourseIdRef.current = props.selectedCourseId;

    if (!previousCourseId || props.selectedCourseId || !catalogReturnRef.current) {
      return;
    }

    const returnState = catalogReturnRef.current;
    catalogReturnRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      const trigger = document.getElementById(courseViewButtonId(returnState.courseId));
      trigger?.focus({ preventScroll: true });
      window.scrollTo({ top: returnState.scrollY, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [props.selectedCourseId]);

  function selectCourse(courseId: CourseId | null) {
    if (courseId && typeof window !== "undefined") {
      catalogReturnRef.current = { courseId, scrollY: window.scrollY };
    }
    props.onSelectCourse(courseId);
  }

  if (props.selectedCourseId && !selectedItem) {
    return <CourseNotFound onSelectCourse={selectCourse} />;
  }

  if (selectedItem) {
    return (
      <CourseDetail
        cards={props.cards}
        item={selectedItem}
        key={selectedItem.course.id}
        onReplayCourse={props.onReplayCourse}
        onReplayLesson={props.onReplayLesson}
        onSelectCourse={selectCourse}
        onStartLesson={props.onStartLesson}
      />
    );
  }

  return (
    <section className="course-catalog" aria-labelledby="courses-view-title">
      <RecommendedContinue
        items={items}
        learningPaths={props.learningPaths}
        onStartLesson={props.onStartLesson}
      />

      <header className="course-catalog-heading">
        <div>
          <p className="eyebrow">Course catalog</p>
          <h3 id="courses-view-title">
            {props.courses.length} {props.courses.length === 1 ? "course" : "courses"}
          </h3>
        </div>
      </header>

      <CourseFilters
        categories={props.categories}
        items={items}
        onChange={props.onCatalogQueryChange}
        query={props.catalogQuery}
      />

      <div className="course-result-summary">
        <p aria-live="polite" aria-atomic="true">
          {results.length} {results.length === 1 ? "course" : "courses"} found
        </p>
        <span>{formatSortLabel(props.catalogQuery.sort)}</span>
      </div>

      {results.length === 0 ? (
        <CourseCatalogEmptyState
          categories={props.categories}
          onClear={() =>
            props.onCatalogQueryChange({ ...DEFAULT_COURSE_CATALOG_QUERY })
          }
          query={props.catalogQuery}
        />
      ) : (
        <div className="course-list">
          {visibleResults.map((item) => (
            <CourseRow item={item} key={item.course.id} onSelectCourse={selectCourse} />
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="course-result-window">
          <p>
            Showing {visibleResults.length} of {results.length}{" "}
            {results.length === 1 ? "course" : "courses"}
          </p>
          {visibleResults.length < results.length && (
            <CourseLoadMoreButton
              currentLimit={visibleCount}
              onResultLimitChange={props.onResultLimitChange}
              totalResults={results.length}
            />
          )}
        </div>
      )}
    </section>
  );
}

export function CourseLoadMoreButton({
  currentLimit,
  onResultLimitChange,
  totalResults,
}: {
  currentLimit: number;
  onResultLimitChange(resultLimit: number): void;
  totalResults: number;
}) {
  return (
    <button
      className="secondary-button"
      onClick={() => onResultLimitChange(
        Math.min(currentLimit + DEFAULT_COURSE_RESULT_LIMIT, totalResults),
      )}
      type="button"
    >
      Load more
    </button>
  );
}

function CourseNotFound({
  onSelectCourse,
}: {
  onSelectCourse: CoursesViewProps["onSelectCourse"];
}) {
  return (
    <section className="course-not-found" aria-labelledby="course-not-found-title">
      <button className="course-detail-back" onClick={() => onSelectCourse(null)} type="button">
        <ArrowLeft aria-hidden="true" size={17} />
        All courses
      </button>
      <div>
        <BookOpen aria-hidden="true" size={28} />
        <p className="eyebrow">Unavailable course</p>
        <h3 id="course-not-found-title">Course not found</h3>
        <p>The course may have been removed or replaced. Return to the catalog to continue.</p>
      </div>
    </section>
  );
}

function CourseCatalogEmptyState({
  categories,
  onClear,
  query,
}: {
  categories: CourseCategory[];
  onClear(): void;
  query: CourseCatalogQuery;
}) {
  const category = categories.find((candidate) => candidate.id === query.categoryId);
  const criteria = [
    query.text.trim() ? `Search: “${query.text.trim()}”` : null,
    category?.title ?? (query.categoryId ? `Category: ${query.categoryId}` : null),
    query.cefr ? `CEFR ${query.cefr}` : null,
    query.status ? formatStatus(query.status) : null,
  ].filter((criterion): criterion is string => Boolean(criterion));

  return (
    <section className="course-empty-state" aria-labelledby="course-empty-title">
      <div>
        <p className="eyebrow">No results</p>
        <h3 id="course-empty-title">No courses match your filters</h3>
        <p>Try a broader search or clear the active criteria.</p>
      </div>
      {criteria.length > 0 && (
        <ul aria-label="Active course filters">
          {criteria.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      )}
      <button className="secondary-button" onClick={onClear} type="button">
        <X aria-hidden="true" size={15} />
        Clear filters
      </button>
    </section>
  );
}

function CourseFilters({
  categories,
  items,
  onChange,
  query,
}: {
  categories: CourseCategory[];
  items: CourseCatalogItem[];
  onChange: CoursesViewProps["onCatalogQueryChange"];
  query: CourseCatalogQuery;
}) {
  const orderedCategories = [...categories].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title),
  );
  const categoryCounts = new Map<string, number>();
  for (const item of items) {
    categoryCounts.set(item.category.id, (categoryCounts.get(item.category.id) ?? 0) + 1);
  }
  const hasActiveCriteria = !isDefaultCatalogQuery(query);

  function update(patch: Partial<CourseCatalogQuery>) {
    onChange({ ...query, ...patch });
  }

  return (
    <div className="course-filter-bar">
      <label className="course-search" htmlFor="course-search-input">
        <span>Search courses</span>
        <span className="course-search-control">
          <Search aria-hidden="true" size={17} />
          <input
            id="course-search-input"
            onChange={(event) => update({ text: event.currentTarget.value })}
            placeholder="Title, topic, category, or provider"
            type="search"
            value={query.text}
          />
        </span>
      </label>

      <fieldset className="course-category-filter">
        <legend>Categories</legend>
        <div className="course-category-options">
          <button
            aria-pressed={query.categoryId === null}
            onClick={() => update({ categoryId: null })}
            type="button"
          >
            <span>All</span>
            <strong>{items.length}</strong>
          </button>
          {orderedCategories.map((category) => (
            <button
              aria-pressed={query.categoryId === category.id}
              key={category.id}
              onClick={() => update({ categoryId: category.id })}
              type="button"
            >
              <span>{category.title}</span>
              <strong>{categoryCounts.get(category.id) ?? 0}</strong>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="course-select-filters">
        <label>
          <span>CEFR level</span>
          <select
            onChange={(event) =>
              update({ cefr: (event.currentTarget.value || null) as CefrLevel | null })
            }
            value={query.cefr ?? ""}
          >
            <option value="">All levels</option>
            {(["A1", "A2", "B1", "B2", "C1", "C2"] satisfies CefrLevel[]).map(
              (level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ),
            )}
          </select>
        </label>

        <label>
          <span>Learning status</span>
          <select
            onChange={(event) =>
              update({
                status: (event.currentTarget.value || null) as CourseCatalogQuery["status"],
              })
            }
            value={query.status ?? ""}
          >
            <option value="">All statuses</option>
            <option value="not-started">Not started</option>
            <option value="in-progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </label>

        <label>
          <span>Sort by</span>
          <select
            onChange={(event) =>
              update({ sort: event.currentTarget.value as CourseCatalogQuery["sort"] })
            }
            value={query.sort}
          >
            <option value="recommended">Recommended</option>
            <option value="title">Title A–Z</option>
            <option value="progress">Learning progress</option>
          </select>
        </label>

        {hasActiveCriteria && (
          <button
            className="course-clear-filters"
            onClick={() => onChange({ ...DEFAULT_COURSE_CATALOG_QUERY })}
            type="button"
          >
            <X aria-hidden="true" size={15} />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

function RecommendedContinue({
  items,
  learningPaths,
  onStartLesson,
}: {
  items: CourseCatalogItem[];
  learningPaths: LearningPath[];
  onStartLesson: CoursesViewProps["onStartLesson"];
}) {
  if (learningPaths.length === 0) {
    return null;
  }

  const recommended = items
    .filter(
      (item) => item.recommendationRank !== null && item.progress.status !== "completed",
    )
    .sort(
      (left, right) =>
        (left.recommendationRank ?? Number.MAX_SAFE_INTEGER) -
        (right.recommendationRank ?? Number.MAX_SAFE_INTEGER),
    )[0];

  if (!recommended) {
    return (
      <section className="course-recommendation is-complete">
        <div>
          <p className="eyebrow">Learning paths complete</p>
          <h3>Every recommended course is complete</h3>
          <p>Replay any course below whenever you want another round.</p>
        </div>
      </section>
    );
  }

  const path = learningPaths.find((candidate) => recommended.pathIds.includes(candidate.id));
  const lesson = recommended.course.units
    .flatMap((unit) => unit.lessons)
    .find((candidate) => candidate.id === recommended.progress.recommendedLessonId);

  if (!lesson) {
    return null;
  }

  return (
    <section className="course-recommendation" aria-labelledby="course-recommendation-title">
      <div className="course-recommendation-copy">
        <p className="eyebrow">Continue your path</p>
        <span>{path?.title ?? "Recommended learning path"}</span>
        <h3 id="course-recommendation-title">{recommended.course.title}</h3>
        <p>
          Next lesson: <strong>{lesson.title}</strong>
        </p>
      </div>
      <div className="course-recommendation-progress">
        <ProgressMeter
          label={`${recommended.course.title} progress`}
          passed={recommended.progress.passedCards}
          total={recommended.progress.totalCards}
        />
        <span>
          {recommended.progress.passedCards} of {recommended.progress.totalCards} sentences passed
        </span>
      </div>
      <button
        aria-label={`Continue ${lesson.title}`}
        className="primary-button"
        onClick={() => onStartLesson(recommended.course.id, lesson.id)}
        type="button"
      >
        <Play aria-hidden="true" size={16} />
        Continue
      </button>
    </section>
  );
}

function CourseDetail({
  cards,
  item,
  onReplayCourse,
  onReplayLesson,
  onSelectCourse,
  onStartLesson,
}: {
  cards: SentenceCard[];
  item: CourseCatalogItem;
  onReplayCourse: CoursesViewProps["onReplayCourse"];
  onReplayLesson: CoursesViewProps["onReplayLesson"];
  onSelectCourse: CoursesViewProps["onSelectCourse"];
  onStartLesson: CoursesViewProps["onStartLesson"];
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const recommendedLessonId = item.progress.recommendedLessonId;
  const allLessons = item.course.units.flatMap((unit) => unit.lessons);
  const primaryLesson =
    allLessons.find((lesson) => lesson.id === recommendedLessonId) ?? allLessons[0];
  const recommendedUnit = item.course.units.find((unit) =>
    unit.lessons.some((lesson) => lesson.id === recommendedLessonId),
  );
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(
    () => new Set([recommendedUnit?.id ?? item.course.units[0]?.id].filter(Boolean) as string[]),
  );
  const cardById = new Map(cards.map((card) => [card.id, card]));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  function toggleUnit(unitId: string) {
    setExpandedUnitIds((current) => {
      const next = new Set(current);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }

  return (
    <section className="course-detail" aria-labelledby="course-detail-title">
      <button className="course-detail-back" onClick={() => onSelectCourse(null)} type="button">
        <ArrowLeft aria-hidden="true" size={17} />
        All courses
      </button>

      <header className="course-detail-header">
        <div className="course-detail-copy">
          <p className="eyebrow">
            {item.category.title} · {item.course.level.label}
          </p>
          <h3 id="course-detail-title" ref={headingRef} tabIndex={-1}>
            {item.course.title}
          </h3>
          <p>{item.course.description}</p>
          <div className="course-detail-meta" aria-label={`${item.course.title} details`}>
            <span>{item.course.provider.name}</span>
            <span>
              {item.unitCount} {item.unitCount === 1 ? "unit" : "units"}
            </span>
            <span>
              {item.lessonCount} {item.lessonCount === 1 ? "lesson" : "lessons"}
            </span>
            <span>
              {item.cardCount} {item.cardCount === 1 ? "sentence" : "sentences"}
            </span>
          </div>
        </div>

        <div className="course-detail-progress">
          <div>
            <span>{formatStatus(item.progress.status)}</span>
            <strong>{progressPercentage(item)}%</strong>
          </div>
          <ProgressMeter
            label={`${item.course.title} progress`}
            passed={item.progress.passedCards}
            total={item.progress.totalCards}
          />
          <p>
            {item.progress.passedCards} of {item.progress.totalCards} sentences passed
          </p>
          {primaryLesson && (
            <CoursePrimaryAction
              item={item}
              lesson={primaryLesson}
              onReplayCourse={onReplayCourse}
              onStartLesson={onStartLesson}
            />
          )}
        </div>
      </header>

      <div className="course-license">
        <ShieldCheck aria-hidden="true" size={18} />
        <div>
          <strong>Content license</strong>
          <a href={item.course.license.url} rel="noreferrer" target="_blank">
            {item.course.license.name}
            <ExternalLink aria-hidden="true" size={13} />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <span>{item.course.license.attribution}</span>
        </div>
      </div>

      <div className="course-outline">
        <div className="course-outline-heading">
          <div>
            <p className="eyebrow">Course outline</p>
            <h3>Units and lessons</h3>
          </div>
          <span>{item.lessonCount} lessons</span>
        </div>

        {item.course.units.map((unit, unitIndex) => {
          const unitProgress = item.progress.units.find((progress) => progress.unitId === unit.id);
          const isExpanded = expandedUnitIds.has(unit.id);
          const panelId = `course-unit-panel-${unit.id}`;
          const controlId = `course-unit-control-${unit.id}`;

          return (
            <section className="course-unit" key={unit.id}>
              <h4>
                <button
                  aria-controls={panelId}
                  aria-expanded={isExpanded}
                  className="course-unit-toggle"
                  id={controlId}
                  onClick={() => toggleUnit(unit.id)}
                  type="button"
                >
                  <span className="course-unit-index">{String(unitIndex + 1).padStart(2, "0")}</span>
                  <span className="course-unit-title">
                    <strong>{unit.title}</strong>
                    <span>{unit.description}</span>
                  </span>
                  {unitProgress && (
                    <span className="course-unit-progress">
                      {unitProgress.passedCards} / {unitProgress.totalCards} passed
                    </span>
                  )}
                  <ChevronDown aria-hidden="true" size={18} />
                </button>
              </h4>

              {isExpanded && (
                <div
                  aria-labelledby={controlId}
                  className="course-lesson-list"
                  id={panelId}
                  role="region"
                >
                  {unit.lessons.map((lesson, lessonIndex) => {
                    const lessonProgress = unitProgress?.lessons.find(
                      (progress) => progress.lessonId === lesson.id,
                    );

                    if (!lessonProgress) {
                      return null;
                    }

                    return (
                      <LessonRow
                        cardById={cardById}
                        courseId={item.course.id}
                        key={lesson.id}
                        lesson={lesson}
                        lessonIndex={lessonIndex}
                        onReplayLesson={onReplayLesson}
                        onStartLesson={onStartLesson}
                        progress={lessonProgress}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function CoursePrimaryAction({
  item,
  lesson,
  onReplayCourse,
  onStartLesson,
}: {
  item: CourseCatalogItem;
  lesson: CourseLesson;
  onReplayCourse: CoursesViewProps["onReplayCourse"];
  onStartLesson: CoursesViewProps["onStartLesson"];
}) {
  if (item.progress.status === "completed") {
    return (
      <CourseReplayButton
        courseId={item.course.id}
        courseTitle={item.course.title}
        onReplayCourse={onReplayCourse}
      />
    );
  }

  const label = item.progress.status === "in-progress" ? "Continue course" : "Start course";

  return (
    <button
      className="primary-button"
      onClick={() => onStartLesson(item.course.id, lesson.id)}
      type="button"
    >
      <Play aria-hidden="true" size={16} />
      {label}
    </button>
  );
}

export function CourseReplayButton({
  courseId,
  courseTitle,
  onReplayCourse,
}: {
  courseId: CourseId;
  courseTitle: string;
  onReplayCourse: CoursesViewProps["onReplayCourse"];
}) {
  return (
    <button
      aria-label={`Replay full course ${courseTitle}`}
      className="secondary-button"
      onClick={() => onReplayCourse(courseId)}
      type="button"
    >
      <RotateCcw aria-hidden="true" size={16} />
      Replay course
    </button>
  );
}

function LessonRow({
  cardById,
  courseId,
  lesson,
  lessonIndex,
  onReplayLesson,
  onStartLesson,
  progress,
}: {
  cardById: ReadonlyMap<string, SentenceCard>;
  courseId: CourseId;
  lesson: CourseLesson;
  lessonIndex: number;
  onReplayLesson: CoursesViewProps["onReplayLesson"];
  onStartLesson: CoursesViewProps["onStartLesson"];
  progress: CourseCatalogItem["progress"]["units"][number]["lessons"][number];
}) {
  const source = sourceForLesson(lesson, cardById);

  return (
    <article className="course-lesson-row">
      <div className="course-lesson-copy">
        <p className="eyebrow">Lesson {lessonIndex + 1}</p>
        <h5>{lesson.title}</h5>
        <p>{lesson.objective}</p>
        <div className="course-lesson-source">
          <BookOpen aria-hidden="true" size={14} />
          {source.url ? (
            <a href={source.url} rel="noreferrer" target="_blank">
              {source.label}
              <ExternalLink aria-hidden="true" size={12} />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span>{source.label}</span>
          )}
        </div>
      </div>

      <div className="course-lesson-progress">
        <strong>{formatStatus(progress.status)}</strong>
        <span>
          {progress.passedCards} of {progress.totalCards} sentences passed
        </span>
      </div>

      <LessonAction
        courseId={courseId}
        lesson={lesson}
        onReplayLesson={onReplayLesson}
        onStartLesson={onStartLesson}
        progress={progress}
      />
    </article>
  );
}

function LessonAction({
  courseId,
  lesson,
  onReplayLesson,
  onStartLesson,
  progress,
}: {
  courseId: CourseId;
  lesson: CourseLesson;
  onReplayLesson: CoursesViewProps["onReplayLesson"];
  onStartLesson: CoursesViewProps["onStartLesson"];
  progress: CourseCatalogItem["progress"]["units"][number]["lessons"][number];
}) {
  if (progress.status === "completed") {
    return (
      <button
        aria-label={`Replay ${lesson.title}`}
        className="secondary-button"
        onClick={() => onReplayLesson(courseId, lesson.id)}
        type="button"
      >
        <RotateCcw aria-hidden="true" size={16} />
        Replay lesson
      </button>
    );
  }

  const label = progress.status === "in-progress" ? "Continue lesson" : "Start lesson";

  return (
    <button
      aria-label={`${label} ${lesson.title}`}
      className="primary-button"
      onClick={() => onStartLesson(courseId, lesson.id)}
      type="button"
    >
      <Play aria-hidden="true" size={16} />
      {label}
    </button>
  );
}

function sourceForLesson(
  lesson: CourseLesson,
  cardById: ReadonlyMap<string, SentenceCard>,
): { label: string; url?: string } {
  const lessonCards = lesson.cardIds
    .map((cardId) => cardById.get(cardId))
    .filter((card): card is SentenceCard => Boolean(card));
  const sources = [...new Set(lessonCards.map((card) => card.source))];
  const label =
    sources.length > 1
      ? `${sources[0]} + ${sources.length - 1} sources`
      : sources[0] ?? "Source unavailable";

  return {
    label,
    url: lesson.sourceUrl ?? lessonCards.find((card) => card.sourceUrl)?.sourceUrl,
  };
}

function CourseRow({
  item,
  onSelectCourse,
}: {
  item: CourseCatalogItem;
  onSelectCourse: CoursesViewProps["onSelectCourse"];
}) {
  const percentage = progressPercentage(item);

  return (
    <article className="course-row">
      <div className="course-row-content">
        <p className="eyebrow">
          {item.category.title} · {item.course.level.label}
        </p>
        <h3>{item.course.title}</h3>
        <p className="course-row-description">{item.course.description}</p>
        <p className="course-row-provider">Provider: {item.course.provider.name}</p>
      </div>

      <div className="course-row-progress">
        <div>
          <strong>{formatStatus(item.progress.status)}</strong>
          <span>{percentage}%</span>
        </div>
        <ProgressMeter
          label={`${item.course.title} progress`}
          passed={item.progress.passedCards}
          total={item.progress.totalCards}
        />
        <p>
          {item.unitCount} {item.unitCount === 1 ? "unit" : "units"} · {item.lessonCount}{" "}
          {item.lessonCount === 1 ? "lesson" : "lessons"} · {item.cardCount}{" "}
          {item.cardCount === 1 ? "sentence" : "sentences"}
        </p>
      </div>

      <button
        aria-label={`View course ${item.course.title}`}
        className="secondary-button course-row-action"
        id={courseViewButtonId(item.course.id)}
        onClick={() => onSelectCourse(item.course.id)}
        type="button"
      >
        <Eye aria-hidden="true" size={16} />
        View course
      </button>
    </article>
  );
}

function ProgressMeter({ label, passed, total }: { label: string; passed: number; total: number }) {
  const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;

  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percentage}
      aria-valuetext={`${percentage}% · ${passed} of ${total} sentences passed`}
      className="course-progress-track"
      role="progressbar"
    >
      <span style={{ width: `${percentage}%` }} />
    </div>
  );
}

function progressPercentage(item: CourseCatalogItem): number {
  return item.progress.totalCards > 0
    ? Math.round((item.progress.passedCards / item.progress.totalCards) * 100)
    : 0;
}

function isDefaultCatalogQuery(query: CourseCatalogQuery): boolean {
  return (
    query.text.trim() === "" &&
    query.categoryId === null &&
    query.cefr === null &&
    query.status === null &&
    query.sort === DEFAULT_COURSE_CATALOG_QUERY.sort
  );
}

function courseViewButtonId(courseId: CourseId): string {
  return `course-view-${courseId}`;
}

function formatSortLabel(sort: CourseCatalogQuery["sort"]): string {
  if (sort === "title") {
    return "Sorted by title";
  }

  if (sort === "progress") {
    return "Sorted by progress";
  }

  return "Recommended order";
}

function formatStatus(status: "not-started" | "in-progress" | "completed"): string {
  if (status === "not-started") {
    return "Not started";
  }

  if (status === "in-progress") {
    return "In progress";
  }

  return "Completed";
}

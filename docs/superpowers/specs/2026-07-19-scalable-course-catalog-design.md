# UtterLoop Scalable Course Catalog Design

Date: 2026-07-19
Status: Approved in conversation; remaining decisions delegated to the recommended defaults

## Goal

Replace the current fully expanded Courses page with a scalable, searchable catalog that remains useful with 20–100 courses. A learner first scans and filters concise course summaries, then opens one course to see its outline, sources, license, progress, and lesson actions.

The practice, review, and progress rules remain unchanged.

## Product Decisions

- Use a two-level `Course catalog -> Course detail` information architecture.
- The catalog is built from every stored Course, not only Courses referenced by a LearningPath.
- LearningPath remains a recommendation and ordering signal; it does not own Course visibility.
- A Course has one stable primary category and multiple searchable tags.
- Search and filters are local, immediate, and derived. Query state is never persisted as learning data.
- Catalog and detail state is represented in URL query parameters with the browser History API. No routing dependency is added.
- The initial result window is 24 Courses. `Load more` reveals another 24. Virtualization and server-side search are deferred until the catalog reaches a much larger scale.

## Domain Model

### Course Category

Categories are catalog data with stable identifiers. They are imported, exported, validated, and persisted alongside Courses.

```ts
interface CourseCategory {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
}
```

The default catalog begins with:

1. `everyday-communication` — Starter Foundations and Everyday English with VOA.
2. `work-study` — Work & Study Essentials.

Future imported catalogs may add categories. The application does not include a visual category editor.

### Course Discovery Metadata

```ts
type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

interface CourseLevel {
  label: string;
  cefrFrom: CefrLevel;
  cefrTo: CefrLevel;
}

interface CourseProvider {
  kind: "original" | "curated" | "imported";
  name: string;
  url?: string;
}

interface Course {
  // existing identity, description, revision, license, and units
  categoryId: string;
  tags: string[];
  level: CourseLevel;
  provider: CourseProvider;
}
```

`categoryId` provides stable grouping. `tags` represent overlapping topics, situations, and skills. Provider identifies who produced or curated the content; it is separate from License, which describes reuse rights.

A CEFR selection matches a Course when the selected level falls inside the inclusive `cefrFrom..cefrTo` range. The human-readable label remains available on cards and details.

### Validation

Catalog validation adds these rules:

- Category IDs are unique and required; title and description are non-empty; `sortOrder` is a non-negative integer.
- Every Course references an existing Category.
- Course tags are trimmed, non-empty, and unique case-insensitively.
- Course revision is a positive integer.
- `cefrFrom` and `cefrTo` are known CEFR values and `from <= to`.
- Provider kind and name are valid; a supplied provider URL is non-empty.
- Existing Course, Unit, Lesson, Card, path-reference, license, and provenance rules continue to apply.

## Catalog Projection And Query

The domain exposes a derived `CourseCatalogItem` instead of storing duplicated counts or percentages:

```ts
interface CourseCatalogItem {
  course: Course;
  category: CourseCategory;
  progress: CourseProgress;
  pathIds: string[];
  unitCount: number;
  lessonCount: number;
  cardCount: number;
  recommendationRank: number | null;
}
```

`buildCourseCatalogItems` iterates the complete Course collection exactly once, attaches path membership and progress, and never duplicates a Course that appears in multiple LearningPaths. A standalone Course receives an empty `pathIds` array and remains visible.

`queryCourseCatalog` is a pure function with:

- normalized text search over title, description, Category title, tags, level label, and Provider name;
- optional Category, CEFR, and progress-status filters;
- AND semantics between filter groups;
- stable sorting by recommended path order, title A–Z, or learning progress;
- deterministic ID fallback for equal sort values.

Text normalization ignores case, leading/trailing whitespace, repeated whitespace, and Unicode diacritics. It does not scan SentenceCard text, so query cost follows the Course count rather than the Card count.

Progress sort puts in-progress Courses first, ordered by highest passed ratio, followed by not-started and completed Courses. Recommended sort follows LearningPath order, then Category order, title, and ID; standalone Courses appear after path Courses.

## Catalog View

The current all-expanded path/course/unit/lesson tree is replaced by a dense supporting view.

### Recommended Continue Block

The top block presents the first incomplete recommendation from the first LearningPath that still has unfinished work. It shows path, Course, next Lesson, and progress, with one `Continue` action that starts the recommended Lesson. When every path is complete, it shows a completion state without fabricating a recommendation.

### Search And Filters

The filter surface contains:

- a visibly labelled search input;
- rectangular `All` and Category buttons with `aria-pressed` and Course counts;
- CEFR and learning-status selects;
- a sort select for Recommended, Title, and Progress;
- an `aria-live="polite"` result count;
- a `Clear filters` action when any non-default criterion is active.

Changing any search or filter criterion resets the visible result limit to 24. An empty result shows the active criteria and a clear action.

### Course Rows

The catalog uses flat block rows rather than large marketing cards or nested panels.

Each row displays only:

- primary Category and CEFR label;
- title and a description clamped to two lines;
- progress status and percentage;
- Unit, Lesson, and Sentence counts;
- Provider name;
- a single explicit `View course` button.

The row itself is not clickable because a clickable row containing another action creates conflicting keyboard and pointer semantics. The recommended Continue action lives in the dedicated top block and Course detail, not in every catalog row.

Desktop rows use `content | progress | action`. Tablet rows use two columns. Mobile rows use one column with a full-width action. Repeated rows are flat by default and gain a dark border and restrained hard shadow on hover.

## Course Detail

Opening a Course replaces the catalog inside the Courses workspace; it is not a modal or desktop-only master/detail panel.

- `All courses` is the first visible and keyboard-focusable action.
- The detail heading receives focus after navigation.
- The header shows Category, Provider, CEFR, Course description, progress, Unit/Lesson/Sentence counts, and the primary Start/Continue/Replay action.
- License attribution and source links appear in detail, not in every catalog row.
- Unit sections use accessible disclosure buttons with `aria-expanded` and `aria-controls`.
- The Unit containing the recommended incomplete Lesson is expanded initially; otherwise the first Unit is expanded.
- Lesson rows show objective, status, passed count, source, and Start/Continue/Replay.
- Returning restores the previous catalog query, filters, visible result count, scroll position, and focus to the Course's `View course` button.

Invalid or removed Course IDs render a recoverable `Course not found` state with an `All courses` action. They never produce an empty practice scope.

## URL And Browser History

The catalog uses query parameters that work under GitHub Pages repository subpaths:

```text
?view=courses&q=work&category=work-study&cefr=B1&status=in-progress&sort=progress
?view=courses&course=work-study-essentials
```

Filter changes replace the current history entry to avoid one history item per keystroke. Opening a Course pushes a detail entry. Browser Back returns to the previous catalog state. A copied detail URL opens Courses directly after refresh. Explicit `All courses` uses Back only for an UtterLoop-created detail entry; direct deep links are replaced with the catalog URL instead of leaving the application.

No Router dependency is introduced. URL parsing and serialization are pure, tested functions. App navigation updates `view`, removes a stale `course` parameter when leaving Courses, and retains catalog filters so returning through the sidebar restores the learner's discovery context.

## Persistence And Default Data

IndexedDB advances to schema version 2 and adds `courseCategories`. The Course table gains `categoryId` and multi-entry `tags` indexes. ReviewState and PracticeLog tables are unchanged, so learning progress is preserved.

Default Course revisions advance so existing default records receive Category, tags, structured level, and Provider metadata. Default installation remains idempotent and installs missing Categories atomically with paths, Courses, and Cards.

Course bundles add Categories and a schema version. The new import shape is:

```ts
interface CourseBundle {
  schemaVersion: 2;
  categories: CourseCategory[];
  learningPaths: LearningPath[];
  courses: Course[];
  cards: SentenceCard[];
}
```

Older bundle shapes are rejected with a clear validation message; compatibility is not required. Export always emits schema version 2.

## Component Boundaries

- Domain: Category and discovery metadata, catalog validation, catalog-item projection, pure query/filter/sort rules.
- Application: snapshots include Categories; default installation and bundle import/export coordinate complete catalogs.
- Infrastructure: Dexie schema v2 and atomic Category persistence.
- Presentation: `CoursesView` owns catalog/detail UI state; focused components render the recommended block, filter bar, Course rows, detail header, Unit disclosures, and Lesson rows. URL state helpers remain separate and pure.

The new CSS uses semantic selectors such as `.course-catalog`, `.course-filter-bar`, `.course-list`, `.course-row`, `.course-detail`, and `.course-outline`. It removes the Course page's dependence on deep `.page-stack > .page-stack` selectors while retaining the established graphite, white, mint, yellow, coral, and blue design tokens.

## Accessibility And Error Handling

- Every filter has a visible label or fieldset legend.
- Search results are announced politely without moving focus.
- Category controls expose selected state.
- Detail navigation restores focus and offers a visible button; Escape is optional and never the only exit.
- Unit disclosures use native buttons, stable controls IDs, and visible focus.
- Progress indicators expose percent plus passed/total text.
- Empty, invalid-detail, loading, and storage-error states provide a clear recovery action.
- External source and license links indicate that they open a new tab.
- Existing 44px control targets and reduced-motion rules remain in force.

## TDD And Verification

Domain tests are written and observed failing before implementation for:

- Category and metadata validation failures;
- standalone and multi-path Course projection without omission or duplication;
- text normalization and search-field coverage;
- Category, CEFR, and status filter combinations;
- recommended/title/progress sorting and stable ties.

Application/infrastructure tests cover default Category installation, revision updates, snapshot Categories, schema-complete bundle validation, and atomic persistence contracts.

Presentation tests cover catalog-only initial output, detail-only outline/license output, URL parse/serialize, load-more calculation, recommendation copy, and recoverable empty/not-found states. Browser verification covers search, combined filters, clear, open detail, Unit disclosure, browser Back, refresh/deep link, focus restoration, and responsive layouts at 375px, 768px, 1024px, and 1440px.

Required final checks:

- `npm run typecheck`
- `npm test`
- `npm run build`
- local browser console inspection and HTTP service check

## Non-Goals

- Course authoring or Category-management UI.
- Backend search, remote discovery, enrollment, prerequisites, or recommendations based on analytics.
- Virtualized lists, infinite scrolling, or search indexing for thousands of Courses.
- A new routing framework.
- Compatibility with the previous Course bundle shape or the pre-Course IndexedDB database.

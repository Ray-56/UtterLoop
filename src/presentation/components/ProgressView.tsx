import { Activity, BookOpenCheck, CalendarClock, Flame, Target } from "lucide-react";
import type {
  BetaReadinessSnapshot,
  EvidenceCoverage,
  RateMeasure,
} from "../../application/beta-readiness/BetaReadiness";
import type {
  CourseCoverage,
  MasteryDistribution,
  ProgressDashboard,
  ProgressTrendDay,
  WeakCard,
} from "../../domain/progress/deriveProgressDashboard";

export interface ProgressRecentActivityMetadata {
  limit: number;
  totalEntries: number;
  isTruncated: boolean;
}

interface ProgressViewProps {
  dashboard: ProgressDashboard | null;
  betaReadiness?: BetaReadinessSnapshot | null;
  recentActivity?: ProgressRecentActivityMetadata | null;
  onPracticeWeakCard?: (cardId: string) => void;
}

const MASTERY_GROUPS: ReadonlyArray<{
  key: keyof MasteryDistribution;
  label: string;
}> = [
  { key: "untouched", label: "Untouched" },
  { key: "acquiring", label: "Acquiring" },
  { key: "stage0FocusedReview", label: "Stage 0 focused review" },
  { key: "stage1", label: "Stage 1" },
  { key: "stage2", label: "Stage 2" },
  { key: "stage3", label: "Stage 3" },
  { key: "stage4", label: "Stage 4" },
  { key: "stage5", label: "Stage 5" },
  { key: "stage6", label: "Stage 6" },
  { key: "mastered", label: "Mastered" },
];

export function ProgressView({
  dashboard,
  betaReadiness,
  recentActivity,
  onPracticeWeakCard,
}: ProgressViewProps) {
  if (!dashboard) {
    return (
      <section className="progress-loading" aria-busy="true" aria-live="polite">
        <Activity aria-hidden="true" size={22} />
        <div>
          <p className="eyebrow">Preparing your progress</p>
          <h2>Reading your complete local learning history</h2>
        </div>
      </section>
    );
  }

  const accuracy = dashboard.overview.independentAccuracy;

  return (
    <section className="page-stack progress-view" aria-labelledby="progress-title">
      <header className="progress-heading">
        <div>
          <p className="eyebrow">Progress</p>
          <h2 id="progress-title">Recall growth, without the guesswork</h2>
        </div>
        <p>
          Retention dates use <strong>{dashboard.timeZone}</strong>. Coverage records First Pass and
          does not fall after a lapse.
        </p>
      </header>

      {dashboard.integrityWarnings.length > 0 && (
        <aside className="progress-integrity" role="alert" aria-labelledby="integrity-title">
          <div>
            <p className="eyebrow">Data needs attention</p>
            <h3 id="integrity-title">Some retention records are incomplete</h3>
          </div>
          <ul>
            {dashboard.integrityWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </aside>
      )}

      <section className="progress-section" aria-labelledby="progress-overview-title">
        <SectionHeading
          eyebrow="At a glance"
          id="progress-overview-title"
          title="Overview"
          description="First Pass coverage and current recall health are separate signals."
        />
        <div className="progress-overview-grid">
          <OverviewMetric
            icon={BookOpenCheck}
            label="First Pass coverage"
            value={`${dashboard.overview.firstPassed} / ${dashboard.overview.totalCards}`}
            note="sentences first passed"
          />
          <OverviewMetric
            icon={CalendarClock}
            label="Due now"
            value={dashboard.overview.dueNow.toLocaleString()}
            note="ready for review"
          />
          <OverviewMetric
            icon={Target}
            label="Independent accuracy"
            value={accuracy == null ? "Not measured yet" : formatPercent(accuracy)}
            note="retrieval checks only"
          />
          <OverviewMetric
            icon={Flame}
            label="Current streak"
            value={`${dashboard.overview.currentStreak} ${dashboard.overview.currentStreak === 1 ? "day" : "days"}`}
            note={dashboard.timeZone}
          />
        </div>
        {!dashboard.hasPracticeData && (
          <p className="progress-zero-state">
            <strong>Your first recall check will start retention history.</strong>
            Practice a sentence independently to measure accuracy and begin the 14-day trend.
          </p>
        )}
      </section>

      {betaReadiness && <BetaReadinessPanel snapshot={betaReadiness} />}

      <section className="progress-section" aria-labelledby="coverage-title">
        <SectionHeading
          eyebrow="Acquisition"
          id="coverage-title"
          title="Learning path coverage"
          description="These stable counts come from First Pass evidence, not the review schedule."
        />
        {dashboard.coverage.paths.length > 0 ? (
          <div className="progress-coverage-list">
            {dashboard.coverage.paths.map((path) => (
              <details className="progress-coverage-path" key={path.id} open>
                <summary>
                  <span>{path.title}</span>
                  <CoverageValue passed={path.passedCards} total={path.totalCards} />
                </summary>
                <div className="progress-coverage-courses">
                  {path.courses.map((course) => <CourseCoverageBlock course={course} key={course.id} />)}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="progress-empty-copy">No learning path is installed yet.</p>
        )}

        {dashboard.coverage.courses.length > 0 && (
          <div className="progress-course-index" aria-label="All course coverage">
            <h3>All courses</h3>
            {dashboard.coverage.courses.map((course) => (
              <div key={course.id}>
                <span>{course.title}</span>
                <CoverageValue passed={course.passedCards} total={course.totalCards} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="progress-section" aria-labelledby="retention-title">
        <SectionHeading
          eyebrow="Memory"
          id="retention-title"
          title="Retention health"
          description="Current stages, complete-history outcomes, and the last 14 local calendar days."
        />

        <div className="progress-retention-grid">
          <section className="progress-subpanel" aria-labelledby="distribution-title">
            <div className="progress-subpanel-heading">
              <h3 id="distribution-title">Mastery distribution</h3>
              <span>{dashboard.overview.totalCards} cards</span>
            </div>
            <div className="mastery-distribution">
              {MASTERY_GROUPS.map(({ key, label }) => {
                const value = dashboard.retention.masteryDistribution[key];
                return (
                  <div className="mastery-row" key={key}>
                    <span>{label}</span>
                    <div
                      className="progress-value-track"
                      aria-label={`${label}: ${value} of ${dashboard.overview.totalCards} cards`}
                    >
                      <span style={{ width: ratioWidth(value, dashboard.overview.totalCards) }} />
                    </div>
                    <strong>{value}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="progress-subpanel" aria-labelledby="history-title">
            <div className="progress-subpanel-heading">
              <div>
                <p className="eyebrow">All local history</p>
                <h3 id="history-title">Recall outcomes</h3>
              </div>
              <span>{recentActivityLabel(recentActivity, dashboard.retention.allTime.totalEvents)}</span>
            </div>
            <dl className="all-time-statistics">
              <Statistic label="Retrieval checks" value={dashboard.retention.allTime.retrievalChecks} />
              <Statistic label="Perfect recalls" value={dashboard.retention.allTime.perfectRecallCount} />
              <Statistic label="Close recalls" value={dashboard.retention.allTime.closeCount} />
              <Statistic label="Retries" value={dashboard.retention.allTime.retryCount} />
              <Statistic label="Corrections completed" value={dashboard.retention.allTime.correctionsCompleted} />
              <Statistic label="Reveals" value={dashboard.retention.allTime.revealCount} />
              <Statistic label="Skips" value={dashboard.retention.allTime.skipCount} />
              <Statistic label="Longest streak" value={`${dashboard.retention.longestStreak} days`} />
            </dl>
          </section>
        </div>

        <section className="progress-trend" aria-labelledby="trend-title">
          <div className="progress-subpanel-heading">
            <div>
              <h3 id="trend-title">14-day trend</h3>
              <p>Calendar days in {dashboard.timeZone}; every value is available without hover.</p>
            </div>
          </div>
          <ol className="progress-trend-list">
            {dashboard.retention.trend.map((day) => <TrendDay day={day} key={day.date} />)}
          </ol>
        </section>
      </section>

      <section className="progress-section" aria-labelledby="attention-title">
        <SectionHeading
          eyebrow="Focused review"
          id="attention-title"
          title="Needs attention"
          description="Prompts stay target-free so the next recall remains meaningful."
        />
        {dashboard.needsAttention.isEmpty ? (
          <p className="progress-empty-copy">
            No weak cards right now. A card appears here after lapses or repeated non-perfect retrieval checks.
          </p>
        ) : (
          <ul className="weak-card-list">
            {dashboard.needsAttention.weakCards.map((card) => (
              <WeakCardRow card={card} key={card.cardId} onPractice={onPracticeWeakCard} timeZone={dashboard.timeZone} />
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function BetaReadinessPanel({ snapshot }: { snapshot: BetaReadinessSnapshot }) {
  const weekly = snapshot.retention.weeklyRetainedIndependentSentences;
  const dueCompletion = snapshot.retention.dueReviewCompletion;
  const { nextDay, day7, day30 } = snapshot.retention.cohorts;
  const activeDays = snapshot.habit.activePracticeDays;
  const sessions = snapshot.habit.sessions;
  const strictCoverage = weekly.coverage;

  return (
    <section className="progress-section beta-readiness" aria-labelledby="beta-readiness-title">
      <SectionHeading
        eyebrow="Learning evidence"
        id="beta-readiness-title"
        title="Recall beyond the first pass"
        description="Local evidence only. Assisted, retried, voluntary, and not-yet-due attempts do not inflate retention."
      />

      <div className="beta-readiness-grid">
        <BetaMetric
          label="Weekly retained independent sentences"
          value={rateCountValue(weekly)}
          note={rateCountNote(weekly, "eligible sentences")}
        />
        <BetaMetric
          label="Due Review completion"
          value={rateValue(dueCompletion)}
          note={rateNote(dueCompletion, "occurrences")}
        />
        <BetaMetric
          label="Next-day recall"
          value={rateValue(nextDay)}
          note={rateNote(nextDay, "sentences")}
        />
        <BetaMetric
          label="7-day recall"
          value={rateValue(day7)}
          note={rateNote(day7, "sentences")}
        />
        <BetaMetric
          label="30-day recall"
          value={rateValue(day30)}
          note={rateNote(day30, "sentences")}
        />
        <BetaMetric
          label="Active practice days"
          value={activeDays.numerator.toLocaleString()}
          note={`${activeDays.numerator.toLocaleString()} of ${activeDays.denominator.toLocaleString()} days`}
        />
        <BetaMetric
          label="Due backlog"
          value={snapshot.retention.dueBacklog.count.toLocaleString()}
          note="non-mastered sentences due now"
        />
      </div>

      <details className="beta-inspector">
        <summary>
          <span>
            <strong>Beta Inspector</strong>
            <small>Local instrumentation and evidence coverage</small>
          </span>
          <span aria-hidden="true">Open diagnostics</span>
        </summary>
        <div className="beta-inspector-body">
          <section aria-labelledby="beta-session-title">
            <h3 id="beta-session-title">Session outcomes</h3>
            <p>
              {sessions.completed.toLocaleString()} completed · {sessions.abandoned.toLocaleString()} abandoned ·{" "}
              {sessions.presumedAbandoned.toLocaleString()} inferred
            </p>
            <dl className="beta-diagnostic-list">
              <Statistic label="Completion" value={rateNote(sessions.completion, "engaged sessions")} />
              <Statistic label="Interrupted" value={sessions.interrupted} />
              <Statistic label="Invalidated" value={sessions.invalidated} />
              <Statistic label="Quick Start completed" value={snapshot.activation.quickStartDisposition.completed} />
              <Statistic label="Quick Start dismissed" value={snapshot.activation.quickStartDisposition.dismissed} />
            </dl>
          </section>

          <section aria-labelledby="beta-acquisition-title">
            <h3 id="beta-acquisition-title">Acquisition diagnostics</h3>
            <dl className="beta-diagnostic-list">
              <Statistic
                label="First engaged session"
                value={rateNote(snapshot.activation.firstEngagedSessionCompletion, "sessions")}
              />
              <Statistic
                label="Median time to First Pass"
                value={durationLabel(
                  snapshot.activation.timeToFirstPass.medianMs,
                  snapshot.activation.timeToFirstPass.availability.status,
                )}
              />
              <Statistic
                label="Same-round First Pass"
                value={rateNote(snapshot.acquisition.sameRoundIndependentFirstPass, "sentences")}
              />
              <Statistic
                label="Reveal before First Pass"
                value={rateNote(snapshot.acquisition.revealBeforeFirstPass, "sentences")}
              />
              <Statistic
                label="Skip before First Pass"
                value={rateNote(snapshot.acquisition.skipBeforeFirstPass, "sentences")}
              />
              <Statistic
                label="Requeue cap"
                value={`${snapshot.acquisition.requeueCap.cardRoundPairs} card-round pairs · ${snapshot.acquisition.requeueCap.repeatedCards} repeated cards`}
              />
            </dl>
            <p className="beta-support-distribution">
              Highest Recall Support before First Pass ·{" "}
              {Object.entries(snapshot.acquisition.highestSupportBeforeFirstPass.levels)
                .map(([level, count]) => `L${level}: ${count}`)
                .join(" · ")}
            </p>
          </section>

          <section className="beta-evidence-coverage" aria-labelledby="beta-coverage-title">
            <h3 id="beta-coverage-title">Evidence coverage</h3>
            <p>
              {strictCoverage.contextBearingRows.toLocaleString()} of {strictCoverage.eligibleRows.toLocaleString()} eligible rows carry complete context ·{" "}
              {strictCoverage.excludedLegacyRows.toLocaleString()} legacy rows excluded ·{" "}
              {strictCoverage.excludedPreContextRows.toLocaleString()} pre-context rows excluded
            </p>
            <p>
              {strictCoverage.measurementEpoch
                ? `Instrumentation started ${formatEvidenceDate(strictCoverage.measurementEpoch, snapshot.timeZone)}`
                : "Instrumentation epoch is not available yet."}
              {strictCoverage.containsInferred ? " · Includes inferred abandonment." : ""}
            </p>
            <dl className="beta-coverage-list">
              <CoverageDiagnostic
                coverage={weekly.coverage}
                label="Weekly retained coverage"
              />
              <CoverageDiagnostic
                coverage={dueCompletion.coverage}
                label="Due Review completion coverage"
              />
              <CoverageDiagnostic
                coverage={nextDay.coverage}
                label="Next-day cohort coverage"
              />
              <CoverageDiagnostic
                coverage={day7.coverage}
                label="7-day cohort coverage"
              />
              <CoverageDiagnostic
                coverage={day30.coverage}
                label="30-day cohort coverage"
              />
            </dl>
          </section>
        </div>
      </details>
    </section>
  );
}

function CoverageDiagnostic({
  coverage,
  label,
}: {
  coverage: EvidenceCoverage;
  label: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {coverage.contextBearingRows.toLocaleString()} / {coverage.eligibleRows.toLocaleString()} contextual ·{" "}
        {coverage.excludedLegacyRows.toLocaleString()} legacy ·{" "}
        {coverage.excludedPreContextRows.toLocaleString()} pre-context
      </dd>
    </div>
  );
}

function BetaMetric({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <article className="beta-readiness-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function rateCountValue(measure: RateMeasure): string {
  return measure.availability.status === "available"
    ? measure.numerator.toLocaleString()
    : "Not available";
}

function rateCountNote(measure: RateMeasure, noun: string): string {
  if (measure.availability.status === "unavailable") {
    return unavailableReason(measure.availability.reason);
  }
  return `${measure.numerator.toLocaleString()} of ${measure.denominator.toLocaleString()} ${noun}`;
}

function rateValue(measure: RateMeasure): string {
  if (measure.availability.status === "unavailable" || measure.denominator === 0) {
    return "Not available";
  }
  return formatPercent(measure.numerator / measure.denominator);
}

function rateNote(measure: RateMeasure, noun: string): string {
  if (measure.availability.status === "unavailable" || measure.denominator === 0) {
    return measure.availability.status === "unavailable"
      ? unavailableReason(measure.availability.reason)
      : "No qualifying evidence yet";
  }
  return `${formatPercent(measure.numerator / measure.denominator)} · ${measure.numerator.toLocaleString()} of ${measure.denominator.toLocaleString()} ${noun}`;
}

function unavailableReason(reason: "no-evidence" | "immature-cohort"): string {
  return reason === "immature-cohort"
    ? "Cohort still maturing"
    : "No qualifying evidence yet";
}

function durationLabel(
  medianMs: number | null,
  availability: "available" | "unavailable",
): string {
  if (availability === "unavailable" || medianMs === null) return "Not available";
  const seconds = Math.round(medianMs / 1_000);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes} min` : `${minutes} min ${remainingSeconds} sec`;
}

function formatEvidenceDate(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "at an unknown date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone,
  }).format(date);
}

function SectionHeading({
  description,
  eyebrow,
  id,
  title,
}: {
  description: string;
  eyebrow: string;
  id: string;
  title: string;
}) {
  return (
    <header className="progress-section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
      </div>
      <p>{description}</p>
    </header>
  );
}

function OverviewMetric({
  icon: Icon,
  label,
  note,
  value,
}: {
  icon: typeof Target;
  label: string;
  note: string;
  value: string;
}) {
  return (
    <article className="progress-overview-card">
      <Icon aria-hidden="true" size={19} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function CourseCoverageBlock({ course }: { course: CourseCoverage }) {
  return (
    <details className="progress-coverage-course" open>
      <summary>
        <span>{course.title}</span>
        <CoverageValue passed={course.passedCards} total={course.totalCards} />
      </summary>
      <div className="progress-coverage-units">
        {course.units.map((unit) => (
          <div className="progress-coverage-unit" key={unit.id}>
            <div>
              <strong>{unit.title}</strong>
              <CoverageValue passed={unit.passedCards} total={unit.totalCards} />
            </div>
            <ul>
              {unit.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <span>{lesson.title}</span>
                  <CoverageValue passed={lesson.passedCards} total={lesson.totalCards} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function CoverageValue({ passed, total }: { passed: number; total: number }) {
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
  return (
    <span className="coverage-value" aria-label={`${passed} of ${total} cards first passed, ${percent}%`}>
      <b>{passed} / {total}</b>
      <span className="progress-value-track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

function Statistic({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{typeof value === "number" ? value.toLocaleString() : value}</dd>
    </div>
  );
}

function TrendDay({ day }: { day: ProgressTrendDay }) {
  return (
    <li>
      <time dateTime={day.date}>{day.date}</time>
      <span>{day.retrievalChecks} checks</span>
      <span>{day.perfectRecalls} perfect</span>
      <span>{day.firstPassCount} first pass</span>
      <span>{day.averageIndependentAccuracy == null ? "— accuracy" : `${formatPercent(day.averageIndependentAccuracy)} accuracy`}</span>
    </li>
  );
}

function WeakCardRow({
  card,
  onPractice,
  timeZone,
}: {
  card: WeakCard;
  onPractice?: (cardId: string) => void;
  timeZone: string;
}) {
  return (
    <li className="weak-card-row">
      <div className="weak-card-copy">
        <span>{card.courseTitle}</span>
        <strong>{card.prompt}</strong>
        {card.contentSafety === "blocked-content" && (
          <span role="status">Content blocked · replace or re-import this content.</span>
        )}
      </div>
      <dl className="weak-card-facts">
        <div><dt>Stage</dt><dd>{card.stage}</dd></div>
        <div><dt>Lapses</dt><dd>{card.lapseCount}</dd></div>
        <div><dt>Recent result</dt><dd>{card.recentResult ?? "No check"}</dd></div>
        <div><dt>Due</dt><dd>{formatDueAt(card.dueAt, timeZone)}</dd></div>
      </dl>
      {onPractice && card.contentSafety === "safe" && (
        <button className="secondary-button" type="button" onClick={() => onPractice(card.cardId)}>
          Practice this card
        </button>
      )}
    </li>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function ratioWidth(value: number, total: number): string {
  return `${total > 0 ? Math.round((value / total) * 100) : 0}%`;
}

function recentActivityLabel(
  metadata: ProgressRecentActivityMetadata | null | undefined,
  fallbackTotal: number,
): string {
  if (metadata?.isTruncated) {
    return `Latest ${metadata.limit.toLocaleString()} of ${metadata.totalEntries.toLocaleString()} events`;
  }
  const total = metadata?.totalEntries ?? fallbackTotal;
  return `${total.toLocaleString()} events recorded locally`;
}

function formatDueAt(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

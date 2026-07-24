import { Activity, BookOpenCheck, Target } from "lucide-react";
import type { TrainingController } from "../hooks/useTrainingController";

interface ProgressViewProps {
  controller: TrainingController;
}

export function ProgressView({ controller }: ProgressViewProps) {
  const snapshot = controller.snapshot;
  const logs = snapshot?.practiceLog ?? [];
  const submittedLogs = logs.filter(
    (log) => log.outcome !== "skipped" && log.outcome !== "revealed",
  );
  const cards = snapshot?.cards ?? [];
  const averageAccuracy = submittedLogs.length
    ? Math.round((submittedLogs.reduce((sum, log) => sum + log.accuracy, 0) / submittedLogs.length) * 100)
    : 0;
  const perfectCount = logs.filter((log) => log.outcome === "perfect").length;
  const retryCount = logs.filter((log) => log.outcome === "retry").length;
  const skippedCount = logs.filter((log) => log.outcome === "skipped").length;
  const revealedCount = logs.filter((log) => log.outcome === "revealed").length;
  const completedCourses = snapshot?.courseProgress.filter((progress) => progress.status === "completed").length ?? 0;

  return (
    <section className="page-stack">
      <div className="stats-grid">
        <MetricCard icon={Target} label="Cards in courses" value={cards.length.toString()} />
        <MetricCard icon={Activity} label="Average accuracy" value={`${averageAccuracy}%`} />
        <MetricCard icon={BookOpenCheck} label="Courses complete" value={`${completedCourses}/${snapshot?.courses.length ?? 0}`} />
      </div>

      <div className="progress-panel">
        <div>
          <p className="eyebrow">Practice health</p>
          <h3>{logs.length} learning events recorded locally</h3>
        </div>
        <div className="outcome-bars">
          <OutcomeBar label="Perfect" value={perfectCount} total={logs.length} />
          <OutcomeBar label="Retry" value={retryCount} total={logs.length} />
          <OutcomeBar label="Revealed" value={revealedCount} total={logs.length} />
          <OutcomeBar label="Skipped" value={skippedCount} total={logs.length} />
        </div>
      </div>

      <div className="progress-panel">
        <div>
          <p className="eyebrow">Course progress</p>
          <h3>Learning path completion</h3>
        </div>
        <div className="course-progress-list">
          {snapshot?.courseProgress.map((progress) => {
            const course = snapshot.courses.find((candidate) => candidate.id === progress.courseId);
            const percent = progress.totalCards ? Math.round((progress.passedCards / progress.totalCards) * 100) : 0;

            return (
              <article className="course-progress-row" key={progress.courseId}>
                <div>
                  <strong>{course?.title ?? progress.courseId}</strong>
                  <span>{progress.passedCards}/{progress.totalCards} sentences passed · {progress.status}</span>
                </div>
                <div className="outcome-track" aria-label={`${percent}% complete`}>
                  <span style={{ width: `${percent}%` }} />
                </div>
                <b>{percent}%</b>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <article className="metric-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function OutcomeBar({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total ? Math.round((value / total) * 100) : 0;

  return (
    <div className="outcome-row">
      <span>{label}</span>
      <div className="outcome-track">
        <span style={{ width: `${width}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

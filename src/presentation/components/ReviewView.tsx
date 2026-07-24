import { Bookmark, Clock3, Play } from "lucide-react";
import type { TrainingController } from "../hooks/useTrainingController";

interface ReviewViewProps {
  controller: TrainingController;
  onStartReview(): void;
  onStartVocabulary(): void;
}

export function ReviewView({ controller, onStartReview, onStartVocabulary }: ReviewViewProps) {
  const due = controller.snapshot?.queue.due ?? [];
  const upcoming = controller.snapshot?.queue.upcoming.slice(0, 8) ?? [];
  const cardById = new Map(controller.snapshot?.cards.map((card) => [card.id, card]) ?? []);
  const reviewByCardId = new Map(
    controller.snapshot?.reviewStates.map((reviewState) => [reviewState.cardId, reviewState]) ?? [],
  );
  const vocabularyCards = (controller.snapshot?.vocabularyEntries ?? [])
    .flatMap((entry) => {
      const card = cardById.get(entry.cardId);
      return card ? [card] : [];
    });
  const activeVocabularyCount = vocabularyCards.filter(
    (card) => reviewByCardId.get(card.id)?.learningStatus !== "mastered",
  ).length;

  return (
    <section className="page-stack">
      <div className="review-summary">
        <div>
          <p className="eyebrow">Due queue</p>
          <h3>{due.length} cards ready</h3>
        </div>
        <div className="review-summary-actions">
          <Clock3 size={22} />
          <button className="primary-button" disabled={due.length === 0} onClick={onStartReview} type="button">
            <Play size={16} />
            Start review
          </button>
        </div>
      </div>

      <div className="queue-list">
        {[...due, ...upcoming].map((item) => (
          <article className={`queue-item ${item.isDue ? "is-due" : ""}`} key={item.card.id}>
            <div>
              <p>{item.card.english}</p>
              <span>{item.card.prompt}</span>
            </div>
            <div className="queue-meta">
              <strong>Stage {item.reviewState.stage}</strong>
              <span>{formatDueAt(item.reviewState.dueAt)}</span>
            </div>
          </article>
        ))}
        {due.length === 0 && upcoming.length === 0 && (
          <div className="empty-list-copy">Complete a lesson first. Successfully recalled sentences will enter spaced review.</div>
        )}
      </div>

      <div className="review-summary">
        <div>
          <p className="eyebrow">Vocabulary</p>
          <h3>{vocabularyCards.length} saved sentences · {activeVocabularyCount} active</h3>
        </div>
        <div className="review-summary-actions">
          <Bookmark size={22} />
          <button
            className="primary-button"
            disabled={activeVocabularyCount === 0}
            onClick={onStartVocabulary}
            type="button"
          >
            <Play size={16} />
            Practice vocabulary
          </button>
        </div>
      </div>

      <div className="queue-list">
        {vocabularyCards.map((card) => (
          <article className="queue-item is-due" key={card.id}>
            <div>
              <p>{card.english}</p>
              <span>{card.prompt}</span>
            </div>
            <div className="queue-meta">
              <strong>{reviewByCardId.get(card.id)?.learningStatus === "mastered" ? "Mastered" : "Saved"}</strong>
              <span>{card.source}</span>
            </div>
          </article>
        ))}
        {vocabularyCards.length === 0 && (
          <div className="empty-list-copy">Press Control N during practice to save a sentence here.</div>
        )}
      </div>
    </section>
  );
}

function formatDueAt(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

import { useEffect, useReducer, useRef, useState } from "react";
import { Bookmark, Clock3, Play, RotateCcw, Trash2 } from "lucide-react";
import type {
  MasteredDashboardItem,
  ReviewDashboard,
  ReviewDashboardItem,
  VocabularyDashboardItem,
} from "../../domain/review/buildReviewDashboard";

interface ReviewViewProps {
  dashboard: ReviewDashboard;
  onReviewCourseChange(courseId: string | null): void;
  onStartReview(courseId?: string): void;
  onStartVocabulary(courseId?: string): void;
  onPracticeVocabularyCard(cardId: string, courseId?: string): void;
  onRemoveVocabulary(cardId: string): Promise<void> | void;
  onReturnToNew(cardId: string): Promise<void> | void;
  onSetVocabulary(cardId: string, isSaved: boolean): Promise<void> | void;
}

export interface ReviewActionCommand {
  readonly key: string;
  readonly cardId: string;
  readonly pendingLabel: string;
  readonly retryLabel: string;
  readonly successMessage: string;
  readonly failureMessage: string;
  readonly execute: () => Promise<void> | void;
  readonly afterSuccess?: () => void;
}

export type ReviewActionOperation =
  | { status: "pending"; command: ReviewActionCommand }
  | { status: "failed"; command: ReviewActionCommand; message: string };

export interface ReviewActionState {
  operations: Readonly<Record<string, ReviewActionOperation>>;
  messages: Readonly<Record<string, string>>;
}

type ReviewActionEvent =
  | { type: "started"; command: ReviewActionCommand }
  | { type: "failed"; command: ReviewActionCommand }
  | { type: "succeeded"; command: ReviewActionCommand };

export const EMPTY_REVIEW_ACTION_STATE: ReviewActionState = {
  operations: {},
  messages: {},
};

export function reduceReviewActionState(
  state: ReviewActionState,
  event: ReviewActionEvent,
): ReviewActionState {
  if (event.type === "succeeded") {
    const operations = { ...state.operations };
    delete operations[event.command.key];
    return {
      operations,
      messages: {
        ...state.messages,
        [event.command.cardId]: event.command.successMessage,
      },
    };
  }

  const messages = { ...state.messages };
  delete messages[event.command.cardId];
  return {
    messages,
    operations: {
      ...state.operations,
      [event.command.key]: event.type === "started"
        ? { status: "pending", command: event.command }
        : {
            status: "failed",
            command: event.command,
            message: event.command.failureMessage,
          },
    },
  };
}

interface ReviewFocusRoot {
  getElementById(id: string): { focus(options?: { preventScroll?: boolean }): void } | null;
}

export function getVocabularyRemovalFocusCandidates(
  cardIds: readonly string[],
  removedCardId: string,
): string[] {
  const removedIndex = cardIds.indexOf(removedCardId);
  if (removedIndex < 0) {
    return [];
  }

  return [cardIds[removedIndex + 1], cardIds[removedIndex - 1]].filter(
    (cardId): cardId is string => Boolean(cardId),
  );
}

export function focusVocabularyRemovalTarget(
  root: ReviewFocusRoot,
  candidateCardIds: readonly string[],
): string | null {
  const targetIds = [
    ...candidateCardIds.map((cardId) => `vocabulary-primary-action:${cardId}`),
    "vocabulary-review-heading",
  ];

  for (const targetId of targetIds) {
    const target = root.getElementById(targetId);
    if (target) {
      target.focus({ preventScroll: true });
      return targetId;
    }
  }

  return null;
}

export function ReviewView({
  dashboard,
  onPracticeVocabularyCard,
  onRemoveVocabulary,
  onReturnToNew,
  onReviewCourseChange,
  onSetVocabulary,
  onStartReview,
  onStartVocabulary,
}: ReviewViewProps) {
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [actionState, dispatchAction] = useReducer(
    reduceReviewActionState,
    EMPTY_REVIEW_ACTION_STATE,
  );
  const pendingCardIdsRef = useRef(new Set<string>());
  const [vocabularyFocusRequest, setVocabularyFocusRequest] = useState<{
    removedCardId: string;
    candidateCardIds: string[];
  } | null>(null);
  const selectedCourseId = dashboard.selectedCourseId ?? undefined;
  const visibleUpcoming = showAllUpcoming ? dashboard.upcoming : dashboard.upcoming.slice(0, 8);
  const activeVocabularyCount = dashboard.vocabulary.filter((item) => !item.isMastered).length;

  useEffect(() => {
    setShowAllUpcoming(false);
  }, [dashboard.selectedCourseId]);

  useEffect(() => {
    if (
      !vocabularyFocusRequest
      || dashboard.vocabulary.some((item) => item.cardId === vocabularyFocusRequest.removedCardId)
    ) {
      return;
    }

    focusVocabularyRemovalTarget(document, vocabularyFocusRequest.candidateCardIds);
    setVocabularyFocusRequest(null);
  }, [dashboard.vocabulary, vocabularyFocusRequest]);

  async function runAction(command: ReviewActionCommand) {
    if (pendingCardIdsRef.current.has(command.cardId)) {
      return;
    }

    pendingCardIdsRef.current.add(command.cardId);
    dispatchAction({ type: "started", command });
    try {
      await command.execute();
      command.afterSuccess?.();
      dispatchAction({ type: "succeeded", command });
    } catch {
      dispatchAction({ type: "failed", command });
    } finally {
      pendingCardIdsRef.current.delete(command.cardId);
    }
  }

  return (
    <section aria-labelledby="review-view-title" className="page-stack">
      <div className="review-summary">
        <div>
          <p className="eyebrow">Due queue</p>
          <h3 id="review-view-title">
            {dashboard.due.length} {dashboard.due.length === 1 ? "card" : "cards"} ready
          </h3>
        </div>
        <div className="review-summary-actions">
          <Clock3 aria-hidden="true" size={22} />
          <div className="review-course-filter">
            <label htmlFor="review-course-filter">Review course</label>
            <select
              id="review-course-filter"
              onChange={(event) => onReviewCourseChange(event.currentTarget.value || null)}
              value={dashboard.selectedCourseId ?? ""}
            >
              <option value="">All courses</option>
              {dashboard.courseOptions.map((option) => (
                <option key={option.courseId} value={option.courseId}>
                  {option.title} · {option.dueCount} due
                </option>
              ))}
            </select>
          </div>
          <button
            className="primary-button"
            disabled={dashboard.due.length === 0}
            onClick={() => onStartReview(selectedCourseId)}
            type="button"
          >
            <Play aria-hidden="true" size={16} />
            Start review
          </button>
        </div>
      </div>

      <section aria-labelledby="due-review-heading" className="review-queue-group">
        <div className="review-queue-heading">
          <h3 id="due-review-heading">Due now</h3>
          <span
            aria-label={`Due now count: ${dashboard.due.length}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {dashboard.due.length}
          </span>
        </div>
        <div className="queue-list">
          {dashboard.due.map((item) => <ReviewQueueItem item={item} key={item.cardId} />)}
          {dashboard.due.length === 0 && (
            <div className="empty-list-copy">Nothing is due in this review scope.</div>
          )}
        </div>
      </section>

      <section aria-labelledby="upcoming-review-heading" className="review-queue-group">
        <div className="review-queue-heading">
          <h3 id="upcoming-review-heading">Upcoming</h3>
          <span
            aria-label={`Upcoming count: ${dashboard.upcoming.length}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {dashboard.upcoming.length}
          </span>
        </div>
        <div className="queue-list">
          {visibleUpcoming.map((item) => <ReviewQueueItem item={item} key={item.cardId} />)}
          {dashboard.upcoming.length === 0 && (
            <div className="empty-list-copy">
              Complete a lesson first. Successfully recalled sentences will enter spaced review.
            </div>
          )}
        </div>
        {dashboard.upcoming.length > 8 && (
          <div className="review-upcoming-window">
            <span>
              Showing {visibleUpcoming.length} of {dashboard.upcoming.length}
            </span>
            {!showAllUpcoming && (
              <button className="secondary-button" onClick={() => setShowAllUpcoming(true)} type="button">
                Show all upcoming
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="mastered-review-heading" className="review-queue-group">
        <div className="review-summary review-management-summary">
          <div>
            <p className="eyebrow">Mastery</p>
            <h3 id="mastered-review-heading" aria-live="polite" aria-atomic="true">
              Mastered sentences · {dashboard.mastered.length}
            </h3>
          </div>
          <RotateCcw aria-hidden="true" size={22} />
        </div>
        <div className="queue-list">
          {dashboard.mastered.map((item) => (
            <MasteredRow
              actionState={actionState}
              item={item}
              key={item.cardId}
              onRetry={(command) => void runAction(command)}
              onReturn={() => void runAction(createReviewActionCommand({
                key: `return:${item.cardId}`,
                cardId: item.cardId,
                pendingLabel: "Returning…",
                retryLabel: "Retry returning to focused review",
                successMessage: "Sentence returned to focused review.",
                failureMessage: "Sentence was not returned to focused review.",
                execute: () => onReturnToNew(item.cardId),
              }))}
              onToggleVocabulary={() => {
                const isRemoving = item.isInVocabulary;
                void runAction(createReviewActionCommand({
                  key: `vocabulary:${item.cardId}`,
                  cardId: item.cardId,
                  pendingLabel: isRemoving ? "Removing…" : "Saving…",
                  retryLabel: isRemoving ? "Retry removing from Vocabulary" : "Retry saving Vocabulary",
                  successMessage: isRemoving
                    ? "Sentence removed from Vocabulary."
                    : "Sentence saved to Vocabulary.",
                  failureMessage: isRemoving
                    ? "Sentence was not removed from Vocabulary."
                    : "Sentence was not saved to Vocabulary.",
                  execute: () => onSetVocabulary(item.cardId, !isRemoving),
                }));
              }}
            />
          ))}
          {dashboard.mastered.length === 0 && (
            <div className="empty-list-copy">Mastered sentences stay available here if you want to learn them again.</div>
          )}
        </div>
      </section>

      <section aria-labelledby="vocabulary-review-heading" className="review-queue-group">
        <div className="review-summary">
          <div>
            <p className="eyebrow">Vocabulary</p>
            <h3
              id="vocabulary-review-heading"
              aria-live="polite"
              aria-atomic="true"
              tabIndex={-1}
            >
              {dashboard.vocabulary.length} saved sentences · {activeVocabularyCount} active
            </h3>
          </div>
          <div className="review-summary-actions">
            <Bookmark aria-hidden="true" size={22} />
            <button
              className="primary-button"
              disabled={activeVocabularyCount === 0}
              onClick={() => onStartVocabulary(selectedCourseId)}
              type="button"
            >
              <Play aria-hidden="true" size={16} />
              Practice vocabulary
            </button>
          </div>
        </div>

        <div className="queue-list">
          {dashboard.vocabulary.map((item) => {
            const focusCandidates = getVocabularyRemovalFocusCandidates(
              dashboard.vocabulary.map((candidate) => candidate.cardId),
              item.cardId,
            );
            return (
              <VocabularyRow
                actionState={actionState}
                item={item}
                key={item.cardId}
                onPractice={() => onPracticeVocabularyCard(item.cardId, selectedCourseId)}
                onRemove={() => void runAction(createReviewActionCommand({
                  key: `remove:${item.cardId}`,
                  cardId: item.cardId,
                  pendingLabel: "Removing…",
                  retryLabel: "Retry removing from Vocabulary",
                  successMessage: "Sentence removed from Vocabulary.",
                  failureMessage: "Sentence was not removed from Vocabulary.",
                  execute: () => onRemoveVocabulary(item.cardId),
                  afterSuccess: () => setVocabularyFocusRequest({
                    removedCardId: item.cardId,
                    candidateCardIds: focusCandidates,
                  }),
                }))}
                onRetry={(command) => void runAction(command)}
                onReturn={() => void runAction(createReviewActionCommand({
                  key: `return:${item.cardId}`,
                  cardId: item.cardId,
                  pendingLabel: "Returning…",
                  retryLabel: "Retry returning to focused review",
                  successMessage: "Sentence returned to focused review.",
                  failureMessage: "Sentence was not returned to focused review.",
                  execute: () => onReturnToNew(item.cardId),
                }))}
              />
            );
          })}
          {dashboard.vocabulary.length === 0 && (
            <div className="empty-list-copy">Press Control N during practice to save a sentence here.</div>
          )}
        </div>
      </section>
    </section>
  );
}

function ReviewQueueItem({ item }: { item: ReviewDashboardItem }) {
  return (
    <article className={`queue-item ${item.isDue ? "is-due" : ""}`}>
      <div>
        <p>{item.prompt}</p>
        <span>{item.courseTitles.join(" · ")} · {item.source}</span>
        <ContentSafetyNotice contentSafety={item.contentSafety} />
      </div>
      <div className="queue-meta">
        <strong>{item.readiness === "acquisition" ? "Focused review" : `Stage ${item.stage}`}</strong>
        <span>{formatDueAt(item.dueAt)}</span>
      </div>
    </article>
  );
}

export function MasteredRow({
  actionState,
  item,
  onRetry,
  onReturn,
  onToggleVocabulary,
}: {
  actionState: ReviewActionState;
  item: MasteredDashboardItem;
  onRetry(command: ReviewActionCommand): void;
  onReturn(): void;
  onToggleVocabulary(): void;
}) {
  const { failures, pendingCommand } = getCardActionFeedback(actionState, item.cardId);
  const isPending = Boolean(pendingCommand);
  return (
    <article aria-busy={isPending} className="queue-item mastered-item">
      <ManagementCopy
        failures={failures}
        item={item}
        message={actionState.messages[item.cardId]}
        onRetry={onRetry}
        status="Mastered"
      />
      <div className="vocabulary-item-actions">
        <button
          aria-label={`Return ${item.cardId} to new`}
          className="secondary-button"
          disabled={isPending}
          onClick={onReturn}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={15} />
          {pendingCommand?.key === `return:${item.cardId}` ? pendingCommand.pendingLabel : "Return to new"}
        </button>
        <button
          aria-label={`${item.isInVocabulary ? "Remove" : "Save"} ${item.cardId} ${item.isInVocabulary ? "from" : "to"} Vocabulary`}
          className="secondary-button"
          disabled={isPending}
          onClick={onToggleVocabulary}
          type="button"
        >
          <Bookmark aria-hidden="true" size={15} />
          {pendingCommand?.key === `vocabulary:${item.cardId}`
            ? pendingCommand.pendingLabel
            : item.isInVocabulary ? "Remove Vocabulary" : "Save Vocabulary"}
        </button>
      </div>
    </article>
  );
}

export function VocabularyRow({
  actionState,
  item,
  onPractice,
  onRemove,
  onRetry,
  onReturn,
}: {
  actionState: ReviewActionState;
  item: VocabularyDashboardItem;
  onPractice(): void;
  onRemove(): void;
  onRetry(command: ReviewActionCommand): void;
  onReturn(): void;
}) {
  const { failures, pendingCommand } = getCardActionFeedback(actionState, item.cardId);
  const isPending = Boolean(pendingCommand);
  return (
    <article aria-busy={isPending} className="queue-item is-due vocabulary-item">
      <ManagementCopy
        failures={failures}
        item={item}
        message={actionState.messages[item.cardId]}
        onRetry={onRetry}
        status={item.isMastered ? "Mastered" : "Saved"}
      />
      <div className="vocabulary-item-actions">
        {item.isMastered ? (
          <button
            aria-label={`Return ${item.cardId} to new`}
            className="secondary-button"
            disabled={isPending}
            id={`vocabulary-primary-action:${item.cardId}`}
            onClick={onReturn}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={15} />
            {pendingCommand?.key === `return:${item.cardId}` ? pendingCommand.pendingLabel : "Return to new"}
          </button>
        ) : (
          <button
            aria-label={`Practice ${item.cardId}`}
            className="secondary-button"
            disabled={isPending || item.contentSafety === "blocked-content"}
            id={`vocabulary-primary-action:${item.cardId}`}
            onClick={onPractice}
            type="button"
          >
            <Play aria-hidden="true" size={15} />
            {item.contentSafety === "blocked-content" ? "Content blocked" : "Practice one"}
          </button>
        )}
        <button
          aria-label={`Remove ${item.cardId} from Vocabulary`}
          className="secondary-button"
          disabled={isPending}
          onClick={onRemove}
          type="button"
        >
          <Trash2 aria-hidden="true" size={15} />
          {pendingCommand?.key === `remove:${item.cardId}` ? pendingCommand.pendingLabel : "Remove"}
        </button>
      </div>
    </article>
  );
}

function ManagementCopy({
  failures,
  item,
  message,
  onRetry,
  status,
}: {
  failures: Array<Extract<ReviewActionOperation, { status: "failed" }>>;
  item: MasteredDashboardItem | VocabularyDashboardItem;
  message?: string;
  onRetry(command: ReviewActionCommand): void;
  status: string;
}) {
  return (
    <div>
      <p>{item.prompt}</p>
      <span>{item.courseTitles.join(" · ")} · {item.source}</span>
      <ContentSafetyNotice contentSafety={item.contentSafety} />
      <div aria-atomic="true" aria-live="polite">
        <p className="review-action-message">{message}</p>
        {failures.map((failure) => (
          <div key={failure.command.key}>
            <p className="review-action-message review-action-message-error">{failure.message}</p>
            <button
              aria-label={`${failure.command.retryLabel} for ${item.cardId}`}
              className="secondary-button"
              onClick={() => onRetry(failure.command)}
              type="button"
            >
              {failure.command.retryLabel}
            </button>
          </div>
        ))}
      </div>
      <span className="sr-only">{status}</span>
    </div>
  );
}

function ContentSafetyNotice({
  contentSafety,
}: {
  contentSafety: MasteredDashboardItem["contentSafety"];
}) {
  return contentSafety === "blocked-content"
    ? <p className="review-action-message" role="status">Content blocked · replace or re-import this content.</p>
    : null;
}

function createReviewActionCommand(command: ReviewActionCommand): ReviewActionCommand {
  return Object.freeze(command);
}

function getCardActionFeedback(actionState: ReviewActionState, cardId: string) {
  const operations = Object.values(actionState.operations).filter(
    (operation) => operation.command.cardId === cardId,
  );
  return {
    failures: operations.filter(
      (operation): operation is Extract<ReviewActionOperation, { status: "failed" }> =>
        operation.status === "failed",
    ),
    pendingCommand: operations.find((operation) => operation.status === "pending")?.command,
  };
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

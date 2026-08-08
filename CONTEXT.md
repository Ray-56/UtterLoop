# UtterLoop

UtterLoop helps learners turn known English sentences into retrievable output through repeated attempts and spaced review.

## Language

The content hierarchy is `LearningPath -> Course -> Unit -> Lesson -> SentenceCard`.

**LearningPath**:
A recommended ordering of independent Courses used to suggest what to study next. It guides progression without locking access or implying enrollment.
_Avoid_: Enrollment, prerequisite chain

**Course**:
An independently accessible, versioned body of learning content with one primary CourseCategory, searchable tags, a CEFR range, a CourseProvider, a content license, and ordered Units.
_Avoid_: LearningPath, library

**CourseCategory**:
A stable primary grouping used to browse and filter Courses. Each Course belongs to exactly one CourseCategory; overlapping topics and skills are represented by Course tags.
_Avoid_: LearningPath, Unit, Tag

**CourseProvider**:
The organization or collection that produced, curated, or supplied a Course. It identifies provenance and remains distinct from the content License, which defines reuse rights.
_Avoid_: License, SentenceCard source

**Unit**:
An ordered section within a Course that groups related Lessons.
_Avoid_: Course, category

**Lesson**:
An objective-driven, ordered set of SentenceCards within a Unit and the primary scope for learn or replay practice.
_Avoid_: PracticeQueue, session

**SentenceCard**:
A learnable unit containing one target sentence, its prompt, provenance, tags, and accepted answers. A Lesson references SentenceCards by stable identifier.
_Avoid_: Flashcard, question

**Target Sentence**:
The English sentence the learner is trying to recall and produce.
_Avoid_: Answer, phrase

**Prompt**:
The non-target-bearing clue shown before an attempt, usually a Chinese translation or situational cue. Target text and target audio belong to explicit Learning Support rather than an Independent Recall Prompt.
_Avoid_: Question, hint

**Learning Support**:
Structured context, sentence-pattern, pronunciation, grammar, and progressive-cue content attached to a Target Sentence for initial learning.
_Avoid_: Answer Reveal, tutor response

**First Exposure**:
The non-assessment phase for an unintroduced SentenceCard. It may show the full Target Sentence and Learning Support, creates no Attempt, and prepares a Guided Recall.
_Avoid_: Guided Recall, Answer Reveal

**Recall Support**:
The strongest target-bearing aid used before a recall submission, recorded as ordered evidence from context-only work through complete target exposure.
_Avoid_: Learning Support, AnswerEvaluation

**Guided Recall**:
An instructional recall turn: either the mandatory first recall after First Exposure or any recall using target-bearing support such as a pattern, keywords, frame, IPA, target audio, or the revealed sentence. It teaches the target but cannot establish a First Pass.
_Avoid_: Independent Recall, free recall

**Independent Recall**:
A recall turn whose first complete submission occurs without target-bearing support or prior corrective feedback. A perfect Independent Recall may establish a First Pass and advance spaced review.
_Avoid_: Guided Recall, perfect evaluation

**Corrective Practice**:
The instructional phase after a submitted `close` or `retry`, used to reach exact text without replacing the first submission's scheduling or First Pass decision.
_Avoid_: Independent Recall, self-editing

**Exact Instructional Completion**:
A Guided or Corrective submission evaluated `perfect` against the canonical Target Sentence or a reviewed acceptable answer. It may prepare an unpassed card for Independent Recall but is not a First Pass.
_Avoid_: First Pass, canonical-string match

**First Pass**:
The monotonic milestone created by a perfect Independent Recall or explicit mastery. It drives Lesson and Course coverage but remains separate from long-term ReviewState.
_Avoid_: Mastery Stage, course mastery

**Sentence Learning State**:
The durable record that a SentenceCard has been introduced, its pre-pass Acquisition Status, and whether it received a First Pass.
_Avoid_: ReviewState, PracticeLog

**Acquisition Status**:
The mutable readiness of an introduced card before First Pass: `needs-guided` requires instructional recall, while `ready-independent` allows the next eligible recall to establish First Pass.
_Avoid_: ReviewState, Mastery Stage

**Answer Reveal**:
An explicit learner action that exposes the Target Sentence during recall. It is retained as learning evidence even if the answer is hidden again.
_Avoid_: Prompt, word-level correction

**Finger Guide**:
A practice aid that visualizes standard key-to-finger assignments for the learner's own keystrokes without indicating upcoming Target Sentence characters.
_Avoid_: Finger detection, Answer Reveal

**Attempt**:
A learner's submitted output for a SentenceCard during practice.
_Avoid_: Response, input

**AnswerEvaluation**:
The judgment of an Attempt against a SentenceCard, including outcome, accuracy, and word-level differences.
_Avoid_: Grade, score

**ReviewState**:
The spaced-review status for a SentenceCard, including due time, mastery stage, streak, lapses, and optional learning status. It is independent from Course and Lesson completion.
_Avoid_: Progress, memory

**Learning Status**:
An explicit learner mark on a SentenceCard. A `new` item stays in focused review; a `mastered` item leaves the active PracticeQueue.
_Avoid_: Tag, outcome

**Vocabulary Entry**:
An explicit learner bookmark for a SentenceCard, stored independently from ReviewState so a sentence can remain in the vocabulary collection regardless of its mastery stage.
_Avoid_: Learning Status, ReviewState

**PracticeQueue**:
The ordered set of SentenceCards resolved for a practice scope. Lesson practice preserves lesson order and learning state; review practice uses ReviewState scheduling.
_Avoid_: Todo list, content container

**Practice Session**:
One learner intent from opening a resolved practice scope until completion, Quick Start dismissal, deliberate replacement, abandonment, or invalidation. Reload and compatible checkpoint recovery continue the same Practice Session.
_Avoid_: Browser visit, Lesson, PracticeQueue

**Practice Round**:
The ordered itinerary of Practice Occurrences scheduled within a Practice Session. The current product creates one Practice Round per Practice Session while retaining separate identities for future round-level behavior.
_Avoid_: Practice Session, Review interval

**Practice Occurrence**:
One scheduled appearance of a SentenceCard within a Practice Round. A returned card receives a new occurrence identity while retaining its card, round, and session identities.
_Avoid_: SentenceCard, Attempt

**PracticeLog**:
The durable turn-level record of Attempts and learner signals such as Recall Support, Answer Reveal, and Skip. It may reference session, round, and occurrence context but does not represent page lifecycle or session completion.
_Avoid_: Practice Session Evidence, event stream

**Practice Session Evidence**:
An immutable, target-free terminal summary of Practice Session engagement, outcome, and Practice Round occurrence evidence. It complements PracticeLog and never stores Prompt, Target Sentence, answer text, draft, audio, or raw keystrokes.
_Avoid_: Checkpoint, PracticeLog, analytics event stream

**Focused Practice**:
Voluntary single-card practice started from a current Weak Card. It records truthful Attempts and signals but does not create or advance Review scheduling and cannot establish a First Pass.
_Avoid_: Focused review, due Review, Vocabulary practice

**Weak Card**:
A first-passed, non-mastered SentenceCard whose ReviewState lapses or recent non-perfect retrievals meet the current needs-attention rule.
_Avoid_: New card, difficult content label

**Beta Readiness**:
A local projection of activation, acquisition, retention, habit, and evidence-coverage measures used to evaluate the English learning loop before Touch Typing expansion.
_Avoid_: Progress, mastery score, remote analytics

**Measurement Epoch**:
The persisted instant from which new PracticeLog context and Practice Session Evidence are expected to be complete. Earlier activity remains historical but is excluded from strict measures that need unavailable evidence.
_Avoid_: Account creation date, first practice date

**Mastery Stage**:
A compact level representing how far a SentenceCard has moved through spaced review.
_Avoid_: Level, rank

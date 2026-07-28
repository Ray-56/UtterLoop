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
The clue shown before an attempt, usually a Chinese translation or a listening cue.
_Avoid_: Question, hint

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

**Mastery Stage**:
A compact level representing how far a SentenceCard has moved through spaced review.
_Avoid_: Level, rank

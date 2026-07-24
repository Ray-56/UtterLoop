import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { ContentLicense, Course } from "../../domain/curriculum/Course";

const SEED_TIMESTAMP = "2026-07-19T00:00:00.000Z";
const VOA_SOURCE = "VOA Learning English";

export const VOA_PUBLIC_DOMAIN_LICENSE: ContentLicense = {
  name: "Voice of America Public Domain",
  url: "https://learningenglish.voanews.com/p/6861.html",
  attribution: "VOA Learning English (learningenglish.voanews.com)",
};

interface CardSeed {
  english: string;
  prompt: string;
}

interface LessonSeed {
  id: string;
  voaLessonNumber: number;
  title: string;
  objective: string;
  sourceUrl: string;
  tags: string[];
  cards: CardSeed[];
}

const lessonSeeds: LessonSeed[] = [
  {
    id: "voa-lle1-lesson-02",
    voaLessonNumber: 2,
    title: "Hello, I'm Anna!",
    objective:
      "Ask who someone is and where they are from, then close an introduction politely.",
    sourceUrl:
      "https://learningenglish.voanews.com/a/lets-learn-english-lesson-2-hello/3113733.html",
    tags: ["voa", "beginner", "introductions"],
    cards: [
      { english: "Who’s your friend?", prompt: "你的朋友是谁？" },
      { english: "She is new to D.C.", prompt: "她初来华盛顿特区。" },
      { english: "Where are you from?", prompt: "你来自哪里？" },
      { english: "I am from a small town.", prompt: "我来自一个小镇。" },
      { english: "Nice to meet you!", prompt: "很高兴认识你！" },
    ],
  },
  {
    id: "voa-lle1-lesson-03",
    voaLessonNumber: 3,
    title: "I'm Here!",
    objective:
      "Handle a phone call and use here, there, and want to for locations and needs.",
    sourceUrl:
      "https://learningenglish.voanews.com/a/lets-learn-english-lesson-3-i-am-here/3126527.html",
    tags: ["voa", "beginner", "telephone", "location"],
    cards: [
      { english: "Is this Marsha?", prompt: "请问是玛莎吗？" },
      { english: "You have the wrong number.", prompt: "你打错电话了。" },
      { english: "I am here!", prompt: "我就在这里！" },
      { english: "You are there.", prompt: "你就在那儿。" },
      { english: "I want to find a supermarket.", prompt: "我想找一家超市。" },
    ],
  },
  {
    id: "voa-lle1-lesson-04",
    voaLessonNumber: 4,
    title: "What Is It?",
    objective: "Use have and be to describe and identify everyday objects.",
    sourceUrl:
      "https://learningenglish.voanews.com/a/lets-learn-english-lesson-4/3168920.html",
    tags: ["voa", "beginner", "everyday-things", "have"],
    cards: [
      { english: "The new apartment is great!", prompt: "新公寓很棒！" },
      { english: "Anna, do you have a pen?", prompt: "安娜，你有笔吗？" },
      { english: "I have a pen in my bag.", prompt: "我的包里有一支笔。" },
      { english: "It is not a pen.", prompt: "它不是一支笔。" },
      { english: "It is a big book.", prompt: "它是一本大书。" },
    ],
  },
  {
    id: "voa-lle1-lesson-05",
    voaLessonNumber: 5,
    title: "Where Are You?",
    objective: "Name rooms and describe where common household activities happen.",
    sourceUrl:
      "https://learningenglish.voanews.com/a/lets-learn-english-lesson-5-where-are-you/3168971.html",
    tags: ["voa", "beginner", "rooms", "location"],
    cards: [
      { english: "It is a beautiful kitchen!", prompt: "这是个漂亮的厨房！" },
      { english: "We cook in the kitchen.", prompt: "我们在厨房做饭。" },
      { english: "Where are you?", prompt: "你在哪里？" },
      { english: "I wash in the bathroom.", prompt: "我在浴室洗漱。" },
      { english: "We sleep in the bedroom.", prompt: "我们在卧室睡觉。" },
    ],
  },
];

export const voaCourseCards: SentenceCard[] = lessonSeeds.flatMap((lesson) =>
  lesson.cards.map((card, cardIndex) => ({
    id: cardId(lesson.voaLessonNumber, cardIndex),
    english: card.english,
    prompt: card.prompt,
    source: `${VOA_SOURCE} — Level 1 Lesson ${lesson.voaLessonNumber}: ${lesson.title}`,
    sourceUrl: lesson.sourceUrl,
    license: VOA_PUBLIC_DOMAIN_LICENSE,
    tags: [...lesson.tags],
    acceptableAnswers: [],
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  })),
);

export const voaCourse: Course = {
  id: "voa-lle1-sentence-recall",
  title: "Everyday English with VOA",
  description:
    "A beginner sentence-recall selection from VOA Learning English conversation transcripts.",
  categoryId: "everyday-communication",
  tags: ["introductions", "telephone", "everyday objects", "rooms", "locations"],
  level: {
    label: "Beginner · A1",
    cefrFrom: "A1",
    cefrTo: "A1",
  },
  provider: {
    kind: "curated",
    name: "VOA Learning English",
    url: "https://learningenglish.voanews.com/p/5644.html",
  },
  revision: 2,
  license: VOA_PUBLIC_DOMAIN_LICENSE,
  units: [
    {
      id: "voa-lle1-unit-01",
      title: "Introductions and Places",
      description: "Meet people, make a phone call, and describe where someone is.",
      lessons: lessonSeeds.slice(0, 2).map(toCourseLesson),
    },
    {
      id: "voa-lle1-unit-02",
      title: "Everyday Things and Rooms",
      description: "Identify useful objects and connect household rooms with activities.",
      lessons: lessonSeeds.slice(2).map(toCourseLesson),
    },
  ],
};

function toCourseLesson(lesson: LessonSeed) {
  return {
    id: lesson.id,
    title: lesson.title,
    objective: lesson.objective,
    sourceUrl: lesson.sourceUrl,
    cardIds: lesson.cards.map((_, cardIndex) => cardId(lesson.voaLessonNumber, cardIndex)),
  };
}

function cardId(voaLessonNumber: number, cardIndex: number): string {
  return `voa-lle1-${String(voaLessonNumber).padStart(2, "0")}-${String(
    cardIndex + 1,
  ).padStart(2, "0")}`;
}

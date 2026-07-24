import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { ContentLicense, Course } from "../../domain/curriculum/Course";

const originalContentSource = "UtterLoop Original";
const seedCreatedAt = "2026-07-19T00:00:00.000Z";

export const CC0_CONTENT_LICENSE: ContentLicense = {
  name: "CC0 1.0 Universal",
  url: "https://creativecommons.org/publicdomain/zero/1.0/",
  attribution:
    "No attribution required. Original UtterLoop course content dedicated under CC0 1.0 Universal.",
};

export const originalCourses: Course[] = [
  {
    id: "starter-foundations",
    title: "Starter Foundations",
    description:
      "Build reliable recall for introducing yourself, describing routines, asking for help, and keeping a conversation clear.",
    categoryId: "everyday-communication",
    tags: ["introductions", "daily routines", "requests", "conversation repair"],
    level: {
      label: "Beginner · A1–A2",
      cefrFrom: "A1",
      cefrTo: "A2",
    },
    provider: {
      kind: "original",
      name: "UtterLoop",
    },
    revision: 2,
    license: CC0_CONTENT_LICENSE,
    units: [
      {
        id: "sf-u1",
        title: "Meet and Move Through the Day",
        description: "Personal introductions and repeatable daily actions.",
        lessons: [
          {
            id: "sf-u1-l1",
            title: "Meet Someone New",
            objective: "Greet someone and share simple personal facts and a learning goal.",
            cardIds: ["sf-001", "sf-002", "sf-003", "sf-004", "sf-005"],
          },
          {
            id: "sf-u1-l2",
            title: "A Simple Daily Routine",
            objective: "Recall present-simple sentences about recurring parts of a day.",
            cardIds: ["sf-006", "sf-007", "sf-008", "sf-009", "sf-010"],
          },
        ],
      },
      {
        id: "sf-u2",
        title: "Ask and Understand",
        description: "Immediate needs, polite requests, and conversation repair.",
        lessons: [
          {
            id: "sf-u2-l1",
            title: "Ask for What You Need",
            objective: "Express immediate needs and make polite requests for help.",
            cardIds: ["sf-011", "sf-012", "sf-013", "sf-014", "sf-015"],
          },
          {
            id: "sf-u2-l2",
            title: "Keep the Conversation Clear",
            objective: "Ask for repetition or meaning and confirm what you understood.",
            cardIds: ["sf-016", "sf-017", "sf-018", "sf-019", "sf-020"],
          },
        ],
      },
    ],
  },
  {
    id: "work-study-essentials",
    title: "Work & Study Essentials",
    description:
      "Build dependable language for sharing progress, requesting action, planning shared work, and responding to feedback.",
    categoryId: "work-study",
    tags: ["work", "study", "status updates", "requests", "planning", "feedback"],
    level: {
      label: "Elementary to Intermediate · A2–B1",
      cefrFrom: "A2",
      cefrTo: "B1",
    },
    provider: {
      kind: "original",
      name: "UtterLoop",
    },
    revision: 2,
    license: CC0_CONTENT_LICENSE,
    units: [
      {
        id: "wse-u1",
        title: "Share and Coordinate",
        description: "Concise status reports and actionable requests.",
        lessons: [
          {
            id: "wse-u1-l1",
            title: "Give a Useful Update",
            objective:
              "Give concise updates about completed, ready, ongoing, dependent, and expected work.",
            cardIds: ["wse-001", "wse-002", "wse-003", "wse-004", "wse-005"],
          },
          {
            id: "wse-u1-l2",
            title: "Make a Clear Request",
            objective: "Ask someone to share, send, reschedule, review, or explain something.",
            cardIds: ["wse-006", "wse-007", "wse-008", "wse-009", "wse-010"],
          },
        ],
      },
      {
        id: "wse-u2",
        title: "Plan and Improve",
        description: "Shared planning, clear ownership, and feedback-led revision.",
        lessons: [
          {
            id: "wse-u2-l1",
            title: "Build a Practical Plan",
            objective: "Plan task order, division, ownership, timing, and a conditional review.",
            cardIds: ["wse-011", "wse-012", "wse-013", "wse-014", "wse-015"],
          },
          {
            id: "wse-u2-l2",
            title: "Respond to Feedback",
            objective:
              "Give specific feedback and respond to suggestions with a clear next action.",
            cardIds: ["wse-016", "wse-017", "wse-018", "wse-019", "wse-020"],
          },
        ],
      },
    ],
  },
];

export const originalCourseCards: SentenceCard[] = [
  originalCard(
    "sf-001",
    "Hello, my name is Emma.",
    "你好，我叫艾玛。",
    ["greeting", "introductions", "names"],
  ),
  originalCard(
    "sf-002",
    "I'm new to this class.",
    "我是这个班的新同学。",
    ["introductions", "classroom", "be-verb"],
  ),
  originalCard(
    "sf-003",
    "I live near the river.",
    "我住在河边。",
    ["introductions", "places", "present-simple"],
  ),
  originalCard(
    "sf-004",
    "I enjoy learning with other people.",
    "我喜欢和其他人一起学习。",
    ["preferences", "learning", "gerund"],
  ),
  originalCard(
    "sf-005",
    "I want to practice every day.",
    "我想每天都练习。",
    ["goals", "practice", "infinitive"],
  ),
  originalCard(
    "sf-006",
    "I wake up at seven.",
    "我七点起床。",
    ["routines", "time", "present-simple"],
  ),
  originalCard(
    "sf-007",
    "I make tea before breakfast.",
    "我早餐前泡茶。",
    ["routines", "meals", "sequencing"],
  ),
  originalCard(
    "sf-008",
    "I usually walk to the bus stop.",
    "我通常步行去公交车站。",
    ["routines", "transport", "frequency"],
  ),
  originalCard(
    "sf-009",
    "I check my bag before I leave.",
    "离开前，我会检查一下自己的包。",
    ["routines", "preparation", "time-clause"],
  ),
  originalCard(
    "sf-010",
    "I read for a while at night.",
    "我晚上会读一会儿书。",
    ["routines", "reading", "time"],
  ),
  originalCard(
    "sf-011",
    "I need a glass of water.",
    "我需要一杯水。",
    ["needs", "drinks", "count-nouns"],
  ),
  originalCard(
    "sf-012",
    "Please help me carry this box.",
    "请帮我搬一下这个箱子。",
    ["requests", "help", "imperative"],
  ),
  originalCard(
    "sf-013",
    "Could you open the window?",
    "你能把窗户打开吗？",
    ["requests", "environment", "polite-question"],
  ),
  originalCard(
    "sf-014",
    "I'd like to take a few minutes to think.",
    "我想花几分钟考虑一下。",
    ["needs", "thinking", "polite-language"],
  ),
  originalCard(
    "sf-015",
    "Please tell me where I should wait.",
    "请告诉我应该在哪里等。",
    ["directions", "waiting", "embedded-question"],
  ),
  originalCard(
    "sf-016",
    "Could you repeat the last part?",
    "你能把最后一部分再说一遍吗？",
    ["clarification", "repetition", "listening"],
  ),
  originalCard(
    "sf-017",
    "Please speak a little more slowly.",
    "请说得再慢一点。",
    ["clarification", "speaking", "pace"],
  ),
  originalCard(
    "sf-018",
    "What does this word mean here?",
    "这个词在这里是什么意思？",
    ["clarification", "vocabulary", "meaning"],
  ),
  originalCard(
    "sf-019",
    "I missed the last few words.",
    "最后几个词我没听清。",
    ["listening", "past-simple", "repair"],
  ),
  originalCard(
    "sf-020",
    "Let me check if I understood correctly.",
    "让我确认一下自己是否理解正确。",
    ["clarification", "confirmation", "embedded-question"],
    ["Let me check whether I understood correctly."],
  ),
  originalCard(
    "wse-001",
    "I finished the first draft this morning.",
    "我今天上午完成了初稿。",
    ["status", "writing", "past-simple"],
  ),
  originalCard(
    "wse-002",
    "The data is ready for review.",
    "数据已经准备好，可以审阅了。",
    ["status", "data", "review"],
  ),
  originalCard(
    "wse-003",
    "I'm still checking the final section.",
    "我还在检查最后一部分。",
    ["status", "checking", "present-progressive"],
  ),
  originalCard(
    "wse-004",
    "We are waiting for one more reply.",
    "我们还在等一个回复。",
    ["status", "dependency", "waiting"],
  ),
  originalCard(
    "wse-005",
    "I should have an update by noon.",
    "我中午前应该会有最新进展。",
    ["status", "deadlines", "modal"],
  ),
  originalCard(
    "wse-006",
    "Could you share your notes with me?",
    "你能和我分享一下你的笔记吗？",
    ["requests", "notes", "collaboration"],
  ),
  originalCard(
    "wse-007",
    "Please send me the file before lunch.",
    "请在午饭前把文件发给我。",
    ["requests", "files", "deadlines"],
  ),
  originalCard(
    "wse-008",
    "Can we move the meeting to Friday?",
    "我们可以把会议改到星期五吗？",
    ["scheduling", "meetings", "negotiation"],
  ),
  originalCard(
    "wse-009",
    "I need your feedback on this outline.",
    "我需要你对这个提纲提些意见。",
    ["requests", "feedback", "outlining"],
  ),
  originalCard(
    "wse-010",
    "Would you explain how you reached that result?",
    "你能解释一下自己是怎么得出那个结果的吗？",
    ["requests", "reasoning", "explanation"],
  ),
  originalCard(
    "wse-011",
    "Let's list the tasks in order.",
    "我们按顺序列出任务吧。",
    ["planning", "sequencing", "tasks"],
  ),
  originalCard(
    "wse-012",
    "We can divide the work into three parts.",
    "我们可以把工作分成三个部分。",
    ["planning", "teamwork", "decomposition"],
    ["We can split the work into three parts."],
  ),
  originalCard(
    "wse-013",
    "I'll handle the research this afternoon.",
    "今天下午的调研由我来负责。",
    ["planning", "ownership", "research"],
  ),
  originalCard(
    "wse-014",
    "Please leave enough time for questions.",
    "请留出足够的提问时间。",
    ["planning", "time-management", "questions"],
  ),
  originalCard(
    "wse-015",
    "If we finish early, we can review together.",
    "如果我们提前完成，就可以一起检查一遍。",
    ["planning", "conditional", "review"],
  ),
  originalCard(
    "wse-016",
    "Your main point is easy to follow.",
    "你的主要观点很容易理解。",
    ["feedback", "clarity", "main-idea"],
  ),
  originalCard(
    "wse-017",
    "This example needs a clearer explanation.",
    "这个例子需要解释得更清楚一些。",
    ["feedback", "examples", "explanation"],
  ),
  originalCard(
    "wse-018",
    "I agree with most of your comments.",
    "你的意见大部分我都同意。",
    ["feedback", "agreement", "comments"],
  ),
  originalCard(
    "wse-019",
    "I'll revise the introduction before tomorrow's class.",
    "我会在明天上课前修改引言。",
    ["revision", "writing", "deadlines"],
  ),
  originalCard(
    "wse-020",
    "Thanks for pointing out what I missed.",
    "谢谢你指出我遗漏的地方。",
    ["feedback", "reflection", "gratitude"],
    ["Thank you for pointing out what I missed."],
  ),
];

function originalCard(
  id: string,
  english: string,
  prompt: string,
  tags: string[],
  acceptableAnswers: string[] = [],
): SentenceCard {
  return {
    id,
    english,
    prompt,
    source: originalContentSource,
    tags,
    acceptableAnswers,
    createdAt: seedCreatedAt,
    updatedAt: seedCreatedAt,
  };
}

import type { SentenceCard } from "../../domain/content/SentenceCard";
import type { Course } from "../../domain/curriculum/Course";
import { CC0_CONTENT_LICENSE } from "./originalCourses";

const ORIGINAL_CONTENT_SOURCE = "UtterLoop Original";
const SEED_CREATED_AT = "2026-07-31T00:00:00.000Z";

export const additionalCourses: Course[] = [
  {
    id: "travel-city-essentials",
    title: "Travel & City Essentials",
    description:
      "Build practical recall for finding your way, using public transport, checking in, and solving common travel problems.",
    categoryId: "travel-and-services",
    tags: ["travel", "directions", "public transport", "accommodation", "problem solving"],
    level: {
      label: "Elementary to Intermediate · A2–B1",
      cefrFrom: "A2",
      cefrTo: "B1",
    },
    provider: {
      kind: "original",
      name: "UtterLoop",
    },
    revision: 1,
    license: CC0_CONTENT_LICENSE,
    units: [
      {
        id: "tce-u1",
        title: "Move Around with Confidence",
        description: "Clear directions and dependable language for public transport.",
        lessons: [
          {
            id: "tce-u1-l1",
            title: "Find Your Way",
            objective:
              "Ask for directions, follow landmarks, and confirm that you are on the right route.",
            cardIds: ["tce-001", "tce-002", "tce-003", "tce-004", "tce-005"],
          },
          {
            id: "tce-u1-l2",
            title: "Use Public Transport",
            objective:
              "Choose a route, buy a pass, confirm stops, change lines, and handle a delay.",
            cardIds: ["tce-006", "tce-007", "tce-008", "tce-009", "tce-010"],
          },
        ],
      },
      {
        id: "tce-u2",
        title: "Arrive and Adapt",
        description: "Check-in exchanges and calm responses to common travel problems.",
        lessons: [
          {
            id: "tce-u2-l1",
            title: "Check In Smoothly",
            objective:
              "Confirm a reservation and ask practical questions about a place to stay.",
            cardIds: ["tce-011", "tce-012", "tce-013", "tce-014", "tce-015"],
          },
          {
            id: "tce-u2-l2",
            title: "Solve a Travel Problem",
            objective:
              "Report missing belongings, incorrect details, broken facilities, and an urgent need.",
            cardIds: ["tce-016", "tce-017", "tce-018", "tce-019", "tce-020"],
          },
        ],
      },
    ],
  },
  {
    id: "social-plans-stories",
    title: "Social Plans & Stories",
    description:
      "Build natural language for invitations, shared plans, recent experiences, and engaged follow-up questions.",
    categoryId: "everyday-communication",
    tags: ["social plans", "invitations", "preferences", "storytelling", "conversation"],
    level: {
      label: "Elementary to Intermediate · A2–B1",
      cefrFrom: "A2",
      cefrTo: "B1",
    },
    provider: {
      kind: "original",
      name: "UtterLoop",
    },
    revision: 1,
    license: CC0_CONTENT_LICENSE,
    units: [
      {
        id: "sps-u1",
        title: "Plan Time Together",
        description: "Friendly invitations, clear responses, and practical arrangements.",
        lessons: [
          {
            id: "sps-u1-l1",
            title: "Invite and Respond",
            objective:
              "Make an invitation and accept, suggest, or decline it in a friendly way.",
            cardIds: ["sps-001", "sps-002", "sps-003", "sps-004", "sps-005"],
          },
          {
            id: "sps-u1-l2",
            title: "Agree on the Details",
            objective:
              "Set a time and place, communicate delays, and leave room for a flexible plan.",
            cardIds: ["sps-006", "sps-007", "sps-008", "sps-009", "sps-010"],
          },
        ],
      },
      {
        id: "sps-u2",
        title: "Share Everyday Stories",
        description: "Simple past experiences and signals that keep a story moving.",
        lessons: [
          {
            id: "sps-u2-l1",
            title: "Talk About What Happened",
            objective:
              "Recall connected past-tense sentences about people, events, and memorable details.",
            cardIds: ["sps-011", "sps-012", "sps-013", "sps-014", "sps-015"],
          },
          {
            id: "sps-u2-l2",
            title: "Keep a Story Moving",
            objective:
              "Sequence a surprising event, describe a reaction, and ask an interested question.",
            cardIds: ["sps-016", "sps-017", "sps-018", "sps-019", "sps-020"],
          },
        ],
      },
    ],
  },
  {
    id: "meetings-decisions",
    title: "Meetings & Decisions",
    description:
      "Practice contributing ideas, clarifying positions, weighing trade-offs, reaching decisions, and recording next steps.",
    categoryId: "work-study",
    tags: ["meetings", "discussion", "opinions", "trade-offs", "decisions", "follow-up"],
    level: {
      label: "Intermediate to Upper Intermediate · B1–B2",
      cefrFrom: "B1",
      cefrTo: "B2",
    },
    provider: {
      kind: "original",
      name: "UtterLoop",
    },
    revision: 1,
    license: CC0_CONTENT_LICENSE,
    units: [
      {
        id: "md-u1",
        title: "Make the Discussion Useful",
        description: "Inclusive contributions, precise clarification, and balanced comparison.",
        lessons: [
          {
            id: "md-u1-l1",
            title: "Contribute and Clarify",
            objective:
              "Add a point, clarify language, state a position, disagree constructively, and invite others in.",
            cardIds: ["md-001", "md-002", "md-003", "md-004", "md-005"],
          },
          {
            id: "md-u1-l2",
            title: "Examine the Options",
            objective:
              "Compare realistic options, trade-offs, future flexibility, and possible risks.",
            cardIds: ["md-006", "md-007", "md-008", "md-009", "md-010"],
          },
        ],
      },
      {
        id: "md-u2",
        title: "Decide and Follow Through",
        description: "Clear decisions, named ownership, deadlines, and follow-up checks.",
        lessons: [
          {
            id: "md-u2-l1",
            title: "Reach a Decision",
            objective:
              "Test the group's preference, surface objections, and close on an adaptable decision.",
            cardIds: ["md-011", "md-012", "md-013", "md-014", "md-015"],
          },
          {
            id: "md-u2-l2",
            title: "Confirm the Next Steps",
            objective:
              "Summarize an agreement, assign ownership, confirm timing, and schedule follow-up.",
            cardIds: ["md-016", "md-017", "md-018", "md-019", "md-020"],
          },
        ],
      },
    ],
  },
];

export const additionalCourseCards: SentenceCard[] = [
  originalCard(
    "tce-001",
    "Excuse me, how do I get to the station?",
    "请问，我怎么去车站？",
    ["directions", "questions", "station"],
  ),
  originalCard(
    "tce-002",
    "Go straight until you reach the traffic lights.",
    "一直走，直到你到达红绿灯处。",
    ["directions", "landmarks", "time-clause"],
  ),
  originalCard(
    "tce-003",
    "Turn left at the second corner.",
    "在第二个路口左转。",
    ["directions", "sequencing", "imperative"],
  ),
  originalCard(
    "tce-004",
    "The museum is across from the bank.",
    "博物馆在银行对面。",
    ["directions", "places", "prepositions"],
  ),
  originalCard(
    "tce-005",
    "Are we still going in the right direction?",
    "我们还走在正确的方向上吗？",
    ["directions", "confirmation", "travel"],
  ),
  originalCard(
    "tce-006",
    "Which bus goes to the city center?",
    "哪路公交车去市中心？",
    ["transport", "questions", "city"],
  ),
  originalCard(
    "tce-007",
    "I'd like a day pass, please.",
    "我想买一张日票。",
    ["transport", "tickets", "polite-language"],
  ),
  originalCard(
    "tce-008",
    "Does this train stop at Central Square?",
    "这趟列车在中央广场停吗？",
    ["transport", "stops", "confirmation"],
  ),
  originalCard(
    "tce-009",
    "We need to change lines at the next station.",
    "我们需要在下一站换乘。",
    ["transport", "transfers", "planning"],
  ),
  originalCard(
    "tce-010",
    "The bus is running ten minutes late.",
    "公交车晚点十分钟。",
    ["transport", "delays", "time"],
  ),
  originalCard(
    "tce-011",
    "I have a reservation under the name Chen.",
    "我用陈这个名字预订了房间。",
    ["accommodation", "reservations", "check-in"],
  ),
  originalCard(
    "tce-012",
    "Could I see your passport, please?",
    "请出示一下您的护照，可以吗？",
    ["accommodation", "passport", "polite-question"],
  ),
  originalCard(
    "tce-013",
    "Is breakfast included with the room?",
    "房费包含早餐吗？",
    ["accommodation", "breakfast", "confirmation"],
  ),
  originalCard(
    "tce-014",
    "Could we have a quieter room?",
    "可以给我们安排一间更安静的房间吗？",
    ["accommodation", "requests", "comparatives"],
  ),
  originalCard(
    "tce-015",
    "What time do we need to check out?",
    "我们需要几点退房？",
    ["accommodation", "check-out", "time"],
  ),
  originalCard(
    "tce-016",
    "My suitcase has not arrived yet.",
    "我的行李箱还没有到。",
    ["travel-problems", "luggage", "present-perfect"],
    ["My suitcase hasn't arrived yet."],
  ),
  originalCard(
    "tce-017",
    "I think I left my phone in the taxi.",
    "我想我把手机落在出租车上了。",
    ["travel-problems", "lost-items", "past-simple"],
  ),
  originalCard(
    "tce-018",
    "This ticket shows the wrong date.",
    "这张票上的日期不对。",
    ["travel-problems", "tickets", "dates"],
  ),
  originalCard(
    "tce-019",
    "The air conditioner is not working.",
    "空调坏了。",
    ["travel-problems", "facilities", "present-progressive"],
    ["The air conditioner isn't working."],
  ),
  originalCard(
    "tce-020",
    "Could you help me find a nearby pharmacy?",
    "你能帮我找一家附近的药店吗？",
    ["travel-problems", "help", "pharmacy"],
  ),
  originalCard(
    "sps-001",
    "Are you free for coffee this weekend?",
    "你这周末有空一起喝咖啡吗？",
    ["invitations", "availability", "weekends"],
  ),
  originalCard(
    "sps-002",
    "I'd love to come, but I'm busy Saturday.",
    "我很想来，但星期六没空。",
    ["invitations", "declining", "contrast"],
  ),
  originalCard(
    "sps-003",
    "That sounds great to me.",
    "我觉得这个主意很棒。",
    ["invitations", "accepting", "reactions"],
  ),
  originalCard(
    "sps-004",
    "Maybe we could try that new café.",
    "也许我们可以去试试那家新咖啡馆。",
    ["invitations", "suggestions", "places"],
    ["Maybe we could try that new cafe."],
  ),
  originalCard(
    "sps-005",
    "Thanks for asking, but I can't make it.",
    "谢谢你邀请我，但我去不了。",
    ["invitations", "declining", "polite-language"],
    ["Thank you for asking, but I can't make it."],
  ),
  originalCard(
    "sps-006",
    "What time works best for you?",
    "什么时间对你最合适？",
    ["planning", "scheduling", "questions"],
  ),
  originalCard(
    "sps-007",
    "Let's meet outside the library at six.",
    "我们六点在图书馆外面见吧。",
    ["planning", "meeting-places", "time"],
  ),
  originalCard(
    "sps-008",
    "I might be a few minutes late.",
    "我可能会晚到几分钟。",
    ["planning", "delays", "modal"],
  ),
  originalCard(
    "sps-009",
    "Send me a message when you arrive.",
    "你到了以后给我发个消息。",
    ["planning", "messages", "time-clause"],
  ),
  originalCard(
    "sps-010",
    "We can decide what to do after dinner.",
    "我们可以晚饭后再决定做什么。",
    ["planning", "decisions", "flexibility"],
  ),
  originalCard(
    "sps-011",
    "I ran into an old friend yesterday.",
    "我昨天偶遇了一位老朋友。",
    ["storytelling", "friends", "past-simple"],
  ),
  originalCard(
    "sps-012",
    "We talked for nearly an hour.",
    "我们聊了将近一个小时。",
    ["storytelling", "conversation", "duration"],
  ),
  originalCard(
    "sps-013",
    "She told me about her new job.",
    "她跟我讲了她的新工作。",
    ["storytelling", "reported-speech", "work"],
  ),
  originalCard(
    "sps-014",
    "I tried something completely new last weekend.",
    "上周末我尝试了一件全新的事。",
    ["storytelling", "experiences", "past-simple"],
  ),
  originalCard(
    "sps-015",
    "The best part was meeting local people.",
    "最棒的部分是认识了当地人。",
    ["storytelling", "highlights", "gerund"],
  ),
  originalCard(
    "sps-016",
    "At first, everything seemed perfectly normal.",
    "起初，一切看起来都很正常。",
    ["storytelling", "sequencing", "description"],
  ),
  originalCard(
    "sps-017",
    "Then something unexpected happened.",
    "然后发生了一件意想不到的事。",
    ["storytelling", "sequencing", "surprise"],
  ),
  originalCard(
    "sps-018",
    "I could not believe what I saw.",
    "我简直不敢相信自己看到的东西。",
    ["storytelling", "reactions", "embedded-question"],
    ["I couldn't believe what I saw."],
  ),
  originalCard(
    "sps-019",
    "How did you react when that happened?",
    "那件事发生时你是怎么反应的？",
    ["conversation", "follow-up", "past-simple"],
  ),
  originalCard(
    "sps-020",
    "In the end, we laughed about it.",
    "最后，我们都拿这件事说笑了。",
    ["storytelling", "endings", "past-simple"],
  ),
  originalCard(
    "md-001",
    "I'd like to add one point here.",
    "我想在这里补充一点。",
    ["meetings", "contributions", "polite-language"],
  ),
  originalCard(
    "md-002",
    "Could you explain what you mean by practical?",
    "你能解释一下你说的“实用”是什么意思吗？",
    ["meetings", "clarification", "embedded-question"],
  ),
  originalCard(
    "md-003",
    "From my perspective, the main risk is timing.",
    "从我的角度来看，主要风险在于时机。",
    ["opinions", "risks", "framing"],
  ),
  originalCard(
    "md-004",
    "I agree with the goal, but not the approach.",
    "我赞同这个目标，但不赞同这种方法。",
    ["discussion", "disagreement", "contrast"],
  ),
  originalCard(
    "md-005",
    "Let's hear from someone who has not spoken yet.",
    "我们来听听还没有发言的人的意见吧。",
    ["meetings", "inclusion", "facilitation"],
    ["Let's hear from someone who hasn't spoken yet."],
  ),
  originalCard(
    "md-006",
    "We have three realistic options to consider.",
    "我们有三个切实可行的选项需要考虑。",
    ["decisions", "options", "discussion"],
  ),
  originalCard(
    "md-007",
    "The cheaper option would take much longer.",
    "更便宜的方案会花更长时间。",
    ["trade-offs", "cost", "comparatives"],
  ),
  originalCard(
    "md-008",
    "This approach gives us more flexibility later.",
    "这种方法以后能给我们更多灵活性。",
    ["trade-offs", "flexibility", "future"],
  ),
  originalCard(
    "md-009",
    "What would happen if demand increased suddenly?",
    "如果需求突然增加，会发生什么？",
    ["risks", "conditional", "demand"],
  ),
  originalCard(
    "md-010",
    "We should compare the benefits against the risks.",
    "我们应该比较收益和风险。",
    ["trade-offs", "benefits", "risks"],
  ),
  originalCard(
    "md-011",
    "It sounds like we prefer the second option.",
    "听起来我们更倾向于第二个方案。",
    ["decisions", "consensus", "options"],
  ),
  originalCard(
    "md-012",
    "Does anyone have a strong objection?",
    "有人强烈反对吗？",
    ["decisions", "objections", "questions"],
  ),
  originalCard(
    "md-013",
    "We can revisit this decision after the trial.",
    "我们可以在试行之后重新审视这个决定。",
    ["decisions", "experiments", "flexibility"],
  ),
  originalCard(
    "md-014",
    "Let's make a decision before we waste more time.",
    "我们别再浪费时间了，做个决定吧。",
    ["decisions", "urgency", "time"],
  ),
  originalCard(
    "md-015",
    "I support the proposal with one small change.",
    "做一个小调整后，我支持这个提案。",
    ["decisions", "proposals", "qualified-agreement"],
  ),
  originalCard(
    "md-016",
    "I'll summarize what we agreed on today.",
    "我来总结一下我们今天达成的共识。",
    ["follow-up", "summaries", "agreements"],
  ),
  originalCard(
    "md-017",
    "Maya will prepare the revised estimate.",
    "玛雅会准备修改后的估算。",
    ["follow-up", "ownership", "estimates"],
  ),
  originalCard(
    "md-018",
    "We need to confirm the deadline by Thursday.",
    "我们需要在星期四之前确认截止日期。",
    ["follow-up", "deadlines", "confirmation"],
  ),
  originalCard(
    "md-019",
    "Please flag any problems as soon as possible.",
    "如有任何问题，请尽快指出。",
    ["follow-up", "problems", "requests"],
  ),
  originalCard(
    "md-020",
    "Let's check our progress again next week.",
    "我们下周再检查一次进展吧。",
    ["follow-up", "progress", "scheduling"],
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
    source: ORIGINAL_CONTENT_SOURCE,
    tags,
    acceptableAnswers,
    createdAt: SEED_CREATED_AT,
    updatedAt: SEED_CREATED_AT,
  };
}

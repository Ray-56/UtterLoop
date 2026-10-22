import type { ContextCueSet, RehearsalTask, SentenceFamily, StudioExercise } from "./LearningStudio";

const contexts: Array<[string, string, string]> = [
  ["sf-001", "第一次加入学习小组，先打招呼，再用已学表达介绍自己的名字Emma。", "线上新同学见面会轮到你发言，礼貌地向大家介绍自己叫Emma。"],
  ["sf-002", "老师问你为什么不熟悉教室，用已学表达说明自己刚加入这个班。", "同学邀请你参加班级活动，你先说明自己是班里的新成员。"],
  ["sf-003", "朋友问你家附近有什么，用已学表达告诉对方你住在河边。", "新同事想了解你住的位置，你介绍自己的家在河附近。"],
  ["sf-004", "学习小组在了解你的偏好，告诉大家你喜欢和别人一起学习。", "朋友建议你独自复习，你用已学表达说明自己更享受和人一起学习。"],
  ["sf-005", "你为新课程设定目标，用已学表达说你想每天练习。", "朋友问你打算怎样坚持英语学习，你说明自己的每日练习愿望。"],
  ["sf-006", "新室友问你的作息，用已学表达告诉对方你七点醒来。", "讨论早晨安排时，你说明自己通常七点起床。"],
  ["sf-007", "朋友问你早晨先做什么，用已学表达说明你早餐前泡茶。", "室友准备早餐时，你介绍自己先泡茶的早晨习惯。"],
  ["sf-008", "同事问你怎么去乘车，用已学表达说你通常走到公交车站。", "讨论上班路上的活动时，你说明自己一般步行去公交站。"],
  ["sf-009", "朋友问你怎样避免落东西，用已学表达介绍出门前检查包的习惯。", "室友催你出门，你说明自己离开前会检查一下包。"],
  ["sf-010", "学习小组问你何时读书，用已学表达说你晚上读一会儿。", "朋友想了解你的晚间习惯，你简短介绍夜里阅读片刻这件事。"],
  ["sf-011", "活动结束后你有点渴，用已学表达向工作人员说明需要一杯水。", "服务员来询问你的需要，你说明自己想要一杯水。"],
  ["sf-012", "搬东西时这个箱子有点沉，用已学表达请身边的人帮你一起搬。", "你和朋友整理房间，礼貌地请朋友帮忙拿这个箱子。"],
  ["sf-013", "房间里有点闷，用已学表达礼貌地问对方能否打开窗户。", "会议室需要通风，你向坐在窗边的人提出开窗的请求。"],
  ["sf-014", "有人希望你马上决定，用已学表达礼貌地争取几分钟思考。", "讨论结束前轮到你作选择，你想先花几分钟想一想。"],
  ["sf-015", "工作人员让你稍等，用已学表达请对方告诉你该在哪里等待。", "你到达接待处，需要询问自己应该在什么位置等候。"],
  ["sf-016", "电话里最后一部分没听清，用已学表达礼貌地请对方重复那部分。", "讲解结束时你错过了结尾，问对方能否重说最后一部分。"],
  ["sf-017", "对方讲话太快，用已学表达礼貌地请他稍微放慢一点。", "你正在听一段说明，想请求说话的人再慢一点。"],
  ["sf-018", "你认识这个词但不懂它在这句话里的用法，用已学表达询问这里的词义。", "一起阅读时遇到一个含义不明确的词，你询问它在此处是什么意思。"],
  ["sf-019", "音频在结尾时有干扰，用已学表达说明最后几个词没听清。", "朋友问你哪部分没听到，你说明自己错过了最后几个词。"],
  ["sf-020", "核对对方刚给出的信息时，用已学表达说明你想确认自己是否理解正确。", "听完一段解释后，你先提出核对一下自己的理解是否正确。"],
];

export const CONTEXT_CUES: ContextCueSet[] = contexts.map(([cardId, training, heldOut]) => ({
  cardId,
  cues: [
    { id: `${cardId}:context:train`, prompt: training, stage: "training" },
    { id: `${cardId}:context:test`, prompt: heldOut, stage: "held-out" },
  ],
}));

function exercise(id: string, prompt: string, target: string, heldOut = false, acceptableAnswers: string[] = []): StudioExercise {
  return { id, prompt, target, acceptableAnswers, stage: heldOut ? "held-out" : "training" };
}

export const SENTENCE_FAMILIES: SentenceFamily[] = [
  {
    id: "polite-request", title: "Make a polite request", pattern: "Could you + action + details?",
    explanation: "用Could you礼貌请求。改变动作、接收者或时间时，动词保留原形。练习本组指定句型；合理的其他表达可作为个人句子保存。",
    exercises: [
      exercise("request-1", "礼貌请求对方把这个文件发给我。", "Could you send me the file?"),
      exercise("request-2", "礼貌请求对方把这个链接发给我们。", "Could you send us the link?"),
      exercise("request-3", "礼貌请求对方星期五前把这个文件发给我。", "Could you send me the file before Friday?"),
      exercise("request-4", "用本组句型，请对方星期五前把这个链接发给我们。", "Could you send us the link before Friday?", true),
      exercise("request-5", "用本组句型，请对方明天把这份报告发给我。", "Could you send me the report tomorrow?", true),
    ],
  },
  {
    id: "need-time", title: "Ask for thinking time", pattern: "I'd like to + action.",
    explanation: "I'd like to后接动词原形，表达礼貌的愿望。I'd与I would在本组等价。",
    exercises: [
      exercise("time-1", "礼貌地说你想花几分钟思考。", "I'd like to take a few minutes to think."),
      exercise("time-2", "礼貌地说你想先检查这份报告。", "I'd like to check the report first."),
      exercise("time-3", "礼貌地说你想和团队讨论这个计划。", "I'd like to discuss the plan with the team."),
      exercise("time-4", "用本组句型说你想先检查这个计划。", "I'd like to check the plan first.", true),
      exercise("time-5", "用本组句型说你想和团队讨论这份报告。", "I'd like to discuss the report with the team.", true),
    ],
  },
  {
    id: "before-action", title: "Put actions in order", pattern: "I + action + before I + action.",
    explanation: "before引导的部分说明后发生的动作；注意主句和从句都保留主语I。",
    exercises: [
      exercise("before-1", "说你出门前检查包。", "I check my bag before I leave."),
      exercise("before-2", "说你发出报告前检查报告。", "I check the report before I send it."),
      exercise("before-3", "说你开始前读一遍说明。", "I read the instructions before I start."),
      exercise("before-4", "用本组句型说你开始前检查这个计划。", "I check the plan before I start.", true),
      exercise("before-5", "用本组句型说你出门前读一遍报告。", "I read the report before I leave.", true),
    ],
  },
  {
    id: "need-something", title: "Explain what you need", pattern: "I need + a/an + thing.",
    explanation: "单数可数名词通常需要限定词；按读音选a或an。这里练习明确数量的一件物品。",
    exercises: [
      exercise("need-1", "说你需要一杯水。", "I need a glass of water."),
      exercise("need-2", "说你需要一支笔。", "I need a pen."),
      exercise("need-3", "说你需要一个例子。", "I need an example."),
      exercise("need-4", "用本组句型说你需要一个信封。", "I need an envelope.", true),
      exercise("need-5", "用本组句型说你需要一份报告的副本。", "I need a copy of the report.", true),
    ],
  },
  {
    id: "duration-start", title: "Distinguish duration and starting point", pattern: "I've + past participle + for/since + time.",
    explanation: "for后面是持续时长，since后面是开始时间。本组围绕居住和工作练习这一区别。",
    exercises: [
      exercise("duration-1", "说你在这里住了两年。", "I've lived here for two years."),
      exercise("duration-2", "说你从2024年起住在这里。", "I've lived here since 2024."),
      exercise("duration-3", "说你在这里工作了三个月。", "I've worked here for three months."),
      exercise("duration-since-tuesday", "用本组句型说你从星期二起在这里工作。", "I've worked here since Tuesday.", true),
      exercise("duration-5", "用本组句型说你在这里住了六个月。", "I've lived here for six months.", true),
    ],
  },
];

export const REHEARSAL_TASKS: RehearsalTask[] = [
  {
    id: "request-extension", title: "Request an extension", description: "一次简短的进度沟通：说明现状、解释原因、请求新时间，并给出承诺。",
    steps: [
      exercise("extension-1", "先说明：我已经完成初稿。", "I've finished the first draft."),
      exercise("extension-2", "接着解释：我正在等最终的数据。", "I'm waiting for the final data."),
      exercise("extension-3", "礼貌请求：我们可以把截止日期移到星期五吗？", "Could we move the deadline to Friday?"),
      exercise("extension-4", "最后承诺：我会在星期五前把报告发给你。", "I'll send you the report by Friday."),
    ],
  },
  {
    id: "clarify-misunderstanding", title: "Clarify a misunderstanding", description: "没听清时先争取更慢的语速，再请对方重复，最后核对并致谢。",
    steps: [
      exercise("clarify-1", "先请求对方说得再慢一点。", "Please speak a little more slowly."),
      exercise("clarify-2", "最后一部分仍没听清，礼貌请求重复。", "Could you repeat the last part?"),
      exercise("clarify-3", "核对具体信息：会议是星期五，对吗？", "The meeting is on Friday, right?", false, ["The meeting is on Friday, isn't it?"]),
      exercise("clarify-4", "对方确认后，感谢对方帮你澄清。", "Thanks for clearing that up."),
    ],
  },
  {
    id: "hotel-help", title: "Get help at a hotel", description: "办理入住、描述问题、请求帮助，最后确认等待位置。",
    steps: [
      exercise("hotel-1", "礼貌说明你想办理入住。", "I'd like to check in."),
      exercise("hotel-2", "告诉前台：我房间的钥匙不能用了。", "My room key isn't working."),
      exercise("hotel-3", "礼貌请求给你一张新钥匙。", "Could you give me a new key?"),
      exercise("hotel-4", "需要等候时，请对方告诉你该在哪里等。", "Please tell me where I should wait."),
    ],
  },
];

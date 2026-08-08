import type {
  GrammarRole,
  SentenceLearningSupport,
} from "../../domain/content/SentenceLearningSupport";

interface SupportDefinition {
  context: string;
  communicativeFunction: string;
  pattern: string;
  keywords: string[];
  frame: string;
  sentenceIpa: string;
  tokenAnnotations: Array<[
    text: string,
    gloss: string,
    partOfSpeech: string,
  ]>;
  pronunciationChunks: Array<[text: string, ipa: string]>;
  grammarStructure: string;
  grammarExplanation: string;
  grammarPoints: string[];
  grammarChunks: Array<[text: string, role: GrammarRole, label: string]>;
}

export const starterLearningSupportByCardId: Readonly<Record<string, SentenceLearningSupport>> = {
  "sf-001": support({
    context: "第一次见面时，主动向对方介绍自己的名字。",
    communicativeFunction: "打招呼并自我介绍",
    pattern: "Hello, my name is + 名字.",
    keywords: ["Hello", "Emma"],
    frame: "Hello, my name is ___.",
    sentenceIpa: "/həˈloʊ maɪ neɪm ɪz ˈɛmə/",
    tokenAnnotations: [
      ["Hello,", "你好", "感叹词"],
      ["my", "我的", "物主限定词"],
      ["name", "名字", "名词"],
      ["is", "是", "系动词"],
      ["Emma.", "艾玛", "专有名词"],
    ],
    pronunciationChunks: [
      ["Hello,", "/həˈloʊ/"],
      ["my name", "/maɪ neɪm/"],
      ["is Emma.", "/ɪz ˈɛmə/"],
    ],
    grammarStructure: "Greeting + S + be + C",
    grammarExplanation: "my name 作主语，is 连接姓名；Hello 用来先建立友好的语气。",
    grammarPoints: ["my name is 介绍姓名", "be 动词 is"],
    grammarChunks: [
      ["Hello,", "other", "问候语"],
      ["my name", "subject", "主语 S"],
      ["is", "predicate", "系动词 V"],
      ["Emma.", "complement", "表语 C"],
    ],
  }),
  "sf-002": support({
    context: "刚加入一个班级时，告诉同学自己是新来的。",
    communicativeFunction: "说明自己的新成员身份",
    pattern: "I'm + 形容词 + to + 群体/地点.",
    keywords: ["new", "class"],
    frame: "I'm ___ to this ___.",
    sentenceIpa: "/aɪm nu tə ðɪs klæs/",
    tokenAnnotations: [
      ["I'm", "我是", "代词 + 系动词缩写"],
      ["new", "新来的", "形容词"],
      ["to", "对；对于", "介词"],
      ["this", "这个", "限定词"],
      ["class.", "班级", "名词"],
    ],
    pronunciationChunks: [
      ["I'm", "/aɪm/"],
      ["new", "/nu/"],
      ["to this class.", "/tə ðɪs klæs/"],
    ],
    grammarStructure: "S + be + C + A",
    grammarExplanation: "I'm 是 I am 的缩写，new 描述当前身份，to this class 补充所属群体。",
    grammarPoints: ["I'm = I am", "new to 表示刚加入"],
    grammarChunks: [
      ["I'm", "subject", "主语 + be"],
      ["new", "complement", "表语 C"],
      ["to this class.", "adverbial", "补充说明 A"],
    ],
  }),
  "sf-003": support({
    context: "自我介绍时，简单说明自己住在哪里。",
    communicativeFunction: "描述居住位置",
    pattern: "I live + 地点介词短语.",
    keywords: ["live", "river"],
    frame: "I ___ near the ___.",
    sentenceIpa: "/aɪ lɪv nɪr ðə ˈrɪvər/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["live", "居住", "动词"],
      ["near", "在……附近", "介词"],
      ["the", "表示特指", "限定词"],
      ["river.", "河", "名词"],
    ],
    pronunciationChunks: [
      ["I", "/aɪ/"],
      ["live", "/lɪv/"],
      ["near the river.", "/nɪr ðə ˈrɪvər/"],
    ],
    grammarStructure: "S + V + A",
    grammarExplanation: "一般现在时 live 描述稳定事实，near the river 说明位置。",
    grammarPoints: ["一般现在时描述常态", "near + 地点"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["live", "predicate", "谓语 V"],
      ["near the river.", "adverbial", "地点状语 A"],
    ],
  }),
  "sf-004": support({
    context: "谈论学习偏好时，说明自己喜欢与人一起学习。",
    communicativeFunction: "表达学习偏好",
    pattern: "I enjoy + V-ing + with + 人.",
    keywords: ["learning", "people"],
    frame: "I enjoy ___ with other ___.",
    sentenceIpa: "/aɪ ɪnˈdʒɔɪ ˈlɝnɪŋ wɪð ˈʌðər ˈpipəl/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["enjoy", "喜欢", "动词"],
      ["learning", "学习", "动名词"],
      ["with", "和……一起", "介词"],
      ["other", "其他的", "限定词"],
      ["people.", "人们", "名词"],
    ],
    pronunciationChunks: [
      ["I enjoy", "/aɪ ɪnˈdʒɔɪ/"],
      ["learning", "/ˈlɝnɪŋ/"],
      ["with other people.", "/wɪð ˈʌðər ˈpipəl/"],
    ],
    grammarStructure: "S + V + O(V-ing) + A",
    grammarExplanation: "enjoy 后接动名词，with other people 说明一起参与的人。",
    grammarPoints: ["enjoy + V-ing", "with 表示共同参与"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["enjoy", "predicate", "谓语 V"],
      ["learning", "object", "宾语 O"],
      ["with other people.", "adverbial", "伴随状语 A"],
    ],
  }),
  "sf-005": support({
    context: "谈论英语学习目标时，说明自己希望每天练习。",
    communicativeFunction: "表达学习目标",
    pattern: "I want to + 动词原形 + 时间.",
    keywords: ["practice", "day"],
    frame: "I want to ___ every ___.",
    sentenceIpa: "/aɪ wɑnt tə ˈpræktɪs ˈɛvri deɪ/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["want", "想要", "动词"],
      ["to", "用于引出不定式", "不定式标记"],
      ["practice", "练习", "动词"],
      ["every", "每一个", "限定词"],
      ["day.", "天", "名词"],
    ],
    pronunciationChunks: [
      ["I want", "/aɪ wɑnt/"],
      ["to practice", "/tə ˈpræktɪs/"],
      ["every day.", "/ˈɛvri deɪ/"],
    ],
    grammarStructure: "S + V + to-infinitive + A",
    grammarExplanation: "want 后用 to 加动词原形表达目标，every day 表示频率。",
    grammarPoints: ["want to + 动词原形", "every day 表示每天"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["want", "predicate", "谓语 V"],
      ["to practice", "complement", "不定式补语 C"],
      ["every day.", "adverbial", "时间状语 A"],
    ],
  }),
  "sf-006": support({
    context: "介绍自己的早晨作息时，说出固定起床时间。",
    communicativeFunction: "描述日常起床时间",
    pattern: "I + 动词短语 + at + 时间.",
    keywords: ["wake", "seven"],
    frame: "I ___ up at ___.",
    sentenceIpa: "/aɪ weɪk ʌp ət ˈsɛvən/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["wake", "醒来", "动词"],
      ["up", "与 wake 构成“醒来”", "小品词"],
      ["at", "在", "介词"],
      ["seven.", "七点", "数词"],
    ],
    pronunciationChunks: [
      ["I", "/aɪ/"],
      ["wake up", "/weɪk ʌp/"],
      ["at seven.", "/ət ˈsɛvən/"],
    ],
    grammarStructure: "S + phrasal V + A",
    grammarExplanation: "wake up 是固定动词短语，具体钟点前使用 at。",
    grammarPoints: ["wake up 醒来（本句译“起床”）", "at + 钟点"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["wake up", "predicate", "谓语 V"],
      ["at seven.", "adverbial", "时间状语 A"],
    ],
  }),
  "sf-007": support({
    context: "描述早餐前的固定习惯。",
    communicativeFunction: "按先后顺序描述日常动作",
    pattern: "I + 动词 + 宾语 + before + 事件.",
    keywords: ["tea", "breakfast"],
    frame: "I make ___ before ___.",
    sentenceIpa: "/aɪ meɪk ti bɪˈfɔr ˈbrɛkfəst/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["make", "泡", "动词"],
      ["tea", "茶", "名词"],
      ["before", "在……之前", "介词"],
      ["breakfast.", "早餐", "名词"],
    ],
    pronunciationChunks: [
      ["I make tea", "/aɪ meɪk ti/"],
      ["before breakfast.", "/bɪˈfɔr ˈbrɛkfəst/"],
    ],
    grammarStructure: "S + V + O + A",
    grammarExplanation: "make tea 是动作和宾语，before breakfast 表示动作发生的时间。",
    grammarPoints: ["make + 饮品", "before + 名词"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["make", "predicate", "谓语 V"],
      ["tea", "object", "宾语 O"],
      ["before breakfast.", "adverbial", "时间状语 A"],
    ],
  }),
  "sf-008": support({
    context: "介绍自己平时去公交站的方式。",
    communicativeFunction: "描述出行习惯",
    pattern: "I + 频率副词 + 动词 + to + 地点.",
    keywords: ["usually", "walk"],
    frame: "I ___ ___ to the bus stop.",
    sentenceIpa: "/aɪ ˈjuʒuəli wɔk tə ðə bʌs stɑp/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["usually", "通常", "频率副词"],
      ["walk", "步行", "动词"],
      ["to", "到", "介词"],
      ["the", "表示特指", "限定词"],
      ["bus", "公交车", "名词定语"],
      ["stop.", "车站", "名词"],
    ],
    pronunciationChunks: [
      ["I usually", "/aɪ ˈjuʒuəli/"],
      ["walk", "/wɔk/"],
      ["to the bus stop.", "/tə ðə bʌs stɑp/"],
    ],
    grammarStructure: "S + frequency adverb + V + A",
    grammarExplanation: "usually 放在实义动词 walk 前，to the bus stop 表示目的地。",
    grammarPoints: ["频率副词位于实义动词前", "walk to + 地点"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["usually", "adverbial", "频率状语 A"],
      ["walk", "predicate", "谓语 V"],
      ["to the bus stop.", "adverbial", "方向状语 A"],
    ],
  }),
  "sf-009": support({
    context: "出门前说明自己会先检查随身物品。",
    communicativeFunction: "描述有先后关系的习惯",
    pattern: "I + 动词 + 宾语 + before + S + V.",
    keywords: ["check", "leave"],
    frame: "I ___ my bag before I ___.",
    sentenceIpa: "/aɪ tʃɛk maɪ bæɡ bɪˈfɔr aɪ liv/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["check", "检查", "动词"],
      ["my", "我的", "物主限定词"],
      ["bag", "包", "名词"],
      ["before", "在……之前", "从属连词"],
      ["I", "我", "代词"],
      ["leave.", "离开", "动词"],
    ],
    pronunciationChunks: [
      ["I check my bag", "/aɪ tʃɛk maɪ bæɡ/"],
      ["before I leave.", "/bɪˈfɔr aɪ liv/"],
    ],
    grammarStructure: "S + V + O + before-clause",
    grammarExplanation: "before 引出时间从句；谈日常习惯时主句和从句都用一般现在时。",
    grammarPoints: ["before 引导时间从句", "一般现在时描述习惯"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["check", "predicate", "谓语 V"],
      ["my bag", "object", "宾语 O"],
      ["before", "conjunction", "连词"],
      ["I", "subject", "从句主语 S"],
      ["leave.", "predicate", "从句谓语 V"],
    ],
  }),
  "sf-010": support({
    context: "介绍自己晚上的放松习惯。",
    communicativeFunction: "描述活动时长和时间",
    pattern: "I + 动词 + for + 时长 + at + 时间.",
    keywords: ["read", "night"],
    frame: "I ___ for a while at ___.",
    sentenceIpa: "/aɪ rid fər ə waɪl ət naɪt/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["read", "阅读", "动词"],
      ["for", "持续", "介词"],
      ["a", "一", "限定词"],
      ["while", "一会儿", "名词"],
      ["at", "在", "介词"],
      ["night.", "夜晚", "名词"],
    ],
    pronunciationChunks: [
      ["I read", "/aɪ rid/"],
      ["for a while", "/fər ə waɪl/"],
      ["at night.", "/ət naɪt/"],
    ],
    grammarStructure: "S + V + duration A + time A",
    grammarExplanation: "for a while 表示持续一段时间，at night 表示夜间这个时间段。",
    grammarPoints: ["for + 时长", "at night 在夜间"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["read", "predicate", "谓语 V"],
      ["for a while", "adverbial", "时长状语 A"],
      ["at night.", "adverbial", "时间状语 A"],
    ],
  }),
  "sf-011": support({
    context: "口渴时，清楚说出自己需要什么。",
    communicativeFunction: "表达即时需要",
    pattern: "I need + 数量短语 + 名词.",
    keywords: ["need", "water"],
    frame: "I ___ a glass of ___.",
    sentenceIpa: "/aɪ nid ə ɡlæs əv ˈwɔtər/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["need", "需要", "动词"],
      ["a", "一", "限定词"],
      ["glass", "杯", "名词"],
      ["of", "……的", "介词"],
      ["water.", "水", "名词"],
    ],
    pronunciationChunks: [
      ["I need", "/aɪ nid/"],
      ["a glass of water.", "/ə ɡlæs əv ˈwɔtər/"],
    ],
    grammarStructure: "S + V + O",
    grammarExplanation: "need 后直接接需要的事物；a glass of 用来计量不可数名词 water。",
    grammarPoints: ["need + 名词", "a glass of + 不可数名词"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["need", "predicate", "谓语 V"],
      ["a glass of water.", "object", "宾语 O"],
    ],
  }),
  "sf-012": support({
    context: "搬重物时，礼貌请求身边的人帮忙。",
    communicativeFunction: "请求协助",
    pattern: "Please + 动词 + 人 + 动词原形 + 物.",
    keywords: ["help", "box"],
    frame: "Please ___ me carry this ___.",
    sentenceIpa: "/pliz hɛlp mi ˈkæri ðɪs bɑks/",
    tokenAnnotations: [
      ["Please", "请", "礼貌副词"],
      ["help", "帮助", "动词"],
      ["me", "我", "代词"],
      ["carry", "搬", "动词"],
      ["this", "这个", "限定词"],
      ["box.", "箱子", "名词"],
    ],
    pronunciationChunks: [
      ["Please help me", "/pliz hɛlp mi/"],
      ["carry this box.", "/ˈkæri ðɪs bɑks/"],
    ],
    grammarStructure: "Please + V + O + bare infinitive",
    grammarExplanation: "help 后可接人，再接不带 to 的动词原形；Please 让请求更礼貌。",
    grammarPoints: ["help + 人 + 动词原形", "Please 表示礼貌"],
    grammarChunks: [
      ["Please", "other", "礼貌标记"],
      ["help", "predicate", "谓语 V"],
      ["me", "object", "宾语 O"],
      ["carry this box.", "complement", "动作补语 C"],
    ],
  }),
  "sf-013": support({
    context: "房间闷热时，礼貌请别人开窗。",
    communicativeFunction: "提出礼貌请求",
    pattern: "Could + 主语 + 动词原形 + 宾语?",
    keywords: ["open", "window"],
    frame: "Could you ___ the ___?",
    sentenceIpa: "/kʊd ju ˈoʊpən ðə ˈwɪndoʊ/",
    tokenAnnotations: [
      ["Could", "能否", "情态动词"],
      ["you", "你", "代词"],
      ["open", "打开", "动词"],
      ["the", "表示特指", "限定词"],
      ["window?", "窗户", "名词"],
    ],
    pronunciationChunks: [
      ["Could you", "/kʊd ju/"],
      ["open", "/ˈoʊpən/"],
      ["the window?", "/ðə ˈwɪndoʊ/"],
    ],
    grammarStructure: "Modal + S + V + O",
    grammarExplanation: "Could 放在主语前构成礼貌问句，后面的动词使用原形。",
    grammarPoints: ["Could you 表示礼貌请求", "情态动词后用动词原形"],
    grammarChunks: [
      ["Could", "modal", "情态动词"],
      ["you", "subject", "主语 S"],
      ["open", "predicate", "谓语 V"],
      ["the window?", "object", "宾语 O"],
    ],
  }),
  "sf-014": support({
    context: "需要暂缓回答时，礼貌表示自己想先思考几分钟。",
    communicativeFunction: "礼貌请求思考时间",
    pattern: "I'd like to + 动词 + 时间 + to + 动词.",
    keywords: ["minutes", "think"],
    frame: "I'd like to take a few ___ to ___.",
    sentenceIpa: "/aɪd laɪk tə teɪk ə fju ˈmɪnəts tə θɪŋk/",
    tokenAnnotations: [
      ["I'd", "I would 的缩写", "代词 + 情态动词缩写"],
      ["like", "想要", "动词"],
      ["to", "用于引出不定式", "不定式标记"],
      ["take", "花费", "动词"],
      ["a", "与 few 连用", "限定词"],
      ["few", "几个", "数量限定词"],
      ["minutes", "分钟", "名词"],
      ["to", "用于引出目的", "不定式标记"],
      ["think.", "思考", "动词"],
    ],
    pronunciationChunks: [
      ["I'd like", "/aɪd laɪk/"],
      ["to take a few minutes", "/tə teɪk ə fju ˈmɪnəts/"],
      ["to think.", "/tə θɪŋk/"],
    ],
    grammarStructure: "S + would + V + to-infinitive",
    grammarExplanation: "I'd like 是 I would like 的缩写，比 I want 更委婉；末尾不定式说明目的。",
    grammarPoints: ["I'd like = I would like", "to think 表示目的"],
    grammarChunks: [
      ["I'd", "subject", "主语 + would"],
      ["like", "predicate", "谓语 V"],
      ["to take a few minutes", "complement", "不定式补语 C"],
      ["to think.", "adverbial", "目的状语 A"],
    ],
  }),
  "sf-015": support({
    context: "到达一个地点后，不确定应该在哪里等候。",
    communicativeFunction: "请求说明等候地点",
    pattern: "Please tell me + 疑问词 + S + modal + V.",
    keywords: ["tell", "wait"],
    frame: "Please ___ me where I should ___.",
    sentenceIpa: "/pliz tɛl mi wɛr aɪ ʃəd weɪt/",
    tokenAnnotations: [
      ["Please", "请", "礼貌副词"],
      ["tell", "告诉", "动词"],
      ["me", "我", "代词"],
      ["where", "在哪里", "疑问副词"],
      ["I", "我", "代词"],
      ["should", "应该", "情态动词"],
      ["wait.", "等待", "动词"],
    ],
    pronunciationChunks: [
      ["Please tell me", "/pliz tɛl mi/"],
      ["where I should wait.", "/wɛr aɪ ʃəd weɪt/"],
    ],
    grammarStructure: "Please + V + O + embedded question",
    grammarExplanation: "where 引出嵌入式问句，后面保持陈述语序 I should wait。",
    grammarPoints: ["tell + 人 + 内容", "嵌入式问句用陈述语序"],
    grammarChunks: [
      ["Please", "other", "礼貌标记"],
      ["tell", "predicate", "谓语 V"],
      ["me", "object", "宾语 O"],
      ["where I should wait.", "complement", "嵌入式问句 C"],
    ],
  }),
  "sf-016": support({
    context: "没有听清上一段话时，请对方再说一次。",
    communicativeFunction: "请求重复信息",
    pattern: "Could you + 动词原形 + 宾语?",
    keywords: ["repeat", "part"],
    frame: "Could you ___ the last ___?",
    sentenceIpa: "/kʊd ju rɪˈpit ðə læst pɑrt/",
    tokenAnnotations: [
      ["Could", "能否", "情态动词"],
      ["you", "你", "代词"],
      ["repeat", "重复", "动词"],
      ["the", "表示特指", "限定词"],
      ["last", "最后的", "形容词"],
      ["part?", "部分", "名词"],
    ],
    pronunciationChunks: [
      ["Could you", "/kʊd ju/"],
      ["repeat", "/rɪˈpit/"],
      ["the last part?", "/ðə læst pɑrt/"],
    ],
    grammarStructure: "Modal + S + V + O",
    grammarExplanation: "Could you 构成礼貌请求，repeat 后直接接需要重复的内容。",
    grammarPoints: ["Could you + 动词原形", "repeat + 内容"],
    grammarChunks: [
      ["Could", "modal", "情态动词"],
      ["you", "subject", "主语 S"],
      ["repeat", "predicate", "谓语 V"],
      ["the last part?", "object", "宾语 O"],
    ],
  }),
  "sf-017": support({
    context: "对方说得太快时，请对方稍微放慢语速。",
    communicativeFunction: "请求调整说话速度",
    pattern: "Please + 动词 + 程度 + 方式副词.",
    keywords: ["speak", "slowly"],
    frame: "Please ___ a little more ___.",
    sentenceIpa: "/pliz spik ə ˈlɪtəl mɔr ˈsloʊli/",
    tokenAnnotations: [
      ["Please", "请", "礼貌副词"],
      ["speak", "说", "动词"],
      ["a", "与 little 连用", "限定词"],
      ["little", "一点", "程度副词"],
      ["more", "更", "程度副词"],
      ["slowly.", "缓慢地", "副词"],
    ],
    pronunciationChunks: [
      ["Please speak", "/pliz spik/"],
      ["a little more slowly.", "/ə ˈlɪtəl mɔr ˈsloʊli/"],
    ],
    grammarStructure: "Please + V + degree A + manner A",
    grammarExplanation: "slowly 修饰 speak；a little more 表示只需稍微增加程度。",
    grammarPoints: ["方式副词修饰动词", "a little more 表示稍微更……"],
    grammarChunks: [
      ["Please", "other", "礼貌标记"],
      ["speak", "predicate", "谓语 V"],
      ["a little more", "adverbial", "程度状语 A"],
      ["slowly.", "adverbial", "方式状语 A"],
    ],
  }),
  "sf-018": support({
    context: "阅读或听到一个词时，询问它在当前语境中的意思。",
    communicativeFunction: "询问词义",
    pattern: "What does + 主语 + 动词原形 + 语境?",
    keywords: ["word", "mean"],
    frame: "What does this ___ ___ here?",
    sentenceIpa: "/wʌt dəz ðɪs wɝd min hɪr/",
    tokenAnnotations: [
      ["What", "什么", "疑问代词"],
      ["does", "用于构成疑问", "助动词"],
      ["this", "这个", "限定词"],
      ["word", "词", "名词"],
      ["mean", "意思是", "动词"],
      ["here?", "在这里", "副词"],
    ],
    pronunciationChunks: [
      ["What does", "/wʌt dəz/"],
      ["this word mean", "/ðɪs wɝd min/"],
      ["here?", "/hɪr/"],
    ],
    grammarStructure: "Wh-object + auxiliary + S + V + A",
    grammarExplanation: "does 帮助构成一般现在时疑问句，因此主要动词 mean 使用原形。",
    grammarPoints: ["does 后用动词原形", "What 询问含义"],
    grammarChunks: [
      ["What", "object", "疑问宾语 O"],
      ["does", "auxiliary", "助动词"],
      ["this word", "subject", "主语 S"],
      ["mean", "predicate", "谓语 V"],
      ["here?", "adverbial", "语境状语 A"],
    ],
  }),
  "sf-019": support({
    context: "刚才没听清结尾时，向对方说明自己漏掉了哪些内容。",
    communicativeFunction: "说明听漏的信息",
    pattern: "I + 过去式 + 宾语.",
    keywords: ["missed", "words"],
    frame: "I ___ the last few ___.",
    sentenceIpa: "/aɪ mɪst ðə læst fju wɝdz/",
    tokenAnnotations: [
      ["I", "我", "代词"],
      ["missed", "没听清", "动词"],
      ["the", "表示特指", "限定词"],
      ["last", "最后的", "形容词"],
      ["few", "几个", "数量限定词"],
      ["words.", "词", "名词"],
    ],
    pronunciationChunks: [
      ["I missed", "/aɪ mɪst/"],
      ["the last few words.", "/ðə læst fju wɝdz/"],
    ],
    grammarStructure: "S + past V + O",
    grammarExplanation: "missed 用一般过去时说明刚才发生的听漏，the last few words 指明范围。",
    grammarPoints: ["missed 是 miss 的过去式", "the last few + 复数名词"],
    grammarChunks: [
      ["I", "subject", "主语 S"],
      ["missed", "predicate", "过去式谓语 V"],
      ["the last few words.", "object", "宾语 O"],
    ],
  }),
  "sf-020": support({
    context: "准备回应前，先确认自己是否准确理解了对方。",
    communicativeFunction: "确认理解是否正确",
    pattern: "Let me + 动词 + if + S + 过去式 + 副词.",
    keywords: ["check", "understood"],
    frame: "Let me ___ if I ___ correctly.",
    sentenceIpa: "/lɛt mi tʃɛk ɪf aɪ ˌʌndərˈstʊd kəˈrɛktli/",
    tokenAnnotations: [
      ["Let", "让", "动词"],
      ["me", "我", "代词"],
      ["check", "确认", "动词"],
      ["if", "是否", "从属连词"],
      ["I", "我", "代词"],
      ["understood", "理解了", "动词"],
      ["correctly.", "正确地", "副词"],
    ],
    pronunciationChunks: [
      ["Let me check", "/lɛt mi tʃɛk/"],
      ["if I understood", "/ɪf aɪ ˌʌndərˈstʊd/"],
      ["correctly.", "/kəˈrɛktli/"],
    ],
    grammarStructure: "Let + O + V + if-clause",
    grammarExplanation: "Let me check 用来请求短暂确认；if 引出需要核实的间接问题。",
    grammarPoints: ["Let me + 动词", "if 引出是否从句"],
    grammarChunks: [
      ["Let", "predicate", "使役谓语 V"],
      ["me", "object", "宾语 O"],
      ["check", "complement", "动作补语 C"],
      ["if", "conjunction", "连词"],
      ["I", "subject", "从句主语 S"],
      ["understood", "predicate", "从句谓语 V"],
      ["correctly.", "adverbial", "方式状语 A"],
    ],
  }),
};

function support(definition: SupportDefinition): SentenceLearningSupport {
  const pronunciationTokens = definition.pronunciationChunks.flatMap(([text, ipa]) => {
    const writtenTokens = splitWrittenTokens(text);
    const ipaTokens = splitIpaTokens(ipa, definition);

    if (writtenTokens.length !== ipaTokens.length) {
      throw authoringError(
        definition,
        `pronunciation chunk "${text}" has ${writtenTokens.length} written tokens but ${ipaTokens.length} IPA units`,
      );
    }

    return writtenTokens.map((token, index) => ({
      text: token,
      ipa: `/${ipaTokens[index]}/`,
    }));
  });

  if (pronunciationTokens.length !== definition.tokenAnnotations.length) {
    throw authoringError(
      definition,
      `pronunciation provides ${pronunciationTokens.length} tokens but ${definition.tokenAnnotations.length} annotations were authored`,
    );
  }

  const authoredTokens = definition.tokenAnnotations.map(
    ([text, gloss, partOfSpeech], index) => {
      requireAuthoredText(text, `token ${index + 1} text`, definition);
      requireAuthoredText(gloss, `token ${index + 1} gloss`, definition);
      requireAuthoredText(partOfSpeech, `token ${index + 1} part of speech`, definition);

      const pronunciationToken = pronunciationTokens[index];
      if (normalizeWrittenToken(text) !== normalizeWrittenToken(pronunciationToken.text)) {
        throw authoringError(
          definition,
          `token ${index + 1} is "${text}" in annotations but "${pronunciationToken.text}" in pronunciation chunks`,
        );
      }

      return {
        text,
        ipa: pronunciationToken.ipa,
        gloss,
        partOfSpeech,
      };
    },
  );

  let tokenOffset = 0;
  const grammarChunks = definition.grammarChunks.map(([text, role, label]) => {
    const chunkWords = splitWrittenTokens(text);
    const tokens = authoredTokens.slice(tokenOffset, tokenOffset + chunkWords.length);

    if (tokens.length !== chunkWords.length) {
      throw authoringError(
        definition,
        `grammar chunk "${text}" extends beyond the authored token sequence`,
      );
    }

    chunkWords.forEach((word, index) => {
      if (normalizeWrittenToken(word) !== normalizeWrittenToken(tokens[index].text)) {
        throw authoringError(
          definition,
          `grammar chunk "${text}" expects "${word}" at token ${tokenOffset + index + 1}, but the annotation is "${tokens[index].text}"`,
        );
      }
    });

    tokenOffset += chunkWords.length;
    return { text, role, label, tokens };
  });

  if (tokenOffset !== authoredTokens.length) {
    throw authoringError(
      definition,
      `grammar chunks consume ${tokenOffset} tokens but ${authoredTokens.length} annotations were authored`,
    );
  }

  return {
    context: definition.context,
    communicativeFunction: definition.communicativeFunction,
    pattern: definition.pattern,
    keywords: definition.keywords,
    frame: definition.frame,
    pronunciation: {
      dialect: "en-US",
      sentenceIpa: definition.sentenceIpa,
      chunks: definition.pronunciationChunks.map(([text, ipa]) => ({ text, ipa })),
    },
    grammar: {
      structure: definition.grammarStructure,
      explanation: definition.grammarExplanation,
      points: definition.grammarPoints,
      chunks: grammarChunks,
    },
  };
}

function splitWrittenTokens(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function splitIpaTokens(ipa: string, definition: SupportDefinition): string[] {
  if (ipa !== ipa.trim() || !ipa.startsWith("/") || !ipa.endsWith("/")) {
    throw authoringError(definition, `pronunciation IPA "${ipa}" must be trimmed and enclosed in slashes`);
  }

  const tokens = ipa.slice(1, -1).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw authoringError(definition, "pronunciation IPA must contain at least one unit");
  }
  return tokens;
}

function requireAuthoredText(
  value: string,
  field: string,
  definition: SupportDefinition,
): void {
  if (!value || value !== value.trim()) {
    throw authoringError(definition, `${field} must be non-empty and trimmed`);
  }
}

function normalizeWrittenToken(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, "");
}

function authoringError(definition: SupportDefinition, message: string): Error {
  const target = definition.grammarChunks.map(([text]) => text).join(" ");
  return new Error(`Starter learning-support authoring error for "${target}": ${message}.`);
}

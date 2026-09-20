// 質問バンク。次にどれを聞くかは Jev の Choice が選ぶ（＝人によって出題が変わる）。
// hint は「この質問が何を炙り出すか」のメモ。モデルの出題選択に渡す。

/**
 * cat は「何の証拠を取りに行く質問か」。
 * 次の質問を Jev に選ばせる前に、コード側でカテゴリを固定する。
 * これをやらないと Jev は性格系の質問ばかり選び、地域の証拠が一切集まらず、
 * 出身地の答えが事前分布（＝東京）に張り付く。証拠は取りに行かせる。
 */
export type Category = "geo" | "age" | "style" | "personality";

export type Question = {
  id: string;
  text: string;
  options: string[];
  hint: string;
  cat: Category;
  /** 表示用の英訳。Jev に渡す state は常に日本語のまま。 */
  en?: { text: string; options: string[] };
  /**
   * 抽選の重み。質問の情報量は均等ではない。
   * 「雪かき」「方言」は南北・東西を一発で切るが、「新幹線」「うどんとそば」は
   * ほとんど何も切らない。等確率で引くと、弱い質問ばかり当たった回で
   * 地域判定が事故る（実測：地域2問以下だと正解 0/7）。
   * 3 = 決定的 / 2 = そこそこ / 1 = 風味づけ
   */
  w?: number;
};

/**
 * 12問の配分。固定の順番にすると誰がやっても同じ質問列になるので、
 * 「残り枠の多いカテゴリほど選ばれやすい」重み付き抽選にする。
 * 序盤2問だけは geo で固定（地域の証拠が無いと出身地が事前分布に落ちるため）。
 */
// 地域は4問だと平均2.9問しか出ず当たらなかったので5問に増やした。
export const QUOTA: Record<Category, number> = {
  geo: 5,
  age: 2,
  style: 2,
  personality: 3,
};

// 1問目は地域、2問目は性格。人格判定は証拠がないと動かないので早く1問渡す。
export const FORCED_OPENING: Category[] = ["geo", "personality"];

/** Jev に見せる候補の上限。全部見せると毎回同じ質問が選ばれる。 */
export const CANDIDATE_SAMPLE = 5;

/**
 * 地域を切り分ける力が突出して強い質問。
 *
 * 47択を4〜5問で当てるのは情報量がぎりぎりなので、決定的な質問が1問でも
 * 欠けると判定が崩れる。実測：この中から3問答えただけで福岡 90%／広島 99% まで
 * 行くのに対し、弱い質問3問（うどん・新幹線・味噌汁）だと関東 67% と正反対に出た。
 * Jev に「次に聞くと情報量が大きい質問」を選ばせても拾い切れなかったので、
 * 地域枠はまずこの中から埋める。多様性は「6問中どの5問か」で確保する。
 */
// コアの数は「実際に聞く数」とほぼ同じに保つこと。
// 増やすと決定打を引き損ねる回が増えて、かえって精度が落ちる。
// 実測：コア6問 → 12/16 正解、コア8問に増やすと 8/16 まで悪化した。
export const GEO_CORE = [
  "hougen2", // 九州・中国・四国を切る
  "yukikaki", // 南北を切る
  "hougen", // 関東・関西・東北を切る
  "taifu", // 九州・沖縄を切る
  "escalator", // 東西を切る
  "umi", // 内陸県を切る
];

export const QUESTIONS: Question[] = [
  // --- 地域が出る ---
  { id: "escalator", text: "エスカレーター、どっち側に立つ？", options: ["左に立つ", "右に立つ", "その時による", "歩く"], cat: "geo", hint: "東西の地域差", w: 2 , en: { text: "Which side do you stand on, on an escalator?", options: ["Left", "Right", "Depends", "I walk up"] } },
  { id: "misoshiru", text: "味噌汁の具、これが入ってたら「違う」と思うものは？", options: ["さつまいも", "もやし", "レタス", "特にない"], cat: "geo", hint: "地域の食文化", w: 1 , en: { text: "Which ingredient in miso soup feels *wrong* to you?", options: ["Sweet potato", "Bean sprouts", "Lettuce", "Nothing bothers me"] } },
  { id: "unagi", text: "うなぎは蒸す？蒸さない？", options: ["蒸すでしょ", "蒸さないでしょ", "考えたこともない"], cat: "geo", hint: "関東関西の境界", w: 2 , en: { text: "Eel — steamed before grilling, or not?", options: ["Steamed, obviously", "Not steamed, obviously", "Never thought about it"] } },
  { id: "car", text: "移動手段、いちばん現実的なのは？", options: ["電車", "車", "自転車", "歩き"], cat: "geo", hint: "都市部か地方か", w: 2 , en: { text: "What's your realistic way of getting around?", options: ["Train", "Car", "Bicycle", "Walking"] } },
  { id: "snow", text: "雪が降ったら、まず何を思う？", options: ["きれい", "だるい", "電車止まる", "また降ったか"], cat: "geo", hint: "降雪地帯かどうか", w: 3 , en: { text: "It's snowing. First thought?", options: ["Pretty", "Ugh", "The trains will stop", "Snowing again, huh"] } },
  { id: "nickname_tokyo", text: "「今度東京行くんだ」と言われたら？", options: ["どこ行くの？", "いいなー", "え、住んでるけど", "都会は疲れるよ"], cat: "geo", hint: "首都圏在住か", w: 2 , en: { text: "Someone says \"I'm visiting Tokyo soon.\" You reply:", options: ["Where are you going?", "Lucky you", "…I live there", "Big cities are exhausting"] } },
  { id: "kaimono", text: "買い物、どこに行く？", options: ["駅ビル", "イオン", "商店街", "ネットで済ます"], cat: "geo", hint: "都市規模", w: 2 , en: { text: "Where do you shop?", options: ["Station mall", "Big suburban mall", "Local shopping street", "Online only"] } },
  { id: "hougen", text: "とっさに出る言葉は？", options: ["じゃん", "やん", "だべ", "特になまらない"], cat: "geo", hint: "方言の地域", w: 3 , en: { text: "Which of these slips out of your mouth?", options: ["\"jan\"", "\"yan\"", "\"dabe\"", "I don't have an accent"] } },
  { id: "yukikaki", text: "雪かきをしたことは？", options: ["毎年する", "たまにする", "したことない", "雪を見たことがない"], cat: "geo", hint: "豪雪地帯か南国か、南北を一発で切る", w: 3 , en: { text: "Have you ever shovelled snow?", options: ["Every year", "Once in a while", "Never", "I've never seen snow"] } },
  { id: "umi", text: "家から海まで、どのくらい？", options: ["歩ける", "車で30分", "1時間以上", "海がない"], cat: "geo", hint: "内陸県かどうか", w: 3 , en: { text: "How far is the sea from your home?", options: ["Walking distance", "30 min by car", "Over an hour", "There is no sea"] } },
  { id: "taifu", text: "台風が近づいてきたら？", options: ["慣れてる", "身構える", "ちょっとワクワクする", "ほとんど来ない"], cat: "geo", hint: "九州沖縄か、日本海側か", w: 3 , en: { text: "A typhoon is coming. You:", options: ["Used to it", "Brace yourself", "Get a little excited", "They don't really come here"] } },
  { id: "hougen2", text: "この語尾、聞き覚えある？", options: ["〜ばい／〜と？", "〜じゃけん", "〜やけん", "どれも使わない"], cat: "geo", hint: "九州・中国・四国を切り分ける", w: 3 , en: { text: "Which sentence ending sounds familiar?", options: ["\"~bai\" / \"~to?\"", "\"~jaken\"", "\"~yaken\"", "None of them"] } },
  { id: "okonomi", text: "お好み焼きは？", options: ["ご飯と一緒に食べる", "それだけで食べる", "麺が入ってる", "あまり食べない"], cat: "geo", hint: "関西・広島・その他", w: 2 , en: { text: "Okonomiyaki — how?", options: ["With a bowl of rice", "On its own", "With noodles in it", "I rarely eat it"] } },
  { id: "udon", text: "うどんとそば、どっち？", options: ["うどん", "そば", "どっちも", "こだわりがない"], cat: "geo", hint: "西日本／東日本", w: 1 , en: { text: "Udon or soba?", options: ["Udon", "Soba", "Both", "No preference"] } },
  { id: "tsuyu", text: "梅雨の時期、どう過ごす？", options: ["じめじめして最悪", "そこそこ降る", "梅雨がない", "気にしたことがない"], cat: "geo", hint: "北海道を一発で特定できる", w: 2 , en: { text: "How is the rainy season where you're from?", options: ["Humid and miserable", "Rains a fair bit", "We don't have one", "Never thought about it"] } },
  { id: "shinkansen", text: "新幹線、どのくらい使う？", options: ["年に何度も乗る", "たまに乗る", "ほぼ乗らない", "通っていない"], cat: "geo", hint: "新幹線の通らない県を切る", w: 1 , en: { text: "How often do you take the bullet train?", options: ["Several times a year", "Occasionally", "Almost never", "It doesn't run near me"] } },

  // --- 年代が出る ---
  { id: "line_maru", text: "LINEの文末に「。」をつける？", options: ["つける", "つけない", "相手による"], cat: "age", hint: "年代・マルハラ感度" , en: { text: "Do you put a period at the end of a text?", options: ["Yes", "No", "Depends who it is"] } },
  { id: "phone", text: "知らない番号から着信。どうする？", options: ["出る", "出ない", "調べてから折り返す", "着信拒否"], cat: "age", hint: "年代" , en: { text: "Unknown number calling. You:", options: ["Answer", "Don't answer", "Look it up first", "Block it"] } },
  { id: "kaomoji", text: "よく使うのは？", options: ["絵文字", "顔文字(^^)", "スタンプ", "何もつけない"], cat: "age", hint: "年代がはっきり出る" , en: { text: "What do you use most?", options: ["Emoji", "Kaomoji (^^)", "Stickers", "Nothing"] } },
  { id: "ryokai", text: "上司への返事、どれ？", options: ["了解しました", "承知しました", "かしこまりました", "りょ"], cat: "age", hint: "年代とビジネス作法" , en: { text: "How do you reply to your boss?", options: ["\"Ryokai shimashita\"", "\"Shochi shimashita\"", "\"Kashikomarimashita\"", "\"ryo\""] } },
  { id: "netsurf", text: "はじめて触ったインターネットは？", options: ["ガラケー", "実家のPC", "自分のスマホ", "学校のPC室"], cat: "age", hint: "世代" , en: { text: "Where did you first touch the internet?", options: ["A flip phone", "The family PC", "My own smartphone", "The school computer room"] } },
  { id: "music", text: "音楽はどうやって聴く？", options: ["サブスク", "YouTube", "CDも買う", "あまり聴かない"], cat: "age", hint: "世代" , en: { text: "How do you listen to music?", options: ["Streaming", "YouTube", "I still buy CDs", "I don't really listen"] } },
  { id: "photo", text: "撮った写真、どうする？", options: ["撮りっぱなし", "アルバムに整理", "すぐ誰かに送る", "SNSに上げる"], cat: "age", hint: "世代と承認欲求" , en: { text: "What happens to the photos you take?", options: ["Left where they are", "Sorted into albums", "Sent to someone right away", "Posted on social"] } },

  // --- 構文が出る ---
  { id: "emoji_count", text: "メッセージ1通に絵文字、いくつ入れる？", options: ["0個", "1〜2個", "3個以上", "文ごとに入れる"], cat: "style", hint: "おぢさん構文・アレン様構文の濃度" , en: { text: "How many emoji per message?", options: ["Zero", "One or two", "Three or more", "One after every sentence"] } },
  { id: "nanchatte", text: "冗談を言ったあと、どうする？", options: ["「なんちゃって」をつける", "何もつけない", "「笑」をつける", "言い切る"], cat: "style", hint: "おぢさん構文の核" , en: { text: "After making a joke, you:", options: ["Add \"just kidding\"", "Add nothing", "Add \"lol\"", "Let it stand"] } },
  { id: "wakamono", text: "若い子が使ってる言葉、どうする？", options: ["使ってみる", "意味だけ調べる", "使わない", "むしろ自分が作る"], cat: "style", hint: "おぢさん構文と世代" , en: { text: "Slang the kids use — you:", options: ["Try using it", "Just look up what it means", "Don't use it", "Invent your own"] } },
  { id: "hanbun_kana", text: "「ｶﾅ？」みたいな半角カタカナ、どう思う？", options: ["味がある", "見たことない", "つらい", "自分で使う"], cat: "style", hint: "おぢさん構文・アレン様構文への距離" , en: { text: "Half-width katakana like \"ｶﾅ?\" — how do you feel?", options: ["It has charm", "Never seen it", "It hurts", "I use it myself"] } },
  { id: "jibungatari", text: "相手の相談の途中で、自分の話をしたくなる？", options: ["なる", "ならない", "我慢する", "気づいたら話してる"], cat: "style", hint: "おぢさん構文の自分語り" , en: { text: "Mid-conversation, do you want to talk about yourself?", options: ["Yes", "No", "I hold back", "I notice I already am"] } },
  { id: "gohan", text: "あまり親しくない相手を食事に誘える？", options: ["誘える", "誘えない", "誘われたら行く", "用事があれば誘う"], cat: "style", hint: "おぢさん構文の距離感" , en: { text: "Could you invite someone you barely know to a meal?", options: ["Yes", "No", "Only if invited", "If there's a reason"] } },
  { id: "tension", text: "テンションの振り幅は？", options: ["だいたい一定", "上がると止まらない", "低いまま", "人前だけ上がる"], cat: "style", hint: "アレン様寄りかどうか" , en: { text: "Your energy level:", options: ["Fairly constant", "Once up, unstoppable", "Stays low", "Only rises around people"] } },
  { id: "jibun_ichiban", text: "「自分が一番正しい」と思うことは？", options: ["よくある", "たまにある", "ほぼない", "常にそう"], cat: "style", hint: "アレン様の自己愛" , en: { text: "Do you think \"I'm the one who's right\"?", options: ["Often", "Sometimes", "Rarely", "Always"] } },

  // --- 承認欲求 ---
  { id: "iine", text: "自分の投稿に3日いいねがつかなかったら？", options: ["消す", "気にしない", "見返して落ち込む", "もう一回投稿する"], cat: "personality", hint: "承認欲求の核心" , en: { text: "No likes for three days. You:", options: ["Delete it", "Don't care", "Reread it and feel bad", "Post it again"] } },
  { id: "karaoke", text: "カラオケの1曲目、何を基準に選ぶ？", options: ["自分が歌いたい曲", "場が盛り上がる曲", "無難な曲", "そもそも歌わない"], cat: "personality", hint: "承認欲求と他者意識" , en: { text: "First karaoke song — chosen how?", options: ["What I want to sing", "What gets the room going", "Something safe", "I don't sing"] } },
  { id: "hometown_brag", text: "褒められたとき、最初に出る言葉は？", options: ["ありがとうございます", "いやいや全然", "そんなことないです", "でしょ？"], cat: "personality", hint: "承認欲求と自己肯定感" , en: { text: "Someone compliments you. First words out:", options: ["Thank you", "No no, not at all", "That's not true", "Right?"] } },
  { id: "profile", text: "SNSのプロフィール欄は？", options: ["しっかり書いてる", "空", "ネタ", "肩書きだけ"], cat: "personality", hint: "自己呈示" , en: { text: "Your social media bio:", options: ["Properly written", "Empty", "A joke", "Just a job title"] } },
  { id: "dm", text: "既読がついて返信がない。何時間で気になる？", options: ["すぐ気になる", "半日", "1日以上", "気にならない"], cat: "personality", hint: "承認欲求と不安" , en: { text: "Read receipt, no reply. How long before it bothers you?", options: ["Immediately", "Half a day", "More than a day", "It doesn't"] } },
  { id: "group", text: "グループLINEでの立ち位置は？", options: ["よく喋る", "たまに反応", "ほぼ見るだけ", "通知を切ってる"], cat: "personality", hint: "社交性と承認欲求" , en: { text: "Your position in the group chat:", options: ["I talk a lot", "Occasional reaction", "I only read", "Notifications off"] } },

  // --- 自信のなさ ---
  { id: "ayamaru", text: "自分が悪くないのに謝ること、ある？", options: ["よくある", "たまにある", "ほぼない", "むしろ相手に謝らせる"], cat: "personality", hint: "自信のなさ" , en: { text: "Do you apologize when you're not at fault?", options: ["Often", "Sometimes", "Rarely", "They apologize to me"] } },
  { id: "meeting", text: "会議で言いたいことがある。どうする？", options: ["すぐ言う", "タイミングを計る", "後でこっそり言う", "飲み込む"], cat: "personality", hint: "自信と圧" , en: { text: "You have something to say in a meeting. You:", options: ["Say it immediately", "Wait for the right moment", "Say it privately later", "Swallow it"] } },
  { id: "homework", text: "作ったものを人に見せる前に？", options: ["そのまま出す", "何度も見直す", "先に言い訳を添える", "出せずに寝かせる"], cat: "personality", hint: "完璧主義と自信のなさ" , en: { text: "Before showing someone your work, you:", options: ["Just hand it over", "Check it many times", "Add excuses first", "Never manage to show it"] } },
  { id: "compliment", text: "「すごいですね」と言われたときの内心は？", options: ["嬉しい", "気まずい", "社交辞令だろうな", "もっと言って"], cat: "personality", hint: "自己肯定感" , en: { text: "Someone says \"that's impressive.\" Inside you feel:", options: ["Happy", "Awkward", "They're being polite", "Say more"] } },
  { id: "mistake", text: "ミスに気づいた。まず何を考える？", options: ["どう直すか", "どう報告するか", "バレないか", "自分はダメだ"], cat: "personality", hint: "自信と責任感" , en: { text: "You spot your own mistake. First thought:", options: ["How to fix it", "How to report it", "Whether anyone noticed", "I'm useless"] } },

  // --- 圧・対人スタンス ---
  { id: "onegai", text: "急ぎの頼み事、どう書く？", options: ["「今日中にお願いします」", "「お手すきの際に…」", "「可能であれば本日中に…」", "直接言いに行く"], cat: "personality", hint: "圧の強さ" , en: { text: "How do you word an urgent request?", options: ["\"By end of day, please\"", "\"Whenever you have a moment…\"", "\"If at all possible, today…\"", "I go and ask in person"] } },
  { id: "late", text: "待ち合わせ、何分前に着く？", options: ["15分前", "5分前", "ぴったり", "だいたい遅れる"], cat: "personality", hint: "几帳面さと対人配慮" , en: { text: "How early do you arrive?", options: ["15 minutes", "5 minutes", "Right on time", "Usually late"] } },
  { id: "okori", text: "腹が立ったとき、どうなる？", options: ["その場で言う", "黙る", "後で蒸し返す", "顔に出る"], cat: "personality", hint: "沸点と表出" , en: { text: "When you're angry, you:", options: ["Say it there and then", "Go quiet", "Bring it up later", "Wear it on your face"] } },
  { id: "warikan", text: "飲み会の会計、どうする？", options: ["きっちり割る", "多めに出す", "誰かに任せる", "自分が幹事をやる"], cat: "personality", hint: "対人スタンス" , en: { text: "Splitting the bill:", options: ["Exactly evenly", "I pay a bit more", "Leave it to someone", "I organize it"] } },
  { id: "advice", text: "相談されたら？", options: ["解決策を出す", "まず聞く", "自分の話をする", "答えを避ける"], cat: "personality", hint: "対人スタイル" , en: { text: "Someone asks your advice. You:", options: ["Offer a solution", "Listen first", "Talk about yourself", "Avoid answering"] } },
  { id: "nomikai", text: "気の乗らない飲み会の誘い、どうする？", options: ["正直に断る", "理由をつけて断る", "行く", "既読スルー"], cat: "personality", hint: "建前度" , en: { text: "An invitation you don't want. You:", options: ["Decline honestly", "Decline with an excuse", "Go anyway", "Leave it on read"] } },

  // --- こじらせ・内面 ---
  { id: "midnight", text: "深夜にテンションが上がってやることは？", options: ["長文を書く", "買い物", "昔の写真を見る", "普通に寝る"], cat: "personality", hint: "情緒の波" , en: { text: "Late at night your energy rises. You:", options: ["Write something long", "Shop", "Look at old photos", "Just go to sleep"] } },
  { id: "kakikake", text: "書きかけてやめたメッセージ、ある？", options: ["たくさんある", "たまにある", "ない", "下書きに溜めてる"], cat: "personality", hint: "こじらせ" , en: { text: "Messages you typed but never sent:", options: ["Plenty", "A few", "None", "Saved as drafts"] } },
  { id: "hitori", text: "ひとりで過ごす休日は？", options: ["最高", "少し寂しい", "予定を入れたくなる", "ずっと寝てる"], cat: "personality", hint: "人恋しさ" , en: { text: "A day off, alone:", options: ["Perfect", "A little lonely", "I'd fill it with plans", "I sleep through it"] } },
  { id: "kako", text: "昔の自分の投稿を見返すと？", options: ["消したくなる", "懐かしい", "見返さない", "けっこう好き"], cat: "personality", hint: "自意識" , en: { text: "Looking back at your old posts:", options: ["I want to delete them", "Nostalgic", "I don't look", "I kind of like them"] } },
  { id: "yume", text: "10年後の自分、想像できる？", options: ["できる", "できない", "考えたくない", "考える意味がない"], cat: "personality", hint: "将来観と諦め" , en: { text: "Can you picture yourself in ten years?", options: ["Yes", "No", "I'd rather not", "There's no point"] } },
  { id: "hikaku", text: "同期が昇進した。どう思う？", options: ["素直におめでとう", "焦る", "どうでもいい", "納得いかない"], cat: "personality", hint: "競争意識" , en: { text: "A peer gets promoted. You feel:", options: ["Genuinely happy for them", "Anxious", "Indifferent", "That it's unfair"] } },

  // --- 生活・雑 ---
  { id: "asa", text: "目覚ましは何回鳴る？", options: ["1回で起きる", "3回以上", "鳴る前に起きる", "かけない"], cat: "personality", hint: "生活リズム" , en: { text: "How many alarms?", options: ["Up on the first", "Three or more", "I wake before it", "I don't set one"] } },
  { id: "souji", text: "部屋の状態は？", options: ["片付いてる", "散らかってる", "物が少ない", "人には見せられない"], cat: "personality", hint: "生活と性格" , en: { text: "Your room:", options: ["Tidy", "A mess", "Very little in it", "I can't show anyone"] } },
  { id: "ryouri", text: "自炊は？", options: ["毎日する", "たまにする", "しない", "凝りすぎる"], cat: "personality", hint: "生活スタイル" , en: { text: "Do you cook?", options: ["Every day", "Sometimes", "No", "I overdo it"] } },
  { id: "kaimonoguse", text: "迷った買い物、最後は？", options: ["買う", "買わない", "一晩考える", "カートに入れたまま"], cat: "personality", hint: "決断の癖" , en: { text: "Something you're unsure about buying:", options: ["I buy it", "I don't", "I sleep on it", "It sits in the cart"] } },
  { id: "tabi", text: "旅行の計画は？", options: ["分刻みで立てる", "ざっくり", "現地で決める", "人に任せる"], cat: "personality", hint: "計画性" , en: { text: "Travel plans:", options: ["Down to the minute", "Rough outline", "Decide on arrival", "Someone else's job"] } },
  { id: "manual", text: "新しい家電、まず何をする？", options: ["説明書を読む", "とりあえず触る", "動画を調べる", "人に聞く"], cat: "personality", hint: "学習スタイル" , en: { text: "New appliance. First thing you do:", options: ["Read the manual", "Just start pressing", "Look up a video", "Ask someone"] } },
  { id: "ame", text: "折りたたみ傘は？", options: ["常に持ってる", "天気予報を見て持つ", "持たない", "コンビニで買う"], cat: "personality", hint: "備えの性格" , en: { text: "A folding umbrella:", options: ["Always with me", "If the forecast says so", "Never", "I buy one at the store"] } },
  { id: "resutoran", text: "初めての店でメニューが決まらない。どうする？", options: ["店員に聞く", "一番人気を選ぶ", "無難なものを選ぶ", "同行者と同じ"], cat: "personality", hint: "決断と同調" , en: { text: "New restaurant, can't decide. You:", options: ["Ask the staff", "Order the most popular", "Order something safe", "Same as whoever I'm with"] } },
  { id: "nedan", text: "値段を見ずに買えるものは？", options: ["食べ物", "本", "推しのグッズ", "ない"], cat: "personality", hint: "価値観" , en: { text: "What do you buy without checking the price?", options: ["Food", "Books", "Merch for what I love", "Nothing"] } },
  { id: "chikoku", text: "電車が止まった。最初にすることは？", options: ["振替を調べる", "連絡を入れる", "SNSを見る", "諦めて待つ"], cat: "personality", hint: "危機対応" , en: { text: "The train has stopped. First thing:", options: ["Check alternate routes", "Message whoever's waiting", "Look at social media", "Wait it out"] } },
];

export const QUESTION_MAP = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

// 診断される性格軸（Score）
export const TRAITS = [
  {
    id: "approval",
    labelEn: "Need for approval",
    label: "承認欲求",
    levels: [
      "他人の評価を一切気にしていない",
      "人並みに気にする程度",
      "常に見られていることを意識している",
      "承認されることが行動の中心になっている",
    ],
  },
  {
    id: "insecurity",
    labelEn: "Self-doubt",
    label: "自信のなさ",
    levels: [
      "根拠のない自信に満ちている",
      "ごく普通の自己評価",
      "自分の判断をやや疑いがち",
      "強い自己否定を抱えている",
    ],
  },
  {
    id: "pressure",
    labelEn: "Intimidation",
    label: "圧",
    levels: [
      "一緒にいると気が楽になる",
      "特に圧は感じない",
      "無自覚に相手を緊張させる",
      "確実に相手を萎縮させている",
    ],
  },
  {
    id: "tatemae",
    labelEn: "Front vs. real feelings",
    label: "建前度",
    levels: [
      "思ったことをそのまま言う",
      "場面によって使い分ける",
      "基本は建前で固めている",
      "本音がどこにあるか本人も分からない",
    ],
  },
  {
    id: "kojirase",
    labelEn: "Overthinking",
    label: "こじらせ度",
    levels: [
      "素直そのもの",
      "たまにひねくれる",
      "喜ぶ前に一度疑う",
      "自分を貶めてからでないと話し始められない",
    ],
  },
  {
    id: "temper",
    labelEn: "Short fuse",
    label: "沸点の低さ",
    levels: [
      "ほとんど怒らない",
      "普通",
      "わりとすぐイラッとする",
      "常に何かに苛立っている",
    ],
  },
  {
    id: "lonely",
    labelEn: "Need for company",
    label: "人恋しさ",
    levels: [
      "ひとりが一番落ち着く",
      "適度に人と会いたい",
      "予定がないと不安になる",
      "常に誰かと繋がっていないと保たない",
    ],
  },
  {
    id: "planning",
    labelEn: "Planning",
    label: "計画性",
    levels: [
      "完全に行き当たりばったり",
      "ざっくり決めて動く",
      "きちんと段取りする",
      "計画が崩れると機能しなくなる",
    ],
  },
] as const;

// 一行カルテ用（Noul）。
// instructions はそのまま1つの完結した疑問文にする。criteria で yes/no の意味も渡す。
export const VERDICTS = [
  {
    id: "night",
    lineEn: "Writes long messages late at night",
    q: "この回答者は、深夜にテンションが上がって長文を書いてしまうタイプか？",
    yes: "夜に感情が昂りやすく、勢いで長い文章を書く",
    no: "夜は静かに過ごし、衝動的に長文を書くことはない",
    line: "深夜の長文、心当たりありますよね",
  },
  {
    id: "early",
    lineEn: "Always arrives far too early",
    q: "この回答者は、待ち合わせ場所に必要以上に早く着いてしまうタイプか？",
    yes: "遅刻を恐れて余裕をもって行動し、結果いつも早く着く",
    no: "時間ぴったり、あるいは遅れがちに行動する",
    line: "たぶん今日も、早く着きすぎてます",
  },
  {
    id: "regret",
    lineEn: "Replays their own words afterwards",
    q: "この回答者は、自分の発言を後から何度も思い返して後悔するタイプか？",
    yes: "済んだ会話を反芻し、言い方を悔やむ",
    no: "言ったことを引きずらず、すぐ忘れる",
    line: "布団の中で、さっきの会話を反芻してますね",
  },
  {
    id: "kanji",
    lineEn: "Always ends up organizing things",
    q: "この回答者は、気づくと幹事や取りまとめ役を任されているタイプか？",
    yes: "頼まれると断れず、結果的に調整役に回りがち",
    no: "取りまとめには関わらず、人に任せる",
    line: "また幹事、やらされてません？",
  },
  {
    id: "sorry",
    lineEn: "Apologizes when not at fault",
    q: "この回答者は、自分に非がない場面でも先に謝ってしまうタイプか？",
    yes: "衝突を避けるため反射的に謝る",
    no: "非がなければ謝らない",
    line: "謝らなくていいところで、謝ってます",
  },
  {
    id: "lurk",
    lineEn: "Reads a lot, posts almost nothing",
    q: "この回答者は、SNSで投稿はせずに見ているだけの時間が長いタイプか？",
    yes: "閲覧は多いが自分からは発信しない",
    no: "自分からよく発信する",
    line: "見てるだけの時間、長いですよね",
  },
  {
    id: "alone",
    lineEn: "Feels lonely right after declining",
    q: "この回答者は、誘いを断ったあとで少し寂しくなるタイプか？",
    yes: "ひとりを選んだのに、あとから人恋しくなる",
    no: "ひとりを選んだことに迷いがない",
    line: "断ったあとで、ちょっと寂しくなってません？",
  },
  {
    id: "cart",
    lineEn: "Leaves things in the cart for days",
    q: "この回答者は、買い物カートに入れたまま何日も放置するタイプか？",
    yes: "決めきれず、保留したまま時間が経つ",
    no: "決めたらすぐ買う、あるいはすぐ諦める",
    line: "カートの中、まだ残ってますよね",
  },
] as const;

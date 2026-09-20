// 結果画面の「最後の一言」。
// Jev はテキストを生成しないので、文体は "書かせる" のではなく "選ばせる"。
// （スキルの Select instead of generate パターン）
// Jev は id を選び、コードが対応する台詞を出す。

export type Closing = {
  id: string;
  label: string;
  /** Jev に渡すルーブリック。どういう回答者にこの文体が刺さるか */
  desc: string;
  /** 実際に表示される台詞 */
  line: string;
  /** 吹き出しの送り主 */
  from: string;
  /** 表示用の英訳。台詞そのものは日本語のまま出す（文体自体が中身なので訳せない） */
  labelEn: string;
  fromEn: string;
  /** 英語話者向けに、その文体が何なのかを一行で説明する */
  noteEn: string;
};

export const CLOSINGS: Closing[] = [
  {
    id: "ojisan",
    labelEn: "Ojisan-Gobun",
    fromEn: "Middle-aged guy",
    noteEn: "The infamous Japanese 'middle-aged man texting' register: half-width katakana, an emoji after every clause, and unprompted stories about his lunch.",
    label: "おぢさん構文",
    desc: "絵文字を文ごとに入れ、冗談に「なんちゃって」を付け、若者言葉を使ってみようとし、親しくない相手でも食事に誘える回答者",
    from: "おぢさん😎",
    line: "ヤッホー😃❗ｵﾂｶﾚｻﾏ〜🍻✨\nｷﾐ、今日もﾖｸ頑張ったﾈ👍💕\nおぢさん😎はね〜今日📅🗓お寿司🍣を食べた👄よ〜🤣\nｷﾐのｺﾄ、ちゃんと見てるｶﾗﾈ👀❤\n今度ｵｲｼｲもの食べにｲｸ❓️😋ﾅﾝﾁｬｯﾃ😂💦",
  },
  {
    id: "allen",
    labelEn: "Allen-sama style",
    fromEn: "A devotee",
    noteEn: "An internet dialect from a Japanese YouTube personality: five signature sentence endings, celebrity names wedged into words, and substituted particles.",
    label: "アレン様構文",
    desc: "「自分が一番正しい」と常に思い、テンションの振り幅が極端で、褒められたら「でしょ？」と返し、もっと褒めてほしい回答者",
    from: "🌰🈵",
    line: "ｱ-ﾀ、コリ完全に🌰🈵ｻﾞﾏｽゎょえ💖✨🌹\n労働ﾘｧも頑張っちょらぇ〜😡💢💎\nところ(ｼﾞｮｰｼﾞ)で、ｱ-ﾀの人生🌹ｸﾞｧジュエリア💎になるｺﾄｳｫ、ァ🚕ｳｧ願ってる㌔❣️\n路確だけｳｧしなぃでﾖｯ👶🏻💕\n全ア💕 普通に。(笑)",
  },
  {
    id: "gal",
    labelEn: "Gyaru",
    fromEn: "Gyaru",
    noteEn: "Loud, relentlessly affirming, and secretly the most caring person in the room.",
    label: "ギャル",
    desc: "誘いに乗り、深く考える前に動き、場を肯定から入る、勢いのある回答者",
    from: "ギャル",
    line: "いやもう全然それでいいって〜🫶💖\n考えすぎなんよマジで、\nアンタはアンタのままが一番かわいいから🥺✨\n今日はもう寝な？ おつ〜🌙",
  },
  {
    id: "shio",
    labelEn: "Cold shoulder",
    fromEn: "Ice",
    noteEn: "Minimum viable reply.",
    label: "塩対応",
    desc: "絵文字を一切使わず、返事が短く、誘いを断り、SNSのプロフィールが空の回答者",
    from: "塩",
    line: "はい。\n\n以上です。",
  },
  {
    id: "senpai",
    labelEn: "The lecturing senior",
    fromEn: "Senior colleague",
    noteEn: "Unsolicited life advice, followed by an invitation you cannot refuse.",
    label: "説教したがる先輩",
    desc: "相談されたら解決策から出し、途中で自分の話をしたくなり、飲み会で多めに払う回答者",
    from: "先輩",
    line: "まあ、俺が言うのもなんだけどさ。\nお前のそれ、悪くないと思うよ。\n若いうちはそれでいいんだよ。\n……で、今日このあと空いてる？",
  },
  {
    id: "counselor",
    labelEn: "Gentle counselor",
    fromEn: "Counselor",
    noteEn: "For people who are much harder on themselves than on anyone else.",
    label: "やさしいカウンセラー",
    desc: "自分が悪くない場面でも謝り、ミスに「自分はダメだ」と考え、作ったものを出せずに寝かせてしまう回答者",
    from: "カウンセラー",
    line: "ここまで、よく頑張ってこられましたね。\nあなたはもう充分やっています。\nどうか、自分にだけ厳しくしないであげてください。",
  },
  {
    id: "engineer",
    labelEn: "Engineer",
    fromEn: "Engineer",
    noteEn: "Conclusion first, then the caveat, then 'that's the intended behavior.'",
    label: "エンジニア",
    desc: "説明書を先に読み、曖昧さを嫌い、旅行の計画を分刻みで立てる回答者",
    from: "エンジニア",
    line: "結論：問題ありません。\n強いて言えば、前提条件の確認が不足しています。\nあと、それは仕様です。",
  },
  {
    id: "uranai",
    labelEn: "Fortune teller",
    fromEn: "Fortune teller",
    noteEn: "Asserts with total confidence, then puts the responsibility back on you.",
    label: "占い師",
    desc: "10年後を想像できず、既読がつかないと気になり、決断を先延ばしにする回答者",
    from: "占い師",
    line: "……視えました。\nあなた、今、我慢していることがありますね。\n来月です。動くなら来月。\n信じるか信じないかは、あなた次第。",
  },
  {
    id: "nanj",
    labelEn: "Imageboard regular",
    fromEn: "Anon",
    noteEn: "Deflects everything with a joke and a shrug.",
    label: "なんJ",
    desc: "ネット歴が長く、身内ノリで茶化して受け流し、真面目に答えるのを避ける回答者",
    from: "なんJ民",
    line: "ええんちゃう（適当）\nワイもそんな感じやで\nはい、おつやで",
  },
  {
    id: "oldnet",
    labelEn: "Old internet",
    fromEn: "Anonymous",
    noteEn: "Kaomoji, generous line breaks, and a cup of tea. Circa 2003.",
    label: "古のインターネット",
    desc: "顔文字(^^)を使い、はじめて触ったネットが実家のPCかガラケーで、SNSでは見ているだけの回答者",
    from: "名無しさん",
    line: "( ´ー｀)ﾌｩｰｯ\nまあそんなに気にすることもないさ\n\nお茶でも飲んで落ち着けよ　旦～",
  },
  {
    id: "ikeike",
    labelEn: "LinkedIn energy",
    fromEn: "Growth guy",
    noteEn: "Every sentence is a value-add. Would love to pick your brain.",
    label: "意識高い系",
    desc: "プロフィールを肩書きで固め、投稿をSNSに上げ、成長や人脈の話に反応する回答者",
    from: "意識高い系",
    line: "素晴らしいアウトプットをありがとうございます🙏\nこのインサイト、まさにネクストアクションの解像度を上げてくれますね。\nぜひ一度、壁打ちさせていただけませんか？",
  },
  {
    id: "obaachan",
    labelEn: "Grandma",
    fromEn: "Grandma",
    noteEn: "Doesn't care what happened. Sit down and eat something.",
    label: "おばあちゃん",
    desc: "毎日自炊し、部屋が片付いていて、細かいことを気にせず人を受け入れる回答者",
    from: "おばあちゃん",
    line: "まあまあ、よう来たねえ。\nそんなことはどうでもええから、\nはよ、あがって。なんか食べんさい。",
  },
  {
    id: "host",
    labelEn: "Host club",
    fromEn: "Host",
    noteEn: "Notices one specific thing about you and makes it sound like a discovery.",
    label: "ホスト",
    desc: "褒められても素直に受け取れないが、内心ではもっと言ってほしい回答者",
    from: "ホスト",
    line: "え、待って。今の言い方、ちょっとよかった。\n自分のそういうとこ、気づいてないでしょ？\nもったいないよ、ほんとに。",
  },
  {
    id: "satori",
    labelEn: "Zen",
    fromEn: "???",
    noteEn: "Expects nothing, so nothing disappoints.",
    label: "悟り",
    desc: "10年後を考える意味がないと答え、同期の昇進をどうでもいいと言い、何も期待していない回答者",
    from: "???",
    line: "べつに、それでいいんじゃないですか。\nどうせ、みんな大したことないので。\nおやすみなさい。",
  },
];

export const CLOSING_MAP = Object.fromEntries(CLOSINGS.map((c) => [c.id, c]));

export const closingCriteria: Record<string, string> = Object.fromEntries(
  CLOSINGS.map((c) => [c.id, c.desc]),
);

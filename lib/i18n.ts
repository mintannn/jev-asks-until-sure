/**
 * 画面表示の言語切り替え。
 *
 * 大事な前提：**Jev に投げる state・questions・criteria は常に日本語のまま**。
 * ここを言語で切り替えると判定の挙動そのものが変わり、日本語で測った精度
 * （地域 12/16、人格の分散 12/12）が保証できなくなる。
 * 英語化するのは「人間が読む側」だけで、推論の入力は一切触らない。
 *
 * 画面は、日本語の回答文字列をサーバーに送りつつ、表示だけ英語に差し替える。
 */

export type Lang = "ja" | "en";

export const UI = {
  // --- タイトル / イントロ ---
  title: { ja: "バレる", en: "BARERU" },
  tagline: {
    ja: "しつもんに こたえていくと\nAIが あなたの じんかく・しゅっしん・ねんだい を いいあてます",
    en: "Answer a few questions and the AI will guess\nyour persona, where you grew up, and your age.",
  },
  introNote: {
    ja: "AIが かくしんした じてんで しつもんは とまります",
    en: "The questions stop the moment the AI is confident enough.",
  },
  start: { ja: "▶ はじめる", en: "▶ START" },
  introFoot: {
    ja: "110ひと × 47けん × 8せいかく",
    en: "110 personas × 47 prefectures × 8 traits",
  },
  jaQuizNote: {
    ja: "",
    en: "The quiz asks about Japanese dialects, food and weather — you can still play, but it guesses a Japanese prefecture.",
  },
  retry: { ja: "▶ やりなおす", en: "▶ RETRY" },
  errConnect: { ja: "Jevへの せつぞくに しっぱいしました", en: "Could not reach Jev." },
  errNetwork: { ja: "つうしんに しっぱいしました", en: "Network error." },

  // --- パネル名 ---
  wQuestion: { ja: "しつもん", en: "QUESTION" },
  wAnswer: { ja: "こたえる", en: "ANSWER" },
  wLog: { ja: "しこうログ", en: "REASONING LOG" },
  wStatus: { ja: "ステータス", en: "STATUS" },
  wGuess: { ja: "いまの すいてい", en: "CURRENT GUESS" },
  wResult: { ja: "けっか", en: "RESULT" },
  wTraits: { ja: "せいかく", en: "TRAITS" },
  wClosing: { ja: "さいごに ひとこと", en: "ONE LAST THING" },
  wRubric: { ja: "はんていきじゅん", en: "THE RUBRIC" },

  // --- ステータス ---
  sConfidence: { ja: "かくしんど", en: "CONFIDENCE" },
  sCandidates: { ja: "こうほ", en: "LEFT" },
  sQuestions: { ja: "しつもん", en: "ASKED" },

  // --- 推定 ---
  rPersona: { ja: "ぶんしょうじんかく", en: "PERSONA" },
  rPrefecture: { ja: "しゅっしんけん（47たく）", en: "PREFECTURE (1 of 47)" },
  rRegion: { ja: "ちほう（8たく）", en: "REGION (1 of 8)" },
  noPersonaYet: {
    ja: "せいかくの しつもんに こたえると はんていが はじまります",
    en: "The persona guess starts once you answer a personality question.",
  },

  // --- 候補グリッド ---
  gridTitle: { ja: "のこりの こうほ", en: "SURVIVING CANDIDATES" },
  gridHelp: {
    ja: "1体が 1にん。ぜんぶで 110にん。\nあかるいほど「あなたかもしれない」、くらいのは だつらくした ひと。",
    en: "One figure per persona, 110 in total.\nBrighter = more likely to be you. Dark ones are already out.",
  },
  gridCount: { ja: "のこり {n}にん", en: "{n} still standing" },

  // --- 判定基準 ---
  rubricIntro: {
    ja: "Jevに わたしている ていぎ。これが なければ AIは なにも はんていできない。",
    en: "The definitions handed to Jev. Without these the model has nothing to match against.",
  },
  rubricNote: {
    ja: "この文字列じたいが、この診断の中身です。",
    en: "These strings are the actual product. They are always sent in Japanese.",
  },
  rubricOpen: { ja: "▶ はんていきじゅんを みる", en: "▶ SHOW THE RUBRIC" },
  rubricPersona: { ja: "じんかく（110たく）", en: "PERSONA (1 of 110)" },
  rubricRegion: { ja: "ちほう（8たく）", en: "REGION (1 of 8)" },
  rubricPref: { ja: "けん（47たく）", en: "PREFECTURE (1 of 47)" },
  notYet: { ja: "まだ はんていしていません", en: "Not judged yet" },

  // --- 結果 ---
  gotIt: { ja: "わかりました！", en: "GOT IT!" },
  notSure: { ja: "NOT QUITE SURE…", en: "NOT QUITE SURE…" },
  youAre: { ja: "あなたの ぶんしょうじんかくは", en: "Your written persona is" },
  youProbablyAre: { ja: "いいきれませんが……たぶん あなたは", en: "Can't say for sure, but probably" },
  fromSuffix: { ja: "しゅっしんの", en: "from" },
  unknownPlace: { ja: "どこか", en: "somewhere" },
  unknownPersona: { ja: "なにか", en: "someone" },
  ageLabel: { ja: "ねんだい", en: "age" },
  ageUnknown: { ja: "ふめい", en: "unknown" },
  confShort: { ja: "かくしんど", en: "confidence" },
  questionsUnit: { ja: "もん", en: "questions" },
  alsoPossible: { ja: "※ {name}の かのうせいも {p}%", en: "* {name} is also {p}% possible" },
  alsoPersona: { ja: "※ {name}よりの めんも {p}%", en: "* {p}% chance you're more of a {name}" },
  costLabel: { ja: "ひよう", en: "cost" },
  findings: { ja: "しょけん", en: "FINDINGS" },
  post: { ja: "Xに とうこう", en: "POST ON X" },
  again: { ja: "もういちど", en: "PLAY AGAIN" },

  // --- 降参 ---
  tooLow: { ja: "CONFIDENCE TOO LOW", en: "CONFIDENCE TOO LOW" },
  giveUp: {
    ja: "……わかりません。\nあなたは なにものですか？",
    en: "…I don't know.\nWho even are you?",
  },
  giveUpBody: {
    ja: "{n}もん きいても かくしんどが {c}% まで。Jevは じしんが ないとき むりに いいきりません。",
    en: "After {n} questions, confidence only reached {c}%. Jev does not assert what it cannot support.",
  },
  giveUpPunch: {
    ja: "あなたは AIに よまれなかった がわの にんげんです。",
    en: "You are one of the people the AI could not read.",
  },

  // --- タブ ---
  tLog: { ja: "ログ", en: "LOG" },
  tGuess: { ja: "すいてい", en: "GUESS" },
  tResult: { ja: "けっか", en: "RESULT" },
  tTraits: { ja: "せいかく", en: "TRAITS" },
  tClosing: { ja: "ひとこと", en: "CLOSING" },

  // --- 思考ログ ---
  lStart: { ja: "スキャン かいし。こうほ 110にん", en: "Scan started. 110 candidates." },
  lSlot: { ja: "出題ワクを ちゅうせん → 「{cat}」", en: "Drew a question slot → {cat}" },
  lShown: {
    ja: "ワクの {pool}問 から {shown}問 を Jev に提示",
    en: "Showed Jev {shown} of {pool} questions in that slot",
  },
  lPicked: { ja: "{by}{p}：{q}", en: "{by}{p}: {q}" },
  lByJev: { ja: "Jev が えらんだ", en: "Jev picked" },
  lByFallback: { ja: "フォールバック", en: "fallback" },
  lNoPersona: {
    ja: "せいかくの しょうこが まだ ない → じんかくは はんていしない",
    en: "No personality evidence yet → skipping the persona question",
  },
  lEliminated: {
    ja: "こうほ {a} → {b}　{n}にん だつらく！",
    en: "Candidates {a} → {b} — {n} eliminated!",
  },
  lRegionPrior: {
    ja: "ちほう {r} {p}% で けん を おもみづけ",
    en: "Weighting prefectures by region {r} at {p}%",
  },
  lSkipGeo: {
    ja: "ちいきの しょうこは ふえていない → ちほう・けんは スキップ",
    en: "No new geography evidence → skipping region and prefecture",
  },
  lSkipAge: {
    ja: "ねんだいの しょうこも ふえていない → スキップ",
    en: "No new age evidence either → skipping",
  },
  lFinal: {
    ja: "せいかく・しょけん・ぶんたい を 2かいめの リクエストで しゅとく",
    en: "Fetching traits, findings and closing style in a second request",
  },
  lConf: { ja: "かくしんど {a} → {b}{d}", en: "Confidence {a} → {b}{d}" },
  lGiveUp: { ja: "かくしんどが たりない…… こうさん！", en: "Not confident enough — giving up!" },
  lDone: { ja: "はんてい かんりょう！", en: "Verdict reached!" },
  lAsking: { ja: "Jev に しつもんちゅう…", en: "Asking Jev…" },

  // --- カテゴリ名 ---
  catGeo: { ja: "ちいき", en: "geography" },
  catAge: { ja: "ねんだい", en: "age" },
  catStyle: { ja: "こうぶん", en: "writing style" },
  catPersonality: { ja: "せいかく", en: "personality" },

  keyHint: { ja: "↑↓ ＋ ENTER / 1-4", en: "↑↓ + ENTER / 1-4" },
} as const;

export type UIKey = keyof typeof UI;

export function t(key: UIKey, lang: Lang, vars?: Record<string, string | number>) {
  let s: string = UI[key][lang] ?? UI[key].ja;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** サーバーが返すカテゴリ名（日本語）を表示言語に合わせる */
export const CAT_KEY: Record<string, UIKey> = {
  ちいき: "catGeo",
  ねんだい: "catAge",
  こうぶん: "catStyle",
  せいかく: "catPersonality",
};

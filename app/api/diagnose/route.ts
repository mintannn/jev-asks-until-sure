import { NextResponse } from "next/server";
import { ask, isChoice, isNoul, isScore, JevError, type JevQuestion } from "@/lib/jev";
import { AGES, AGE_EN, PERSONAS, PERSONA_EN } from "@/lib/personas";
import {
  PREFECTURE_EN,
  PREFECTURE_RUBRIC,
  REGION_EN,
  REGIONS,
  REGION_PREFS,
} from "@/lib/geo";
import {
  CANDIDATE_SAMPLE,
  GEO_CORE,
  FORCED_OPENING,
  QUESTION_MAP,
  QUESTIONS,
  QUOTA,
  TRAITS,
  VERDICTS,
  type Category,
  type Question,
} from "@/lib/questions";
import { CLOSING_MAP, closingCriteria } from "@/lib/closings";

export const runtime = "nodejs";
export const maxDuration = 30;

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 12;
const CONFIDENT_ENOUGH = 0.55; // これを超えたら言い切る
const HEDGE_BELOW = 0.45; // 上限まで聞いてここ未満なら「たぶん」と濁す
const GIVE_UP_BELOW = 0.28; // それ未満なら降参
const GEO_MIN_EVIDENCE = 4; // 出身地を言い切るのに必要な地域質問の数

// 候補の絞り込み。全123択のままだと確率が薄く広がり、
// Choice の confidence が構造的に上がらない（＝永遠に言い切れない）。
// 毎ターン、確率の薄い候補を実際に脱落させていく。
//
// ただし一気に絞ると序盤の思い込みが固定されて戻れなくなるので、
// 何問目かで上限を決めて緩やかに落とす。加えて、上限を超えていても
// まだ芽のある候補（SURVIVE_P 以上）は救済して残す。
// 証拠が2〜3問しかない段階で絞ると、1問目の思い込みがそのまま固定される。
// 添字は「人格の証拠が何問あるか」。2問目までは全員残す。
const KEEP_BY_TURN = [999, 999, 999, 56, 40, 28, 20, 15, 12, 10, 9, 8, 8];
const SURVIVE_P = 0.02;
const MIN_KEEP = 8;
const PERSONA_COUNT = Object.keys(PERSONAS).length;
const MAX_KEEP = 64;

type Turn = { q: string; a: string };

function narrow(probs: Record<string, number>, asked: number): string[] {
  const cap = KEEP_BY_TURN[Math.min(asked, KEEP_BY_TURN.length - 1)];
  const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  const keep = sorted
    .filter(([, p], i) => i < cap || p >= SURVIVE_P)
    .slice(0, MAX_KEEP)
    .map(([label]) => label);
  return keep.length >= MIN_KEEP ? keep : sorted.slice(0, MIN_KEEP).map(([l]) => l);
}

const REGION_OF: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_PREFS).flatMap(([region, prefs]) =>
    prefs.map((p) => [p, region] as const),
  ),
);

/**
 * 地方の確率で県の確率を重み付けして合成する。
 *
 * 47択の Choice は確率が薄く広がるぶん、モデルの事前分布（雪国なら北海道、
 * 都会なら東京）に引きずられやすい。8択の地方判定は確率が集中して安定するので、
 * それを事前分布として県に掛ける。合成はモデルではなくコードの仕事。
 */
function combineGeo(
  prefProbs: Record<string, number>,
  regionProbs: Record<string, number>,
) {
  const weighted: Record<string, number> = {};
  let total = 0;
  for (const [pref, p] of Object.entries(prefProbs)) {
    // そのまま掛けると 100% に振り切れて分布を見る面白さが消える。
    // 指数で鈍らせて「誘導するが潰さない」強さにする。
    // +0.02 は、地方が否定した県も芽を残すため（証拠が増えたら戻れる）。
    const r = Math.pow((regionProbs[REGION_OF[pref]] ?? 0) + 0.02, 0.5);
    const v = p * r;
    weighted[pref] = v;
    total += v;
  }
  if (total <= 0) return prefProbs;
  for (const k of Object.keys(weighted)) weighted[k] /= total;
  return weighted;
}

/**
 * 重み付きで n 問だけ抜く。
 * 等確率だと「新幹線」「うどんとそば」のような情報量の薄い質問ばかり引く回があり、
 * その回は地域がまったく当たらなかった（実測：地域2問以下で正解 0/7）。
 */
function weightedSample(pool: Question[], n: number): Question[] {
  const rest = [...pool];
  const out: Question[] = [];
  while (out.length < n && rest.length > 0) {
    const total = rest.reduce((acc, q) => acc + (q.w ?? 1), 0);
    let r = Math.random() * total;
    let idx = rest.length - 1;
    for (let i = 0; i < rest.length; i++) {
      r -= rest[i].w ?? 1;
      if (r <= 0) { idx = i; break; }
    }
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 次に聞くカテゴリを決める。
 * 固定順にすると誰がやっても同じ質問列になるので、残り枠で重み付けした抽選にする。
 * 最初の2問だけ geo 固定（地域の証拠がないと出身地が事前分布に落ちる）。
 */
function pickCategory(asked: Question[]): Category | null {
  if (asked.length < FORCED_OPENING.length) return FORCED_OPENING[asked.length];

  const used: Record<string, number> = {};
  for (const q of asked) used[q.cat] = (used[q.cat] ?? 0) + 1;

  const entries = (Object.entries(QUOTA) as [Category, number][]).map(
    ([cat, quota]) => [cat, Math.max(0, quota - (used[cat] ?? 0))] as [Category, number],
  );
  const totalLeft = entries.reduce((a, [, left]) => a + left, 0);
  if (!totalLeft) return null;

  // 締切スケジューリング：残りターン数が残り枠と同数になったら、
  // 未達のカテゴリを必ず埋める。ランダム抽選だけだと枠が埋まらずに終わり、
  // 地域が2〜3問しか出ないまま判定していた（実測：地域3問以下で正解 2/9）。
  const turnsLeft = MAX_QUESTIONS - asked.length;
  if (turnsLeft <= totalLeft) {
    const behind = entries.filter(([, left]) => left > 0).sort((a, b) => b[1] - a[1]);
    return behind[0][0];
  }

  const pool: Category[] = [];
  for (const [cat, left] of entries) {
    for (let i = 0; i < left; i++) pool.push(cat); // 残り枠が多いほど当たりやすい
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Jev に見せる次質問の候補。
 * カテゴリ内の未出題を全部見せると「情報量が最大の質問」が毎回同じになるので、
 * ランダムに間引いてから選ばせる。枠の決定はコード、枠内の最適解は Jev。
 */
function candidates(askedIds: string[]) {
  const asked = askedIds
    .map((id) => QUESTION_MAP[id])
    .filter((q): q is Question => Boolean(q));
  const unasked = QUESTIONS.filter((q) => !askedIds.includes(q.id));

  const cat = pickCategory(asked);
  const inSlot = cat ? unasked.filter((q) => q.cat === cat) : [];
  const pool = inSlot.length > 0 ? inSlot : unasked;

  // 地域枠は、まだ聞いていない決定的な質問があればそこからしか出さない。
  // 実測：決定的3問だけで福岡 90%／広島 99%、弱い質問3問だと関東 67%（正反対）。
  // Jev に「次に聞くと情報量が大きい質問」を選ばせても拾い切れなかったので、
  // どの質問群を使うかはコードが決める。多様性は6問中どの5問かで確保する。
  const core = cat === "geo" ? pool.filter((q) => GEO_CORE.includes(q.id)) : [];
  const finalPool = core.length > 0 ? core : pool;

  return {
    cat,
    /** その枠に何問残っていたか（間引く前） */
    poolCount: finalPool.length,
    shown: weightedSample(finalPool, CANDIDATE_SAMPLE),
  };
}

export const CATEGORY_LABEL: Record<Category, string> = {
  geo: "ちいき",
  age: "ねんだい",
  style: "こうぶん",
  personality: "せいかく",
};

/** 出題カテゴリごとに、その質問に関係する回答だけを抜き出す。 */
function turnsOfCat(turns: Turn[], cats: Category[]) {
  return turns.filter((t) => {
    const q = QUESTIONS.find((x) => x.text === t.q);
    return q ? cats.includes(q.cat) : false;
  });
}

/**
 * 一度に投げる質問束。全部 independent なので並列評価される。
 *
 * ただし「並列だからレイテンシが増えない」＝「タダ」ではない。課金は入力トークンで、
 * criteria はそのまま毎回送られる。実測で1リクエスト 9,711tok のうち、
 * ターンごとに変わる state は約300tok しかなく、97% は同じ判定基準の送り直しだった。
 * そこで、答えが変わりようのない質問はそのターンでは投げない。
 *
 *   - 地域(2,470tok)：地域質問に答えていないターンは証拠が1文字も変わらない
 *   - 年代(377tok) ：同上
 *   - 性格/所見/文体(2,351tok)：結果画面でしか使わないので、確定してから別リクエストで聞く
 */
function buildQuestions(
  turns: Turn[],
  candidateQuestions: Question[],
  shortlist: string[] | null,
  opts: { geoChanged: boolean; ageChanged: boolean },
): Record<string, JevQuestion> {
  const personaCriteria: Record<string, string> =
    shortlist && shortlist.length >= MIN_KEEP
      ? Object.fromEntries(shortlist.map((k) => [k, PERSONAS[k]]))
      : PERSONAS;

  // 人格判定に地域・年代の回答を混ぜない。
  // 「うどん」「電車」「エスカレーターは左」のような人格の情報を持たない回答まで
  // 見せると、素っ気ない事実回答が「素っ気ない人」と読まれ、
  // 塩対応 86% のような判定になっていた（＝どんな人でも塩対応になる）。
  const personaTurns = turnsOfCat(turns, ["personality", "style"]);

  const questions: Record<string, JevQuestion> = {};

  // 証拠がゼロのときは人格を聞かない。
  // 無理に選ばせると「情報を出さない人」という定義が「情報がない状態」に
  // 一番マッチしてしまい、誰をやっても同じ人格が出る。
  if (personaTurns.length > 0) {
    questions.persona = {
      type: "choice",
      instructions: {
        性格に関する回答: personaTurns,
        question:
          "`性格に関する回答` だけを根拠に、回答者の『文章人格』に最も近い人物像はどれか。どの選択肢を選んだかという判断の傾向から、その人の振る舞いの型を選ぶ。実際の職業や属性を当てるのではない。複数が当てはまる場合は、選んだ回答を最も具体的に説明できる人物像を選び、どんな回答にも広く当てはまる一般的な人物像は選ばない。`性格に関する回答` が空か、ごく少ない場合は、特定の人物像に確率を集中させず広く散らすこと。",
      },
      criteria: personaCriteria,
    };
  }

  // 地域判定は地域質問への回答だけを根拠にする。
  // state 全体を見せると、地域と無関係な回答に薄められて判断が壊れる。
  //
  // さらに 47択を一発で当てさせず、地方(8択)と県(47択)を並列に聞く。
  // 47択は確率が薄く広がって確信度が意味を持たないが、8択なら集中する。
  if (opts.geoChanged) {
    questions.region = {
      type: "choice",
      instructions: {
        地域に関する回答: turnsOfCat(turns, ["geo"]),
        question:
          "`地域に関する回答` だけを根拠に、回答者が育った地方はどれか。雪と台風への慣れ、方言の語尾、移動手段、海までの距離が手がかりになる。手がかりが乏しければ確率を広く散らすこと。",
      },
      criteria: REGIONS,
    };
    questions.prefecture = {
      type: "choice",
      instructions: {
        地域に関する回答: turnsOfCat(turns, ["geo"]),
        question:
          "`地域に関する回答` だけを根拠に、回答者が育った都道府県はどれか。各選択肢の説明と回答を突き合わせて、実際に一致する手がかりがあるものを選ぶ。人口の多い都道府県や、雪国の代表県を初期値にしないこと。手がかりが乏しければ確率を広く散らすこと。",
      },
      criteria: PREFECTURE_RUBRIC,
    };
  }

  if (opts.ageChanged) {
    questions.age = {
      type: "choice",
      instructions: {
        年代の手がかりになる回答: turnsOfCat(turns, ["age", "style"]),
        question:
          "`年代の手がかりになる回答` だけを根拠に、回答者の年代として最も可能性が高いものはどれか。",
      },
      criteria: AGES,
    };
  }

  // 枠内の候補から「次に聞くべき質問」をモデル自身に選ばせる。
  // まだ止めるか続けるか決まっていない時点での投機的な質問だが、
  // 並列評価なのでレイテンシは増えず、続ける場合はそのまま使える。
  const remaining = candidateQuestions;
  if (remaining.length > 0) {
    questions.next_question = {
      type: "choice",
      instructions:
        "ここまでの回答を踏まえ、回答者の人物像・出身地・年代を絞り込むうえで次に聞くと最も情報量が大きい質問はどれか。すでに分かっていることを重ねて確認する質問ではなく、現時点で割れている可能性を切り分けられる質問を選ぶ。",
      criteria: Object.fromEntries(
        remaining.map((q) => [q.id, `「${q.text}」— ${q.hint}を炙り出す`]),
      ),
    };
  }

  return questions;
}

/**
 * 結果画面でしか使わない質問。確定した最後の1回だけ投げる。
 * 併せて、そのターンでスキップした地域・年代もここで確定させる。
 * （スキップのまま終わると結果画面に出す値が無い、という穴を塞ぐ）
 */
function buildFinalQuestions(
  turns: Turn[],
  need: { geo: boolean; age: boolean },
): Record<string, JevQuestion> {
  const questions: Record<string, JevQuestion> = {
    closing: {
      type: "choice",
      instructions:
        "診断結果を伝える最後の一言を、どの文体で届けるのがこの回答者に最も刺さるか。回答者自身がその文体を使う人物か、あるいはその文体で言われることが最も効く人物かで選ぶ。",
      criteria: closingCriteria,
    },
  };
  for (const t of TRAITS) {
    questions[`trait_${t.id}`] = {
      type: "score",
      instructions: `回答者の「${t.label}」の程度を、回答全体から判断する。`,
      criteria: [...t.levels],
    };
  }
  for (const v of VERDICTS) {
    questions[`verdict_${v.id}`] = {
      type: "noul",
      instructions: v.q,
      criteria: { true: v.yes, false: v.no },
    };
  }

  if (need.geo) {
    questions.region = {
      type: "choice",
      instructions: {
        地域に関する回答: turnsOfCat(turns, ["geo"]),
        question:
          "`地域に関する回答` だけを根拠に、回答者が育った地方はどれか。雪と台風への慣れ、方言の語尾、移動手段、海までの距離が手がかりになる。手がかりが乏しければ確率を広く散らすこと。",
      },
      criteria: REGIONS,
    };
    questions.prefecture = {
      type: "choice",
      instructions: {
        地域に関する回答: turnsOfCat(turns, ["geo"]),
        question:
          "`地域に関する回答` だけを根拠に、回答者が育った都道府県はどれか。各選択肢の説明と回答を突き合わせて、実際に一致する手がかりがあるものを選ぶ。人口の多い都道府県や、雪国の代表県を初期値にしないこと。手がかりが乏しければ確率を広く散らすこと。",
      },
      criteria: PREFECTURE_RUBRIC,
    };
  }

  if (need.age) {
    questions.age = {
      type: "choice",
      instructions: {
        年代の手がかりになる回答: turnsOfCat(turns, ["age", "style"]),
        question:
          "`年代の手がかりになる回答` だけを根拠に、回答者の年代として最も可能性が高いものはどれか。",
      },
      criteria: AGES,
    };
  }

  return questions;
}

/**
 * 回答は「出題バンクにある質問」と「その質問の選択肢」の組だけ受け付ける。
 *
 * ここを検証しないと、任意の文字列がそのまま Jev の state に入る。実測では
 * 18KB のペイロードが 6,671 トークン（通常の約22倍）として課金された。
 * 組み合わせを固定すれば、長さの上限も自動的に決まる。
 */
function validateTurns(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw)) return [];
  if (raw.length > MAX_QUESTIONS) return null;

  const out: Turn[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (!t || typeof t !== "object") return null;
    const { q, a } = t as { q?: unknown; a?: unknown };
    if (typeof q !== "string" || typeof a !== "string") return null;

    const question = QUESTIONS.find((x) => x.text === q);
    if (!question || !question.options.includes(a)) return null;
    if (seen.has(question.id)) return null; // 同じ質問の水増しを防ぐ
    seen.add(question.id);

    out.push({ q, a });
  }
  return out;
}

/**
 * IPごとの簡易レート制限。
 *
 * 公開エンドポイントが有料APIを叩くので、素のままだと課金とレート枠
 * （1,200 req/分）を第三者に使い切られる。サーバーレスではインスタンスごとに
 * 状態が分かれるため完全ではないが、素朴な連打は確実に止まる。
 * 本気で守るなら Vercel BotID か共有ストアが必要。
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40; // 1ゲーム最大13リクエストなので、1分あたり3ゲーム相当
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // 際限なく太らせない
  return recent.length > RATE_MAX;
}

const MAX_BODY_BYTES = 32 * 1024;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let body: { turns?: unknown; shortlist?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const turns = validateTurns(body.turns);
  if (turns === null) {
    return NextResponse.json({ error: "invalid_turns" }, { status: 400 });
  }
  // クライアントから返ってくる候補リストは必ず検証する
  const shortlist = Array.isArray(body.shortlist)
    ? (body.shortlist as unknown[])
        .filter((k): k is string => typeof k === "string" && k in PERSONAS)
        .slice(0, MAX_KEEP)
    : null;
  const askedIds = turns
    .map((t) => QUESTIONS.find((q) => q.text === t.q)?.id)
    .filter((id): id is string => Boolean(id));

  // 1問目は推論不要。いきなり聞く（枠は SCHEDULE[0] ＝ geo）。
  if (turns.length === 0) {
    const first = candidates([]);
    const seed = first.shown[0]; // weightedSample の先頭＝重みで引いた1問
    return NextResponse.json({
      phase: "asking",
      nextQuestion: { text: seed.text, options: seed.options, en: seed.en ?? null },
      asked: 0,
      maxQuestions: MAX_QUESTIONS,
      trace: {
        slot: first.cat ? CATEGORY_LABEL[first.cat] : "—",
        poolCount: first.poolCount,
        shownCount: first.shown.length,
        pickedBy: "ランダム",
      },
    });
  }

  // 抽選はここで1回だけ。buildQuestions と trace で同じ候補を使う。
  // （以前は両方で candidates() を呼んでいて、シャッフルが食い違っていた）
  const slot = candidates(askedIds);

  // 直前に答えた質問のカテゴリ。地域の証拠が増えていないターンで
  // 地域を聞き直しても、同じ state に同じ質問なので答えは変わらない。
  const personaTurnCount = turnsOfCat(turns, ["personality", "style"]).length;
  const lastCat = QUESTION_MAP[askedIds[askedIds.length - 1]]?.cat;
  const geoChanged = lastCat === "geo";
  const ageChanged = lastCat === "age" || lastCat === "style";

  const started = Date.now();
  let result;
  try {
    result = await ask(
      { 回答履歴: turns },
      buildQuestions(turns, slot.shown, shortlist, { geoChanged, ageChanged }),
    );
  } catch (err) {
    const status = err instanceof JevError ? err.status : 500;
    console.error("[jev]", status, (err as Error).message);
    return NextResponse.json(
      { error: "jev_failed", detail: (err as Error).message.slice(0, 200) },
      { status: status === 401 ? 500 : 503 },
    );
  }
  const latencyMs = Date.now() - started;

  const a = result.answers;
  // 人格の証拠がまだ無いターンは persona を投げていないので null になる。
  const persona = isChoice(a.persona) ? a.persona : null;

  // 聞かなかったブロックは null で返し、クライアントは前回値を出し続ける。
  const prefRaw = isChoice(a.prefecture) ? a.prefecture : null;
  const region = isChoice(a.region) ? a.region : null;
  const age = isChoice(a.age) ? a.age : null;

  // 地方の確率を事前分布として県に掛ける
  let prefecture: { choice: string; probabilities: Record<string, number> } | null = null;
  if (prefRaw && region) {
    const prefProbs = combineGeo(prefRaw.probabilities, region.probabilities);
    const prefTop = Object.entries(prefProbs).sort((x, y) => y[1] - x[1]);
    prefecture = { choice: prefTop[0][0], probabilities: prefProbs };
  }

  const confidence = persona?.confidence ?? 0;
  const asked = turns.length;

  // 続ける場合の次の質問。Jev の推薦を採り、使えなければ枠内の先頭で埋める。
  const pickId = isChoice(a.next_question) ? a.next_question.choice : null;
  const recommended =
    (pickId && !askedIds.includes(pickId) && QUESTION_MAP[pickId]) || slot.shown[0] || null;
  const pickedP =
    isChoice(a.next_question) && pickId ? a.next_question.probabilities[pickId] : 0;

  // 確信したら言い切る / 上限に達した / 聞ける質問が尽きた、のいずれかで終了
  // 地域は証拠の量がそのまま精度になる（実測：4問以上で 6/7、3問以下で 2/9）。
  // 人格に確信しても、地域が足りていないうちは止めない。
  const geoEvidence = turnsOfCat(turns, ["geo"]).length;
  const geoEnough = geoEvidence >= GEO_MIN_EVIDENCE;

  const done =
    persona !== null &&
    asked >= MIN_QUESTIONS &&
    ((confidence >= CONFIDENT_ENOUGH && geoEnough) || asked >= MAX_QUESTIONS || !recommended);

  // 上限に達したのに地域の証拠が足りない場合は、出身地を断定しない。
  // このときの confidence は combineGeo で研いだ値なので当てにならない
  // （実測：89% や 90% でも外していた）。根拠の量で判断する。
  const geoUncertain = !geoEnough;
  const gaveUp = done && confidence < GIVE_UP_BELOW;
  // 上限まで聞いても確信しきれなかった場合は、断定せず「たぶん」と濁す。
  const hedged = done && !gaveUp && confidence < HEDGE_BELOW;

  const nextQuestion =
    !done && recommended
      ? { text: recommended.text, options: recommended.options, en: recommended.en ?? null }
      : null;

  // 性格・所見・文体は結果画面でしか使わない。毎ターン聞くと 2,351tok × 12 の無駄になるので、
  // 終了が確定してから2回目のリクエストでまとめて取る。往復が増えるのは最後の1回だけ。
  let traits: {
    id: string;
    label: string;
    labelEn: string;
    percent: number;
    level: string;
    confidence: number;
  }[] = [];
  let verdicts: { id: string; line: string; lineEn: string; noul: number }[] = [];
  let closing:
    | { label: string; labelEn: string; from: string; fromEn: string; noteEn: string; line: string; p: number }
    | null = null;
  let usage = { ...result.usage };

  // 結果画面で使う値が揃っているか。欠けていれば仕上げの1回で一緒に取る。
  let finalRegion = region;
  let finalPrefecture = prefecture;
  let finalAge = age;

  if (done) {
    try {
      const fin = await ask(
        { 回答履歴: turns },
        buildFinalQuestions(turns, { geo: !region, age: !age }),
      );
      const f = fin.answers;

      const fRegion = isChoice(f.region) ? f.region : null;
      const fPref = isChoice(f.prefecture) ? f.prefecture : null;
      if (fRegion && fPref) {
        finalRegion = fRegion;
        const probs = combineGeo(fPref.probabilities, fRegion.probabilities);
        const top = Object.entries(probs).sort((x, y) => y[1] - x[1]);
        finalPrefecture = { choice: top[0][0], probabilities: probs };
      }
      if (isChoice(f.age)) finalAge = f.age;
      usage = {
        input_tokens: usage.input_tokens + fin.usage.input_tokens,
        output_tokens: usage.output_tokens + fin.usage.output_tokens,
      };

      traits = TRAITS.map((t) => {
        const ans = f[`trait_${t.id}`];
        if (!isScore(ans)) return null;
        const max = t.levels.length - 1;
        return {
          id: t.id,
          label: t.label,
          labelEn: t.labelEn,
          percent: Math.round((ans.score / max) * 100), // 0..max を 0..100 に
          level: ans.legend[String(Math.round(ans.score))] ?? "",
          confidence: ans.confidence,
        };
      }).filter((x): x is NonNullable<typeof x> => x !== null);

      const hits = VERDICTS.map((v) => {
        const ans = f[`verdict_${v.id}`];
        if (!isNoul(ans)) return null;
        return { id: v.id, line: v.line, lineEn: v.lineEn, noul: ans.noul };
      })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .filter((v) => v.noul >= 0.5)
        .sort((x, y) => y.noul - x.noul);
      // 一つも当てはまらないのも、それはそれで所見なので空欄にはしない
      verdicts = hits.length
        ? hits
        : [
            {
              id: "none",
              line: "特にありません。よくも悪くも、普通の人です",
              lineEn: "Nothing in particular. Reassuringly ordinary.",
              noul: 0,
            },
          ];

      const pick = isChoice(f.closing) ? CLOSING_MAP[f.closing.choice] : null;
      if (pick && isChoice(f.closing)) {
        closing = {
          label: pick.label,
          labelEn: pick.labelEn,
          from: pick.from,
          fromEn: pick.fromEn,
          noteEn: pick.noteEn,
          line: pick.line,
          p: f.closing.probabilities[f.closing.choice] ?? 0,
        };
      }
    } catch (err) {
      // 仕上げの取得に失敗しても、判定そのものは返す
      console.error("[jev:final]", (err as Error).message);
    }
  }

  // 次ラウンドの候補。確率の薄いものを実際に落とす。
  // 基準は「総質問数」ではなく「人格の証拠が何問集まったか」。
  // 地域質問だけ進んだターンで絞ると、根拠なしに候補を殺すことになる。
  const personaEvidence = turnsOfCat(turns, ["personality", "style"]).length;
  const poolBefore = persona ? Object.keys(persona.probabilities).length : PERSONA_COUNT;
  const nextShortlist = persona ? narrow(persona.probabilities, personaEvidence) : shortlist;
  const topPersona = persona?.choice ?? null;

  return NextResponse.json({
    phase: done ? (gaveUp ? "gaveup" : "result") : "asking",
    hedged,
    geoUncertain,
    geoEvidence,
    asked,
    maxQuestions: MAX_QUESTIONS,
    latencyMs,
    usage,
    model: result.model,
    confidence,
    persona: persona ? { choice: persona.choice, probabilities: persona.probabilities } : null,
    // 聞かなかったターンは null。クライアントは前回値を出し続ける。
    prefecture: finalPrefecture,
    region: finalRegion
      ? {
          choice: finalRegion.choice,
          probabilities: finalRegion.probabilities,
          confidence: finalRegion.confidence,
        }
      : null,
    age: finalAge
      ? {
          choice: finalAge.choice,
          probabilities: finalAge.probabilities,
          confidence: finalAge.confidence,
        }
      : null,
    // 表示用の英名。確率マップの key は日本語のままにして、推論側とずらさない。
    labels: {
      persona: Object.fromEntries(
        Object.keys(persona?.probabilities ?? {}).map((k) => [k, PERSONA_EN[k] ?? k]),
      ),
      prefecture: PREFECTURE_EN,
      region: REGION_EN,
      age: AGE_EN,
    },
    // 判定に実際に使ったルーブリック本文。UI で「なぜそう判定されたか」を見せる。
    definitions: {
      persona: topPersona ? { name: topPersona, rubric: PERSONAS[topPersona] ?? "" } : null,
      prefecture: finalPrefecture
        ? { name: finalPrefecture.choice, rubric: PREFECTURE_RUBRIC[finalPrefecture.choice] ?? "" }
        : null,
      region: finalRegion
        ? { name: finalRegion.choice, rubric: REGIONS[finalRegion.choice] ?? "" }
        : null,
    },
    traits,
    verdicts,
    closing,
    nextQuestion,
    shortlist: nextShortlist,
    poolSize: poolBefore,
    // UI に出す「なぜこの質問になったか」の経緯
    trace: {
      slot: slot.cat ? CATEGORY_LABEL[slot.cat] : "—",
      poolCount: slot.poolCount,
      shownCount: slot.shown.length,
      pickedBy: pickId && QUESTION_MAP[pickId] ? "Jev" : "フォールバック",
      pickedP,
      eliminated: nextShortlist ? Math.max(0, poolBefore - nextShortlist.length) : 0,
      poolBefore,
      poolAfter: nextShortlist?.length ?? poolBefore,
      askedPersona: personaTurnCount > 0,
      askedGeo: geoChanged,
      askedAge: ageChanged,
      finalCall: done,
      regionChoice: finalRegion?.choice ?? null,
      regionP: finalRegion ? (finalRegion.probabilities[finalRegion.choice] ?? 0) : null,
    },
  });
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAT_KEY, t as tr, type Lang, type UIKey } from "@/lib/i18n";

type Turn = { q: string; a: string };
type Probs = Record<string, number>;
type Trait = { id: string; label: string; labelEn: string; percent: number; level: string; confidence: number };
type Verdict = { id: string; line: string; lineEn: string; noul: number };
type Closing = { label: string; labelEn: string; from: string; fromEn: string; noteEn: string; line: string; p: number };
type Named = { name: string; rubric: string } | null;

type Trace = {
  slot: string;
  poolCount: number;
  shownCount: number;
  pickedBy: string;
  pickedP?: number;
  eliminated?: number;
  poolBefore?: number;
  poolAfter?: number;
  askedGeo?: boolean;
  askedAge?: boolean;
  askedPersona?: boolean;
  finalCall?: boolean;
  regionChoice?: string | null;
  regionP?: number | null;
};

type Definitions = { persona: Named; prefecture: Named; region: Named };
type Labels = {
  persona: Record<string, string>;
  prefecture: Record<string, string>;
  region: Record<string, string>;
  age: Record<string, string>;
};

type Snapshot = {
  confidence: number;
  persona: { choice: string; probabilities: Probs } | null;
  prefecture: { choice: string; probabilities: Probs } | null;
  region: { choice: string; probabilities: Probs; confidence: number } | null;
  age: { choice: string; probabilities: Probs; confidence: number } | null;
  definitions: Definitions;
  labels: Labels;
  traits: Trait[];
  verdicts: Verdict[];
  closing: Closing | null;
  hedged?: boolean;
  latencyMs: number;
  usage: { input_tokens: number; output_tokens: number };
  model: string;
};

type ApiResponse = Partial<Snapshot> & {
  phase: "asking" | "result" | "gaveup" | "done";
  asked?: number;
  maxQuestions?: number;
  nextQuestion?: { text: string; options: string[]; en?: { text: string; options: string[] } | null } | null;
  shortlist?: string[] | null;
  poolSize?: number;
  trace?: Trace;
  error?: string;
};

type Phase = "intro" | "asking" | "result" | "gaveup" | "error";
/**
 * ログは完成した文字列ではなく「キー＋変数」で持つ。
 * 文字列で持つと、あとから言語を切り替えても過去のログだけ元の言語で残ってしまう。
 * raw は回答のエコーなど、翻訳の必要がない行に使う。
 */
type LogLine = {
  id: number;
  key?: UIKey;
  vars?: Record<string, string | number>;
  raw?: string;
  tone?: "dim" | "hit" | "good";
};
type Tab = "log" | "guess" | "result" | "trait" | "word";

const MAX_Q = 12;
const JPY_PER_USD = 150;
const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000;

const sortProbs = (p: Probs) => Object.entries(p).sort((a, b) => b[1] - a[1]);

/* ============================ 部品 ============================ */

function PixelBar({ value, segs = 14, color }: { value: number; segs?: number; color?: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * segs);
  const auto = value >= 0.6 ? "var(--green)" : value >= 0.3 ? "var(--yellow)" : "var(--red)";
  const c = color ?? auto;
  return (
    <div className="flex h-[11px] gap-[2px] border-2 border-[var(--line)] bg-[#0a0a14] p-[2px]">
      {Array.from({ length: segs }, (_, i) => (
        <div
          key={i}
          className="h-full flex-1"
          style={{
            background: i < filled ? c : "#1c1c30",
            transition: "background 120ms steps(2,end)",
          }}
        />
      ))}
    </div>
  );
}

function Win({
  title,
  children,
  className = "",
  bodyClass = "p-3",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <div className={`win relative flex min-h-0 flex-col ${className}`}>
      {title && (
        <div className="absolute -top-[12px] left-3 z-10 bg-[var(--win)] px-2">
          <span className="press text-[8px] whitespace-nowrap text-[var(--cyan)]">{title}</span>
        </div>
      )}
      {/* タイトルの黒バッジは本文に 15px 食い込む。
          同じ高さの余白を最初に挟まないと、1行目が黒で隠れて読めなくなる。 */}
      <div className={`flex min-h-0 flex-1 flex-col ${bodyClass}`}>
        {title && <div className="h-[9px] shrink-0" aria-hidden />}
        {children}
      </div>
    </div>
  );
}

/** クリックで開く窓。判定基準はここに入れて、普段は畳んでおく。 */
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3"
      onClick={onClose}
    >
      <div
        className="win pop flex max-h-[86dvh] w-full max-w-[520px] flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-4 border-[var(--line)] px-3 py-2">
          <span className="press text-[9px] text-[var(--cyan)]">{title}</span>
          <button onClick={onClose} className="press px-2 text-[11px] text-[var(--yellow)]">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}

/**
 * 候補ひとりを1体のドット絵で描く。
 * 単なる四角だと「何のマスか」が伝わらなかったので、人型にして
 * 「110人いて、何人が脱落したか」を見たままで分かるようにする。
 *
 *   .###.   頭
 *   .###.
 *   #####   腕
 *   .###.   胴
 *   .###.
 *   .#.#.   脚
 *   .#.#.
 */
function PixelPerson({ color, dim }: { color: string; dim: boolean }) {
  return (
    <svg
      viewBox="0 0 5 7"
      className="h-[13px] w-[10px] shrink-0"
      shapeRendering="crispEdges"
      fill={color}
      style={{ opacity: dim ? 0.55 : 1 }}
      aria-hidden
    >
      <rect x="1" y="0" width="3" height="2" />
      <rect x="0" y="2" width="5" height="1" />
      <rect x="1" y="3" width="3" height="2" />
      <rect x="1" y="5" width="1" height="2" />
      <rect x="3" y="5" width="1" height="2" />
    </svg>
  );
}

function CandidateGrid({
  probs,
  allLabels,
  names,
}: {
  probs: Probs | null;
  allLabels: string[];
  names?: Record<string, string>;
}) {
  const max = useMemo(() => (probs ? Math.max(...Object.values(probs), 0.0001) : 1), [probs]);
  const cells: [string, number][] = allLabels.length
    ? allLabels.map((l) => [l, probs?.[l] ?? 0])
    : Array.from({ length: 110 }, (_, i) => [`idle-${i}`, 0]);

  return (
    <div className="flex flex-wrap gap-x-[3px] gap-y-[2px]">
      {cells.map(([label, p], i) => {
        const v = probs ? Math.pow(p / max, 0.42) : 0.35;
        const dead = Boolean(probs) && p / max < 0.02;
        return (
          <span
            key={label || i}
            title={probs ? `${names?.[label] ?? label} ${(p * 100).toFixed(0)}%` : undefined}
            className={probs ? "cell-hit" : "breathe"}
            style={{ animationDelay: `${(i % 20) * 10}ms` }}
          >
            <PixelPerson
              dim={dead}
              color={
                dead
                  ? "#2b2b46"
                  : `color-mix(in oklab, var(--cyan) ${Math.round(18 + v * 82)}%, #2b2b46)`
              }
            />
          </span>
        );
      })}
    </div>
  );
}

function Ranking({
  probs,
  prev,
  label,
  names,
  rows = 5,
}: {
  probs: Probs;
  prev: Probs | null;
  label: string;
  /** 表示だけ差し替えるための日本語→英語テーブル。確率の key は日本語のまま */
  names?: Record<string, string>;
  rows?: number;
}) {
  const sorted = useMemo(() => sortProbs(probs).slice(0, rows), [probs, rows]);
  const max = sorted[0]?.[1] ?? 1;
  return (
    <div>
      <div className="press mb-1 text-[7px] text-[var(--dim)]">{label}</div>
      <div className="space-y-[4px]">
        {sorted.map(([name, p], i) => {
          const before = prev?.[name];
          const d = before === undefined ? 0 : p - before;
          return (
            <div key={name} className="flex items-center gap-[6px] text-[12px] leading-none">
              <span className={i === 0 ? "text-[var(--yellow)]" : "text-transparent"}>▶</span>
              <span className="w-[72px] shrink-0 truncate" title={name}>
                {names?.[name] ?? name}
              </span>
              <div className="h-[7px] flex-1 border border-[var(--line)] bg-[#0a0a14]">
                <div
                  className="h-full"
                  style={{
                    width: `${(p / max) * 100}%`,
                    background: i === 0 ? "var(--yellow)" : "var(--cyan)",
                    transition: "width 300ms steps(6,end)",
                  }}
                />
              </div>
              <span className="press w-[22px] shrink-0 text-right text-[7px]">
                {(p * 100).toFixed(0)}
              </span>
              <span className="press w-[20px] shrink-0 text-right text-[7px]">
                {Math.abs(d) >= 0.01 && (
                  <span style={{ color: d > 0 ? "var(--green)" : "var(--red)" }}>
                    {d > 0 ? "+" : "-"}
                    {Math.abs(d * 100).toFixed(0)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Typed({ text, delay = 0, speed = 26 }: { text: string; delay?: number; speed?: number }) {
  const [n, setN] = useState(0);
  const [go, setGo] = useState(false);
  useEffect(() => {
    setN(0);
    setGo(false);
    const t = setTimeout(() => setGo(true), delay);
    return () => clearTimeout(t);
  }, [delay, text]);
  useEffect(() => {
    if (!go || n >= text.length) return;
    const t = setTimeout(() => setN((v) => v + 1), text[n] === "\n" ? 160 : speed);
    return () => clearTimeout(t);
  }, [go, n, text, speed]);
  return (
    <span className="whitespace-pre-wrap">
      {text.slice(0, n)}
      {n < text.length && <span className="blink">▌</span>}
    </span>
  );
}

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: [Tab, string][];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="press flex-1 border-2 px-1 py-[6px] text-[8px]"
          style={{
            borderColor: active === id ? "var(--fg)" : "var(--line)",
            background: active === id ? "var(--bg2)" : "transparent",
            color: active === id ? "var(--yellow)" : "var(--dim)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ============================ 本体 ============================ */

export default function Bareru() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState<{
    text: string;
    options: string[];
    en?: { text: string; options: string[] } | null;
  } | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [prevPersona, setPrevPersona] = useState<Probs | null>(null);
  const [prevPref, setPrevPref] = useState<Probs | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [poolSize, setPoolSize] = useState(110);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [cursor, setCursor] = useState(0);
  const [errMsg, setErrMsg] = useState("");
  const [allLabels, setAllLabels] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("log");
  const [showDef, setShowDef] = useState(false);
  const [lang, setLang] = useState<Lang>("ja");
  useEffect(() => {
    const saved = localStorage.getItem("bareru-lang");
    if (saved === "en" || saved === "ja") setLang(saved);
    else if (!navigator.language.startsWith("ja")) setLang("en");
  }, []);
  const t = useCallback((k: UIKey, v?: Record<string, string | number>) => tr(k, lang, v), [lang]);
  const toggleLang = useCallback(() => {
    setLang((p) => {
      const next = p === "ja" ? "en" : "ja";
      localStorage.setItem("bareru-lang", next);
      return next;
    });
  }, []);
  /** 日本語の名前を、表示言語に合わせて置き換える */
  /** 全角の括弧・区切りは英語モードに混ぜない */
  const paren = useCallback(
    (inner: string) => (lang === "en" ? `(${inner})` : `（${inner}）`),
    [lang],
  );
  const nm = useCallback(
    (table: Record<string, string> | undefined, ja: string | undefined) =>
      !ja ? "" : lang === "en" ? (table?.[ja] ?? ja) : ja,
    [lang],
  );
  const shortlist = useRef<string[] | null>(null);
  const logId = useRef(0);
  const logBox = useRef<HTMLDivElement>(null);

  const pushLog = useCallback(
    (key: UIKey, vars?: Record<string, string | number>, tone?: LogLine["tone"]) => {
      setLogs((l) => [...l.slice(-40), { id: logId.current++, key, vars, tone }]);
    },
    [],
  );
  const pushRaw = useCallback((raw: string, tone?: LogLine["tone"]) => {
    setLogs((l) => [...l.slice(-40), { id: logId.current++, raw, tone }]);
  }, []);

  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [logs, tab]);

  const post = useCallback(
    async (nextTurns: Turn[]) => {
      setBusy(true);
      try {
        const res = await fetch("/api/diagnose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns: nextTurns, shortlist: shortlist.current }),
        });
        const data: ApiResponse = await res.json();
        if (!res.ok || data.error) {
          setErrMsg(t("errConnect"));
          setPhase("error");
          return;
        }
        if (data.shortlist) shortlist.current = data.shortlist;

        const tc = data.trace;
        if (tc) {
          pushLog("lSlot", { cat: tr(CAT_KEY[tc.slot] ?? "catGeo", lang) }, "dim");
          pushLog("lShown", { pool: tc.poolCount, shown: tc.shownCount }, "dim");
        }
        if (data.nextQuestion && tc) {
          pushLog("lPicked", {
            by: tr(tc.pickedBy === "Jev" ? "lByJev" : "lByFallback", lang),
            p: tc.pickedP ? ` ${paren(`${Math.round(tc.pickedP * 100)}%`)}` : "",
            q: (lang === "en" && data.nextQuestion.en?.text) || data.nextQuestion.text,
          });
        }
        if (tc && !tc.askedPersona) pushLog("lNoPersona", undefined, "dim");
        if (tc?.eliminated) {
          pushLog("lEliminated", { a: tc.poolBefore ?? 0, b: tc.poolAfter ?? 0, n: tc.eliminated }, "hit");
        }
        if (tc?.regionChoice) {
          pushLog(
            "lRegionPrior",
            {
              r: nm(data.labels?.region, tc.regionChoice) || tc.regionChoice,
              p: Math.round((tc.regionP ?? 0) * 100),
            },
            "dim",
          );
        } else if (tc && !tc.askedGeo) {
          pushLog("lSkipGeo", undefined, "dim");
        }
        if (tc && !tc.askedAge) pushLog("lSkipAge", undefined, "dim");
        if (tc?.finalCall) pushLog("lFinal", undefined, "good");
        if (data.confidence !== undefined && snap && tc?.askedPersona) {
          const d = Math.round((data.confidence - snap.confidence) * 100);
          pushLog(
            "lConf",
            {
              a: Math.round(snap.confidence * 100),
              b: Math.round(data.confidence * 100),
              d: d !== 0 ? ` ${paren(`${d > 0 ? "+" : ""}${d}`)}` : "",
            },
            d > 0 ? "good" : "dim",
          );
        }

        if (data.poolSize) setPoolSize(data.trace?.poolAfter ?? data.poolSize);
        if (data.persona) {
          setAllLabels((prev) => {
            const keys = Object.keys(data.persona!.probabilities);
            return keys.length > prev.length ? keys : prev;
          });
        }

        setPrevPersona(snap?.persona?.probabilities ?? null);
        // スキップしたターンは表示値が変わらないので prev も同じ値にして差分を0にする
        setPrevPref(snap?.prefecture?.probabilities ?? null);
        setSnap((prev) => ({
          ...(prev ?? ({} as Snapshot)),
          ...(data as Snapshot),
          persona: data.persona ?? prev?.persona ?? null,
          prefecture: data.prefecture ?? prev?.prefecture ?? null,
          region: data.region ?? prev?.region ?? null,
          age: data.age ?? prev?.age ?? null,
          definitions: {
            persona: data.definitions?.persona ?? prev?.definitions?.persona ?? null,
            prefecture: data.definitions?.prefecture ?? prev?.definitions?.prefecture ?? null,
            region: data.definitions?.region ?? prev?.definitions?.region ?? null,
          },
        }));
        setTokens((v) => v + (data.usage?.input_tokens ?? 0));

        setCursor(0);
        if (data.phase === "asking" && data.nextQuestion) {
          setQuestion(data.nextQuestion);
          setPhase("asking");
        } else if (data.phase === "gaveup") {
          pushLog("lGiveUp", undefined, "hit");
          setTab("result");
          setPhase("gaveup");
        } else {
          pushLog("lDone", undefined, "good");
          setTab("result");
          setPhase("result");
        }
      } catch {
        setErrMsg(t("errNetwork"));
        setPhase("error");
      } finally {
        setBusy(false);
      }
    },
    [snap, pushLog, pushRaw, lang, nm, t, paren],
  );

  const start = useCallback(() => {
    shortlist.current = null;
    logId.current = 0;
    setTurns([]);
    setSnap(null);
    setPrevPersona(null);
    setPrevPref(null);
    setTokens(0);
    setPoolSize(110);
    setAllLabels([]);
    setQuestion(null);
    setLogs([]);
    setCursor(0);
    setTab("log");
    pushLog("lStart", undefined, "good");
    post([]);
  }, [post, pushLog]);

  const answer = useCallback(
    (opt: string) => {
      if (!question || busy) return;
      pushRaw(`> ${lang === "en" ? (question.en?.options[question.options.indexOf(opt)] ?? opt) : opt}`, "good");
      const next = [...turns, { q: question.text, a: opt }];
      setTurns(next);
      post(next);
    },
    [question, turns, busy, post, pushRaw, lang],
  );

  useEffect(() => {
    if (phase !== "asking" || !question) return;
    const h = (e: KeyboardEvent) => {
      const n = question.options.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % n);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + n) % n);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        answer(question.options[cursor]);
      } else {
        const i = parseInt(e.key, 10) - 1;
        if (i >= 0 && i < n) answer(question.options[i]);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [phase, question, cursor, answer]);

  const jpy = tokens * USD_PER_INPUT_TOKEN * JPY_PER_USD;
  const conf = snap?.confidence ?? 0;
  const done = phase === "result" || phase === "gaveup";
  // 表示は英語でも、サーバーに送るのは日本語の選択肢のまま（推論の入力を変えない）
  const qText = (lang === "en" && question?.en?.text) || question?.text || "";
  const qOptions = (lang === "en" && question?.en?.options) || question?.options || [];
  // 英名テーブルは英語モードのときだけ渡す（日本語UIに英名が混ざるのを防ぐ）
  const enNames = lang === "en" ? snap?.labels : undefined;

  /* ---------------- イントロ / エラー ---------------- */
  if (phase === "intro" || phase === "error") {
    return (
      <main className="checker relative flex min-h-dvh items-center justify-center p-3">
        <div className="absolute top-3 right-3"><button
      onClick={toggleLang}
      className="press border-2 border-[var(--line)] px-2 py-[3px] text-[7px] text-[var(--cyan)] active:translate-y-[1px]"
      aria-label="Switch language"
    >
      {lang === "ja" ? "EN" : "日本語"}
    </button></div>
        <Win className="w-full max-w-[520px]" bodyClass="p-5">
          {phase === "error" ? (
            <div className="py-6 text-center">
              <p className="text-[14px] text-[var(--red)]">{errMsg}</p>
              <button
                onClick={start}
                className="press mt-6 border-4 border-[var(--fg)] bg-[var(--bg2)] px-5 py-2 text-[10px]"
              >
                {t("retry")}
              </button>
            </div>
          ) : (
            <div className="py-4 text-center">
              <h1 className="press stamp text-[26px] leading-tight text-[var(--yellow)] sm:text-[38px]">
                {t("title")}<span className="text-[var(--pink)]">.</span>
              </h1>
              <div className="mt-5 text-[13px] leading-[1.9] whitespace-pre-line sm:text-[14px]">
                {t("tagline")}
              </div>
              <div className="mt-3 text-[11px] leading-[1.7] text-[var(--dim)]">
                {t("introNote")}
                {t("jaQuizNote") && (
                  <>
                    <br />
                    {t("jaQuizNote")}
                  </>
                )}
              </div>
              <button
                onClick={start}
                disabled={busy}
                className="press mt-7 border-4 border-[var(--fg)] bg-[var(--green)] px-6 py-3 text-[11px] text-[#0a0a14] active:translate-y-[2px] disabled:opacity-50"
              >
                {t("start")}
              </button>
              <div className="press mt-7 text-[7px] leading-[2] text-[var(--dim)]">
                {t("introFoot")}
                <br />
                POWERED BY TYPESAFE JEV
              </div>
            </div>
          )}
        </Win>
      </main>
    );
  }

  /* ---------------- パネル ---------------- */

  const statusPanel = (
    <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-3">
      {(
        [
          [t("sConfidence"), `${Math.round(conf * 100)}/55`, conf / 0.55, null],
          [t("sCandidates"), String(poolSize), poolSize / 110, "var(--cyan)"],
          [t("sQuestions"), `${turns.length}/${MAX_Q}`, turns.length / MAX_Q, "var(--purple)"],
        ] as [string, string, number, string | null][]
      ).map(([label, val, v, color]) => (
        <div key={label}>
          <div className="press mb-1 flex justify-between text-[7px]">
            <span className="text-[var(--dim)]">{label}</span>
            <span style={{ color: color ?? (conf >= 0.55 ? "var(--green)" : "var(--yellow)") }}>
              {val}
            </span>
          </div>
          <PixelBar value={v} color={color ?? undefined} />
        </div>
      ))}
    </div>
  );

  const defButton = (
    <button
      onClick={() => setShowDef(true)}
      className="press w-full shrink-0 border-2 border-[var(--line)] bg-[var(--bg2)] px-2 py-[7px] text-[8px] text-[var(--cyan)] active:translate-y-[1px]"
    >
      {t("rubricOpen")}
    </button>
  );

  const guessPanel = snap ? (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {snap.persona ? (
          <Ranking
            probs={snap.persona.probabilities}
            prev={prevPersona}
            label={t("rPersona")}
            names={enNames?.persona}
          />
        ) : (
          <p className="text-[12px] leading-[1.7] text-[var(--dim)]">
            {t("noPersonaYet")}
          </p>
        )}
        {snap.prefecture && (
          <Ranking
            probs={snap.prefecture.probabilities}
            prev={prevPref}
            label={t("rPrefecture")}
            names={enNames?.prefecture}
            rows={4}
          />
        )}
        {snap.region && (
          <Ranking probs={snap.region.probabilities} prev={null} label={t("rRegion")}
            names={enNames?.region} rows={3} />
        )}
        <div>
          <div className="press mb-1 flex justify-between text-[7px] text-[var(--dim)]">
            <span>{t("gridTitle")}</span>
            <span className="text-[var(--cyan)]">{t("gridCount", { n: poolSize })}</span>
          </div>
          <p className="mb-2 text-[10px] leading-[1.6] whitespace-pre-line text-[var(--dim)]">
            {t("gridHelp")}
          </p>
          <CandidateGrid
            probs={snap.persona?.probabilities ?? null}
            allLabels={allLabels}
            names={enNames?.persona}
          />
        </div>
      </div>
      <div className="mt-2">{defButton}</div>
    </>
  ) : null;

  const logPanel = (
    <div ref={logBox} className="min-h-0 flex-1 overflow-y-auto pr-1 text-[10px] leading-[1.55]">
      {logs.map((l) => (
        <div
          key={l.id}
          className="log-in"
          style={{
            color:
              l.tone === "hit"
                ? "var(--red)"
                : l.tone === "good"
                  ? "var(--green)"
                  : l.tone === "dim"
                    ? "var(--dim)"
                    : "var(--fg)",
          }}
        >
          {l.raw ?? (l.key ? tr(l.key, lang, l.vars) : "")}
        </div>
      ))}
      {busy && (
        <div className="text-[var(--cyan)]">
          {t("lAsking")}<span className="blink">▌</span>
        </div>
      )}
    </div>
  );

  /* ---------------- 画面 ---------------- */

  return (
    <main className="checker flex h-dvh flex-col overflow-hidden p-2 sm:p-3">
      <div className="press mb-3 flex shrink-0 items-center justify-between gap-2 border-2 border-[var(--line)] bg-[var(--win)] px-2 py-[6px] text-[7px] text-[var(--dim)] sm:border-4 sm:px-3 sm:text-[8px]">
        <span className="truncate text-[var(--cyan)]">TYPESAFE/{snap?.model ?? "jev-latest"}</span>
        <span className="flex shrink-0 items-center gap-2">
          {snap && <span>{snap.latencyMs}ms</span>}
          <span className="hidden sm:inline">{tokens.toLocaleString()}tok</span>
          <span className="text-[var(--yellow)]">¥{jpy.toFixed(3)}</span>
          <button
      onClick={toggleLang}
      className="press border-2 border-[var(--line)] px-2 py-[3px] text-[7px] text-[var(--cyan)] active:translate-y-[1px]"
      aria-label="Switch language"
    >
      {lang === "ja" ? "EN" : "日本語"}
    </button>
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1fr_310px]">
        {/* ===== 左 ===== */}
        <div className="flex min-h-0 flex-col gap-3">
          {!done && question && (
            <>
              <Win title={t("wQuestion")} className="shrink-0">
                <div className="press mb-2 text-[7px] text-[var(--dim)]">Q{turns.length + 1}/?</div>
                <p className="text-[16px] leading-[1.7] sm:text-[19px]">
                  <Typed
                    key={qText}
                    text={qText}
                  />
                </p>
              </Win>

              <Win title={t("wAnswer")} className="shrink-0">
                <div className="space-y-[2px]">
                  {question.options.map((opt, i) => (
                    <button
                      key={opt}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => answer(opt)}
                      disabled={busy}
                      data-answer
                      className="flex w-full items-center gap-2 px-2 py-[7px] text-left text-[14px] disabled:opacity-50"
                      style={{
                        background: cursor === i ? "var(--bg2)" : "transparent",
                        color: cursor === i ? "var(--yellow)" : "var(--fg)",
                      }}
                    >
                      <span className={`w-[14px] ${cursor === i ? "bob" : "opacity-0"}`}>▶</span>
                      {qOptions[i] ?? opt}
                    </button>
                  ))}
                </div>
              </Win>
            </>
          )}

          {done && snap && (
            <ResultPanel
              phase={phase}
              snap={snap}
              turns={turns}
              jpy={jpy}
              tab={tab}
              lang={lang}
              t={t}
              onRestart={start}
            />
          )}

          {/* PCはログ常時表示。スマホは下のタブへ。
              flex-1 にすると結果パネルと高さを折半してしまい、
              「せいかく」「ひとこと」が1行も見えなくなるので固定高にする。 */}
          <Win
            title={t("wLog")}
            className={done ? "hidden shrink-0 lg:flex" : "hidden min-h-0 flex-1 lg:flex"}
            bodyClass="px-2 pt-[6px] pb-2"
          >
            {done ? (
              <div style={{ height: 84 }} className="flex min-h-0 flex-col">
                {logPanel}
              </div>
            ) : (
              logPanel
            )}
          </Win>
        </div>

        {/* ===== 右（PC） ===== */}
        <div className="hidden min-h-0 flex-col gap-3 lg:flex">
          <Win title={t("wStatus")} className="shrink-0">
            {statusPanel}
          </Win>
          <Win title={t("wGuess")} className="min-h-0 flex-1">
            {guessPanel}
          </Win>
        </div>

        {/* ===== スマホ ===== */}
        <div className="flex min-h-0 flex-col gap-2 lg:hidden">
          <div className="shrink-0">{statusPanel}</div>
          <TabBar
            tabs={
              done
                ? ([
                    ["result", t("tResult")],
                    ["trait", t("tTraits")],
                    ["word", t("tClosing")],
                    ["log", t("tLog")],
                  ] as [Tab, string][])
                : ([
                    ["log", t("tLog")],
                    ["guess", t("tGuess")],
                  ] as [Tab, string][])
            }
            active={tab}
            onChange={setTab}
          />
          <Win className="min-h-0 flex-1" bodyClass="p-2">
            {tab === "log" && logPanel}
            {tab === "guess" && guessPanel}
            {done && snap && (tab === "trait" || tab === "word" || tab === "result") && (
              <MobileResult snap={snap} tab={tab} lang={lang} t={t} />
            )}
          </Win>
        </div>
      </div>

      <Modal open={showDef} onClose={() => setShowDef(false)} title={t("wRubric")}>
        <p className="mb-4 text-[12px] leading-[1.8] text-[var(--dim)]">
          {t("rubricIntro")}
          <br />
          <span className="text-[var(--yellow)]">{t("rubricNote")}</span>
        </p>
        <div className="space-y-4">
          {(
            [
              [t("rubricPersona"), snap?.definitions?.persona],
              [t("rubricRegion"), snap?.definitions?.region],
              [t("rubricPref"), snap?.definitions?.prefecture],
            ] as [string, Named][]
          ).map(([label, d]) => (
            <div key={label} className="border-l-4 border-[var(--line)] pl-3">
              <div className="press mb-1 text-[7px] text-[var(--dim)]">{label}</div>
              {d ? (
                <>
                  <div className="text-[14px] text-[var(--yellow)]">{d.name}</div>
                  <div className="mt-1 text-[12px] leading-[1.7] text-[var(--dim)]">{d.rubric}</div>
                </>
              ) : (
                <div className="text-[12px] text-[var(--dim)]">{t("notYet")}</div>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </main>
  );
}

/* ============================ 結果 ============================ */

function shareText(snap: Snapshot, phase: Phase, lang: Lang) {
  const c = Math.round(snap.confidence * 100);
  const pref =
    lang === "en"
      ? (snap.labels?.prefecture?.[snap.prefecture?.choice ?? ""] ?? "somewhere")
      : (snap.prefecture?.choice ?? "どこか");
  const per =
    lang === "en"
      ? (snap.labels?.persona?.[snap.persona?.choice ?? ""] ?? "someone")
      : (snap.persona?.choice ?? "なにか");
  const approval = snap.traits.find((x) => x.id === "approval")?.percent ?? 0;
  if (lang === "en") {
    return phase === "gaveup"
      ? `I broke the AI. After 12 questions it said "…I don't know. Who even are you?" (confidence ${c}%)\n\n#bareru`
      : `An AI pinned me as a "${per} from ${pref}" (confidence ${c}%)\nNeed for approval: ${approval}%\n\n#bareru`;
  }
  return phase === "gaveup"
    ? `AIに しんだんされたら「……わかりません。あなたは何者ですか？」と こうさんされた（確信度${c}%）\n\n#バレる`
    : `AIに「${pref}出身の${per}」と言い当てられた（確信度${c}%）\n承認欲求 ${approval}%\n\n#バレる`;
}

function ShareRow({
  snap,
  phase,
  lang,
  t,
  onRestart,
}: {
  snap: Snapshot;
  phase: Phase;
  lang: Lang;
  t: (k: UIKey, v?: Record<string, string | number>) => string;
  onRestart: () => void;
}) {
  return (
    <div className="mt-3 flex shrink-0 flex-wrap justify-center gap-2">
      <a
        href={`https://x.com/intent/post?text=${encodeURIComponent(shareText(snap, phase, lang))}`}
        target="_blank"
        rel="noreferrer"
        className="press border-4 border-[var(--fg)] bg-[var(--fg)] px-4 py-2 text-[9px] text-[#0a0a14] active:translate-y-[2px]"
      >
        {t("post")}
      </a>
      <button
        onClick={onRestart}
        className="press border-4 border-[var(--line)] bg-[var(--bg2)] px-4 py-2 text-[9px] active:translate-y-[2px]"
      >
        {t("again")}
      </button>
    </div>
  );
}

type RP = {
  lang: Lang;
  t: (k: UIKey, v?: Record<string, string | number>) => string;
};

function Head({
  snap,
  phase,
  turns,
  jpy,
  lang,
  t,
}: { snap: Snapshot; phase: Phase; turns: Turn[]; jpy: number } & RP) {
  const prefUp = snap.prefecture ? sortProbs(snap.prefecture.probabilities)[1] : null;
  const perUp = snap.persona ? sortProbs(snap.persona.probabilities)[1] : null;
  const pick = (tbl: Record<string, string> | undefined, ja: string | undefined, fb: string) =>
    !ja ? fb : lang === "en" ? (tbl?.[ja] ?? ja) : ja;
  const nmP = (ja: string) => pick(snap.labels?.prefecture, ja, ja);
  const nmX = (ja: string) => pick(snap.labels?.persona, ja, ja);
  const prefName = pick(snap.labels?.prefecture, snap.prefecture?.choice, t("unknownPlace"));
  const perName = pick(snap.labels?.persona, snap.persona?.choice, t("unknownPersona"));
  const ageName = pick(snap.labels?.age, snap.age?.choice, t("ageUnknown"));
  const sep = lang === "en" ? "/" : "／";

  if (phase === "gaveup") {
    return (
      <div className="text-center">
        <div className="press text-[8px] text-[var(--red)]">{t("tooLow")}</div>
        <h2 className="mt-3 text-[19px] leading-[1.6] sm:text-[25px]">
          <Typed text={t("giveUp")} speed={44} />
        </h2>
        <p className="mt-3 text-[12px] leading-[1.8] text-[var(--dim)]">
          {t("giveUpBody", { n: turns.length, c: Math.round(snap.confidence * 100) })}
          <br />
          <span className="text-[var(--yellow)]">{t("giveUpPunch")}</span>
        </p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <div className="press text-[8px]" style={{ color: snap.hedged ? "var(--yellow)" : "var(--green)" }}>
        {snap.hedged ? t("notSure") : t("gotIt")}
      </div>
      <div className="mt-3 text-[11px] text-[var(--dim)]">
        {snap.hedged ? t("youProbablyAre") : t("youAre")}
      </div>
      <h2 className="stamp mt-2 text-[21px] leading-[1.45] sm:text-[29px]">
        {lang === "en" ? (
          <>
            <span className="text-[var(--pink)]">{perName}</span>
            <br />
            {t("fromSuffix")} <span className="text-[var(--cyan)]">{prefName}</span>
          </>
        ) : (
          <>
            <span className="text-[var(--cyan)]">{prefName}</span>
            {t("fromSuffix")}
            <br />
            <span className="text-[var(--pink)]">{perName}</span>
          </>
        )}
      </h2>
      <div className="press mt-3 text-[7px] leading-[2] text-[var(--dim)]">
        {t("ageLabel")} {ageName} {sep} {t("confShort")} {Math.round(snap.confidence * 100)}%{" "}
        {sep} {turns.length} {t("questionsUnit")}
      </div>
      <div className="mt-2 space-y-[2px] text-[11px] text-[var(--dim)]">
        {prefUp && prefUp[1] > 0.04 && (
          <p>{t("alsoPossible", { name: nmP(prefUp[0]), p: Math.round(prefUp[1] * 100) })}</p>
        )}
        {perUp && perUp[1] > 0.04 && (
          <p>{t("alsoPersona", { name: nmX(perUp[0]), p: Math.round(perUp[1] * 100) })}</p>
        )}
        <p className="press pt-1 text-[7px]">
          {t("costLabel")} ¥{jpy.toFixed(3)}
        </p>
      </div>
    </div>
  );
}

function TraitBlock({ snap, lang }: { snap: Snapshot } & RP) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-[6px] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {snap.traits.map((tt) => (
          <div key={tt.id} className="flex items-center gap-2">
            <span className="w-[66px] shrink-0 text-[12px] text-[var(--dim)]">
              {lang === "en" ? tt.labelEn : tt.label}
            </span>
            <div className="flex-1">
              <PixelBar
                value={tt.percent / 100}
                segs={12}
                color={tt.percent >= 70 ? "var(--pink)" : "var(--cyan)"}
              />
            </div>
            <span className="press w-[20px] shrink-0 text-right text-[7px]">{tt.percent}</span>
          </div>
        ))}
      </div>
      {snap.verdicts.length > 0 && (
        <ul className="mt-3 space-y-1 border-t-2 border-[var(--line)] pt-2 text-[12px]">
          {snap.verdicts.slice(0, 3).map((v) => (
            <li key={v.id} className="flex items-baseline gap-2">
              <span className="text-[var(--yellow)]">▶</span>
              <span className="flex-1">{lang === "en" ? v.lineEn : v.line}</span>
              {v.noul > 0 && (
                <span className="press text-[7px] text-[var(--dim)]">{Math.round(v.noul * 100)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WordBlock({ snap, lang }: { snap: Snapshot } & RP) {
  if (!snap.closing) return null;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-1 text-[11px] text-[var(--dim)]">
        {lang === "en"
          ? `${snap.closing.fromEn} (${snap.closing.labelEn})`
          : `${snap.closing.from}（${snap.closing.label}）`}
      </div>
      <p className="text-[13px] leading-[1.95]">
        <Typed text={snap.closing.line} delay={500} speed={28} />
      </p>
    </div>
  );
}

function MobileResult({ snap, tab, lang, t }: { snap: Snapshot; tab: Tab } & RP) {
  if (tab === "trait") return <TraitBlock snap={snap} lang={lang} t={t} />;
  if (tab === "word") return <WordBlock snap={snap} lang={lang} t={t} />;
  return null;
}

function ResultPanel({
  phase,
  snap,
  turns,
  jpy,
  tab,
  lang,
  t,
  onRestart,
}: {
  phase: Phase;
  snap: Snapshot;
  turns: Turn[];
  jpy: number;
  tab: Tab;
  onRestart: () => void;
} & RP) {
  return (
    <>
      {/* PC：結果・性格・ひとことを並べて一画面に収める */}
      <div className="hidden min-h-0 flex-1 grid-rows-[auto_1fr] gap-3 lg:grid">
        <Win title={t("wResult")} className="shrink-0">
          <Head snap={snap} phase={phase} turns={turns} jpy={jpy} lang={lang} t={t} />
          {phase === "gaveup" && <ShareRow snap={snap} phase={phase} lang={lang} t={t} onRestart={onRestart} />}
        </Win>
        {phase !== "gaveup" && (
          <div className="grid min-h-0 gap-3 xl:grid-cols-2">
            <Win title={t("wTraits")} className="min-h-0">
              <TraitBlock snap={snap} lang={lang} t={t} />
            </Win>
            <Win title={t("wClosing")} className="min-h-0">
              <WordBlock snap={snap} lang={lang} t={t} />
              <ShareRow snap={snap} phase={phase} lang={lang} t={t} onRestart={onRestart} />
            </Win>
          </div>
        )}
      </div>

      {/* スマホ：けっかタブのときだけ本体を出す（他はタブ側で描画） */}
      {tab === "result" && (
        <Win title={t("wResult")} className="min-h-0 flex-1 lg:hidden">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Head snap={snap} phase={phase} turns={turns} jpy={jpy} lang={lang} t={t} />
          </div>
          <ShareRow snap={snap} phase={phase} lang={lang} t={t} onRestart={onRestart} />
        </Win>
      )}
    </>
  );
}

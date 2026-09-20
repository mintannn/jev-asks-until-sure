// TypeSafe System One (Jev) の薄いクライアント。
// APIキーはサーバー側だけで扱う（クライアントに出さない）。

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export type NoulQuestion = {
  type: "noul";
  instructions: string | object;
  criteria?: { true?: string; false?: string };
};

export type ChoiceQuestion = {
  type: "choice";
  instructions: string | object;
  criteria: Record<string, string | null>;
};

export type ScoreQuestion = {
  type: "score";
  instructions: string | object;
  criteria: string[];
};

export type JevQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
export type ScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};
export type JevAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type JevResponse = {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
};

export class JevError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "JevError";
  }
}

/**
 * 独立した質問はまとめて1リクエストで投げる。並列評価されるので
 * 質問を足してもレイテンシはほぼ変わらない（＝この診断の心臓部）。
 * 429 / 529 は指数バックオフでリトライする。
 */
export async function ask(
  state: unknown,
  questions: Record<string, JevQuestion>,
  { retries = 3, signal }: { retries?: number; signal?: AbortSignal } = {},
): Promise<JevResponse> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) throw new JevError(500, "TYPESAFE_API_KEY is not set");

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "jev-latest", state, questions }),
        signal,
      });

      if (res.ok) return (await res.json()) as JevResponse;

      const body = await res.text();
      // 429/529 のみリトライ。それ以外は即座に投げる。
      if (res.status !== 429 && res.status !== 529) {
        throw new JevError(res.status, body.slice(0, 500));
      }
      lastError = new JevError(res.status, body.slice(0, 500));
    } catch (err) {
      if (err instanceof JevError && err.status !== 429 && err.status !== 529) throw err;
      if ((err as Error)?.name === "AbortError") throw err;
      lastError = err;
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt + Math.random() * 100));
    }
  }
  throw lastError instanceof Error ? lastError : new JevError(500, "Jev request failed");
}

export function isChoice(a: JevAnswer | undefined): a is ChoiceAnswer {
  return a?.type === "choice";
}
export function isScore(a: JevAnswer | undefined): a is ScoreAnswer {
  return a?.type === "score";
}
export function isNoul(a: JevAnswer | undefined): a is NoulAnswer {
  return a?.type === "noul";
}

/** probabilities を降順の配列にして上位 n 件返す */
export function topN(probs: Record<string, number>, n: number) {
  return Object.entries(probs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, p]) => ({ label, p }));
}

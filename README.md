# jev-asks-until-sure

A twenty-questions game where the model decides how many questions to ask.

It guesses your persona, the part of Japan you grew up in, and roughly how old you are.
Sure after five questions? It stops at five. Not sure? It keeps going. And if it still
can't tell after twelve, it says so instead of guessing:

> ……わかりません。あなたは なにものですか？
> *(…I don't know. Who even are you?)*

That refusal is the point of the whole thing.

🇯🇵 [日本語](./README.ja.md) ・ 📓 [Build notes](./docs/build-notes.md) ・
built on [Jev](https://typesafe.ai) by TypeSafe AI

---

## What makes it a Jev demo

Most demos of a classification model show you a label and a number. The genuinely new
thing about Jev — that it knows how much it knows — never makes it onto the screen.

So here confidence isn't a debug field, it's the game mechanic. In an akinator, *how
many more questions do I need* is the entire product. Three consequences:

**The number of questions is not fixed.** Confidence over 55% and it commits. Between
28% and 45% it hedges out loud — *"can't say for sure, but probably…"*. Below 28% it
refuses. The verdict's wording changes, not just the number under it.

**There is no loading state.** One request per turn, measured at 230–440ms, so every
candidate bar moves the instant you click. Nothing spins.

**You can watch it think.** The reasoning log narrates each turn and keeps the two
authors separate — what the code decided versus what Jev decided.

```
Drew a question slot → geography
Showed Jev 5 of 6 questions in that slot
Jev picked (76%): Have you ever shovelled snow?
Candidates 110 → 64 — 46 eliminated!
Weighting prefectures by region Kyushu & Okinawa at 97%
No new age evidence either → skipping
Confidence 0 → 33 (+33)
```

Confidence dropping is left visible too. Every turn is re-evaluated from scratch, so
when a new answer contradicts the earlier guess it falls, and that's worth seeing.

## On screen

An 8-bit JRPG, because a confidence meter is an HP bar and eliminated candidates are
enemies you've defeated.

- **Live rankings** for personas, prefectures and regions, with per-turn deltas
- **110 pixel figures**, one per candidate, going dark as they're ruled out
- **The rubric**, behind a button — the literal `criteria` string handed to Jev for
  whatever it currently thinks you are
- **Japanese and English**, toggled top-right
- Keyboard play: `↑↓` and `Enter`, or number keys

## How Jev is used

Every turn is a single request carrying up to 18 independent judgments. They're
evaluated in parallel, so adding questions barely moves latency.

| question | type | options |
| --- | --- | --- |
| `persona` | Choice | 110 archetypes, shrinking as candidates are eliminated |
| `region` | Choice | 8 regions of Japan |
| `prefecture` | Choice | 47 prefectures |
| `age` | Choice | 5 brackets |
| `closing` | Choice | which of 14 voices delivers the verdict |
| `trait_*` | Score ×8 | need for approval, self-doubt, intimidation, … |
| `verdict_*` | Noul ×8 | "writes long messages late at night?" |
| `next_question` | Choice | which question to ask next |

Five patterns doing the actual work:

**Confidence as control flow.** The stopping rule, the hedge and the refusal all read
from `confidence` directly. Nothing else decides when the game ends.

**Coarse Choice as a prior over fine Choice.** 47 options spread probability too thin
for confidence to mean anything; 8 regions concentrate it. Both are asked in the same
request, and the region distribution is multiplied into the prefecture distribution.

**Scoped evidence per question.** `instructions` takes structured data, so one request
can feed different evidence to different questions — the prefecture judgment sees only
geography answers, the persona judgment only personality answers.

**Eliminate between turns.** Candidates below a probability floor are dropped from the
next request's `criteria`, which is what lets confidence climb over a 110-option set.

**Select instead of generate.** Jev doesn't write text, so the closing line is fourteen
voices written by hand with Jev choosing which one you get. The constraint is a feature:
hand-written lines land better than generated ones, and picking between them is exactly
what Choice is for.

**Speculative fan-out.** `next_question` is asked before we know whether the game will
even continue. Parallel evaluation makes that free in wall-clock time.

The division of labour: **code owns the workflow, Jev owns the judgment.** Which
category to draw from, when to stop, which candidates to eliminate — code. Which
question within that category, and who you are — Jev.

## Numbers

| | |
| --- | --- |
| Latency | 230–440ms per turn |
| Cost | ¥0.31 (~$0.002) for a full twelve-question game |
| Region accuracy | 12/16 measured, guessing 1 of 47 from ~5 questions |
| Binding constraint | the rate limit, 1,200 req/min ≈ 20/sec — not cost |

Skipping judgments whose evidence hasn't changed cut input tokens 52%. Details of how
those numbers were arrived at are in the [build notes](./docs/build-notes.md).

## A deliberate non-feature

Switching to English changes the UI and nothing else. Every `state`, `question` and
`criteria` sent to Jev stays Japanese.

All of it was tuned against Japanese, and none of those measurements would survive
translating the model input. So the client renders English while still posting the
Japanese answer string, and the rubric panel shows the Japanese it actually sent rather
than a translation of it.

## Running it

```bash
npm install
echo "TYPESAFE_API_KEY=..." > .env.local
npm run dev
```

The key is read server-side only.

| file | |
| --- | --- |
| `app/bareru.tsx` | the whole UI |
| `app/api/diagnose/route.ts` | Jev calls, elimination, scheduling, stopping rule |
| `lib/jev.ts` | thin System One client, backs off on 429/529 |
| `lib/personas.ts` | 110 personas, age brackets |
| `lib/geo.ts` | rubrics for 8 regions and 47 prefectures |
| `lib/questions.ts` | question bank, quotas, the geography core, traits, Nouls |
| `lib/closings.ts` | 14 closing voices |
| `lib/i18n.ts` | UI strings |

Next.js, deployed on Vercel. MIT.

---

Built by [@uniminyo](https://x.com/uniminyo).

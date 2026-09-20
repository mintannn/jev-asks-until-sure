# jev-asks-until-sure

A twenty-questions game where the model decides how many questions to ask.

It guesses your persona, the part of Japan you grew up in, and roughly how old you are.
If it's sure after five questions, it stops at five. If it isn't, it keeps going. And if
it still can't tell after twelve, it says so instead of guessing:

> ……わかりません。あなたは なにものですか？
> *(…I don't know. Who even are you?)*

That last case is the whole reason this exists.

🇯🇵 [日本語版 README](./README.ja.md) ・ built on [Jev](https://typesafe.ai) by TypeSafe AI

---

## Why I built it

Most demos of a classification model show you a label and a number. That's accurate but
it isn't interesting, because the part that's actually novel — the model knowing how
much it knows — never shows up on screen.

Jev returns calibrated confidence alongside every judgment. So I wanted something where
confidence isn't a debug field, it's the game mechanic. In an akinator, "how many more
questions do I need?" *is* the product. If the confidence is real, the game works. If
it's decorative, the game falls apart and you can watch it fall apart.

It also turns out the whole thing runs on **one request per turn, ~250ms**, which means
there is no loading state anywhere. Every candidate bar moves the instant you click.
I didn't design for that — it's just what happens when judgments are this fast — and it
changes how the screen feels more than I expected.

## What's on screen

The UI is a 1980s JRPG, because a confidence meter is an HP bar and eliminated
candidates are enemies you've defeated, and once that clicked I couldn't unsee it.

- **A reasoning log** that narrates every turn, separating what the code decided from
  what Jev decided. Which slot was drawn, which of the offered questions Jev picked and
  with what probability, how many candidates just got eliminated, what got skipped and
  why.
- **A live ranking** of personas, prefectures and regions, with deltas from the previous
  turn.
- **110 cells**, one per persona, dimming as candidates are ruled out.
- **The rubric**, behind a button. This is the actual `criteria` string handed to Jev for
  whatever it currently thinks you are. Least glamorous panel, most important one — see
  the Hokkaido section below.
- **Japanese and English**, toggled top-right. The UI is translated; the model input
  stays Japanese on purpose (more on that at the bottom).

Confidence also changes how the verdict is *worded*, not just what number sits under it:

| confidence | what it says |
| --- | --- |
| ≥ 55% | **わかりました！** — states it |
| 28–45% | **いいきれませんが……たぶん** — "can't say for sure, but probably" |
| < 28% | **……わかりません。あなたは なにものですか？** — refuses |

## How a turn works

One request goes out per answer. Depending on what actually changed, it carries:

| question | type | options |
| --- | --- | --- |
| `persona` | Choice | 110 archetypes, shrinking as candidates die |
| `region` | Choice | 8 regions of Japan |
| `prefecture` | Choice | 47 prefectures |
| `age` | Choice | 5 brackets |
| `closing` | Choice | which of 14 voices delivers the verdict |
| `trait_*` | Score ×8 | need for approval, self-doubt, intimidation, … |
| `verdict_*` | Noul ×8 | "writes long messages late at night?" |
| `next_question` | Choice | which question to ask next |

They're independent, so Jev evaluates them in parallel and adding questions barely moves
latency. `next_question` is speculative — asked before we know whether the game will even
continue — and that costs nothing in wall-clock time.

The division of labour ended up being: **code owns the workflow, Jev owns the judgment.**
Which category to draw from, when to stop, which candidates to eliminate — all code.
Which question within the category, and what you are — all Jev. Every time I let that
line blur, something broke.

---

# The part where things went wrong

I kept notes while building this, mostly because every failure turned out to be my
mistake rather than the model's, and the mistakes were more interesting than the code.
Numbers below are measured, not estimated.

## Everyone was from Hokkaido

The first version guessed a prefecture and it felt fine until I actually measured it.
Eight prefectures, answering the geography questions honestly, twice each:

| evidence I gave it | what it said |
| --- | --- |
| Kansai-flavored answers | Osaka 64% ✅ |
| Tokyo-flavored answers | Tokyo 55% ✅ |
| **Kyushu-flavored answers** | **Hokkaido 51%** ❌ |
| **Tohoku-flavored answers** | Hokkaido 27%, Akita 6% ❌ |
| **nothing geographic at all** | Tokyo 51%, and confident about it ❌ |

Two sinks had formed. Hokkaido absorbed anything that read as "rural", Tokyo absorbed
anything with no signal. I went looking for a prompt problem and found a one-line
problem:

```ts
// all 47 prefectures, no rubric
Object.fromEntries(PREFECTURES.map((p) => [p, null]))
```

I'd written a careful description for all 110 personas and then passed the prefectures as
bare names. `criteria` isn't a label list — it *is* the thing the model matches against.
With nothing there, Jev had no choice but to fall back on whatever each prefecture name
evokes on its own, and "Hokkaido" evokes snow and open road.

Writing 47 rubrics fixed most of it. Two structural changes fixed the rest.

**Ask the region separately.** 47 options spread probability so thin that confidence
stops meaning anything. 8 regions concentrate it. So I ask both in the same request and
multiply the prefecture distribution by the region distribution as a prior.

```ts
const r = Math.pow((regionProbs[REGION_OF[pref]] ?? 0) + 0.02, 0.5);
```

The exponent is there because multiplying straight through pinned everything at 100% and
killed the fun of watching the distribution move. The `+ 0.02` keeps a candidate alive
even when the region has written it off, so later evidence can bring it back.

**Give each question only the evidence that can move it.** The prefecture judgment was
seeing every answer, including "how many alarms do you set", and drowning in noise. The
docs mention you can put structured data in `instructions`, which means one request can
still feed different evidence to different questions:

```ts
prefecture: {
  type: "choice",
  instructions: {
    地域に関する回答: turnsOfCat(turns, ["geo"]),   // geography answers only
    question: "Using only `地域に関する回答`, which prefecture…",
  },
  criteria: PREFECTURE_RUBRIC,
}
```

Kyushu → Fukuoka 91%. Okinawa → Okinawa 100%. Hiroshima → Hiroshima 99%.

## Then it was still wrong, and the model still wasn't the problem

Region accuracy after all that: **6 out of 16.** Baffling, because the probes above all
passed.

Splitting the runs by how many geography questions had actually been asked explained it
immediately:

| geography questions asked | correct |
| --- | --- |
| 1–2 | **0 / 7** |
| 3 | 1 / 2 |
| 4 | 5 / 7 |

Average asked: **2.9**. The quota said four, but the weighted draw never filled it.

And the sixteen geography questions in the bank are nowhere near equal. Feeding them in
isolation:

| what I fed it | result |
| --- | --- |
| dialect ending, typhoon, snow shovelling | Fukuoka **90%** ✅ |
| udon-vs-soba, bullet train, miso soup | Kanto **67%** ❌ |
| dialect ending, okonomiyaki style | Hiroshima **99%** ✅ |

Same person. Opposite ends of the country. Entirely down to which questions happened to
come up.

So the fix wasn't about the model at all:

- **deadline scheduling** — once remaining turns equal remaining quota, under-filled
  categories get forced
- **a core of six** geography questions, each splitting Japan on a different axis (two
  dialect questions, snow, typhoon, escalator side, distance to the sea). The geography
  slot draws from the core until it's exhausted.

**6/16 → 12/16.** Guessing 1 of 47 from five multiple-choice questions is tight on
information alone, so 75% is somewhere near the ceiling for this format.

The counter-intuitive bit: **making the core bigger made it worse.** Going from six core
questions to eight dropped it to 8/16, because only five get asked — a larger core just
gives you more ways to miss the decisive one. The core has to stay roughly the size of
what you'll actually ask. I would not have guessed that.

## Everyone was also cold and terse

Different symptom, same shape of mistake.

| answer given | "cold and terse" |
| --- | --- |
| "udon" | **86%** |
| "I stand on the left" | 58% |
| "the train" | 52% |
| "I talk a lot in group chats" | 4% |

The top three are *geography* questions. I'd scoped evidence for prefecture and age and
then never did it for persona, so the persona judgment was reading "udon" as a curt reply
from a curt person. Scoping it to personality answers fixed that instantly.

And then a different persona took the throne: **"Zero-Emoji Person", 40%** — defined as
someone who *reveals nothing about themselves*. Which of course matches an empty evidence
set better than anything else does. The fix there is to not ask:

> **If a question has no evidence yet, don't ask it.** Forcing a choice out of nothing
> doesn't produce a neutral answer. It produces whichever option best describes nothing.

The last piece was the rubrics themselves. I'd written them describing how someone
*writes* — meaningless here, because this is a multiple-choice quiz and nobody writes
anything. "Replies in one word" matches every single person by construction.

```diff
- "塩対応": "replies in one word, never uses emoji or punctuation"
+ "塩対応": "declines invitations, mutes notifications, keeps conversations shallow"
```

Twelve single-answer probes afterwards produced twelve different personas. "Cold
shoulder" now only wins on "I've muted the group chat", at 88%, which is correct.

## Every player got the same questions

The category order was a fixed array and `next_question` picks the most informative
option, so the sequence was **structurally identical for everyone**. Now the category is
drawn with weights from the remaining quota, and Jev sees a random subset of five rather
than the whole bank.

Worth noting this one directly fights the geography fix — subsampling is exactly what was
hiding the decisive questions. So geography draws from its core and everything else
subsamples. It isn't elegant. It's what the measurements wanted.

## All eight Noul answers sat at 0.3

A template was producing ungrammatical Japanese: `"…is the type to X"` + `"?"`. Every
judgment came back near-identical and I assumed the model was hedging.

`instructions` has to be one complete question that stands on its own, with `criteria`
spelling out what yes and no each mean:

```ts
{
  type: "noul",
  instructions: "Does this person apologize first even when they're not at fault?",
  criteria: {
    true: "apologizes reflexively to avoid conflict",
    false: "doesn't apologize when not at fault",
  },
}
```

---

## 9,711 tokens a request, of which 300 are new

Jev charges for input tokens only; output is free, which made me lazy about request size
until I measured one:

| block | tokens | actually changes between turns? |
| --- | --- | --- |
| persona, 110 options | 3,919 | only as candidates die |
| prefecture, 47 options | 2,007 | ❌ only after a geography answer |
| traits + closing + verdicts | 2,351 | ❌ only used on the result screen |
| region + age | 840 | ❌ only when relevant evidence arrives |
| **state — the actual answers** | **~300** | ✅ |

Parallel evaluation makes extra questions free in *latency*. It does not make them free.

Two changes: skip any question whose evidence didn't change this turn, and fetch the
result-only judgments in a second request once the verdict is settled.

**101,294 → 48,814 tokens. ¥0.638 → ¥0.308 per full game.**

The real constraint isn't cost anyway — it's the rate limit, 1,200 requests/minute, about
20 a second. That's what would break first if this ever got traffic.

## Style is picked, not written

Jev doesn't generate text, so the closing line is fourteen voices I wrote by hand and Jev
chooses which one you get. That constraint turned out to be a feature: hand-written lines
are funnier than generated ones, and choosing between them is exactly what Choice is for.

A few of them are Japanese internet registers that don't survive translation, so they
stay in Japanese in both language modes with an English note explaining what you're
looking at.

## One deliberate non-feature

Switching to English changes the UI and nothing else. Every `state`, `question` and
`criteria` sent to Jev stays Japanese, always.

I tuned all of it against Japanese — the 12/16 on region, the persona spread, the rubric
rewrites — and none of those numbers would survive translating the model input. So the
client displays English while still posting the Japanese answer string, and the rubric
panel shows you the Japanese it actually sent rather than a translation of it.

---

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

# Build notes

What broke while building [jev-asks-until-sure](../README.md), and what the measurements
said. Every failure here turned out to be a mistake in how I was using System One rather
than a problem with the model, which is the main reason I wrote them down.

All numbers are measured against the live API, not estimated.

← [back to the README](../README.md) ・ [日本語版](./build-notes.ja.md)

---

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

## Still wrong, and still not the model

Region accuracy after all that: **6 out of 16**, even though every probe above passed.

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

## Everyone also came out as cold and terse

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

---

← [back to the README](../README.md)

## Hardening the public endpoint

`/api/diagnose` is unauthenticated and every call spends money, so it's worth being
precise about what it accepts. Measured against the deployed version before fixing:

| probe | result |
| --- | --- |
| 18KB payload in a single turn | accepted — **6,671 input tokens**, ~22× a normal turn |
| question text not in the bank | accepted, passed straight into Jev's `state` |
| requests per minute | unlimited |

Nothing here leaks data — Jev returns one of the options you defined and cannot generate
text or call tools — but it does let a stranger spend your budget and exhaust the shared
1,200 req/min limit.

Three changes:

- **Accept only bank questions and their own options.** A turn must match a question in
  the bank and one of that question's options, with no repeats. This kills arbitrary
  input and bounds length in one move, since the valid set is fixed.
- **Cap the body at 32KB** before parsing.
- **Per-IP rate limit**, 40 requests a minute against a 13-request game. In-memory, so
  it's per-instance and not airtight on serverless — it stops casual hammering, and
  anything stronger wants Vercel BotID or a shared store.

Verified: no API key in the client bundle or HTML, no `dangerouslySetInnerHTML`, no
`eval`, and `npm audit` clean.

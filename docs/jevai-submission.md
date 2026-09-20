# jevai.org submission draft

Paste-ready content for the form at <https://www.jevai.org/apps/submit>.
Requires signing in first — the form rejects anonymous submissions.

| Field | Value |
| --- | --- |
| **App name** | `jev-asks-until-sure` |
| **Category** | `Creative` |
| **Website** | `https://jev.mintan.org` |
| **GitHub** | `https://github.com/mintannn/jev-asks-until-sure` |

## Description

A twenty-questions game where Jev's calibrated confidence decides how many questions to
ask. It commits above 55%, hedges between 28-45% ("can't say for sure, but probably..."),
and below 28% it refuses to answer rather than guess: "I don't know. Who even are you?"

Confidence is the game mechanic here, not a debug field. In a guessing game, "how many
more questions do I need" is the entire product — so if the confidence is real the game
works, and if it is decorative you can watch it fall apart.

One request per turn carries up to 18 independent judgments: Choice over 110 personas, 47
prefectures, 8 regions and 14 closing voices, plus 8 Scores, 8 Nouls and a speculative
next-question Choice. Measured at 230-440ms, so there is no loading state anywhere —
every candidate bar moves the instant you click. The UI narrates each turn, separating
what the code decided from what Jev decided.

Four patterns did the heavy lifting: a coarse 8-way region Choice used as a prior over the
47-way prefecture Choice; scoped evidence per question via structured instructions, so one
request feeds geography answers to one judgment and personality answers to another;
eliminating low-probability candidates between turns so confidence can climb over a
110-option set; and selecting a hand-written closing line instead of generating one.

The repo ships build notes with measurements for five failures, all of them my mistakes
rather than the model's. Passing 47 prefectures as `criteria: null` collapsed geography
into two sinks — "rural" became Hokkaido, "no evidence" became Tokyo. Region accuracy went
6/16 to 12/16 once the rubrics were written and a core question set was forced.
Counter-intuitively, enlarging that core made it worse again, because only five questions
actually get asked. And 97% of every request turned out to be the same criteria resent, so
skipping judgments whose evidence had not changed cut input tokens by 52%.

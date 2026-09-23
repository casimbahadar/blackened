# BLACKENED — session handoff

Continuing work on BLACKENED. Read this, unzip the attached files, confirm they
are intact, then wait for my instructions before changing anything.

## WHAT IT IS

BLACKENED is an original killing-game simulator (Danganronpa-inspired, original
prose, host default "PALLOR"). Single offline HTML file, dark styling,
mobile-first, no network calls.

## FILES ATTACHED

`blackened-handoff.zip` contains `blackened.html` (the game, ~446KB),
`blackened.tests.mjs` (engine harness, ~6.5 min), `blackened.smoke.mjs` (jsdom UI
harness), `blackened.text.mjs` (text-quality harness), and five read-only probes
under `probes/` described at the end of this file. Unzip into a working dir (e.g.
`/home/claude/kg`), then `npm install jsdom`.

**Do not cat or view the whole HTML, and do not grep it with patterns that can
match the big single-line tables** (`PARTS`, `SPEECH`, weapon/item tables around
lines 1100-1400 and 3030-3140). A single such grep can dump tens of thousands of
tokens and cost you the session. Use `sed -n 'A,Bp' | cut -c1-160`, or grep with
`| cut -c1-140 | head`, or `awk 'NR!=<bad line>'` to exclude a known offender.

**Background jobs do not survive between tool calls.** `nohup ... &` alone gets
reaped and leaves an empty log. Launch the engine suite with `setsid nohup node
blackened.tests.mjs > engine.log 2>&1 < /dev/null &` and sleep in the same call,
then read the log in the next one. It takes about 6.5 minutes, past the per-call
limit, so it always spans two calls. `pgrep -f blackened.tests.mjs` matches the
shell running the pgrep, so it reports a false positive; use `ps -eo pid,etime,cmd
| grep blackened.tests | grep -v grep`.

## VERIFIED STATE (last run, all passing)

- engine: **81,465 assertions, 0 failed**
- UI smoke: **120 assertions, 0 failed** (see the known wobble below)
- text quality: **34 assertions, 0 failed**
- daily-life repetition: DAILY 14.5%, MORNING 1.1%, NIGHT 8.5%, AFTERMATH 5.8%
- no repeated spoken line across 200 runs
- no em or en dashes in generated text or the interface. The only occurrence
  left is the escaped `\u2014\u2013` in the cast-paste parser's split regex,
  which is functional. Search for escapes as well as literal characters: a
  byte-level `[—–]` bracket also matches `…`, and the old check missed seven
  visible dashes written as `\u2014` and `&mdash;`

Assertion counts are not a build fingerprint: some assertions are data-dependent,
so the engine count moves when content changes. Use md5 for identity.

Run smoke and text alone, not alongside the backgrounded engine suite — resource
contention makes smoke appear to crash when it is fine.

## ARCHITECTURE

Two script blocks: a pure CORE engine exposed as `KG` with no DOM access (the
harness extracts it between `/* CORE-START */` and `/* CORE-END */`), plus a UI
layer. Deterministic RNG (mulberry32 + FNV-1a seed). The engine is a resumable
generator: `KG.begin()` returns `G`, then `KG.step(G, ans)` mutates it — the
prompt is `G.pending` and the flag is `G.done` (NOT a returned iterator result).
`KG.simulate()` wraps it with `autoAnswer` and returns `G.out` only, so anything
needing engine state (`S.perks`, `S.favour`, `S.cast`) must drive begin/step by
hand. Watch mode calls `simulate()` up front and reveals progressively;
Interactive mode streams. That difference matters: in Watch mode `run.final`
exists from the first frame, which is how the mastermind used to leak.

## CONTENT

11 rosters, 170 characters (preset casts intentionally match official source
info; players edit from there). 5 stats, 16 traits, 46 weapons across 12 method
categories, 20 motives, 18 venues, 22 items, 12 group events, 7 distractions,
hidden mastermind plus up to 2 moles, protagonist succession, per-body House
Files that declassify as evidence lands. 6 speech registers; dialogue renders as
`name + attribution beat + quote`, beat before or after at roughly 62/38.

Pool sizes that matter, because three separate defects this session were pools
running dry: DAILY 66 entries against ~69 draws a run, MORNING 18 against ~13,
NIGHT 10 against ~9, AFTERMATH 10 against ~8, TOPIC_GENERIC 34 plus 6 openers per
tag against a worst observed run of 26.

## BUILT PREVIOUSLY (all verified)

Favour (30 trait-keyed actions, hash-driven, spends no RNG), 14 perks across
survival/knowledge/social with mid-run offers at chapter breaks, knowledge perks
surfacing spoken or hoarded via `sharesSecret`, host-assigned negative perks,
four hosts (PALLOR, VESTRY, TALLY, BENEFICE), traitors hidden until death,
mastermind protection lapsing from chapter 3 into a `showdown`, mistrial when the
mastermind is the culprit (~13% of runs), two independent killers in one chapter
(~22%), accomplices with roles drawn from the crime's real facts, ~16-line case
summaries, and the prose passes (vagueness audit, cohesion, daily event
freshness, listener-aware beats).

## BUILT THIS SESSION (all verified)

- **Traitor self-purchasing was already in the file** at `traitorSpend`, called at
  every chapter open, with the reveal consuming `S.traitorBuys` at execution. The
  previous handoff said there was zero trace of it. Trust the file.
- **Coverage for it**, since it had none: eight assertions in the engine harness
  covering ownership, that a recorded perk is actually held, the one-survival cap,
  one-per-category, no Spokesman, no negative perks, non-negative balances, and a
  floor of 8% of runs containing a purchase so it cannot be silently disabled.
  Perk categories are parsed out of the shipped `PERKS` table, so renaming a perk
  fails loudly instead of skipping the check. Measured: 37.8% of runs contain a
  purchase, 0.45 per run +/- 0.03 SE.
- **Purchases now settle on the run-end screen**, in the People pane under
  "Bought from the host, in secret". Before this, only an executed traitor's
  reveal named them, so 88% of buy-runs never explained the twist. That pane
  already names the mastermind and everyone aligned, so nothing new leaks.
- **Run-scoped ledgers for MORNING, NIGHT and AFTERMATH.** DAILY already had one;
  MORNING and NIGHT only had a within-day list that died when the day's function
  returned, and AFTERMATH had none. Proven flavour-only: none of those three
  tables carries an `eff`, `pick` spends one draw whatever the pool size, and
  across 60 seeds ending kind, death list with killers, chapter count, day count,
  mastermind and blackened were identical, prose differed in 56.
- **Twelve DAILY entries and six MORNING entries.** DAILY 31.5% to 14.5%, MORNING
  39.8% to 1.1%.
- **Ten TOPIC_GENERIC lines.** The `no line is spoken twice` standard was passing
  with a margin of exactly zero: the bank held 24 and the worst run of 90 used 24.
  Any stream shift broke it, and one did. Now 34 against a worst run of 26.
- **Per-pool repetition ceilings in the text harness**, with pool bodies matched
  by variable name rather than line number. Ceilings: DAILY 20%, MORNING 8%,
  NIGHT 15%, AFTERMATH 12%.
- **The solo-plan summary line now branches.** `planned it alone, which is why the
  parts of it that needed two people are the parts that failed` was firing over
  cases that also reported an arranged alibi (15.1% of solo cases) or a timed
  interruption (28.1%). Solo cases with arranged help now read `planned it alone,
  and nobody was told the whole of it. What the plan needed from other people, it
  took without asking.` Verified over 477 solo cases: 297 old clause, 180 new,
  zero contradictions in either direction.

## WHAT IS LEFT

1. **Read the new prose by hand.** Eighteen daily-life events, ten trial-topic
   lines and two summary sentences were added this session and no human has read
   them in context. Harnesses caught a venue leak (a line naming the dining hall
   failed `a ship never mentions a school room`) but they cannot catch "odd".
2. **Traitor purchasing spends no RNG, now proven, with one caveat.** Against a
   build with the hook disabled, all 44 no-purchase runs of 80 had an identical
   RNG position at run end. In purchase runs the streams diverge, which is the
   intended behaviour: spending favour is allowed to move outcomes, earning it is
   not. What remains unproven is the tighter claim that the purchase decision
   itself spends nothing in a run where a purchase happens; the code takes no
   draw, but the effects make it unmeasurable from outside.
3. **The smoke harness has an unseeded section.** The assertion count moves
   between 118 and 121 across runs of an unmodified file. The varying assertion is
   `anyone who walked out is not styled as dead`, which loops over `.pers.out`
   nodes. The game is not at fault: a fresh page, preset loaded, seed
   `preset-run`, produces a byte-identical feed across three loads (md5
   03580a424c). The harness accumulates feed content from earlier sections, some
   of which run unseeded random casts via `rand(8)`, so that node set varies. Fix
   is a decision about harness scope, not a bug in the game.

## HOUSE RULES

- No em dashes or en dashes anywhere in generated text or UI.
- Every generated sentence must be built from a fact the engine holds. Text
  written to *sound* informed will eventually contradict the case it describes.
- An event's effects must follow what its line actually depicts. Nothing raises
  dread unless the line contains the thing to be afraid of; nothing raises
  `S.truth` unless somebody learns something real about the building. `S.truth`
  is not flavour: it is read in `finale` and feeds whether the survivors unmask
  the mastermind.
- Vagueness is only allowed where it is a deliberate mystery that must hold until
  its reveal (memory loss, unidentified items, the killer's own account). Name
  the room, the hour, the weapon and the person everywhere else.
- Event lines must not name venue-specific rooms. Use `{P}`. `{Q}` exists in the
  DAILY fmt call but can collide with `{P}`, so do not write lines that require
  them to differ.

## HOW I WORK

Verify before claiming; never say something is tested unless it was. Report
standard errors on measured claims. Audit before changing code, propose the
minimal edit, and tell me what you verified and what you did not. Read a real
sample of generated output by hand — harnesses catch mechanics, only a person
catches "odd". I am the author on creative forks: give me 2 to 4 options with
tradeoffs and a marked recommendation rather than deciding for me. If you edit a
harness, say so explicitly rather than letting a failure quietly disappear.

## LESSONS

- **Measure before you tune.** The previous session adjusted a rate three times to
  fix a balance failure and the number did not move, because the cause was
  guessed. This session, the note "daily-life repetition needs more written
  events" was right for DAILY and wrong for three other pools, where the pools
  were larger than the number of draws and the real fault was a missing ledger.
  One measurement per pool separated them.
- **Design a metric that can see the defect.** Counting string identity reports
  near-zero repetition while templates repeat a third of the time, because the
  names differ every time. Match rendered lines back to their template.
- **Presentation must not consume RNG.** Spending a draw to pick an attribution
  beat shifted the whole simulation stream. Hash instead. Spending favour is
  allowed to move outcomes; earning it is not.
- **Trust the file, not your memory.** Twice now, work recorded as missing was
  already in the file. Read before adding, and assume unfamiliar code is yours.
- **A standard passing is not a standard with margin.** The no-repeats rule held
  at exactly 24 of 24 available lines. Check headroom, not just green.

## PROBES

Read-only, none of them touch the build. `probe.dailyrep.mjs <file>` reports
per-pool template repetition. `probe.traitorbuy.mjs` measures purchase rates and
invariants. `probe.alone.mjs` and `probe.alone2.mjs` measure the summary
collision before and after. `probe.neutral.mjs <fileA> <fileB>` compares two
builds across 60 seeds for outcome and prose differences, which is how the ledger
change was proven flavour-only. `probe.rng.mjs <fileA> <fileB>` splits that
comparison by whether a traitor purchase happened. `probe.dupe2.mjs <file> <N>`
counts runs containing a repeated spoken line. `probe.topics2.mjs <file> <N>`
reports how close the trial topic bank comes to exhaustion. `probe.seed.mjs`
checks that the UI reproduces a seeded run across page loads.

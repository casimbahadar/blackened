# BLACKENED

A killing game simulator in a single HTML file. Load a cast of students, lock them in a building with a host who wants a murder, and watch the chapters play out: daily life, a body, an investigation, a class trial, a vote, an execution. Inspired by Danganronpa. All prose is original.

It runs offline in any modern browser. There is no build step, no dependency, and no network call. Open `blackened.html` and it works.

## Playing

Pick a cast, set the rules, and press **Begin the killing game**. There are two ways to run it.

**Watch it unfold** simulates the whole game up front and reveals it chapter by chapter. **Make the calls** streams the game and stops at decision points for you to answer.

Every run is driven by a seed. The same cast, settings and seed produce the same game every time, so a run you liked can be replayed or shared. **Roll seed** picks a new one, and **Run it again** replays with a fresh seed.

When a run ends, the results card shows who survived, who the mastermind was and who was working for them, how much favour each student earned with the host, and anything a traitor secretly bought. **Download as a document** saves the full record. **Survival odds** runs the current cast 100 times and tables how often each student survives, is blackened, is executed, or turns out to be the mastermind.

## Settings

You can set the number of survivors that ends the game (1 to 60, default 3) and the number of chapters (1 to 110, default 8), or let the chapter count scale to the cast size automatically. There are also controls for the venue, the host, and the trial and pressure settings.

Toggles cover the hidden mastermind, double murders, accomplices, quiet days, where nobody dies because nobody wants to kill badly enough yet (a chapter still forces a murder by its fourth day), and an optional trait budget that stops a student being built with everything.

Four hosts are available, and each judges the class differently: PALLOR punishes the dullest student, VESTRY the best-loved, TALLY the sharpest, and BENEFICE the most comfortable.

## What is in it

11 preset rosters with 170 characters, which you can edit freely or replace by pasting a list of names. Students have 5 stats and draw from a pool of 16 traits. There are 46 weapons across 12 methods of killing, 20 motives, 18 venues, 22 items, 12 group events and 7 distractions.

A hidden mastermind runs the game from inside the class with up to two moles. Students earn private favour with the host by entertaining it, and favour buys perks, 14 of them across survival, knowledge and social. The host also hands out penalties. Traitors spend their own favour without telling anyone. Each body gets a House File that declassifies as evidence comes in, and each solved case closes with a summary of the plan, the night, and what gave the killer away.

Some chapters go wrong on purpose. Two killers can strike in the same chapter. The mastermind can commit a murder the class cannot convict, which suspends the case until the final showdown.

## How it is built

The file holds two scripts. The first is a pure engine exposed as `KG`, with no access to the page, marked out between `/* CORE-START */` and `/* CORE-END */` so the test harnesses can extract and run it in Node. The second is the interface.

The engine is deterministic: a mulberry32 generator seeded by an FNV-1a hash of the seed string. It runs as a resumable generator. `KG.begin(cast, settings)` returns a game object, `KG.step(game, answer)` advances it, `game.pending` holds the current prompt and `game.done` marks the end. `KG.simulate(cast, settings)` runs a whole game with automatic answers and returns the output.

Presentation never consumes the random stream. Anything cosmetic, like which attribution beat a line of dialogue gets, is chosen by hashing instead, so wording changes cannot change who dies.

## Tests

Three harnesses live beside the game. They need Node and jsdom.

```
npm install jsdom
node blackened.text.mjs    # text quality, under a minute
node blackened.smoke.mjs   # the interface in jsdom, under a minute
node blackened.tests.mjs   # the engine, about 6.5 minutes
```

The engine suite makes about 81,000 assertions across every roster, covering the rules, balance, traitor behaviour, venue consistency and case coherence. The text suite checks generated prose for lines repeated within a run and how often each daily-life pool repeats. The smoke suite drives the real interface through setup, a full run, the results card and the odds table, and checks that no placeholder is left unfilled.

Run the smoke and text suites on their own rather than alongside the engine suite. Under contention the smoke suite can look like it crashed when it has not.

## Writing rules

Anyone adding text to the game should follow these.

No em dashes or en dashes in generated text or the interface.

Every generated sentence must be built from a fact the engine holds. A line written to sound informed will eventually contradict the case it describes.

An event's effects must follow from what its line shows. A line only raises dread if it contains something to be afraid of, and only raises the class's grasp of the truth if somebody learns something real about the building. That value is not decoration: it decides whether the survivors can unmask the mastermind at the end.

Name the room, the hour, the weapon and the person. Vagueness is allowed only where it protects a mystery until its reveal.

Event lines must not name rooms that belong to one venue. Use the `{P}` placeholder, which the engine fills with a room from the current venue.

## Status

Unofficial fan project, not affiliated with the Danganronpa series or its publisher.

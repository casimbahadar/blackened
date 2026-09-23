// Harness for BLACKENED. Extracts the CORE block from the shipped HTML and runs it for real.
// Usage: node blackened.tests.mjs [path-to-html]
import fs from 'node:fs';

const file = process.argv[2] || new URL('./blackened.html', import.meta.url).pathname;
const html = fs.readFileSync(file, 'utf8');
const m = html.match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//);
if (!m) { console.error('FAIL: no CORE block found'); process.exit(1); }
const core = m[1];
const KG = new Function(core + '\n;return KG;')();   // real execution, not just a syntax check

let pass = 0, fail = 0;
const problems = [];
function ok(cond, label, extra) {
  if (cond) { pass++; } else { fail++; problems.push(label + (extra ? ' :: ' + extra : '')); }
}

// ---------- helpers ----------
function textLines(run) {
  const out = [];
  for (const ch of run.chapters) for (const p of ch.phases) for (const l of p.lines) {
    if (typeof l.t === 'string') out.push(l.t);
    if (l.k === 'file') out.push(Object.values(l.file).filter(v => typeof v === 'string').join(' '));
  }
  if (run.ending && run.ending.line) out.push(run.ending.line);
  return out;
}
function settings(rng, over = {}) {
  return Object.assign(KG.defaults(), over);
}

// ---------- 1. bulk invariant sweep ----------
const RUNS = 1500;
let endings = {}, totalDeaths = 0, totalChapters = 0, escapes = 0;
for (let i = 0; i < RUNS; i++) {
  const seedA = 'sweep-' + i;
  const size = 4 + (i % 25);
  const cast = KG.makeCast(size, 'cast-' + i, 'Ultimate');
  const set = settings(null, {
    seed: seedA,
    survivors: 1 + (i % 4),
    maxChapters: 1 + (i % 8),
    pressure: [0.7, 1, 1.4][i % 3],
    trial: [0.75, 1, 1.35, 99][i % 4],
    mastermind: i % 3 !== 0,
    doubles: i % 2 === 0,
    accomplices: i % 5 !== 0,
    quiet: i % 7 !== 0
  });
  let run;
  try { run = KG.simulate(cast, set); }
  catch (e) { ok(false, 'run #' + i + ' threw', e && e.message); continue; }

  ok(!!run.ending && typeof run.ending.kind === 'string', 'run #' + i + ' has an ending');
  ok(['hope', 'despair', 'graduation', 'extinction', 'showdown'].includes(run.ending.kind), 'run #' + i + ' ending kind known', run.ending.kind);
  ok(run.chapters.length <= set.maxChapters, 'run #' + i + ' respects chapter cap', run.chapters.length + '>' + set.maxChapters);

  // accounting: everyone is either alive or recorded dead exactly once
  const dead = run.cast.filter(c => !c.alive);
  const ids = run.final.deaths.map(d => d.id);
  ok(new Set(ids).size === ids.length, 'run #' + i + ' nobody dies twice');
  ok(dead.length === ids.length, 'run #' + i + ' death ledger matches corpse count', dead.length + ' vs ' + ids.length);
  ok(run.final.survivors.length + ids.length === cast.length, 'run #' + i + ' alive+dead == cast size');

  // deaths happen in real chapters
  for (const d of run.final.deaths) {
    ok(d.chapter >= 1 && d.chapter <= Math.max(1, run.chapters.length), 'run #' + i + ' death chapter in range', JSON.stringify(d));
  }

  // no unresolved template placeholders, no empty lines, no "undefined"
  for (const t of textLines(run)) {
    if (/\{[A-Za-z]/.test(t)) { ok(false, 'run #' + i + ' unresolved placeholder', t); break; }
    if (/undefined|NaN|\[object/.test(t)) { ok(false, 'run #' + i + ' junk in text', t); break; }
    if (!t.trim().length) { ok(false, 'run #' + i + ' empty line'); break; }
  }

  // every case must generate a real evidence deck and a real debate
  for (const ch of run.chapters) {
    const names = ch.phases.map(p => p.name);
    if (names.includes('Investigation')) {
      const inv = ch.phases.find(p => p.name === 'Investigation');
      const bullets = inv.lines.filter(l => l.k === 'bullet');
      const file = ch.phases.some(p => p.lines.some(l => l.k === 'file'));
      ok(file, 'run #' + i + ' murder chapter produces a House File');
      const blank = inv.lines.some(l => l.k === 'quiet' && /Nothing anyone can put a name to/.test(l.t || ''));
      ok(bullets.length >= 1 || blank, 'run #' + i + ' investigation reports leads or says it found none', String(bullets.length));
      ok(bullets.every(b => b.name && b.t), 'run #' + i + ' every truth bullet has a title and body');
    }
    if (names.includes('Class Trial')) {
      const tr = ch.phases.find(p => p.name === 'Class Trial');
      const speech = tr.lines.filter(l => l.k === 'speech');
      const rounds = tr.lines.filter(l => l.k === 'round');
      if (tr.lines.some(l => l.k === 'tally')) {
        ok(speech.length >= (cast.length >= 10 ? 12 : 6), 'run #' + i + ' trial is spoken, not summarised', String(speech.length));
        ok(rounds.length >= 3, 'run #' + i + ' trial has debate rounds', String(rounds.length));
        ok(speech.every(l => l.who && l.t), 'run #' + i + ' every line of dialogue has a speaker');
      }
    }
  }

  // anyone who walked out is recorded as escaped, never as a corpse
  for (const d of run.final.deaths) {
    const c = run.cast[d.id];
    ok(d.escaped === !!c.escaped, 'run #' + i + ' escape flag matches the cast record');
    if (d.escaped) ok(!/executed|killed|punishment/.test(d.cause), 'run #' + i + ' escapee cause reads as an exit', d.cause);
  }

  // vote tallies must sum to the number of voters
  for (const ch of run.chapters) for (const p of ch.phases) for (const l of p.lines) {
    if (l.k === 'tally') {
      const sum = l.rows.reduce((a, r) => a + r.v, 0);
      ok(sum === l.total, 'run #' + i + ' vote tally sums to voters', sum + '/' + l.total);
      ok(l.rows.every(r => r.v > 0), 'run #' + i + ' tally rows are non-zero');
    }
  }

  // survivor target is respected when the game ends peacefully
  if (run.ending.kind === 'hope' && run.chapters.length < set.maxChapters) {
    ok(run.final.survivors.length <= set.survivors + 2, 'run #' + i + ' hope ending near survivor target',
      run.final.survivors.length + ' vs ' + set.survivors);
  }
  if (run.ending.kind === 'graduation' || run.ending.kind === 'extinction') {
    ok(run.final.survivors.length === 0, 'run #' + i + ' ' + run.ending.kind + ' leaves nobody alive');
  }

  endings[run.ending.kind] = (endings[run.ending.kind] || 0) + 1;
  totalDeaths += ids.length; totalChapters += run.chapters.length;
  escapes += run.final.deaths.filter(d => d.escaped).length;
}

// ---------- 1b. preset rosters ----------
{
  ok(KG.PRESETS.length >= 9, 'nine or more rosters ship with the file', String(KG.PRESETS.length));
  let total = 0;
  for (const p of KG.PRESETS) {
    total += p.rows.length;
    ok(p.rows.length >= 10, p.name + ' has a full roster', String(p.rows.length));
    const names = new Set();
    for (const r of p.rows) {
      ok(typeof r[0] === 'string' && r[0].length > 1, p.name + ' row has a name');
      ok(typeof r[1] === 'string' && r[1].length > 1, p.name + ': ' + r[0] + ' has a talent');
      ok(['they', 'she', 'he'].includes(r[2]), p.name + ': ' + r[0] + ' has valid pronouns');
      for (let k = 3; k <= 7; k++) ok(r[k] >= 1 && r[k] <= 10, p.name + ': ' + r[0] + ' stat in range');
      for (const t of (r[8] || [])) ok(!!KG.TRAITS[t], p.name + ': ' + r[0] + ' trait exists — ' + t);
      ok(!names.has(r[0]), p.name + ' has no duplicate names — ' + r[0]);
      names.add(r[0]);
    }
    const cast = KG.preset(p.key);
    ok(cast.length === p.rows.length, p.name + ' loads');
    const run = KG.simulate(cast, settings(null, { seed: 'preset-' + p.key, survivors: 2, maxChapters: 6 }));
    ok(!!run.ending, p.name + ' plays through');
  }
  console.log('rosters: ' + KG.PRESETS.length + ', characters: ' + total);
  const mixed = KG.mixedCast(16, 'mix');
  ok(mixed.length === 16, 'all-star mix builds a 16-person cast');
  ok(new Set(mixed.map(c => c.name)).size === 16, 'all-star mix has no duplicates');
}

// ---------- 1c. a full class produces a full case ----------
{
  let decks = 0, cases = 0, thin = 0;
  for (let i = 0; i < 120; i++) {
    const run = KG.simulate(KG.preset('thh'), settings(null, { seed: 'deck' + i, survivors: 2, maxChapters: 6 }));
    for (const ch of run.chapters) {
      const inv = ch.phases.find(p => p.name === 'Investigation');
      if (!inv) continue;
      const bullets = inv.lines.filter(l => l.k === 'bullet').length;
      cases++; decks += bullets;
      if (bullets < 10) thin++;
    }
  }
  ok(cases > 100, 'the deck sample ran enough cases', String(cases));
  ok(decks / cases >= 14, 'a full class averages 14+ truth bullets per case', (decks / cases).toFixed(1));
  ok(thin / cases < 0.1, 'fewer than one case in ten falls under ten bullets', (thin / cases * 100).toFixed(1) + '%');
  console.log('evidence: ' + (decks / cases).toFixed(1) + ' truth bullets per case on a 16-student class');
}

// ---------- 1d. big casts, scaled chapters, method variety ----------
{
  // chapter count must scale so a large class actually reaches its survivor target
  for (const size of [16, 32, 48, 64, 96]) {
    const cast = size <= 154 ? KG.mixedCast(Math.min(size, 154), 'big' + size) : KG.makeCast(size, 'big' + size, 'Ultimate');
    const pad = size > 154 ? KG.makeCast(size - 154, 'pad' + size, 'Ultimate') : [];
    const full = cast.concat(pad).map((c, i) => Object.assign({}, c, { id: i }));
    ok(full.length === Math.min(size, 154), 'cast of ' + size + ' assembles', String(full.length));
    const suggested = KG.suggestChapters(full.length, 3);
    ok(suggested >= full.length / 3, 'suggested chapters scale with cast size', size + '->' + suggested);
    const t0 = Date.now();
    const run = KG.simulate(full, settings(null, { seed: 'big' + size, survivors: 3, maxChapters: 'auto' }));
    const ms = Date.now() - t0;
    ok(ms < 3000, 'cast of ' + size + ' simulates fast enough', ms + 'ms');
    ok(run.chapters.length <= suggested, 'cast of ' + size + ' respects the auto cap');
    ok(run.final.survivors.length + run.final.deaths.length === full.length, 'cast of ' + size + ' balances its ledger');
    if (run.ending.kind === 'hope' || run.ending.kind === 'despair') {
      ok(run.final.survivors.length <= Math.max(6, full.length * 0.12), 'a completed big run narrows the field',
        size + ' -> ' + run.final.survivors.length + ' survivors');
    }
  }
  // long games must stay survivable often enough to be worth running
  /* the true rate is about 29%; at N=150 the estimate has a 4-point standard error
     and straddles the 35% threshold, so this needs a bigger sample, not a looser bar */
  let wipes = 0, N = 400;
  for (let i = 0; i < N; i++) {
    const run = KG.simulate(KG.makeCast(48, 'lg' + i, 'Ultimate'), settings(null, { seed: 'lg' + i, survivors: 3, maxChapters: 'auto' }));
    if (run.ending.kind === 'graduation') wipes++;
  }
  ok(wipes / N < 0.35, 'most long games reach a survivor ending', (wipes / N * 100).toFixed(0) + '% wiped');
  // the real failure mode is running out of chapters with a room still full of people
  let ranOut = 0, endedEarly = {}, N2 = 40;
  const cap = KG.suggestChapters(48, 3);
  for (let i = 0; i < N2; i++) {
    const run = KG.simulate(KG.makeCast(48, 'tg' + i, 'Ultimate'), settings(null, { seed: 'tg' + i, survivors: 3, maxChapters: 'auto' }));
    endedEarly[run.ending.kind] = (endedEarly[run.ending.kind] || 0) + 1;
    if (run.chapters.length >= cap && run.final.survivors.length > 5) ranOut++;
  }
  ok(ranOut / N2 < 0.15, 'a 48-student class rarely runs out of chapters with the room still full',
    ranOut + '/' + N2 + ' ' + JSON.stringify(endedEarly));
  console.log('48-student endings: ' + JSON.stringify(endedEarly) + ' (cap ' + cap + ' chapters)');
  console.log('big casts: 48 students -> ' + KG.suggestChapters(48, 3) + ' chapters, ' + (wipes / N * 100).toFixed(0) + '% end in a wrong verdict');

  // content has to grow with the class, not stay flat
  function chapterSize(n, tag) {
    const run = KG.simulate(KG.makeCast(n, tag + n, 'Ultimate'), settings(null, { seed: tag + n, survivors: 3, maxChapters: 'auto' }));
    const ch = run.chapters[0];
    const ft = ch.phases.find(p => p.name === 'Free Time');
    const tr = run.chapters.map(c => c.phases.find(p => p.name === 'Class Trial')).filter(p => p && p.lines.some(l => l.k === 'tally'))[0];
    return { free: ft ? ft.lines.length : 0, rounds: tr ? tr.lines.filter(l => l.k === 'round').length : 0 };
  }
  const small = chapterSize(10, 'sz'), large = chapterSize(48, 'sz');
  ok(large.free > small.free, 'free time grows with the class', small.free + ' -> ' + large.free);
  ok(large.rounds > small.rounds, 'the debate runs longer with more people in the room', small.rounds + ' -> ' + large.rounds);
  console.log('scaling: free-time beats ' + small.free + ' -> ' + large.free + ', debate rounds ' + small.rounds + ' -> ' + large.rounds);

  // method variety
  ok(KG.WEAPONS.length >= 40, 'at least forty killing methods ship', String(KG.WEAPONS.length));
  ok(new Set(KG.WEAPONS.map(w => w.cause)).size >= 25, 'causes of death are varied',
    String(new Set(KG.WEAPONS.map(w => w.cause)).size));
  ok(new Set(KG.WEAPONS.map(w => w.tag)).size >= 10, 'methods span many categories',
    String(new Set(KG.WEAPONS.map(w => w.tag)).size));
  const seenCause = new Set(), seenMark = new Set();
  for (let i = 0; i < 250; i++) {
    const run = KG.simulate(KG.makeCast(16, 'var' + i, 'Ultimate'), settings(null, { seed: 'var' + i, survivors: 2, maxChapters: 'auto' }));
    for (const ch of run.chapters) for (const p of ch.phases) for (const l of p.lines) {
      if (l.k === 'file') { seenCause.add(l.file.cause); seenMark.add(l.file.marks); }
    }
  }
  ok(seenCause.size >= 25, 'play actually surfaces the variety', seenCause.size + ' distinct causes seen');
  console.log('variety: ' + KG.WEAPONS.length + ' methods, ' + seenCause.size + ' distinct causes of death seen across 250 runs');
}

// ---------- 1e. prologue, epilogue, items, venues, split files ----------
{
  ok(KG.VENUES.length >= 8, 'several venues ship', String(KG.VENUES.length));
  ok(KG.MOTIVES.length >= 20, 'twenty or more motives ship', String(KG.MOTIVES.length));
  ok(KG.ITEMS.length >= 20, 'twenty or more findable items ship', String(KG.ITEMS.length));
  const venues = new Set(), motives = new Set();
  let filesSplit = 0, doubleCases = 0, itemLines = 0, badFile = 0;
  for (let i = 0; i < 200; i++) {
    const run = KG.simulate(KG.preset('thh'), settings(null, { seed: 'pv' + i, survivors: 2, maxChapters: 'auto' }));
    venues.add(run.venue);
    // prologue exists, once, in chapter one only
    const pro = run.chapters.filter(c => c.phases.some(p => p.name === 'Prologue'));
    ok(pro.length === 1 && pro[0].n === 1, 'exactly one prologue, in chapter one', String(pro.length));
    const proPhase = pro[0].phases.find(p => p.name === 'Prologue');
    ok(proPhase.lines.length >= 5, 'the prologue actually sets the scene', String(proPhase.lines.length));
    ok(proPhase.lines.some(l => l.k === 'speech'), 'the class speaks in the prologue');
    ok(proPhase.lines.some(l => (l.t || '').includes(run.venue)), 'the prologue names the venue');
    // epilogue exists and explains
    ok(Array.isArray(run.epilogue) && run.epilogue.length >= 4, 'every run ends with an epilogue', String(run.epilogue && run.epilogue.length));
    ok(run.epilogue.some(l => /Behind it:/.test(l)), 'the epilogue explains who was behind it');
    ok(run.epilogue.some(l => /Outside/.test(l)), 'the epilogue says what the outside world looks like');
    ok(run.epilogue.every(l => !/\{[A-Za-z]/.test(l)), 'no unresolved placeholders in the epilogue');
    // every body gets its own file
    for (const ch of run.chapters) {
      for (const p of ch.phases) {
        const files = p.lines.filter(l => l.k === 'file');
        const deaths = p.lines.filter(l => l.k === 'death');
        if (!files.length) continue;
        if (files.length > 1) {
          filesSplit++;
          const names = files.map(f => f.file.victim);
          ok(new Set(names).size === names.length, 'split files name different victims', names.join('/'));
          ok(files.every(f => f.file.label), 'split files are labelled');
          ok(files[0].file.place !== undefined && files[1].file.cause !== undefined, 'the second file is complete');
        }
        files.forEach(f => {
          if (!f.file.victim || !f.file.cause || !f.file.tod || !f.file.place) badFile++;
        });
      }
      const ft = ch.phases.find(p => p.name === 'Free Time');
      if (ft) itemLines += ft.lines.filter(l => l.k === 'item').length;
    }
    for (const ch of run.chapters) for (const p of ch.phases) if (p.name === 'Motive')
      p.lines.filter(l => l.k === 'sys').forEach(l => motives.add((l.t || '').slice(0, 24)));
    if (run.final.deaths.filter(d => !d.escaped).length > 1) doubleCases++;
  }
  ok(badFile === 0, 'no House File is missing a field', String(badFile));
  ok(filesSplit > 0, 'double murders do produce two House Files', String(filesSplit));
  ok(venues.size >= 6, 'venues vary between runs', String(venues.size));
  ok(motives.size >= 15, 'motives vary between runs', String(motives.size));
  ok(itemLines > 200, 'people find things during free time', String(itemLines));
  console.log('world: ' + venues.size + ' venues seen, ' + motives.size + ' motives seen, ' + filesSplit + ' split case files, ' + itemLines + ' item finds');

  // a specific venue can be requested and its rooms are the ones used
  const liner = KG.simulate(KG.preset('v3'), settings(null, { seed: 'liner', survivors: 2, maxChapters: 'auto', venue: 'liner' }));
  ok(/liner/.test(liner.venue), 'a chosen venue is honoured', liner.venue);
  const text = liner.chapters.flatMap(c => c.phases.flatMap(p => p.lines.map(l => l.t || ''))).join(' ');
  ok(!/the greenhouse|the gymnasium|the dining hall|the infirmary/.test(text), 'a ship never mentions a school room');
  // and the phase-level line variety holds up
  let dupe = 0, spoken = 0;
  for (let i = 0; i < 60; i++) {
    const r = KG.simulate(KG.preset('thh'), settings(null, { seed: 'dupe' + i, survivors: 2, maxChapters: 'auto' }));
    for (const ch of r.chapters) for (const p of ch.phases) {
      const sp = p.lines.filter(l => l.k === 'speech').map(l => l.t);
      spoken += sp.length; dupe += sp.length - new Set(sp).size;
    }
  }
  ok(dupe / spoken < 0.06, 'the same line is rarely spoken twice in one phase', (dupe / spoken * 100).toFixed(1) + '%');
  console.log('dialogue: ' + (dupe / spoken * 100).toFixed(1) + '% repeated lines within a phase');
}

// ---------- 1f. this round's features ----------
{
  ok(KG.VENUES.length >= 18, 'eighteen or more venues ship', String(KG.VENUES.length));
  const emilia = KG.preset('lockdown').some(c => c.name === 'Emilia Carmine');
  ok(emilia, 'Emilia Carmine is a playable participant');

  let redactedFiles = 0, updates = 0, declassified = 0, sameRoomDoubles = 0, doubles = 0,
      interludes = 0, groupEvents = 0, distractions = 0, unlocks = 0, speech = 0, phases = 0,
      leadNamed = 0, torchPassed = 0;
  const N = 150;
  for (let i = 0; i < N; i++) {
    const run = KG.simulate(KG.preset('thh'), settings(null, { seed: 'feat' + i, survivors: 2, maxChapters: 'auto' }));
    ok(run.lead != null, 'every run has a protagonist');
    ok(run.rival !== run.lead && run.ally !== run.lead, 'rival and ally are other people');
    const pro = run.chapters[0].phases.find(p => p.name === 'Prologue');
    if (pro.lines.some(l => (l.t || '').includes(run.cast[run.lead].name))) leadNamed++;
    if (run.final.leadHistory.length) torchPassed++;
    // a dead protagonist must have handed over
    const leadChar = run.cast[run.lead];
    if (!leadChar.alive && !['graduation', 'extinction'].includes(run.ending.kind)) {
      ok(run.final.leadHistory.length > 0, 'a protagonist who dies or walks out leaves the story',
        leadChar.name + ' / ' + run.ending.kind);
      ok(run.final.lead === null || run.cast[run.final.lead].alive,
        'whoever the story follows at the end is still in the building');
    }
    for (const ch of run.chapters) for (const p of ch.phases) {
      phases++;
      speech += p.lines.filter(l => l.k === 'speech').length;
      if (p.name === 'Interlude') {
        interludes++;
        ok(p.lines.filter(l => l.k === 'speech').length === 2, 'an interlude is a two-hander');
      }
      groupEvents += p.lines.filter(l => l.k === 'group').length;
      for (const l of p.lines) {
        if (l.k === 'file') {
          if ((l.hiddenAt || []).length) redactedFiles++;
          ok(Array.isArray(l.hiddenAt), 'files record what was blacked out at issue');
          ok(l.hiddenAt.length <= 3, 'the host never blacks out more than three fields', String(l.hiddenAt.length));
        }
        if (l.k === 'fileupdate') {
          updates++;
          if (l.declassified) declassified++;
          ok(l.fields.length > 0 && l.fields.every(f => f.value), 'every amendment carries a real value');
        }
        if (l.k === 'sys' && /unlocks/.test(l.t || '')) unlocks++;
      }
      const files = p.lines.filter(l => l.k === 'file');
      if (files.length > 1) {
        doubles++;
        if (files[0].file.place === files[1].file.place) sameRoomDoubles++;
      }
      if (p.lines.some(l => (l.t || '').match(/lights in the building go out|smoke starts coming|fire alarm goes off|water main lets go|fire doors close|feeding back|most of the class is in one room/))) distractions++;
    }
  }
  ok(redactedFiles > N, 'files routinely arrive with sections blacked out', String(redactedFiles));
  ok(updates > N, 'the file gets amended as evidence lands', String(updates));
  ok(declassified > 0, 'anything still hidden is published after the verdict', String(declassified));
  ok(doubles > 0 && sameRoomDoubles > 0, 'double murders sometimes share one room', sameRoomDoubles + '/' + doubles);
  ok(interludes > 0, 'the mastermind gets private scenes with their people', String(interludes));
  ok(groupEvents > N, 'the class acts as a body between murders', String(groupEvents));
  ok(distractions > 0, 'something else happens during some murder windows', String(distractions));
  ok(unlocks > 0, 'new rooms open as the game goes on', String(unlocks));
  ok(speech / phases > 1.2, 'people talk in most phases', (speech / phases).toFixed(2) + ' lines per phase');
  ok(leadNamed === N, 'the prologue always names the protagonist');
  console.log('this round: ' + (speech / N).toFixed(0) + ' spoken lines per run, ' + (redactedFiles / N).toFixed(1) +
    ' redacted files per run, ' + (updates / N).toFixed(1) + ' amendments, ' + (interludes / N).toFixed(2) +
    ' interludes, ' + (torchPassed / N * 100).toFixed(0) + '% of runs change protagonist');
}

// ---------- 1g. interactive mode ----------
{
  const cast = KG.preset('thh');
  const set = settings(null, { seed: 'inter', survivors: 3, maxChapters: 'auto' });

  // stepping with auto answers must equal simulate() exactly
  const auto = KG.simulate(cast, set);
  const G = KG.begin(cast, set);
  let ans, guard = 0;
  while (!G.done && guard++ < 4000) {
    KG.step(G, ans);
    ans = G.pending ? KG.autoAnswer(G.S, G.pending) : undefined;
  }
  ok(JSON.stringify(G.out.chapters) === JSON.stringify(auto.chapters),
    'stepping with the same answers reproduces the one-shot run');

  // every prompt is well formed and the choice is honoured
  const seen = {};
  let prompts = 0, chapters = 0;
  const G2 = KG.begin(cast, settings(null, { seed: 'inter2', survivors: 3, maxChapters: 'auto' }));
  let a2, g2 = 0;
  while (!G2.done && g2++ < 4000) {
    KG.step(G2, a2);
    if (G2.pending) {
      prompts++;
      const c = G2.pending;
      ok(typeof c.id === 'string', 'a prompt has an id');
      ok(typeof c.prompt === 'string' && c.prompt.length > 4, 'a prompt has readable text', c.prompt);
      ok(c.options.length >= 2 && c.options.every(o => o.key && o.label), 'a prompt has real options');
      ok(!/\{[A-Za-z]/.test(c.prompt), 'no unresolved placeholders in a prompt', c.prompt);
      seen[c.id] = (seen[c.id] || 0) + 1;
      a2 = c.options[0].key;
    } else a2 = undefined;
  }
  ok(prompts >= 6, 'a full game asks a fair number of times', String(prompts));
  ok(seen.focus > 0 && seen.approach > 0, 'the case decisions always come up', JSON.stringify(seen));
  const dailyKinds = ['proposal', 'freetime', 'night', 'aftermath', 'item', 'personal'].filter(k => seen[k]);
  ok(dailyKinds.length >= 2, 'daily life asks things too', JSON.stringify(seen));

  // the per-chapter budget is respected and rotates through the kinds
  function perChapter(dq, seed) {
    const g = KG.begin(cast, settings(null, { seed: seed, survivors: 2, maxChapters: 'auto', ask: 'all', dailyQuestions: dq }));
    let a, n = 0, byChapter = {}, kinds = {};
    const DAILY = ['proposal', 'freetime', 'night', 'aftermath', 'item', 'personal'];
    while (!g.done && n++ < 4000) {
      KG.step(g, a);
      if (g.pending) {
        const ch = g.out.days.length;
        if (DAILY.includes(g.pending.id)) { byChapter[ch] = (byChapter[ch] || 0) + 1; kinds[g.pending.id] = 1; }
        a = KG.autoAnswer(g.S, g.pending);
      } else a = undefined;
    }
    return { max: Math.max(0, ...Object.values(byChapter)), kinds: Object.keys(kinds).length };
  }
  const budget1 = perChapter(1, 'budget1'), budget6 = perChapter(8, 'budget6');
  ok(budget1.max <= 1, 'one-a-day really means one', String(budget1.max));
  ok(budget6.kinds >= 4, 'at the top setting every kind of daily question shows up', String(budget6.kinds));
  ok(budget6.max > budget1.max, 'the setting changes how much you are asked', budget1.max + ' vs ' + budget6.max);
  // the ask-scope control must actually reduce the prompts
  function countPrompts(ask, seed) {
    const g = KG.begin(cast, settings(null, { seed: seed, survivors: 3, maxChapters: 'auto', ask: ask }));
    let a, n = 0, tally = {};
    while (!g.done && n++ < 4000) {
      KG.step(g, a);
      if (g.pending) { tally[g.pending.id] = (tally[g.pending.id] || 0) + 1; a = KG.autoAnswer(g.S, g.pending); }
      else a = undefined;
    }
    return tally;
  }
  const allAsk = countPrompts('all', 'scope'), trialsAsk = countPrompts('trials', 'scope');
  ok(!trialsAsk.night && !trialsAsk.personal, 'trials-only mode never asks about the night');
  ok(trialsAsk.focus > 0 && trialsAsk.approach > 0, 'trials-only mode still asks about the case');
  ok(Object.values(allAsk).reduce((a, b) => a + b, 0) > Object.values(trialsAsk).reduce((a, b) => a + b, 0),
    'asking everything really is more questions');
  ok(!!G2.out.ending && !!G2.out.final, 'an interactive game produces a full result');
  ok(G2.out.final.survivors.length + G2.out.final.deaths.length === cast.length, 'interactive runs balance their ledger');

  // the same answers twice is the same story; different answers is a different story
  function play(pick, seed) {
    const g = KG.begin(cast, settings(null, { seed: seed, survivors: 3, maxChapters: 'auto' }));
    let a, n = 0;
    while (!g.done && n++ < 4000) { KG.step(g, a); a = g.pending ? pick(g.pending) : undefined; }
    return g.out;
  }
  const first = play(c => c.options[0].key, 'repeat');
  const same = play(c => c.options[0].key, 'repeat');
  const other = play(c => c.options[c.options.length - 1].key, 'repeat');
  ok(JSON.stringify(first.chapters) === JSON.stringify(same.chapters), 'same seed and same answers replay identically');
  ok(JSON.stringify(first.chapters) !== JSON.stringify(other.chapters), 'different answers make a different game');

  // each option must do the specific thing it claims to do
  // measure the evidence category directly rather than guessing it from keywords
  function tagShare(pick, seedTag, want, n) {
    let hits = 0, total = 0;
    for (let i = 0; i < n; i++) {
      const r = play(pick, seedTag + i);
      for (const ch of r.chapters) for (const p of ch.phases) if (p.name === 'Investigation') {
        const b = p.lines.filter(l => l.k === 'bullet');
        total += b.length;
        hits += b.filter(l => want.includes(l.tag)).length;
      }
    }
    return total ? hits / total : 0;
  }
  const bodyFocus = tagShare(c => c.id === 'focus' ? 'body' : c.options[0].key, 'fb', ['body', 'weapon'], 60);
  const acctFocus = tagShare(c => c.id === 'focus' ? 'accounts' : c.options[0].key, 'fa', ['body', 'weapon'], 60);
  ok(bodyFocus > acctFocus + 0.05, 'focusing on the body surfaces more body evidence',
    bodyFocus.toFixed(2) + ' vs ' + acctFocus.toFixed(2));
  const acctShare = tagShare(c => c.id === 'focus' ? 'accounts' : c.options[0].key, 'fc', ['alibi'], 60);
  const bodyShare = tagShare(c => c.id === 'focus' ? 'body' : c.options[0].key, 'fd', ['alibi'], 60);
  ok(acctShare > bodyShare + 0.05, 'focusing on accounts surfaces more alibi evidence',
    acctShare.toFixed(2) + ' vs ' + bodyShare.toFixed(2));

  // each approach must visibly reach the trial floor
  function trialText(pick, tag, n) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const r = play(pick, tag + i);
      for (const ch of r.chapters) for (const p of ch.phases) if (p.name === 'Class Trial')
        out += p.lines.map(l => l.t || '').join(' ');
    }
    return out;
  }
  ok(/turns on .* early and stays there/.test(trialText(c => c.id === 'approach' ? 'press' : c.options[0].key, 'ap', 12)),
    'pressing a suspect changes how the room argues');
  ok(/fills the silence/.test(trialText(c => c.id === 'approach' ? 'listen' : c.options[0].key, 'al', 12)),
    'holding back changes how the room argues');
  function investText(pick, tag, n) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const r = play(pick, tag + i);
      for (const ch of r.chapters) for (const p of ch.phases) if (p.name === 'Investigation')
        out += p.lines.map(l => l.t || '').join(' ');
    }
    return out;
  }
  ok(/gone over twice/.test(investText(c => c.id === 'focus' ? 'body' : c.options[0].key, 'ib', 12)),
    'the investigation reports where it was pushed');
  function planText(pick, tag, n) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const r = play(pick, tag + i);
      for (const ch of r.chapters) for (const p of ch.phases) if (p.name === 'The Plan')
        out += p.lines.map(l => l.t || '').join(' ');
    }
    return out;
  }
  ok(/mattresses into one room/.test(planText(c => c.id === 'night' ? 'together' : c.options[0].key, 'pt', 8)),
    'the night plan is carried out as chosen');
  function phaseText(pick, name, tag, n) {
    let out = '';
    for (let i = 0; i < n; i++) {
      const r = play(pick, tag + i);
      for (const ch of r.chapters) for (const p of ch.phases) if (p.name === name)
        out += p.lines.map(l => l.t || '').join(' ');
    }
    return out;
  }
  ok(/party|curfew|pact|rota|service|ration|barricade|split|honestly|sharp thing|room-by-room|meeting/i
    .test(phaseText(c => c.options[0].key, 'The Proposal', 'gp', 6)),
    'the proposal the class picks is what happens');
  ok(/whole afternoon together|moves around the building|searches alone|have it out/i
    .test(phaseText(c => c.options[0].key, 'An Afternoon', 'af', 6)),
    'the afternoon is spent the way it was chosen');
  ok(/say the name out loud|back on the doors|who voted which way/i
    .test(phaseText(c => c.options[0].key, 'Afterwards', 'aw', 8)),
    'what the class does after a trial is what was chosen');
  ok(/on the table in front of everybody|somewhere nobody else goes|Two people notice/i
    .test(phaseText(c => c.id === 'item' ? 'share' : c.options[0].key, 'What To Do With It', 'wi', 12)),
    'a found item goes where it was sent');
  ok(/Doors locked, one to a room/.test(planText(c => c.id === 'night' ? 'alone' : c.options[0].key, 'pa', 8)),
    'locking down is carried out as chosen');

  function convRate(pick, tag, n) {
    let conv = 0, trials = 0;
    for (let i = 0; i < n; i++) {
      const r = play(pick, tag + i);
      for (const ch of r.chapters) for (const p of ch.phases) for (const l of p.lines)
        if (l.k === 'stamp') { trials++; if (!l.wrong) conv++; }
    }
    return trials ? conv / trials : 0;
  }
  const allFirst = convRate(c => c.options[0].key, 'c1', 70);
  const allLast = convRate(c => c.options[c.options.length - 1].key, 'c3', 70);
  console.log('interactive: ' + prompts + ' prompts per game, conviction ' + allFirst.toFixed(3) +
    ' playing one way vs ' + allLast.toFixed(3) + ' the other');

  // seeded bonds and grudges reach the simulation
  const bonded = KG.simulate(cast, settings(null, { seed: 'bonds', survivors: 3, maxChapters: 'auto',
    bonds: [{ a: 0, b: 1, v: -90 }, { a: 2, b: 3, v: 70 }] }));
  const plain = KG.simulate(cast, settings(null, { seed: 'bonds', survivors: 3, maxChapters: 'auto' }));
  ok(bonded.final.rel[0][1] < plain.final.rel[0][1] - 25, 'a seeded grudge is still poisonous at the end',
    bonded.final.rel[0][1] + ' vs ' + plain.final.rel[0][1]);
  ok(JSON.stringify(bonded.chapters) !== JSON.stringify(plain.chapters), 'seeded bonds change the game');
}

// ---------- 1h. targeted agency: do the calls save named people? ----------
{
  const cast = KG.preset('thh');
  function armed(seed, mode) {
    const g = KG.begin(cast, settings(null, { seed, survivors: 3, maxChapters: 'auto', ask: 'all', dailyQuestions: 8 }));
    let a, n = 0; const firstTarget = { stay: null, warn: null };
    while (!g.done && n++ < 4000) {
      KG.step(g, a);
      if (g.pending) {
        const c = g.pending;
        if (c.id === 'stay') {
          if (!firstTarget.stay) firstTarget.stay = c.options[0].label;
          a = mode === 'protect' ? c.options[0].key : 'self';
        } else if (c.id === 'warn') {
          if (!firstTarget.warn) firstTarget.warn = c.options[0].label;
          a = mode === 'warn' ? c.options[0].key : 'none';
        } else a = KG.autoAnswer(g.S, c);
      } else a = undefined;
    }
    return { out: g.out, firstTarget };
  }
  const wasMurdered = (r, name) => {
    const c = r.out.cast.find(x => x.name === name);
    return !!(c && c.dead && /killed by|saw too much/.test(c.dead.cause));
  };
  let protM = 0, ctrlM = 0, pairs = 0, N2 = 500;   /* 260 was too noisy for a 10-point effect */
  for (let i = 0; i < N2; i++) {
    const A = armed('tp' + i, 'protect'), B = armed('tp' + i, 'none');
    const who = A.firstTarget.stay;
    if (!who) continue;
    pairs++;
    if (wasMurdered(A, who)) protM++;
    if (wasMurdered(B, who)) ctrlM++;
  }
  ok(pairs > 400, 'the protection test had enough matched pairs', String(pairs));
  ok(ctrlM / pairs - protM / pairs > 0.06,
    'keeping someone beside you measurably stops them being murdered',
    (protM / pairs * 100).toFixed(1) + '% vs ' + (ctrlM / pairs * 100).toFixed(1) + '%');
  console.log('agency: protected are murdered ' + (protM / pairs * 100).toFixed(1) +
    '% of the time vs ' + (ctrlM / pairs * 100).toFixed(1) + '% unprotected');

  // saves are recorded, and only when something really changed
  let saves = 0, runs = 40, bad = 0;
  for (let i = 0; i < runs; i++) {
    const r = armed('sv' + i, 'protect').out;
    r.final.saves.forEach(sx => {
      saves++;
      if (!sx.who || !sx.kind || !sx.chapter) bad++;
      if (sx.kind === 'kept close' && !sx.instead && !sx.survived) bad++;
    });
  }
  ok(bad === 0, 'every recorded save names a person, a chapter and what changed', String(bad));
  ok(saves / runs > 1, 'a played game produces a real ledger', (saves / runs).toFixed(1) + ' per run');

  // vouching is scored honestly: credibility is exactly the right calls minus the wrong ones
  let checked = 0, exact = 0, spiked = 0;
  for (let i = 0; i < 160; i++) {
    const g = KG.begin(cast, settings(null, { seed: 'vw' + i, survivors: 3, maxChapters: 'auto', ask: 'all', dailyQuestions: 8 }));
    let a, n = 0;
    while (!g.done && n++ < 4000) { KG.step(g, a); a = g.pending ? KG.autoAnswer(g.S, g.pending) : undefined; }
    const sv = g.out.final.saves;
    const wrong = sv.filter(x => x.kind === 'vouched wrong').length;
    const right = sv.filter(x => x.kind === 'vouched right').length;
    if (wrong) {
      checked++;
      if (g.out.final.credibility === right - wrong) exact++;
      if (g.out.final.credibility < right) spiked++;
    }
  }
  ok(checked > 20, 'wrong vouches happen often enough to test', String(checked));
  ok(exact === checked, 'credibility is exactly the right vouches minus the wrong ones', exact + '/' + checked);
  ok(spiked === checked, 'every wrong vouch costs a point that a right one would have earned', spiked + '/' + checked);
}

// ---------- 1j. the metric that was missing: does the cast share one voice? ----------
{
  let crossMouth = 0, chapters = 0, spoken = 0, selfRepeat = 0;
  const regsSeen = {};
  for (let i = 0; i < 80; i++) {
    const r = KG.simulate(KG.preset('thh'), settings(null, { seed: 'voice' + i, survivors: 2, maxChapters: 'auto' }));
    r.cast.forEach(c => { if (c.reg) regsSeen[c.reg] = (regsSeen[c.reg] || 0) + 1; });
    const byChapter = {};
    for (const d of r.days) for (const p of d.phases) for (const l of p.lines) {
      if (l.k !== 'speech') continue;
      spoken++;
      (byChapter[d.chapter] = byChapter[d.chapter] || []).push(l);
    }
    for (const ch of Object.values(byChapter)) {
      chapters++;
      const owner = new Map();
      const mine = {};
      for (const l of ch) {
        if (owner.has(l.t) && owner.get(l.t) !== l.who) crossMouth++;
        owner.set(l.t, l.who);
        const k = l.who + '|' + l.t;
        if (mine[k]) selfRepeat++;
        mine[k] = 1;
      }
    }
  }
  // this is what a reader actually notices, and nothing was measuring it before
  ok(crossMouth / chapters < 0.6, 'two people rarely say the same sentence in one chapter',
    (crossMouth / chapters).toFixed(2) + ' per chapter');
  ok(selfRepeat / spoken < 0.02, 'and nobody repeats themselves inside a chapter',
    (selfRepeat / spoken * 100).toFixed(1) + '%');
  ok(Object.keys(regsSeen).length === 6, 'all six speech registers get used', Object.keys(regsSeen).join(','));
  const total = Object.values(regsSeen).reduce((a, b) => a + b, 0);
  const biggest = Math.max(...Object.values(regsSeen));
  ok(biggest / total < 0.4, 'no single register swallows the cast', (biggest / total * 100).toFixed(0) + '%');
  console.log('voice: ' + (crossMouth / chapters).toFixed(2) + ' shared lines per chapter, registers ' +
    JSON.stringify(regsSeen));

  // a character keeps one voice for the whole run
  const one = KG.simulate(KG.preset('thh'), settings(null, { seed: 'stable', survivors: 2, maxChapters: 'auto' }));
  one.cast.forEach(c => ok(!c.reg || KG.REGISTERS.indexOf(c.reg) >= 0, 'every register is a real one', String(c.reg)));
}

// ---------- 1k. evidence has to make physical sense ----------
{
  const STANCE = /standing (above|level with|behind|in front of)|angled downward|swung|defensive wound|depth is even|cut runs/i;
  const NOSTANCE = ['poison', 'asphyx', 'cold', 'shock', 'fire'];
  let bullets = 0, cases = 0, bad = [], dupes = 0, thin = 0;
  for (let i = 0; i < 250; i++) {
    const r = KG.simulate(KG.preset('thh'), settings(null, { seed: 'phys' + i, survivors: 2, maxChapters: 'auto' }));
    for (const d of r.days) for (const p of d.phases) {
      const b = p.lines.filter(l => l.k === 'bullet');
      if (!b.length) continue;
      cases++; bullets += b.length;
      if (b.length < 6) thin++;
      const texts = b.map(x => x.t);
      texts.forEach((t, a) => { if (texts.indexOf(t) !== a) dupes++; });
      for (const l of b) {
        const t = l.t;
        const trail = t.match(/running from (the [^,.]+?) toward (the [^,.]+?)\./);
        if (trail && trail[1].trim() === trail[2].trim()) bad.push('trail loops: ' + t);
        const scene = t.match(/did not happen in (the [^.]+)\. It happened in (the [^,]+)/);
        if (scene && scene[1].trim() === scene[2].trim()) bad.push('scene loops: ' + t);
        if (/undefined|NaN|\{[A-Za-z]/.test(t)) bad.push('template leak: ' + t);
      }
    }
  }
  ok(bad.length === 0, 'no incoherent evidence anywhere', bad.slice(0, 2).join(' // '));
  ok(dupes === 0, 'no bullet is printed twice in one case', String(dupes));
  ok(thin / cases < 0.1, 'cases are not thin', (thin / cases * 100).toFixed(1) + '% under six bullets');
  ok(bullets / cases > 8, 'a case carries real substance', (bullets / cases).toFixed(1) + ' bullets per case');

  // a non-contact killing must never be given a stab angle: the old builder rolled
  // 'standing in front of / behind' at random regardless of how the victim died
  const CONTACTLESS = ['poison', 'asphyx', 'cold', 'shock', 'fire', 'water'];
  let stanceOnWrongMethod = 0, contactless = 0, offenders = [];
  for (let i = 0; i < 400; i++) {
    const r = KG.simulate(KG.preset('thh'), settings(null, { seed: 'meth' + i, survivors: 2, maxChapters: 'auto' }));
    for (const d of r.days) for (const p of d.phases) for (const l of p.lines) {
      if (l.k !== 'bullet' || !CONTACTLESS.includes(l.method)) continue;
      contactless++;
      if (STANCE.test(l.t)) { stanceOnWrongMethod++; if (offenders.length < 3) offenders.push(l.method + ': ' + l.t); }
    }
  }
  ok(contactless > 300, 'enough non-contact evidence to test', String(contactless));
  ok(stanceOnWrongMethod === 0, 'a non-contact killing is never given a stab angle', offenders.join(' // '));
  console.log('evidence: ' + (bullets / cases).toFixed(1) + ' bullets per case, ' + contactless +
    ' non-contact bullets checked, 0 physical contradictions');
}

// ---------- 2. determinism ----------
{
  const cast = KG.makeCast(16, 'determinism', 'Ultimate');
  const set = settings(null, { seed: 'fixed-seed-42', maxChapters: 6, survivors: 3 });
  const a = JSON.stringify(KG.simulate(cast, set).chapters);
  const b = JSON.stringify(KG.simulate(cast, set).chapters);
  ok(a === b, 'same seed + same cast produces a byte-identical run');
  const c = JSON.stringify(KG.simulate(cast, settings(null, { seed: 'other-seed', maxChapters: 6, survivors: 3 })).chapters);
  ok(a !== c, 'a different seed produces a different run');
  const castB = KG.makeCast(16, 'determinism', 'Ultimate');
  ok(JSON.stringify(cast) === JSON.stringify(castB), 'cast generation is seed-deterministic too');
}

// ---------- 3. do the stats and traits actually do anything? ----------
function uniformCast(size, stats, traits) {
  const c = [];
  for (let i = 0; i < size; i++) {
    const s = KG.newStudent(i);
    s.name = 'S' + i; s.talent = 'Ultimate Test Subject';
    s.stats = Object.assign({ nerve: 5, cunning: 5, insight: 5, charisma: 5, resolve: 5 }, stats);
    s.traits = (traits || []).slice();
    c.push(s);
  }
  return c;
}
function survey(cast, over, n = 400, tag = 's') {
  let deaths = 0, correct = 0, trials = 0, chapters = 0, murders = 0, selfDefence = 0, houseTakes = 0;
  for (let i = 0; i < n; i++) {
    const run = KG.simulate(cast, settings(null, Object.assign({ seed: tag + i, maxChapters: 6, survivors: 1 }, over)));
    deaths += run.final.deaths.filter(d => !d.escaped).length;
    murders += run.final.deaths.filter(d => /killed by/.test(d.cause)).length;
    selfDefence += run.final.deaths.filter(d => /defending/.test(d.cause)).length;
    houseTakes += run.final.deaths.filter(d => /taken by the house|collective punishment/.test(d.cause)).length;
    chapters += run.chapters.length;
    for (const ch of run.chapters) for (const p of ch.phases) for (const l of p.lines) {
      if (l.k === 'stamp') { trials++; if (!l.wrong) correct++; }
    }
  }
  return { deathsPer: deaths / n, murdersPer: murders / n, selfDefencePer: selfDefence / n, housePer: houseTakes / n, chapters: chapters / n, trials, convictRate: trials ? correct / trials : null };
}

const timid = survey(uniformCast(16, { nerve: 2, resolve: 9 }, ['pacifist']), { mastermind: false }, 300, 'timid');
const savage = survey(uniformCast(16, { nerve: 9, resolve: 2 }, ['bloodthirsty']), { mastermind: false }, 300, 'savage');
ok(savage.murdersPer > timid.murdersPer * 3.5, 'a bloodthirsty class murders far more than a pacifist one',
  savage.murdersPer.toFixed(2) + ' vs ' + timid.murdersPer.toFixed(2));

const dim = survey(uniformCast(16, { insight: 1, cunning: 8 }, []), { mastermind: false }, 300, 'dim');
const sharp = survey(uniformCast(16, { insight: 10, cunning: 8 }, ['detective']), { mastermind: false }, 300, 'sharp');
ok(sharp.convictRate > dim.convictRate + 0.15, 'insight raises the conviction rate',
  (sharp.convictRate ?? 0).toFixed(2) + ' vs ' + (dim.convictRate ?? 0).toFixed(2));

const sloppy = survey(uniformCast(16, { cunning: 1, nerve: 8 }, ['impulsive']), { mastermind: false }, 300, 'sloppy');
const clean = survey(uniformCast(16, { cunning: 10, nerve: 8 }, ['meticulous']), { mastermind: false }, 300, 'clean');
/* conviction sits near its ceiling, so an absolute gap understates this badly:
   the statistic that matters is how often the killer actually walks */
ok((1 - clean.convictRate) > (1 - sloppy.convictRate) * 2.5, 'cunning lets killers beat the trial',
  'walks free ' + ((1 - clean.convictRate) * 100).toFixed(0) + '% vs ' + ((1 - sloppy.convictRate) * 100).toFixed(0) + '%');
ok(sloppy.convictRate > clean.convictRate + 0.08, 'and it shows in the conviction rate too',
  (sloppy.convictRate ?? 0).toFixed(2) + ' vs ' + (clean.convictRate ?? 0).toFixed(2));

// guaranteed-verdict setting must be absolute
const guaranteed = survey(uniformCast(16, { cunning: 10, insight: 1 }, ['meticulous', 'liar']), { trial: 99, mastermind: false }, 200, 'gtd');
ok(guaranteed.convictRate === 1, 'guaranteed trial competence always convicts the blackened', String(guaranteed.convictRate));

// nerve should predict who becomes the blackened in a mixed cast
{
  const cast = [];
  for (let i = 0; i < 16; i++) {
    const s = KG.newStudent(i); s.name = 'M' + i; s.talent = 'Ultimate Variable';
    s.stats = { nerve: i < 8 ? 2 : 9, cunning: 5, insight: 5, charisma: 5, resolve: 5 };
    cast.push(s);
  }
  let lowNerve = 0, highNerve = 0;
  for (let i = 0; i < 400; i++) {
    const run = KG.simulate(cast, settings(null, { seed: 'nerve' + i, maxChapters: 6, survivors: 1, mastermind: false }));
    for (const id of run.final.blackened) (id < 8 ? lowNerve++ : highNerve++);
  }
  ok(highNerve > lowNerve * 3, 'high-nerve students commit most of the murders', highNerve + ' vs ' + lowNerve);
}

// tiny casts must not explode
for (const size of [2, 3, 4]) {
  try {
    const run = KG.simulate(KG.makeCast(size, 'tiny' + size, 'Ultimate'), settings(null, { seed: 'tiny', survivors: 1, maxChapters: 4 }));
    ok(!!run.ending, 'cast of ' + size + ' completes');
  } catch (e) { ok(false, 'cast of ' + size + ' completes', e.message); }
}
// empty-ish and malformed input must not explode
try {
  const rough = [{ name: 'A', stats: {} }, { name: 'B', stats: { nerve: 99, resolve: -4 }, traits: ['nope', 'detective'] }];
  const run = KG.simulate(rough, settings(null, { seed: 'rough', survivors: 1, maxChapters: 3 }));
  ok(!!run.ending, 'malformed cast input is coerced, not fatal');
} catch (e) { ok(false, 'malformed cast input is coerced, not fatal', e.message); }

// ---------- traitors buying their own perks ----------
/* The house sells to its own moles without asking the player. Nothing here was
   covered before, so the one-survival cap, the no-Spokesman rule and the silent
   accounting could all have been undone by an unrelated edit without a failure.
   Categories are parsed out of the shipped PERKS table rather than restated, so
   renaming a perk breaks this loudly instead of quietly skipping the check. */
{
  const perkBlock = html.match(/var PERKS = \{[\s\S]*?\n\};/)[0];
  const CAT = {}, KEY_OF_LABEL = {};
  for (const m of perkBlock.matchAll(/(\w+):\s*\{\s*cat:\s*"(\w+)"(?:,\s*cost:\s*\d+)?,\s*label:\s*"([^"]+)"/g)) {
    CAT[m[1]] = m[2]; KEY_OF_LABEL[m[3]] = m[1];
  }
  ok(Object.keys(CAT).length >= 18, 'perk table parsed for the traitor checks', Object.keys(CAT).length + ' perks');

  const N = 120;
  let runsWithBuys = 0, buysTotal = 0;
  let badOwner = 0, notHeld = 0, twoSurvival = 0, dupCat = 0, forbidden = 0, negBalance = 0, unlabelled = 0;
  for (let i = 0; i < N; i++) {
    const g = KG.begin(KG.preset('thh'), settings(null, { seed: 'tbuy' + i, survivors: 2, maxChapters: 'auto' }));
    let a, n = 0;
    while (!g.done && n++ < 4000) { KG.step(g, a); a = g.pending ? KG.autoAnswer(g.S, g.pending) : undefined; }
    const S = g.S, run = g.out;
    if (!Array.isArray(run.traitorBuys)) { ok(false, 'the run exposes traitorBuys as an array', 'seed tbuy' + i); break; }
    const buys = run.traitorBuys;
    if (buys.length) runsWithBuys++;
    buysTotal += buys.length;
    for (const b of buys) {
      const c = S.cast[b.id];
      if (!c || !(c.mastermind || c.aligned)) { badOwner++; continue; }
      const key = KEY_OF_LABEL[b.perk];
      if (!key) { unlabelled++; continue; }
      if (!(S.perks && S.perks[c.id] && S.perks[c.id][key])) notHeld++;
      if (key === 'spokesman' || CAT[key] === 'negative') forbidden++;
    }
    for (const c of S.cast.filter(x => x.mastermind || x.aligned)) {
      const cats = Object.keys((S.perks && S.perks[c.id]) || {}).map(k => CAT[k]);
      if (cats.filter(x => x === 'survival').length > 1) twoSurvival++;
      const seen = {};
      for (const cat of cats) { if (cat && cat !== 'negative' && seen[cat]) dupCat++; seen[cat] = 1; }
      if ((S.favour[c.id] || 0) < 0) negBalance++;
    }
  }
  ok(badOwner === 0, 'only traitors ever buy from the host', badOwner + ' purchases by non-traitors');
  ok(unlabelled === 0, 'every purchase names a perk that exists in the table', unlabelled + ' unmatched labels');
  ok(notHeld === 0, 'a purchased perk is actually held afterwards', notHeld + ' recorded but not held');
  ok(twoSurvival === 0, 'no traitor holds two survival perks', twoSurvival + ' violations');
  ok(dupCat === 0, 'no traitor holds two perks of one category', dupCat + ' violations');
  ok(forbidden === 0, 'traitors never buy Spokesman or a negative perk', forbidden + ' purchases');
  ok(negBalance === 0, 'spending never drives a traitor balance below zero', negBalance + ' negative balances');
  ok(runsWithBuys >= N * 0.08, 'traitors are actually buying, not silently disabled',
    runsWithBuys + ' of ' + N + ' runs');
  console.log('traitor purchases: ' + runsWithBuys + '/' + N + ' runs, ' + (buysTotal / N).toFixed(2) + ' per run');
}

// ---------- report ----------
console.log('\nendings over ' + RUNS + ' sweep runs:', endings);
console.log('avg deaths/run', (totalDeaths / RUNS).toFixed(2), '| avg chapters', (totalChapters / RUNS).toFixed(2), '| escapes', escapes);
ok(timid.housePer > timid.murdersPer * 2, 'a class that will not kill gets collected by the house instead',
  timid.housePer.toFixed(2) + ' taken vs ' + timid.murdersPer.toFixed(2) + ' murdered');
ok(savage.housePer < 0.5, 'a class that will kill never needs collecting', savage.housePer.toFixed(2));
console.log('spread — murders/run: pacifist class', timid.murdersPer.toFixed(2), '| bloodthirsty class', savage.murdersPer.toFixed(2),
  '| total deaths', timid.deathsPer.toFixed(2), 'vs', savage.deathsPer.toFixed(2));
{
  let trials = 0, correct = 0, grad = 0, N = 400;
  for (let i = 0; i < N; i++) {
    const run = KG.simulate(KG.makeCast(16, 'bal' + i, 'Ultimate'), settings(null, { seed: 'balance' + i, maxChapters: 6, survivors: 3 }));
    if (run.ending.kind === 'graduation') grad++;
    for (const ch of run.chapters) for (const p of ch.phases) for (const l of p.lines) if (l.k === 'stamp') { trials++; if (!l.wrong) correct++; }
  }
  console.log('default 16-student cast: conviction rate', (correct / trials).toFixed(2), '| runs ended by a wrong verdict', (grad / N * 100).toFixed(0) + '%');
}
console.log('spread — conviction rate: dim', (dim.convictRate ?? 0).toFixed(2), '| sharp', (sharp.convictRate ?? 0).toFixed(2),
  '| sloppy killers', (sloppy.convictRate ?? 0).toFixed(2), '| meticulous killers', (clean.convictRate ?? 0).toFixed(2));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nfirst 12 problems:'); problems.slice(0, 12).forEach(p => console.log(' - ' + p)); process.exit(1); }

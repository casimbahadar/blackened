/* Text-quality harness for BLACKENED.
   The engine harness proves the simulation is right. This one proves the prose
   the simulation assembles is actually readable: no template leaks, no broken
   punctuation, no pronoun that contradicts the character record, no em dashes,
   and no fragment worn out by repetition. Run: node blackened.text.mjs */
import fs from 'node:fs';

const core = fs.readFileSync(new URL('./blackened.html', import.meta.url), 'utf8')
  .match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];
const KG = new Function(core + '\n;return KG;')();

let pass = 0; const fails = [];
function ok(cond, label, detail) { if (cond) pass++; else fails.push(label + (detail ? ' :: ' + detail : '')); }

/* ---------- collect every line the game can print ---------- */
const rosters = KG.PRESETS ? KG.PRESETS.map(r => r.key) : ['thh'];
const lines = [];
for (let i = 0; i < 90; i++) {
  const roster = rosters[i % rosters.length];
  const cast = KG.preset(roster);
  if (!cast || cast.length < 2) continue;
  const run = KG.simulate(cast, Object.assign(KG.defaults(), {
    seed: 'text' + i, survivors: 2, maxChapters: 'auto',
    venue: 'random', ask: 'all', dailyQuestions: 8
  }));
  const who = {};
  run.cast.forEach(c => { who[c.name] = c; });
  for (const d of run.days) for (const p of d.phases) for (const l of p.lines) {
    const t = l.t || (l.file ? '' : '');
    if (l.k === 'file') {
      // only the prose fields are sentences; victim, talent, place and times are data
      ['extra', 'omission'].forEach(f => {
        if (l.file[f]) lines.push({ t: String(l.file[f]), kind: 'file', cast: who, phase: p.name });
      });
      continue;
    }
    if (!t) continue;
    lines.push({ t: String(t), kind: l.k, who: l.who, cast: who, phase: p.name, run: i });
  }
  (run.epilogue || []).forEach(t => lines.push({ t: String(t), kind: 'epilogue', cast: who }));
  if (run.ending) lines.push({ t: String(run.ending.line), kind: 'ending', cast: who });
}
console.log('collected ' + lines.length + ' generated lines across ' + rosters.length + ' rosters');

/* ---------- mechanical ---------- */
const leak = lines.filter(l => /\{[A-Za-z][\w.]*\}/.test(l.t));
ok(leak.length === 0, 'no unfilled template slots survive into output', leak.slice(0, 3).map(l => l.t).join(' // '));

const undef = lines.filter(l => /\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(l.t));
ok(undef.length === 0, 'no undefined, NaN or [object Object] reaches the page', undef.slice(0, 3).map(l => l.t).join(' // '));

const spacing = lines.filter(l => {
  const t = l.t.replace(/\?\?\?/g, 'X');   // unverified-talent placeholder, not punctuation
  return /\s\s|\s[,;:!?]|\s\.(?!\.)|,,|\s'\s/.test(t) || /\.{4,}/.test(t);
});
ok(spacing.length === 0, 'no doubled spaces or floating punctuation', spacing.slice(0, 3).map(l => JSON.stringify(l.t)).join(' // '));

const dashes = lines.filter(l => /[\u2014\u2013]/.test(l.t));
ok(dashes.length === 0, 'no em or en dashes anywhere in generated text', dashes.slice(0, 3).map(l => l.t).join(' // '));

const LABELS = new Set(['round', 'stamp', 'file']);   // headers and data fields, not prose
const badEnd = lines.filter(l => !LABELS.has(l.kind) && !/[.!?"'\u2026)\]]$/.test(l.t.trim()));
ok(badEnd.length === 0, 'every line ends with terminal punctuation', badEnd.slice(0, 3).map(l => l.t).join(' // '));

const badStart = lines.filter(l => /^[a-z]/.test(l.t.trim()) && l.kind !== 'file');
ok(badStart.length === 0, 'every line starts with a capital', badStart.slice(0, 3).map(l => l.t).join(' // '));

const doubleSpaceAfterPeriod = lines.filter(l => /[a-z]\.[A-Z]/.test(l.t));
ok(doubleSpaceAfterPeriod.length === 0, 'no missing space after a full stop',
  doubleSpaceAfterPeriod.slice(0, 3).map(l => l.t).join(' // '));

/* ---------- structural ---------- */
const runaway = lines.filter(l => (l.t.match(/,/g) || []).length > 6 || l.t.length > 320);
ok(runaway.length === 0, 'no runaway sentence from a bad join', runaway.slice(0, 2).map(l => l.t.slice(0, 120)).join(' // '));

/* pronouns must match the character record that produced them */
const PRON = {
  he: { subj: 'he', obj: 'him', poss: 'his' },
  she: { subj: 'she', obj: 'her', poss: 'her' },
  they: { subj: 'they', obj: 'them', poss: 'their' }
};
const pronounOf = c => (c.pron && (c.pron.they || c.pron.subj || c.pron)) || 'they';
let checkedPron = 0; const pronBad = [];
for (const l of lines) {
  const named = Object.keys(l.cast).filter(n => l.t.includes(n));
  if (named.length !== 1) continue;                 // ambiguous attribution, skip
  const c = l.cast[named[0]];
  const key = pronounOf(c);
  const want = PRON[key] || PRON.they;
  const others = Object.keys(PRON).filter(k => k !== key);
  checkedPron++;
  for (const o of others) {
    const p = PRON[o];
    // only flag the distinctive subject form, which cannot belong to another reading
    const re = new RegExp('\\b' + p.subj + '\\b', 'i');
    if (re.test(l.t) && !new RegExp('\\b' + want.subj + '\\b', 'i').test(l.t)) {
      pronBad.push(c.name + ' (' + key + '): ' + l.t);
      break;
    }
  }
}
ok(checkedPron > 2000, 'enough unambiguous lines to check pronouns', String(checkedPron));
ok(pronBad.length / Math.max(checkedPron, 1) < 0.02, 'pronouns agree with the character record',
  pronBad.length + '/' + checkedPron + '  e.g. ' + pronBad.slice(0, 2).join(' // '));

/* names in a line must belong to the run that produced it */
let ghost = 0;
for (const l of lines) {
  if (l.kind !== 'speech') continue;
  if (l.who && !l.cast[l.who]) ghost++;
}
ok(ghost === 0, 'every speaker belongs to the cast', String(ghost));

/* ---------- variety ---------- */
const byRun = {};
lines.filter(l => l.kind === 'speech').forEach(l => { (byRun[l.run] = byRun[l.run] || []).push(l.t); });
let worstShare = 0, worstLine = '';
for (const arr of Object.values(byRun)) {
  const c = {};
  arr.forEach(t => { c[t] = (c[t] || 0) + 1; });
  for (const [t, n] of Object.entries(c)) {
    const share = n / arr.length;
    if (share > worstShare) { worstShare = share; worstLine = t; }
  }
}
/* the standard is now absolute: a line may not be heard twice in one run */
let inRunRepeats = 0, worstRun = 0;
for (const arr of Object.values(byRun)) {
  const c = {};
  arr.forEach(t => { c[t] = (c[t] || 0) + 1; });
  for (const n of Object.values(c)) { if (n > 1) inRunRepeats++; worstRun = Math.max(worstRun, n); }
}
ok(inRunRepeats === 0, 'no line is ever spoken twice in the same run',
  inRunRepeats + ' lines repeated, worst heard ' + worstRun + 'x');

/* and a second run in the same sitting should be almost entirely new material */
{
  const cast = KG.preset('thh');
  const base = Object.assign(KG.defaults(), { survivors: 2, maxChapters: 'auto' });
  const first = KG.simulate(cast, Object.assign({}, base, { seed: 'sessionA' }));
  const second = KG.simulate(cast, Object.assign({}, base, { seed: 'sessionB', heardBefore: first.final.heard }));
  const before = new Set(first.final.heard);
  const said = [];
  for (const d of second.days) for (const p of d.phases) for (const l of p.lines) if (l.k === 'speech') said.push(l.t);
  const reused = said.filter(t => before.has(t)).length;
  ok(reused / said.length < 0.05, 'a second run in the same sitting is nearly all new lines',
    reused + ' of ' + said.length + ' reused');
  console.log('freshness: run two reuses ' + (reused / said.length * 100).toFixed(1) + '% of its lines');
}

ok(worstShare < 0.06, 'no single line dominates a run',
  (worstShare * 100).toFixed(1) + '% at most, e.g. ' + JSON.stringify(worstLine.slice(0, 60)));
let worstCount = 0, worstCountLine = '';
for (const arr of Object.values(byRun)) {
  const c = {};
  arr.forEach(t => { c[t] = (c[t] || 0) + 1; });
  for (const [t, n] of Object.entries(c)) if (n > worstCount) { worstCount = n; worstCountLine = t; }
}
ok(worstCount <= 4, 'no line is heard more than four times in a whole run',
  worstCount + 'x  ' + JSON.stringify(worstCountLine.slice(0, 60)));

/* ---------- slop markers, per avoid-ai-slop ---------- */
/* bare 'unlock' is literal here: the host really does unlock rooms. Only the
   abstract uses are slop. */
const SLOP = /\b(delve|pivotal|robust|tapestry|underscore|showcase|foster|intricate|testament|vibrant|seamless|holistic|myriad|in today's)\b|\bunlock\w* (value|potential|insight|a more|the full)|\bleverag\w+\b/i;
const slop = lines.filter(l => SLOP.test(l.t));
ok(slop.length === 0, 'no AI-marker vocabulary in generated prose', slop.slice(0, 3).map(l => l.t).join(' // '));

/* the rubric's target is the inflated reveal, X is not just Y, it is Z.
   A bare 'not just' inside dialogue is ordinary English. */
const notJust = lines.filter(l => /\b(is|isn't|is not) just\b[^.!?]*,\s*(it|they|that)('s| is| are)\b/i.test(l.t) || /\bnot only\b[^.!?]*\bbut also\b/i.test(l.t));
ok(notJust.length === 0, 'no inflated not-just-X-but-Y contrast', notJust.slice(0, 2).map(l => l.t).join(' // '));

const semicolonChain = lines.filter(l => (l.t.match(/;/g) || []).length >= 2);
ok(semicolonChain.length === 0, 'no semicolon chains built for rhythm', semicolonChain.slice(0, 2).map(l => l.t).join(' // '));

/* ---------- daily-life repetition, per pool ---------- */
/* Counting string identity says these pools barely repeat, because the names
   differ every time. This counts templates instead, which is the only way the
   defect is visible: MORNING once landed the same line five times in one run and
   no identity-based measure could see it. Pool bodies are read out of the file by
   name rather than by line number so an edit above them cannot silently empty
   this check. */
{
  const html = fs.readFileSync(new URL('./blackened.html', import.meta.url), 'utf8');
  const CEIL = { DAILY: 0.20, MORNING: 0.08, NIGHT: 0.15, AFTERMATH: 0.12 };
  const WORST = 4;
  const tmpl = {};
  for (const name of Object.keys(CEIL)) {
    const body = (html.match(new RegExp('var ' + name + ' = \\[[\\s\\S]*?\\n\\];')) || [''])[0];
    tmpl[name] = [...body.matchAll(/\bt:\s*"((?:[^"\\]|\\.)*)"/g)].map(m => {
      const t = m[1].replace(/\\"/g, '"');
      return { t, re: new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '(.+?)') + '$') };
    });
    ok(tmpl[name].length >= 8, 'the ' + name + ' pool is readable for the repetition check', String(tmpl[name].length));
  }

  const N = 40;
  const stat = {}; for (const k in tmpl) stat[k] = { draws: 0, repeats: 0, worst: 0, worstT: '' };
  for (let i = 0; i < N; i++) {
    const run = KG.simulate(KG.preset('thh'), Object.assign(KG.defaults(), { seed: 'rep' + i, survivors: 2, maxChapters: 'auto' }));
    const flat = [];
    for (const ch of run.chapters) for (const p of ch.phases) for (const l of p.lines) if (typeof l.t === 'string' && !l.who) flat.push(l.t);
    for (const name in tmpl) {
      const seen = {};
      for (const t of flat) {
        const hit = tmpl[name].find(x => x.re.test(t));
        if (!hit) continue;
        stat[name].draws++;
        seen[hit.t] = (seen[hit.t] || 0) + 1;
        if (seen[hit.t] > 1) stat[name].repeats++;
      }
      for (const [t, n] of Object.entries(seen)) if (n > stat[name].worst) { stat[name].worst = n; stat[name].worstT = t; }
    }
  }
  const report = [];
  for (const [name, s] of Object.entries(stat)) {
    const rate = s.draws ? s.repeats / s.draws : 0;
    ok(s.draws > 0, name + ' is actually drawn during a run', String(s.draws));
    ok(rate <= CEIL[name], name + ' repeats within a run stay under ' + Math.round(CEIL[name] * 100) + '%',
      (rate * 100).toFixed(1) + '% over ' + (s.draws / N).toFixed(1) + ' draws a run');
    ok(s.worst <= WORST, 'no ' + name + ' line is heard more than ' + WORST + ' times in one run',
      s.worst + 'x :: ' + s.worstT.slice(0, 80));
    report.push(name + ' ' + (rate * 100).toFixed(1) + '%');
  }
  console.log('daily-life repetition: ' + report.join(', '));
}

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { console.log('\nproblems:'); fails.slice(0, 12).forEach(f => console.log(' - ' + f)); process.exitCode = 1; }

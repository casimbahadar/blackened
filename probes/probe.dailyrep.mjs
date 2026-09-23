// Read-only probe: template-level repetition inside a single run, per pool.
import fs from 'node:fs';
const html = fs.readFileSync(new URL('./blackened.html', import.meta.url), 'utf8');
const core = html.match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];
const KG = new Function(core + '\n;return KG;')();

const POOLS = { DAILY: [1003,1079], MORNING: [924,944], NIGHT: [1080,1092], AFTERMATH: [1093,1106] };
const src = html.split('\n');
const tmpl = {};   // pool -> [{re, t}]
for (const [name, [a, b]] of Object.entries(POOLS)) {
  const body = src.slice(a - 1, b).join('\n');
  const list = [];
  for (const m of body.matchAll(/\bt:\s*"((?:[^"\\]|\\.)*)"/g)) {
    const t = m[1].replace(/\\"/g, '"');
    const re = new RegExp('^' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '(.+?)') + '$');
    list.push({ t, re });
  }
  tmpl[name] = list;
}
console.log('templates parsed:', Object.entries(tmpl).map(([k, v]) => k + '=' + v.length).join(' '));

const N = 60;
const stat = {}; for (const k in tmpl) stat[k] = { draws: 0, repeats: 0, worst: 0, worstT: '', unmatched: 0 };
for (let i = 0; i < N; i++) {
  const run = KG.simulate(KG.preset('thh'), Object.assign(KG.defaults(), { seed: 'rep' + i, survivors: 2, maxChapters: 'auto' }));
  const lines = [];
  for (const ch of run.chapters) for (const p of ch.phases) for (const l of p.lines) if (typeof l.t === 'string' && !l.who) lines.push(l.t);
  for (const name in tmpl) {
    const seen = {};
    for (const t of lines) {
      const hit = tmpl[name].find(x => x.re.test(t));
      if (!hit) continue;
      stat[name].draws++;
      seen[hit.t] = (seen[hit.t] || 0) + 1;
      if (seen[hit.t] > 1) stat[name].repeats++;
    }
    for (const [t, n] of Object.entries(seen)) if (n > stat[name].worst) { stat[name].worst = n; stat[name].worstT = t; }
  }
}
for (const [k, s] of Object.entries(stat)) {
  const rate = s.draws ? 100 * s.repeats / s.draws : 0;
  console.log(k.padEnd(10), 'pool ' + String(tmpl[k].length).padStart(3),
    '| draws/run ' + (s.draws / N).toFixed(1).padStart(5),
    '| repeat ' + rate.toFixed(1) + '%',
    '| worst single template heard ' + s.worst + 'x in one run');
  if (s.worst > 2) console.log('   worst:', s.worstT.slice(0, 100));
}

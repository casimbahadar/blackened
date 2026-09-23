import fs from 'node:fs';
function load(p){const c=fs.readFileSync(p,'utf8').match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];return new Function(c+'\n;return KG;')();}
const KG = load(process.argv[2]);
const N = Number(process.argv[3] || 200);
const rosters = KG.PRESETS.map(r => r.key);
let dupRuns = 0, longRuns = 0;
for (let i = 0; i < N; i++) {
  const run = KG.simulate(KG.preset(rosters[i % rosters.length]), Object.assign(KG.defaults(), { seed: 'text' + i, survivors: 2, maxChapters: 'auto', venue: 'random', ask: 'all', dailyQuestions: 8 }));
  if (run.chapterCount >= 7) longRuns++;
  const seen = {};
  let dup = false;
  for (const d of run.days) for (const p of d.phases) for (const l of p.lines) if (l.k === 'speech' && l.t) { seen[l.t] = (seen[l.t]||0)+1; if (seen[l.t] > 1) dup = true; }
  if (dup) dupRuns++;
}
console.log(process.argv[2].split('/').pop(), '| runs', N, '| runs with a repeated spoken line:', dupRuns, '| runs of 7+ chapters:', longRuns);

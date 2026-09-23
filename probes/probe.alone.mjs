import fs from 'node:fs';
const core = fs.readFileSync(new URL('./blackened.html', import.meta.url), 'utf8')
  .match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];
const KG = new Function(core + '\n;return KG;')();
const rosters = KG.PRESETS.map(r => r.key);
let cases = 0, alone = 0, aloneDistract = 0, aloneAlibi = 0, aloneBoth = 0;
for (let i = 0; i < 120; i++) {
  const run = KG.simulate(KG.preset(rosters[i % rosters.length]), Object.assign(KG.defaults(), { seed: 'al' + i, survivors: 2, maxChapters: 'auto' }));
  for (const ch of run.chapters) {
    const txt = [];
    for (const p of ch.phases) for (const l of p.lines) if (typeof l.t === 'string') txt.push(l.t);
    const blob = txt.join('\n');
    if (!/planned it alone|Agreed in advance between/.test(blob)) continue;
    cases++;
    if (!/planned it alone/.test(blob)) continue;
    alone++;
    const d = /The interruption that emptied the corridor was arranged/.test(blob);
    const a = /The alibi was arranged with/.test(blob);
    if (d) aloneDistract++;
    if (a) aloneAlibi++;
    if (d && a) aloneBoth++;
  }
}
const pct = (x, n) => (100 * x / n).toFixed(1) + '%';
console.log('cases with a plan section:', cases, '| solo-planned:', alone, '(' + pct(alone, cases) + ')');
console.log('solo + arranged interruption:', aloneDistract, '(' + pct(aloneDistract, alone) + ' of solo)');
console.log('solo + alibi arranged with someone:', aloneAlibi, '(' + pct(aloneAlibi, alone) + ' of solo)');
console.log('solo + both:', aloneBoth);

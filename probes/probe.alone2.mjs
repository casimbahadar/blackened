import fs from 'node:fs';
const core = fs.readFileSync(new URL('./blackened.html', import.meta.url), 'utf8')
  .match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];
const KG = new Function(core + '\n;return KG;')();
const rosters = KG.PRESETS.map(r => r.key);
let solo = 0, soloOld = 0, soloNew = 0, oldWithHelp = 0, newWithoutHelp = 0;
const samples = [];
for (let i = 0; i < 120; i++) {
  const run = KG.simulate(KG.preset(rosters[i % rosters.length]), Object.assign(KG.defaults(), { seed: 'al' + i, survivors: 2, maxChapters: 'auto' }));
  for (const ch of run.chapters) {
    const txt = [];
    for (const p of ch.phases) for (const l of p.lines) if (typeof l.t === 'string') txt.push(l.t);
    const blob = txt.join('\n');
    const old = /which is why the parts of it that needed two people/.test(blob);
    const nw = /nobody was told the whole of it/.test(blob);
    if (!old && !nw) continue;
    solo++;
    const help = /The interruption that emptied the corridor was arranged/.test(blob) || /The alibi was arranged with/.test(blob);
    if (old) { soloOld++; if (help) oldWithHelp++; }
    if (nw) { soloNew++; if (!help) newWithoutHelp++; if (samples.length < 2) samples.push(blob.match(/.*nobody was told the whole of it.*\n?(.*\n?){0,4}/)[0]); }
  }
}
console.log('solo cases:', solo, '| original clause:', soloOld, '| new clause:', soloNew);
console.log('CONTRADICTIONS -> original clause printed alongside arranged help:', oldWithHelp,
  '| new clause printed with no arranged help:', newWithoutHelp);
console.log('\nsample:\n' + samples[0]);

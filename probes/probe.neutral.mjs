import fs from 'node:fs';
function load(p) {
  const core = fs.readFileSync(p, 'utf8').match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];
  return new Function(core + '\n;return KG;')();
}
const A = load(process.argv[2]), B = load(process.argv[3]);
let same = 0, diff = 0, textDiff = 0;
for (let i = 0; i < 60; i++) {
  const set = { seed: 'neu' + i, survivors: 2, maxChapters: 'auto' };
  const ra = A.simulate(A.preset('thh'), Object.assign(A.defaults(), set));
  const rb = B.simulate(B.preset('thh'), Object.assign(B.defaults(), set));
  const key = r => JSON.stringify({ e: r.ending.kind, d: r.final.deaths.map(x => x.id + ':' + (x.by == null ? '-' : x.by)),
    ch: r.chapterCount, day: r.dayCount, mm: r.final.mastermind, bl: r.final.blackened });
  if (key(ra) === key(rb)) same++; else diff++;
  const txt = r => { const o = []; for (const c of r.chapters) for (const p of c.phases) for (const l of p.lines) if (typeof l.t === 'string') o.push(l.t); return o.join('\n'); };
  if (txt(ra) !== txt(rb)) textDiff++;
}
console.log('outcome identical:', same, '| outcome changed:', diff, '| prose changed:', textDiff, 'of 60');

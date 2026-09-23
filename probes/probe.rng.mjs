import fs from 'node:fs';
function load(p){const c=fs.readFileSync(p,'utf8').match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];return new Function(c+'\n;return KG;')();}
const A = load(process.argv[2]), B = load(process.argv[3]);
const rosters = A.PRESETS.map(r=>r.key);
let buyRuns=0, sameStream=0, sameOutcome=0, sameProse=0, N=80;
let noBuySame=0, noBuyTotal=0, buySame=0;
for (let i=0;i<N;i++){
  const cfg = { seed:'rng'+i, survivors:2, maxChapters:'auto' };
  const ga = A.begin(A.preset(rosters[i%rosters.length]), Object.assign(A.defaults(), cfg));
  let x, n=0; while(!ga.done && n++<4000){ A.step(ga,x); x = ga.pending ? A.autoAnswer(ga.S, ga.pending) : undefined; }
  const gb = B.begin(B.preset(rosters[i%rosters.length]), Object.assign(B.defaults(), cfg));
  let y, m=0; while(!gb.done && m++<4000){ B.step(gb,y); y = gb.pending ? B.autoAnswer(gb.S, gb.pending) : undefined; }
  const buys = (ga.S.traitorBuys||[]).length;
  if (buys) buyRuns++;
  // draws consumed: the RNG's internal counter if exposed, else compare the next value drawn
  const drawA = ga.S.rng.next(), drawB = gb.S.rng.next();
  if (drawA === drawB) sameStream++;
  if (buys) { if (drawA===drawB) buySame++; } else { noBuyTotal++; if (drawA===drawB) noBuySame++; }
  const key = g => JSON.stringify({ e:g.out.ending.kind, d:g.out.final.deaths.map(z=>z.id+':'+(z.by==null?'-':z.by)), ch:g.out.chapterCount, day:g.out.dayCount });
  if (key(ga)===key(gb)) sameOutcome++;
  const txt = g => { const o=[]; for(const c of g.out.chapters) for(const p of c.phases) for(const l of p.lines) if(typeof l.t==='string') o.push(l.t); return o.join('\n'); };
  if (txt(ga)===txt(gb)) sameProse++;
}
console.log('runs', N, '| runs where traitors bought:', buyRuns);
console.log('no-purchase runs with identical stream:', noBuySame, 'of', noBuyTotal, '| purchase runs with identical stream:', buySame, 'of', buyRuns);
console.log('RNG position identical at run end:', sameStream, '| outcomes identical:', sameOutcome, '| prose identical:', sameProse);

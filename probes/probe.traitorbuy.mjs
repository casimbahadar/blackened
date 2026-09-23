// Read-only probe: measures traitor self-purchasing. Modifies nothing in the build.
import fs from 'node:fs';
const core = fs.readFileSync(new URL('./blackened.html', import.meta.url), 'utf8')
  .match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];
const KG = new Function(core + '\n;return KG;')();

const CAT = { overlooked:'survival', not_first:'survival', hard_to_reach:'survival', spared:'survival',
  intervened:'survival', benefit:'survival', floor_plan:'knowledge', house_rules:'knowledge',
  hosts_tell:'knowledge', reader:'knowledge', trusted:'social', persuasive:'social', feared:'social',
  spokesman:'social', marked:'negative', discredited:'negative', talked_over:'negative', outed:'negative' };

function runOne(seed) {
  const set = Object.assign(KG.defaults(), { seed, survivors: 2, maxChapters: 'auto' });
  const G = KG.begin(KG.preset('thh'), set);
  let ans, guard = 0;
  while (!G.done && guard++ < 4000) { KG.step(G, ans); ans = G.pending ? KG.autoAnswer(G.S, G.pending) : undefined; }
  return G;
}

const N = 400;
let traitorRuns = 0, buyRuns = 0, total = 0, survViol = 0, catViol = 0, negBuy = 0, spokes = 0, reveal = 0;
const perkMix = {}, byChapter = {}, per = [], traitorsSeen = [];
for (let i = 0; i < N; i++) {
  const G = runOne('probe' + i), S = G.S, run = G.out;
  const traitors = S.cast.filter(c => c.mastermind || c.aligned);
  traitorsSeen.push(traitors.length);
  if (traitors.length) traitorRuns++;
  const buys = S.traitorBuys || [];
  if (buys.length) buyRuns++;
  total += buys.length; per.push(buys.length);
  for (const b of buys) { perkMix[b.perk] = (perkMix[b.perk]||0)+1; byChapter[b.chapter] = (byChapter[b.chapter]||0)+1; if (/Spokesman/.test(b.perk)) spokes++; }
  for (const c of traitors) {
    const keys = Object.keys((S.perks && S.perks[c.id]) || {});
    const cats = keys.map(k => CAT[k] || '?');
    if (cats.filter(x => x === 'survival').length > 1) survViol++;
    const seen = {};
    for (const k of cats) { if (k !== 'negative' && seen[k]) catViol++; seen[k] = 1; }
  }
  const lines = [];
  for (const ch of run.chapters) for (const p of ch.phases) for (const l of p.lines) if (typeof l.t === 'string') lines.push(l.t);
  if (lines.some(t => /paying for it in a currency/.test(t))) reveal++;
}
const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2))); };
console.log('runs:', N, '| runs with >=1 traitor:', traitorRuns, '| mean traitors/run:', mean(traitorsSeen).toFixed(2));
console.log('runs with >=1 traitor purchase:', buyRuns, '(' + (100*buyRuns/N).toFixed(1) + '%)');
console.log('purchases/run:', mean(per).toFixed(2), '+/-', (sd(per)/Math.sqrt(N)).toFixed(2), '(SE) | total', total);
console.log('violations -> 2x survival:', survViol, '| dup category:', catViol, '| negative bought:', negBuy, '| spokesman:', spokes);
console.log('runs where the reveal names purchases:', reveal);
console.log('perk mix:', JSON.stringify(perkMix));
console.log('by chapter:', JSON.stringify(byChapter));

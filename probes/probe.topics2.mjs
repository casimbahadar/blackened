import fs from 'node:fs';
const html = fs.readFileSync(process.argv[2],'utf8');
const core = html.match(/\/\* CORE-START[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END \*\//)[1];
const KG = new Function(core+'\n;return KG;')();
const gen = (html.match(/var TOPIC_GENERIC = \[[\s\S]*?\];/)||[''])[0];
const genSet = new Set([...gen.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m=>m[1]));
const rosters = KG.PRESETS.map(r=>r.key);
let worst=0, worstRun=-1, over=0; const N=Number(process.argv[3]||120);
for (let i=0;i<N;i++){
  const run = KG.simulate(KG.preset(rosters[i%rosters.length]), Object.assign(KG.defaults(),{seed:'text'+i,survivors:2,maxChapters:'auto',venue:'random',ask:'all',dailyQuestions:8}));
  let n=0;
  for (const d of run.days) for (const p of d.phases) for (const l of p.lines) if (l.k==='speech' && genSet.has(l.t)) n++;
  if (n>worst){worst=n;worstRun=i;}
  if (n>=24) over++;
}
console.log(process.argv[2].split('/').pop(),'genericBank',genSet.size,'| worst run uses',worst,'(run '+worstRun+')','| runs at or past bank size:',over,'of',N);

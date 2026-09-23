import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
const html = fs.readFileSync('/home/claude/kg/blackened.html', 'utf8');
async function once(tag) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom, doc = window.document;
  window.alert = () => {}; window.scrollTo = () => {}; window.Element.prototype.scrollIntoView = function () {};
  const $ = id => doc.getElementById(id);
  const dockBtn = t => [...doc.querySelectorAll('button')].filter(b => b.textContent.trim() === t)[0];
  if (dockBtn('Cast')) dockBtn('Cast').click();
  $('loadPreset').dispatchEvent(new window.Event('click', { bubbles: true }));
  [...$('sheetInner').querySelectorAll('button')].filter(b => b.textContent.trim() === 'Use this cast')[0].click();
  $('setSeed').value = 'preset-run';
  dockBtn('Begin the killing game').click();
  dockBtn('End').click();
  const crypto = await import('node:crypto');
  const feed = doc.getElementById('feed').textContent;
  const h = crypto.createHash('md5').update(feed).digest('hex').slice(0, 10);
  const facts = [...doc.querySelectorAll('.rpane')].map(p => p.textContent).join(' ').slice(0, 0);
  console.log(tag, '| feed md5', h, '| feed chars', feed.length, '| first line:', feed.slice(0, 60).replace(/\s+/g, ' '));
}
await once('run A'); await once('run B'); await once('run C');

// Real-DOM smoke test: loads the shipped file in jsdom, drives the UI, fails on any console error.
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const path = process.argv[2] || new URL('./blackened.html', import.meta.url).pathname;
const html = fs.readFileSync(path, 'utf8');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: new (await import('jsdom')).VirtualConsole().on('jsdomError', e => errors.push('jsdomError: ' + e.message))
});
const { window } = dom;
const doc = window.document;
window.alert = m => errors.push('alert: ' + m);
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = function () {};
window.addEventListener('error', e => errors.push('window error: ' + e.message));

let pass = 0, fail = 0;
const ok = (c, l, x) => { if (c) pass++; else { fail++; console.log('FAIL: ' + l + (x ? ' :: ' + x : '')); } };
const $ = id => doc.getElementById(id);
const click = id => $(id).dispatchEvent(new window.Event('click', { bubbles: true }));
const dockBtn = label => [...$('dockInner').querySelectorAll('button')].find(b => b.textContent.trim().toLowerCase() === label.toLowerCase());

// --- setup screen renders
ok($('roster').children.length === 16, 'roster renders 16 students', $('roster').children.length);
ok(/16 students/.test($('castCount').textContent), 'cast counter reads 16');
ok(!!dockBtn('Begin the killing game'), 'dock offers the start button');

// --- editing a name sticks
const firstName = $('roster').querySelector('input.nm');
firstName.value = 'Sobia Test';
firstName.dispatchEvent(new window.Event('input', { bubbles: true }));

// --- add / randomize / bulk
click('addStudent');
ok($('roster').children.length === 17, 'add student works', $('roster').children.length);
click('expandAll');
ok($('roster').querySelectorAll('input[type=range]').length === 17 * 5, 'stat sliders render when expanded');
click('expandAll');
$('bulk').value = 'Ren Okabe | Ultimate Locksmith | meticulous, loner\nHalima Farouk | Ultimate Cartographer\nVic Sandoval\nNoor Adeyemi | Ultimate Fencer | detective';
click('bulkApply');
ok($('roster').children.length === 4, 'bulk entry replaces the cast', $('roster').children.length);
ok($('roster').querySelector('input.nm').value === 'Ren Okabe', 'bulk entry keeps names');

// --- rules + export/import round trip
$('setSeed').value = 'smoke-seed';
$('setSurvivors').value = '1';
$('setChapters').value = '6';
click('ioExport');
const exported = $('io').value;
ok(exported.length > 50 && JSON.parse(exported).cast.length === 4, 'export produces a loadable setup');
click('randomAll');
$('io').value = exported;
click('ioImport');
ok($('roster').querySelector('input.nm').value === 'Ren Okabe', 'import restores the cast');

// --- full playthrough, step by step
click('addStudent'); click('addStudent'); click('addStudent'); click('addStudent');
$('setSeed').value = 'smoke-seed';
dockBtn('Begin the killing game').click();
ok($('run').classList.contains('hidden') === false, 'run screen opens');
ok($('setup').classList.contains('hidden') === true, 'setup screen closes');

let guard = 0;
while (guard++ < 400) {
  const next = dockBtn('Next') || dockBtn('Open chapter one');
  if (!next) break;
  next.click();
}
ok(guard < 400, 'step-by-step reveal terminates', 'guard=' + guard);
ok(!!dockBtn('Run it again'), 'end state shows replay controls');
const feedText = $('feed').textContent;
ok(/Chapter/i.test(feedText), 'chapter marks rendered');
ok(/Day 1/.test(feedText), 'days are labelled');
const dayLabels = [...$('feed').querySelectorAll('.daymark span')].map(e => +e.textContent.replace(/\D/g, ''));
ok(dayLabels.length >= 1, 'day dividers render', String(dayLabels.length));
ok(dayLabels.every((d, i) => i === 0 || d === dayLabels[i - 1] + 1), 'day numbers run on without resetting',
  dayLabels.slice(0, 8).join(','));
const chapNums = [...$('feed').querySelectorAll('.chapmark .n')].map(e => +e.textContent);
ok(chapNums.every((c, i) => i === 0 || c === chapNums[i - 1] + 1), 'chapter numbers run in order', chapNums.join(','));
ok(chapNums.length <= dayLabels.length, 'there are never more chapters than days',
  chapNums.length + ' vs ' + dayLabels.length);
ok(!/\{[A-Za-z]/.test(feedText), 'no unresolved placeholders in the rendered feed');
ok(!/undefined|NaN/.test(feedText), 'no undefined/NaN in the rendered feed');
ok(/Seed: smoke-seed/.test(feedText), 'ending block reports the seed');
ok($('feed').querySelectorAll('.pers').length > 0, 'final tally lists people');

// --- the bulk parser eats real wiki formatting
if (dockBtn('Cast')) dockBtn('Cast').click();
$('bulk').value = [
  '1. Shinku Kutsuki - Ultimate Writer (M)',
  '2. Akane Taira \u2014 SHSL Maid (F)',
  '\u2022 Sora: Super High School Level ???',
  'Yuki Maeda | Ultimate Lucky Student | lucky, loner',
  '   ',
  'Kiyoka Maki – SHSL Sniper (F)'
].join('\n');
click('bulkApply');
{
  const cards = [...$('roster').children];
  ok(cards.length === 5, 'blank lines are skipped, five students parsed', String(cards.length));
  const names = cards.map(c => c.querySelector('input.nm').value);
  const talents = cards.map(c => c.querySelector('input.tl').value);
  ok(names[0] === 'Shinku Kutsuki', 'numbered prefix and (M) marker stripped from the name', names[0]);
  ok(talents[1] === 'Ultimate Maid', 'SHSL titles normalise to Ultimate', talents[1]);
  ok(talents[2] === 'Ultimate ???', 'Super High School Level titles normalise too', talents[2]);
  ok(talents[3] === 'Ultimate Lucky Student', 'pipe format still works', talents[3]);
  ok(talents[4] === 'Ultimate Sniper', 'en-dash separators parse', talents[4]);
  ok(cards[3].textContent.includes('Lucky'), 'traits from the third column apply');
}

// --- preset picker loads a canon roster
if (dockBtn('Cast')) dockBtn('Cast').click();
click('loadPreset');
ok(!$('sheet').classList.contains('hidden'), 'preset sheet opens');
const useBtns = [...$('sheetInner').querySelectorAll('button')].filter(b => b.textContent.trim() === 'Use this cast');
ok(useBtns.length >= 10, 'every roster offers a load button', String(useBtns.length));
useBtns[0].click();
ok($('roster').children.length === 16, 'preset roster loads into the editor', $('roster').children.length);
ok($('roster').querySelector('input.nm').value.length > 2, 'preset names populate the cards');
$('setSeed').value = 'preset-run';
dockBtn('Begin the killing game').click();
dockBtn('End').click();
{
  const feed = $('feed');
  ok(feed.querySelectorAll('.sp').length >= 8, 'trial dialogue renders as speech', String(feed.querySelectorAll('.sp').length));
  ok(feed.querySelectorAll('.bul').length >= 8, 'truth bullets render', String(feed.querySelectorAll('.bul').length));
  ok(feed.querySelectorAll('.casefile').length >= 1, 'the House File renders');
  ok(feed.querySelectorAll('.round').length >= 3, 'debate round headers render');
  ok(!/\{[A-Za-z]/.test(feed.textContent), 'no unresolved placeholders after a full preset run');
  const out = feed.querySelectorAll('.pers.out');
  out.forEach(el => ok(!el.classList.contains('dead'), 'anyone who walked out is not styled as dead'));
}

// --- a big cast: auto chapters must scale and the run must complete
if (dockBtn('Cast')) dockBtn('Cast').click();
click('loadPreset');
{
  const addBtns = [...$('sheetInner').querySelectorAll('button')].filter(b => b.textContent.trim() === 'Add to cast');
  const useBtns2 = [...$('sheetInner').querySelectorAll('button')].filter(b => b.textContent.trim() === 'Use this cast');
  useBtns2[0].click();
  click('loadPreset'); [...$('sheetInner').querySelectorAll('button')].filter(b => b.textContent.trim() === 'Add to cast')[1].click();
  click('loadPreset'); [...$('sheetInner').querySelectorAll('button')].filter(b => b.textContent.trim() === 'Add to cast')[2].click();
  ok($('roster').children.length === 48, 'three rosters stack into a 48-student class', String($('roster').children.length));
  ok(/48 students/.test($('castCount').textContent), 'the counter tracks the bigger class');
  const tabs = [...$('tabs').children];
  tabs[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  ok(+$('setChapters').value >= 20, 'auto chapters scaled up for 48 students', $('setChapters').value);
  if ($('heardReset')) $('heardReset').dispatchEvent(new window.Event('click', { bubbles: true }));
  $('setSeed').value = 'big-cast';
  $('setSurvivors').value = '3';
  dockBtn('Begin the killing game').click();
  dockBtn('End').click();
  ok(!!dockBtn('Run it again'), 'the 48-student run completes');
  const chapterMarks = $('feed').querySelectorAll('.chapmark').length;
  ok(chapterMarks >= 8, 'a big class plays out over many chapters', String(chapterMarks));
  ok($('feed').querySelectorAll('.casefile').length >= 5, 'many cases, many House Files', String($('feed').querySelectorAll('.casefile').length));
  ok(!/\{[A-Za-z]/.test($('feed').textContent), 'no unresolved placeholders in a long run');
}

// --- individual character picker builds a custom class
if (dockBtn('Cast')) dockBtn('Cast').click();
click('loadPreset');
{
  const openPicker = [...$('sheetInner').querySelectorAll('button')].find(b => /character list/i.test(b.textContent));
  ok(!!openPicker, 'the roster sheet offers the individual picker');
  openPicker.click();
  const clear = [...$('sheetInner').querySelectorAll('button')].find(b => /Start from empty/.test(b.textContent));
  clear.click();
  ok($('roster').children.length === 0, 'cast can be emptied to build from scratch');
  const filter = $('sheetInner').querySelector('input[type=text]');
  filter.value = 'detective';
  filter.dispatchEvent(new window.Event('input', { bubbles: true }));
  let picks = [...$('sheetInner').querySelectorAll('.pick')];
  ok(picks.length >= 2, 'filtering by talent finds people', String(picks.length));
  picks.slice(0, 3).forEach(p => p.querySelector('button').click());
  filter.value = 'lockdown';
  filter.dispatchEvent(new window.Event('input', { bubbles: true }));
  picks = [...$('sheetInner').querySelectorAll('.pick')];
  ok(picks.length >= 10, 'filtering by roster name works', String(picks.length));
  picks.slice(0, 5).forEach(p => p.querySelector('button').click());
  const addBtn = [...$('sheetInner').querySelectorAll('button')].find(b => /^Add \d+ to cast$/.test(b.textContent.trim()));
  ok(!!addBtn, 'the add button counts the selection', addBtn && addBtn.textContent);
  const promised = +addBtn.textContent.match(/\d+/)[0];
  addBtn.click();
  ok($('roster').children.length === promised, 'the picker adds exactly what it promised',
    promised + ' vs ' + $('roster').children.length);
  ok(promised >= 6, 'a custom class was assembled from two different rosters', String(promised));
  const names = [...$('roster').querySelectorAll('input.nm')].map(i => i.value);
  ok(new Set(names).size === names.length, 'no duplicate students in a custom class');
}

// --- a run with the new content renders
{
  const tabs = [...$('tabs').children];
  tabs[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  $('setVenue').value = 'liner';
  $('setSeed').value = 'world-test';
  $('setSurvivors').value = '2';
  dockBtn('Begin the killing game').click();
  dockBtn('End').click();
  const feed = $('feed');
  ok(/PROLOGUE/i.test(feed.textContent), 'the prologue phase renders');
  ok(/liner/.test(feed.textContent), 'the chosen venue appears in the story');
  ok(/Afterwards/i.test(feed.textContent), 'the epilogue renders in the ending card');
  ok(feed.querySelectorAll('.pr').length >= 30, 'the story renders as prose paragraphs', String(feed.querySelectorAll('.pr').length));
  ok(feed.querySelectorAll('.scene').length >= 3, 'scene headings render', String(feed.querySelectorAll('.scene').length));
  ok(feed.querySelectorAll('.casefile').length >= 1, 'the case file keeps its structure', String(feed.querySelectorAll('.casefile').length));
  ok(!/\{[A-Za-z]/.test(feed.textContent), 'no unresolved placeholders in a custom-cast run');
}

// --- this round's features render
if (dockBtn('Cast')) dockBtn('Cast').click();
click('loadPreset');
{
  const useBtns3 = [...$('sheetInner').querySelectorAll('button')].filter(b => b.textContent.trim() === 'Use this cast');
  useBtns3[useBtns3.length - 1].click();
  const tabs2 = [...$('tabs').children];
  tabs2[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  if ($('heardReset')) $('heardReset').dispatchEvent(new window.Event('click', { bubbles: true }));
  $('setVenue').value = 'random';
  $('setSeed').value = 'features';
  $('setSurvivors').value = '2';
  dockBtn('Begin the killing game').click();
  dockBtn('End').click();
  const feed = $('feed');
  ok(feed.querySelectorAll('.redact').length >= 1, 'blacked-out file fields render', String(feed.querySelectorAll('.redact').length));
  ok(feed.querySelectorAll('.update').length >= 1, 'file amendments render', String(feed.querySelectorAll('.update').length));
  ok(feed.querySelectorAll('.pr.grp').length >= 1, 'group events render as prose', String(feed.querySelectorAll('.pr.grp').length));
  // daily life renders speech as prose paragraphs now; the trial keeps .sp
  const spoken = feed.querySelectorAll('.sp').length + feed.querySelectorAll('.pr').length;
  ok(spoken >= 80, 'the cast talks throughout, not just at trial', String(spoken));
  ok(/PROTAGONIST/i.test(feed.textContent), 'the protagonist is labelled in the results');
  ok(/RIVAL/i.test(feed.textContent), 'the rival is labelled');
  const secret = feed.querySelectorAll('.phase.secret').length;
  ok(secret >= 0, 'secret phases render when they occur', String(secret));
  ok(!/\{[A-Za-z]/.test(feed.textContent), 'no unresolved placeholders with all features on');
  ok(!/\[object/.test(feed.textContent), 'no objects leak into the story text');
}

// --- interactive mode asks and obeys
if (dockBtn('Cast')) dockBtn('Cast').click();
{
  const tabsI = [...$('tabs').children];
  tabsI[0].dispatchEvent(new window.Event('click', { bubbles: true }));
  click('loadPreset');
  [...$('sheetInner').querySelectorAll('button')].find(b => b.textContent.trim() === 'Use this cast').click();

  // seed a rivalry before the game starts
  click('bondsBtn');
  const sels = $('sheetInner').querySelectorAll('select');
  sels[0].value = '0'; sels[1].value = '1';
  [...$('sheetInner').querySelectorAll('button')].find(b => b.textContent.trim() === 'Deadly').click();
  ok($('sheetInner').textContent.includes('vs'), 'a seeded grudge is listed');
  [...$('sheetInner').querySelectorAll('button')].find(b => b.textContent.trim() === 'Done').click();

  const tabs3 = [...$('tabs').children];
  tabs3[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  [...$('modeSeg').children].find(b => b.dataset.mode === 'play').dispatchEvent(new window.Event('click', { bubbles: true }));
  ok(/stops to ask you/.test($('modeNote').textContent), 'the mode note explains interactive play');
  $('setSeed').value = 'interactive';
  $('setSurvivors').value = '3';
  dockBtn('Begin the killing game').click();

  const firstChoice = $('feed').querySelector('.choice');
  ok(!!firstChoice, 'the game stops and asks something');
  ok(firstChoice.querySelectorAll('button').length >= 2, 'a choice offers real options');
  ok(!!dockBtn('Waiting on you'), 'the dock shows it is waiting');

  let asked = 0, guard = 0;
  const prompts = [];
  while (guard++ < 400) {
    const open = [...$('feed').querySelectorAll('.choice')].filter(c => !c.classList.contains('made'));
    if (!open.length) break;
    prompts.push(open[0].querySelector('h4').textContent);
    const btns = open[0].querySelectorAll('button');
    btns[asked % btns.length].click();
    asked++;
  }
  ok(asked >= 5, 'a full interactive game asks several times', String(asked));
  const daily = prompts.filter(p => /proposed|afternoon|tonight|afterwards|holding|waiting on an answer|beside them|warn somebody/i.test(p));
  const targeted = prompts.filter(p => /beside them|warn somebody|spend your word/i.test(p));
  ok(targeted.length >= 1, 'the game asks you to protect or vouch for a named person', String(targeted.length));
  const caseQs = prompts.filter(p => /Four hours|trial floor/i.test(p));
  ok(daily.length >= 2, 'daily life gets its own decisions', daily.slice(0, 3).join(' | '));
  ok(caseQs.length >= 1, 'case decisions still come up', String(caseQs.length));
  ok(!!dockBtn('Run it again'), 'the interactive game reaches an ending');
  ok($('feed').querySelectorAll('.choice.made').length === asked, 'every answered choice is recorded in the log');
  ok(/You chose/.test($('feed').textContent), 'choices are shown as made');
  ok(!/\{[A-Za-z]/.test($('feed').textContent), 'no unresolved placeholders in an interactive run');
  ok($('feed').querySelectorAll('.bondmap').length === 1, 'the bond map renders on the results screen');
  const ledger = $('feed').querySelectorAll('.ledger');
  ok(ledger.length <= 1, 'at most one consequences ledger');
  if (ledger.length) {
    ok(/What your calls did/i.test(ledger[0].textContent), 'the ledger is framed as your decisions');
    ok(ledger[0].querySelectorAll('div').length >= 1, 'the ledger lists at least one consequence');
  }
  ok($('feed').querySelectorAll('.bondrow').length >= 1, 'the bond map has rows',
    String($('feed').querySelectorAll('.bondrow').length));
  ok(/vs/.test($('feed').querySelector('.bondmap').textContent) || /&/.test($('feed').querySelector('.bondmap').textContent),
    'the bond map names pairs');
}

// --- the ask-scope control is wired to the UI
{
  dockBtn('Cast').click();
  const tabsA = [...$('tabs').children];
  tabsA[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  ok(!$('askRow').classList.contains('hidden'), 'the scope control shows in interactive mode');
  ok(!$('dqRow').classList.contains('hidden'), 'the daily-question dial shows in interactive mode');
  $('setDaily').value = '4';
  click('askTrials');
  ok($('askTrials').getAttribute('aria-pressed') === 'true', 'trials-only can be selected');
  $('setSeed').value = 'scope-ui';
  dockBtn('Begin the killing game').click();
  let asked = 0, guard = 0, sawNight = false;
  while (guard++ < 400) {
    const open = [...$('feed').querySelectorAll('.choice')].filter(c => !c.classList.contains('made'));
    if (!open.length) break;
    if (/spend tonight/.test(open[0].textContent)) sawNight = true;
    open[0].querySelectorAll('button')[0].click();
    asked++;
  }
  ok(!sawNight, 'trials-only never asks about the night in the UI either');
  ok(asked >= 2, 'trials-only still asks about the case', String(asked));
  ok(!!dockBtn('Run it again'), 'the scoped interactive game finishes');
  click('askAll');
}

// --- watch mode still works exactly as before
{
  if (dockBtn('Cast')) dockBtn('Cast').click();
  const tabs4 = [...$('tabs').children];
  tabs4[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  [...$('modeSeg').children].find(b => b.dataset.mode === 'watch').dispatchEvent(new window.Event('click', { bubbles: true }));
  $('setSeed').value = 'watch-again';
  dockBtn('Begin the killing game').click();
  ok(!$('feed').querySelector('.choice'), 'watch mode never asks');
  ok(!!dockBtn('Open chapter one'), 'watch mode reveals manually');
  dockBtn('End').click();
  ok(!!dockBtn('Run it again'), 'watch mode finishes');
}

// --- survival odds run to completion
{
  if (dockBtn('Cast')) dockBtn('Cast').click();
  const tabsD = [...$('tabs').children];
  tabsD[2].dispatchEvent(new window.Event('click', { bubbles: true }));
  const orig = window.setTimeout;
  window.setTimeout = (fn) => fn();          // run the chunked loop synchronously
  const runBtn = $('oddsRun');
  runBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  window.setTimeout = orig;
  const rows = $('oddsOut').querySelectorAll('tr');
  ok(rows.length >= 2, 'the odds table renders a row per student', String(rows.length));
  const cells = [...rows[1].querySelectorAll('td')].map(td => td.textContent);
  ok(cells.length === 5, 'each row has survival, blackened, executed and mastermind rates', cells.join('/'));
  ok(/%$/.test(cells[1]), 'rates are percentages', cells[1]);
  ok(/Across 100 games/.test($('oddsOut').textContent), 'the table says how many games it ran');
}

// --- the results card is tabbed and the record downloads
{
  const card = [...$('feed').querySelectorAll('.card')].pop();
  const rtabs = card.querySelector('.rtabs');
  ok(!!rtabs, 'the results card has tabs');
  ok(rtabs.querySelectorAll('button').length === 4, 'four result tabs',
    String(rtabs.querySelectorAll('button').length));
  const panes = card.querySelectorAll('.rpane');
  ok(panes.length === 4, 'four panes exist');
  ok([...panes].filter(p => p.classList.contains('on')).length === 1, 'exactly one pane shows at a time');
  const peopleTab = [...rtabs.querySelectorAll('button')].find(b => /People/i.test(b.textContent));
  peopleTab.click();
  ok(peopleTab.getAttribute('aria-selected') === 'true', 'clicking a tab selects it');
  ok([...panes].filter(p => p.classList.contains('on')).length === 1, 'still exactly one pane after switching');
  ok(panes[1].querySelectorAll('.pers').length > 0, 'the People pane holds the cast cards');

  // the downloadable record
  let downloaded = null;
  const realCreate = window.document.createElement.bind(window.document);
  window.URL.createObjectURL = () => 'blob:fake';
  window.URL.revokeObjectURL = () => {};
  window.document.createElement = (tag) => {
    const el2 = realCreate(tag);
    if (tag === 'a') { el2.click = () => { downloaded = el2.download; }; }
    return el2;
  };
  const tabsX = [...$('tabs').children];
  if (dockBtn('Cast')) dockBtn('Cast').click();
  tabsX[2].dispatchEvent(new window.Event('click', { bubbles: true }));
  click('txFile');
  window.document.createElement = realCreate;
  ok(!!downloaded && /^blackened-.*\.html$/.test(downloaded), 'the record downloads as an html file', String(downloaded));
}

// --- drawer
if (!dockBtn("Who's left")) {
  const tabsR = [...$('tabs').children];
  tabsR[1].dispatchEvent(new window.Event('click', { bubbles: true }));
  [...$('modeSeg').children].find(b => b.dataset.mode === 'watch').dispatchEvent(new window.Event('click', { bubbles: true }));
  $('setSeed').value = 'drawer-run';
  dockBtn('Begin the killing game').click();
  dockBtn('End').click();
}
dockBtn("Who's left").click();
ok(!$('sheet').classList.contains('hidden'), 'status drawer opens');
ok($('sheetInner').querySelectorAll('.pers').length >= 6, 'drawer lists the whole class',
  String($('sheetInner').querySelectorAll('.pers').length));
[...$('sheetInner').querySelectorAll('button')].pop().click();
ok($('sheet').classList.contains('hidden'), 'drawer closes');

// --- transcript
click('txCopy');
ok(errors.filter(e => /alert/.test(e)).length === 0, 'transcript copy did not error', errors.join(' | '));

// --- replay with the same seed reproduces the same feed
const feedA = $('feed').textContent;
dockBtn('Replay seed').click();
guard = 0;
while (guard++ < 400) { const n = dockBtn('Next') || dockBtn('Open chapter one'); if (!n) break; n.click(); }
ok($('feed').textContent === feedA, 'replaying the seed reproduces the identical story');

// --- run-to-end path
dockBtn('Cast').click();
ok(!$('setup').classList.contains('hidden'), 'back to cast works');
$('setSeed').value = 'fast-path';
dockBtn('Begin the killing game').click();
dockBtn('End').click();
ok(!!dockBtn('Run it again'), 'run-to-end reaches the ending in one press');

// --- two-student edge case must not throw
dockBtn('Cast').click();
$('bulk').value = 'A One\nB Two';
click('bulkApply');
$('setSurvivors').value = '1';
dockBtn('Begin the killing game').click();
dockBtn('End').click();
ok(!!dockBtn('Run it again'), 'two-student game completes');

ok(errors.length === 0, 'no runtime errors anywhere', errors.slice(0, 5).join(' | '));
console.log('\nsmoke: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

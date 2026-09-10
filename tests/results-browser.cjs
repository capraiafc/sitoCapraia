// Local UI smoke test. All remote requests are blocked; Supabase is replaced
// with fixture data in the test browser. No real matches or emails are changed.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

(async () => {
  const workspace = path.resolve(__dirname, '..');
  const { romeLocalToIso } = await import(pathToFileURL(path.join(workspace, 'data/calendar-logic.js')));
  const sql = fs.readFileSync(path.join(workspace, 'supabase/migrations/202609100034_seed_calendar_2026_27.sql'), 'utf8');
  const fixtures = JSON.parse(sql.split('$fixtures$')[1]).map((row, index) => ({ ...row, id: String(index), published: true, status: 'scheduled', kickoff_at: romeLocalToIso(row.local_kickoff.replace(' ', 'T')), home_score: null, away_score: null }));
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/__admin-test') {
      const admin = fs.readFileSync(path.join(workspace, 'admin.html'), 'utf8');
      const section = admin.match(/<section id="gare"[\s\S]*?<\/section>/)[0];
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><html lang="it"><head><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/admin.css"></head><body>${section}<script type="module" src="/admin/matches.js"></script></body></html>`);
      return;
    }
    const target = path.resolve(workspace, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(workspace + path.sep)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream'); res.end(fs.readFileSync(target)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (url.pathname === '/auth.js') return route.fulfill({ contentType: 'application/javascript', body: `
        window.__fixtures = ${JSON.stringify(fixtures)};
        window.__writes = [];
        window.CapraiaAuth = { requireOperator: async()=>({isOperator:true, permissions:{can_matches:!location.search.includes('denied')}}), getCurrentAccess:async()=>({isOperator:false}), supabase: {
          from(table) { const query = { select(){return this},eq(){return this},order(){return this},limit(){return this},range(){return this},
            update(payload){window.__writes.push({type:'update',payload});return this}, insert(payload){window.__writes.push({type:'insert',payload});return this},
            then(resolve){return Promise.resolve({data:table==='matches'?window.__fixtures:[],error:null}).then(resolve)} }; return query }
        }};` });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-09-10T12:00:00Z'));
    await page.goto(`http://127.0.0.1:${server.address().port}/#partite`);
    await page.locator('.results-row').first().waitFor();
    assert.equal(await page.locator('.results-row').count(), 32);
    assert.match(await page.locator('.results-feature--next').innerText(), /San Miniato/);
    assert.match(await page.locator('.results-feature--last').innerText(), /Non ci sono ancora risultati/);
    await page.selectOption('[data-results-competition]', 'Coppa Toscana · Prima Categoria');
    assert.equal(await page.locator('.results-row').count(), 2);
    await page.click('[data-results-reset]');
    await page.selectOption('[data-results-month]', '2026-10');
    assert.equal(await page.locator('.results-row').count(), 4);
    await page.click('[data-results-view="detailed"]');
    assert.equal(await page.locator('.results-row-detail').first().isVisible(), true);
    await page.click('[data-results-reset]');
    const destination = path.join(workspace, 'test-artifacts');
    fs.mkdirSync(destination, { recursive: true });
    await page.locator('#partite').screenshot({ path: path.join(destination, 'results-desktop.png') });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.locator('#partite').evaluate((el) => el.scrollWidth <= el.clientWidth), true, `No results overflow at ${width}px`);
      await page.locator('#partite').screenshot({ path: path.join(destination, `results-mobile-${width}.png`) });
    }
    // Saved result advances both featured cards on a refresh; no DB call is made.
    await page.clock.setFixedTime(new Date('2026-09-14T12:00:00Z'));
    await page.evaluate(async () => {
      const match = window.__fixtures.find((row) => row.legacy_key === '2026-27:cup:group14:2');
      match.status = 'completed'; match.home_score = 1; match.away_score = 2;
      const { refreshResults } = await import('/results-data.js?v=20260910');
      await refreshResults();
    });
    assert.match(await page.locator('.results-feature--last').innerText(), /San Miniato/);
    assert.match(await page.locator('.results-feature--next').innerText(), /Isolotto/);
    assert.deepEqual(errors, [], 'No browser script errors');
    console.log('UI PASS: 32 fixtures, filters, details, mobile 390/320, automatic Last/Next, no script errors.');
    await page.goto(`http://127.0.0.1:${server.address().port}/__admin-test`);
    await page.locator('[data-match-id]').first().waitFor();
    await page.click('[data-collection-add]');
    const form = page.locator('[data-match-form]');
    for (const [name, value] of Object.entries({match_day:'Semifinale', home_team:'Capraia', away_team:'Squadra test', competition:'Coppa Toscana', kickoff_at:'2026-10-25T14:30', home_score:'0', away_score:'0', home_penalties:'4', away_penalties:'5'})) {
      await form.locator(`[name="${name}"]`).fill(value);
    }
    await form.locator('[name="status"]').selectOption('completed');
    await form.locator('[type="submit"]').click();
    await page.waitForFunction(() => window.__writes.length === 1);
    const saved = await page.evaluate(() => window.__writes[0]);
    assert.equal(saved.type, 'insert');
    assert.equal(saved.payload.kickoff_at, '2026-10-25T13:30:00.000Z');
    assert.equal(saved.payload.home_penalties, 4);
    await page.locator('[data-collection-search]').fill('Novoli');
    await page.locator('[data-action="edit"]').first().click();
    assert.equal(await form.locator('[name="home_logo"]').inputValue(), 'assets/teams/novoli.png');
    await form.locator('[type="submit"]').click();
    await page.waitForFunction(() => window.__writes.length === 2);
    assert.equal(await page.evaluate(() => window.__writes[1].payload.extra_info.home_logo), 'assets/teams/novoli.png');
    await page.goto(`http://127.0.0.1:${server.address().port}/__admin-test?denied`);
    await page.waitForFunction(() => document.querySelector('[data-match-management]').hidden);
    console.log('ADMIN PASS: cup insertion, penalties, Europe/Rome conversion, logo preserved on edit, permission UI gate.');
  } finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

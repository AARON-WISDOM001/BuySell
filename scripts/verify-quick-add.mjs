// Zero-dependency Quick Add verification against a real Chrome over CDP.
// Node >= 22 supplies a global WebSocket, so this needs nothing installed.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'https://buysell-sigma.vercel.app';
const PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

const profile = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browserWs() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch { await sleep(100); }
  }
  throw new Error('Chrome did not expose a debugging port');
}

const ws = new WebSocket(await browserWs());
await new Promise((r) => { ws.onopen = r; });

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (!msg.id || !pending.has(msg.id)) return;
  const { resolve, reject } = pending.get(msg.id);
  pending.delete(msg.id);
  if (msg.error) reject(new Error(JSON.stringify(msg.error)));
  else resolve(msg.result);
};
// Every CDP call is bounded: an input method that never acknowledges would
// otherwise hang the whole run with no output at all.
const withTimeout = (promise, label, ms = 15000) =>
  Promise.race([
    promise,
    sleep(ms).then(() => { throw new Error(`CDP timeout: ${label}`); }),
  ]);

const send = (method, params = {}, sessionId, ms = 15000) =>
  withTimeout(new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  }), method, ms);

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);

async function go(url) {
  // A cold edge can take well over the default budget to commit a navigation,
  // because the response waits on the document's scripts.
  await send('Page.navigate', { url }, sessionId, 60000);
  await sleep(2500);
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  }, sessionId);
  if (r.exceptionDetails) {
    const why = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text;
    throw new Error(`${why.split('\n')[0]} :: ${expression.slice(0, 90)}`);
  }
  return r.result.value;
}
// A genuine click at real coordinates: proves hit-testing and that nothing
// intercepts the press, which element.click() would not catch.
async function realClick(selector) {
  // `behavior: instant` matters: with smooth scrolling the rect measured right
  // after scrollIntoView is stale, and the press lands somewhere else entirely.
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center', behavior:'instant'})`);
  await sleep(400);
  const pt = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width/2, y = r.y + r.height/2;
    const hit = document.elementFromPoint(x, y);
    // A disabled control carries pointer-events: none on purpose, so it can
    // never be the hit target. Expect its wrapper instead of a real miss.
    const inert = getComputedStyle(el).pointerEvents === 'none';
    return {
      x, y, w: r.width, h: r.height, inert,
      onTarget: hit === el || el.contains(hit) || (inert && el.parentElement.contains(hit)),
      hitTag: hit ? hit.tagName : 'none',
    };
  })()`);
  if (!pt) throw new Error(`no element for ${selector}`);
  if (!pt.onTarget) throw new Error(`${selector} is covered by ${pt.hitTag} at (${pt.x},${pt.y})`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', {
      type, x: pt.x, y: pt.y, button: 'left', clickCount: 1,
    }, sessionId);
  }
  await sleep(500);
  return pt;
}
// Enter only activates a button when it is delivered as a real key press.
// A bare rawKeyDown produces no click, so this sends the full keyDown/text
// sequence Chrome needs to synthesise activation.
async function key(k) {
  const spec = k === 'Enter'
    ? { windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' }
    : { windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, ...spec }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, ...spec }, sessionId);
  await sleep(500);
}

// Chrome does not apply a viewport override to the already-loaded document,
// so media queries have to be re-evaluated by navigating after the switch.
async function setViewport({ width, height, mobile }) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: mobile ? 3 : 1, mobile,
  }, sessionId);
  await send('Emulation.setTouchEmulationEnabled', {
    enabled: mobile, maxTouchPoints: mobile ? 5 : 1,
  }, sessionId);
  await sleep(200);
}

// Waits until the page is genuinely interactive before anything is clicked.
//
// Nothing in this app marks hydration: the cart count renders the same on the
// server and the client, so an early click lands on a real button with no
// handler attached and silently does nothing. Seeding a cart before the app's
// scripts run makes hydration observable -- when the badge shows the seeded
// count, the client has rendered from localStorage and React is live.
async function waitForHydration() {
  const SEED = [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 7 }];

  // One load to establish the origin, seed, then reload so the app boots with
  // the cart already in storage.
  await go(BASE + '/');
  await evaluate(`localStorage.setItem('buysell.cart.v1', ${JSON.stringify(JSON.stringify(SEED))})`);
  await go(BASE + '/');

  let hydrated = false;
  for (let i = 0; i < 60; i++) {
    const label = await evaluate(`document.querySelector('a[aria-label^="Cart"]')?.getAttribute('aria-label') ?? ''`);
    if (/,\s*7\s+items/.test(label)) { hydrated = true; break; }
    await sleep(500);
  }

  // Drop the seed. The synthetic storage event is what tells the running app
  // to re-read, otherwise the store keeps serving its cached copy.
  await evaluate(`(() => {
    localStorage.removeItem('buysell.cart.v1');
    window.dispatchEvent(new StorageEvent('storage', { key: 'buysell.cart.v1' }));
    return true;
  })()`);
  await sleep(300);
  return hydrated;
}

// Polls a predicate instead of sleeping a fixed amount. The cart page resolves
// product data after the document loads, so a fixed wait asserts against a
// half-rendered page on a slow edge.
async function waitFor(expression, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(400);
  }
  return false;
}

const ADD = 'button[aria-label="Add Ceramic Mug to cart"]';
const CART = () => evaluate(`document.querySelector('a[aria-label^="Cart"]')?.getAttribute('aria-label')`);
const CART_N = async () => Number((await CART()).match(/(\d+)/)?.[1] ?? 0);
const LINES = () => evaluate(`JSON.parse(localStorage.getItem('buysell.cart.v1')||'[]')`);
const HREF = () => evaluate('location.pathname + location.search');
const STATUS = () => evaluate(`(() => {
  for (const p of document.querySelectorAll('[role=status][aria-live=polite]'))
    if (/added to cart/i.test(p.textContent||'')) return p.textContent.trim();
  return '';
})()`);

try {
  console.log(`\nVerifying Quick Add against ${BASE}\n`);
  console.log('hydration');
  const hydrated = await waitForHydration();
  ok('page becomes interactive before any click', hydrated, 'seeded cart never reached the badge');
  ok('cart starts empty', (await CART_N()) === 0, `got ${await CART()}`);
  ok('no stored lines', (await LINES()).length === 0, JSON.stringify(await LINES()));

  console.log('\npointer reveal (desktop hover)');
  ok('product card controls are present', await waitFor(`!!document.querySelector(${JSON.stringify(ADD)})`), 'no Quick Add button rendered');
  const restOpacity = await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(ADD)}).parentElement).opacity`);
  ok('hidden at rest on pointer device', restOpacity === '0', `opacity=${restOpacity}`);
  const box = await evaluate(`(() => { const a=document.querySelector(${JSON.stringify(ADD)}); a.scrollIntoView({block:'center'}); const r=a.closest('article').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y }, sessionId);
  await sleep(500);
  const hoverOpacity = await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(ADD)}).parentElement).opacity`);
  ok('revealed on hover', hoverOpacity === '1', `opacity=${hoverOpacity}`);

  console.log('\nsingle click');
  const before = await HREF();
  await realClick(ADD);
  ok('still on the shop page (no navigation)', (await HREF()) === before, `${before} -> ${await HREF()}`);
  ok('badge reads 1 item', (await CART_N()) === 1, `got ${await CART()}`);
  let lines = await LINES();
  ok('exactly one line, quantity 1', lines.length === 1 && lines[0].quantity === 1, JSON.stringify(lines));
  ok('button confirms "Added"', (await evaluate(`document.querySelector(${JSON.stringify(ADD)})?.textContent.trim()`)) === 'Added', await evaluate(`document.querySelector(${JSON.stringify(ADD)})?.textContent.trim()`));
  ok('accessible name is unchanged by the state', (await evaluate(`document.querySelector(${JSON.stringify(ADD)})?.getAttribute('aria-label')`)) === 'Add Ceramic Mug to cart');
  ok('status announces the product', /Ceramic Mug added to cart/.test(await STATUS()), await STATUS());

  console.log('\nsecond click adds exactly one more');
  await realClick(ADD);
  lines = await LINES();
  ok('badge reads 2 items', (await CART_N()) === 2, `got ${await CART()}`);
  ok('quantity is 2, one per click', lines[0].quantity === 2, JSON.stringify(lines));

  console.log('\nkeyboard');
  const qtyBeforeKey = (await LINES())[0].quantity;
  await evaluate(`document.querySelector(${JSON.stringify(ADD)}).focus()`);
  await key('Enter');
  const qtyAfterKey = (await LINES())[0].quantity;
  ok('Enter adds exactly one to the existing line', qtyAfterKey === qtyBeforeKey + 1, `${qtyBeforeKey} -> ${qtyAfterKey}`);
  const focusOpacity = await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(ADD)}).parentElement).opacity`);
  ok('revealed when focused (not hover-only)', focusOpacity === '1', `opacity=${focusOpacity}`);

  console.log('\nsold-out product');
  const soldOut = 'button[aria-label="Insulated Flask is out of stock"]';
  ok('sold-out control is disabled', await evaluate(`document.querySelector(${JSON.stringify(soldOut)})?.disabled === true`));
  ok('sold-out control is named for stock, not for adding', await evaluate(`!!document.querySelector(${JSON.stringify(soldOut)})`));
  await evaluate(`document.querySelector(${JSON.stringify(soldOut)}).click()`);
  await sleep(300);
  ok('sold-out product is not added', (await LINES()).length === 1, JSON.stringify(await LINES()));

  console.log('\ncart page reflects the same lines');
  await go(BASE + '/cart');
  // Settle first: either the line rendered, or the page settled on its empty
  // state. Asserting before that would read a not-yet-populated cart as a
  // missing line.
  await waitFor(`!!document.querySelector('[role="group"][aria-label="Quantity"] > span[aria-live="polite"]') || /Your cart is empty/.test(document.body.innerText)`);
  ok('cart lists the product', /Ceramic Mug/.test(await evaluate(`document.body.innerText`)));
  // Read the stepper's own value instead of grepping the page for a digit:
  // a bare /3/ also matches prices and totals, which is how a wrong
  // quantity slips through unnoticed.
  const shownQty = await evaluate(`(() => {
    // The value lives in the group's own aria-live span, whose text is the
    // number followed by an sr-only " quantity" suffix.
    const v = document.querySelector('[role="group"][aria-label="Quantity"] > span[aria-live="polite"]');
    if (!v) return 'no value span';
    const n = parseInt(v.textContent.trim(), 10);
    return Number.isNaN(n) ? 'unparseable: ' + v.textContent.trim() : String(n);
  })()`);
  const expectedQty = String((await LINES())[0].quantity);
  ok('cart shows the same quantity as storage', shownQty === expectedQty, `stepper="${shownQty}" storage="${expectedQty}"`);

  console.log('\nresult count live region');
  await go(BASE + '/?category=drinkware');
  const count = await evaluate(`(() => { for (const p of document.querySelectorAll('p[aria-live=polite]')) if (/^\\d+ products?$/.test(p.textContent.trim())) return p.textContent.trim()+' role='+p.getAttribute('role'); return 'none'; })()`);
  ok('count is a polite status region', /role=status/.test(count), count);

  // A touch device has no hover to reveal the control, so the sm: breakpoint
  // hiding must not apply below it.
  console.log('\nmobile (390x844, touch enabled)');
  await setViewport({ width: 390, height: 844, mobile: true });
  ok('mobile page becomes interactive too', await waitForHydration(), 'seeded cart never reached the badge');
  ok('cart starts empty on mobile', (await LINES()).length === 0, JSON.stringify(await LINES()));

  const mobileOpacity = await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(ADD)}).parentElement).opacity`);
  ok('visible at rest without hover', mobileOpacity === '1', `opacity=${mobileOpacity}`);

  const size = await realClick(ADD);
  ok('touch target clears the 24px AA minimum', size.h >= 24 && size.w >= 24, `${Math.round(size.w)}x${Math.round(size.h)}`);
  console.log(`        target is ${Math.round(size.w)}x${Math.round(size.h)}px`);
  ok('press adds exactly one', (await LINES())[0]?.quantity === 1, JSON.stringify(await LINES()));
  ok('badge follows the press', (await CART_N()) === 1, `got ${await CART()}`);
  ok('still on the shop page', (await HREF()) === '/', await HREF());

  console.log('\nmobile sold-out');
  const mobileSoldOut = 'button[aria-label="Insulated Flask is out of stock"]';
  ok('sold-out control still disabled', await evaluate(`document.querySelector(${JSON.stringify(mobileSoldOut)})?.disabled === true`));
  await realClick(mobileSoldOut);
  ok('sold-out press changes nothing', (await LINES()).length === 1, JSON.stringify(await LINES()));
} catch (err) {
  fail++;
  console.log(`\n  ERROR ${err.message}`);
} finally {
  ws.close();
  chrome.kill();
  // Chrome may still be flushing its profile; cleanup is best-effort.
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch { /* ignore */ }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
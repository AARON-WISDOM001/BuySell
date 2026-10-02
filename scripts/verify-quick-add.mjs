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
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);

async function go(url) {
  await send('Page.navigate', { url }, sessionId);
  await sleep(2500);
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expression.slice(0, 80));
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
    return {
      x, y,
      onTarget: hit === el || el.contains(hit),
      hitTag: hit ? hit.tagName + (hit.className ? '.' + String(hit.className).split(' ')[0] : '') : 'none',
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
  await go(BASE + '/');

  console.log('cart starts empty');
  ok('cart renders with 0 items', (await CART_N()) === 0, `got ${await CART()}`);
  ok('no stored lines', (await LINES()).length === 0);

  console.log('\npointer reveal (desktop hover)');
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
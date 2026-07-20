// e2e.mjs — 驱动本机 Chrome 验证游戏核心流程（AI 状态机 + 胜负判定）
// 前置：静态服务器已启动（python -m http.server 8000）
// 运行：node test/e2e.mjs
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function assert(name, cond, extra = '') {
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => assert('无页面 JS 异常', false, String(e.message).slice(0, 120)));

// ── Case A：躲藏 → 巡逻 → 发现 → 追捕 → 抓捕 → 失败 ──
await page.goto(`${BASE}/?play&fast`, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction('window.__game && window.__game.state === "hide"', { timeout: 15000 });

// 躲藏阶段：同伴应散开移动（scatter 生效）
const hPos1 = await page.evaluate(() => window.__game.hiders.list.map((h) => [h.pos.x, h.pos.z]));
await sleep(1500);
const hPos2 = await page.evaluate(() => window.__game.hiders.list.map((h) => [h.pos.x, h.pos.z]));
assert(
  'A: 同伴在躲藏阶段散开移动',
  hPos1.some((p, i) => Math.hypot(p[0] - hPos2[i][0], p[1] - hPos2[i][1]) > 0.3),
);

// 3 秒躲藏结束 → play，寻找者激活
await page.waitForFunction('window.__game.state === "play"', { timeout: 10000 });
const st0 = await page.evaluate(() => window.__game.seeker.state);
assert('A: 寻找者激活进入巡逻', st0 === 'patrol', st0);

const sPos1 = await page.evaluate(() => [window.__game.seeker.pos.x, window.__game.seeker.pos.z]);
await sleep(2500);
const sPos2 = await page.evaluate(() => [window.__game.seeker.pos.x, window.__game.seeker.pos.z]);
const sMoved = Math.hypot(sPos1[0] - sPos2[0], sPos1[1] - sPos2[1]);
assert('A: 寻找者沿路径巡逻移动', sMoved > 1, `${sMoved.toFixed(1)}m`);

// 把玩家挪到寻找者正前方 4m，必被发现
await page.evaluate(() => {
  const g = window.__game;
  const fx = -Math.sin(g.seeker.heading), fz = -Math.cos(g.seeker.heading);
  g.player.pos.x = g.seeker.pos.x + fx * 4;
  g.player.pos.z = g.seeker.pos.z + fz * 4;
});
const seen = await page
  .waitForFunction(
    '["suspicious","chase"].includes(window.__game.seeker.state) || window.__game.state === "lost"',
    { timeout: 10000 },
  )
  .then(() => true)
  .catch(() => false);
assert('A: 玩家进入视野 → 警觉/追捕', seen);

await page.waitForFunction('window.__game.state === "lost"', { timeout: 15000 });
assert('A: 抓捕成功 → 失败结算', true);
await page.screenshot({ path: 'shot_e2e_lost.png' });

// ── Case B：存活倒计时结束 → 胜利 ──
await page.goto(`${BASE}/?play&fast`, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction('window.__game && window.__game.state === "play"', { timeout: 15000 });
await page.evaluate(() => { window.__game.timer = 1; });
await page.waitForFunction('window.__game.state === "won"', { timeout: 10000 });
assert('B: 存活倒计时结束 → 胜利结算', true);

await browser.close();
console.log(failures === 0 ? '\n全部断言通过 ✅' : `\n${failures} 项失败 ❌`);
process.exit(failures === 0 ? 0 : 1);

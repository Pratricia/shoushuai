/* ============================================================
   渲染 · 对战 HUD(上下半屏 1v1)
   ------------------------------------------------------------
   顶栏同时交代双方战况:我方粮草/帅血 · 波次 · 对方流派名与粮草/
   帅血/武装(「械4符2」= 对方随段位带了多少军械与兵符)· 暂停倍速;
   下半屏底栏多一枚「派水军」按钮(花粮越河偷袭)。敌方流派名与武装
   读数让玩家一眼读出「这家偏兵海、牌面还厚」。
   帅血仍由 drawShuai 画在各自帅位下方(两座帅台对称)。
   ============================================================ */
import { ctx, rr, setFont } from '../canvas';
import { INK, DUEL, BAG_BTN } from '../config';
import { state, duel } from '../state';
import { duelRankState } from '../save';
import { levelCn, winsToPromote } from '../data/ranks';
import { drawPauseBtn, drawSpeedBtn } from './hud';

/** 顶栏双方战况:我方粮草/帅血 · 波次 · 敌方流派/粮草/帅血 · 暂停倍速 */
export function drawDuelHud(): void {
  const p = duel.player, r = duel.rival;
  ctx.fillStyle = '#e4d9bf';
  ctx.fillRect(0, 0, 720, 52);
  ctx.fillStyle = '#2e2416';
  ctx.fillRect(0, 52, 720, 4);
  ctx.fillStyle = 'rgba(184,144,62,0.55)';
  ctx.fillRect(0, 56, 720, 1.5);

  // 我方:粮草 + 帅血
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  setFont(22, true);
  ctx.fillStyle = '#6d4c41';
  ctx.fillText('我粮 ' + Math.floor(p.gold), 14, 18);
  setFont(17, false);
  ctx.fillStyle = '#d64530';
  ctx.fillText('❤'.repeat(Math.min(20, Math.max(0, p.hearts))), 14, 40);

  // 中:波次(「第N波」占位窄,给右侧敌方武装读数留出空档)
  ctx.textAlign = 'center';
  setFont(20, true);
  ctx.fillStyle = INK;
  const wave = p.waveIdx < 0 ? 1 : p.waveIdx + 1;
  const cd = p.interWave > 0 ? ' · ' + Math.ceil(p.interWave) + 's' : '';
  ctx.fillText('第' + wave + '波' + cd, 348, 27);

  // 右:敌方流派 + 粮草/帅血/武装(避开暂停/倍速键)
  ctx.textAlign = 'right';
  setFont(17, true);
  ctx.fillStyle = '#7a4a8a';
  ctx.fillText('敌 · ' + duel.ai.preset.name, 604, 17);
  setFont(18, true);
  ctx.fillStyle = '#a93226';
  const gears = duel.ai.loadout.passive.length + duel.ai.loadout.active.length;
  ctx.fillText('粮' + Math.floor(r.gold) + ' ❤' + Math.max(0, r.hearts)
    + ' · 械' + gears + '符' + duel.ai.loadout.fu.length, 604, 39);

  // 右上角:暂停 / 倍速(与战役顶栏同一套键,只是顶栏矮 4px 故半径小 3)
  drawPauseBtn(652, 26, 19, { id: 'pause', x: 631, y: 3, w: 42, h: 46 });
  drawSpeedBtn(700, 26, 19, { id: 'speed', x: 679, y: 3, w: 42, h: 46 });

  drawBoatButton();
}

/** 「派水军」按钮:夹在背包与垦荒令之间的一行(花粮越河偷袭) */
function drawBoatButton(): void {
  const p = duel.player;
  const x = BAG_BTN.x + 2 * (BAG_BTN.w + BAG_BTN.gap) + 10, y = BAG_BTN.y, w = 150, h = BAG_BTN.h;
  const ok = p.gold >= DUEL.boatCost;
  ctx.globalAlpha = ok ? 1 : 0.55;
  rr(x, y, w, h, 12);
  ctx.fillStyle = '#1f6a7a';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#14505c';
  ctx.stroke();
  ctx.fillStyle = '#eaf6fa';
  setFont(26, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('派水军', x + w / 2, y + 26);
  setFont(16, false);
  ctx.fillStyle = '#bfe3ec';
  ctx.fillText('粮 ' + DUEL.boatCost + ' · 越河偷袭', x + w / 2, y + 52);
  ctx.globalAlpha = 1;
  state.uiButtons.push({ id: 'duelBoat', x, y, w, h });
  drawRankChip(x + w + 8, y, 120, h);
}

/** 段位徽记:名号 + 等级 + 升段进度条(局外荣誉,结算页同源) */
function drawRankChip(x: number, y: number, w: number, h: number): void {
  const rk = duelRankState();
  rr(x, y, w, h, 12);
  ctx.fillStyle = '#2a2216';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#b8903e';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  setFont(17, true);
  ctx.fillStyle = '#e8d59a';
  ctx.fillText(rk.name + ' · ' + levelCn(rk.level), x + w / 2, y + 18);

  // 升段进度条:level/cap(封顶段恒满)
  const bw = w - 28, bx = x + 14, by = y + 34;
  rr(bx, by, bw, 8, 4);
  ctx.fillStyle = 'rgba(232,213,154,0.18)';
  ctx.fill();
  const frac = rk.atTop ? 1 : Math.min(1, rk.level / rk.cap);
  rr(bx, by, Math.max(4, bw * frac), 8, 4);
  ctx.fillStyle = '#c9a227';
  ctx.fill();

  setFont(12, false);
  ctx.fillStyle = '#c0b083';
  const left = winsToPromote(rk.tier, rk.level);
  const note = rk.atTop ? '已至最高段位' : (left <= 1 ? '再胜一场升段' : '还 ' + left + ' 场升段');
  ctx.fillText(note, x + w / 2, y + 56);
}

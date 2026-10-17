/* ============================================================
   渲染 · HUD:帅与帅血、兵营、征兵按钮、顶栏、倍速/重开、出怪口
   ============================================================ */
import { ctx, rr, setFont } from '../canvas';
import { TAU, PAPER, INK, BARRACKS, DRAFT_BTN, RECYCLE_BTN, KEN_BTN, BAG_BTN, sellValue } from '../config';
import { state, slotCenter, boardGear } from '../state';
import { draftCost } from '../systems/economy';
import { endlessWaveInfo } from '../systems/waves';
import { LEVELS } from '../data/levels';
import { GEAR, gearOf } from '../data/shop';
import { carriesGear } from '../save';
import { drawPiece, drawKenToken, discBase } from './units';
import { clamp } from '../systems/geometry';
import { pointer } from '../input';
import type { WaveGroup, UIButton } from '../types';

function waveText(groups: WaveGroup[]): string {
  return groups.map(g => g.t + '×' + g.n).join(' ');
}

/* ---------- 顶栏圆形图标键(战役 / 对战两套顶栏共用) ----------
   两套顶栏高度不同(战役 56px、对战 52px),故圆心与半径由调用方给;
   字形按半径等比推出(条宽 r/4、条高 r−5、字号 r−2),两处都复现原先的手写坐标。
   唯一差别:倍速读数一律居中(对战那处原先受顶栏文字右对齐影响,读数略偏左)。 */

/** 暂停键:圆底 + 双竖条 */
export function drawPauseBtn(cx: number, cy: number, r: number, hit: UIButton): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = PAPER; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.fillStyle = INK;
  const bw = Math.floor(r / 4), bh = r - 5, by = Math.round(cy - bh / 2);
  ctx.fillRect(cx - bw - 2, by, bw, bh);
  ctx.fillRect(cx + 2, by, bw, bh);
  state.uiButtons.push(hit);
}

/** 倍速键:同底 + 当前倍速读数 */
export function drawSpeedBtn(cx: number, cy: number, r: number, hit: UIButton): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = PAPER; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  setFont(r - 2, true);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';                       // 顶栏其余文字会改对齐,这里显式复位
  ctx.fillText('×' + state.speed, cx, cy + 1);
  state.uiButtons.push(hit);
}

/** 帅(路径终点,大棋子坐镇朱漆帅台之上)+ 帅血(居中于帅下方) */
export function drawShuai(): void {
  const s = state.map.shuai;
  // 军械·中军大纛:帅旁光环——地面光晕先铺,棋子/敌军压在圈上面(不遮任何东西)
  const da = boardGear('da') ? gearOf('da')?.fx : undefined;
  if (da?.auraR && da.auraRate) {
    const g = ctx.createRadialGradient(s.x, s.y, da.auraR * 0.3, s.x, s.y, da.auraR);
    g.addColorStop(0, 'rgba(249,168,37,0.13)');
    g.addColorStop(1, 'rgba(249,168,37,0)');
    ctx.beginPath();
    ctx.arc(s.x, s.y, da.auraR, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.setLineDash([12, 9]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(201,162,39,0.45)';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 大棋子本体(圆形木面棋子:金刻环)
  discBase(s.x, s.y, 44, '#b8860b', 3.5);
  // 内环描红(帅的双环贵气)
  ctx.beginPath();
  ctx.arc(s.x, s.y, 37, 0, TAU);
  ctx.strokeStyle = 'rgba(165,48,31,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#a5301f';
  setFont(46, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('帅', s.x, s.y + 2);
  // 军械·背水一战:帅血告急时帅身红环脉动(状态一眼可见,不靠飘字猜)
  const bei = boardGear('bei') ? gearOf('bei')?.fx : undefined;
  if (bei && state.hearts <= (bei.desperateAt ?? 1)) {
    const k = (Math.sin(state.levelT * 6) + 1) / 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 50 + k * 7, 0, TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(239,108,0,' + (0.35 + k * 0.45).toFixed(2) + ')';
    ctx.stroke();
  }
  // 帅血(只画当前余量;暗色描边光晕——朱漆台/暗堤/谷地任何底色上都清晰)
  const hy = s.y + 78;
  setFont(26, false);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(24,14,6,0.78)';
  const hp = '❤'.repeat(Math.min(20, Math.max(0, Math.round(state.hearts))));   // 上限 20:数值异常时不至于把画布卡死
  ctx.strokeText(hp, s.x, hy);
  ctx.fillStyle = '#d64530';
  ctx.fillText(hp, s.x, hy);
}

/** 兵营五槽(虚线圆位,棋子即圆盘)+ 槽内棋子 + 征兵按钮 */
export function drawBarracks(): void {
  for (let i = 0; i < BARRACKS.n; i++) {
    const sc = slotCenter(i);
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, 40, 0, TAU);
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a08c60';
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (let i = 0; i < BARRACKS.n; i++) {
    const p = state.barracks[i];
    if (p) drawPiece(slotCenter(i).x, slotCenter(i).y, p, 80);
  }

  // 征兵按钮(一次征满)
  const cost = draftCost();
  const ok = state.gold >= cost;
  const dcx = DRAFT_BTN.x + DRAFT_BTN.w / 2;
  ctx.globalAlpha = ok ? 1 : 0.5;
  rr(DRAFT_BTN.x, DRAFT_BTN.y, DRAFT_BTN.w, DRAFT_BTN.h, 14);
  ctx.fillStyle = '#a93226';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#7b241c';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(36, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('征兵', dcx, 1216);
  setFont(18, false);
  ctx.fillText('粮 ' + cost, dcx, 1258);
  ctx.globalAlpha = 1;
  state.uiButtons.push({ id: 'draft', x: DRAFT_BTN.x, y: DRAFT_BTN.y, w: DRAFT_BTN.w, h: DRAFT_BTN.h });

  // 回收按钮(拖兵投放区,非点击按钮;垦荒令不可回收)
  const d = state.drag;
  const dp = d && d.kind === 'piece' ? d.piece : null;
  const rcx = RECYCLE_BTN.x + RECYCLE_BTN.w / 2;
  const hovering = !!dp && pointer.x >= RECYCLE_BTN.x && pointer.x <= RECYCLE_BTN.x + RECYCLE_BTN.w
    && pointer.y >= RECYCLE_BTN.y - 6 && pointer.y <= RECYCLE_BTN.y + RECYCLE_BTN.h;
  rr(RECYCLE_BTN.x, RECYCLE_BTN.y, RECYCLE_BTN.w, RECYCLE_BTN.h, 14);
  ctx.fillStyle = d ? '#6d4c41' : '#8a7a5c';
  ctx.fill();
  ctx.lineWidth = hovering ? 4 : 3;
  ctx.strokeStyle = hovering ? '#b8860b' : '#5c4a38';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(30, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('回收', rcx, 1214);
  setFont(16, false);
  ctx.fillStyle = '#e8ddc4';
  ctx.fillText(dp ? ('得 ' + sellValue(dp.lv) + ' 粮') : '拖兵入此', rcx, 1252);

  // 垦荒令口袋(征兵键上方):征兵随机掉落,拖到荒地格开辟
  const kx = KEN_BTN.x + KEN_BTN.w / 2, ky = KEN_BTN.y + KEN_BTN.h / 2;
  const hasKen = state.kens > 0 && !(d && d.kind === 'ken');
  rr(KEN_BTN.x, KEN_BTN.y, KEN_BTN.w, KEN_BTN.h, 12);
  ctx.fillStyle = hasKen ? 'rgba(58,44,30,0.35)' : 'rgba(58,44,30,0.15)';
  ctx.fill();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = hasKen ? 2.5 : 2;
  ctx.strokeStyle = hasKen ? '#b8860b' : '#b9a97e';
  ctx.stroke();
  ctx.setLineDash([]);
  if (hasKen) {
    drawKenToken(kx, ky - 4, 26);
    if (state.kens > 1) {
      setFont(17, true);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f2e8d0';
      ctx.fillText('×' + state.kens, KEN_BTN.x + KEN_BTN.w - 8, KEN_BTN.y + 16);
    }
  } else {
    ctx.fillStyle = 'rgba(138,122,92,0.55)';
    setFont(20, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('垦', kx, ky - 2);
    setFont(12, false);
    ctx.fillStyle = 'rgba(138,122,92,0.7)';
    ctx.fillText('征兵掉落', kx, ky + 20);
  }
}

/* ---------- 军械(兵营上方:主动=可点技能按钮 / 被动=常驻徽记) ---------- */

/** 主动技可点(冷却中显示剩余秒数 + 进度条);右侧排开已解锁被动军械的常驻徽记 */
export function drawBag(): void {
  state.bag.forEach((id, i) => {
    const g = gearOf(id);
    if (!g) return;
    const x = BAG_BTN.x + i * (BAG_BTN.w + BAG_BTN.gap);
    const y = BAG_BTN.y, w = BAG_BTN.w, h = BAG_BTN.h;
    const cx = x + w / 2, cy = y + h / 2;
    const cd = state.gearCd[id] ?? 0;
    const ready = cd <= 0;
    const drumming = id === 'gu' && state.drumT > 0;
    rr(x, y, w, h, 12);
    ctx.fillStyle = '#6d4c41';
    ctx.fill();
    ctx.lineWidth = drumming ? 4 : 2.5;
    ctx.strokeStyle = drumming ? '#b8860b' : ready ? '#5c4a38' : '#6b655a';
    ctx.stroke();
    ctx.globalAlpha = ready ? 1 : 0.4;
    ctx.fillStyle = '#fdf6e3';
    setFont(30, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.glyph, cx, cy - 10);
    setFont(13, false);
    ctx.fillStyle = '#e8ddc4';
    ctx.fillText(g.name, cx, cy + 20);
    ctx.globalAlpha = 1;
    if (!ready) {
      // 冷却:半透明罩 + 剩余秒数 + 底部进度条
      rr(x, y, w, h, 12);
      ctx.fillStyle = 'rgba(18,13,8,0.5)';
      ctx.fill();
      setFont(22, true);
      ctx.fillStyle = '#f9a825';
      ctx.fillText(String(Math.ceil(cd)), cx, cy - 2);
      const frac = clamp(1 - cd / (g.cd ?? 30), 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 8, y + h - 9, w - 16, 5);
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(x + 8, y + h - 9, (w - 16) * frac, 5);
    }
    state.uiButtons.push({ id: 'useGear', n: i, x, y, w, h });
  });

  // 被动军械(携带才生效,不占技能槽,取下即不生效):小徽记,不可点
  let px = BAG_BTN.x + state.bag.length * (BAG_BTN.w + BAG_BTN.gap) + 14;
  const sz = 42, py = BAG_BTN.y + (BAG_BTN.h - sz) / 2;
  for (const g of GEAR) {
    if (g.kind !== 'passive' || !carriesGear(g.id)) continue;
    rr(px, py, sz, sz, 8);
    ctx.fillStyle = 'rgba(58,44,30,0.55)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#8a7a5c';
    ctx.stroke();
    ctx.fillStyle = '#e8ddc4';
    setFont(20, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.glyph, px + sz / 2, py + sz / 2 + 1);
    px += sz + 6;
  }
  ctx.textBaseline = 'alphabetic';
}

/** 顶部 HUD(粮 / 波次信息 / 倍速 / 重开)+ 出怪口(敌营) */
export function drawHUD(): void {
  ctx.fillStyle = '#e4d9bf';
  ctx.fillRect(0, 0, 720, 56);
  ctx.fillStyle = '#2e2416';                 // 卷轴暗边(压住战场顶缘)
  ctx.fillRect(0, 56, 720, 4);
  ctx.fillStyle = 'rgba(184,144,62,0.55)';   // 金线
  ctx.fillRect(0, 60, 720, 1.5);
  ctx.fillStyle = '#6d4c41';
  setFont(28, true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('粮 ' + Math.floor(state.gold), 18, 30);
  ctx.textAlign = 'center';
  setFont(22, true);
  ctx.fillStyle = INK;
  if (state.mode === 'endless') {
    // 无限模式:波次无上限;下一波预览含水军楼船提示
    if (state.interWave > 0 || state.waveIdx < 0) {
      const nxt = endlessWaveInfo(Math.max(1, state.waveIdx + 2));
      const cd = state.interWave > 0 ? ' · ' + Math.ceil(state.interWave) + 's' : '';
      ctx.fillText('无限 · 第' + Math.max(1, state.waveIdx + 2) + '波 '
        + waveText(nxt.groups) + (nxt.navy > 0 ? ' 水军' : '') + (nxt.boss ? ' 将' : '') + cd, 360, 30);
    } else {
      ctx.fillText('无限 · 第' + (state.waveIdx + 1) + '波 · 敌' + state.enemies.length, 360, 30);
    }
  } else {
    const total = LEVELS[state.level - 1].waves.length;
    if (state.interWave > 0 || state.waveIdx < 0) {
      const nxt = LEVELS[state.level - 1].waves[clamp(state.waveIdx + 1, 0, total - 1)];
      const cd = state.interWave > 0 ? ' · ' + Math.ceil(state.interWave) + 's' : '';
      ctx.fillText('第' + state.level + '关 · 下一波 ' + waveText(nxt) + cd, 360, 30);
    } else {
      ctx.fillText('第' + state.level + '关 · 第' + (state.waveIdx + 1) + '/' + total + '波 · 敌' + state.enemies.length, 360, 30);
    }
  }
  drawPauseBtn(602, 30, 22, { id: 'pause', x: 576, y: 4, w: 52, h: 52 });
  drawSpeedBtn(656, 30, 22, { id: 'speed', x: 630, y: 4, w: 52, h: 52 });
}

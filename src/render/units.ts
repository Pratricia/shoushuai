/* ============================================================
   渲染 · 单位:棋子、敌军、弹道、特效、飘字、提示条、拖拽预览
   ============================================================ */
import type { Piece, TileType, Point, Enemy, Boat, Effect } from '../types';
import { ctx, rr, setFont } from '../canvas';
import { TAU, W, MAXLV, PIECES, TIER, SHELL, TIDE, NAVY, MERGE, xpNeed } from '../config';
import { state, cellCenter, cellAt, slotCenter } from '../state';
import { pieceStats } from '../systems/pieces';
import { findSkill, mountShieldActive } from '../systems/skills';
import { fusionHints } from '../systems/fusion';
import { SPECIALS, isTile } from '../data/specials';
import { pointer } from '../input';
import { clamp, dist, shellArcH } from '../systems/geometry';
import { drawBridgeDeck } from './board';
import { riverBand, listBridges } from '../systems/navy';

/* ---------- 棋子 ---------- */

/** 圆形棋子底盘:落影 + 象牙木渐变 + 盘沿 + 刻环(ringColor=等级色)——真实象棋子质感 */
export function discBase(x: number, y: number, r: number, ringColor: string, ringW = 3): void {
  // 落影(棋子浮起感)
  ctx.beginPath();
  ctx.arc(x + 2, y + 4, r, 0, TAU);
  ctx.fillStyle = 'rgba(52,38,20,0.20)';
  ctx.fill();
  // 盘体:象牙木纵向渐变
  const g = ctx.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, '#f8eed4');
  g.addColorStop(0.55, '#efdeb4');
  g.addColorStop(1, '#dfc795');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  // 盘沿
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#9a7a45';
  ctx.stroke();
  // 刻环(真实棋子的内圈刻线,兼作等级标识)
  ctx.beginPath();
  ctx.arc(x, y, r - 7, 0, TAU);
  ctx.lineWidth = ringW;
  ctx.strokeStyle = ringColor;
  ctx.stroke();
}

/** 字牌零件:小木牌(浅木圆角方 + 深木框 + 墨字)——不成军、不上阵,等贴子拼装 */
function drawTile(x: number, y: number, ch: string, size: number): void {
  const s = size * 0.74;
  ctx.fillStyle = 'rgba(24,18,12,0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.45, s * 0.52, s * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d7c39a';
  rr(x - s / 2, y - s / 2, s, s, 8);
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#8a6a3a';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(74,59,40,0.35)';
  rr(x - s / 2 + 5, y - s / 2 + 5, s - 10, s - 10, 5);
  ctx.stroke();
  ctx.fillStyle = '#4a3b28';
  setFont(Math.round(s * 0.6), true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y + 1);
}

/** 画一枚棋子(兵营 / 棋盘 / 拖拽中通用):圆形木面象棋子,朱红刻字
 *  字牌零件画成小木牌;成军特殊兵种挂金环双圈 + 上角两枚牌字 */
export function drawPiece(x: number, y: number, p: Piece, size: number): void {
  if (isTile(p.type)) { drawTile(x, y, p.type, size); return; }
  const t = TIER[p.lv] ?? TIER[1];
  // 合体弹亮:半秒内盘面微弹 6%(留在本格内)+ 内缘亮环,渐起渐收——小动画不遮视野
  const mt = p.mergeT ?? 0;
  const pop = mt > 0 ? Math.sin(Math.PI * mt / MERGE.flash) : 0;
  size *= 1 + 0.06 * pop;
  const r = size / 2;
  discBase(x, y, r, t.bd);
  if (pop > 0.03) {
    ctx.beginPath();
    ctx.arc(x, y, r - 4, 0, TAU);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(255,236,180,' + (0.75 * pop).toFixed(3) + ')';
    ctx.stroke();
  }
  // 刻字(红方朱字)
  ctx.fillStyle = '#a5301f';
  setFont(Math.round(size * 0.54), true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.type, x, y + 2);
  // 等级点(刻环内下缘一排)
  const dots = p.lv, gap = 11;
  ctx.fillStyle = t.bd;
  for (let i = 0; i < dots; i++) {
    ctx.beginPath();
    ctx.arc(x - gap * (dots - 1) / 2 + i * gap, y + r * 0.62, 3.2, 0, TAU);
    ctx.fill();
  }
  // 特殊军(兵营/拖拽中的单盘形态):金环双圈 + 上角牌字 + 经验弧(升级进度)
  if (p.tag) {
    const sp = SPECIALS[p.tag];
    if (sp) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255,213,79,0.5)';
      ctx.beginPath();
      ctx.arc(x, y, r + 8, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < sp.parts.length; i++) {
        const cx2 = x + (i === 0 ? -r * 0.62 : r * 0.62);
        const cy2 = y - r * 0.62;
        ctx.fillStyle = '#f5e6c0';
        rr(cx2 - r * 0.3, cy2 - r * 0.3, r * 0.6, r * 0.6, 4);
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = '#b8860b';
        ctx.stroke();
        ctx.fillStyle = '#6d4c41';
        setFont(Math.round(r * 0.42), true);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sp.parts[i], cx2, cy2 + 1);
      }
      // 经验弧:主盘外金弧,升下一级进度(满级整环)
      const frac = p.lv >= MAXLV ? 1 : Math.min(1, (p.xp ?? 0) / xpNeed(p.lv));
      if (frac > 0.02) {
        ctx.beginPath();
        ctx.arc(x, y, r + 12, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,213,79,0.9)';
        ctx.stroke();
      }
    }
  }
  // 拖拽时提示可合并目标(特殊军不参与合成,不提示)
  if (state.drag && state.drag.kind === 'piece' && state.drag.piece
      && !state.drag.piece.tag && !p.tag
      && state.drag.piece.type === p.type
      && state.drag.piece.lv === p.lv && p.lv < MAXLV) {
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(x, y, r + 7, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 眩晕(被砲轰中):灰蒙 + 晕标
  if ((p.stunT ?? 0) > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = 'rgba(92,103,125,0.32)';
    ctx.fill();
    ctx.fillStyle = '#5c677d';
    ctx.fillRect(x - 7, y - r - 20, 5, 11);
    ctx.fillRect(x + 2, y - r - 20, 5, 11);
  }
}

/* ---------- 特殊军(双格连体形态) ---------- */

/** 特殊军棋盘形态:描金船型连体座横跨两格——主端兵种盘(朱字)、副端令旗盘(牌字)。
 *  五种攻击形态全覆盖:车·冲阵(家留虚影,本体冲出+速度线)/ 马·连跳(腾空弧线)/
 *  兵·突刺(前冲+残影速度线)/ 相·腾空重踏(整座拔起砸落)/ 炮·后坐回弹 */
function drawSpecialPiece(p: Piece, cc: Point): void {
  const v = p.vec!;
  const B = cellCenter(p.c + v.dc, p.r + v.dr);
  /* 车:冲阵中——原位连体座留虚影,本体画在冲撞位置 */
  if (p.charge) {
    const ch = p.charge;
    if (ch.phase === 'out') {
      const cl = Math.hypot(ch.tx - ch.fx, ch.ty - ch.fy) || 1;
      const nx = (ch.tx - ch.fx) / cl, ny = (ch.ty - ch.fy) / cl;
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#2f2820';
      ctx.lineWidth = 3;
      for (let i = 0; i < 2; i++) {
        const off = 14 + i * 12;
        ctx.beginPath();
        ctx.moveTo(ch.x - nx * 36 - ny * off, ch.y - ny * 36 + nx * off);
        ctx.lineTo(ch.x - nx * 64 - ny * off, ch.y - ny * 64 + nx * off);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = 0.18;
    drawSpecialBody(p, cc.x, cc.y, B.x, B.y);
    ctx.globalAlpha = 1;
    drawPiece(ch.x, ch.y, p, 92);
    return;
  }
  /* 马:连跳中——地面落影 + 本体腾空,原位连体座留虚影(与普通马同款弧线) */
  if (p.jump) {
    const jp = p.jump;
    ctx.globalAlpha = Math.max(0.06, 0.22 * (1 - jp.h / 150));
    ctx.fillStyle = '#2f2820';
    ctx.beginPath();
    ctx.ellipse(jp.x, jp.y + 32, Math.max(16, 34 - jp.h * 0.12), 9, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalAlpha = 0.18;
    drawSpecialBody(p, cc.x, cc.y, B.x, B.y);
    ctx.globalAlpha = 1;
    drawPiece(jp.x, jp.y - jp.h, p, 88);
    return;
  }
  /* 静置形态的瞬时动画:兵·突刺前冲 / 相·腾空重踏 / 炮·后坐回弹 */
  let ox = 0, oy = 0, ph = 0;
  if ((p.thrustT ?? 0) > 0) {
    const k = 1 - (p.thrustT ?? 0) / 0.2;
    const pa = p.thrustAng ?? 0;
    const ca = Math.cos(pa), sa = Math.sin(pa);
    const amp = Math.sin(Math.PI * k) * 14;
    ox = ca * amp;
    oy = sa * amp;
    ctx.globalAlpha = 0.32 * (1 - k);
    ctx.strokeStyle = '#2f2820';
    ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) {
      const off = 11 + i * 9;
      const bx = cc.x + ox - ca * 30, by = cc.y + oy - sa * 30;
      ctx.beginPath();
      ctx.moveTo(bx - sa * off, by + ca * off);
      ctx.lineTo(bx - sa * off - ca * 15, by + ca * off - sa * 15);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if ((p.leapT ?? 0) > 0) {
    // 相:前 70% 腾空拔起,后段砸落回弹(连体座整体抬升 + 放大 + 落影)
    const k = 1 - (p.leapT ?? 0) / 0.3;
    ph = Math.sin(Math.PI * Math.min(1, k * 1.2));
    oy -= ph * 26;
    if (ph * 26 > 3) {
      ctx.globalAlpha = 0.15 * ph;
      ctx.fillStyle = '#2f2820';
      ctx.beginPath();
      ctx.ellipse((cc.x + B.x) / 2, (cc.y + B.y) / 2 + 30, 44, 10, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  if ((p.recoilT ?? 0) > 0) {
    const k = (p.recoilT ?? 0) / 0.22;
    ox += (p.recoilDx ?? 0) * 11 * k;
    oy += (p.recoilDy ?? 0) * 11 * k;
  }
  drawSpecialBody(p, cc.x + ox, cc.y + oy, B.x + ox, B.y + oy, ph);
}

/** 连体座:底影 + 深漆描金船型底座(带合体微弹/相腾空放大)+ 主端兵种盘 + 副端令旗盘
 *  + 等级点 + 经验弧;巡河/骑河类沿舷画水纹(贴河风味) */
function drawSpecialBody(p: Piece, x1: number, y1: number, x2: number, y2: number, lift = 0): void {
  const sp = SPECIALS[p.tag!];
  const t = TIER[p.lv] ?? TIER[1];
  const mt = p.mergeT ?? 0;
  const pop = mt > 0 ? Math.sin(Math.PI * mt / MERGE.flash) : 0;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const w = len + 78, h = 76;
  // 底影
  ctx.fillStyle = 'rgba(24,18,12,0.28)';
  ctx.save();
  ctx.translate(mx, my + 26);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, 26, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // 船型底座(深漆 + 描金双线;合体时整座微弹 5%,相·腾空整体放大)
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(ang);
  ctx.scale(1 + 0.05 * pop + 0.15 * lift, 1 + 0.05 * pop + 0.15 * lift);
  ctx.fillStyle = '#3d2b1f';
  rr(-w / 2, -h / 2, w, h, 20);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#c9a227';
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(201,162,39,0.45)';
  rr(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 14);
  ctx.stroke();
  // 带「河」字牌成军的沿舷画水纹(巡河炮 / 骑河车 / 过河兵 的贴河风味)
  if (sp && sp.parts.includes('河')) {
    ctx.strokeStyle = 'rgba(122,166,178,0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const wx = -w / 2 + 30 + i * (w - 60) / 2;
      ctx.beginPath();
      ctx.arc(wx, h / 2 - 13, 7, Math.PI, TAU);
      ctx.stroke();
    }
  }
  ctx.restore();
  // 主端:兵种盘(等级色环 + 朱字)
  discBase(x1, y1, 38, t.bd);
  if (pop > 0.03) {
    ctx.beginPath();
    ctx.arc(x1, y1, 34, 0, TAU);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(255,236,180,' + (0.75 * pop).toFixed(3) + ')';
    ctx.stroke();
  }
  ctx.fillStyle = '#a5301f';
  setFont(34, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.type, x1, y1 + 2);
  // 副端:令旗盘(米色 + 墨字牌字)
  ctx.fillStyle = '#f5e6c0';
  ctx.beginPath();
  ctx.arc(x2, y2, 26, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#b8860b';
  ctx.stroke();
  ctx.fillStyle = '#6d4c41';
  setFont(24, true);
  ctx.fillText((sp && sp.parts[0]) ?? p.type, x2, y2 + 1);
  // 等级点(主盘下缘)
  const dots = p.lv, gap = 11;
  ctx.fillStyle = t.bd;
  for (let i = 0; i < dots; i++) {
    ctx.beginPath();
    ctx.arc(x1 - gap * (dots - 1) / 2 + i * gap, y1 + 38 * 0.62, 3.2, 0, TAU);
    ctx.fill();
  }
  // 经验弧:主盘外金弧(杀敌攒经验,攒满升一级;满级整环)
  const frac = p.lv >= MAXLV ? 1 : Math.min(1, (p.xp ?? 0) / xpNeed(p.lv));
  if (frac > 0.02) {
    ctx.beginPath();
    ctx.arc(x1, y1, 48, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,213,79,0.9)';
    ctx.stroke();
  }
  // 眩晕(主盘上灰蒙 + 晕标)
  if ((p.stunT ?? 0) > 0) {
    ctx.beginPath();
    ctx.arc(x1, y1, 38, 0, TAU);
    ctx.fillStyle = 'rgba(92,103,125,0.32)';
    ctx.fill();
    ctx.fillStyle = '#5c677d';
    ctx.fillRect(x1 - 7, y1 - 58, 5, 11);
    ctx.fillRect(x1 + 2, y1 - 58, 5, 11);
  }
}

/** 棋盘上的己方棋子(含 车·冲阵 / 马·连跳 的动画形态) */
export function drawPieces(): void {
  for (const [k, p] of state.grid) {
    if (k !== p.c + ',' + p.r) continue;          // 特殊军双格登记:只按主格画一次
    const cc = cellCenter(p.c, p.r);
    if (p.tag && p.vec) { drawSpecialPiece(p, cc); continue; }
    if (p.charge) {
      // 车:冲阵中——原位留淡影,本体画在冲撞位置,拖出速度线
      const ch = p.charge;
      if (ch.phase === 'out') {
        const cl = Math.hypot(ch.tx - ch.fx, ch.ty - ch.fy) || 1;
        const nx = (ch.tx - ch.fx) / cl, ny = (ch.ty - ch.fy) / cl;
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#2f2820';
        ctx.lineWidth = 3;
        for (let i = 0; i < 2; i++) {
          const off = 14 + i * 12;
          ctx.beginPath();
          ctx.moveTo(ch.x - nx * 36 - ny * off, ch.y - ny * 36 + nx * off);
          ctx.lineTo(ch.x - nx * 64 - ny * off, ch.y - ny * 64 + nx * off);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 0.18;
      drawPiece(cc.x, cc.y, p, 78);
      ctx.globalAlpha = 1;
      drawPiece(ch.x, ch.y, p, 92);
    } else if (p.jump) {
      // 马:连跳中——地面落影 + 本体腾空,原位留淡影
      const jp = p.jump;
      ctx.globalAlpha = Math.max(0.06, 0.22 * (1 - jp.h / 150));
      ctx.fillStyle = '#2f2820';
      ctx.beginPath();
      ctx.ellipse(jp.x, jp.y + 32, Math.max(16, 34 - jp.h * 0.12), 9, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalAlpha = 0.18;
      drawPiece(cc.x, cc.y, p, 78);
      ctx.globalAlpha = 1;
      drawPiece(jp.x, jp.y - jp.h, p, 88);
    } else {
      // 瞬时攻击动画:兵·突刺前冲(速度线) / 相·腾空重踏(缩放+落影) / 炮·后坐回弹
      let ox = 0, oy = 0, size = 88;
      if ((p.thrustT ?? 0) > 0) {
        const k = 1 - (p.thrustT ?? 0) / 0.2;
        const pa = p.thrustAng ?? 0;
        const ca = Math.cos(pa), sa = Math.sin(pa);
        const amp = Math.sin(Math.PI * k) * 14;
        ox = ca * amp;
        oy = sa * amp;
        // 残影速度线(与突刺方向相反)
        ctx.globalAlpha = 0.32 * (1 - k);
        ctx.strokeStyle = '#2f2820';
        ctx.lineWidth = 3;
        for (let i = 0; i < 2; i++) {
          const off = 11 + i * 9;
          const bx = cc.x + ox - ca * 30, by = cc.y + oy - sa * 30;
          ctx.beginPath();
          ctx.moveTo(bx - sa * off, by + ca * off);
          ctx.lineTo(bx - sa * off - ca * 15, by + ca * off - sa * 15);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if ((p.leapT ?? 0) > 0) {
        // 相:前 70% 腾空放大,后段砸落回弹
        const k = 1 - (p.leapT ?? 0) / 0.3;
        const ph = Math.sin(Math.PI * Math.min(1, k * 1.2));
        const lift = ph * 26;
        oy -= lift;
        size = 88 * (1 + 0.15 * ph);
        if (lift > 3) {
          ctx.globalAlpha = 0.15 * (lift / 26);
          ctx.fillStyle = '#2f2820';
          ctx.beginPath();
          ctx.ellipse(cc.x, cc.y + 30, 30, 8, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if ((p.recoilT ?? 0) > 0) {
        // 炮:开炮瞬间向后坐,随计时衰减回位
        const k = (p.recoilT ?? 0) / 0.22;
        ox += (p.recoilDx ?? 0) * 11 * k;
        oy += (p.recoilDy ?? 0) * 11 * k;
      }
      drawPiece(cc.x + ox, cc.y + oy, p, size);
    }
  }
}

/* ---------- 敌军 ---------- */

function drawEnemy(e: Enemy): void {
  const isEle = e.type === '象';
  const isPao = e.type === '砲';
  const isShi = e.type === '士';
  const isNav = e.type === '水';
  // Boss 主动技能进行态:卧槽马腾空(本体吊上弧线,地面留落影)/ 铁滑车冲刺(身后拖残影直线)
  const act = e.act ?? null;
  const actK = act ? clamp(act.t / act.dur, 0, 1) : 0;
  const lift = act && act.kind === 'leap' ? Math.sin(Math.PI * actK) * 90 : 0;
  if (lift > 6) {
    ctx.fillStyle = 'rgba(24,18,12,0.22)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.r * 0.55, e.r * 0.85, e.r * 0.32, 0, 0, TAU);
    ctx.fill();
  }
  if (act && act.kind === 'dash') {
    const ux = act.tx - act.fx, uy = act.ty - act.fy;
    const ul = Math.hypot(ux, uy) || 1;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#2b2118';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      const off = i * e.r * 0.6;
      ctx.beginPath();
      ctx.moveTo(e.x - ux / ul * (e.r + 10) - uy / ul * off, e.y - uy / ul * (e.r + 10) + ux / ul * off);
      ctx.lineTo(e.x - ux / ul * (e.r + 40) - uy / ul * off, e.y - uy / ul * (e.r + 40) + ux / ul * off);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 行军步态:本体随 walkPh 颠簸 + 微微摇摆(重甲象幅度减半),状态环/血条贴真实位置不晃
  const amp = isEle ? 1.4 : 2.6;
  const bob = Math.sin(e.walkPh * TAU) * amp;
  const tilt = Math.sin(e.walkPh * TAU) * (isEle ? 0.03 : 0.055);
  ctx.save();
  ctx.translate(e.x, e.y + bob - lift);
  ctx.rotate(tilt);
  ctx.beginPath();
  ctx.arc(0, 0, e.r, 0, TAU);
  ctx.fillStyle = e.boss ? '#3a2f1b' : isEle ? '#423b2d' : isPao ? '#362b1a' : isShi ? '#2c2620'
    : isNav ? '#24333c' : '#322b21';
  ctx.fill();
  ctx.lineWidth = e.boss ? 4 : isEle ? 3.5 : isPao ? 3 : isShi ? 3 : 2.5;
  ctx.strokeStyle = e.boss ? '#f9a825' : isEle ? '#8a6a3a' : isPao ? '#7a5a30' : isShi ? '#a1793a'
    : isNav ? '#5f8b96' : '#171310';
  ctx.stroke();
  if (isEle) {
    // 象:内圈铜纹,凸显重甲
    ctx.beginPath();
    ctx.arc(0, 0, e.r - 8, 0, TAU);
    ctx.strokeStyle = 'rgba(242,232,208,0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (isPao) {
    // 砲:炮身铆钉环;蓄力时炽红泛光
    ctx.beginPath();
    ctx.arc(0, 0, e.r - 8, 0, TAU);
    ctx.strokeStyle = e.aimT > 0 ? 'rgba(192,57,43,0.9)' : 'rgba(242,232,208,0.25)';
    ctx.lineWidth = e.aimT > 0 ? 3 : 2;
    ctx.stroke();
    if (e.aimT > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 6, 0, TAU);
      ctx.strokeStyle = 'rgba(192,57,43,0.65)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  if (isShi) {
    // 士:近卫金点(护主链接中的卫队印记)
    ctx.fillStyle = 'rgba(249,168,37,0.8)';
    ctx.beginPath();
    ctx.arc(0, -e.r + 9, 3, 0, TAU);
    ctx.fill();
  }
  if (isNav) {
    // 水军:内圈浪纹(抢滩兵的湿甲印记)
    ctx.beginPath();
    ctx.arc(0, 0, e.r - 8, 0, TAU);
    ctx.strokeStyle = 'rgba(126,200,227,0.42)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (e.boss) {
    /* 技能→造型映射(数据驱动:有什么技能就长什么样) */
    if (findSkill(e, 'armor')) {
      // 重甲:铜钉双环——「这玩意减伤」的装甲读法
      ctx.strokeStyle = 'rgba(138,106,58,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.r - 7, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(138,106,58,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r - 13, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = 'rgba(148,112,60,0.95)';
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 + 0.26;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * (e.r - 10), Math.sin(a) * (e.r - 10), 2.4, 0, TAU);
        ctx.fill();
      }
    }
    if (findSkill(e, 'summon')) {
      // 霸王气场:暗紫晕随呼吸涨缩(召唤者的压迫感)
      const k = 1 + Math.sin(state.levelT * 3) * 0.12;
      ctx.strokeStyle = 'rgba(74,20,60,0.4)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 12 * k, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(74,20,60,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + 21 * k, 0, TAU);
      ctx.stroke();
    }
    if (findSkill(e, 'guardLink')) {
      // 将缨:盔顶金杆赤缨——「近卫护主」的将旗读法
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -e.r + 2);
      ctx.lineTo(0, -e.r - 13);
      ctx.stroke();
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(0, -e.r - 13);
      ctx.lineTo(13, -e.r - 8);
      ctx.lineTo(0, -e.r - 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#f9a825';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#f2e8d0';
  setFont(Math.round(e.r * 1.15), true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(e.boss ? e.boss.glyph : e.type, 0, 2);
  ctx.restore();
  if (e.boss) {
    // 过河卒·越河狂奔:血过门槛提速,红环示警
    const rg = findSkill(e, 'rage');
    if (rg && e.hp / e.maxHp <= rg.threshold) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 7 + Math.sin(state.levelT * 9) * 2, 0, TAU);
      ctx.strokeStyle = 'rgba(192,57,43,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // 双车错·孤车死斗:搭档阵亡提速,同款红环示警
    if (e.twRaged) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 7 + Math.sin(state.levelT * 9) * 2, 0, TAU);
      ctx.strokeStyle = 'rgba(192,57,43,0.85)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // 当头炮·炮架生效:贴着棋子时青环亮起(提示玩家拉开距离再打)
    if (mountShieldActive(e)) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 6, 0, TAU);
      ctx.strokeStyle = 'rgba(126,200,227,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    // 名牌:随身小字——来将何人,一眼即知
    setFont(15, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(60,44,20,0.85)';
    ctx.fillText(e.boss.name, e.x, e.y - e.r - 30);
  }
  if (e.slowT > 0) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r + 5, 0, TAU);
    ctx.strokeStyle = 'rgba(126,200,227,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (e.pauseT > 0) {
    // 车:拐角歇整指示(金色暂停标)
    ctx.fillStyle = '#b8860b';
    ctx.fillRect(e.x - 6, e.y - e.r - 24, 4, 10);
    ctx.fillRect(e.x + 2, e.y - e.r - 24, 4, 10);
  }
  if (e.armorBreakT > 0) {
    // 兵符·卒伍破甲:盾裂烙印(趁虚而入——一切来路伤害放大)
    const bx = e.x - e.r * 0.95, by = e.y - e.r * 0.62;
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, TAU);
    ctx.fillStyle = 'rgba(166,38,28,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(248,238,212,0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    setFont(11, true);
    ctx.fillStyle = '#f8eed4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('破', bx, by + 1);
  }
  if (e.tide >= TIDE.mark) {
    // 敌潮强化标:右肩小红山(出生越晚,基础越强)
    const mx = e.x + e.r * 0.72, my = e.y - e.r * 0.78;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(mx, my - 6);
    ctx.lineTo(mx - 5, my + 2);
    ctx.lineTo(mx + 5, my + 2);
    ctx.closePath();
    ctx.fill();
  }
  if (e.hp < e.maxHp) {
    const bw = e.r * (e.boss ? 2.6 : 1.9);
    ctx.fillStyle = 'rgba(44,36,28,0.55)';
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw, 5);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(e.x - bw / 2, e.y - e.r - 10, bw * clamp(e.hp / e.maxHp, 0, 1), 5);
  }
}

/* ---------- 兵符·战场区域(灼烧火场 / 减速沼泽) ---------- */

/** 区域地面贴片:随存续淡入淡出。灼烧=橙红焦土+跳动火舌;沼泽=青灰泥沼+呼吸涟漪 */
export function drawZones(): void {
  for (const z of state.zones) {
    const life = clamp(z.t / z.dur, 0, 1);
    const a = life < 0.15 ? life / 0.15 : 1 - (life - 0.15) / 0.85;
    const rad = z.r;
    if (z.kind === 'burn') {
      const g = ctx.createRadialGradient(z.x, z.y, rad * 0.15, z.x, z.y, rad);
      g.addColorStop(0, 'rgba(255,168,64,' + (0.42 * a).toFixed(3) + ')');
      g.addColorStop(0.6, 'rgba(214,74,32,' + (0.30 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(96,28,12,0)');
      ctx.beginPath();
      ctx.arc(z.x, z.y, rad, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      // 火舌:圆周跳动的几簇火苗
      for (let i = 0; i < 7; i++) {
        const an = (i / 7) * TAU + z.t * 2.4;
        const rr2 = rad * (0.45 + 0.4 * ((i * 37) % 10) / 10);
        const fx = z.x + Math.cos(an) * rr2;
        const fy = z.y + Math.sin(an) * rr2 * 0.85;
        const sz = 4 + Math.sin(z.t * 11 + i) * 2.5;
        ctx.beginPath();
        ctx.moveTo(fx, fy - sz * 1.7);
        ctx.quadraticCurveTo(fx + sz, fy - sz * 0.2, fx, fy + sz * 0.7);
        ctx.quadraticCurveTo(fx - sz, fy - sz * 0.2, fx, fy - sz * 1.7);
        ctx.fillStyle = 'rgba(255,' + Math.round(140 + 60 * Math.sin(z.t * 9 + i)) + ',60,' + (0.75 * a).toFixed(3) + ')';
        ctx.fill();
      }
    } else {
      const g = ctx.createRadialGradient(z.x, z.y, rad * 0.1, z.x, z.y, rad);
      g.addColorStop(0, 'rgba(90,130,140,' + (0.34 * a).toFixed(3) + ')');
      g.addColorStop(0.7, 'rgba(56,86,96,' + (0.26 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(30,48,54,0)');
      ctx.beginPath();
      ctx.arc(z.x, z.y, rad, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
      // 呼吸涟漪
      for (let i = 0; i < 3; i++) {
        const ph = (z.t * 0.7 + i / 3) % 1;
        ctx.beginPath();
        ctx.arc(z.x, z.y, rad * (0.25 + ph * 0.7), 0, TAU);
        ctx.strokeStyle = 'rgba(150,200,210,' + (0.22 * (1 - ph) * a).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}

export function drawEnemies(): void {
  // 双车错·错车金线:两骑相连(中点一枚「错」印),一眼读出「这是一对」
  const twinMap = new Map<string, Enemy[]>();
  for (const e of state.enemies) {
    if (e.dead || !e.boss || !findSkill(e, 'twin')) continue;
    const arr = twinMap.get(e.boss.id) ?? [];
    arr.push(e);
    twinMap.set(e.boss.id, arr);
  }
  for (const arr of twinMap.values()) {
    if (arr.length < 2) continue;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#f9a825';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.moveTo(arr[0].x, arr[0].y);
    ctx.lineTo(arr[1].x, arr[1].y);
    ctx.stroke();
    ctx.setLineDash([]);
    setFont(18, true);
    ctx.fillStyle = 'rgba(60,44,20,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('错', (arr[0].x + arr[1].x) / 2, (arr[0].y + arr[1].y) / 2);
    ctx.globalAlpha = 1;
  }
  // 铁门栓·铁链:Boss → 被锁棋子(链随棋子走,晕完即断)
  for (const e of state.enemies) {
    if (e.dead || !e.boss) continue;
    const p = e.boltP;
    if (!p || (p.stunT ?? 0) <= 0) continue;
    if (state.grid.get(p.c + ',' + p.r) !== p) continue;    // 已被拖走/移除:链断
    const cc = cellCenter(p.c, p.r);
    ctx.strokeStyle = 'rgba(58,46,34,0.85)';
    ctx.lineWidth = 4;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    ctx.moveTo(e.x, e.y);
    ctx.lineTo(cc.x, cc.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // 链扣
    ctx.fillStyle = 'rgba(58,46,34,0.9)';
    const n = Math.max(1, Math.floor(Math.hypot(cc.x - e.x, cc.y - e.y) / 34));
    for (let i = 1; i < n; i++) {
      const k = i / n;
      ctx.beginPath();
      ctx.arc(e.x + (cc.x - e.x) * k, e.y + (cc.y - e.y) * k, 3.2, 0, TAU);
      ctx.fill();
    }
    // 锁环(虚线铁圈)+ 「栓」印
    ctx.strokeStyle = 'rgba(58,46,34,0.75)';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(cc.x, cc.y, 50, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    setFont(20, true);
    ctx.fillStyle = '#5c677d';
    ctx.fillText('栓', cc.x, cc.y - 58);
  }
  // 护主链接金线:guardLink 技能——Boss 与链接半径内存活的卫兵
  const boss = state.enemies.find(e => !e.dead && e.boss);
  const link = boss ? findSkill(boss, 'guardLink') : undefined;
  if (boss && link) {
    for (const e of state.enemies) {
      if (e.dead || e.type !== link.guard) continue;
      if (dist(e.x, e.y, boss.x, boss.y) > link.radius) continue;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#f9a825';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(boss.x, boss.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }
  // 砲 / 当头炮:架炮落点预警圈(红圈 + 倒计时进度弧;圈内棋子拖走即躲炮)
  for (const e of state.enemies) {
    if (e.aimT <= 0) continue;
    const bom = findSkill(e, 'bombard');
    const rad = bom ? bom.radius : SHELL.radius;
    const k = 1 - e.aimT / SHELL.aim;
    ctx.fillStyle = 'rgba(169,50,38,0.13)';
    ctx.beginPath();
    ctx.arc(e.aimX, e.aimY, rad, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#a93226';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(e.aimX, e.aimY, rad, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(e.aimX, e.aimY, rad - 10, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
    setFont(26, true);
    ctx.fillStyle = '#a93226';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('避!', e.aimX, e.aimY);
  }
  // 卧槽马 / 铁滑车:技能落点预警(虚线圈 = 落地眩晕范围,进度弧 = 倒计时;圈内棋子提前撤)
  for (const e of state.enemies) {
    if (!e.act) continue;
    const sk = findSkill(e, e.act.kind === 'leap' ? 'leap' : 'dash');
    if (!sk) continue;
    const k = clamp(e.act.t / e.act.dur, 0, 1);
    ctx.fillStyle = 'rgba(169,50,38,0.10)';
    ctx.beginPath();
    ctx.arc(e.act.tx, e.act.ty, sk.stunR, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7b241c';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(e.act.tx, e.act.ty, sk.stunR, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(e.act.tx, e.act.ty, sk.stunR - 10, -Math.PI / 2, -Math.PI / 2 + TAU * k);
    ctx.stroke();
    setFont(24, true);
    ctx.fillStyle = '#a93226';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.act.kind === 'leap' ? '闪' : '冲', e.act.tx, e.act.ty);
  }
  for (const e of state.enemies) drawEnemy(e);
}

/* ---------- Boss 出阵告示 ---------- */

/** Boss 出阵告示:楚河汉界拉横幅——暗幕金缘,将名大字 + 一句话路数。
 *  来将何人、什么技能,开打前一目了然;3.4 秒淡出,不挡操作(纯绘制)。 */
export function drawBossBanner(): void {
  const b = state.bossBanner;
  if (!b) return;
  const a = Math.max(0, Math.min(1, (3.4 - b.t) / 0.35, b.t / 0.55));
  const rv = state.map.river;
  const cy = rv.y + rv.h / 2;            // 河带中心 = 告示舞台
  const h = 108;
  const x0 = 34, xw = W - 68;
  ctx.save();
  ctx.globalAlpha = a;
  // 暗幕横带(中段稍透,金线双缘)
  const grad = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  grad.addColorStop(0, 'rgba(22,15,10,0.92)');
  grad.addColorStop(0.5, 'rgba(22,15,10,0.72)');
  grad.addColorStop(1, 'rgba(22,15,10,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(x0, cy - h / 2, xw, h);
  ctx.fillStyle = '#c9a227';
  ctx.fillRect(x0, cy - h / 2, xw, 2);
  ctx.fillRect(x0, cy + h / 2 - 2, xw, 2);
  // 两端金饰角
  ctx.strokeStyle = 'rgba(201,162,39,0.85)';
  ctx.lineWidth = 2;
  for (const sx of [x0, x0 + xw]) {
    const dir = sx < W / 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(sx, cy - h / 2 + 10);
    ctx.lineTo(sx + dir * 13, cy);
    ctx.lineTo(sx, cy + h / 2 - 10);
    ctx.stroke();
  }
  // 将名(字距拉开) + 一句话路数
  setFont(40, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f9a825';
  ctx.fillText(b.name.split('').join(' '), W / 2, cy - 17);
  setFont(19, false);
  ctx.fillStyle = '#f2e8d0';
  ctx.fillText(b.title, W / 2, cy + 27);
  ctx.restore();
}

/* ---------- 水军楼船 ---------- */

/** 单艘楼船(朝向随航向):曲面船体 + 楼舱 + 红旆 + 尾迹;泊桥时搭跳板、头顶计兵 */
function drawBoat(b: Boat): void {
  const bob = Math.sin(b.ph) * 2.2;
  ctx.save();
  ctx.translate(b.x, b.y + bob);
  ctx.rotate(Math.sin(b.ph * 0.8) * 0.02);
  ctx.scale(b.dir, 1);                     // 以下全部按「朝右」绘制
  // 水面暗影
  ctx.fillStyle = 'rgba(6,20,28,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 54, 8, 0, 0, TAU);
  ctx.fill();
  // 航行尾迹(两道渐散水线)
  if (b.state !== 'dock') {
    ctx.strokeStyle = 'rgba(190,225,230,0.24)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-44, 3);
    ctx.quadraticCurveTo(-72, 7, -94, 15);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-44, 6);
    ctx.quadraticCurveTo(-66, 11, -82, 21);
    ctx.stroke();
  }
  // 船体:艉平、艏翘的战船侧影(深木 + 舷缘受光 + 甲板板条)
  ctx.beginPath();
  ctx.moveTo(-46, -10);
  ctx.lineTo(34, -10);
  ctx.quadraticCurveTo(50, -12, 56, -22);
  ctx.quadraticCurveTo(46, -2, 38, 7);
  ctx.lineTo(-38, 8);
  ctx.quadraticCurveTo(-52, 8, -46, -10);
  ctx.closePath();
  ctx.fillStyle = '#4a3421';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#20150a';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-44, -9);
  ctx.lineTo(32, -9);
  ctx.quadraticCurveTo(48, -11, 54, -21);
  ctx.strokeStyle = 'rgba(214,192,150,0.30)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(24,16,8,0.5)';
  ctx.lineWidth = 1.2;
  for (let i = -36; i < 30; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i, -7);
    ctx.lineTo(i + 2, 5);
    ctx.stroke();
  }
  // 楼舱:中后木堡小楼(深木墙 + 出檐 + 窗洞)
  rr(-28, -34, 42, 24, 4);
  ctx.fillStyle = '#33240f';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1a1108';
  ctx.stroke();
  rr(-32, -41, 50, 8, 3);
  ctx.fillStyle = '#5c442a';
  ctx.fill();
  ctx.fillStyle = '#0f0a05';
  ctx.fillRect(-20, -28, 8, 10);
  ctx.fillRect(-2, -28, 8, 10);
  // 桅旗:杆 + 红旆(燕尾战旗,无字免镜像)
  ctx.strokeStyle = '#241b10';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(16, -41);
  ctx.lineTo(16, -66);
  ctx.stroke();
  ctx.fillStyle = '#7e2a1c';
  ctx.beginPath();
  ctx.moveTo(16, -66);
  ctx.lineTo(42, -60);
  ctx.lineTo(35, -55);
  ctx.lineTo(44, -48);
  ctx.lineTo(16, -44);
  ctx.closePath();
  ctx.fill();
  // 桨(航行中侧影斜线;泊桥收桨)
  if (b.state !== 'dock') {
    ctx.strokeStyle = '#3a2a16';
    ctx.lineWidth = 2;
    for (const ox of [-34, -16, 2]) {
      ctx.beginPath();
      ctx.moveTo(ox, -4);
      ctx.lineTo(ox - 14, 13);
      ctx.stroke();
    }
  } else if (b.squad > 0) {
    // 跳板:自船艏斜搭到桥面(下船通道)
    ctx.save();
    ctx.translate(40, -6);
    ctx.rotate(0.3);
    ctx.fillStyle = '#6b4e2e';
    ctx.fillRect(0, -3.5, 34, 7);
    ctx.strokeStyle = 'rgba(24,16,8,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, -3.5, 34, 7);
    ctx.restore();
  }
  ctx.restore();
  // 泊桥计兵(世界坐标,不随镜像/颠簸):水军 ×剩余
  if (b.state === 'dock' && b.squad > 0) {
    ctx.fillStyle = '#cfeef5';
    setFont(16, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('水军 ×' + b.squad, b.x, b.y - 76);
  }
}

/** 楼船层:先画全部船,再对「正在穿越桥区」的船重绘桥面
 *  (船从桥洞下驶过;泊桥的船画在桥前面 = 靠泊观感) */
export function drawBoats(): void {
  const band = riverBand();
  const bridges = listBridges();
  for (const b of state.boats) {
    if (b.wait > 0) continue;              // 错峰等待中(屏外)
    drawBoat(b);
  }
  for (const b of state.boats) {
    if (b.wait > 0 || b.state === 'dock') continue;
    // 驶向自家泊位时(近距)不遮:靠泊时船要画在桥前
    const dockX = b.bx - b.dir * NAVY.dockOffset;
    if (b.state === 'sail' && Math.abs(b.x - dockX) < 34) continue;
    for (const bx of bridges) {
      if (Math.abs(b.x - bx) < 84) drawBridgeDeck(ctx, bx, band.top - 10, band.bot + 10);
    }
  }
}

/* ---------- 弹道 ---------- */

export function drawProjectiles(): void {
  for (const pr of state.projectiles) {
    // 炮:抛物线铁球——地面落影 + 灼热尾焰 + 左上高光的铁弹体
    const d = dist(pr.x, pr.y, pr.tx, pr.ty);
    const h = shellArcH(pr.flown ?? 0, d, pr.arc ?? 60);
    const bx = pr.x, by = pr.y - h;
    const rem = Math.max(1, d);
    const ux = (pr.tx - pr.x) / rem, uy = (pr.ty - pr.y) / rem;
    // 地面落影(飞得越高影越小越淡)
    ctx.globalAlpha = Math.max(0.08, 0.2 - h * 0.0012);
    ctx.fillStyle = '#2f2820';
    ctx.beginPath();
    ctx.ellipse(pr.x, pr.y + 4, Math.max(5, 12 - h * 0.06), Math.max(3, 6 - h * 0.03), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 尾焰(内亮外淡两层,随高度略微上挑)
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#e3d6b8';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - ux * 42, by - uy * 42 + h * 0.1);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ff9800';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx - ux * 26, by - uy * 26 + h * 0.06);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 弹体:铁球(径向渐变高光)
    const g = ctx.createRadialGradient(bx - 3, by - 4, 1, bx, by, 9);
    g.addColorStop(0, '#6f6f6f');
    g.addColorStop(0.5, '#38332c');
    g.addColorStop(1, '#181510');
    ctx.beginPath();
    ctx.arc(bx, by, 9, 0, TAU);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0d0b08';
    ctx.stroke();
    // 尾焰端炽热点
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.arc(bx - ux * 18, by - uy * 18 + h * 0.04, 2.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- 敌砲巨弹 ---------- */

export function drawShells(): void {
  for (const sh of state.shells) {
    const k = clamp(sh.t / sh.dur, 0, 1);
    const x = sh.x + (sh.tx - sh.x) * k;
    const y = sh.y + (sh.ty - sh.y) * k;
    const h = Math.sin(Math.PI * k) * 110;
    // 地面影子
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#2f2820';
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(4, 14 - h * 0.05), 6, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // 尾迹
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#a93226';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - (sh.tx - sh.x) * 0.05, y - h + 16);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 弹体
    ctx.fillStyle = '#3a2f1b';
    ctx.beginPath();
    ctx.arc(x, y - h, 11, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#c0392b';
    ctx.stroke();
  }
}

/* ---------- 特效 ---------- */

/** 特效逐帧绘制(每种一段,实现见下方 fx*;派发顺序与原 if 链一致) */
export function drawEffects(): void {
  for (const f of state.effects) {
    const k = f.t / f.dur;
    if (f.type === 'stab') fxStab(f, k);
    else if (f.type === 'jump') fxJump(f, k);
    else if (f.type === 'stomp') fxStomp(f, k);
    else if (f.type === 'slash') fxSlash(f, k);
    else if (f.type === 'muzzle') fxMuzzle(f, k);
    else if (f.type === 'smoke') fxSmoke(f, k);
    else if (f.type === 'boom') fxBoom(f, k);
    else if (f.type === 'hit') fxHit(f, k);
    else if (f.type === 'ripple') fxRipple(f, k);
    else if (f.type === 'merge') fxMerge(f, k);
    else fxPuff(f, k);
  }
}

/** 兵:白色刺击锥 + 侧翼红线(快速探出后消散) */
function fxStab(f: Effect, k: number): void {
  const dx = f.x2 - f.x, dy = f.y2 - f.y;
  const dd = Math.hypot(dx, dy) || 1;
  const ux = dx / dd, uy = dy / dd;
  const ext = dd * (0.25 + 0.5 * Math.min(1, k * 2));
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#fff8e7';
  ctx.lineWidth = 5 * (1 - k) + 1;
  ctx.beginPath();
  ctx.moveTo(f.x + ux * 10, f.y + uy * 10);
  ctx.lineTo(f.x + ux * ext, f.y + uy * ext);
  ctx.stroke();
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 2.5 * (1 - k) + 0.5;
  ctx.beginPath();
  ctx.moveTo(f.x + ux * 10 - uy * 6, f.y + uy * 10 + ux * 6);
  ctx.lineTo(f.x + ux * ext - uy * 6, f.y + uy * ext + ux * 6);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 马:弹射虚线弧 */
function fxJump(f: Effect, k: number): void {
  ctx.globalAlpha = (1 - k) * 0.85;
  ctx.strokeStyle = '#ef6c00';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([5, 6]);
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.quadraticCurveTo((f.x + f.x2) / 2, (f.y + f.y2) / 2 - 40, f.x2, f.y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** 相:重踏——土色冲击双环 + 沿环扬尘 */
function fxStomp(f: Effect, k: number): void {
  ctx.globalAlpha = (1 - k) * 0.75;
  ctx.strokeStyle = '#a1887f';
  ctx.lineWidth = 7 * (1 - k * 0.5);
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.3 + 0.75 * k), 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.55 + 0.5 * k), 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#bcaaa4';
  for (let i = 0; i < 7; i++) {
    const a = i * TAU / 7 + 0.4;
    const rr = f.r * (0.5 + 0.5 * k);
    ctx.globalAlpha = (1 - k) * 0.4;
    ctx.beginPath();
    ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr - 7 * k, 3 + 3 * (1 - k), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 仕:斜十字斩痕(金) */
function fxSlash(f: Effect, k: number): void {
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 5 * (1 - k * 0.5);
  ctx.beginPath();
  ctx.moveTo(f.x - f.r * 0.7, f.y - f.r * 0.7);
  ctx.lineTo(f.x + f.r * 0.7, f.y + f.r * 0.7);
  ctx.moveTo(f.x + f.r * 0.7, f.y - f.r * 0.7);
  ctx.lineTo(f.x - f.r * 0.7, f.y + f.r * 0.7);
  ctx.stroke();
  ctx.globalAlpha = (1 - k) * 0.45;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.55 + 0.45 * k), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 炮:炮口火光——亮核 + 放射芒线 */
function fxMuzzle(f: Effect, k: number): void {
  const kk = 1 - k;
  const g = ctx.createRadialGradient(f.x, f.y, 1, f.x, f.y, f.r * (1 + k));
  g.addColorStop(0, 'rgba(255,246,220,' + kk.toFixed(3) + ')');
  g.addColorStop(0.6, 'rgba(255,152,0,' + (kk * 0.8).toFixed(3) + ')');
  g.addColorStop(1, 'rgba(255,152,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (1 + k), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = kk;
  ctx.strokeStyle = '#ffe082';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + 0.35;
    const l = f.r * (0.9 + 0.7 * kk);
    ctx.beginPath();
    ctx.moveTo(f.x + Math.cos(a) * f.r * 0.4, f.y + Math.sin(a) * f.r * 0.4);
    ctx.lineTo(f.x + Math.cos(a) * (f.r * 0.4 + l), f.y + Math.sin(a) * (f.r * 0.4 + l));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** 炮:尾烟——灰团膨胀上飘消散 */
function fxSmoke(f: Effect, k: number): void {
  ctx.globalAlpha = (1 - k) * 0.3;
  ctx.fillStyle = '#7a6a52';
  ctx.beginPath();
  ctx.arc(f.x, f.y - 12 * k, f.r * (0.6 + 0.8 * k), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** 炮:落地爆炸——冲击双环 + 核心火光 + 火花放射 + 地面焦痕 */
function fxBoom(f: Effect, k: number): void {
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#f3e2b8';
  ctx.lineWidth = 6 * (1 - k) + 1;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.2 + 0.8 * k), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = (1 - k) * 0.5;
  ctx.lineWidth = 3 * (1 - k) + 1;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.1 + 0.55 * k), 0, TAU);
  ctx.stroke();
  if (k < 0.45) {
    const kk = k / 0.45;
    const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r * 0.6);
    g.addColorStop(0, 'rgba(255,250,235,' + (1 - kk).toFixed(3) + ')');
    g.addColorStop(0.4, 'rgba(255,152,0,' + ((1 - kk) * 0.75).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,87,34,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#ffd54f';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9 + 0.2;
    const r1 = f.r * (0.15 + 0.35 * k), r2 = f.r * (0.3 + 0.55 * k);
    ctx.beginPath();
    ctx.moveTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
    ctx.lineTo(f.x + Math.cos(a) * r2, f.y + Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.globalAlpha = (1 - k) * 0.4;
  ctx.fillStyle = '#3a2f1f';
  ctx.beginPath();
  ctx.ellipse(f.x, f.y, f.r * 0.42, f.r * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** 命中:星芒闪(白芒 + 中心亮核) */
function fxHit(f: Effect, k: number): void {
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = '#f6e8c8';
  ctx.lineWidth = 3 * (1 - k) + 0.5;
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + 0.5;
    const r1 = f.r * (0.2 + 0.2 * k), r2 = f.r * (0.55 + 0.75 * k);
    ctx.beginPath();
    ctx.moveTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
    ctx.lineTo(f.x + Math.cos(a) * r2, f.y + Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.globalAlpha = (1 - k) * 0.8;
  ctx.fillStyle = '#fffdf4';
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * 0.25 * (1 - k * 0.5), 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** 水军:水面涟漪——双环浅青渐散 */
function fxRipple(f: Effect, k: number): void {
  ctx.globalAlpha = (1 - k) * 0.5;
  ctx.strokeStyle = '#7ec8e3';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.3 + 0.8 * k), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = (1 - k) * 0.28;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.15 + 0.5 * k), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** 合体:金环轻扬——细双环自盘心扩出 + 五点金星,纯描边、半径不出本格,快速渐散 */
function fxMerge(f: Effect, k: number): void {
  ctx.globalAlpha = (1 - k) * 0.9;
  ctx.strokeStyle = '#ffd54f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.25 + 0.75 * k), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = (1 - k) * 0.45;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.r * (0.12 + 0.55 * k), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = '#ffe082';
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5 + 0.6;
    const rr = f.r * (0.55 + 0.45 * k);
    ctx.beginPath();
    ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 2.5 * (1 - k) + 0.5, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 兜底:帅被砍的朱红冲击环(按剩余时间扩环);其余类型(阵亡的暗色土团等)一团渐散 */
function fxPuff(f: Effect, k: number): void {
  ctx.globalAlpha = (1 - k) * 0.5;
  if (f.type === 'palace') {
    // 帅被砍:红色冲击环
    ctx.strokeStyle = '#c0392b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 20 + 90 * k, 0, TAU);
    ctx.stroke();
  } else {
    ctx.fillStyle = f.type === 'death' ? '#3a322a' : '#2f2820';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * (0.4 + 0.9 * k), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- 飘字 / 提示条 ---------- */

export function drawFloats(): void {
  for (const f of state.floats) {
    const k = f.t / f.dur;
    ctx.globalAlpha = 1 - k;
    setFont(f.size, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 34 * k);
    ctx.globalAlpha = 1;
  }
}

export function drawToast(): void {
  if (!state.toast) return;
  ctx.globalAlpha = clamp(state.toast.t / 0.3, 0, 1);
  setFont(24, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(state.toast.text).width + 48;
  rr(360 - tw / 2, 620, tw, 48, 24);
  ctx.fillStyle = 'rgba(42,34,24,0.88)';
  ctx.fill();
  ctx.fillStyle = '#f2e8d0';
  ctx.fillText(state.toast.text, 360, 648);
  ctx.globalAlpha = 1;
}

/* ---------- 拖拽中的棋子 / 垦荒令 ---------- */

/** 垦荒令令牌(口袋 / 拖拽通用):褐底金边圆牌,「垦」字 */
export function drawKenToken(x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = '#6d4c41';
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#b8860b';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r - 7, 0, TAU);
  ctx.strokeStyle = 'rgba(242,232,208,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#f2e8d0';
  setFont(Math.round(r * 1.1), true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('垦', x, y + 1);
}

export function drawDrag(): void {
  const d = state.drag;
  if (!d) return;
  // 垦荒令拖拽:悬停荒地绿框高亮,本体为令牌
  if (d.kind === 'ken') {
    const cell = cellAt(pointer.x, pointer.y);
    if (cell && state.wasteland.has(cell.c + ',' + cell.r)) {
      const cc = cellCenter(cell.c, cell.r);
      rr(cc.x - 50, cc.y - 50, 100, 100, 14);
      ctx.fillStyle = 'rgba(67,160,71,0.25)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#43a047';
      ctx.stroke();
      setFont(34, true);
      ctx.fillStyle = '#2e7d32';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('垦', cc.x, cc.y + 2);
    }
    drawKenToken(pointer.x, pointer.y - 8, 34);
    setFont(20, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#43a047';
    ctx.fillText('垦荒令 · 拖到「荒」格开辟', clamp(pointer.x, 130, W - 130), pointer.y + 84);
    return;
  }
  const pc = d.piece;
  if (!pc) return;
  // 字牌拖拽:提示整条配方 + 高亮「一落即成军」的基础棋子
  if (isTile(pc.type)) {
    drawPiece(pointer.x, pointer.y - 8, pc, 96);
    const combos = Object.values(SPECIALS).filter(sp => sp.parts.includes(pc.type as TileType));
    const hint = combos.length
      ? '字牌: ' + combos.map(sp => sp.parts.join('') + ' → ' + sp.name).join('  ·  ')
      : '字牌';
    for (const h of fusionHints(pc.type as TileType)) {
      const tc = cellCenter(h.c, h.r);
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = h.ready ? 3.5 : 2;
      ctx.strokeStyle = h.ready ? '#c9a227' : 'rgba(184,134,11,0.5)';
      ctx.beginPath();
      ctx.arc(tc.x, tc.y, 50, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = h.ready ? '#b8860b' : 'rgba(109,76,65,0.9)';
      setFont(18, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(h.ready ? ('↓ ' + h.name) : (h.name + ' 差' + h.missing), tc.x, tc.y - 58);
    }
    setFont(20, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6d4c41';
    ctx.fillText(hint, clamp(pointer.x, 180, W - 180), pointer.y + 84);
    return;
  }
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#a93226';
  if (d.from === 'barracks') {
    const sc = slotCenter(d.idx);
    rr(sc.x - 48, sc.y - 48, 96, 96, 14);
    ctx.stroke();
  } else {
    const cc = cellCenter(d.c, d.r);
    rr(cc.x - 50, cc.y - 50, 100, 100, 14);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // 射程提示圈 + 兵种说明(特殊军:额外注明双格与经验升级)
  const s2 = pieceStats(pc);
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = 'rgba(169,50,38,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y - 8, s2.range, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  setFont(20, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#a93226';
  const sp2 = pc.tag ? SPECIALS[pc.tag] : undefined;
  const desc = sp2 ? sp2.desc + ' · 占两格 · 击杀攒经验' : PIECES[pc.type].desc;
  ctx.fillText(desc, clamp(pointer.x, 110, W - 110), pointer.y + 84);
  drawPiece(pointer.x, pointer.y - 8, pc, 96);
}

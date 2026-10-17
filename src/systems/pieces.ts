/* ============================================================
   兵种系统:等级数值成长 + 五种独立攻击方式 + 弹道推进
   ------------------------------------------------------------
   攻击方式(与棋子走法一一对应):
     兵 stab   —— 突刺:即时伤害 + 把敌人往回顶
     马 hop    —— 踏营:自身腾空连跳三踏再回位
     炮 shell  —— 远瞄:瞄准射程内最远目标,落点溅射
     车 charge —— 冲阵:直线冲出碾压撞飞;每中一敌减速,满 hitCap 提前折返
     相 stomp  —— 践踏:周身范围伤害 + 减速 + 推散
   ============================================================ */
import type { Piece, PieceDef, PieceType, Enemy, Projectile, JumpState, ChargeState } from '../types';
import { state, cellCenter, boardFu } from '../state';
import { PIECES, GROWTH, W, FU_MECH } from '../config';
import { dist, clamp, maxBy, rand, shellArcH } from './geometry';
import { damageEnemy, knockback, addEffect, shellHit, addZone } from './combat';
import { airborne } from './skills';
import { SPECIALS, isTile } from '../data/specials';
import { drumRate } from './items';
import type { FuMech } from '../data/fu';

export interface PieceStats { dmg: number; cd: number; range: number; area: number; }

/** 本棋盘已铸兵符的机制(未铸 = undefined)——特殊军继承基础兵种的机制 */
function fuMech(p: Piece): FuMech | undefined {
  return boardFu(p.type)?.mech;
}

/** 生效定义:基础兵种定义 × 特殊军覆盖项(连环马多跳/担竿炮重轰)
 *  面积类倍率(splashR/jumpR/chargeLen/stompR)走 pieceStats.area,这里不重复乘 */
export function effDef(p: Piece): PieceDef {
  const base = PIECES[p.type as PieceType];
  const sp = p.tag ? SPECIALS[p.tag] : undefined;
  if (!sp) return base;
  return { ...base, hops: sp.hops ?? base.hops, hitCap: sp.hitCap ?? base.hitCap };
}

/** 等级成长:伤害×2^(lv-1)(合成翻倍) / 攻速×0.93^ / 射程+6%/级 / 范围类+5%/级
 *  特殊军(连环马等)在此基础上再乘注册表倍率(过河兵 haste 为攻速加速)。
 *  兵符不加数值——改机制(见 fuMech);特殊军同享基础兵种的机制 */
export function pieceStats(p: Piece): PieceStats {
  const d = PIECES[p.type as PieceType];
  const m = Math.pow(GROWTH.dmg, p.lv - 1);
  const sp = p.tag ? SPECIALS[p.tag] : undefined;
  return {
    dmg: d.dmg * m * (sp ? sp.dmg : 1),
    cd: d.cd * Math.pow(GROWTH.cd, p.lv - 1) / (sp?.haste ?? 1),
    range: d.range * (1 + GROWTH.range * (p.lv - 1)) * (sp?.range ?? 1),
    area: (1 + GROWTH.area * (p.lv - 1)) * (sp?.area ?? 1),
  };
}

/** 相践踏的减速时长(相羽符不改这个——它改成落地留减速沼泽) */
export function stompSlow(p: Piece): number {
  return effDef(p).slow ?? 1.8;
}

/* ---------- 马:起跳踏向目标 / 跳回家 ---------- */

function startHop(jp: JumpState, target: Enemy, dmg: number, hopLeft: number): void {
  jp.phase = 'fly';
  jp.target = target;
  jp.hit.push(target);
  jp.fx = jp.x; jp.fy = jp.y;
  jp.tx = target.x; jp.ty = target.y;
  const d = dist(jp.fx, jp.fy, jp.tx, jp.ty);
  jp.dur = clamp(d / 700, 0.16, 0.4);
  jp.arc = clamp(d * 0.35, 40, 110);
  jp.dmg = dmg;
  jp.hopLeft = hopLeft;
  jp.t = 0;
  addEffect(jp.fx, jp.fy, 'jump', 0, jp.tx, jp.ty);
}

function startBack(jp: JumpState): void {
  jp.phase = 'back';
  jp.target = null;
  jp.fx = jp.x; jp.fy = jp.y;
  jp.tx = jp.hx; jp.ty = jp.hy;
  const d = dist(jp.fx, jp.fy, jp.tx, jp.ty);
  jp.dur = clamp(d / 700, 0.16, 0.4);
  jp.arc = clamp(d * 0.35, 40, 110);
  jp.t = 0;
}

/* ---------- 相:落地结算(腾空后砸落那帧,按当时敌情伤害+减速+推散) ---------- */

function stompLand(p: Piece): void {
  const def = effDef(p);
  const s = pieceStats(p);
  const pos = cellCenter(p.c, p.r);
  const R = (def.stompR ?? 135) * s.area;
  for (const e of state.enemies) {
    if (e.dead || airborne(e)) continue;      // 卧槽马腾空中:落不着
    const dd = dist(pos.x, pos.y, e.x, e.y);
    if (dd <= R) {
      damageEnemy(e, s.dmg, stompSlow(p), p);
      const ux = dd ? (e.x - pos.x) / dd : 0;
      knockback(e, ux * (def.kb ?? 40), -16);
    }
  }
  addEffect(pos.x, pos.y, 'stomp', R);
  addEffect(pos.x, pos.y + 20, 'dust', 26);
  // 兵符·相羽符:落点留下一片减速沼泽(困住再烤/补斩)
  if (fuMech(p) === 'slowStomp') addZone('slow', pos.x, pos.y, FU_MECH.slowStomp.radius, FU_MECH.slowStomp.dur);
}

/* ---------- 塔攻击主循环 ---------- */

export function updatePieces(dt: number): void {
  // 擂鼓:全军攻速加成倒计时(随倍速同步,游戏内时间)
  if (state.drumT > 0) state.drumT = Math.max(0, state.drumT - dt);
  for (const [k, p] of state.grid) {
    if (k !== p.c + ',' + p.r) continue;           // 特殊军双格登记:只处理主格一次
    if (isTile(p.type)) continue;               // 字牌零件不作战,只等成军
    const def = effDef(p);
    const s = pieceStats(p);

    /* 瞬时攻击动画计时(兵突刺 / 相重踏 / 炮后坐,纯视觉,不受眩晕影响)
     * 相·落地结算:腾空 0.3s,落到地面那帧才按当时敌情结算践踏(起跳只是蓄势) */
    if ((p.thrustT ?? 0) > 0) p.thrustT! -= dt;
    if ((p.leapT ?? 0) > 0) {
      p.leapT! -= dt;
      if (p.stompPending && (p.leapT ?? 0) <= 0.05) {
        p.stompPending = false;
        stompLand(p);
      }
    }
    if ((p.recoilT ?? 0) > 0) p.recoilT! -= dt;

    /* 眩晕:被砲轰中,期间不可行动(冲阵/连跳已在落弹时打断) */
    if ((p.stunT ?? 0) > 0) { p.stunT -= dt; continue; }

    /* 车:冲阵动画推进(冲出:距离推进,每中一敌减速,达 hitCap 提前折返;回位:缓入) */
    if (p.charge) {
      const ch: ChargeState = p.charge;
      if (ch.phase === 'out') {
        // 冲出速度 = 基速 × drag^已命中数(碾压人马越多家,冲得越滞重)
        const v = 900 * Math.pow(def.drag ?? 0.82, ch.hit.length);
        ch.dist = Math.min(ch.len, ch.dist + v * dt);
        const k = clamp(ch.dist / ch.len, 0, 1);
        ch.x = ch.fx + (ch.tx - ch.fx) * k;
        ch.y = ch.fy + (ch.ty - ch.fy) * k;
        // 沿途碾压判定
        const cl = ch.len || 1;
        const nx = (ch.tx - ch.fx) / cl, ny = (ch.ty - ch.fy) / cl;
        for (const e of state.enemies) {
          if (e.dead || ch.hit.includes(e) || airborne(e)) continue;
          if (dist(ch.x, ch.y, e.x, e.y) <= (def.hitR ?? 46) * s.area + e.r * 0.5) {
            ch.hit.push(e);
            damageEnemy(e, s.dmg, 0, p);
            // 兵符·车辕符:撞中即晕(原地不能行军,给集火时间)
            if (fuMech(p) === 'stunCharge') e.pauseT = Math.max(e.pauseT, FU_MECH.stunCharge.dur);
            // 被撞飞:向路径侧方甩出 + 沿途被顶回
            const cross = nx * (e.y - ch.y) - ny * (e.x - ch.x);
            const sgn = cross >= 0 ? 1 : -1;
            knockback(e, -ny * sgn * (def.kb ?? 55) - nx * (def.kb ?? 55) * 0.45,
              nx * sgn * (def.kb ?? 55) - ny * (def.kb ?? 55) * 0.45);
            addEffect(e.x, e.y, 'hit', 18);
          }
        }
        if (Math.random() < 0.6) addEffect(ch.x, ch.y, 'dust', 8);
        // 命中达上限 → 提前收招(不再全程通杀);或冲到头正常折返
        if (ch.hit.length >= (def.hitCap ?? 5) || ch.dist >= ch.len) {
          ch.phase = 'back';
          ch.t = 0;
          if (ch.hit.length >= (def.hitCap ?? 5)) addEffect(ch.x, ch.y, 'dust', 16);
        }
      } else {
        ch.t += dt;
        const k = clamp(ch.t / ch.backDur, 0, 1);
        const ease = k * (2 - k);                     // 回位:缓入
        ch.x = ch.tx + (ch.fx - ch.tx) * ease;
        ch.y = ch.ty + (ch.fy - ch.ty) * ease;
        if (ch.t >= ch.backDur) { p.charge = null; p.cd = s.cd; }
      }
      continue;
    }

    /* 马:连跳动画推进(起跳→落地踏敌→下一跳→回家) */
    if (p.jump) {
      const jp: JumpState = p.jump;
      jp.t += dt;
      const k = clamp(jp.t / jp.dur, 0, 1);
      if (jp.phase === 'fly' && jp.target && !jp.target.dead) { jp.tx = jp.target.x; jp.ty = jp.target.y; }
      jp.x = jp.fx + (jp.tx - jp.fx) * k;
      jp.y = jp.fy + (jp.ty - jp.fy) * k;
      jp.h = Math.sin(Math.PI * k) * jp.arc;
      if (k >= 1) {
        if (jp.phase === 'fly') {
          // 落地踏敌
          const e = jp.target;
          if (e && !e.dead) {
            damageEnemy(e, jp.dmg, 0, p);
            knockback(e, 0, -12);
            // 兵符·马蹄符:踏杀即续跳(连跳次数回满——连环不绝,一路踏穿)
            if (e.dead && fuMech(p) === 'chainKill') jp.hopLeft = Math.max(jp.hopLeft, (def.hops ?? 3) - 1);
          }
          addEffect(jp.tx, jp.ty, 'hit', 16);
          if (Math.random() < 0.7) addEffect(jp.tx, jp.ty, 'dust', 10);
          // 下一跳:附近未踏过的敌人
          const cand = state.enemies.filter(en => !en.dead && !airborne(en) && !jp.hit.includes(en) && dist(jp.tx, jp.ty, en.x, en.y) <= jp.jumpR);
          if (jp.hopLeft > 0 && cand.length) {
            const t2 = cand.reduce((m, x) => (dist(jp.tx, jp.ty, x.x, x.y) < dist(jp.tx, jp.ty, m.x, m.y) ? x : m));
            startHop(jp, t2, jp.dmg * jp.decay, jp.hopLeft - 1);
          } else {
            startBack(jp);
          }
        } else {
          // 回家落地,进入冷却
          p.jump = null;
          p.cd = s.cd;
        }
      }
      continue;
    }

    if (p.cd > 0) p.cd -= dt * drumRate();   // 擂鼓期间全军冷却加速
    if (p.cd > 0) continue;
    // 攻击位:单格=格心;双格特殊军=两格连线中点(炮口/起跳/践踏都从这出)
    const pos = p.vec
      ? { x: (cellCenter(p.c, p.r).x + cellCenter(p.c + p.vec.dc, p.r + p.vec.dr).x) / 2,
          y: (cellCenter(p.c, p.r).y + cellCenter(p.c + p.vec.dc, p.r + p.vec.dr).y) / 2 }
      : cellCenter(p.c, p.r);
    const inRange = state.enemies.filter(e => !e.dead && !airborne(e) && dist(pos.x, pos.y, e.x, e.y) <= s.range);
    if (!inRange.length) continue;

    if (def.mode === 'stab') {
      /* 兵:突刺——前冲突刺 + 即时伤害 + 把敌人往回顶 */
      const t = maxBy(inRange, e => e.y);
      p.thrustT = 0.2;
      p.thrustAng = Math.atan2(t.y - pos.y, t.x - pos.x);
      damageEnemy(t, s.dmg, 0, p);
      // 兵符·卒伍符:命中即破甲(期间一切来路伤害放大——配合炮火/车马爆发)
      if (fuMech(p) === 'breakArmor' && !t.dead) t.armorBreakT = FU_MECH.breakArmor.dur;
      knockback(t, 0, -(def.kb ?? 22));
      addEffect(pos.x, pos.y + 22, 'stab', 0, t.x, t.y);
      addEffect(t.x, t.y, 'hit', 14);
      if (Math.random() < 0.6) addEffect(t.x, t.y + 18, 'dust', 8);
    } else if (def.mode === 'hop') {
      /* 马:连跳——自己跳进敌群连踏三跳,再跳回家 */
      const t = maxBy(inRange, e => e.hp);
      p.jump = {
        hx: pos.x, hy: pos.y, x: pos.x, y: pos.y, fx: pos.x, fy: pos.y, tx: t.x, ty: t.y,
        t: 0, dur: 0.2, arc: 40, h: 0, phase: 'fly', target: null, hit: [],
        dmg: 0, hopLeft: 0, jumpR: (def.jumpR ?? 170) * s.area, decay: def.decay ?? 0.75,
      };
      startHop(p.jump, t, s.dmg, (def.hops ?? 3) - 1);
      continue;
    } else if (def.mode === 'shell') {
      /* 炮:溅射弹——炮身后坐 + 炮口火光,抛物线铁球飞向最远目标,落点范围溅射 */
      const t = maxBy(inRange, e => dist(pos.x, pos.y, e.x, e.y));
      const mx = pos.x, my = pos.y - 20;
      const ang = Math.atan2(t.y - my, t.x - mx);
      p.recoilT = 0.22;
      p.recoilDx = -Math.cos(ang);
      p.recoilDy = -Math.sin(ang);
      state.projectiles.push({
        mode: 'shell', x: mx, y: my, target: t, tx: t.x, ty: t.y,
        dmg: s.dmg, splashR: (def.splashR ?? 90) * s.area, owner: p,
        sx: mx, sy: my, flown: 0,
        arc: clamp(dist(mx, my, t.x, t.y) * 0.24, 26, 110),
      });
      addEffect(mx, my, 'muzzle', 16);
    } else if (def.mode === 'charge') {
      /* 车:冲阵——瞄准血最厚目标直线冲出;每碾压一敌减速,命中数达上限即折返(人海挡车) */
      const t = maxBy(inRange, e => e.hp);
      const dx = t.x - pos.x, dy = t.y - pos.y;
      const dd = Math.hypot(dx, dy) || 1;
      const len = (def.chargeLen ?? 380) * s.area;
      const ex = clamp(pos.x + dx / dd * len, 30, W - 30);
      const ey = clamp(pos.y + dy / dd * len, 80, 1120);
      const realLen = Math.hypot(ex - pos.x, ey - pos.y);
      p.charge = { fx: pos.x, fy: pos.y, tx: ex, ty: ey, x: pos.x, y: pos.y,
        t: 0, backDur: 0.35, phase: 'out', hit: [], len: realLen, dist: 0 };
      continue;
    } else if (def.mode === 'stomp') {
      /* 相:周身践踏——起跳蓄势,落地瞬间才结算范围伤害 + 减速 + 推散(见 stompLand) */
      p.leapT = 0.3;
      p.stompPending = true;
    } else if (def.mode === 'slash') {
      /* 仕:宫门斩——周身范围斩击,专收漏网之敌(守御九宫) */
      for (const en of state.enemies) {
        if (en.dead || airborne(en)) continue;
        if (dist(pos.x, pos.y, en.x, en.y) <= s.range) {
          // 兵符·士魂符:残血处决——低于门槛者一刀斩尽(Boss 免疫,留给硬杀)
          const exec = fuMech(p) === 'execute' && !en.boss && en.hp / en.maxHp <= FU_MECH.execute.pct;
          damageEnemy(en, exec ? en.hp + 1 : s.dmg, 0, p);
        }
      }
      addEffect(pos.x, pos.y, 'slash', s.range);
    }
    p.cd = s.cd;
  }
}

/* ---------- 炮:弹道推进(追踪目标飞行,抛物线 + 沿途尾烟,到达落点溅射) ---------- */

export function updateProjectiles(dt: number): void {
  for (const pr of state.projectiles) {
    // pr.mode === 'shell'(当前唯一弹道类型)
    if (pr.target && !pr.target.dead) { pr.tx = pr.target.x; pr.ty = pr.target.y; }
    const d = dist(pr.x, pr.y, pr.tx, pr.ty);
    const step = 620 * dt;
    if (d <= step + 6) {
      shellHit(pr);
      // 兵符·炮膛符:弹落处燃起火场(持续灼烧,配合沼泽成「泥沼火海」)
      if (pr.owner && fuMech(pr.owner) === 'burnShell') {
        addZone('burn', pr.tx, pr.ty, FU_MECH.burnShell.radius, FU_MECH.burnShell.dur);
      }
      pr.done = true;
    } else {
      const ux = (pr.tx - pr.x) / d, uy = (pr.ty - pr.y) / d;
      pr.x += ux * step;
      pr.y += uy * step;
      pr.flown = (pr.flown ?? 0) + step;
      // 尾烟:在弹体高度附近留下消散的烟团
      if (Math.random() < 0.8) {
        const h = shellArcH(pr.flown, d, pr.arc ?? 60);
        addEffect(pr.x - ux * 12, pr.y - uy * 12 - h, 'smoke', rand(6, 11));
      }
    }
  }
  state.projectiles = state.projectiles.filter(p => !p.done);
}

/** (测试辅助)强制某棋子立即开火 */
export function resetCd(p: Piece): void { p.cd = 0; }

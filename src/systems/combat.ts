/* ============================================================
   战斗结算:伤害 / 击退 / 溅射 / 特效 / 飘字 / 提示条
   ============================================================ */
import type { Enemy, EffectType, Projectile, Piece, Zone } from '../types';
import { state, cellCenter } from '../state';
import { W, MAXLV, MERGE, XP, xpNeed, FU_DROP, FU_MECH, SP_MECH } from '../config';
import { addShards } from '../save';
import { findSkill, immuneKnock, airborne, mountShieldActive } from './skills';
import { clamp, rand, dist } from './geometry';
import { SPECIALS } from '../data/specials';

/** 特殊军吃经验:击杀敌军按威胁档加经验,攒满 need×等级升 1 级(替代合成升级) */
function grantXP(p: Piece, e: Enemy): void {
  p.xp = (p.xp ?? 0) + (e.boss ? XP.per['将'] : (XP.per[e.type] ?? 3));
  while (p.lv < MAXLV && (p.xp ?? 0) >= xpNeed(p.lv)) {
    p.xp -= xpNeed(p.lv);
    p.lv++;
    p.mergeT = MERGE.flash;
    const cc = p.c >= 0 ? cellCenter(p.c, p.r) : { x: 0, y: 0 };
    addEffect(cc.x, cc.y, 'merge', MERGE.ringR);
    addFloat(cc.x, cc.y - 52, '杀敌淬炼 · Lv' + p.lv, '#b8860b', 24);
  }
}

/** 基础伤害结算(掉血 / 减速 / 死亡赏粮;击杀归属特殊军吃经验) */
function applyDamage(e: Enemy, dmg: number, slow: number, by?: Piece | null): void {
  e.hp -= dmg;
  addFloat(e.x + rand(-8, 8), e.y - e.r - 8, String(Math.round(dmg)), '#7a6a52', 15);
  if (slow) e.slowT = Math.max(e.slowT, slow);
  if (e.hp <= 0) {
    e.dead = true;
    state.gold += e.gold;
    addEffect(e.x, e.y, 'death', 34);
    addFloat(e.x, e.y - 30, '+' + e.gold, '#b8860b', 18);
    if (e.type === '将') dropShards(e);
    if (by && by.tag) grantXP(by, e);
  }
}

/** 兵符碎片掉落:每 Boss 必掉保底 1 片,概率追加;
 *  无限模式 25 波后的深层 Boss 再 +1(深探更丰厚) */
function dropShards(e: Enemy): void {
  if (state.mode === 'duel') return;   // 对战不掉符片(两块棋盘各出一个 Boss,避免双倍白嫖存档进度的观感)
  let n = FU_DROP.base + (Math.random() < FU_DROP.extraChance ? 1 : 0);
  if (state.mode === 'endless' && state.waveIdx + 1 >= FU_DROP.deepWave) n++;
  addShards(n);
  addFloat(e.x, e.y - 64, '符片 +' + n, '#f9a825', 26);
  toast('兵符碎片 +' + n + ' · 军资集市可铸兵符');
}

/** 伤害 + 死亡结算(slow>0 时附加减速)
 *  Boss 被动技能在结算链上依次生效:
 *    卧槽马腾空中 → 不可选中(伤害直接落空,飞跃防线)
 *    铁甲(armor) → 全伤害固定减免
 *    炮架(mountShield) → 贴着任一棋子时借架减伤(逼玩家别贴脸围殴)
 *  Boss·护主链接(技能):近卫(链接半径内存活的卫兵)守卫下 Boss 受伤减半,另一半由近卫均摊 */
export function damageEnemy(e: Enemy, dmg: number, slow: number, by?: Piece | null): void {
  if (e.dead) return;
  if (airborne(e)) return;
  let d = dmg;
  const ar = findSkill(e, 'armor');
  if (ar) d *= 1 - ar.reduce;
  const ms = findSkill(e, 'mountShield');
  if (ms && mountShieldActive(e)) d *= 1 - ms.reduce;
  // 兵符·破甲:被兵(或过河兵)打上破甲后,一切来源的伤害放大
  if (e.armorBreakT > 0) d *= 1 + FU_MECH.breakArmor.amp;
  const link = findSkill(e, 'guardLink');
  if (link) {
    const guards = state.enemies.filter(g =>
      !g.dead && g.type === link.guard && dist(e.x, e.y, g.x, g.y) <= link.radius);
    if (guards.length > 0) {
      applyDamage(e, d * link.share, slow, by);
      const each = (d * (1 - link.share)) / guards.length;
      for (const g of guards) applyDamage(g, each, 0, null);
      return;
    }
  }
  applyDamage(e, d, slow, by);
}

/** 炮:落点溅射,半径内敌人全额伤害(落地爆炸特效);腾空中的 Boss 挨不着 */
export function shellHit(pr: Projectile): void {
  addEffect(pr.tx, pr.ty, 'boom', pr.splashR);
  // 独门·担竿炮「震停」:重锤落地,溅到的敌人被砸停在原地(与车辕符同用 pauseT 语义)
  const stun = pr.owner && SPECIALS[pr.owner.tag ?? '']?.mech === 'stunShell' ? SP_MECH.stunShell.pause : 0;
  for (const e of state.enemies) {
    if (!e.dead && !airborne(e) && dist(e.x, e.y, pr.tx, pr.ty) <= pr.splashR) {
      damageEnemy(e, pr.dmg, 0, pr.owner ?? null);
      if (stun && !e.dead) e.pauseT = Math.max(e.pauseT, stun);
    }
  }
}

/* ---------- 兵符·战场区域(灼烧 / 减速沼泽) ---------- */

/** 落下一片区域:炮膛符的灼烧火场 / 相羽符的减速沼泽 */
export function addZone(kind: Zone['kind'], x: number, y: number, r: number, dur: number): void {
  state.zones.push({ kind, x, y, r, t: 0, dur, pulse: 0 });
}

/** 区域推进:灼烧按脉冲结算(0.5s 一跳,免得伤害飘字刷屏);
 *  沼泽每帧续减速——困在里面的敌人一直是半速,出沼 0.2 秒后解除 */
export function updateZones(dt: number): void {
  for (const z of state.zones) {
    z.t += dt;
    if (z.kind === 'slow') {
      for (const e of state.enemies) {
        if (e.dead || airborne(e)) continue;
        if (dist(e.x, e.y, z.x, z.y) <= z.r + e.r * 0.4) e.slowT = Math.max(e.slowT, 0.22);
      }
    } else {
      z.pulse -= dt;
      if (z.pulse <= 0) {
        z.pulse = FU_MECH.burnPulse;
        for (const e of state.enemies) {
          if (e.dead || airborne(e)) continue;
          if (dist(e.x, e.y, z.x, z.y) <= z.r + e.r * 0.4) {
            damageEnemy(e, FU_MECH.burnShell.dps * FU_MECH.burnPulse, 0);
          }
        }
      }
    }
  }
  state.zones = state.zones.filter(z => z.t < z.dur);
}

/** 击退:带 knockImmune 技能的 Boss 不动;技能进行态(腾空/冲刺)不吃击退;
 *  同一敌人 0.6s 内免疫击退,防止被无限推 */
export function knockback(e: Enemy, dx: number, dy: number): void {
  if (e.dead || immuneKnock(e) || e.kbT > 0 || e.act) return;
  e.kbT = 0.6;
  e.x = clamp(e.x + dx, 40, W - 40);
  e.y = Math.max(64, e.y + dy);
}

/* ---------- 特效 / 飘字 / 提示 ---------- */

export function addEffect(x: number, y: number, type: EffectType, r = 14, x2 = 0, y2 = 0): void {
  const dur = type === 'palace' ? 0.45 : type === 'splat' ? 0.35 : type === 'death' ? 0.3
    : type === 'stomp' ? 0.4 : type === 'jump' ? 0.3 : type === 'slash' ? 0.3
    : type === 'muzzle' ? 0.14 : type === 'smoke' ? 0.55 : type === 'boom' ? 0.45
    : type === 'ripple' ? 0.5 : type === 'merge' ? 0.45 : 0.18;
  state.effects.push({ x, y, x2, y2, type, r: r || 14, t: 0, dur });
  if (state.effects.length > 120) state.effects.shift();
}

export function addFloat(x: number, y: number, text: string, color: string, size = 16): void {
  state.floats.push({ x, y, text, color, size, t: 0, dur: 0.9 });
  if (state.floats.length > 70) state.floats.shift();
}

export function toast(text: string): void {
  state.toast = { text, t: 1.4 };
}

/** 特效 / 飘字计时推进(战斗视觉,仅对战更新中推进)
 *  合体弹亮一并在此衰减(棋盘 + 兵营的棋子统一管,渲染只读 mergeT) */
export function updateTimers(dt: number): void {
  for (const f of state.effects) f.t += dt;
  state.effects = state.effects.filter(f => f.t < f.dur);
  for (const f of state.floats) f.t += dt;
  state.floats = state.floats.filter(f => f.t < f.dur);
  // 双格特殊军在 grid 登记两条,只按主格衰减一次
  for (const [k, p] of state.grid) {
    if ((p.mergeT ?? 0) <= 0) continue;
    if (k !== p.c + ',' + p.r) continue;
    p.mergeT = Math.max(0, p.mergeT! - dt);
  }
  for (const p of state.barracks) if (p && (p.mergeT ?? 0) > 0) p.mergeT = Math.max(0, p.mergeT! - dt);
}

/** 提示条计时推进(UI 层:所有画面按真实时间淡出,不随暂停/倍速/切屏冻结) */
export function updateToast(dt: number): void {
  if (state.toast) {
    state.toast.t -= dt;
    if (state.toast.t <= 0) state.toast = null;
  }
}

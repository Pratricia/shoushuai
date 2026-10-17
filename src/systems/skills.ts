/* ============================================================
   Boss 技能分发:BossSkill 数据 → 查询
   ------------------------------------------------------------
   查询侧(combat / enemies / pieces / units)只问「是否免疫
   击退」「是否腾空」「残血是否狂暴」……不关心是哪位 Boss——
   所以新增 Boss 只加数据;只有新增「技能种类」才改本文件。

   被动技能 = 各系统在结算时调用这里的查询;
   主动技能(腾空/冲刺/架炮/召唤)由 enemies.ts 的 tickBoss
   逐帧驱动(它需要 combat/出怪等副作用,放这里会成环)。
   ============================================================ */
import type { BossSkill, Enemy } from '../types';
import { state, cellCenter } from '../state';
import { dist } from './geometry';

/** 取敌人身上的某技能定义(含参数);没有则 undefined */
export function findSkill<T extends BossSkill['id']>(e: Enemy, id: T): Extract<BossSkill, { id: T }> | undefined {
  if (!e.boss) return undefined;
  return e.boss.skills.find(s => s.id === id) as Extract<BossSkill, { id: T }> | undefined;
}

/** 免疫击退(knockImmune 技能;未来其他技能也可贡献此免疫,改这里即可) */
export function immuneKnock(e: Enemy): boolean {
  return !!e.boss && findSkill(e, 'knockImmune') !== undefined;
}

/** 免疫仕的舍身挡驾(必须硬杀) */
export function immuneSacrifice(e: Enemy): boolean {
  return !!e.boss && findSkill(e, 'sacrificeImmune') !== undefined;
}

/** 免疫减速(过河卒「不回头」:相的践踏减速对其无效) */
export function slowImmune(e: Enemy): boolean {
  return !!e.boss && findSkill(e, 'noSlow') !== undefined;
}

/** 卧槽马腾空中:不可选中、不受伤害(飞跃防线的窗口) */
export function airborne(e: Enemy): boolean {
  return !!e.act && e.act.kind === 'leap';
}

/** 越河狂奔(过河卒):血量过门槛后的提速系数(未触发恒为 1) */
export function rageMul(e: Enemy): number {
  const rg = e.boss ? findSkill(e, 'rage') : undefined;
  if (!rg) return 1;
  return e.hp / e.maxHp <= rg.threshold ? 1 + rg.spd : 1;
}

/** 炮架生效中(当头炮):贴着任一棋子时借架减伤(渲染也用它画光环) */
export function mountShieldActive(e: Enemy): boolean {
  const ms = e.boss ? findSkill(e, 'mountShield') : undefined;
  if (!ms) return false;
  for (const p of state.grid.values()) {
    const cc = cellCenter(p.c, p.r);
    if (dist(e.x, e.y, cc.x, cc.y) <= ms.radius) return true;
  }
  return false;
}

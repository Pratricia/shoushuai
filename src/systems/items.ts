/* ============================================================
   军械:背包携带 → 局内生效
   ------------------------------------------------------------
     被动军械:装上即常驻(开局预置见 state.ts;每波结算在 onWaveStart)
     主动军械:局内点背包按钮触发,进冷却后可再用(不再是消耗品,
              一局无限次;一局最多携带 GEAR_BAG.activeCap 个)

   守门原则:主动技只有在「确实有用」时才触发——
   帅血已满不喝药、无敌不放索/火牛、无棋不擂鼓,免得白进冷却。
   ============================================================ */
import { state, boardGear } from '../state';
import { gearOf } from '../data/shop';
import { isTile } from '../data/specials';
import { toast, addFloat, damageEnemy } from './combat';
import { refillBarracks } from './economy';

/** 战鼓攻速倍率(0 = 未擂):供 pieces.ts 的冷却递减取用 */
export function drumRate(): number {
  if (state.drumT <= 0) return 1;
  return 1 + (gearOf('gu')?.fx.drumRate ?? 0.6);
}

/** 场上有几枚可战斗的棋子(字牌不算战力) */
function fieldPieces(): number {
  let n = 0;
  for (const p of state.grid.values()) {
    if (p && !isTile(p.type)) n++;
  }
  return n;
}

/** 局内使用背包第 i 格主动军械(点击按钮) */
export function useGear(i: number): void {
  const id = state.bag[i];
  if (!id) return;
  const g = gearOf(id);
  if (!g || g.kind !== 'active') return;
  if ((state.gearCd[id] ?? 0) > 0.001) {
    toast(g.name + ' 冷却中 · ' + Math.ceil(state.gearCd[id]) + 's');
    return;
  }
  const fx = g.fx;
  const shuai = state.map.shuai;

  // —— 守门:无效不发(不进冷却) ——
  if (fx.heal && state.hearts >= state.maxHearts) {
    toast('帅血已满,' + g.name + '先留着');
    return;
  }
  if ((fx.slowDur || fx.burnPct) && state.enemies.length === 0) {
    toast('敌军未至,' + g.name + '先留着');
    return;
  }
  if (fx.drumDur && fieldPieces() === 0) {
    toast('尚无棋子可擂鼓');
    return;
  }

  // —— 生效 ——
  if (fx.heal) {
    state.hearts = Math.min(state.maxHearts, state.hearts + fx.heal);
    addFloat(shuai.x, shuai.y - 60, '帅血 +' + fx.heal, '#d64530', 30);
  }
  if (fx.drumDur) {
    state.drumT = Math.max(state.drumT, fx.drumDur);
    addFloat(shuai.x, shuai.y - 60, '擂鼓!全军攻速提升', '#ef6c00', 30);
  }
  if (fx.slowDur) {
    for (const e of state.enemies) {
      if (!e.dead) e.slowT = Math.max(e.slowT, fx.slowDur);
    }
    addFloat(360, 560, '绊马索!敌军坠入半速', '#2e7d32', 32);
  }
  if (fx.burnPct) {
    let hits = 0;
    for (const e of state.enemies) {
      if (e.dead) continue;
      damageEnemy(e, Math.max(1, Math.ceil(e.hp * fx.burnPct)), 0);
      hits++;
    }
    addFloat(360, 560, '火牛冲阵!灼烧 ×' + hits, '#ef6c00', 32);
  }
  if (fx.refill) {
    refillBarracks();
    toast('援军令:兵营已补满(不计征兵涨价)');
  }

  // —— 冷却(可重复使用;不再是消耗品) ——
  state.gearCd[id] = g.cd ?? 30;
}

/** 主动军械冷却推进(主循环每帧调用,随倍速同步) */
export function tickGear(dt: number): void {
  for (const id in state.gearCd) {
    if (state.gearCd[id] > 0) state.gearCd[id] = Math.max(0, state.gearCd[id] - dt);
  }
}

/** 每波开始:被动军械的按波结算(屯粮车 / 金钟罩 / 垦荒令;被动解锁即常驻)
 *  按「本棋盘武装册」结算——对战对方也有自己的随机军械 */
export function onWaveStart(): void {
  const shuai = state.map.shuai;
  if (boardGear('cang')) {
    const n = gearOf('cang')?.fx.waveGold ?? 0;
    if (n > 0) {
      state.gold += n;
      addFloat(shuai.x + 66, shuai.y - 96, '+' + n + ' 粮', '#b8860b', 18);
    }
  }
  if (boardGear('bi')) {
    const n = gearOf('bi')?.fx.waveHeal ?? 0;
    if (n > 0 && state.hearts < state.maxHearts) {
      state.hearts = Math.min(state.maxHearts, state.hearts + n);
      addFloat(shuai.x - 66, shuai.y - 96, '帅血 +' + n, '#d64530', 18);
    }
  }
  if (boardGear('ken')) {
    const n = gearOf('ken')?.fx.waveKen ?? 0;
    if (n > 0) {
      state.kens += n;
      addFloat(shuai.x, shuai.y - 120, '+' + n + ' 垦荒令', '#8a6d3b', 16);
    }
  }
}

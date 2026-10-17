/* ============================================================
   军械:背包携带 → 局内生效
   ------------------------------------------------------------
     被动军械:携带即常驻(开局预置见 state.ts;每波结算在 onWaveStart;
              攻速类倍率在 speedRate;开垦返粮在 onGroundOpened)
     主动军械:局内点背包按钮触发,进冷却后可再用(不再是消耗品,
              一局无限次;一局最多携带 GEAR_BAG.activeCap 个)

   守门原则:主动技只有在「确实有用」时才触发——
   帅血已满不喝药、无敌不放索/火牛、无棋不擂鼓,免得白进冷却。
   ============================================================ */
import type { Piece, Point } from '../types';
import { state, boardGear, cellCenter } from '../state';
import { gearOf } from '../data/shop';
import { isTile } from '../data/specials';
import { toast, addFloat, damageEnemy, addZone } from './combat';
import { refillBarracks } from './economy';
import { dist } from './geometry';

/** 战鼓攻速倍率(0 = 未擂):整军的临时攻速来源之一(见 speedRate) */
export function drumRate(): number {
  if (state.drumT <= 0) return 1;
  return 1 + (gearOf('gu')?.fx.drumRate ?? 0.6);
}

/** 中军大纛:帅旁光环是否罩到某格(按格心算,与地图格距无关的固定物理范围)
 *  双格军两格相距不足一格,取主格判定与取连线中点判定结果一致 */
function inAura(c: number, r: number, radius: number): boolean {
  if (c < 0 || r < 0) return false;
  const cc = cellCenter(c, r), s = state.map.shuai;
  return dist(cc.x, cc.y, s.x, s.y) <= radius;
}

/** 攻速总倍率:pieces.ts 每帧用它递减冷却。三个来源都是「机制」而非数值堆——
 *  战鼓=主动技限时、大纛=看站位(离帅近不近)、背水=看帅血(兵临城下才发力)。
 *  三者在同一处相乘,灰盒调参只需改 data/shop.ts 的 fx */
export function speedRate(p: Piece): number {
  let r = drumRate();
  if (boardGear('da')) {
    const fx = gearOf('da')?.fx;
    if (fx?.auraR && fx.auraRate && inAura(p.c, p.r, fx.auraR)) r *= 1 + fx.auraRate;
  }
  if (boardGear('bei')) {
    const fx = gearOf('bei')?.fx;
    if (fx && state.hearts <= (fx.desperateAt ?? 1)) r *= 1 + (fx.desperateRate ?? 0);
  }
  return r;
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

/** 主动军械冷却推进(主循环每帧调用,随倍速同步)。
 *  金鼓(被动)在这里生效:冷却按 (1 + cdCut) 倍速走表——写成「走表更快」而不是
 *  「初始值更短」,界面上的冷却进度条(按 g.cd 取比例)才不会被带歪 */
export function tickGear(dt: number): void {
  const cut = boardGear('jin') ? (gearOf('jin')?.fx.cdCut ?? 0) : 0;
  const rate = 1 + cut;
  for (const id in state.gearCd) {
    if (state.gearCd[id] > 0) state.gearCd[id] = Math.max(0, state.gearCd[id] - dt * rate);
  }
  // 背水一战:帅血告急那一刻播报一次(回血脱离告急后复位,可再次触发)
  const bei = boardGear('bei') ? gearOf('bei')?.fx : undefined;
  const desperate = !!bei && state.hearts <= (bei.desperateAt ?? 1);
  if (desperate && !state.beiTold) {
    state.beiTold = true;
    const s = state.map.shuai;
    addFloat(s.x, s.y - 108, '背水一战!全军攻速暴涨', '#ef6c00', 26);
  } else if (!desperate) {
    state.beiTold = false;
  }
}

/** 行军道取点:按路线累计长度取比例处(不是「取中间那个路点」——
 *  路点疏密不均,按长度才算准位置) */
function routeAt(pts: Point[], k: number): Point {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  let want = total * k;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    if (want <= seg && seg > 0) {
      const t = want / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    want -= seg;
  }
  return pts[pts.length - 1];
}

/** 开垦一格荒地后的被动结算(屯田令)。我方垦荒令 / 对战对方 AI 垦荒共用 */
export function onGroundOpened(x: number, y: number): void {
  if (!boardGear('tian')) return;
  const n = gearOf('tian')?.fx.openGold ?? 0;
  if (n <= 0) return;
  state.gold += n;
  addFloat(x, y - 74, '+' + n + ' 粮', '#b8860b', 18);
}

/** 每波开始:被动军械的按波结算(屯粮车 / 金钟罩 / 垦荒令 / 陷马坑)
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
  if (boardGear('xian')) {
    const fx = gearOf('xian')?.fx;
    if (fx?.trapR && fx.trapDur) {
      // 每条行军道各落一片:两路都有坑,敌军无论走哪条都得趟过去。
      // 位置取路线 62% 处(帅侧半场:让减速发生在自家火力覆盖内,才叫「陷马」);
      // 若恰好落在楚河水面(路线 50% 附近常是桥),再往后挪到 78% —— 泥沼画在水上既怪又没用
      const river = state.map.river;
      for (const pts of state.paths) {
        if (pts.length < 2) continue;
        let mid = routeAt(pts, 0.62);
        if (mid.y >= river.y && mid.y <= river.y + river.h) mid = routeAt(pts, 0.78);
        addZone('slow', mid.x, mid.y, fx.trapR, fx.trapDur);
      }
    }
  }
}

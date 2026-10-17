/* ============================================================
   成军系统:字牌贴着基础棋子摆齐 → 拼装特殊兵种(占两格)
   ------------------------------------------------------------
   触发面 = 基础棋子的上下左右四格;字牌彼此不必相邻,
   只须各自贴着基础棋子。每军恰好两枚字牌,凑齐立即成军:

   · 特殊军本体留在基础棋子格,副格 = 成军那张字牌的格
     (两枚牌时取最后拼上的那张)——上下关系成竖对、左右
     关系成横对,朝向写进 p.vec,此后怎么挪都是两格。
   · 只吃掉本次配方里的两枚字牌;四邻若还摆着别的字牌,
     一律留在原处(不乱吞)。
   · grid 双格登记同一枚棋子(占位判定天然成立),各处
     遍历按「主格键」去重。

   在每次落子/换位后由 endDrag 统一调用(幂等,无配对零副作用);
   hint = 本次落子格,用来认「最后拼上的字牌」定朝向。
   ============================================================ */
import { state, cellCenter } from '../state';
import { SPECIALS, isTile } from '../data/specials';
import { MERGE } from '../config';
import { addEffect, addFloat } from './combat';
import type { Piece, TileType } from '../types';

/** 四邻偏移 */
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** 贴在 (c,r) 四邻的字牌 */
function neighborTiles(c: number, r: number): { key: string; c: number; r: number; type: TileType }[] {
  const out: { key: string; c: number; r: number; type: TileType }[] = [];
  for (const [dc, dr] of NB) {
    const nc = c + dc, nr = r + dr;
    const k = nc + ',' + nr;
    const q = state.grid.get(k);
    if (q && isTile(q.type)) out.push({ key: k, c: nc, r: nr, type: q.type });
  }
  return out;
}

export function checkFusions(hint?: { c: number; r: number } | null): void {
  const snapshot = [...state.grid];
  for (const [key, p] of snapshot) {
    if (!p || p.tag || isTile(p.type)) continue;      // 只看未成军的基础棋子
    if (key !== p.c + ',' + p.r) continue;            // 双格登记:副格条目跳过
    for (const sp of Object.values(SPECIALS)) {
      if (sp.base !== p.type) continue;
      // 四邻格内找齐整套字牌(只收本配方用到的那些)
      const nb = neighborTiles(p.c, p.r);
      const need = sp.parts.slice();
      const used: typeof nb = [];
      for (const n of nb) {
        const i = need.indexOf(n.type);
        if (i >= 0) { need.splice(i, 1); used.push(n); }
      }
      if (need.length > 0) continue;
      // 成军那张牌:优先认本次落子格上的牌(定朝向),否则取本配方里首张
      const completing = (hint && used.find(n => n.c === hint.c && n.r === hint.r)) || used[0];
      // 成军:吃牌、挂牌、定朝向(双格)、经验归零、重置冷却
      p.tag = sp.id;
      p.vec = { dc: completing.c - p.c, dr: completing.r - p.r };
      p.xp = 0;
      p.cd = 0;
      for (const n of used) state.grid.delete(n.key);   // 只吃本配方用到的牌
      state.grid.set(completing.key, p);                // 副格登记本体(主格已有)
      const cc = cellCenter(p.c, p.r);
      const bc = cellCenter(completing.c, completing.r);
      const mx = (cc.x + bc.x) / 2, my = (cc.y + bc.y) / 2;
      p.mergeT = MERGE.flash;
      addEffect(mx, my, 'merge', MERGE.ringR + 26);
      addEffect(mx, my, 'slash', 88);
      addFloat(mx, my - 52, sp.name + ' 成军!', '#b8860b', 26);
      break;                                          // 一子只成一军
    }
  }
}

/** 特殊军两格键(主格 + 副格);vec 缺失时退化为单格 */
export function specialKeys(p: Piece): string[] {
  const main = p.c + ',' + p.r;
  if (!p.vec) return [main];
  return [main, (p.c + p.vec.dc) + ',' + (p.r + p.vec.dr)];
}

/** 拖拽字牌时的成军提示:说明这张牌贴到哪些基础棋子旁会成什么军 / 还差哪张。
 *  ready=true 表示一落即成军;否则 missing 是还差的字牌。 */
export interface FusionHint { c: number; r: number; name: string; ready: boolean; missing: string; }

export function fusionHints(tile: TileType): FusionHint[] {
  const out: FusionHint[] = [];
  for (const [key, p] of state.grid) {
    if (!p || p.tag || isTile(p.type)) continue;
    if (key !== p.c + ',' + p.r) continue;
    for (const sp of Object.values(SPECIALS)) {
      if (sp.base !== p.type || !sp.parts.includes(tile)) continue;
      const have = new Set<string>();
      for (const n of neighborTiles(p.c, p.r)) have.add(n.type);
      have.add(tile);                                   // 算上正在拖的这张
      const missing = sp.parts.filter(t => !have.has(t));
      if (missing.length > 0 && missing.length >= sp.parts.length) continue;  // 一张都没凑到 → 不提示
      out.push({ c: p.c, r: p.r, name: sp.name, ready: missing.length === 0, missing: missing.join('') });
    }
  }
  return out;
}

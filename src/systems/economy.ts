/* ============================================================
   经济系统:征兵抽卡(费用曲线 + 权重)
   ============================================================ */
import type { Piece, DraftType } from '../types';
import { state, slotCenter } from '../state';
import { DRAFT, KEN, KEN_BTN } from '../config';
import { toast, addFloat } from './combat';

/** 当前征兵费用:6 起步,每次涨价幅度递增 2(涨 2/4/6/8… → 6/8/12/18/26/36/48…) */
export function draftCost(): number {
  const n = state.drafts;
  return DRAFT.base + DRAFT.accel * n * (n + 1) / 2;
}

function weightedPick(weights: Record<string, number>): string {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

/** 补满兵营:5 格全新随机兵(旧子销毁)。征兵与援军令共用 */
export function refillBarracks(): void {
  state.barracks = state.barracks.map((): Piece => ({
    type: weightedPick(DRAFT.weights) as DraftType,
    lv: 1, cd: 0, stunT: 0, c: -1, r: -1,
  }));
  for (let i = 0; i < state.barracks.length; i++) {
    if (state.side === 'rival') break;     // 对战:对方兵营不在屏幕上,不弹飘字
    const p = state.barracks[i];
    const sc = slotCenter(i);
    addFloat(sc.x, 1150, p ? p.type : '', '#6d4c41', 26);
  }
}

/** 征兵:一次补满兵营 5 格;兵营内的旧棋子被销毁、由新兵顶替
 *  同时有几率掉落垦荒令(每关首次征兵必掉):拖到荒地格开辟布阵位 */
export function tryDraft(): void {
  const cost = draftCost();
  if (state.gold < cost) { toast('粮草不足'); return; }
  state.gold -= cost;
  state.drafts++;
  refillBarracks();
  // 垦荒令掉落
  if (state.side === 'rival') return;    // 对战:对方 AI 不产垦荒令(直接在任何非路格布阵)
  if ((state.drafts === 1 || Math.random() < KEN.chance) && state.kens < KEN.max) {
    state.kens++;
    addFloat(KEN_BTN.x + KEN_BTN.w / 2, KEN_BTN.y + KEN_BTN.h / 2, '垦 +1', '#2e7d32', 24);
    toast('垦荒令 +1:拖到「荒」格上开辟');
  }
}

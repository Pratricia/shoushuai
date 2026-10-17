/* ============================================================
   水军系统:楼船自河上来袭
   ------------------------------------------------------------
   流程:自楚河汉界随机一端驶入 → 泊在目标桥侧(临时出怪点)
   → 水军依次下船、横步上桥、沿桥南接线下行直扑帅 → 放完
   最后一兵,船收舷启航、穿桥洞驶向对岸离场。
   船体不可攻击:反制手段 = 在桥头布阵截杀抢滩水军。
   航线/泊位/登岸路线全部由地图数据推导(桥 = 跨河路线段的
   自动交点,与 board.ts 同一套检测),换图零改动。
   ============================================================ */
import type { Point, Boat } from '../types';
import { state } from '../state';
import { W, ENEMIES, NAVY, TIDE, ENDLESS } from '../config';
import { waveMul, waveSpdMul, rollVet } from './enemies';
import { addEffect, addFloat } from './combat';

/** 河带几何(与 board.ts 底图同一套推导):top/bot/mid */
export function riverBand(): { top: number; bot: number; mid: number } {
  const map = state.map, rowY = map.rowY;
  let rT = 0;
  while (rT + 1 < map.rows && rowY[rT + 1] <= map.river.y) rT++;
  const top = rowY[rT] + 64, bot = rowY[rT + 1] - 64;
  return { top, bot, mid: (top + bot) / 2 };
}

/** 桥位缓存(按地图 id):跨河路线段与河心中线的交点 x,与底图自动桥一致 */
let bridgeCache: { id: string; list: number[] } | null = null;

export function listBridges(): number[] {
  const map = state.map;
  if (bridgeCache && bridgeCache.id === map.id) return bridgeCache.list;
  const band = riverBand();
  const list: number[] = [];
  for (const p of map.paths) {
    const pts = p.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.min(a.y, b.y) < band.bot && Math.max(a.y, b.y) > band.top) {
        const t = (band.mid - a.y) / (b.y - a.y);
        const bx = Math.round(a.x + (b.x - a.x) * t);
        if (!list.some(v => Math.abs(v - bx) < 40)) list.push(bx);
      }
    }
  }
  bridgeCache = { id: map.id, list };
  return list;
}

/** 水军登岸路线:泊位 → 桥面中线(横步上桥)→ 桥南口 → 原路剩余路点直扑帅 */
function buildMarinePath(bx: number, dockX: number): Point[] {
  const band = riverBand();
  for (const p of state.map.paths) {
    const pts = p.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (!(Math.min(a.y, b.y) < band.bot && Math.max(a.y, b.y) > band.top)) continue;
      const t = (band.mid - a.y) / (b.y - a.y);
      if (Math.abs(a.x + (b.x - a.x) * t - bx) > 20) continue;
      const j = a.y > b.y ? i - 1 : i;      // 段的南端路点(接上下行的大路)
      return [
        { x: dockX, y: band.mid },
        { x: bx, y: band.mid },
        ...pts.slice(j),
      ];
    }
  }
  return [{ x: dockX, y: band.mid }, { x: bx, y: band.mid }];   // 兜底(数据错误时不悬死)
}

/** 派船(无限模式波次调度):随机一端驶入、随机选桥;
 *  k 为同波船序——错峰入场 + 桥位轮换 + 泊位错道,避免撞船 */
export function sendBoat(wave: number, stagger = 0, k = 0): void {
  const bridges = listBridges();
  if (bridges.length === 0) return;
  const band = riverBand();
  const bx = bridges[k % bridges.length];
  const dir = Math.random() < 0.5 ? 1 : -1;
  const dockX = bx - dir * NAVY.dockOffset;
  const squad = Math.min(NAVY.squadMax, NAVY.squadBase + Math.floor(wave * NAVY.squadPerWave));
  state.boats.push({
    x: dir === 1 ? -90 : W + 90,
    y: band.mid + (k % 2 === 0 ? -8 : 12),   // 双航道错开(相向不叠影)
    dir, bx,
    state: 'sail',
    ph: Math.random() * Math.PI * 2,
    squad, spawnT: 0,
    wave,
    path: buildMarinePath(bx, dockX),
    wait: stagger,
    leaveT: 0,
  });
}

/** 水军下船:强度吃 所属波次 系数 + 敌潮(与同波出怪等价),沿船载路线行军;
 *  精锐散兵与陆上同一条概率轴(抢滩的硬点子) */
function spawnMarine(b: Boat): void {
  const def = ENEMIES['水'];
  const w0 = Math.max(0, b.wave - 1);
  const tide = 1 + TIDE.hpPerSec * state.levelT;
  const hpMul = tide * waveMul(w0);
  const vt = rollVet(w0, false);
  state.enemies.push({
    type: '水',
    x: b.x + b.dir * 26, y: b.y + 4,
    hp: def.hp * hpMul * vt.hp, maxHp: def.hp * hpMul * vt.hp,
    spd: def.spd * waveSpdMul(w0) * (1 + TIDE.spdPerSec * state.levelT) * vt.spd,
    slowT: 0, kbT: 0, armorBreakT: 0, walkPh: Math.random() * Math.PI * 2,
    pauseT: 0, dead: false,
    aimT: 0, aimX: 0, aimY: 0, shotDone: false, tide,
    r: def.r + (vt.vet ? 2 : 0),
    gold: (def.gold + Math.floor(w0 / ENDLESS.goldPer6)) * vt.gold,
    dmg: def.dmg, boss: null, vet: vt.vet,
    path: b.path, wpi: 1,
  });
}

/** 楼船逐帧:航行 → 泊桥(泊定即提示)→ 间歇下船 → 收舷 → 穿桥洞离场 */
export function updateBoats(dt: number): void {
  for (const b of state.boats) {
    b.ph += dt * 2.6;
    if (b.wait > 0) { b.wait -= dt; continue; }
    if (b.state === 'sail') {
      const dockX = b.bx - b.dir * NAVY.dockOffset;
      b.x += b.dir * NAVY.spd * dt;
      if ((b.dir === 1 && b.x >= dockX) || (b.dir === -1 && b.x <= dockX)) {
        b.x = dockX;
        b.state = 'dock';
        b.spawnT = 0.9;
        addFloat(b.x, b.y - 52, '水军抢滩!', '#7ec8e3', 22);
        addEffect(b.x, b.y + 6, 'ripple', 34);
      }
    } else if (b.state === 'dock') {
      if (b.squad > 0) {
        b.spawnT -= dt;
        if (b.spawnT <= 0) {
          b.spawnT = NAVY.interval;
          b.squad--;
          spawnMarine(b);
          addEffect(b.x + b.dir * 30, b.y + 8, 'ripple', 20);
        }
      } else {
        // 下船完毕:收舷短顿,随即启航离场(自原航向穿桥洞驶向对岸)
        b.state = 'leave';
        b.leaveT = 0.8;
        addEffect(b.x, b.y + 6, 'ripple', 26);
      }
    } else {
      if (b.leaveT > 0) { b.leaveT -= dt; continue; }
      b.x += b.dir * NAVY.spd * 1.25 * dt;
    }
  }
  state.boats = state.boats.filter(b => b.x > -120 && b.x < W + 120);
}

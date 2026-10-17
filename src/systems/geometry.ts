/* ============================================================
   几何工具 + 阻挡格自动计算(地图数据的运行时推导)
   ============================================================ */
import type { MapDef, Point } from '../types';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);
export function maxBy<T>(arr: T[], fn: (x: T) => number): T {
  return arr.reduce((m, x) => (fn(x) > fn(m) ? x : m));
}

/** 炮弹抛物线高度:按「已飞距离 / 总距离」取正弦——起飞与落地为 0,中段最高 */
export function shellArcH(flown: number, remain: number, arc: number): number {
  const total = flown + remain;
  if (total <= 0) return 0;
  return Math.sin(Math.PI * clamp(flown / total, 0, 1)) * arc;
}

/** 点到线段距离 */
export function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  return dist(px, py, ax + dx * t, ay + dy * t);
}

/** 路径占用的格子(不可布阵):对每条路线(含出生点段)的每段线段做距离判定,启动时自动计算 */
export function computeBlocked(map: MapDef): Set<string> {
  const blocked = new Set<string>();
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const x = map.colX[c], y = map.rowY[r];
      for (const p of map.paths) {
        const pts = [p.spawn, ...p.points];
        for (let i = 0; i + 1 < pts.length; i++) {
          const a: Point = pts[i], b: Point = pts[i + 1];
          if (pointSegDist(x, y, a.x, a.y, b.x, b.y) <= 40) {
            blocked.add(c + ',' + r);
            break;
          }
        }
      }
    }
  }
  return blocked;
}

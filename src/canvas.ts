/* ============================================================
   画布与视口:DOM 画布、缩放适配、绘图基础工具
   ============================================================ */
import type { Point } from './types';
import { W, H, FONT } from './config';

export const canvas = document.getElementById('game') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
export const view = { scale: 1, ox: 0, oy: 0 };

export function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  view.scale = Math.min(canvas.width / W, canvas.height / H);
  view.ox = (canvas.width - W * view.scale) / 2;
  view.oy = (canvas.height - H * view.scale) / 2;
}

/** 屏幕(物理)坐标 → 逻辑坐标 */
export function toLogical(e: { clientX: number; clientY: number }): Point {
  const rect = canvas.getBoundingClientRect();
  const dx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const dy = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x: (dx - view.ox) / view.scale, y: (dy - view.oy) / view.scale };
}

/** 圆角矩形路径 */
export function rr(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function setFont(size: number, bold = false): void {
  ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT;
}

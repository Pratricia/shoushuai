/* ============================================================
   渲染 · 主菜单/选关背景:暮色楚汉山水
   ------------------------------------------------------------
   纯程序绘制(暮空 / 落日 / 云带 / 三层远山 / 楚河水面 /
   雁阵 / 楚漢水印 / 印章),绘制一次后离屏缓存,逐帧 drawImage。
   ============================================================ */
import { ctx } from '../canvas';
import { W, H, TAU, FONT } from '../config';

let cached: HTMLCanvasElement | null = null;

export function drawMenuBg(): void {
  if (!cached) cached = build();
  ctx.drawImage(cached, 0, 0);
}

function build(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const sun = { x: 100, y: 330 };

  // —— 暮空(暖褐渐变) ——
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#191007');
  sky.addColorStop(0.30, '#42301a');
  sky.addColorStop(0.52, '#7d5227');
  sky.addColorStop(0.66, '#b57c3d');
  sky.addColorStop(0.74, '#d99a4e');
  sky.addColorStop(0.82, '#8a5a2a');
  sky.addColorStop(1, '#241709');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // —— 落日 + 光晕 ——
  const halo = g.createRadialGradient(sun.x, sun.y, 20, sun.x, sun.y, 230);
  halo.addColorStop(0, 'rgba(255,224,160,0.50)');
  halo.addColorStop(1, 'rgba(255,224,160,0)');
  g.fillStyle = halo;
  g.fillRect(sun.x - 230, sun.y - 230, 460, 460);
  g.beginPath();
  g.arc(sun.x, sun.y, 72, 0, TAU);
  g.fillStyle = '#f2cd8a';
  g.fill();
  g.strokeStyle = 'rgba(255,238,196,0.9)';
  g.lineWidth = 3;
  g.stroke();

  // —— 云带(墨色横云 + 暖光带) ——
  const cloud = (x: number, y: number, w: number, h: number, color: string): void => {
    g.beginPath();
    g.ellipse(x, y, w, h, 0, 0, TAU);
    g.fillStyle = color;
    g.fill();
  };
  cloud(210, 250, 150, 13, 'rgba(28,17,8,0.30)');
  cloud(500, 210, 190, 11, 'rgba(28,17,8,0.24)');
  cloud(560, 420, 170, 15, 'rgba(28,17,8,0.26)');
  cloud(140, 470, 130, 12, 'rgba(28,17,8,0.20)');
  cloud(420, 560, 210, 12, 'rgba(255,206,140,0.10)');
  cloud(120, 610, 160, 10, 'rgba(255,206,140,0.08)');

  // —— 三层远山(贝塞尔剪影,由浅入深) ——
  ridge(g, 700, 95, '#8a6234', 0.0);
  ridge(g, 790, 78, '#5c3f20', 2.1);
  ridge(g, 880, 62, '#2f2010', 4.2);

  // —— 楚河水面(下方,含落日倒影与波纹) ——
  const wy = 860;
  const wat = g.createLinearGradient(0, wy, 0, H);
  wat.addColorStop(0, '#7a5227');
  wat.addColorStop(0.22, '#4a3016');
  wat.addColorStop(1, '#1e1206');
  g.fillStyle = wat;
  g.fillRect(0, wy, W, H - wy);
  g.strokeStyle = 'rgba(244,206,146,0.45)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, wy + 1);
  g.lineTo(W, wy + 1);
  g.stroke();
  // 落日倒影(竖向光带)
  const rf = g.createLinearGradient(0, wy, 0, wy + 320);
  rf.addColorStop(0, 'rgba(242,205,138,0.38)');
  rf.addColorStop(1, 'rgba(242,205,138,0)');
  g.fillStyle = rf;
  g.fillRect(sun.x - 62, wy, 124, 320);
  // 波纹(细横线,随深度渐稀渐淡)
  for (let i = 0; i < 17; i++) {
    const y = wy + 16 + i * 23;
    const x0 = ((i * 137) % 420) + (i % 3) * 58;
    const len = 44 + ((i * 53) % 92);
    g.strokeStyle = 'rgba(232,192,128,' + Math.max(0.04, 0.24 - i * 0.012).toFixed(3) + ')';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x0 + len, y);
    g.stroke();
  }

  // —— 雁阵(右上,淡墨勾翅) ——
  const bird = (x: number, y: number, s: number): void => {
    g.strokeStyle = 'rgba(26,16,7,0.8)';
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 11 * s, y);
    g.quadraticCurveTo(x - 5 * s, y - 9 * s, x, y - 2 * s);
    g.quadraticCurveTo(x + 5 * s, y - 9 * s, x + 11 * s, y);
    g.stroke();
  };
  bird(486, 300, 1.0);
  bird(528, 274, 0.85);
  bird(570, 316, 1.05);
  bird(614, 284, 0.8);
  bird(650, 258, 0.7);

  // —— 楚 / 漢 水印(呼应楚河汉界) ——
  g.font = 'bold 250px ' + FONT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(608, 200);
  g.rotate(0.06);
  g.fillStyle = 'rgba(169,50,38,0.13)';
  g.fillText('漢', 0, 0);
  g.restore();
  g.save();
  g.translate(116, 1064);
  g.rotate(-0.05);
  g.fillStyle = 'rgba(169,50,38,0.12)';
  g.fillText('楚', 0, 0);
  g.restore();

  // —— 印章(左下,守帅之印) ——
  g.save();
  g.translate(64, 1180);
  g.rotate(-0.04);
  g.fillStyle = 'rgba(148,44,32,0.88)';
  g.beginPath();
  g.roundRect(-27, -27, 54, 54, 6);
  g.fill();
  g.strokeStyle = 'rgba(255,240,220,0.55)';
  g.lineWidth = 2;
  g.strokeRect(-21, -21, 42, 42);
  g.fillStyle = '#f6e8d8';
  g.font = 'bold 20px ' + FONT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('守', 0, -11);
  g.fillText('帅', 0, 11);
  g.restore();

  // —— 暗角 ——
  const vg = g.createRadialGradient(360, 620, 320, 360, 620, 920);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(8,5,2,0.52)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  // —— 纸面颗粒 ——
  for (let i = 0; i < 240; i++) {
    g.fillStyle = 'rgba(255,240,210,' + (Math.random() * 0.03).toFixed(3) + ')';
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  return cv;
}

/** 远山剪影:正弦叠加起伏,填满到底 */
function ridge(g: CanvasRenderingContext2D, y0: number, amp: number, color: string, ph: number): void {
  g.beginPath();
  g.moveTo(-10, y0);
  for (let x = -10; x <= W + 10; x += 16) {
    const y = y0 - amp * (0.55 + 0.45 * Math.sin(x * 0.012 + ph)) - amp * 0.25 * Math.sin(x * 0.037 + ph * 2.7);
    g.lineTo(x, y);
  }
  g.lineTo(W + 10, H);
  g.lineTo(-10, H);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

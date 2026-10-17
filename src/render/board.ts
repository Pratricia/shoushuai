/* ============================================================
   渲染 · 战场底图:古战场厚重实地
   ------------------------------------------------------------
   世界不止于网格:战场四周是隆起的深色堤岸(岩缘 + 顶光线 +
   向内落影 + 枯树/岩石/战旗剪影),底部是前景暗岸。战场内:
   陶土谷地(行军)/ 凸起高地(布阵,按连片台地分组做色调微差,
   风化石墙崖壁 + 暗苔台面 + 踏秃土斑 + 田垄刻线)/ 深青暗河
   (鱼鳞水纹 + 岸苇)/ 路径跨河自动生厚重木桥 / 朱漆金边帅台。
   最后暖色罩染 + 重暗角统一色调。静态部分按地图离屏缓存;
   荒地封印逐帧绘制(垦荒会改变)。数据全部来自 state.map 与
   state.blocked——高度差即布阵区与行军区的语言。
   ============================================================ */
import { ctx, rr, setFont } from '../canvas';
import { W, H, TAU, FONT } from '../config';
import { state, cellCenter } from '../state';

let cache: { id: string; cv: HTMLCanvasElement } | null = null;

export function drawBoard(): void {
  if (!cache || cache.id !== state.map.id) cache = { id: state.map.id, cv: buildBoard() };
  ctx.drawImage(cache.cv, 0, 0);
}

/** 桥面绘制(底图构建与「船穿桥洞」遮挡重绘共用;纯函数,与静态层逐像素一致) */
export function drawBridgeDeck(g: CanvasRenderingContext2D, bx: number, top: number, bot: number): void {
  const span = bot - top;
  g.fillStyle = '#7a5c38';                            // 老木桥面
  g.fillRect(bx - 31, top, 62, span);
  let k = 0;                                          // 明暗相间厚板
  for (let y = top; y < bot; y += 12) {
    g.fillStyle = (k++ % 2 === 0) ? 'rgba(158,124,78,0.40)' : 'rgba(36,24,12,0.30)';
    g.fillRect(bx - 31, y, 62, Math.min(12, bot - y));
  }
  g.fillStyle = 'rgba(24,16,8,0.55)';                 // 板缝
  for (let y = top + 12; y < bot; y += 12) g.fillRect(bx - 31, y, 62, 2);
  g.fillStyle = '#3a2c18';                            // 粗栏杆
  g.fillRect(bx - 33, top - 4, 7, span + 8);
  g.fillRect(bx + 26, top - 4, 7, span + 8);
  for (const px of [bx - 35, bx + 25]) {              // 端柱(带浅木柱头)
    for (const py of [top - 9, bot - 7]) {
      g.fillStyle = '#3a2c18';
      g.fillRect(px, py, 11, 16);
      g.fillStyle = '#8a6a3e';
      g.fillRect(px, py, 11, 4);
    }
  }
  g.fillStyle = 'rgba(8,26,36,0.45)';                 // 桥下水影
  g.fillRect(bx - 26, bot, 52, 7);
}

/** 静态战场:谷地 / 河 / 桥 / 高地 / 帅台 / 四周堤岸(每张地图构建一次) */
function buildBoard(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const map = state.map;
  const colX = map.colX, rowY = map.rowY;

  // 确定性伪随机(同一地图每次构建纹理一致)
  let s0 = 0;
  for (let i = 0; i < map.id.length; i++) s0 = (s0 * 31 + map.id.charCodeAt(i)) % 2147483647;
  s0 = s0 * 16807 % 2147483647 || 7;
  const rnd = (): number => { s0 = s0 * 16807 % 2147483647; return s0 / 2147483647; };

  // —— 谷地:晒裂的陶土行军地(渐变 + 重斑驳 + 碎石 + 干草簇) ——
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#b39468');
  base.addColorStop(0.5, '#a5855a');
  base.addColorStop(1, '#8f7247');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H;
    const rw = 24 + rnd() * 68;
    g.fillStyle = rnd() < 0.6
      ? 'rgba(74,56,32,' + (0.05 + rnd() * 0.07).toFixed(3) + ')'
      : 'rgba(226,206,168,' + (0.03 + rnd() * 0.04).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(x, y, rw, rw * 0.38, 0, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 80; i++) {                        // 碎石砂砾
    g.fillStyle = 'rgba(70,52,30,' + (0.14 + rnd() * 0.14).toFixed(3) + ')';
    g.beginPath();
    g.arc(rnd() * W, rnd() * H, 1 + rnd() * 1.8, 0, TAU);
    g.fill();
  }
  g.strokeStyle = 'rgba(122,98,58,0.5)';                // 干草簇
  g.lineWidth = 1.3;
  g.lineCap = 'round';
  for (let i = 0; i < 55; i++) {
    const x = rnd() * W, y = 60 + rnd() * (H - 140);
    g.beginPath();
    g.moveTo(x, y); g.lineTo(x - 2.5, y - 6);
    g.moveTo(x + 1.5, y); g.lineTo(x + 2, y - 7);
    g.moveTo(x + 3, y); g.lineTo(x + 6, y - 5);
    g.stroke();
  }

  // —— 楚河汉界:深青暗河(滩岸 + 渐变 + 鱼鳞水纹 + 岸苇) ——
  let rT = 0;
  while (rT + 1 < map.rows && rowY[rT + 1] <= map.river.y) rT++;
  const waterTop = rowY[rT] + 64, waterBot = rowY[rT + 1] - 64;
  const midY = (waterTop + waterBot) / 2;

  // 桥位先算(跨河检测),岸苇避开桥区
  const bridges: number[] = [];
  for (const p of map.paths) {
    const pts = p.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (Math.min(a.y, b.y) < waterBot && Math.max(a.y, b.y) > waterTop) {
        const t = (midY - a.y) / (b.y - a.y);
        const bx = Math.round(a.x + (b.x - a.x) * t);
        if (!bridges.some(v => Math.abs(v - bx) < 40)) bridges.push(bx);
      }
    }
  }

  g.fillStyle = 'rgba(96,74,44,0.6)';                   // 两岸滩泥
  g.fillRect(0, waterTop - 9, W, 9);
  g.fillRect(0, waterBot, W, 9);
  const water = g.createLinearGradient(0, waterTop, 0, waterBot);
  water.addColorStop(0, '#3d7a8c');
  water.addColorStop(0.45, '#2d6274');
  water.addColorStop(1, '#1f4a5c');
  g.fillStyle = water;
  g.fillRect(0, waterTop, W, waterBot - waterTop);
  g.strokeStyle = 'rgba(176,214,220,0.16)';             // 鱼鳞水纹(交错鳞行)
  g.lineWidth = 1.4;
  let wrow = 0;
  for (let y = waterTop + 10; y < waterBot - 3; y += 11) {
    const off = (wrow++ % 2) * 13;
    g.beginPath();
    for (let x = -8 + off; x < W + 8; x += 26) {
      g.moveTo(x + 7, y);
      g.arc(x, y, 7, 0, Math.PI, false);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(10,34,44,0.45)';                // 水线(岸口收边)
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, waterTop); g.lineTo(W, waterTop);
  g.moveTo(0, waterBot); g.lineTo(W, waterBot);
  g.stroke();
  g.strokeStyle = 'rgba(52,60,30,0.75)';                // 岸苇(桥区避开)
  g.lineWidth = 1.6;
  for (let i = 0; i < 18; i++) {
    const x = 20 + rnd() * (W - 40);
    if (bridges.some(bx => Math.abs(bx - x) < 46)) continue;
    const topBank = i % 2 === 0;
    const y = topBank ? waterTop - 1 : waterBot + 1;
    const dy = topBank ? -1 : 1;
    for (let b = -1; b <= 1; b++) {
      g.beginPath();
      g.moveTo(x + b * 3, y);
      g.quadraticCurveTo(x + b * 4.5, y + dy * 6, x + b * 6, y + dy * (9 + rnd() * 4));
      g.stroke();
    }
  }
  g.fillStyle = 'rgba(206,230,232,0.38)';               // 河名(浅色小字,嵌暗水)
  g.font = 'bold 22px ' + FONT;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const lb of map.river.labels) g.fillText(lb.text, lb.x, midY + 2);

  // —— 桥:路径跨河处自动生成(厚重老木:深板 + 黑缝 + 粗栏杆端柱) ——
  for (const bx of bridges) drawBridgeDeck(g, bx, waterTop - 10, waterBot + 10);

  // —— 高地:非道路格的凸起台地(相邻格连片,按台地分组做色调微差) ——
  const PHALF = 57;     // 平台半宽(7 列 95px 列距:水平搭接 19px、垂直搭接 6px,圆角合并无露缝)
  const PRAD = 14;      // 平台圆角半径(去方块感;搭接缝处只余浅凹,似丘陵鞍部)
  const CLIFF = 15;     // 石墙崖壁露出高度(加高,更有台地断崖感)
  const cells: { c: number; r: number }[] = [];
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (!state.blocked.has(c + ',' + r)) cells.push({ c, r });
    }
  }
  const cellSet = new Set(cells.map(cell => cell.c + ',' + cell.r));
  // 连通域标记(四邻):同一片台地同色调,片与片之间有微差——不是图章阵列
  const compOf = new Map<string, number>();
  let nComp = 0;
  for (const cell of cells) {
    const k0 = cell.c + ',' + cell.r;
    if (compOf.has(k0)) continue;
    const idx = nComp++;
    compOf.set(k0, idx);
    const stack = [cell];
    while (stack.length) {
      const cur = stack.pop()!;
      const nb: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dc, dr] of nb) {
        const nk = (cur.c + dc) + ',' + (cur.r + dr);
        if (cellSet.has(nk) && !compOf.has(nk)) {
          compOf.set(nk, idx);
          stack.push({ c: cur.c + dc, r: cur.r + dr });
        }
      }
    }
  }
  const TINTS = ['#66794d', '#6e8051', '#5f7247', '#6a7a49', '#62754e', '#71804f'];
  const rrect = (c2: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void => {
    c2.moveTo(x + r, y);
    c2.arcTo(x + w, y, x + w, y + h, r);
    c2.arcTo(x + w, y + h, x, y + h, r);
    c2.arcTo(x, y + h, x, y, r);
    c2.arcTo(x, y, x + w, y, r);
    c2.closePath();
  };
  const traceCells = (c2: CanvasRenderingContext2D): void => {
    c2.beginPath();
    for (const cell of cells) rrect(c2, colX[cell.c] - PHALF, rowY[cell.r] - PHALF, PHALF * 2, PHALF * 2, PRAD);
  };
  // 整片台地的重落影
  g.save();
  g.shadowColor = 'rgba(24,14,4,0.45)';
  g.shadowBlur = 16;
  g.shadowOffsetX = 6;
  g.shadowOffsetY = 10;
  traceCells(g);
  g.fillStyle = '#5a5347';
  g.fill();
  g.restore();
  // 台地层:石墙基色 → 凿痕 → 分组色调台面 → 踏秃土斑 → 顶光渐变 → 草屑 → 田垄刻线 → 外缘北受光条
  const hi = document.createElement('canvas');
  hi.width = W;
  hi.height = H;
  const hg = hi.getContext('2d')!;
  traceCells(hg);
  hg.fillStyle = '#5a5347';                             // 风化石墙
  hg.fill();
  hg.globalCompositeOperation = 'source-atop';
  hg.save();                                            // 凿痕(短竖纹,只存活于崖壁带)
  for (let i = 0; i < cells.length * 14; i++) {
    const cell = cells[(rnd() * cells.length) | 0];
    const x = colX[cell.c] - PHALF + rnd() * PHALF * 2;
    const y = rowY[cell.r] + PHALF - 2 - rnd() * CLIFF;
    hg.strokeStyle = rnd() < 0.5 ? 'rgba(28,24,18,0.40)' : 'rgba(158,148,126,0.22)';
    hg.lineWidth = 1;
    hg.beginPath();
    hg.moveTo(x, y);
    hg.lineTo(x + (rnd() - 0.5) * 3, y + 3 + rnd() * 5);
    hg.stroke();
  }
  hg.restore();
  hg.save();
  hg.translate(0, -CLIFF);
  for (const cell of cells) {                           // 分组色调台面(逐格填,同组同色无缝)
    hg.fillStyle = TINTS[compOf.get(cell.c + ',' + cell.r)! % TINTS.length];
    hg.fillRect(colX[cell.c] - PHALF, rowY[cell.r] - PHALF, PHALF * 2, PHALF * 2);
  }
  for (const cell of cells) {                           // 踏秃土斑
    const x = colX[cell.c] + (rnd() - 0.5) * 44;
    const y = rowY[cell.r] + (rnd() - 0.5) * 44;
    hg.fillStyle = 'rgba(94,78,48,0.16)';
    hg.beginPath();
    hg.ellipse(x, y, 11 + rnd() * 9, 6 + rnd() * 5, rnd() * 3, 0, TAU);
    hg.fill();
  }
  const tg = hg.createLinearGradient(0, 0, 0, H);       // 顶光渐变(上亮下沉)
  tg.addColorStop(0, 'rgba(238,240,190,0.18)');
  tg.addColorStop(0.5, 'rgba(238,240,190,0.03)');
  tg.addColorStop(1, 'rgba(12,26,12,0.18)');
  hg.fillStyle = tg;
  traceCells(hg);
  hg.fill();
  hg.lineCap = 'round';                                 // 草屑(枯亮/深暗相间)
  for (const cell of cells) {
    for (let i = 0; i < 3; i++) {
      const x = colX[cell.c] + (rnd() - 0.5) * 76;
      const y = rowY[cell.r] + (rnd() - 0.5) * 76;
      hg.strokeStyle = rnd() < 0.5 ? 'rgba(28,44,18,0.35)' : 'rgba(168,176,110,0.28)';
      hg.lineWidth = 1.2;
      hg.beginPath();
      hg.moveTo(x, y);
      hg.lineTo(x + 1.5, y - 3.5);
      hg.moveTo(x + 4, y + 1);
      hg.lineTo(x + 5.5, y - 2.5);
      hg.stroke();
    }
  }
  hg.strokeStyle = 'rgba(220,212,176,0.16)';            // 田垄刻线(浅色蚀刻,圆角方框;严格落在台面内不压崖壁)
  hg.lineWidth = 1.5;
  {                                                     // 刻线尺寸随格距自适应(与荒地封印同一口径:战役仍是 88×85,对战半场的 84 密格收成 78×75,不再互相压边)
    const ep = Math.min(colX[1] - colX[0], rowY[1] - rowY[0]);
    const ew = Math.min(88, Math.round(ep * 0.93));
    const eh = Math.round(ew * 85 / 88);
    const dy = Math.round(eh * 36 / 85);
    const rad = Math.round(ew / 8.8);
    for (const cell of cells) {
      const x = colX[cell.c] - ew / 2, y = rowY[cell.r] - dy, w2 = ew, h2 = eh;
      hg.beginPath();
      hg.moveTo(x + rad, y);
      hg.arcTo(x + w2, y, x + w2, y + h2, rad);
      hg.arcTo(x + w2, y + h2, x, y + h2, rad);
      hg.arcTo(x, y + h2, x, y, rad);
      hg.arcTo(x, y, x + w2, y, rad);
      hg.closePath();
      hg.stroke();
    }
  }
  hg.fillStyle = 'rgba(255,248,214,0.30)';              // 北缘受光细条(只画整片台地的外缘北边)
  for (const cell of cells) {                             // 注意:处于 translate(-CLIFF) 系内,+CLIFF 补偿后恰落在轮廓顶缘
    if (cellSet.has(cell.c + ',' + (cell.r - 1))) continue;
    hg.fillRect(colX[cell.c] - PHALF, rowY[cell.r] - PHALF + CLIFF, PHALF * 2, 2.5);
  }
  hg.restore();
  hg.globalCompositeOperation = 'source-over';
  g.drawImage(hi, 0, 0);
  // 崖脚滚石(只落在 facing 道路的外缘崖脚下,嵌进落影带——崖壁风化感)
  for (const cell of cells) {
    if (cell.r + 1 >= map.rows || !state.blocked.has(cell.c + ',' + (cell.r + 1))) continue;
    const nb = 1 + ((rnd() * 2) | 0);
    for (let i = 0; i < nb; i++) {
      const bx = colX[cell.c] + (rnd() - 0.5) * 78;
      const by = rowY[cell.r] + PHALF + rnd() * 4;
      const bs = 3.5 + rnd() * 3.5;
      g.fillStyle = '#4a4438';
      g.beginPath();
      g.moveTo(bx - bs, by + bs * 0.4);
      g.lineTo(bx - bs * 0.4, by - bs * 0.7);
      g.lineTo(bx + bs * 0.5, by - bs * 0.5);
      g.lineTo(bx + bs, by + bs * 0.45);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(190,178,150,0.22)';
      g.beginPath();
      g.moveTo(bx - bs * 0.4, by - bs * 0.7);
      g.lineTo(bx + bs * 0.5, by - bs * 0.5);
      g.lineTo(bx + bs * 0.2, by - bs * 0.1);
      g.lineTo(bx - bs * 0.3, by - bs * 0.2);
      g.closePath();
      g.fill();
    }
  }

  // —— 帅台:路径终点的深朱漆金边高台(对战图两座并立:shuaiCell + shuai2Cell) ——
  const [sc, sr] = map.shuaiCell;
  const sx = colX[sc], sy = rowY[sr];
  const drawDais = (dx: number, dy: number): void => {
  g.save();
  g.shadowColor = 'rgba(24,14,4,0.5)';
  g.shadowBlur = 18;
  g.shadowOffsetX = 6;
  g.shadowOffsetY = 11;
  g.fillStyle = '#5a5347';
  g.beginPath();
  rrect(g, dx - 54, dy - 54, 108, 108 + CLIFF, 15);
  g.fill();
  g.restore();
  const dz = g.createLinearGradient(0, dy - 54, 0, dy + 54);   // 深朱漆台面
  dz.addColorStop(0, '#7e3a28');
  dz.addColorStop(0.5, '#6e2f22');
  dz.addColorStop(1, '#5a241a');
  g.fillStyle = dz;
  g.beginPath();
  rrect(g, dx - 54, dy - 54, 108, 108, 15);
  g.fill();
  g.lineWidth = 3;                                      // 金边双线(随圆角)
  g.strokeStyle = 'rgba(212,169,64,0.95)';
  g.beginPath();
  rrect(g, dx - 49, dy - 49, 98, 98, 12);
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,224,150,0.55)';
  g.beginPath();
  rrect(g, dx - 43, dy - 43, 86, 86, 9);
  g.stroke();
  g.fillStyle = '#d4a940';                              // 金钉(四边中点)
  g.fillRect(dx - 3.5, dy - 53, 7, 7);
  g.fillRect(dx - 3.5, dy + 46, 7, 7);
  g.fillRect(dx - 53, dy - 3.5, 7, 7);
  g.fillRect(dx + 46, dy - 3.5, 7, 7);
  const glow = g.createRadialGradient(dx, dy, 8, dx, dy, 76);   // 帅台暖光晕(视线锚点)
  glow.addColorStop(0, 'rgba(255,204,120,0.10)');
  glow.addColorStop(1, 'rgba(255,204,120,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(dx, dy, 76, 0, TAU);
  g.fill();
  };
  drawDais(sx, sy);
  if (map.shuai2Cell) drawDais(colX[map.shuai2Cell[0]], rowY[map.shuai2Cell[1]]);

  // —— 战场四周:隆起的深色堤岸(世界在网格之外继续) ——
  // 内缘自适应:边缘格是台地/帅台时,堤岸内伸咬住其边——陆地连成一片,不再孤零零;
  // 道路格处退后,留出行军走廊
  const gridL = colX[0] - PHALF, gridR = colX[map.cols - 1] + PHALF;
  const gridT = rowY[0] - PHALF, gridB = rowY[map.rows - 1] + PHALF + CLIFF;
  const bermL = Math.min(74, Math.max(18, gridL - 16));
  const bermR = Math.min(74, Math.max(18, W - gridR - 16));
  const bermBot = Math.max(gridB + 26, H - 190);
  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const faceX0 = gridL + 3;                             // 左列台地西缘(咬入 3px 消缝)
  const faceX1 = gridR - 3;                             // 右列台地东缘
  const faceYB = rowY[map.rows - 1] + PHALF - 3;        // 末行台地南缘
  const daisYB = rowY[sr] + 54 + CLIFF - 3;             // 帅台南缘
  const rowConn = (y: number, c: number): number => {
    // y 对 c 列各台地面的连接度:面内 1,面外 30px 线性衰减
    let t = 0;
    for (let r = 0; r < map.rows; r++) {
      if (state.blocked.has(c + ',' + r)) continue;
      const top = rowY[r] - PHALF, bot = rowY[r] + PHALF;
      const d = y < top ? top - y : y > bot ? y - bot : 0;
      const tr = clamp01(1 - d / 30);
      if (tr > t) t = tr;
    }
    return t;
  };
  const biteL = (y: number): number => (Math.sin(y * 0.06 + 0.8) + 1) * 1.2;   // 咬入量微起伏(有机边缘)
  const edgeL = (y: number): number => {
    const k = clamp01((gridT + 70 - y) / 130);
    const bulge = 26 * k * k;
    const wob = Math.sin(y * 0.012 + 1.7) * 8 + Math.sin(y * 0.029 + 3.9) * 4;
    const base = bermL + wob + bulge;
    const t = rowConn(y, 0);
    return base + (faceX0 + biteL(y) - base) * t;
  };
  const edgeR = (y: number): number => {
    const k = clamp01((gridT + 70 - y) / 130);
    const bulge = 26 * k * k;
    const wob = Math.sin(y * 0.012 + 4.2) * 8 + Math.sin(y * 0.029 + 1.3) * 4;
    const base = W - (bermR + wob + bulge);
    const t = rowConn(y, map.cols - 1);
    return base + (faceX1 - biteL(y) - base) * t;
  };
  const edgeB = (x: number): number => {
    const wobB = Math.sin(x * 0.017 + 2.2) * 7 + Math.sin(x * 0.041) * 4;
    const base = bermBot + wobB;
    let t = 0, target = faceYB;
    const lastR = map.rows - 1;
    for (let c = 0; c < map.cols; c++) {
      const isDais = c === sc && sr === lastR;
      if (state.blocked.has(c + ',' + lastR) && !isDais) continue;
      const left = colX[c] - PHALF, right = colX[c] + PHALF;
      const d = x < left ? left - x : x > right ? x - right : 0;
      const tc2 = clamp01(1 - d / 30);
      if (tc2 > t) { t = tc2; target = isDais ? daisYB : faceYB; }
    }
    return base + (target - (Math.sin(x * 0.06 + 1.9) + 1) * 1.2 - base) * t;
  };

  const sideBerm = (side: 'L' | 'R'): void => {
    const edge = side === 'L' ? edgeL : edgeR;
    const off = side === 'L' ? -20 : W + 20;
    const berm = side === 'L' ? bermL : bermR;
    const traceEdge = (): void => {
      g.beginPath();
      for (let y = 24; y <= H + 40; y += 18) {
        const x = edge(y);
        if (y === 24) g.moveTo(x, y); else g.lineTo(x, y);
      }
    };
    const traceBody = (): void => {
      g.beginPath();
      g.moveTo(off, 24);
      for (let y = 24; y <= H + 40; y += 18) g.lineTo(edge(y), y);
      g.lineTo(off, H + 40);
      g.closePath();
    };
    // 向内落影(先画,堤身盖住外半)
    const sh = side === 'L'
      ? g.createLinearGradient(berm - 20, 0, berm + 44, 0)
      : g.createLinearGradient(W - berm + 20, 0, W - berm - 44, 0);
    sh.addColorStop(0, 'rgba(16,10,4,0.5)');
    sh.addColorStop(1, 'rgba(16,10,4,0)');
    g.strokeStyle = sh;
    g.lineWidth = 48;
    traceEdge();
    g.stroke();
    // 堤身
    g.save();
    traceBody();
    g.clip();
    const bg = side === 'L'
      ? g.createLinearGradient(0, 0, berm + 40, 0)
      : g.createLinearGradient(W, 0, W - berm - 40, 0);
    bg.addColorStop(0, '#3a3020');
    bg.addColorStop(1, '#241c11');
    g.fillStyle = bg;
    g.fillRect(-30, 0, W + 60, H);
    g.strokeStyle = '#191308';                          // 岩缘暗带
    g.lineWidth = 16;
    traceEdge();
    g.stroke();
    g.strokeStyle = 'rgba(210,196,160,0.06)';           // 岩面纹理
    g.lineWidth = 1.5;
    for (let i = 0; i < 46; i++) {
      const y = rnd() * H;
      const x = side === 'L' ? rnd() * (berm + 24) : W - rnd() * (berm + 24);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (side === 'L' ? 1 : -1) * (6 + rnd() * 10), y + 3 + rnd() * 6);
      g.stroke();
    }
    g.restore();
    // 内缘顶光线
    g.strokeStyle = 'rgba(214,198,158,0.30)';
    g.lineWidth = 1.5;
    traceEdge();
    g.stroke();
  };
  sideBerm('L');
  sideBerm('R');

  // 底部前景暗岸(观者所站的近岸,兵营坐落其上)
  {
    g.strokeStyle = 'rgba(16,10,4,0.45)';               // 向上落影
    g.lineWidth = 44;
    const grad = g.createLinearGradient(0, bermBot - 34, 0, bermBot + 20);
    grad.addColorStop(0, 'rgba(16,10,4,0)');
    grad.addColorStop(1, 'rgba(16,10,4,0.5)');
    g.strokeStyle = grad;
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 18) { if (x === -20) g.moveTo(x, edgeB(x)); else g.lineTo(x, edgeB(x)); }
    g.stroke();
    g.beginPath();                                      // 岸身
    g.moveTo(-20, H + 20);
    for (let x = -20; x <= W + 20; x += 18) g.lineTo(x, edgeB(x));
    g.lineTo(W + 20, H + 20);
    g.closePath();
    const bg = g.createLinearGradient(0, bermBot, 0, H);
    bg.addColorStop(0, '#2a2114');
    bg.addColorStop(1, '#191208');
    g.fillStyle = bg;
    g.fill();
    g.strokeStyle = 'rgba(214,198,158,0.22)';           // 缘线
    g.lineWidth = 1.5;
    g.beginPath();
    for (let x = -20; x <= W + 20; x += 18) { if (x === -20) g.moveTo(x, edgeB(x)); else g.lineTo(x, edgeB(x)); }
    g.stroke();
  }

  // —— 堤岸道具:枯树 / 岩石 / 战旗 / 拒马(剪影,确定性摆放) ——
  const rock = (x: number, y: number, s: number): void => {
    g.fillStyle = 'rgba(14,9,4,0.35)';
    g.beginPath();
    g.ellipse(x + 2, y + s * 0.3, s * 1.15, s * 0.42, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#3c372d';
    g.beginPath();
    g.moveTo(x - s, y + s * 0.3);
    g.lineTo(x - s * 0.5, y - s * 0.7);
    g.lineTo(x + s * 0.3, y - s * 0.9);
    g.lineTo(x + s, y - s * 0.1);
    g.lineTo(x + s * 0.7, y + s * 0.35);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(196,182,150,0.18)';
    g.beginPath();
    g.moveTo(x - s * 0.5, y - s * 0.7);
    g.lineTo(x + s * 0.3, y - s * 0.9);
    g.lineTo(x + s * 0.5, y - s * 0.45);
    g.lineTo(x - s * 0.3, y - s * 0.35);
    g.closePath();
    g.fill();
  };
  const deadTree = (x: number, y: number, h: number): void => {
    g.strokeStyle = 'rgba(14,9,4,0.3)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + h * 0.45, y + 4);
    g.stroke();
    g.strokeStyle = '#241b10';
    g.lineCap = 'round';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 2, y - h);
    g.stroke();
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(x + 1, y - h * 0.55);
    g.lineTo(x - h * 0.32, y - h * 0.82);
    g.moveTo(x + 1.5, y - h * 0.7);
    g.lineTo(x + h * 0.34, y - h * 0.95);
    g.moveTo(x + 2, y - h);
    g.lineTo(x - h * 0.1, y - h * 1.18);
    g.stroke();
  };
  const banner = (x: number, y: number, h: number, col: string, dir: number): void => {
    g.fillStyle = 'rgba(14,9,4,0.3)';
    g.beginPath();
    g.ellipse(x + 3, y + 2, 7, 3, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#2a2014';
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, y - h);
    g.stroke();
    g.fillStyle = col;                                  // 破旗(燕尾残边;dir=旗帜飘向,两侧堤岸都朝战场内)
    g.beginPath();
    g.moveTo(x + dir, y - h);
    g.quadraticCurveTo(x + dir * 13, y - h + 3, x + dir * 21, y - h + 1);
    g.lineTo(x + dir * 17, y - h + 7);
    g.lineTo(x + dir * 22, y - h + 12);
    g.quadraticCurveTo(x + dir * 11, y - h + 12, x + dir, y - h + 15);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(dir > 0 ? x + 1 : x - 15, y - h + 11, 14, 1.5);
  };
  const abatis = (x: number, y: number, s: number): void => {
    g.strokeStyle = '#3a2c18';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - s, y + 3);
    g.lineTo(x + s * 0.6, y - s * 0.8);
    g.moveTo(x + s, y + 3);
    g.lineTo(x - s * 0.6, y - s * 0.8);
    g.moveTo(x - s * 0.8, y - s * 0.3);
    g.lineTo(x + s * 0.8, y - s * 0.3);
    g.stroke();
  };
  const wide = bermL > 50;                              // 窄堤(孤军图)道具缩小减量
  const ts = wide ? 1 : 0.72;
  // 左堤(旗帜朝右=战场内)
  deadTree(bermL * 0.45, 300 + rnd() * 60, 40 * ts);
  rock(bermL * 0.55, 180 + rnd() * 40, 11 * ts);
  banner(bermL * 0.62, 470 + rnd() * 50, 52 * ts, '#6e2a1c', 1);
  rock(bermL * 0.4, 640 + rnd() * 50, 9 * ts);
  if (wide) deadTree(bermL * 0.5, 820 + rnd() * 60, 36 * ts);
  banner(bermL * 0.6, 960 + rnd() * 40, 46 * ts, '#2e2a22', 1);
  // 右堤(旗帜朝左=战场内)
  rock(W - bermR * 0.5, 220 + rnd() * 40, 12 * ts);
  banner(W - bermR * 0.62, 380 + rnd() * 50, 50 * ts, '#2e2a22', -1);
  deadTree(W - bermR * 0.45, 560 + rnd() * 60, 38 * ts);
  rock(W - bermR * 0.55, 740 + rnd() * 50, 10 * ts);
  if (wide) banner(W - bermR * 0.6, 880 + rnd() * 40, 48 * ts, '#6e2a1c', -1);
  deadTree(W - bermR * 0.5, 1060 + rnd() * 50, 32 * ts);
  // 顶角(城门旁的高地肩;压在顶栏之下、门楼之侧,不埋进 HUD)
  rock(edgeL(gridT + 12) - 12, gridT + 12, 12 * ts);
  rock(edgeR(gridT + 12) + 12, gridT + 18, 10 * ts);
  // 底部前景:碎石 + 拒马(限 x≤470、贴近岸缘——避开兵营槽位与右侧按钮组)
  for (let i = 0; i < 6; i++) rock(30 + rnd() * 440, bermBot + 6 + rnd() * 24, 5 + rnd() * 5);
  abatis(150, bermBot + 24, 13);
  abatis(400, bermBot + 30, 11);

  // —— 暖色罩染(统一色调)+ 重暗角 + 砂砾颗粒 ——
  g.fillStyle = 'rgba(64,44,22,0.07)';
  g.fillRect(0, 0, W, H);
  const vg = g.createRadialGradient(W / 2, H / 2, 400, W / 2, H / 2, 900);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(18,12,6,0.30)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = rnd() < 0.5
      ? 'rgba(240,230,200,' + (rnd() * 0.022).toFixed(3) + ')'
      : 'rgba(20,14,6,' + (rnd() * 0.03).toFixed(3) + ')';
    g.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  return cv;
}

/** 荒地:高地台面上的废弃封印(垦荒令可开辟);已占格由棋子覆盖;道路格无台面不画 */
export function drawGridCells(rowA = 0, rowB = Number.MAX_SAFE_INTEGER): void {
  const map = state.map;
  const lo = Math.max(0, rowA), hi = Math.min(map.rows - 1, rowB);
  for (let r = lo; r <= hi; r++) {
    for (let c = 0; c < map.cols; c++) {
      const key = c + ',' + r;
      if (state.blocked.has(key)) continue;
      if (state.wasteland.has(key)) drawWasteland(c, r);
    }
  }
}

/** 单格图形(荒地封印 / 宫区高亮)的自适应边长:
 *  取格距的 0.93,再以 88 封顶——战役 7×9 算出来仍是 88(观感不变),
 *  对战半场是 8 列 × 84 的密格,固定 88 会让相邻封印的边框互相压边 */
function cellTile(): { size: number; h: number; s: number } {
  const map = state.map;
  const pitch = Math.min(map.colX[1] - map.colX[0], map.rowY[1] - map.rowY[0]);
  const size = Math.min(88, Math.round(pitch * 0.93));
  return { size, h: size / 2, s: size / 88 };
}

/** 荒地:台面灰白枯斑 + 干裂纹 + 「荒」字封印(死土嵌在暗苔活地上;整体上移 6px 与台面同步,不压崖壁) */
function drawWasteland(c: number, r: number): void {
  const t = cellTile();
  const cc = cellCenter(c, r);
  const cy = cc.y - 6;
  ctx.save();
  rr(cc.x - t.h, cy - t.h, t.size, t.size, 10 * t.s);
  ctx.fillStyle = 'rgba(184,172,146,0.55)';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(64,52,34,0.5)';
  ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(cc.x - 54 * t.s + i * 17 * t.s, cy - 54 * t.s);
    ctx.lineTo(cc.x - 22 * t.s + i * 17 * t.s, cy + 54 * t.s);
    ctx.stroke();
  }
  ctx.restore();
  rr(cc.x - t.h, cy - t.h, t.size, t.size, 10 * t.s);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(196,186,160,0.85)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(74,60,40,0.9)';
  setFont(Math.round(40 * t.s), true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('荒', cc.x, cy + 2 * t.s);
}

/** 帅的宫区:拖仕时的可驻格高亮(荒地格亦可驻扎,标「可驻」) */
export function drawPalace(): void {
  const map = state.map;
  const [sc, sr] = map.shuaiCell;
  const d = state.drag;
  if (d && d.kind === 'piece' && d.piece && d.piece.type === '仕') {
    const t = cellTile();
    for (let r = sr - 2; r <= sr; r++) {
      for (let c = sc - 1; c <= sc + 1; c++) {
        if (c < 0 || c >= map.cols || r < 0 || r >= map.rows) continue;
        const key = c + ',' + r;
        if (state.blocked.has(key)) continue;
        const cc = cellCenter(c, r);
        ctx.beginPath();
        ctx.arc(cc.x, cc.y, t.h, 0, TAU);
        ctx.fillStyle = state.wasteland.has(key) ? 'rgba(249,168,37,0.26)' : 'rgba(249,168,37,0.15)';
        ctx.fill();
        ctx.lineWidth = 3 * t.s;
        ctx.strokeStyle = '#f9a825';
        ctx.setLineDash([7 * t.s, 5 * t.s]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (state.wasteland.has(key)) {
          setFont(Math.round(18 * t.s), true);
          ctx.fillStyle = '#ffd54f';
          ctx.textAlign = 'center';
          ctx.fillText('可驻', cc.x, cc.y + 30 * t.s);
        }
      }
    }
  }
}

/** 敌营城楼:土丘基座上的垛口石木要塞(敌军在楼内生成、自门洞涌出) */
export function drawGates(): void {
  for (const p of state.map.paths) {
    const gx = p.spawn.x, gy = p.spawn.y;
    // 门洞朝向行军方向:出怪口一律朝场内走,故城楼整体上下镜像到「行军那一侧」
    const up = (p.points[0]?.y ?? gy) < gy;
    // 土丘基座(城楼坐落在夯土丘上;半径收窄,不压及邻格平台)——固定不镜像
    ctx.fillStyle = '#4c3e28';
    ctx.beginPath();
    ctx.ellipse(gx, gy + 20, 50, 28, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(216,198,158,0.10)';
    ctx.beginPath();
    ctx.ellipse(gx - 5, gy + 12, 40, 21, 0, 0, TAU);
    ctx.fill();
    // 城楼投影(固定向下,受光来自北面)
    ctx.fillStyle = 'rgba(20,12,4,0.35)';
    ctx.beginPath();
    ctx.ellipse(gx + 5, gy + 48, 54, 14, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    if (up) { ctx.translate(0, gy * 2); ctx.scale(1, -1); }   // 镜像:垛口翻到下缘、门洞翻到上缘
    // 城楼主体(石木)
    rr(gx - 44, gy - 44, 88, 88, 10);
    ctx.fillStyle = '#3e3322';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1a140a';
    ctx.stroke();
    // 垛口(城顶锯齿)
    ctx.fillStyle = '#57462c';
    for (let i = 0; i < 5; i++) ctx.fillRect(gx - 40 + i * 17, gy - 44, 11, 9);
    // 城墙内线
    rr(gx - 34, gy - 28, 68, 68, 6);
    ctx.strokeStyle = 'rgba(230,220,196,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 门洞(朝向行军方向)+ 木门框
    rr(gx - 20, gy + 6, 40, 38, 10);
    ctx.fillStyle = '#6b5232';
    ctx.fill();
    rr(gx - 15, gy + 11, 30, 33, 8);
    ctx.fillStyle = '#14100a';
    ctx.fill();
    ctx.restore();
    // 城楼名(不随城楼镜像,永远正着写;让开门洞)
    ctx.fillStyle = '#ece2c6';
    setFont(24, true);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('敌营', gx, gy + (up ? 13 : -12));
  }
}

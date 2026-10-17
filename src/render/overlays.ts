/* ============================================================
   渲染 · 覆盖层:主菜单(模式选择)/ 选关 / 暂停 / 过关 / 失败 / 通关
   ============================================================ */
import { ctx, rr, setFont } from '../canvas';
import { W, H, TAU, PAPER, INK, GEAR_BAG } from '../config';
import { state } from '../state';
import { LEVELS } from '../data/levels';
import { getMap } from '../data/maps';
import { saveData, ownsGear, inBag, bagList, bagActiveCount, passiveList, passiveCarryCount, passiveOwnedCount, carriesGear, duelRankState } from '../save';
import { GEAR, gearOf } from '../data/shop';
import type { GearDef } from '../data/shop';
import { rankTitle, levelCn, rankAt, winsToPromote } from '../data/ranks';
import { FUS } from '../data/fu';
import type { FuDef } from '../data/fu';

function dim(): void {
  ctx.fillStyle = 'rgba(24,19,12,0.66)';
  ctx.fillRect(0, 0, W, H);
}

/** 菜单/选关/集市用轻压暗:让山水背景透出来 */
function dimLight(): void {
  ctx.fillStyle = 'rgba(24,19,12,0.30)';
  ctx.fillRect(0, 0, W, H);
}

/** 军饷铜钱(圆钱方孔,古钱制式) */
function drawCoin(x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = '#c9a227';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.15);
  ctx.strokeStyle = '#8a6a3a';
  ctx.stroke();
  const h = r * 0.62;
  ctx.fillStyle = 'rgba(24,19,12,0.55)';
  ctx.fillRect(x - h / 2, y - h / 2, h, h);
}

/** 符片(Boss 掉落的铸符材料,金质令箭形) */
function drawShard(x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  rr(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4, r * 0.25);
  ctx.fillStyle = '#f9a825';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.strokeStyle = '#8a6a3a';
  ctx.stroke();
  ctx.restore();
}

/** 发饷展示行(结算页共用):铜钱 + 军饷 +N · 缘由(过长自动收字号,不越纸面) */
function drawMoneyGain(y: number): void {
  if (state.moneyGain <= 0) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const txt = '军饷 +' + state.moneyGain + (state.moneyNote ? ' · ' + state.moneyNote : '');
  let size = 26;
  const maxW = 344;
  setFont(size, true);
  let w = ctx.measureText(txt).width;
  while (w > maxW && size > 15) { size -= 1; setFont(size, true); w = ctx.measureText(txt).width; }
  drawCoin(360 - w / 2 - size * 0.5 - 9, y, size * 0.5);
  ctx.fillStyle = '#c9a227';
  ctx.fillText(txt, 360, y);
}

/* ---------- 对战段位结算行(胜/败页共用) ---------- */

/** 亮出本局的段位推进:升段(带告示与犒赏)/ 等级变化 / 败局亮段位 */
function drawDuelRankLine(y: number): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const p = state.rankUp;
  const rk = duelRankState();
  if (!p) {
    // 败局:段位只升不降,亮出当前段位与升段进度
    ctx.fillStyle = '#8a7a5c';
    setFont(21, true);
    ctx.fillText('对垒段位 · ' + rankTitle(rk.tier, rk.level), 360, y);
    setFont(16, false);
    ctx.fillText(rk.atTop ? '已至最高段位' : '再胜 ' + winsToPromote(rk.tier, rk.level) + ' 场升段', 360, y + 26);
    return;
  }
  if (p.promoted) {
    ctx.fillStyle = '#c9a227';
    setFont(26, true);
    ctx.fillText('升 段 · ' + rankTitle(p.tier, p.level), 360, y);
    setFont(16, false);
    ctx.fillStyle = '#8a7a5c';
    ctx.fillText(rankAt(p.tier).note + ' · 犒赏 +' + p.reward, 360, y + 28);
  } else {
    ctx.fillStyle = '#1f6a7a';
    setFont(22, true);
    ctx.fillText('等级提升 · ' + levelCn(p.fromLevel) + ' → ' + levelCn(p.level), 360, y);
    setFont(16, false);
    ctx.fillStyle = '#8a7a5c';
    ctx.fillText(rk.atTop ? rk.name + ' 已封顶' : '再胜 ' + winsToPromote(rk.tier, rk.level) + ' 场升段', 360, y + 26);
  }
}

/* ---------- 主菜单(模式选择) ---------- */
function renderMenu(): void {
  // 背景即画面,不整体压暗;标题加投影保证可读
  ctx.fillStyle = '#f6ead0';
  setFont(120, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(15,9,4,0.85)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillText('守 帅', 360, 230);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#e3cfa4';
  setFont(24, false);
  ctx.fillText('楚河汉界 · 文字合成塔防', 360, 320);

  // 闯关模式
  rr(160, 402, 400, 118, 18);
  ctx.fillStyle = '#a93226';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#7b241c';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(38, true);
  ctx.fillText('闯 关 模 式', 360, 449);
  setFont(20, false);
  ctx.fillStyle = '#e8ddc4';
  ctx.fillText('十条战线 · 守住帅棋', 360, 496);
  state.uiButtons.push({ id: 'mode', x: 160, y: 402, w: 400, h: 118 });

  // 无限模式:血战至帅陨落,水军楼船自河上来袭
  rr(160, 544, 400, 118, 18);
  ctx.fillStyle = '#1f6a7a';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#14424f';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(38, true);
  ctx.fillText('无 限 模 式', 360, 591);
  setFont(20, false);
  ctx.fillStyle = '#cfeef5';
  ctx.fillText('水军抢滩 · 血战至帅陨落', 360, 638);
  state.uiButtons.push({ id: 'endless', x: 160, y: 544, w: 400, h: 118 });

  // 对战模式:上下半屏 1v1,对称波次 + 水军越河偷袭
  rr(160, 686, 400, 118, 18);
  ctx.fillStyle = '#7a4a8a';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#54325f';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(38, true);
  ctx.fillText('对 战 模 式', 360, 724);
  // 段位徽记:名号 + 等级 + 战绩(段位只给荣誉与军饷,不给战力)
  const dr = duelRankState();
  setFont(21, true);
  ctx.fillStyle = '#f0d98a';
  ctx.fillText(dr.name + ' · ' + levelCn(dr.level), 360, 768);
  setFont(15, false);
  ctx.fillStyle = '#d9c6e4';
  ctx.fillText(dr.wins + ' 胜 ' + dr.losses + ' 负 · 段位越高敌械符越全', 360, 793);
  state.uiButtons.push({ id: 'duel', x: 160, y: 686, w: 400, h: 118 });

  // 军资集市:军饷消费的局外强化
  rr(160, 828, 400, 84, 16);
  ctx.fillStyle = '#8a6a3a';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#5f4a28';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(34, true);
  ctx.fillText('军 资 集 市', 335, 861);
  setFont(18, false);
  ctx.fillStyle = '#e8ddc4';
  ctx.fillText('军饷消费 · 跨局强化', 335, 897);
  drawCoin(462, 870, 15);
  state.uiButtons.push({ id: 'shop', x: 160, y: 828, w: 400, h: 84 });

  // 军饷钱袋(局外货币,跨局永存)
  rr(500, 36, 200, 52, 12);
  ctx.fillStyle = 'rgba(24,19,12,0.55)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#c9a227';
  ctx.stroke();
  drawCoin(532, 62, 15);
  setFont(24, true);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f9a825';
  ctx.fillText(String(saveData.money), 556, 63);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#8a7a5c';
  setFont(18, false);
  ctx.fillText('灰盒 v0.3', 360, 952);
}

/* ---------- 选关 ---------- */

function renderStart(): void {
  dimLight();
  // 返回主菜单
  rr(20, 14, 122, 44, 10);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a7a5c';
  ctx.stroke();
  ctx.fillStyle = INK;
  setFont(22, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('← 主菜单', 81, 37);
  state.uiButtons.push({ id: 'back', x: 20, y: 14, w: 122, h: 44 });

  // 标题
  ctx.fillStyle = '#f6ead0';
  setFont(64, true);
  ctx.shadowColor = 'rgba(15,9,4,0.8)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.fillText('选 关', 360, 150);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#e3cfa4';
  setFont(22, false);
  ctx.fillText('楚河汉界 · 灰盒全解锁', 360, 208);

  // 关卡(灰盒阶段全解锁)
  for (let n = 1; n <= LEVELS.length; n++) {
    const row = Math.floor((n - 1) / 5), col = (n - 1) % 5;
    const x = 136 + col * 112, y = 420 + row * 120;
    rr(x - 48, y - 48, 96, 96, 16);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#8a7a5c';
    ctx.stroke();
    ctx.fillStyle = INK;
    setFont(46, true);
    ctx.fillText(String(n), x, y - 6);
    setFont(18, false);
    ctx.fillStyle = '#8a7a5c';
    ctx.fillText('关', x, y + 30);
    state.uiButtons.push({ id: 'level', n, x: x - 48, y: y - 48, w: 96, h: 96 });
  }

  // 说明(玩法与规则的大致介绍)
  ctx.fillStyle = '#cdbf9f';
  setFont(22, false);
  ctx.textAlign = 'center';
  const tips = [
    '· 敌军自城楼沿路进军、直扑帅棋:帅血只有 3 点,守住十关即通关',
    '· 拖动汉字棋子上阵迎敌;同类同级重叠,即合成更强的棋子',
    '· 粮草只能杀敌赚取;【征兵】补充兵营,「垦荒令」开辟荒地',
    '· 七种棋子各依走法施展攻击,布阵与合成是守帅的关键',
  ];
  tips.forEach((t, i) => ctx.fillText(t, 360, 700 + i * 40));
}

/* ---------- 军资集市 ---------- */

/** 集市页签(0 = 军械库,1 = 兵符;仅界面态,不入存档) */
let shopTab = 0;
export function setShopTab(n: number): void { shopTab = n; }

/* 集市列表:单列大卡片 + 上下滑动(列表区固定,内容滚动;两页签共用滚动量) */
const SHOP_LIST = { x: 30, y: 404, w: 660, h: 850 };   // 可视区(裁剪 + 命中)
const SHOP_ROW_H = 134;                                 // 军械行距(卡片 118 + 间距)
const SHOP_CARD_H = 118;
const FU_ROW_H = 162;                                   // 兵符行距(卡片 146 + 间距)
const FU_CARD_H = 146;
let shopScroll = 0;

/** 当前页签的行高 / 行数(军械库 11 行、兵符 6 行) */
function shopRowH(): number { return shopTab === 1 ? FU_ROW_H : SHOP_ROW_H; }
function shopRows(): number { return shopTab === 1 ? FUS.length : GEAR.length; }

function shopMaxScroll(): number {
  return Math.max(0, shopRows() * shopRowH() - SHOP_LIST.h);
}

/** 列表右侧滚动条(内容超出可视区时才画) */
function drawShopScrollbar(): void {
  const contentH = shopRows() * shopRowH();
  if (contentH <= SHOP_LIST.h) return;
  const trackX = SHOP_LIST.x + SHOP_LIST.w - 4;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(trackX, SHOP_LIST.y, 5, SHOP_LIST.h);
  const thumbH = Math.max(48, SHOP_LIST.h * SHOP_LIST.h / contentH);
  const thumbY = SHOP_LIST.y + (SHOP_LIST.h - thumbH) * (shopScroll / shopMaxScroll());
  ctx.fillStyle = 'rgba(201,162,39,0.85)';
  rr(trackX - 3, thumbY, 10, thumbH, 5);
  ctx.fill();
}
/** 滑动集市列表(dy 为正 = 向下滚) */
export function scrollShop(dy: number): void {
  shopScroll = Math.max(0, Math.min(shopMaxScroll(), shopScroll + dy));
}
export function resetShopScroll(): void { shopScroll = 0; }
export function getShopScroll(): number { return shopScroll; }
export function getShopListRect(): { x: number; y: number; w: number; h: number } { return SHOP_LIST; }

/** 军械库:军饷解锁军械 + 主动技装入技能槽(两页签:军械库 / 兵符) */
function renderShop(): void {
  dimLight();
  // 返回主菜单
  rr(20, 14, 122, 44, 10);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a7a5c';
  ctx.stroke();
  ctx.fillStyle = INK;
  setFont(22, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('← 主菜单', 81, 37);
  state.uiButtons.push({ id: 'back', x: 20, y: 14, w: 122, h: 44 });

  // 标题 + 军饷余额
  ctx.fillStyle = '#f6ead0';
  setFont(64, true);
  ctx.shadowColor = 'rgba(15,9,4,0.8)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.fillText('军资集市', 300, 122);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#e3cfa4';
  setFont(20, false);
  ctx.fillText('军饷消费 · 购入即存档', 300, 184);
  rr(532, 44, 168, 52, 12);
  ctx.fillStyle = 'rgba(24,19,12,0.55)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#c9a227';
  ctx.stroke();
  drawCoin(562, 70, 14);
  setFont(24, true);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f9a825';
  ctx.fillText(String(saveData.money), 584, 71);
  ctx.textAlign = 'center';

  // 页签:军械库 / 兵符
  const tabs: [string, string, string][] = [
    ['tab0', '军械库', '被动可携带/取下(最多 6 件)· 主动装入技能槽(最多 2 个)· 列表可上下拖动'],
    ['tab1', '兵符', 'Boss 掉符片 · 集片铸符,每兵种一枚永久机制 · 列表可上下拖动'],
  ];
  tabs.forEach(([id, label], i) => {
    const x = 140 + i * 240, y = 208, w = 200, h = 56;
    const active = shopTab === i;
    rr(x, y, w, h, 12);
    ctx.fillStyle = active ? '#8a6a3a' : 'rgba(58,44,30,0.45)';
    ctx.fill();
    ctx.lineWidth = active ? 3 : 2;
    ctx.strokeStyle = active ? '#c9a227' : '#6b655a';
    ctx.stroke();
    ctx.fillStyle = active ? '#fdf6e3' : '#b9b2a4';
    setFont(24, true);
    ctx.fillText(label, x + w / 2, y + h / 2);
    state.uiButtons.push({ id, x, y, w, h });
  });
  ctx.fillStyle = '#cdbf9f';
  setFont(16, false);
  ctx.fillText(tabs[shopTab][2], 360, 288);

  if (shopTab === 0) renderGear();
  else renderShopFu();
}

/** 军械卡(单列大卡):已解锁的主动/被动都有一枚开关(装槽 / 携带),未解锁可购 */
function drawGearCard(g: GearDef, i: number, y: number, allowHit: boolean): void {
  const x = 40, w = 640, h = SHOP_CARD_H;
  const owned = ownsGear(g.id);
  // 「在编」高亮:主动 = 已装技能槽,被动 = 已携带(两者都是「本局会生效」)
  const bagged = g.kind === 'passive' ? carriesGear(g.id) : inBag(g.id);
  const canUnlock = saveData.money >= g.cost;
  rr(x, y, w, h, 14);
  ctx.fillStyle = bagged ? '#3f3120' : PAPER;
  ctx.fill();
  ctx.lineWidth = bagged ? 3 : 2;
  ctx.strokeStyle = bagged ? '#c9a227' : owned ? '#8a7a5c' : '#6b655a';
  ctx.stroke();
  // 徽记圆章
  ctx.beginPath();
  ctx.arc(x + 52, y + h / 2, 32, 0, TAU);
  ctx.fillStyle = bagged ? '#b8860b' : owned ? '#6d4c41' : '#5a5048';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = bagged ? '#f9a825' : '#5c4a38';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(30, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(g.glyph, x + 52, y + h / 2 + 1);
  // 类型标签
  rr(x + 104, y + 16, 62, 26, 9);
  ctx.fillStyle = g.kind === 'active' ? '#a93226' : '#1f6a7a';
  ctx.fill();
  ctx.fillStyle = '#fdf6e3';
  setFont(15, true);
  ctx.fillText(g.kind === 'active' ? '主动' : '被动', x + 135, y + 30);
  // 名称 / 机制 / 副行
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = bagged ? '#fdf6e3' : INK;
  setFont(34, true);
  ctx.fillText(g.name, x + 176, y + 46);
  ctx.fillStyle = bagged ? '#e8ddc4' : '#6d4c41';
  setFont(22, false);
  ctx.fillText(g.desc, x + 176, y + 82);
  ctx.fillStyle = bagged ? '#cdb98a' : '#8a7a5c';
  setFont(16, false);
  ctx.fillText(g.kind === 'active' ? ('冷却 ' + (g.cd ?? 0) + 's · 整局反复用') : ('被动 · 最多带 ' + GEAR_BAG.passiveCap + ' 件 · 可随时取下'), x + 176, y + 106);
  // 右侧:解锁 / 装入状态 / 常驻
  const bx = x + w - 200, bw = 180;
  if (!owned) {
    const by = y + (h - 58) / 2;
    rr(bx, by, bw, 58, 12);
    ctx.fillStyle = canUnlock ? '#1f6a7a' : '#4e5560';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = canUnlock ? '#14424f' : '#3a404a';
    ctx.stroke();
    drawCoin(bx + 26, y + h / 2, 15);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    setFont(26, true);
    ctx.fillStyle = canUnlock ? '#fdf6e3' : '#b9c2c9';
    ctx.fillText(String(g.cost), bx + 52, y + h / 2 + 1);
    setFont(16, false);
    ctx.fillStyle = 'rgba(248,246,227,0.8)';
    ctx.fillText('解锁', bx + 126, y + h / 2 + 1);
    if (allowHit) state.uiButtons.push({ id: 'unlock', n: i, x: bx, y: by, w: bw, h: 58 });
  } else {
    // 已解锁:一枚开关,主动 = 技能槽 / 被动 = 携带(样式一致,只是文案不同)
    const by = y + (h - 46) / 2;
    rr(bx, by, bw, 46, 12);
    ctx.fillStyle = bagged ? '#8a6a3a' : 'rgba(58,44,30,0.3)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = bagged ? '#c9a227' : '#6b655a';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = bagged ? '#fdf6e3' : '#8a7a5c';
    setFont(19, true);
    const label = g.kind === 'active'
      ? (bagged ? '已装 · 点此取出' : '未携带 · 点此装入')
      : (bagged ? '已携带 · 点此取下' : '未携带 · 点此携带');
    ctx.fillText(label, bx + bw / 2, y + h / 2 + 1);
    if (allowHit) state.uiButtons.push({ id: 'gear', n: i, x, y, w, h });
  }
  ctx.textBaseline = 'alphabetic';
}

/** 页签一:军械库(单列大卡片 + 上下滑动;主动装技能槽,被动携带,都可点卡片切换) */
function renderGear(): void {
  // 顶部:左 = 主动技能槽(局内生成独立按钮),右 = 被动军械(携带生效;两池各算各的)
  const list = bagList();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e3cfa4';
  setFont(21, true);
  ctx.fillText('主动技能槽 ' + bagActiveCount() + ' / ' + GEAR_BAG.activeCap, 40, 312);
  // 说明文字夹在两池中间的空档(旧版挤在右上角,与「被动军械 N / M」叠字)
  ctx.fillStyle = '#b9a97e';
  setFont(14, false);
  ctx.fillText('局内生成独立按钮', 206, 313);
  ctx.fillStyle = '#e3cfa4';
  setFont(21, true);
  ctx.fillText('被动军械 ' + passiveCarryCount() + ' / ' + GEAR_BAG.passiveCap, 340, 312);
  const SZ = 50, SY = 324;
  for (let j = 0; j < GEAR_BAG.activeCap; j++) {
    const x = 40 + j * 58;
    const id = list[j];
    const gg = id ? gearOf(id) : undefined;
    rr(x, SY, SZ, SZ, 10);
    ctx.fillStyle = gg ? '#6d4c41' : 'rgba(58,44,30,0.25)';
    ctx.fill();
    if (gg) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#c9a227';
      ctx.stroke();
      ctx.fillStyle = '#fdf6e3';
      setFont(26, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gg.glyph, x + SZ / 2, SY + SZ / 2 + 1);
      state.uiButtons.push({ id: 'gear', n: GEAR.findIndex(q => q.id === id), x, y: SY, w: SZ, h: SZ });
    } else {
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8a7a5c';
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // 被动徽记行:已携带的按注册表序排开,余下画空槽(与左侧技能槽同一套读法)
  ctx.fillStyle = '#b9a97e';
  setFont(14, false);
  ctx.fillText('已解锁 ' + passiveOwnedCount() + ' 件 · 点徽记可取下', 340, 372);
  const P_SZ = 34, P_Y = SY + 8;
  const carry = passiveList();
  let px = 340;
  for (let j = 0; j < GEAR_BAG.passiveCap; j++) {
    const gg = carry[j] ? gearOf(carry[j]) : undefined;
    rr(px, P_Y, P_SZ, P_SZ, 8);
    if (gg) {
      ctx.fillStyle = '#6d4c41';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#c9a227';
      ctx.stroke();
      ctx.fillStyle = '#fdf6e3';
      setFont(18, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(gg.glyph, px + P_SZ / 2, P_Y + P_SZ / 2 + 1);
      // 与左侧技能槽同一读法:点徽记 = 取下(卡片上的开关是同一个动作)
      state.uiButtons.push({ id: 'gear', n: GEAR.findIndex(q => q.id === carry[j]), x: px, y: P_Y, w: P_SZ, h: P_SZ });
    } else {
      ctx.fillStyle = 'rgba(58,44,30,0.25)';
      ctx.fill();
      ctx.setLineDash([6, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8a7a5c';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    px += P_SZ + 6;
  }

  // —— 列表:单列卡片,裁剪 + 滚动 ——
  ctx.save();
  ctx.beginPath();
  ctx.rect(SHOP_LIST.x, SHOP_LIST.y, SHOP_LIST.w, SHOP_LIST.h);
  ctx.clip();
  GEAR.forEach((g, i) => {
    const y = SHOP_LIST.y + i * SHOP_ROW_H - shopScroll;
    if (y > SHOP_LIST.y + SHOP_LIST.h || y + SHOP_CARD_H < SHOP_LIST.y) return;
    const fully = y >= SHOP_LIST.y && y + SHOP_CARD_H <= SHOP_LIST.y + SHOP_LIST.h;
    drawGearCard(g, i, y, fully);
  });
  ctx.restore();

  drawShopScrollbar();

  // 说明
  ctx.fillStyle = '#cdbf9f';
  setFont(15, false);
  ctx.textAlign = 'center';
  ctx.fillText('上下拖动列表可滑动 · 被动可携带/取下(最多 ' + GEAR_BAG.passiveCap + ' 件)· 主动最多装 ' + GEAR_BAG.activeCap + ' 个', 360, 1272);
}

/** 兵符卡(单列大卡):符印 / 名称 / 机制 / 流派 / 铸符键。allowHit=false(被裁剪)时不登记点击区 */
function drawFuCard(f: FuDef, i: number, y: number, allowHit: boolean): void {
  const x = 40, w = 640, h = FU_CARD_H;
  const crafted = !!saveData.fu[f.id];
  const canCast = !crafted && saveData.shards >= f.cost;
  rr(x, y, w, h, 14);
  ctx.fillStyle = crafted ? '#3f3120' : PAPER;
  ctx.fill();
  ctx.lineWidth = crafted ? 3 : 2;
  ctx.strokeStyle = crafted ? '#c9a227' : '#8a7a5c';
  ctx.stroke();
  // 符印圆章
  ctx.beginPath();
  ctx.arc(x + 52, y + 48, 32, 0, TAU);
  ctx.fillStyle = crafted ? '#b8860b' : '#8a7a5c';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = crafted ? '#f9a825' : '#5c4a38';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(32, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(f.piece, x + 52, y + 49);
  // 名称
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = crafted ? '#fdf6e3' : INK;
  setFont(32, true);
  ctx.fillText(f.name, x + 100, y + 58);
  // 机制(整行大号)
  ctx.fillStyle = crafted ? '#e8ddc4' : '#6d4c41';
  setFont(20, false);
  ctx.fillText(f.desc, x + 40, y + 104);
  // 流派
  ctx.fillStyle = crafted ? '#cdb98a' : '#8a6d3b';
  setFont(17, false);
  ctx.fillText(f.synergy, x + 40, y + 130);
  // 铸符键(右上)/ 已铸
  const bx = x + w - 188, bw = 168, by = y + 20, bh = 52;
  rr(bx, by, bw, bh, 12);
  ctx.fillStyle = crafted ? '#6b655a' : canCast ? '#1f6a7a' : '#4e5560';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = crafted ? '#4f4a41' : canCast ? '#14424f' : '#3a404a';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fdf6e3';
  if (crafted) {
    setFont(24, true);
    ctx.fillText('已铸', bx + bw / 2, by + bh / 2 + 1);
  } else {
    drawShard(bx + 22, by + bh / 2, 13);
    ctx.textAlign = 'left';
    setFont(26, true);
    ctx.fillStyle = canCast ? '#fdf6e3' : '#b9c2c9';
    ctx.fillText(String(f.cost), bx + 42, by + bh / 2 + 1);
    setFont(16, false);
    ctx.fillStyle = 'rgba(248,246,227,0.8)';
    ctx.fillText('铸符', bx + 112, by + bh / 2 + 1);
  }
  if (allowHit) state.uiButtons.push({ id: 'cast', n: i, x: bx, y: by, w: bw, h: bh });
  ctx.textBaseline = 'alphabetic';
}

/** 页签二:兵符(Boss 符片 → 铸符;单列大卡片 + 上下滑动) */
function renderShopFu(): void {
  // 符片计数条(固定)
  drawShard(62, 330, 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f9a825';
  setFont(28, true);
  ctx.fillText('符片 × ' + saveData.shards, 92, 324);
  ctx.fillStyle = '#b9a97e';
  setFont(15, false);
  ctx.fillText('Boss 击杀掉落(必得 1 片,概率追加;无限 25 波后更丰厚)', 92, 354);
  ctx.textBaseline = 'alphabetic';

  // —— 列表:单列卡片,裁剪 + 滚动 ——
  ctx.save();
  ctx.beginPath();
  ctx.rect(SHOP_LIST.x, SHOP_LIST.y, SHOP_LIST.w, SHOP_LIST.h);
  ctx.clip();
  FUS.forEach((f, i) => {
    const y = SHOP_LIST.y + i * FU_ROW_H - shopScroll;
    if (y > SHOP_LIST.y + SHOP_LIST.h || y + FU_CARD_H < SHOP_LIST.y) return;
    const fully = y >= SHOP_LIST.y && y + FU_CARD_H <= SHOP_LIST.y + SHOP_LIST.h;
    drawFuCard(f, i, y, fully);
  });
  ctx.restore();

  drawShopScrollbar();

  // 说明
  ctx.fillStyle = '#cdbf9f';
  setFont(15, false);
  ctx.textAlign = 'center';
  ctx.fillText('上下拖动列表可滑动 · 兵符不改数值改机制,铸给基础兵种,特殊军同享', 360, 1272);
}

/* (旧的「战备道具」页签已并入「军械库」——见 renderGear) */

/* ---------- 暂停 ---------- */

function renderPause(): void {
  dim();
  rr(180, 420, 360, 460, 20);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8a7a5c';
  ctx.stroke();
  ctx.fillStyle = INK;
  setFont(44, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('暂 停', 360, 485);
  const btn = (y: number, color: string, text: string, id: string): void => {
    rr(220, y, 280, 80, 14);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#fdf6e3';
    setFont(30, true);
    ctx.fillText(text, 360, y + 42);
    state.uiButtons.push({ id, x: 220, y, w: 280, h: 80 });
  };
  btn(550, '#43a047', '继续游戏', 'resume');
  btn(660, '#a93226', '重试本关', 'retry');
  btn(770, '#6d4c41', '返回主菜单', 'menu');
}

/* ---------- 结算 ---------- */

function renderClear(): void {
  dim();
  // 胜利横幅
  ctx.fillStyle = INK;
  setFont(30, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('第 ' + state.level + ' 关 · ' + LEVELS[state.level - 1].name, 360, 400);
  ctx.fillStyle = '#43a047';
  setFont(68, true);
  ctx.fillText('守住了!', 360, 478);
  drawMoneyGain(545);
  // 主按钮:下一关(置于视角中心)
  rr(200, 585, 320, 110, 18);
  ctx.fillStyle = '#a93226';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#7b241c';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(40, true);
  ctx.fillText('下 一 关', 360, 620);
  setFont(19, false);
  ctx.fillStyle = '#e8ddc4';
  // 换地图时在主按钮内提示转战
  const next = state.level + 1;
  let sub = '整军备战 · 再启征程';
  if (next <= LEVELS.length) {
    const nextMap = getMap(LEVELS[next - 1].mapId);
    if (nextMap.id !== state.map.id) sub = '转战新战场「' + nextMap.name + '」';
  }
  ctx.fillText(sub, 360, 666);
  state.uiButtons.push({ id: 'next', x: 200, y: 585, w: 320, h: 110 });
  // 次按钮:返回主菜单
  rr(230, 745, 260, 74, 14);
  ctx.fillStyle = '#6d4c41';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#4e362e';
  ctx.stroke();
  ctx.fillStyle = '#fdf6e3';
  setFont(28, true);
  ctx.fillText('返回主菜单', 360, 782);
  state.uiButtons.push({ id: 'menu', x: 230, y: 745, w: 260, h: 74 });
}

function renderOver(): void {
  const duelOver = state.mode === 'duel';
  dim();
  rr(160, 430, 400, 360, 20);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8a7a5c';
  ctx.stroke();
  ctx.fillStyle = '#a93226';
  setFont(60, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('帅陨落…', 360, 510);
  ctx.fillStyle = INK;
  setFont(24, false);
  // 战绩:无限模式报坚守波数;对战报对垒波数;战役报关卡/波次
  ctx.fillText(state.mode === 'endless'
    ? '无限模式 · 血战 ' + (state.waveIdx + 1) + ' 波后失守'
    : duelOver
      ? '对垒败局 · 血战 ' + (state.waveIdx + 1) + ' 波后失守'
      : '第 ' + state.level + ' 关 · 第 ' + (state.waveIdx + 1) + ' 波 失守', 360, duelOver ? 574 : 580);
  if (duelOver) drawDuelRankLine(608);
  drawMoneyGain(duelOver ? 648 : 618);
  rr(230, duelOver ? 672 : 640, 260, 84, 14);
  ctx.fillStyle = state.mode === 'endless' ? '#1f6a7a' : '#a93226';
  ctx.fill();
  ctx.fillStyle = '#fdf6e3';
  setFont(34, true);
  ctx.fillText(state.mode === 'endless' ? '再战无限' : duelOver ? '再战对垒' : '重试本关', 360, duelOver ? 714 : 682);
  state.uiButtons.push({ id: 'retry', x: 230, y: duelOver ? 672 : 640, w: 260, h: 84 });
}

function renderWin(): void {
  const duelWin = state.mode === 'duel';
  dim();
  rr(160, 450, 400, 350, 20);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8a7a5c';
  ctx.stroke();
  ctx.fillStyle = duelWin ? '#1f6a7a' : '#ef6c00';
  setFont(duelWin ? 60 : 64, true);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(duelWin ? '对垒胜局!' : '十关全通!', 360, duelWin ? 500 : 530);
  ctx.fillStyle = '#8a7a5c';
  setFont(22, false);
  ctx.fillText(duelWin ? '敌军先破帅 · 血战 ' + (state.waveIdx + 1) + ' 波' : '灰盒阶段毕业 · 下一站:对战版', 360, duelWin ? 546 : 595);
  if (duelWin) drawDuelRankLine(590);
  drawMoneyGain(duelWin ? 656 : 650);
  rr(230, 690, 260, 84, 14);
  ctx.fillStyle = '#a93226';
  ctx.fill();
  ctx.fillStyle = '#fdf6e3';
  setFont(34, true);
  ctx.fillText('返回主菜单', 360, 732);
  state.uiButtons.push({ id: 'home', x: 230, y: 690, w: 260, h: 84 });
}

/* ---------- 调度 ---------- */

/** 覆盖层调度(主菜单 / 选关 / 集市 / 暂停 / 结算) */
export function drawOverlays(): void {
  if (state.screen === 'menu') renderMenu();
  else if (state.screen === 'start') renderStart();
  else if (state.screen === 'shop') renderShop();
  else if (state.screen === 'play' && state.paused) renderPause();
  else if (state.screen === 'clear') renderClear();
  else if (state.screen === 'over') renderOver();
  else if (state.screen === 'win') renderWin();
}

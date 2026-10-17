/* ============================================================
   关卡编排(引用 maps.ts 里的地图 id)
   ------------------------------------------------------------
   w(兵种, 数量, 出怪间隔秒, 组内开涌延迟秒)组成一组。
   一波可含多组并行出怪,靠 delay 实现「波内世代递进」:
     基础敌军先涌、高级敌军随后(卒 → 马 → 车 → 象/砲 → 士/将);
     特定关卡可破例——L7「单路纵深」/ L9「十面埋伏」以快兵开场设伏,
     L8「重甲洪流」车阵早发。
   每关开局粮 = 6(恰好一次征兵),收入只能靠击杀。
   gap = 波与波之间的出兵间隔(秒);当前波出完即按 gap 进下一波,
   不等场上清空。时长设计(无杀敌 worst case 理论推演):
     L1 约 60s → L2 80 → L3 82 → L4 100 → L5 130~140(Boss)
     L6 145 → L7 155 → L8 173 → L9 176 → L10 ~198(Boss)
   前期波间隔大(留给布阵思考),后期缩小逼近洪流;时长主要来自
   出怪节奏放缓(单体间隔拉长)与波数增加,不靠降低敌军速度。
   open = 初始开放的布阵格 [c,r](其余封为荒地,靠垦荒令开辟):
   楚河汉界 33 格 / 孤军深入 35 格(7 列 × 两岸各 4 行,河占一行),每关开放 6~8 格。
   boss = 本关「将」位出场的 Boss(bosses.ts 注册表键):
   Boss 关:第 5/10 关 + 第 11 关起每章末关;第 41~45 关「场场大考」每关都有。
   第 1~5 关在「楚河汉界」双路图,第 6~10 关转战「孤军深入」。
   第 11~50 关为程序编排(见文末「生成器」节):每 5 关一章、章章有新东西。
   ============================================================ */
import type { LevelDef, WaveGroup, EnemyType } from '../types';
import { NAVY } from '../config';
import { BOSSES } from './bosses';

/* 敌军特性:卒=基准 / 马=略快 / 车=最快但拐角歇整(有效均速约同卒)
   / 象=慢速重甲(压阵收尾,兼时长锚)/ 砲=一炮定音(眩晕拆阵,L6 首现)
   / 士=Boss 近卫(护主链接,随将出场)/ 将=Boss。
   世代递进:每关每波都按 卒→马→车→象/砲→士/将 顺序渐次亮相,
   混波里高级兵一律加 delay 垫后;Boss 波为仪仗式进场(卫队先于将)。
   象投放曲线:L4 末波预演 -> L5 Boss 卫队 -> L6+ 常态混编 -> L8 重甲洪流主角。 */

const w = (t: EnemyType, n: number, gap: number, delay = 0): WaveGroup => ({ t, n, gap, delay });

const GOLD_START = 6;   // 开局粮:够一次征兵

export const LEVELS_1_10: LevelDef[] = [
  /* —— 楚河汉界 · 双路(第 1~5 关)—— */
  { name: '初阵',     mapId: 'chuhe', gold: GOLD_START, gap: 9, open: [
    [1, 1], [3, 1], [5, 1], [3, 3], [3, 4], [2, 6],
  ], waves: [
    [w('卒', 4, 1.2)],
    [w('卒', 6, 1.0)],
    [w('卒', 9, 0.9)],
  ] },
  { name: '卒潮',     mapId: 'chuhe', gold: GOLD_START, gap: 8, open: [
    [1, 1], [5, 1], [3, 3], [3, 4], [1, 4], [5, 4], [2, 6],
  ], waves: [
    [w('卒', 6, 1.1)],
    [w('卒', 8, 0.9), w('马', 2, 4, 3)],
    [w('卒', 7, 0.8), w('马', 3, 2.2, 3.5)],
    [w('卒', 12, 0.65)],
  ] },
  { name: '马快攻',   mapId: 'chuhe', gold: GOLD_START, gap: 7, open: [
    [1, 0], [1, 1], [5, 1], [3, 3], [3, 4], [2, 6], [6, 6],
  ], waves: [
    [w('卒', 7, 0.95), w('马', 3, 3, 3)],
    [w('马', 6, 1.5)],
    [w('卒', 10, 0.6), w('车', 2, 5, 5.5)],
    [w('卒', 14, 0.5), w('马', 4, 1.6, 4)],
  ] },
  { name: '车阵',     mapId: 'chuhe', gold: GOLD_START, gap: 5, open: [
    [1, 1], [5, 1], [1, 4], [3, 4], [5, 4], [2, 6], [6, 6],
  ], waves: [
    [w('卒', 10, 0.8)],
    [w('马', 6, 1.3), w('车', 2, 5.5, 4)],
    [w('卒', 8, 0.7), w('车', 4, 3.4, 4)],
    [w('马', 10, 1.05)],
    [w('卒', 12, 0.55), w('象', 2, 5, 5)],
  ] },
  { name: '敌将来袭', mapId: 'chuhe', gold: GOLD_START, gap: 4.5, boss: '敌将', open: [
    [1, 1], [5, 1], [3, 3], [3, 4], [5, 4], [2, 6], [6, 6], [6, 7],
  ], waves: [
    [w('卒', 10, 0.8), w('马', 3, 3.5, 3)],
    [w('车', 5, 3.5)],
    [w('马', 14, 1.1)],
    [w('卒', 16, 0.5), w('车', 3, 6, 5)],
    [w('卒', 8, 1.0), w('马', 5, 2.4, 2), w('象', 2, 4, 5.5), w('士', 2, 1.5, 6.5), w('将', 1, 0, 8.5)],
  ] },
  /* —— 孤军深入 · 单口 U 形(第 6~10 关)—— */
  { name: '孤军深入', mapId: 'gujun', gold: GOLD_START, gap: 4.5, open: [
    [5, 0], [5, 1], [3, 1], [4, 3], [3, 4], [2, 6], [1, 7],
  ], waves: [
    [w('卒', 14, 0.65)],
    [w('马', 10, 1.1), w('车', 4, 4, 4)],
    [w('车', 6, 2.8), w('砲', 1, 4, 10)],
    [w('卒', 16, 0.45), w('马', 6, 1.9, 5)],
    [w('马', 12, 1.0), w('车', 6, 3.6, 4)],
    [w('象', 6, 3.2)],
  ] },
  { name: '单路纵深', mapId: 'gujun', gold: GOLD_START, gap: 3.5, open: [
    [5, 0], [5, 1], [5, 3], [4, 3], [2, 4], [3, 4], [2, 6], [1, 7],
  ], waves: [
    [w('马', 14, 1.1)],
    [w('车', 8, 2.2), w('砲', 2, 4, 8)],
    [w('卒', 18, 0.42), w('马', 8, 1.6, 4)],
    [w('车', 8, 1.8)],
    [w('卒', 20, 0.5), w('马', 16, 0.9, 4)],
    [w('车', 10, 1.7)],
    [w('象', 3, 5)],
  ] },
  { name: '重甲洪流', mapId: 'gujun', gold: GOLD_START, gap: 3, open: [
    [5, 1], [4, 3], [3, 3], [3, 4], [4, 4], [1, 6], [6, 6], [6, 7],
  ], waves: [
    [w('卒', 18, 0.5), w('车', 4, 4.5, 5)],
    [w('马', 14, 1.0)],
    [w('车', 10, 1.9), w('砲', 2, 4, 8)],
    [w('卒', 20, 0.4), w('马', 6, 1.6, 6)],
    [w('车', 12, 1.6)],
    [w('卒', 18, 0.45), w('马', 16, 0.8, 5)],
    [w('车', 8, 1.8)],
    [w('象', 4, 3.5)],
  ] },
  { name: '十面埋伏', mapId: 'gujun', gold: GOLD_START, gap: 2, open: [
    [5, 0], [5, 1], [5, 3], [4, 3], [2, 4], [4, 4], [2, 6], [1, 7],
  ], waves: [
    [w('马', 20, 1.0)],
    [w('卒', 20, 0.4), w('车', 6, 3, 5)],
    [w('车', 10, 2.4)],
    [w('卒', 20, 0.4), w('马', 16, 0.75, 5)],
    [w('车', 10, 2.1), w('砲', 2, 3.5, 9)],
    [w('卒', 20, 0.4), w('马', 18, 0.7, 5)],
    [w('象', 9, 2.6)],
  ] },
  { name: '决战孤峰', mapId: 'gujun', gold: GOLD_START, gap: 1.5, boss: '卧槽马', open: [
    [5, 0], [5, 1], [4, 3], [2, 4], [3, 4], [2, 6], [6, 6], [6, 7],
  ], waves: [
    [w('卒', 26, 0.7)],
    [w('车', 10, 2.4)],
    [w('卒', 22, 0.5), w('马', 22, 0.9, 4)],
    [w('车', 10, 2.1), w('砲', 2, 4, 9)],
    [w('卒', 30, 0.4), w('马', 14, 1.1, 5)],
    [w('车', 12, 2.2)],
    [w('卒', 10, 0.8), w('马', 12, 1.1, 3), w('象', 3, 3, 7), w('士', 2, 1.5, 8.5), w('将', 1, 0, 10.5)],
  ] },
];

/* 无限模式(楚河汉界图)初始开放的布阵格:中路纵深 + 两翼,与其余战役关同规格;
   其余格封荒地靠垦荒令开辟。波次构成由 systems/waves.ts 程序生成,不在此列数据。 */
export const ENDLESS_OPEN: [number, number][] = [
  [1, 1], [5, 1], [1, 4], [3, 3], [3, 4], [2, 6], [6, 6], [6, 7],
];

/* ============================================================
   第 11~50 关:程序编排(确定性生成,同关同局)
   ------------------------------------------------------------
   为什么不手写 40 关:波次表无法整体标定、改一处动全身。
   生成器把「难度」收敛为两条公式,把「新鲜感」收敛为章表 ARCS——
   用户拍板的纪律:每 5 关(一章)必换新东西。

   难度公式(只控「数量与构成」;血量另有 +15%/关 的全局爬坡,
   见 enemies.ts spawnStats,不重复加压):
     · 预算 B(n) = 7n + 277 —— 过手排锚点 L5≈115 / L10≈347(按
       GEN_COST 折算),之后线性上行;波内上限随 n 缓胀,防饱和截顶;
     · 波数 W(n) = 6 + (n-11)/9 → 6~10 波;波间隔 2.4s → 1.35s 渐收;
     · 波内:轻兵(卒/马)打底先涌,重兵(车/砲/象/士)按章主题权重
       抽选、delay 垫后(世代递进),末波最重;大考波追加「将」。
   种子 = 关号×7919 + 波号×131:同一关每次生成完全一样——
   手排感、可复现、可全量审计(提交时附 50 关校验脚本结果)。
   ============================================================ */

/** mulberry32:确定性伪随机(种子固定 ⇒ 同一关生成结果逐字节一致) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 兵种分值(预算货币)与单波构成上限;上限随关号缓胀(L50 ×1.6),
   否则后期预算会在上限处截顶、构成静默饱和 */
const GEN_COST: Record<string, number> = { 卒: 1, 马: 2, 士: 2.5, 车: 3, 砲: 3.5, 象: 4 };
const GEN_CAP: Record<string, number> = { 卒: 16, 马: 8, 车: 5, 砲: 4, 象: 5, 士: 5 };
const capScale = (n: number): number => 1 + Math.min(0.6, (n - 11) / 39 * 0.6);

/** 章表:每 5 关一章。章间必换新东西——新图 / 水军 / 主题 / Boss 密度 */
interface ArcDef {
  chapter: string;        // 章名(二字,选关页卷标)
  map: string;
  boss: string | null;    // 章末关大考(bossEvery 章则逐关取 bossSeq)
  bossEvery?: boolean;    // 场场大考(第 41~45 关)
  bossSeq?: string[];
  theme: [EnemyType, number][];   // 重兵抽选权重(卒/马由轻兵公式负责,此表只管重兵口味)
  navy?: { base: number; per: number };  // 水军参战章:每关派船,载员 = base + per × 章内序
  names: [string, string, string, string, string];
  open: [number, number][];
}

const ARCS: ArcDef[] = [
  { /* L11-15:水军楼船首现(水军自河上抢滩,与陆路两线夹击) */
    chapter: '回师', map: 'chuhe', boss: '铁门栓',
    theme: [['车', 2], ['砲', 2], ['象', 2]],
    navy: { base: 5, per: 1 },
    names: ['回师楚河', '楼船压境', '断橹先锋', '水陆并起', '铁门锁江'],
    open: [[1, 1], [5, 1], [3, 3], [3, 4], [1, 4], [5, 4], [2, 6], [6, 6]],
  },
  { /* L16-20:轻骑奔袭(马/车 权重拉满,U 形单路上的速度压迫) */
    chapter: '烽烟', map: 'gujun', boss: '双车错',
    theme: [['车', 5], ['象', 1], ['砲', 1.5]],
    names: ['烽烟再起', '快马加鞭', '轻骑突阵', '铁骑踏营', '双车错影'],
    open: [[5, 0], [5, 1], [4, 3], [3, 4], [2, 4], [2, 6], [1, 7], [6, 6]],
  },
  { /* L21-25:新地图「三管齐下」——三路分兵,中军直道最短最险 */
    chapter: '三路', map: 'sanlu', boss: '当头炮',
    theme: [['车', 3], ['砲', 2], ['象', 2]],
    names: ['兵分三路', '中军压境', '左右开弓', '三川汇流', '中宫炮响'],
    open: [[2, 6], [4, 6], [1, 7], [6, 7], [1, 5], [6, 6], [1, 1], [5, 1]],
  },
  { /* L26-30:水军加重(双船常态化,载员 8~12) */
    chapter: '水战', map: 'chuhe', boss: '过河卒',
    theme: [['车', 2], ['砲', 2.5], ['象', 2]],
    navy: { base: 8, per: 1 },
    names: ['水涨江阔', '百舸争流', '水淹七军', '沿江列阵', '卒渡天堑'],
    open: [[1, 1], [5, 1], [3, 3], [3, 4], [1, 4], [5, 4], [2, 6], [6, 6]],
  },
  { /* L31-35:铁甲连环(象/车 主题,U 形纵深厚重碾压) */
    chapter: '铁甲', map: 'gujun', boss: '铁滑车',
    theme: [['象', 4], ['车', 4], ['砲', 2], ['士', 1.5]],
    names: ['铁甲初凝', '重车列阵', '象踏连营', '铜墙铁壁', '铁滑车鸣'],
    open: [[5, 0], [5, 1], [4, 3], [3, 4], [2, 4], [2, 6], [1, 7], [6, 6], [3, 1]],
  },
  { /* L36-40:新地图「万流归宗」——双口合流中轴;楚霸王战役首阵 */
    chapter: '归宗', map: 'heliu', boss: '楚霸王',
    theme: [['砲', 4], ['士', 3], ['车', 2], ['象', 2]],
    names: ['万流归宗', '合流鏖兵', '砲火连天', '中军决战', '楚歌四面'],
    open: [[1, 3], [5, 3], [2, 5], [4, 5], [1, 6], [5, 6], [2, 7], [4, 7]],
  },
  { /* L41-45:场场大考(每关末波都有 Boss;旧「5 的倍数才出将」规则到此作废) */
    chapter: '逐鹿', map: 'chuhe', boss: null, bossEvery: true,
    bossSeq: ['敌将', '铁门栓', '卧槽马', '双车错', '当头炮'],
    theme: [['车', 3], ['砲', 2.5], ['象', 2.5], ['士', 2]],
    names: ['逐鹿中原', '门栓重铸', '卧槽惊雷', '双车并驾', '炮定乾坤'],
    open: [[1, 1], [5, 1], [3, 3], [3, 4], [1, 4], [5, 4], [2, 6], [6, 6]],
  },
  { /* L46-50:楚汉终局——水军 + 全兵种总动员,回到最初的战场做最后的守帅 */
    chapter: '终局', map: 'chuhe', boss: '楚霸王',
    theme: [['车', 3], ['砲', 3], ['象', 3], ['士', 2]],
    navy: { base: 10, per: 1 },
    names: ['大军压境', '背水列阵', '烽火连天', '四面楚歌', '楚汉终局'],
    open: [[1, 1], [5, 1], [3, 3], [3, 4], [1, 4], [5, 4], [2, 6], [6, 6], [1, 7], [0, 6]],
  },
];

/* 组内出怪间隔 / 开涌延迟(世代递进:轻兵先涌、重兵垫后、士卫仪仗随将) */
const GEN_GAP: Record<string, number> = { 卒: 1.0, 马: 1.1, 车: 1.6, 砲: 1.8, 士: 1.5, 象: 2.2, 将: 0.6 };
const GEN_DELAY: Record<string, number> = { 卒: 0, 马: 2.2, 车: 4.2, 士: 5.0, 砲: 5.4, 象: 6.8 };

/** 生成一波:按预算与章主题抽选构成;大考波追加近卫与「将」 */
function genWave(n: number, wv: number, W: number, budget: number, arc: ArcDef, rnd: () => number, bossId: string | null): WaveGroup[] {
  const frac = W > 1 ? wv / (W - 1) : 0;
  const capK = capScale(n);
  // 重兵占比随波次推进(前波轻、后波重;大考波恒半)
  const heavyShare = bossId ? 0.5 : Math.min(0.72, 0.10 + 0.62 * frac + 0.06 * Math.sin(n + wv));
  let heavyBudget = budget * heavyShare;
  const lightBudget = budget - heavyBudget;
  const count: Partial<Record<EnemyType, number>> = {};
  // 重兵:按章主题权重抽选;士只在大考波/后段波出现(近卫身份,平时不杂入)
  const heavies = arc.theme.filter(([t]) => t !== '士' || bossId !== null || frac > 0.35);
  let guard = 60;
  while (guard-- > 0) {
    const pool = heavies.filter(([t]) => GEN_COST[t] <= heavyBudget + 1e-6 && (count[t] ?? 0) < Math.round(GEN_CAP[t] * capK));
    if (!pool.length) break;
    const tw = pool.reduce((s, [, wt]) => s + wt, 0);
    let r = rnd() * tw, pick = pool[0][0];
    for (const [t, wt] of pool) { r -= wt; if (r <= 0) { pick = t; break; } }
    count[pick] = (count[pick] ?? 0) + 1;
    heavyBudget -= GEN_COST[pick];
  }
  // 轻兵:卒打底,马按波次推进混入(烽烟章马权偏高)
  const maBias = arc.chapter === '烽烟' ? 0.14 : 0;
  const maShare = Math.min(0.55, 0.18 + 0.25 * frac + maBias);
  const ma = Math.min(Math.round(GEN_CAP['马'] * capK), Math.floor(lightBudget * maShare / GEN_COST['马'] + rnd() * 0.6));
  if (ma > 0) count['马'] = (count['马'] ?? 0) + ma;
  count['卒'] = Math.min(Math.round(GEN_CAP['卒'] * capK), Math.max(2, Math.round(lightBudget * (1 - maShare) + rnd() * 1.5)));
  // 大考波:近卫随关数增厚
  if (bossId) count['士'] = Math.max(count['士'] ?? 0, Math.min(Math.round(GEN_CAP['士'] * capK), 2 + Math.floor(n / 18)));
  // 成组:轻→重垫后;将压轴
  const groups: WaveGroup[] = [];
  const order: EnemyType[] = ['卒', '马', '车', '砲', '士', '象'];
  const zuGap = Math.max(0.5, 1.05 - (n - 11) * 0.008);
  for (const t of order) {
    const c = count[t];
    if (c) groups.push(w(t, c, t === '卒' ? zuGap : GEN_GAP[t], (GEN_DELAY[t] ?? 0) + rnd() * 1.2));
  }
  if (bossId) groups.push(w('将', BOSSES[bossId].count ?? 1, GEN_GAP['将'], 10));
  return groups;
}

/** 生成一关(第 11~50 关) */
function genLevel(n: number): LevelDef {
  const arcIdx = Math.floor((n - 11) / 5);
  const pos = (n - 11) % 5;
  const arc = ARCS[arcIdx];
  const W = 6 + Math.floor((n - 11) / 9);
  const bossId = arc.bossEvery ? arc.bossSeq![pos] : (pos === 4 ? arc.boss : null);
  // 波预算:后波重于前波(权重 0.7 → 2.3);大考波再 ×1.35
  const ws: number[] = [];
  let sum = 0;
  for (let i = 0; i < W; i++) {
    let x = 0.7 + 1.6 * (i / (W - 1));
    if (bossId && i === W - 1) x *= 1.35;
    ws.push(x); sum += x;
  }
  const B = 7 * n + 277;
  const waves: WaveGroup[][] = [];
  for (let i = 0; i < W; i++) {
    waves.push(genWave(n, i, W, B * ws[i] / sum, arc, mulberry32(n * 7919 + i * 131), bossId && i === W - 1 ? bossId : null));
  }
  // 水军参战章:每关 1~2 艘(章内序 ≥2 起双船),泊波取中段、避开大考波
  let navy: { at: number; squad: number }[] | undefined;
  if (arc.navy) {
    navy = [];
    const boats = pos >= 2 ? 2 : 1;
    for (let k = 0; k < boats; k++) {
      navy.push({
        at: Math.min(1 + k * 2, W - (bossId ? 2 : 1)),
        squad: Math.min(NAVY.squadMax, arc.navy.base + arc.navy.per * pos + k),
      });
    }
  }
  return {
    name: arc.names[pos], mapId: arc.map, gold: GOLD_START,
    gap: Math.max(1.3, 2.4 - arcIdx * 0.15),
    boss: bossId ?? undefined,
    open: arc.open.map(([c, r]) => [c, r] as [number, number]),
    waves, navy,
  };
}

/** 第 11~50 关(程序编排;与手排前 10 关拼接即完整战役) */
const GEN_LEVELS: LevelDef[] = [];
for (let n = 11; n <= 50; n++) GEN_LEVELS.push(genLevel(n));

export const LEVELS: LevelDef[] = [...LEVELS_1_10, ...GEN_LEVELS];

/** 选关分页的卷标(每 10 关一卷):render/overlays.ts 选关页引用 */
export const CHAPTERS = [
  { name: '卷一 · 起兵', sub: '楚河汉界 · 孤军深入' },
  { name: '卷二 · 回师', sub: '水军楼船 · 轻骑奔袭' },
  { name: '卷三 · 奇阵', sub: '三管齐下 · 水淹七军' },
  { name: '卷四 · 铁壁', sub: '铁甲连环 · 万流归宗' },
  { name: '卷五 · 终局', sub: '场场大考 · 楚汉终局' },
];

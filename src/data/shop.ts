/* ============================================================
   军械库(局外商店)—— 统一的「军械」注册表
   ------------------------------------------------------------
   永久强化与战备道具已合为一体:每件军械 = 一条数据,各有
   一套独特机制(不再只是加数值)。规则:
     · 用军饷「解锁」即永久拥有(一次性,无等级、无消耗)
     · 只有装进「背包」的军械才在局内生效(容量有限 = 取舍)
     · 主动军械可反复点击使用(进冷却),一局最多带 2 个
     · 被动军械常驻生效(占背包格,与主动抢位置)

   两类:
     被动 passive —— 装上就一直生效(屯粮/金钟罩/垦荒令/老卒/军令旗/连弩机)
     主动 active  —— 点击触发,冷却后可再用(战鼓/绊马索/火牛阵/灵药/援军令)

   参数在 fx 里,效果分发见 systems/items.ts;装载见 state.ts。
   容量与主动上限在 config.ts 的 GEAR_BAG。
   新增一件:这里加一条 + items.ts(主动)或 state.ts(被动)加分支。
   ============================================================ */

export type GearKind = 'passive' | 'active';

export interface GearFx {
  /* —— 被动 —— */
  waveGold?: number;   // 屯粮车:每过一波 +N 粮草
  waveHeal?: number;   // 金钟罩:每过一波帅回 N 血(不超上限)
  waveKen?: number;    // 垦荒令:每过一波 +N 枚垦荒令
  startLv2?: boolean;  // 老卒:开局兵营预置一枚二级兵
  startTile?: number;  // 军令旗:开局兵营预置 N 枚随机字牌
  mergeGold?: number;  // 连弩机:每次合成返还 N 粮草
  /* —— 主动 —— */
  drumDur?: number;    // 战鼓:全军攻速加成持续秒数
  drumRate?: number;   // 战鼓:攻速加成倍率(0.6 = +60%)
  slowDur?: number;    // 绊马索:全场敌军减速持续秒数
  burnPct?: number;    // 火牛阵:全场敌军烧去当前血量百分比
  heal?: number;       // 灵药:帅血 +N(不超本局上限)
  refill?: boolean;    // 援军令:免费补满兵营(不计征兵涨价)
}

export interface GearDef {
  id: string;          // 存档键(saveData.gear / bag)
  name: string;        // 展示名
  glyph: string;       // 徽记单字
  kind: GearKind;
  cost: number;        // 解锁价(军饷,一次性)
  desc: string;        // 一句话机制
  cd?: number;         // 主动技能冷却(秒)
  fx: GearFx;
}

export const GEAR: GearDef[] = [
  /* ---------- 被动:装上即常驻 ---------- */
  {
    id: 'cang', name: '屯粮车', glyph: '粮', kind: 'passive', cost: 55,
    desc: '每过一波 粮草 +2',
    fx: { waveGold: 2 },
  },
  {
    id: 'bi', name: '金钟罩', glyph: '盾', kind: 'passive', cost: 60,
    desc: '每过一波 帅血回 1',
    fx: { waveHeal: 1 },
  },
  {
    id: 'ken', name: '垦荒令', glyph: '垦', kind: 'passive', cost: 45,
    desc: '每过一波 垦荒令 +1',
    fx: { waveKen: 1 },
  },
  {
    id: 'laozu', name: '老卒', glyph: '卒', kind: 'passive', cost: 70,
    desc: '开局预置一枚二级兵',
    fx: { startLv2: true },
  },
  {
    id: 'ling', name: '军令旗', glyph: '令', kind: 'passive', cost: 60,
    desc: '开局预置两枚随机字牌',
    fx: { startTile: 2 },
  },
  {
    id: 'lian', name: '连弩机', glyph: '弩', kind: 'passive', cost: 65,
    desc: '每次合成 粮草 +2',
    fx: { mergeGold: 2 },
  },

  /* ---------- 主动:点击触发,进冷却可再用 ---------- */
  {
    id: 'gu', name: '战鼓', glyph: '鼓', kind: 'active', cost: 50, cd: 30,
    desc: '全军攻速 +60%,12 秒',
    fx: { drumDur: 12, drumRate: 0.6 },
  },
  {
    id: 'suo', name: '绊马索', glyph: '索', kind: 'active', cost: 45, cd: 28,
    desc: '全场敌军半速 6 秒',
    fx: { slowDur: 6 },
  },
  {
    id: 'niu', name: '火牛阵', glyph: '牛', kind: 'active', cost: 75, cd: 40,
    desc: '全场烧去当前血 25%',
    fx: { burnPct: 0.25 },
  },
  {
    id: 'yao', name: '灵药', glyph: '药', kind: 'active', cost: 40, cd: 30,
    desc: '帅血 +1(不超上限)',
    fx: { heal: 1 },
  },
  {
    id: 'ling2', name: '援军令', glyph: '援', kind: 'active', cost: 55, cd: 35,
    desc: '免费补满兵营',
    fx: { refill: true },
  },
];

/** 按 id 取定义 */
export function gearOf(id: string): GearDef | undefined {
  return GEAR.find(g => g.id === id);
}

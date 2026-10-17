/* ============================================================
   军械库(局外商店)—— 统一的「军械」注册表
   ------------------------------------------------------------
   永久强化与战备道具已合为一体:每件军械 = 一条数据,各有
   一套独特机制(不再只是加数值)。规则:
     · 用军饷「解锁」即永久拥有(一次性,无等级、无消耗)
     · 主动军械要装进「技能槽」才在局内生效,可反复点击使用,一局最多 2 个
     · 被动军械要「携带」才在局内生效,上限 6 件,可随时取下(2026-10 定稿:
       旧版「解锁即常驻不限数」已推翻——两个池子各自成池,互不抢格)

   两类:
     被动 passive —— 携带即生效(屯粮车/金钟罩/垦荒令/老卒/军令旗/连弩机 /
                    免死符/中军大纛/背水一战/陷马坑/金鼓/屯田令)
     主动 active  —— 点击触发,冷却后可再用(战鼓/绊马索/火牛阵/灵药/援军令)

   ★ 被动池已超过上限 6:携带上限才真正逼出取舍——选哪六件 = 一套打法。

   参数在 fx 里,效果分发见 systems/items.ts;装载见 state.ts。
   容量与主动上限在 config.ts 的 GEAR_BAG。
   新增一件:这里加一条 + items.ts(主动/按波被动)或 state.ts(开局被动)加分支。
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
  reviveOnce?: boolean;      // 免死符:帅受致命伤时留 1 血(每局一次)
  auraR?: number;            // 中军大纛:帅旁光环半径(逻辑像素)
  auraRate?: number;         // 中军大纛:光环内攻速加成(0.25 = +25%)
  desperateAt?: number;      // 背水一战:帅血降到几点算「背水」
  desperateRate?: number;    // 背水一战:残血时的全军攻速加成(0.45 = +45%)
  trapR?: number;            // 陷马坑:每波开局布下的泥沼半径
  trapDur?: number;          // 陷马坑:泥沼持续秒数
  cdCut?: number;            // 金鼓:主动军械冷却缩短比例(0.3 = 冷却 -30%)
  openGold?: number;         // 屯田令:每次开垦荒地 +N 粮草
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
  desc: string;        // 一句话机制(军械卡按 22px 单行绘制:约 11 个汉字内,超长会撞右侧开关)
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

  /* ---------- 被动·第二轮(每件一套独立机制,不是数值堆;被动池已超上限 6) ---------- */
  {
    id: 'mian', name: '免死符', glyph: '免', kind: 'passive', cost: 130,
    desc: '每局一次 致命伤留 1 血',
    fx: { reviveOnce: true },
  },
  {
    id: 'da', name: '中军大纛', glyph: '纛', kind: 'passive', cost: 90,
    desc: '帅旁光环内 攻速 +25%',
    fx: { auraR: 150, auraRate: 0.25 },
  },
  {
    id: 'bei', name: '背水一战', glyph: '水', kind: 'passive', cost: 80,
    desc: '帅血剩 1 时 攻速 +45%',
    fx: { desperateAt: 1, desperateRate: 0.45 },
  },
  {
    id: 'xian', name: '陷马坑', glyph: '陷', kind: 'passive', cost: 75,
    desc: '每波开局 道上落泥沼',
    fx: { trapR: 130, trapDur: 6 },
  },
  {
    id: 'jin', name: '金鼓', glyph: '金', kind: 'passive', cost: 70,
    desc: '主动军械冷却 -30%',
    fx: { cdCut: 0.3 },
  },
  {
    id: 'tian', name: '屯田令', glyph: '田', kind: 'passive', cost: 55,
    desc: '每次开垦荒地 粮草 +2',
    fx: { openGold: 2 },
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

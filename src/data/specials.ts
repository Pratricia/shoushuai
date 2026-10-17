/* ============================================================
   特殊兵种注册表 —— 棋语字牌 × 基础棋子,拼装成军
   ------------------------------------------------------------
   规则(一律统一,无例外):
     · 每个特殊军 = 一枚基础棋子 + 恰好 2 枚字牌。
     · 2 枚字牌各自贴在基础棋子的上下左右四邻格(彼此不必相邻),
       凑齐即自动并格成军。
     · 名称是象棋术语,字牌就是术语里「去掉基础棋子本名」的那两个字:
         连环马 = 连 + 环     担竿炮 = 担 + 竿
         巡河炮 = 巡 + 河     骑河车 = 骑 + 河
         过河兵 = 过 + 河     飞相局 = 飞 + 局
         羊角士 = 羊 + 角
       连「相」这类术语只有两字(飞相),改用三字布局名(飞相局),
       同样拆出两枚字牌——所以每军都是 2 枚,不再有「只要一个字」的。

   · 特殊军【占两格】:本体格(基础棋子位)+ 副格(最后拼上的那枚
     字牌的格);上下关系成竖对、左右关系成横对,朝向写进 p.vec,
     此后怎么挪都是两格。
   · 特殊军【经验升级】:成军继承基础棋子等级,此后不再靠合成,
     击杀敌军攒经验(XP 注册表见 config),攒满 needLv[等级] 升一级。
   · 数值强化(倍率与等级成长叠乘)按本表生效。

   新增一军 = 这里加一条数据 + types.ts 扩 TileType 联合,
   引擎(成军扫描/数值/渲染)零改动,自动生效。
   ============================================================ */
import type { PieceType, TileType } from '../types';

/** 特殊军定义:倍率作用于基础兵种(与等级成长叠乘);
 *  mech = 独门机制键(数值在 config.SP_MECH)——特殊军不能只是「数值大的基础兵」,
 *  每军一个一眼可见的独门打法(羊角士的机制是「殉国破围」,挂在 enemies.ts 挡驾处) */
export interface SpecialDef {
  id: string; name: string;
  base: PieceType;          // 成军的基础棋子(字牌须贴着它)
  parts: TileType[];        // 所需字牌(恰好 2 枚,全部在其四邻格即触发)
  dmg: number;              // 伤害倍率
  haste?: number;           // 攻速倍率(>1 更快;过河兵专属)
  range?: number;           // 射程倍率
  area?: number;            // 范围类倍率(溅射半径 / 跳跃距离 / 冲程 / 践踏圈)
  hops?: number;            // 马:连跳总跳数(覆盖基础值)
  hitCap?: number;          // 车:碾压命中上限(覆盖基础值)
  mech?: string;            // 独门机制键(见 config.SP_MECH)
  desc: string;             // 一句话风味(结算/图鉴用)
}

export const SPECIALS: Record<string, SpecialDef> = {
  /* 连环马:两马互保,连环五踏——每踏落点震荡余波,一踏一片 */
  '连环马': {
    id: '连环马', name: '连环马', base: '马', parts: ['连', '环'],
    dmg: 2.0, area: 1.25, hops: 5, mech: 'ringHop', desc: '两马互保 · 踏落震荡余波',
  },
  /* 担竿炮:双炮担竿同线而列,重轰大圈——落点敌人被重锤砸停 */
  '担竿炮': {
    id: '担竿炮', name: '担竿炮', base: '炮', parts: ['担', '竿'],
    dmg: 1.9, range: 1.2, area: 1.55, mech: 'stunShell', desc: '双炮担竿 · 重轰震停',
  },
  /* 巡河炮:炮巡楚河,隔河长射——一炮双落,主弹之外再补次远目标 */
  '巡河炮': {
    id: '巡河炮', name: '巡河炮', base: '炮', parts: ['巡', '河'],
    dmg: 1.8, range: 1.25, area: 1.45, mech: 'twinShell', desc: '炮巡楚河 · 一炮双落',
  },
  /* 骑河车:车骑河沿要道——冲阵全速不吃碾压减速,撞飞更狠,横扫两岸 */
  '骑河车': {
    id: '骑河车', name: '骑河车', base: '车', parts: ['骑', '河'],
    dmg: 1.9, area: 1.35, hitCap: 7, mech: 'fullSteam', desc: '全速冲阵 · 撞飞两岸',
  },
  /* 过河兵:过河卒强于车——突刺贯穿,一刺连带身后之敌 */
  '过河兵': {
    id: '过河兵', name: '过河兵', base: '兵', parts: ['过', '河'],
    dmg: 2.5, haste: 1.3, range: 1.25, mech: 'pierce', desc: '突刺贯穿 · 一刺两敌',
  },
  /* 飞相局:相飞田字,一落千钧——落点中心双倍碎击,全圈强推散 */
  '飞相局': {
    id: '飞相局', name: '飞相局', base: '相', parts: ['飞', '局'],
    dmg: 1.9, range: 1.2, area: 1.5, mech: 'crushLand', desc: '落地千钧 · 中心碎击',
  },
  /* 羊角士:双士上角如羊角拱宫——殉国挡驾时破围一击(机制在 enemies.ts) */
  '羊角士': {
    id: '羊角士', name: '羊角士', base: '仕', parts: ['羊', '角'],
    dmg: 2.2, range: 1.3, desc: '双角拱宫 · 殉国破围',
  },
};

/** 全部字牌字符(由注册表推导,单一数据源) */
export const TILE_CHARS: ReadonlySet<string> = new Set(
  Object.values(SPECIALS).flatMap(sp => sp.parts as string[]));

/** 这个字是字牌零件吗(类型收窄守卫) */
export function isTile(t: string): t is TileType {
  return TILE_CHARS.has(t);
}

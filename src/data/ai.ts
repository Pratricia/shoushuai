/* ============================================================
   对战对方 AI —— 流派预设(敌方「主公」的性格与打法)
   ------------------------------------------------------------
   对方 AI 是一个「按同一套规则行事的玩家」:也用真实机制征兵 /
   布阵 / 合成 / 回收 / 成军 / 用军械 / 派水军,不额外加数值、不
   跳规则。它唯一的差异是「性格」——本文件描述几套预设流派:

     · favors      主战兵种:合成与布阵优先照顾这些兵种
     · tileUrge    字牌成军积极性(越高越愿意为「半成型」的军占地)
     · tileReserve 给基础子留的机动格数(越大越不爱拿字牌占死地皮)
     · sellFloor   回收门槛:≤ 该等级的孤子(无同类可合)才考虑卖
     · 军械/兵符偏好池:开局从池里随机抽取(件数见 rollAiLoadout)

   每局开战随机抽一套流派 + 随机军械/兵符,故同一个 AI 每次对局
   打法不同,但都在同一套机制与资源内 —— 「随机有备而来」,不作弊。

    **段位越高,对方「有备而来」的下限越高**:保底件数按我方段位分八档
    (兵卒近乎裸奔 → 元帅抽到池子大半 + 四枚兵符),再各五成概率多带一件。
    仍是玩家同款上限(被动 ≤ GEAR_BAG.passiveCap · 主动 ≤ GEAR_BAG.activeCap · 兵符看池),
    所以段位涨的是「对手的牌面」,不是「对手的数值」。

    调 AI 强弱:改预设参数 / 改 AI_FLOOR 段位档 / 改 config.ts 的 DUEL。
   ============================================================ */
import type { PieceType } from '../types';
import { GEAR_BAG } from '../config';

export interface AiPreset {
  id: string;
  name: string;         // 流派名(对战顶栏展示)
  desc: string;         // 一句话打法
  favors: PieceType[];  // 优先合成/布阵的兵种(靠前者权重越高)
  tileUrge: number;     // 字牌成军积极性:≥0.5 才愿意为「半成型」的军占地
  tileReserve: number;  // 留给基础子的机动格数(字牌占地前至少要空这么多)
  sellFloor: number;    // 可回收的等级上限
  /* 军械偏好池(开局从池里按段位保底随机抽) */
  passive: string[];
  active: string[];
  /* 兵符偏好池(开局从池里按段位保底随机抽) */
  fu: string[];
  boatGap: number;      // 派水军间隔倍率(<1 更勤,>1 更保守)
}

/* 军械池怎么排的(设计口径):
   · 一件军械进池 = 玩家在对战里可能被它打到,所以「全部 17 件都得在敌方随机库内」;
     但**不是每个流派都能抽到任意件**——池按流派性格「分散」发放,流派才有脸:
       陷马坑 → 兵海铺路后用泥沼拖住来犯      金鼓 → 主动军械更勤(火牛/战鼓/援军令)
       中军大纛 → 围着帅成军,光环越铺越广    背水一战 → 残血全军提速,搏命快攻
       免死符 + 屯田令 → 死守住土,垦一寸返一分粮
   · 主动池本来就覆盖全部 5 件(每个流派 3 件,合起来 5 件齐全),故只补被动。
   · **垦荒令(ken)故意不进池**:AI 开垦走的是「每两波 +1 格的额度」(aiCellCap),
     不花令牌;`onWaveStart` 会给它加 kens 但它从不消费 → 进池等于白占一格。
     哪天给它加一条「用令牌开垦」的机制,再放进来。 */
export const AI_PRESETS: AiPreset[] = [
  {
    id: 'infantry', name: '卒伍兵海', desc: '以量取胜,兵海铺路层层并子',
    favors: ['兵', '相'], tileUrge: 0.5, tileReserve: 2, sellFloor: 1,
    passive: ['cang', 'laozu', 'ling', 'xian'], active: ['gu', 'ling2', 'suo'], fu: ['zu', 'ma', 'che', 'shi'],
    boatGap: 1.0,
  },
  {
    id: 'artillery', name: '轰天炮阵', desc: '远火覆盖,炮车齐鸣溅射清场',
    favors: ['炮', '车'], tileUrge: 0.62, tileReserve: 2, sellFloor: 1,
    passive: ['cang', 'lian', 'laozu', 'jin'], active: ['niu', 'gu', 'ling2'], fu: ['pao', 'che', 'zu', 'ma'],
    boatGap: 1.05,
  },
  {
    id: 'strategist', name: '军师字阵', desc: '以军为核,攒字牌成军倍率碾压',
    favors: ['马', '炮'], tileUrge: 1.0, tileReserve: 1, sellFloor: 1,
    passive: ['ling', 'laozu', 'cang', 'da'], active: ['ling2', 'suo', 'gu'], fu: ['ma', 'pao', 'zu', 'xiang', 'shi'],
    boatGap: 1.15,
  },
  {
    id: 'fortress', name: '铁壁守土', desc: '碾阵拒止,车相配合定身慢刀',
    favors: ['车', '相', '兵'], tileUrge: 0.6, tileReserve: 2, sellFloor: 1,
    passive: ['bi', 'laozu', 'cang', 'mian', 'tian'], active: ['ling2', 'suo', 'yao'], fu: ['che', 'xiang', 'shi', 'zu'],
    boatGap: 1.35,
  },
  {
    id: 'cavalry', name: '轻骑突袭', desc: '快攻压制,马踏连营水军频出',
    favors: ['马', '车', '兵'], tileUrge: 0.5, tileReserve: 2, sellFloor: 1,
    passive: ['lian', 'cang', 'laozu', 'bei'], active: ['gu', 'ling2', 'niu'], fu: ['ma', 'che', 'pao', 'shi'],
    boatGap: 0.85,
  },
];

export interface AiLoadout {
  passive: string[];   // 武装的被动军械(常驻)
  active: string[];    // 武装的主动军械(装入技能槽)
  fu: string[];        // 武装的兵符
}

/** AI 大脑:流派 + 军械/兵符 + 各类计时(每帧驱动) */
export interface AiBrain {
  preset: AiPreset;
  loadout: AiLoadout;
  draftT: number;      // 距下次决策(征兵/布阵/合成)
  boatT: number;       // 距下次派水军
  gearT: number;       // 距下次主动军械扫描
  t: number;           // 累计时间(调试)
}

/** 段位保底武装件数(被动军械 / 主动军械 / 兵符) */
export interface AiLoadoutFloor {
  passive: number;
  active: number;
  fu: number;
}

/** 段位 → 对方开局「有备而来」的保底件数(八档,与 RANKS 一一对应)
 *    兵卒 只 1 被动 1 主动、兵符保底 0     (对面也就个新兵蛋子)
 *    元帅 抽到池子大半 + 四枚兵符         (对面也是老兵,牌面给足)
 *  仍是玩家同款上限:被动 ≤ GEAR_BAG.passiveCap(6;而流派池只有 4~5 件,
 *  故高档位实际是「池子基本抽干」)、主动 ≤ GEAR_BAG.activeCap(2;池 3)、兵符看池。 */
const AI_FLOOR: AiLoadoutFloor[] = [
  { passive: 1, active: 1, fu: 0 },   // 兵卒
  { passive: 1, active: 1, fu: 1 },   // 伍长
  { passive: 2, active: 1, fu: 1 },   // 什长
  { passive: 2, active: 2, fu: 2 },   // 队正
  { passive: 2, active: 2, fu: 2 },   // 校尉
  { passive: 3, active: 2, fu: 3 },   // 都尉
  { passive: 3, active: 2, fu: 3 },   // 将军
  { passive: 3, active: 2, fu: 4 },   // 元帅
];

/** 我方段位对应的对方保底武装(越界收敛到首/末档) */
export function aiLoadoutFloor(tier: number): AiLoadoutFloor {
  return AI_FLOOR[Math.min(AI_FLOOR.length - 1, Math.max(0, tier))];
}

/** 抽一套流派 + 军械/兵符:件数 = 段位保底 + 五成概率再多一件(上限仍是玩家同款:
 *  被动 ≤ GEAR_BAG.passiveCap(池 3)· 主动 ≤ GEAR_BAG.activeCap · 兵符看池)。tier = 我方当前段位。 */
export function rollAiLoadout(tier = 0): { preset: AiPreset; loadout: AiLoadout } {
  const preset = AI_PRESETS[Math.floor(Math.random() * AI_PRESETS.length)];
  const f = aiLoadoutFloor(tier);
  const bonus = (): number => (Math.random() < 0.5 ? 1 : 0);
  return {
    preset,
    loadout: {
      passive: pickN(preset.passive, Math.min(GEAR_BAG.passiveCap, f.passive + bonus())),
      active: pickN(preset.active, Math.min(GEAR_BAG.activeCap, f.active + bonus())),
      fu: pickN(preset.fu, f.fu + bonus()),
    },
  };
}

/** 从池里不重复抽 n 个(池不足则全取) */
function pickN(pool: string[], n: number): string[] {
  const rest = pool.slice();
  const out: string[] = [];
  while (out.length < n && rest.length > 0) {
    out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
  }
  return out;
}

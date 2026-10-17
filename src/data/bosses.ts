/* ============================================================
   Boss 注册表 —— Boss 是一种敌军类型,「将」是出怪占位键
   ------------------------------------------------------------
   每位 Boss = 本表一条数据(数值 + 技能组合 + 棋面字 + 名字 +
   出阵告示 title),关卡通过 LevelDef.boss 字段指定出场者。
   选关模式规则:只在 5 的倍数关卡的最后一波出现。

   出阵仪式:Boss 生成时在楚河汉界拉起告示横幅(名字 + title
   一句话),让玩家立刻知道「这一波的对手是谁、什么路数」。
   无限模式按本表顺序轮换(第 5/10/15… 波),所以新将排在
   前段让玩家早些遇上。

   新增一位 Boss:这里加一条数据即可,引擎零改动。
   新增一种技能:types.ts 扩 BossSkill 联合 + skills.ts 加分发
   case,再在对应系统钩子(出怪/行军/伤害/渲染)读取。
   ============================================================ */
import type { BossDef } from '../types';

export const BOSSES: Record<string, BossDef> = {
  /* 敌将:首位 Boss(原「将」的硬编码逻辑整体迁入)——
     体格免疫击退、免疫舍身挡驾(必须硬杀);士卫队在链接
     半径内护主,Boss 受伤减半、另一半由卫队均摊 */
  '敌将': {
    id: '敌将', name: '敌将', glyph: '将', title: '卫队护主 · 舍身无用',
    hp: 620, spd: 38, dmg: 2, r: 46, gold: 30,
    skills: [
      { id: 'knockImmune' },
      { id: 'sacrificeImmune' },
      { id: 'guardLink', guard: '士', radius: 220, share: 0.5 },
    ],
  },

  /* 铁门栓:取自杀法「铁门栓」——车炮借中线直锁将门。
     攻坚型 Boss:周期性「一子定栓」——锁死射程内火力最猛的
     那枚棋子(铁链相连、晕眩不能出手),逼玩家分散火力、
     挪子避栓,或集火速杀开门 */
  '铁门栓': {
    id: '铁门栓', name: '铁门栓', glyph: '栓', title: '一子定栓 · 封你重炮',
    hp: 700, spd: 46, dmg: 2, r: 42, gold: 40,
    skills: [
      { id: 'bolt', cd: 8, range: 380, stun: 3 },
    ],
  },

  /* 双车错:取自杀法「双车错」——两车错落夹击,前后照将。
     成对出阵的 Boss:count=2,一东一西同时压上,金线相连;
     杀剩其一即「孤车死斗」大幅提速——要么分兵,要么速斩其一 */
  '双车错': {
    id: '双车错', name: '双车错', glyph: '车', title: '两路齐错 · 孤车死斗',
    hp: 400, spd: 60, dmg: 2, r: 40, gold: 25, count: 2,
    skills: [
      { id: 'dash', cd: 7, dist: 260, stunR: 90, stun: 1 },
      { id: 'twin' },
    ],
  },

  /* 卧槽马:取自杀法「卧槽马」——马卧槽位,一跃定局。
     刺客型 Boss:血薄但脚快,周期性腾空闪袭(马走日),
     直接跃过防线纵深,落地眩晕一圈——逼玩家排布纵深火力,
     而非把主力全堆在第一线 */
  '卧槽马': {
    id: '卧槽马', name: '卧槽马', glyph: '马', title: '马走日 · 飞跃防线',
    hp: 520, spd: 66, dmg: 2, r: 40, gold: 30,
    skills: [
      { id: 'leap', cd: 9, dist: 280, stunR: 120, stun: 1.2 },
    ],
  },

  /* 当头炮:取自开局「炮二平五」——炮镇中宫,直指帅府。
     炮台型 Boss:周期性架炮轰击最密集的阵地(复用红圈预警,
     圈内棋子及时拖走可躲);「炮架」借棋子为架——贴着棋子
     时减伤一半,逼玩家散阵 + 远程消耗,别贴脸围殴 */
  '当头炮': {
    id: '当头炮', name: '当头炮', glyph: '炮', title: '炮镇中宫 · 轰你最密处',
    hp: 680, spd: 42, dmg: 2, r: 44, gold: 35,
    skills: [
      { id: 'bombard', cd: 12, radius: 140, stun: 2.5 },
      { id: 'mountShield', radius: 90, reduce: 0.5 },
    ],
  },

  /* 过河卒:取自谚「过河卒子当车用」——小卒过河,一去不回。
     赛跑型 Boss:血最薄但脚最快,免疫减速(不回头!),
     残血(≤40%)越河狂奔再提速——考验瞬时爆发,磨血即败 */
  '过河卒': {
    id: '过河卒', name: '过河卒', glyph: '卒', title: '过河不回头 · 残血狂奔',
    hp: 540, spd: 92, dmg: 1, r: 34, gold: 30,
    skills: [
      { id: 'noSlow' },
      { id: 'rage', threshold: 0.4, spd: 0.7 },
    ],
  },

  /* 铁滑车:取自布局「铁滑车」——弃子抢出车,一线平推。
     攻城锤型 Boss:重甲免疫击退、全伤害减 25%,周期性
     地面冲刺碾过阵线、沿线眩晕(冲刺中仍可集火,与卧槽马
     的空中不可选中相反——考验硬碰硬的持续输出) */
  '铁滑车': {
    id: '铁滑车', name: '铁滑车', glyph: '车', title: '重甲一线 · 冲阵碾敌',
    hp: 780, spd: 55, dmg: 2, r: 46, gold: 40,
    skills: [
      { id: 'knockImmune' },
      { id: 'dash', cd: 8, dist: 250, stunR: 80, stun: 1.2 },
      { id: 'armor', reduce: 0.25 },
    ],
  },

  /* 楚霸王:楚河汉界的本源——项羽,拔山盖世,无限模式压轴。
     山型 Boss:血量最厚、免疫击退与舍身;血过 66% / 33%
     两道门槛各召三名伏兵「十面埋伏」,越打越多的消耗战——
     只在无限模式轮换出场(战役不动用霸王) */
  '楚霸王': {
    id: '楚霸王', name: '楚霸王', glyph: '霸', title: '十面埋伏 · 越打越多',
    hp: 1500, spd: 40, dmg: 3, r: 50, gold: 60,
    skills: [
      { id: 'knockImmune' },
      { id: 'sacrificeImmune' },
      { id: 'summon', hpGate: [0.66, 0.33], n: 3, minion: '卒' },
    ],
  },
};

/** 按 id 取 Boss 定义(关卡引用不存在的 id = 数据错误,关卡加载即报) */
export function getBoss(id: string): BossDef {
  const def = BOSSES[id];
  if (!def) throw new Error('未知 Boss id:「' + id + '」——检查 data/bosses.ts 注册表');
  return def;
}

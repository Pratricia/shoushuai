/* ============================================================
   兵符注册表 —— Boss 符片集齐后可铸的永久兵种强化
   ------------------------------------------------------------
   规则:一枚兵符铸给一个基础兵种(每种只能铸一枚,
   不可叠加);由该兵种成军的特殊军同享机制——
   马蹄符 → 连环马连杀、炮膛符 → 担竿炮/巡河炮落点起火。

   ★ 兵符不是纯数值,每枚是一套独特机制(mech),
     彼此咬合成流派(见 synergy 与设计文档「流派」):
       卒伍破甲 × 炮膛灼烧   = 焚阵:破甲放大火场
       相羽沼泽 × 炮膛灼烧   = 泥沼火海:困住再烤
       卒伍破甲 × 马蹄连杀   = 连锁收割:破甲后一路踏穿
       车辕撞晕 × 相羽沼泽   = 铁骑碾阵:定住再冲
       相羽沼泽 × 士魂处决   = 瓮中捉鳖:减速后补斩

   符片来源:Boss 击杀掉落(config.ts 的 FU_DROP 控爆率)。
   机制数值在 config.ts 的 FU_MECH;挂点在各兵种攻击结算处。

   新增一枚:这里加一条 + 对应攻击结算处挂一个 mech 分支。
   ============================================================ */
import type { PieceType } from '../types';

/** 机制标识(各兵种攻击结算处读它) */
export type FuMech =
  | 'breakArmor'   // 兵:命中破甲,期间受伤放大
  | 'chainKill'    // 马:击杀续跳,连环不绝
  | 'burnShell'    // 炮:弹落处燃起火场
  | 'stunCharge'   // 车:冲阵撞晕
  | 'slowStomp'    // 相:践踏留减速沼泽
  | 'execute';     // 仕:残血处决

export interface FuDef {
  id: string;            // 存档键(saveData.fu)
  piece: PieceType;      // 生效的基础兵种(特殊军继承机制)
  name: string;          // 展示名
  desc: string;          // 机制一句话
  cost: number;          // 铸造所需符片数
  mech: FuMech;
  synergy: string;       // 契合流派提示(界面显示)
}

export const FUS: FuDef[] = [
  {
    id: 'zu', piece: '兵', name: '卒伍符', cost: 6,
    desc: '兵命中破甲 3 秒:期间该敌受到的一切伤害 +25%',
    mech: 'breakArmor',
    synergy: '流派·焚阵(配炮膛)/ 连锁收割(配马蹄)',
  },
  {
    id: 'ma', piece: '马', name: '马蹄符', cost: 6,
    desc: '马每次击杀立即续跳(连跳次数回满)',
    mech: 'chainKill',
    synergy: '流派·连锁收割(配卒伍)/ 突袭破阵(配车辕)',
  },
  {
    id: 'pao', piece: '炮', name: '炮膛符', cost: 8,
    desc: '炮弹落点燃起火场 3 秒,持续灼烧其中敌军',
    mech: 'burnShell',
    synergy: '流派·焚阵(配卒伍)/ 泥沼火海(配相羽)',
  },
  {
    id: 'che', piece: '车', name: '车辕符', cost: 8,
    desc: '车冲阵撞中的敌晕 1.2 秒(原地不能行军)',
    mech: 'stunCharge',
    synergy: '流派·铁骑碾阵(配相羽)/ 突袭破阵(配马蹄)',
  },
  {
    id: 'xiang', piece: '相', name: '相羽符', cost: 8,
    desc: '相落地留下减速沼泽 6 秒(经过者半速)',
    mech: 'slowStomp',
    synergy: '流派·泥沼火海(配炮膛)/ 瓮中捉鳖(配士魂)',
  },
  {
    id: 'shi', piece: '仕', name: '士魂符', cost: 6,
    desc: '仕斩击对残血敌军(≤28% 血量)直接处决',
    mech: 'execute',
    synergy: '流派·瓮中捉鳖(配相羽)/ 收官补刀(配任意)',
  },
];

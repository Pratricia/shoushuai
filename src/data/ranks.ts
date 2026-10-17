/* ============================================================
   对战段位注册表(局外荣誉成长)
   ------------------------------------------------------------
   规则:每赢一场对垒 = 段内等级 +1;攒满本段 cap 个等级即
   「满级」,再胜一场升一段(等级回到一级)并犒赏军饷。

   设计原则:**段位只给荣誉与军饷,不给战力**——战力仍全部来自
   军械 / 兵符 / 操作;段位是「打得多、打得赢」的里程碑与标识。

   升段告示(note)在结算页亮出,给到「拜将封帅」的仪式感。
   新增一段 = 在 RANKS 里加一条(或调 cap 改升段节奏)。
   ============================================================ */
export interface RankDef {
  name: string;
  glyph: string;   // 单字徽记(界面小徽章用)
  cap: number;     // 本段等级数(满 cap 后一场升段;0 = 封顶段,不再升)
  promo: number;   // 从本段升段时的军饷犒赏(封顶段无意义)
  note: string;    // 升段告示(结算页展示的一句话)
}

export const RANKS: RankDef[] = [
  { name: '兵卒', glyph: '卒', cap: 2, promo: 10, note: '列阵在前 · 百战成卒' },
  { name: '伍长', glyph: '伍', cap: 3, promo: 14, note: '五人为伍 · 始有编制' },
  { name: '什长', glyph: '什', cap: 3, promo: 18, note: '十人为什 · 带队冲锋' },
  { name: '队正', glyph: '队', cap: 3, promo: 24, note: '百人一队 · 独当一面' },
  { name: '校尉', glyph: '校', cap: 4, promo: 30, note: '校场点兵 · 领军一营' },
  { name: '都尉', glyph: '都', cap: 4, promo: 38, note: '都尉督军 · 纵横两翼' },
  { name: '将军', glyph: '将', cap: 5, promo: 48, note: '登坛拜将 · 威震一方' },
  { name: '元帅', glyph: '帅', cap: 0, promo: 0,  note: '天下兵马 · 尽归掌中' },
];

/** 段位定义(越界收敛到首/末段) */
export function rankAt(tier: number): RankDef {
  return RANKS[Math.min(RANKS.length - 1, Math.max(0, tier))];
}

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 等级汉字(「三 级」) */
export function levelCn(lv: number): string {
  const n = Math.max(1, Math.floor(lv));
  if (n <= 10) return CN[n] + ' 级';
  if (n < 20) return '十' + CN[n - 10] + ' 级';
  return n + ' 级';
}

/** 「伍长 · 三级」 */
export function rankTitle(tier: number, level: number): string {
  return rankAt(tier).name + ' · ' + levelCn(level);
}

/** 距升段还差几胜(封顶段 = 0)。
 *  等级需先攒到 cap(满级),再胜一场方升段,故 = cap - level + 1 */
export function winsToPromote(tier: number, level: number): number {
  const r = rankAt(tier);
  if (r.cap <= 0) return 0;
  return Math.max(1, r.cap - Math.max(1, level) + 1);
}

export interface RankProgress {
  tier: number;
  level: number;
  promoted: boolean;   // 本场是否升段
  reward: number;      // 升段军饷(未升段为 0)
  fromTier: number;
  fromLevel: number;
}

/** 赢一场后的段位推进(纯函数:saves 只管持久化) */
export function advanceRank(tier: number, level: number): RankProgress {
  const fromTier = Math.min(RANKS.length - 1, Math.max(0, tier));
  const fromLevel = Math.max(1, level);
  const cur = rankAt(fromTier);
  // 封顶段:等级继续累积,不再升段
  if (cur.cap <= 0) {
    return { tier: fromTier, level: fromLevel + 1, promoted: false, reward: 0, fromTier, fromLevel };
  }
  const nl = fromLevel + 1;
  if (nl > cur.cap) {
    return { tier: fromTier + 1, level: 1, promoted: true, reward: cur.promo, fromTier, fromLevel };
  }
  return { tier: fromTier, level: nl, promoted: false, reward: 0, fromTier, fromLevel };
}

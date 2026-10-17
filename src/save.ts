/* ============================================================
   局外存档:军饷 / 通关记录 / 军械(解锁·背包) / 兵符
   ------------------------------------------------------------
   军饷是跨局持久的局外货币(localStorage),来源:
   · 战役通关(首通全饷,复通四成——奖励推进,不鼓励刷)
   · 无限模式按活过波次计饷,大考波(5 的倍数)另加
   · 对战模式胜局计饷(活过波次 × 2 + 大考波 × 6 + 12;败局减半)
   消费:军械库(数据驱动,见 data/shop.ts)——军饷解锁即永久拥有;
   被动军械解锁后**自行携带**(可取下,上限 passiveCap),主动军械需装进技能槽才能生效 ——「有」不等于「带」。

   存档形态:gear = 已解锁军械;bag = 技能槽里的主动军械序(即技能按钮序);passiveBag = 携带的被动军械(只当集合用,展示恒按注册表序)。
   旧档(shop 等级 / inv 库存 / bag 计数)自动迁移为 gear + bag;「被动解锁即常驻」时代的旧档,已解锁被动默认全部携带(超上限按注册表序截断)。

   读写纪律:模块加载即读档,变更后立即回写(单机小档,
   无批量事务需求);localStorage 不可用时静默降级为内存档。
   ============================================================ */
import { ECON, GEAR_BAG } from './config';
import { GEAR, gearOf } from './data/shop';
import { FUS } from './data/fu';
import type { FuDef } from './data/fu';
import { RANKS, advanceRank, rankAt } from './data/ranks';
import type { RankProgress } from './data/ranks';

export interface SaveData {
  money: number;                    // 军饷余额
  cleared: number[];                // 已通关关卡号(首通判定)
  gear: Record<string, number>;     // 已解锁军械 gearId -> 1(解锁即永久拥有)
  bag: string[];                    // 技能槽里的主动军械 id(有序,顺序即局内技能按钮序)
  passiveBag: string[];             // 携带的被动军械 id(上限 GEAR_BAG.passiveCap,可随时取下)
  shards: number;                   // 符片(Boss 掉落,铸兵符用)
  fu: Record<string, number>;       // 已铸兵符 fuId -> 1(每兵种一枚)
  duelTier: number;                 // 对战段位序号(0 = 兵卒,RANKS 下标)
  duelLevel: number;                // 段内等级(1 起)
  duelWins: number;                 // 对垒胜场累计
  duelLosses: number;               // 对垒负场累计
}

const KEY = 'shoushuai_v1';

/** 旧档 id → 新军械 id(合并时改名/去掉的在此映射;行囊=容量已改为自动增长) */
const OLD_MAP: Record<string, string> = {
  cang: 'cang', bi: 'bi', ken: 'ken', laozu: 'laozu', ling: 'ling',
  yao: 'yao', gu: 'gu', suo: 'suo', niu: 'niu', ling2: 'ling2',
};

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (typeof d.money === 'number') {
        const out: SaveData = {
          money: Math.max(0, Math.floor(d.money)),
          cleared: Array.isArray(d.cleared) ? d.cleared.filter((n: unknown) => typeof n === 'number') : [],
          gear: {}, bag: [], passiveBag: [],
          shards: Math.max(0, Math.floor(d.shards ?? 0)),
          fu: (d.fu && typeof d.fu === 'object') ? d.fu : {},
          duelTier: Math.min(RANKS.length - 1, Math.max(0, Math.floor(d.duelTier ?? 0))),
          duelLevel: Math.max(1, Math.floor(d.duelLevel ?? 1)),
          duelWins: Math.max(0, Math.floor(d.duelWins ?? 0)),
          duelLosses: Math.max(0, Math.floor(d.duelLosses ?? 0)),
        };
        if (d.gear && typeof d.gear === 'object') {
          // 新格式
          out.gear = d.gear;
          out.bag = Array.isArray(d.bag) ? d.bag.filter((id: unknown) => typeof id === 'string') : [];
        } else {
          // 旧档迁移:永久强化等级 / 道具库存 → 已解锁;旧背包计数 → 携带
          if (d.shop && typeof d.shop === 'object') {
            for (const k in d.shop) if ((d.shop[k] ?? 0) > 0 && OLD_MAP[k]) out.gear[OLD_MAP[k]] = 1;
          }
          if (d.inv && typeof d.inv === 'object') {
            for (const k in d.inv) if ((d.inv[k] ?? 0) > 0 && OLD_MAP[k]) out.gear[OLD_MAP[k]] = 1;
          }
          if (d.bag && typeof d.bag === 'object') {
            for (const k in d.bag) if ((d.bag[k] ?? 0) > 0 && OLD_MAP[k]) out.bag.push(OLD_MAP[k]);
          }
        }
        // 修剪:携带的必须已解锁且不重复
        const seen = new Set<string>();
        out.bag = out.bag.filter(id => out.gear[id] && !seen.has(id) && (seen.add(id), true));
        // 被动携带:新档读 passiveBag;旧档(被动「解锁即常驻」时代)默认全带上
        out.passiveBag = Array.isArray(d.passiveBag)
          ? d.passiveBag.filter((id: unknown) => typeof id === 'string')
          : GEAR.filter(g => g.kind === 'passive' && out.gear[g.id]).map(g => g.id);
        // 修剪:必须已解锁、是被动、不重复,且不超上限(超出的仍留在库里,待玩家自行取舍)
        const seenP = new Set<string>();
        out.passiveBag = out.passiveBag
          .filter(id => out.gear[id] && gearOf(id)?.kind === 'passive' && !seenP.has(id) && (seenP.add(id), true))
          .slice(0, GEAR_BAG.passiveCap);
        return out;
      }
    }
  } catch { /* 档案损坏/环境受限:回退默认档 */ }
  return { money: 0, cleared: [], gear: {}, bag: [], passiveBag: [], shards: 0, fu: {}, duelTier: 0, duelLevel: 1, duelWins: 0, duelLosses: 0 };
}

/** 全局存档单例(变更经下方函数走,保证即改即存) */
export const saveData: SaveData = load();

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(saveData)); } catch { /* 内存档 */ }
}

/* ---------- 军械库(解锁 / 背包) ---------- */

/** 已解锁(拥有)某军械 */
export function ownsGear(id: string): boolean {
  return (saveData.gear[id] ?? 0) > 0;
}

/** 已解锁的被动军械数(库存件数,与「携带」无关) */
export function passiveOwnedCount(): number {
  let n = 0;
  for (const k in saveData.gear) if (saveData.gear[k] > 0 && gearOf(k)?.kind === 'passive') n++;
  return n;
}

/** 已携带的被动军械(序恒按注册表 GEAR 序——被动之间无先后之分,展示稳定优先) */
export function passiveList(): string[] {
  return GEAR.filter(g => g.kind === 'passive' && ownsGear(g.id) && saveData.passiveBag.includes(g.id)).map(g => g.id);
}

/** 携带的被动军械数(受 GEAR_BAG.passiveCap 限制;对应局内那排徽记) */
export function passiveCarryCount(): number {
  return passiveList().length;
}

/** 某被动军械是否已携带(本局武装册只收携带的被动;「有」不等于「带」) */
export function carriesGear(id: string): boolean {
  return gearOf(id)?.kind === 'passive' && ownsGear(id) && saveData.passiveBag.includes(id);
}

/** 当前装入技能槽的主动军械(有序,已滤掉未解锁/非主动) */
export function bagList(): string[] {
  return saveData.bag.filter(id => ownsGear(id) && gearOf(id)?.kind === 'active');
}

/** 某主动军械是否在背包装备里(主动技只有装进背包才在局内生效) */
export function inBag(id: string): boolean {
  return saveData.bag.includes(id);
}

/** 背包内主动军械数(受 activeCap 限制;对应局内技能按钮数) */
export function bagActiveCount(): number {
  return bagList().length;
}

/** 解锁一件军械(扣军饷 + 永久拥有)。被动解锁即自动带上(带满则先留在库里);主动另占一个技能槽(有空槽时) */
export function unlockGear(id: string, cost: number): boolean {
  if (ownsGear(id)) return false;
  if (saveData.money < cost) return false;
  saveData.money -= cost;
  saveData.gear[id] = 1;
  if (gearOf(id)?.kind === 'active' && bagActiveCount() < GEAR_BAG.activeCap) {
    saveData.bag.push(id);
  } else if (gearOf(id)?.kind === 'passive' && passiveList().length < GEAR_BAG.passiveCap) {
    saveData.passiveBag.push(id);
  }
  persist();
  return true;
}

/** 把主动军械装进技能槽:需已解锁、不在槽内、不超过 activeCap */
export function equipGear(id: string): boolean {
  if (!ownsGear(id) || inBag(id)) return false;
  if (gearOf(id)?.kind !== 'active') return false;
  if (bagActiveCount() >= GEAR_BAG.activeCap) return false;
  saveData.bag.push(id);
  persist();
  return true;
}

/** 从技能槽取出(仅主动) */
export function unequipGear(id: string): boolean {
  const i = saveData.bag.indexOf(id);
  if (i < 0) return false;
  saveData.bag.splice(i, 1);
  persist();
  return true;
}

/** 携带一件被动军械:需已解锁、是被动、未携带、不超 passiveCap */
export function equipPassive(id: string): boolean {
  if (!ownsGear(id) || gearOf(id)?.kind !== 'passive' || carriesGear(id)) return false;
  if (passiveList().length >= GEAR_BAG.passiveCap) return false;
  saveData.passiveBag.push(id);
  persist();
  return true;
}

/** 取下已携带的被动军械(只是本局不生效;永久拥有不受影响,可随时再带上) */
export function unequipPassive(id: string): boolean {
  const i = saveData.passiveBag.indexOf(id);
  if (i < 0) return false;
  saveData.passiveBag.splice(i, 1);
  persist();
  return true;
}

/* ---------- 兵符(符片 / 铸造) ---------- */

/** Boss 掉落符片(结算口调用) */
export function addShards(n: number): void {
  saveData.shards += Math.max(0, n);
  persist();
}

/** 铸兵符:扣符片 + 登记(每符一枚,重复铸 = false) */
export function craftFu(id: string, cost: number): boolean {
  if (saveData.fu[id]) return false;
  if (saveData.shards < cost) return false;
  saveData.shards -= cost;
  saveData.fu[id] = 1;
  persist();
  return true;
}

/** 该基础兵种已铸的符(未铸 = null);攻击结算按机制取用,特殊军继承 */
export function fuOf(piece: string): FuDef | null {
  for (const f of FUS) {
    if (f.piece === piece && saveData.fu[f.id]) return f;
  }
  return null;
}

/* ---------- 发饷(结算口) ---------- */

/** 战役通关发饷:首通全饷并记录,复通四成;返回 {数额, 是否首通} */
export function awardCampaign(level: number): { n: number; first: boolean } {
  const first = !saveData.cleared.includes(level);
  if (first) saveData.cleared.push(level);
  const full = ECON.clearBase + ECON.clearPer * level;
  const n = first ? full : Math.ceil(full * ECON.replayShare);
  saveData.money += n;
  persist();
  return { n, first };
}

/** 无限模式殉局发饷:每活过 1 波 +wavePay,每活过一场大考(5 的倍数波)+bossPay */
export function awardEndless(wavesSurvived: number): number {
  const big = Math.floor(Math.max(0, wavesSurvived) / 5);
  const n = ECON.wavePay * Math.max(0, wavesSurvived) + ECON.bossPay * big;
  saveData.money += n;
  persist();
  return n;
}

/** 对战模式发饷:胜局按活过波次计饷 + 额外犒赏;败局减半(比的是谁活得更久) */
export function awardDuel(won: boolean, wavesSurvived: number): number {
  const big = Math.floor(Math.max(0, wavesSurvived) / 5);
  const base = ECON.wavePay * Math.max(0, wavesSurvived) + ECON.bossPay * big;
  const n = won ? base + ECON.duelWin : Math.ceil(base / 2);
  saveData.money += n;
  persist();
  return n;
}

/* ---------- 对战段位(荣誉成长:只给标识与军饷,不给战力) ---------- */

export interface DuelRankState {
  tier: number;          // 段位序号
  level: number;         // 段内等级(1 起)
  wins: number;
  losses: number;
  cap: number;           // 本段等级数(0 = 封顶)
  name: string;          // 段名(兵卒/校尉/将军…)
  glyph: string;         // 单字徽记
  atTop: boolean;        // 已至封顶段
}

/** 当前对垒段位快照(界面渲染用) */
export function duelRankState(): DuelRankState {
  const r = rankAt(saveData.duelTier);
  return {
    tier: saveData.duelTier,
    level: saveData.duelLevel,
    wins: saveData.duelWins,
    losses: saveData.duelLosses,
    cap: r.cap,
    name: r.name,
    glyph: r.glyph,
    atTop: r.cap <= 0,
  };
}

/** 对垒胜局:等级 +1,满级则升段(并返升段犒赏,已入账) */
export function recordDuelWin(): RankProgress {
  const p = advanceRank(saveData.duelTier, saveData.duelLevel);
  saveData.duelTier = p.tier;
  saveData.duelLevel = p.level;
  saveData.duelWins += 1;
  if (p.promoted) saveData.money += p.reward;
  persist();
  return p;
}

/** 对垒败局:只记负场(不降级,段位只升不降) */
export function recordDuelLoss(): void {
  saveData.duelLosses += 1;
  persist();
}

/** 清档(测试/正式版的「重置进度」共用) */
export function resetSave(): void {
  saveData.money = 0;
  saveData.cleared = [];
  saveData.gear = {};
  saveData.bag = [];
  saveData.passiveBag = [];
  saveData.shards = 0;
  saveData.fu = {};
  saveData.duelTier = 0;
  saveData.duelLevel = 1;
  saveData.duelWins = 0;
  saveData.duelLosses = 0;
  persist();
}

/** (测试辅助)军械注册表引用,便于脚本核对 */
export { GEAR };

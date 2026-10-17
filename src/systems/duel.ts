/* ============================================================
   对战模式(上下半屏 1v1,镜像同步)
   ------------------------------------------------------------
   两块棋盘(我方 duel.player / 对方 AI duel.rival)共享同一座
   镜像竞技场:上半 5 行为对方半场、下半 5 行为我方半场,中间是
   楚河汉界。双方各自经济/兵营/军械单独计算,承受完全对称的
   自动波次(共享同一套 endless 波次生成)——比的是谁活得更久。

   水军是唯一越河进攻手段:
     · 按波自动生成(每 DUEL.autoBoatWave 波,双方河岸**各**抢滩一艘)
     · 我方花粮主动派出(直取对方河岸出怪口)
   楼船泊在目标半场的河岸出怪口旁,水军下船沿其路线直扑对方帅。
   ============================================================ */
import type { Boat, GameState, Piece, PieceType, Point, TileType } from '../types';
import { state, duel, cellCenter, setBoard, boardGear } from '../state';
import { onGroundOpened } from './items';
import { DUEL, NAVY, W, MAXLV, MERGE, sellValue, PIECES, GROWTH } from '../config';
import { SPECIALS, isTile } from '../data/specials';
import type { AiPreset } from '../data/ai';
import { gearOf } from '../data/shop';
import { draftCost, tryDraft } from './economy';
import { checkFusions } from './fusion';
import { riverBand } from './navy';
import { useGear } from './items';
import { toast, addFloat, addEffect } from './combat';
import { awardDuel, recordDuelWin, recordDuelLoss } from '../save';

const NB: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 派船轮换两翼:连续派船自动换到另一侧河岸,避免同泊位叠影 */
let boatLane = 0;
export function nextBoatLane(): number { boatLane ^= 1; return boatLane; }

/** 水军登岸点:本方路线里「最贴楚河汉界」的那一段的中点——对战图两路都在
 *  中段贴着河岸行军,水军正是从这里抢滩上道(登岸点之后沿原路直扑帅,
 *  等于抄掉出怪口到河心的那第一段路程)。返回登岸点 + 其后的行军路点 */
function duelLanding(path: Point[]): { land: Point; rest: Point[] } {
  const band = riverBand();
  let bestI = -1;
  let bestD = Infinity;
  let land: Point = { x: path[0].x, y: band.mid };
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (Math.abs(b.x - a.x) < Math.abs(b.y - a.y)) continue;   // 只认横向的临河段
    const d = Math.abs((a.y + b.y) / 2 - band.mid);
    if (d < bestD) { bestD = d; bestI = i; land = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  }
  return { land, rest: bestI < 0 ? path : path.slice(bestI) };
}

/** 派一艘楼船越河抢滩目标棋盘(泊在对方临河行军道旁,水军就此上道) */
export function sendDuelBoat(target: GameState, wave: number, k = 0): void {
  if (target.paths.length === 0) return;
  const prev = state;
  setBoard(target);
  const band = riverBand();
  const { land, rest } = duelLanding(target.paths[0]);
  const dir = k % 2 === 1 ? -1 : 1;          // 两舷轮流驶入(相向不叠影)
  const dockX = land.x - dir * NAVY.dockOffset;
  const squad = Math.min(NAVY.squadMax, DUEL.boatSquad + Math.floor(wave * NAVY.squadPerWave));
  const boat: Boat = {
    x: dir === 1 ? -90 : W + 90,
    y: band.mid + (k % 2 === 0 ? -8 : 12),
    dir, bx: land.x, state: 'sail', ph: Math.random() * Math.PI * 2,
    squad, spawnT: 0, wave,
    path: [{ x: dockX, y: band.mid }, { x: land.x, y: band.mid }, land, ...rest],
    wait: 0.6, leaveT: 0,
  };
  target.boats.push(boat);
  setBoard(prev);
}

/** 按波自动生成的水军:双方河岸**各**一艘(对称 PvE——不会出现「这一波只砸你、对面白赚」)。
 *  两侧给同一个 `k`:登岸点/泊位/入场舷全同 → 连水军抢滩的时刻都一模一样(半场上下分屏,不叠影) */
export function duelAutoBoat(n: number): void {
  sendDuelBoat(duel.rival, n, n % 2);
  sendDuelBoat(duel.player, n, n % 2);
  toast('水军自河上来袭 · 双方河岸各抢滩一艘!');
}

/** 我方花粮主动派水军偷袭对方(点「派水军」按钮) */
export function duelManualBoat(): boolean {
  if (!duel.on || duel.over) return false;
  const p = duel.player;
  if (p.gold < DUEL.boatCost) { toast('粮草不足 · 派水军需 ' + DUEL.boatCost); return false; }
  p.gold -= DUEL.boatCost;
  sendDuelBoat(duel.rival, Math.max(1, duel.rival.waveIdx + 1), nextBoatLane());
  toast('楼船已发 · 直取敌阵河岸');
  return true;
}

/** 对战每帧:两块棋盘各跑一遍全系统(共享波次调度 = 对称 PvE),再驱动对方 AI。
 *  step 由 main.ts 注入(避免与主循环循环依赖) */
export function updateDuel(dt: number, step: (d: number) => void): void {
  setBoard(duel.rival);
  step(dt);
  setBoard(duel.player);
  step(dt);
  rivalThink(dt);
  if (duel.player.hearts <= 0) endDuel('player');
  else if (duel.rival.hearts <= 0) endDuel('rival');
  else setBoard(duel.player);
}

/** 结算对战:谁先破帅谁输;按活过波次发饷(胜局另有犒赏) */
function endDuel(loser: 'player' | 'rival'): void {
  if (duel.over) return;
  duel.over = true;
  duel.winner = loser === 'player' ? 'rival' : 'player';
  const p = duel.player;
  p.paused = false;
  duel.rival.paused = true;
  const waves = Math.max(0, p.waveIdx + 1);
  const won = duel.winner === 'player';
  p.moneyGain = awardDuel(won, waves);
  p.moneyNote = (won ? '对垒胜局' : '对垒败局') + ' · 血战 ' + waves + ' 波';
  // 段位推进:胜局等级 +1(满级升段并犒赏),败局只记负场
  p.rankUp = won ? recordDuelWin() : (recordDuelLoss(), null);
  setBoard(p);
  p.screen = won ? 'win' : 'over';
}

/* ============================================================
   对方 AI —— 一位「按同一套规则行事的玩家」
   ------------------------------------------------------------
   开局抽定一套流派预设 + 随机军械/兵符(见 data/ai.ts),此后每个
   决策点做四件事(全部走真实机制,不额外加数值、不跳规则):

     ① 合成:同型同级成对并升(免费抬级,收益最高;优先主战兵种)
     ② 成军:字牌贴到「还差这张」的基础子四邻,凑齐即并格成军
             (还会清掉四邻无人可用的「废字牌」)
     ③ 布阵:兵营里的子落到近路格(仕只落九宫);贴字牌要先留出机动格
     ④ 回收:地皮满时卖掉「最弱又无同类可合」的孤子腾位 / 兵营里
             下不去的残子也换粮(免得被下次征兵白销毁)
     ⑤ 征兵:粮草够就补(征兵是粮草唯一的出口)

   另外按战况触发主动军械(灵药留血线 / 战鼓绊马索火牛看敌军密度 /
   援军令补空营),并在粮草富余时派水军越河偷袭我方河岸。
   ============================================================ */

/** 场上占用的格子数(含特殊军副格)——AI 的「地皮」按格算 */
function cellCount(g: GameState): number {
  return g.grid.size;
}

/** 场上棋子数(双格去重) */
function fieldCount(g: GameState): number {
  let n = 0;
  for (const [key, q] of g.grid) {
    if (q && key === q.c + ',' + q.r) n++;
  }
  return n;
}

/** 对方可布阵格数上限:随波数缓增,对标我方掷垦荒令开格的节奏(不靠数值,靠地皮) */
function aiCellCap(r: GameState): number {
  const extra = Math.min(DUEL.aiKenMax, Math.floor(Math.max(0, r.waveIdx + 1) / DUEL.aiKenWaves));
  return DUEL.aiPieces + extra;
}

/** 对方已开垦的布阵格数(半场内非道路、且不再荒着) */
function aiOpenedCount(r: GameState): number {
  let n = 0;
  for (let rr = 0; rr <= 4; rr++) {
    for (let c = 0; c < r.map.cols; c++) {
      const k = c + ',' + rr;
      if (!r.blocked.has(k) && !r.wasteland.has(k)) n++;
    }
  }
  return n;
}

/** 兵种在流派里的权重(越靠前越受宠;不在 favors 里 = 1) */
function favorWeight(preset: AiPreset, type: string): number {
  const i = preset.favors.indexOf(type as PieceType);
  if (i < 0) return 1;
  return Math.max(1.2, 2.2 - i * 0.5);
}

/** 留用价值:等级 × 流派权重(回收/取舍时比大小) */
function keepWeight(p: Piece, preset: AiPreset): number {
  return p.lv * favorWeight(preset, p.type);
}

/** 盘面上是否还有「同型同级」可与之合成的料 */
function hasPair(g: GameState, p: Piece): boolean {
  for (const [key, q] of g.grid) {
    if (!q || q === p || q.tag || isTile(q.type) || key !== q.c + ',' + q.r) continue;
    if (q.type === p.type && q.lv === p.lv) return true;
  }
  return false;
}

/** 一枚子的实际射程(随等级成长)——布阵时判「这格够得着行军线吗 / 能罩多长」 */
function pieceRange(p: Piece): number {
  if (isTile(p.type)) return 0;                      // 字牌不输出火力
  const def = (PIECES as Record<string, { range: number } | undefined>)[p.type];
  return (def?.range ?? 120) * (1 + GROWTH.range * (p.lv - 1));
}

/** 行军线采样:整条路线按 16px 打点(带段长权重),用于算射程覆盖 */
function laneSamples(): { x: number; y: number; w: number }[] {
  const r = duel.rival;
  const out: { x: number; y: number; w: number }[] = [];
  for (const path of r.paths) {
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const n = Math.max(1, Math.ceil(len / 16));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: len / n });
      }
    }
  }
  return out;
}

/** 最优布阵格:按「对本盘守备的边际覆盖」挑格——先把全线铺满,再往火线上叠。
 *  (旧版只算到最近**路点**的距离:长直道的中段离两端路点都很远,会被判成「很远」,
 *  于是守军全挤在路口/拐角,中段空着——水军正好从那一段抢滩上道。改成沿整条
 *  行军线打点后,「贴长直道中段」自然被认成好位。)
 *  仕仍只落九宫,非仕对宫位让一手(给舍身挡驾的仕留位) */
function aiBestCell(p: Piece, preset: AiPreset, cap: number): { c: number; r: number } | null {
  const r = duel.rival;
  if (cellCount(r) >= cap) return null;              // 地皮用尽(只能合成/回收)
  const room = cap - aiOpenedCount(r);               // 手上还能开垦几格荒地(地皮是真的:想摆就现开一格)
  const isShi = p.type === '仕';
  const range = pieceRange(p);
  const samples = laneSamples();
  // 现守军:位置 + 射程(用来判「这一段已经有人罩着了」)
  const guards: { x: number; y: number; rng: number }[] = [];
  for (const [, q] of r.grid) {
    if (!q) continue;
    const qc = cellCenter(q.c, q.r);
    guards.push({ x: qc.x, y: qc.y, rng: pieceRange(q) });
  }
  let best: { c: number; r: number } | null = null;
  let bestScore = -Infinity;
  for (let rr = 0; rr <= 4; rr++) {
    for (let c = 0; c < r.map.cols; c++) {
      const key = c + ',' + rr;
      if (r.blocked.has(key) || r.grid.has(key)) continue;
      if (r.wasteland.has(key) && room <= 0) continue;   // 额度用尽:只能落在已开垦的格上
      const inPalace = r.palace.has(key);
      if (isShi && !inPalace) continue;              // 仕只守帅旁九宫
      const cc = cellCenter(c, rr);
      let total = 0, fresh = 0;
      for (const s of samples) {
        if (Math.hypot(s.x - cc.x, s.y - cc.y) > range) continue;
        total += s.w;
        let covered = false;
        for (const gd of guards) {
          if (Math.hypot(s.x - gd.x, s.y - gd.y) <= gd.rng) { covered = true; break; }
        }
        if (!covered) fresh += s.w;
      }
      if (total <= 0) continue;                      // 够不着行军线:摆上去也是白摆
      // 疏开:同样「新覆盖」时,离已有守军远一点更值钱(各守一段)
      let nearest = Infinity;
      for (const gd of guards) nearest = Math.min(nearest, Math.hypot(gd.x - cc.x, gd.y - cc.y));
      const spread = Number.isFinite(nearest) ? Math.min(nearest, 130) * 0.16 : 0;
      const palacePenalty = (!isShi && inPalace) ? 40 : 0;
      const score = fresh * 0.5 + total * 0.06 + spread - palacePenalty
        + (favorWeight(preset, p.type) - 1) * 10 + Math.random() * 10;
      if (score > bestScore) { bestScore = score; best = { c, r: rr }; }
    }
  }
  return best;
}

/** 连弩机(本棋盘武装则生效):每次合成返还粮草 */
function aiMergeGold(at: { x: number; y: number }): void {
  if (!boardGear('lian')) return;
  const n = gearOf('lian')?.fx.mergeGold ?? 0;
  if (n > 0) { state.gold += n; addFloat(at.x, at.y - 66, '+' + n + ' 粮', '#b8860b', 18); }
}

/** 并一对同型同级的基础子(优先主战兵种);返回是否合了 */
function aiMergePair(preset: AiPreset): boolean {
  const r = duel.rival;
  const seen = new Map<string, Piece>();
  let best: { keep: Piece; drop: Piece } | null = null;
  let bestW = -1;
  for (const [key, q] of r.grid) {
    if (!q || q.tag || isTile(q.type) || key !== q.c + ',' + q.r) continue;
    if (q.lv >= MAXLV) continue;
    const t = q.type + '|' + q.lv;
    const first = seen.get(t);
    if (!first) { seen.set(t, q); continue; }
    const w = favorWeight(preset, q.type) + Math.random() * 0.15;
    if (w > bestW) { bestW = w; best = { keep: first, drop: q }; }
  }
  if (!best) return false;
  r.grid.delete(best.drop.c + ',' + best.drop.r);
  best.keep.lv++;
  best.keep.mergeT = MERGE.flash;
  const cc = cellCenter(best.keep.c, best.keep.r);
  addEffect(cc.x, cc.y, 'merge', MERGE.ringR);
  addFloat(cc.x, cc.y - 40, '合成 Lv' + best.keep.lv, '#b8860b', 22);
  aiMergeGold(cc);
  checkFusions({ c: best.keep.c, r: best.keep.r });
  return true;
}

/** 回收一枚盘上孤子换粮腾位(只卖:低级的、非主战的、无同类可合的、非成军/字牌) */
function aiRecycleWeakest(preset: AiPreset, incoming: Piece): boolean {
  const r = duel.rival;
  const incW = keepWeight(incoming, preset);
  let worst: Piece | null = null;
  let worstW = Infinity;
  for (const [key, q] of r.grid) {
    if (!q || key !== q.c + ',' + q.r) continue;
    if (q.tag || isTile(q.type)) continue;            // 成军 / 字牌不卖
    if (q.lv > preset.sellFloor) continue;
    if (hasPair(r, q)) continue;                      // 留着当合成料
    const w = keepWeight(q, preset);
    if (w < worstW) { worstW = w; worst = q; }
  }
  if (!worst || worstW >= incW) return false;         // 盘上没有更该卖的
  const val = sellValue(worst.lv);
  const cc = cellCenter(worst.c, worst.r);
  r.grid.delete(worst.c + ',' + worst.r);
  r.gold += val;
  addFloat(cc.x, cc.y - 26, '+' + val + ' 粮', '#b8860b', 20);
  return true;
}

/** 落一枚基础子:合成优先,再找近路空格;地皮满则回收腾位 */
function aiDeployBase(p: Piece, preset: AiPreset, cap: number): boolean {
  const r = duel.rival;
  if (p.lv < MAXLV) {
    for (const [key, q] of r.grid) {
      if (!q || q.tag || isTile(q.type) || key !== q.c + ',' + q.r) continue;
      if (q.type === p.type && q.lv === p.lv) {
        q.lv++;
        q.mergeT = MERGE.flash;
        const cc = cellCenter(q.c, q.r);
        addEffect(cc.x, cc.y, 'merge', MERGE.ringR);
        addFloat(cc.x, cc.y - 40, '合成 Lv' + q.lv, '#b8860b', 22);
        aiMergeGold(cc);
        checkFusions({ c: q.c, r: q.r });
        return true;
      }
    }
  }
  let spot = aiBestCell(p, preset, cap);
  if (!spot && aiRecycleWeakest(preset, p)) spot = aiBestCell(p, preset, cap);
  if (!spot) return false;
  const key = spot.c + ',' + spot.r;
  if (r.wasteland.has(key)) {
    r.wasteland.delete(key);   // 垦荒:这一格是它自己要的,半场上的「荒」封印随之少一枚
    const cc = cellCenter(spot.c, spot.r);
    onGroundOpened(cc.x, cc.y);   // 屯田令:对方若抽到也照结(同一套规则)
  }
  const pc: Piece = { ...p, c: spot.c, r: spot.r, cd: 0, stunT: 0 };
  r.grid.set(key, pc);
  checkFusions({ c: spot.c, r: spot.r });
  return true;
}

/** 基础子 (c,r) 四邻里能给字牌落脚的真地皮:先取已开垦的空格;没有就看开垦额度
 *  (额度见底就只能作罢——字牌不再有「荒地随便贴」的特权) */
function tileSpot(c: number, r: number, room: number): { c: number; r: number } | null {
  const g = duel.rival;
  const pick = (waste: boolean): { c: number; r: number } | null => {
    for (const [dc, dr] of NB) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= g.map.cols || nr < 0 || nr > 4) continue;
      const k = nc + ',' + nr;
      if (g.blocked.has(k) || g.grid.has(k)) continue;
      if (g.wasteland.has(k) !== waste) continue;
      return { c: nc, r: nr };
    }
    return null;
  };
  return pick(false) ?? (room > 0 ? pick(true) : null);
}

/** 贴一枚字牌:优先贴到「再一张即成军」的基础子四邻;immediate=只贴能立刻成军的 */
function aiDeployTile(p: Piece, preset: AiPreset, cap: number, immediate: boolean): boolean {
  const r = duel.rival;
  const room = cap - aiOpenedCount(r);
  let best: { c: number; r: number } | null = null;
  let bestMiss = Infinity;
  let bestFav = -1;
  for (const [key, q] of r.grid) {
    if (!q || q.tag || isTile(q.type) || key !== q.c + ',' + q.r) continue;
    for (const sp of Object.values(SPECIALS)) {
      if (sp.base !== q.type || !sp.parts.includes(p.type as TileType)) continue;
      const have = new Set<string>();
      for (const [dc, dr] of NB) {
        const nb = r.grid.get((q.c + dc) + ',' + (q.r + dr));
        if (nb && isTile(nb.type)) have.add(nb.type as string);
      }
      if (have.has(p.type as string)) continue;        // 这种牌已贴过
      const missing = sp.parts.filter(x => !have.has(x)).length;
      if (immediate && missing > 1) continue;          // 只要立刻成军的
      const fav = favorWeight(preset, q.type);
      if (!(missing < bestMiss || (missing === bestMiss && fav > bestFav))) continue;
      const spot = tileSpot(q.c, q.r, room);
      if (!spot) continue;                             // 这枚基础子四邻没有真地皮可落脚
      bestMiss = missing; bestFav = fav; best = spot;
    }
  }
  if (!best) return false;
  if (cellCount(r) >= cap && !aiRecycleWeakest(preset, p)) return false;   // 地皮满:腾位或作罢
  const bk = best.c + ',' + best.r;
  if (r.wasteland.has(bk)) {
    r.wasteland.delete(bk);    // 开垦:这一格给字牌落脚,半场的「荒」封印随之少一枚
    const cc = cellCenter(best.c, best.r);
    onGroundOpened(cc.x, cc.y);   // 屯田令:对方若抽到也照结(同一套规则)
  }
  const pc: Piece = { ...p, c: best.c, r: best.r, cd: 0, stunT: 0 };
  r.grid.set(bk, pc);
  checkFusions({ c: best.c, r: best.r });
  return true;
}

/** 清理盘上「废字牌」:四邻没有能用它的基础子 → 回收换粮(免得占着地皮) */
function aiCleanOrphanTiles(): void {
  const r = duel.rival;
  for (const [key, q] of [...r.grid]) {
    if (!q || key !== q.c + ',' + q.r || !isTile(q.type)) continue;
    let useful = false;
    for (const [dc, dr] of NB) {
      const nb = r.grid.get((q.c + dc) + ',' + (q.r + dr));
      if (!nb || nb.tag || isTile(nb.type)) continue;
      for (const sp of Object.values(SPECIALS)) {
        if (sp.base !== nb.type || !sp.parts.includes(q.type as TileType)) continue;
        // 该基础子四邻还没有同款字牌 → 这张还有用
        let dup = false;
        for (const [ec, er] of NB) {
          const en = r.grid.get((nb.c + ec) + ',' + (nb.r + er));
          if (en && en !== q && en.type === q.type) { dup = true; break; }
        }
        if (!dup) useful = true;
      }
      if (useful) break;
    }
    if (!useful) {
      r.grid.delete(key);
      r.gold += sellValue(q.lv);
    }
  }
}

/** 回收兵营里下不去的子(换粮,免得被下次征兵白销毁) */
function aiSellBarracks(i: number): void {
  const r = duel.rival;
  const p = r.barracks[i];
  if (!p) return;
  r.gold += sellValue(p.lv);
  r.barracks[i] = null;
}

/** 主动军械择机:灵药留血线 / 战鼓绊马索火牛看敌军密度 / 援军令补空营 */
function aiUseGear(): void {
  const r = duel.rival;
  for (let i = 0; i < r.bag.length; i++) {
    const id = r.bag[i];
    if (!id || (r.gearCd[id] ?? 0) > 0.001) continue;
    if (!aiWantsGear(id)) continue;
    useGear(i);          // 走真实主动军械:fx + 冷却 + 守门(无效不损耗)
  }
}

function aiWantsGear(id: string): boolean {
  const r = duel.rival;
  const shuai = r.map.shuai;
  let alive = 0, nearShuai = false;
  for (const e of r.enemies) {
    if (e.dead) continue;
    alive++;
    if (Math.hypot(e.x - shuai.x, e.y - shuai.y) < 210) nearShuai = true;
  }
  switch (id) {
    case 'yao': return r.hearts <= r.maxHearts - 2 || (r.hearts < r.maxHearts && nearShuai);
    case 'gu': return alive >= 3;
    case 'suo': return alive >= 4;
    case 'niu': return alive >= 5;
    // 援军令:免费补满兵营 = 白得一手新兵(征兵越贵越赚),兵营空了就开
    case 'ling2': return r.barracks.every(p => !p);
    default: return false;
  }
}

/** 一个决策点:合成 → 成军 → 布阵 → 回收残子 → 征兵 */
function aiTurn(): void {
  const r = duel.rival;
  const preset = duel.ai.preset;
  const cap = aiCellCap(r);

  // ① 盘面合成:把能合的对子都合掉(免费抬级,收益最高);顺手清掉废字牌
  let guard = 0;
  while (guard++ < 16 && aiMergePair(preset)) { /* keep merging */ }
  aiCleanOrphanTiles();

  // ② 字牌成军优先:能立刻成军的先贴出去
  for (let i = 0; i < r.barracks.length; i++) {
    const p = r.barracks[i];
    if (p && isTile(p.type) && aiDeployTile(p, preset, cap, true)) r.barracks[i] = null;
  }
  // ③ 基础子布阵:仕先落——它只能进九宫、位置最挑,别让别的子先把宫位占了
  for (const wantShi of [true, false]) {
    for (let i = 0; i < r.barracks.length; i++) {
      const p = r.barracks[i];
      if (!p || isTile(p.type) || (p.type === '仕') !== wantShi) continue;
      if (aiDeployBase(p, preset, cap)) r.barracks[i] = null;
    }
  }
  // ④ 余下字牌:积极性够 + 还剩地皮才占位拼军(不留出空位会被字牌塞死),否则换粮
  for (let i = 0; i < r.barracks.length; i++) {
    const p = r.barracks[i];
    if (!p || !isTile(p.type)) continue;
    const roomy = cellCount(r) <= cap - preset.tileReserve;
    if (preset.tileUrge >= 0.5 && roomy && aiDeployTile(p, preset, cap, false)) r.barracks[i] = null;
    else aiSellBarracks(i);
  }
  // ⑤ 下不去的残子(无同类可合 / 无地皮):回收换粮
  for (let i = 0; i < r.barracks.length; i++) {
    const p = r.barracks[i];
    if (p && !isTile(p.type)) aiSellBarracks(i);
  }

  // ⑥ 征兵:粮草够就补(粮草唯一的正当出口就是征兵与派水军;新子能并子抬级)
  const cost = draftCost();
  if (r.gold >= cost) tryDraft();
}

/** 对方 AI 每帧:计时驱动决策 / 主动军械 / 派水军(全程在同一块棋盘上按真实机制跑) */
export function rivalThink(dt: number): void {
  if (!duel.on || duel.over) return;
  const prev = state;
  setBoard(duel.rival);
  const r = duel.rival;
  const ai = duel.ai;
  ai.t += dt;
  ai.draftT -= dt;
  ai.boatT -= dt;
  ai.gearT -= dt;

  if (ai.gearT <= 0) { ai.gearT = DUEL.aiGearScan; aiUseGear(); }
  if (ai.draftT <= 0) { ai.draftT = DUEL.aiDraft; aiTurn(); }
  if (ai.boatT <= 0) {
    ai.boatT = (DUEL.aiBoat + Math.random() * 8) * ai.preset.boatGap;
    // 先保证买得起一次征兵,多出来的余粮才拿去派船(生存优先)。
    // 保留额封顶:征兵价按 n² 涨,后期一次征兵要两三百粮,照实留会长期攒不齐 →
    // 顶栏「粮300」干屯着很蠢;封顶后余粮转攻——派水军是 AI 唯一能打掉我方帅血的手段。
    const reserve = Math.min(draftCost(), DUEL.aiBoatReserveCap) * DUEL.aiReserve;
    if (r.gold >= DUEL.boatCost + reserve) {
      r.gold -= DUEL.boatCost;
      sendDuelBoat(duel.player, Math.max(1, r.waveIdx + 1), nextBoatLane());
      setBoard(duel.player);
      toast('敌方楼船驶向我方河岸!');
      setBoard(r);
    }
  }
  setBoard(prev);
}

/** 供渲染读的对战副信息(小胜/小负的即时提示用) */
export function duelFieldCount(): { player: number; rival: number } {
  return { player: fieldCount(duel.player), rival: fieldCount(duel.rival) };
}

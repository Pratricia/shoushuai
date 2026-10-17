/* ============================================================
   输入系统:指针拖拽(兵营/棋盘 → 上阵/合成)+ 快捷键
   ------------------------------------------------------------
   拖拽规则:
     · 兵营 ⇄ 棋盘 双向拖动
     · 同类同级重叠 → 合成升 1 级(上限 Lv5;特殊军不参与,靠杀敌攒经验)
     · 道路格不可布阵
     · 冲阵/连跳中的棋子被拿起则中断当前动作
     · 特殊军占两格(本体 + 副格,朝向成军时定):挪移时两格一起走,
       副格先按原朝向放、放不下试同轴换向;换位规则与常规棋子一致
   ============================================================ */
import type { Point, DragState, Piece, UIButton } from './types';
import { state, duel, setBoard, setupLevel, setupEndless, setupDuel, enterMenu, cellAt, cellCenter, slotAt, slotCenter, firstEmptyCell, boardGear } from './state';
import { MAXLV, RECYCLE_BTN, KEN_BTN, MERGE, sellValue, GEAR_BAG } from './config';
import { tryDraft } from './systems/economy';
import { checkFusions } from './systems/fusion';
import { isTile } from './data/specials';
import { GEAR, gearOf } from './data/shop';
import { FUS } from './data/fu';
import { saveData, ownsGear, inBag, bagActiveCount, passiveCarryCount, carriesGear, unlockGear, equipGear, unequipGear, equipPassive, unequipPassive, craftFu } from './save';
import { useGear, onGroundOpened } from './systems/items';
import { duelManualBoat } from './systems/duel';
import { setShopTab, scrollShop, resetShopScroll, getShopListRect } from './render/overlays';
import { toast, addEffect, addFloat } from './systems/combat';
import { canvas, toLogical } from './canvas';

/** 指针逻辑坐标(拖拽渲染跟随用) */
export const pointer: Point = { x: 0, y: 0 };

function inRect(p: Point, b: UIButton): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

export function cycleSpeed(): void {
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
}

/** 暂停:取消进行中的拖拽并冻结更新(垦荒令放回口袋,棋子归位) */
function pauseGame(): void {
  if (state.drag) {
    if (state.drag.kind === 'piece') restore(state.drag);
    state.drag = null;
  }
  state.paused = true;
}

/** 双格特殊军? */
function isSpec(p: Piece): boolean {
  return !!p.tag && !!p.vec;
}

/** 主格键(双格登记的两个条目都以它为准) */
function mainKey(p: Piece): string {
  return p.c + ',' + p.r;
}

/** 副格键(按朝向;vec 缺失时为 null) */
function secKey(p: Piece): string | null {
  if (!p.vec) return null;
  return (p.c + p.vec.dc) + ',' + (p.r + p.vec.dr);
}

/** 该棋子能驻这格吗(与布阵规则同款);
 *  字牌是「零件」,但零件也要真地皮:荒地(未开垦)一样落不下——
 *  想留一手凑军令,就先用垦荒令把那两格开出来 */
function landable(p: Piece, k: string): boolean {
  if (isTile(p.type)) return !state.blocked.has(k) && !state.wasteland.has(k);
  return !state.wasteland.has(k) || (p.type === '仕' && state.palace.has(k));
}

/** 这格能不能站住(不看占用):界内 + 非道路 + 非荒地(仕驻宫内荒地除外) */
function freeGround(p: Piece, k: string): boolean {
  const [c, r] = k.split(',').map(Number);
  if (c < 0 || c >= state.map.cols || r < 0 || r >= state.map.rows) return false;
  if (state.blocked.has(k)) return false;
  return !state.wasteland.has(k) || (p.type === '仕' && state.palace.has(k));
}

/** 换位时「被顶开的那枚子」能不能落到目标子的原格:地皮规则同款 + 仕不离宫。
 *  旧版两条换位只看「仕会不会出宫」,不看这枚子落得下不下——
 *  仕驻宫内荒地时一换位就把字牌按在荒地上 */
function canReceive(p: Piece, k: string): boolean {
  return freeGround(p, k) && !(p.type === '仕' && !state.palace.has(k));
}

/** 双格军落位检查:主格 (c,r),副格先试 +vec、放不下试 -vec(同轴换向);
 *  ignore 中的键视为「即将腾空」;返回副格键,放不下返回 null。
 *  荒地:两格都要真地皮——成军的特殊军也一样(它占的每一格都曾经垦过,
 *  成军不该反过来送它一张荒地券:旧版 p.tag 豁免能让整军半截压在荒地上);
 *  唯一例外是「仕驻九宫」:仕可驻宫内荒地,成军后这份特权随基础子保留 */
function fitSpecial(p: Piece, c: number, r: number, ignore?: Set<string>): string | null {
  const v = p.vec!;
  const ok = (cc: number, rr: number): string | null => {
    const k = cc + ',' + rr;
    // 荒地:一律要真地皮(成军后也不例外);只有「仕驻九宫」保留宫内荒地特权
    if (!freeGround(p, k)) return null;
    if (state.grid.has(k) && !(ignore && ignore.has(k))) return null;
    return k;
  };
  if (!ok(c, r)) return null;
  return ok(c + v.dc, r + v.dr) ?? ok(c - v.dc, r - v.dr);
}

/** 按检查结果写入两格(主格 + 指定副格)。
 *  副格用了换向侧时同步翻转 vec——不变式「副格 = (c+vec.dc, r+vec.dr)」
 *  任何时候都必须成立(渲染/拿起/攻击位/归还全靠它推副格) */
function placeSpecialAt(p: Piece, c: number, r: number, sec: string): void {
  const [sc, sr] = sec.split(',').map(Number);
  p.vec = { dc: sc - c, dr: sr - r };
  p.c = c; p.r = r;
  state.grid.set(c + ',' + r, p);
  state.grid.set(sec, p);
}

/** 双格军落在空格上时:主格 (c,r) 已空,若原朝向(+vec)那格站着普通棋子、
 *  且本军腾出的旧主格/副格之一能收留它,就地换位——
 *  「占一个空位 + 一个子」的对调(军落两格,该子退回军的旧格)。
 *  军来自兵营(无棋盘旧格)、或那格是另一支军/腾挪不动 → 返回 false,交回同轴换向。 */
function pushArmyNeighbor(pc: Piece, c: number, r: number, d: DragState): boolean {
  if (d.from !== 'grid') return false;
  const v = pc.vec;
  if (!v) return false;
  const sk = (c + v.dc) + ',' + (r + v.dr);
  const push = state.grid.get(sk);
  if (!push || push === pc || isSpec(push)) return false;
  // 军的新两格必须合法(副格上的子会被顶走,故按「即将腾空」判定):
  // 荒地/阻挡/宫内仕一律走同一套检查,免得换位把军半截送上荒地
  if (fitSpecial(pc, c, r, new Set([sk])) !== sk) return false;
  const take = (k: string | null): k is string => !!k
    && k !== c + ',' + r && k !== sk
    && !state.grid.has(k)                      // 军旧格已被拿起摘空
    && landable(push, k) && !(push.type === '仕' && !state.palace.has(k));
  const oldMain = mainKey(pc);
  const oldS = secKey(pc);
  const landing = take(oldMain) ? oldMain : (take(oldS) ? oldS : null);
  if (!landing) return false;
  state.grid.delete(sk);
  const [lc, lr] = landing.split(',').map(Number);
  push.c = lc; push.r = lr;
  state.grid.set(landing, push);
  placeSpecialAt(pc, c, r, sk);
  const cc = cellCenter(c, r), oc = cellCenter(lc, lr);
  swapFeedback(cc.x, cc.y, oc.x, oc.y);
  return true;
}

/** 「整组对调」:双格军要占的两格里若停着普通子(1~2 枚),就把玩家手里这枚(extra)
 *  与那些子一起安置进军腾出的旧两格——同侧对同侧优先,放不下试交叉;
 *  同侧位置对应关系 = 主格→旧主格、副格→旧副格,整组原地转个身,最合手。
 *  只在按老规矩(副格用空格 / 同轴换向)都落不下时才被调用,故既有手感一格不变,
 *  只是把「副格那格也是子」这条死路走通(典型:角落里 车 + 炮 两口子挨着站)。
 *  军来自兵营(没有旧格可退)、或那格停着另一支军 → 不接手(返回 null 交回外层) */
function planArmySwap(
  army: Piece, c: number, r: number, d: DragState, extra: Piece | null,
): { sec: string; assign: { p: Piece; k: string }[] } | null {
  const v = army.vec;
  if (d.from !== 'grid' || !v) return null;
  const oldMain = mainKey(army);
  const oldS = secKey(army);
  if (!oldS) return null;
  const src = c + ',' + r;
  const at = (k: string): Piece | null => {
    const q = state.grid.get(k);
    return q && q !== army ? q : null;
  };
  for (const sec of [(c + v.dc) + ',' + (r + v.dr), (c - v.dc) + ',' + (r - v.dr)]) {
    if (sec === src) continue;
    if (!freeGround(army, src) || !freeGround(army, sec)) continue;  // 军自己那两格要站得住
    const hits = [at(src), at(sec)];
    if (hits.some(q => q && isSpec(q))) continue;                    // 另一支军不参与对调
    const movers: Piece[] = [];
    if (extra) movers.push(extra);
    for (const q of hits) if (q && !movers.includes(q)) movers.push(q);
    if (movers.length === 0 || movers.length > 2) continue;          // 没子要搬 / 格数不够
    const dsts = [oldMain, oldS];
    for (const cross of (movers.length === 2 ? [false, true] : [false])) {
      const slot = cross ? [dsts[1], dsts[0]] : dsts;
      if (movers.every((p, i) => slot[i] !== src && slot[i] !== sec && canReceive(p, slot[i])))
        return { sec, assign: movers.map((p, i) => ({ p, k: slot[i] })) };
    }
  }
  return null;
}

/** 落地方案:清掉军旧两格 + 新两格上的旧登记,把被顶开的子逐个安置,最后放军 */
function applyArmySwap(
  army: Piece, c: number, r: number,
  plan: { sec: string; assign: { p: Piece; k: string }[] },
): void {
  const oldMain = mainKey(army);
  const oldS = secKey(army);
  state.grid.delete(oldMain);
  if (oldS) state.grid.delete(oldS);
  state.grid.delete(c + ',' + r);
  state.grid.delete(plan.sec);
  for (const a of plan.assign) {
    const [lc, lr] = a.k.split(',').map(Number);
    a.p.c = lc; a.p.r = lr;
    state.grid.set(a.k, a.p);
  }
  placeSpecialAt(army, c, r, plan.sec);
  const first = plan.assign[0];
  if (first) {
    const cc = cellCenter(c, r), oc = cellCenter(first.p.c, first.p.r);
    swapFeedback(cc.x, cc.y, oc.x, oc.y);
  }
}

/** 字牌拖到别的棋子上时:吸附到该棋子四邻的空格(优先拖拽方向;没有空格返回 null)。
 *  让「把牌贴到子上」这个自然动作生效——不再把子换到兵营里。 */
function tileSnapSpot(c: number, r: number, p: Point): { c: number; r: number } | null {
  const cc = cellCenter(c, r);
  const dx = p.x - cc.x, dy = p.y - cc.y;
  const dirs = [{ dc: 0, dr: -1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }, { dc: 0, dr: 1 }];
  dirs.sort((a, b) => (b.dc * dx + b.dr * dy) - (a.dc * dx + a.dr * dy));
  for (const d of dirs) {
    const nc = c + d.dc, nr = r + d.dr;
    if (nc < 0 || nc >= state.map.cols || nr < 0 || nr >= state.map.rows) continue;
    const k = nc + ',' + nr;
    if (state.blocked.has(k) || state.wasteland.has(k) || state.grid.has(k)) continue;
    return { c: nc, r: nr };
  }
  return null;
}

/* ---------- 集市:拖动可上下滑动 + 松开才算点击 ---------- */
let shopDown: { x: number; y: number; lastY: number; moved: boolean; scrolling: boolean } | null = null;

/** 非对战界面(主菜单/选关/结算/暂停/集市)的按钮派发 */
function pressButton(b: UIButton): void {
  if (b.id === 'level' && b.n) setupLevel(b.n);
  else if (b.id === 'retry') {
    if (state.mode === 'endless') setupEndless();
    else if (state.mode === 'duel') setupDuel();
    else setupLevel(state.level);
  }
  else if (b.id === 'next') setupLevel(state.level + 1);
  else if (b.id === 'resume') state.paused = false;
  else if (b.id === 'menu') enterMenu();
  else if (b.id === 'home') enterMenu();
  else if (b.id === 'mode') state.screen = 'start';
  else if (b.id === 'endless') setupEndless();
  else if (b.id === 'shop') { if (state.screen !== 'shop') resetShopScroll(); state.screen = 'shop'; }
  else if (b.id === 'tab0' || b.id === 'tab1') { setShopTab(Number(b.id.slice(3))); resetShopScroll(); }
  else if (b.id === 'gear' && b.n !== undefined) {
    const g = GEAR[b.n];
    if (g && ownsGear(g.id) && g.kind === 'active') {
      if (inBag(g.id)) { unequipGear(g.id); toast(g.name + ' · 已取出技能槽'); }
      else if (equipGear(g.id)) toast(g.name + ' · 已装入技能槽');
      else if (bagActiveCount() >= GEAR_BAG.activeCap) toast('主动技最多带 ' + GEAR_BAG.activeCap + ' 个——先取出一个');
      else toast('装入失败');
    }
    else if (g && ownsGear(g.id) && g.kind === 'passive') {
      // 被动携带制:点卡片即携带/取下(取下只是本局不生效,永久拥有不受影响)
      if (carriesGear(g.id)) { unequipPassive(g.id); toast(g.name + ' · 已取下 · 开战不再生效'); }
      else if (equipPassive(g.id)) toast(g.name + ' · 已携带 · 开战生效');
      else if (passiveCarryCount() >= GEAR_BAG.passiveCap) toast('被动军械最多带 ' + GEAR_BAG.passiveCap + ' 件——先取下一件');
      else toast('携带失败');
    }
  }
  else if (b.id === 'unlock' && b.n !== undefined) {
    const g = GEAR[b.n];
    if (g) {
      if (ownsGear(g.id)) toast(g.name + ' · 已解锁');
      else if (saveData.money < g.cost) toast('军饷不足 · 还差 ' + (g.cost - saveData.money));
      else if (unlockGear(g.id, g.cost)) {
        if (g.kind === 'passive') {
          if (carriesGear(g.id)) toast(g.name + ' · 已解锁并携带');
          else toast(g.name + ' · 已解锁(被动已带满 ' + GEAR_BAG.passiveCap + ' 件,点卡片取舍)');
        }
        else if (inBag(g.id)) toast(g.name + ' · 已解锁并装入技能槽');
        else toast(g.name + ' · 已解锁(主动技槽已满,点卡片装入)');
      } else toast('解锁失败');
    }
  }
  else if (b.id === 'cast' && b.n !== undefined) {
    const f = FUS[b.n];
    if (f) {
      if (saveData.fu[f.id]) toast(f.name + ' · 已铸');
      else if (craftFu(f.id, f.cost)) toast(f.name + ' · 铸成!全军永久生效');
      else toast('符片不足 · 还差 ' + (f.cost - saveData.shards) + ' 片');
    }
  }
  else if (b.id === 'back') enterMenu();
  else if (b.id === 'duel') setupDuel();
  else if (b.id === 'duelBoat') duelManualBoat();
  else if (b.id === 'soon') toast('敬请期待');
}

/** 指针下的按钮(首个命中) */
function buttonAt(p: Point): UIButton | null {
  for (const b of state.uiButtons) if (inRect(p, b)) return b;
  return null;
}

function shopPointerDown(p: Point): void {
  const r = getShopListRect();
  const inList = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  shopDown = { x: p.x, y: p.y, lastY: p.y, moved: false, scrolling: inList };
}

/** 集市:指针移动 → 列表内拖动即滑动(滚轮也可) */
export function shopPointerMove(p: Point): void {
  if (!shopDown) return;
  if (shopDown.scrolling) scrollShop(shopDown.lastY - p.y);
  shopDown.lastY = p.y;
  if (Math.abs(p.x - shopDown.x) > 8 || Math.abs(p.y - shopDown.y) > 8) shopDown.moved = true;
}

/** 集市:指针松开,未拖动则按点击派发 */
export function shopPointerUp(p: Point): void {
  const sd = shopDown;
  shopDown = null;
  if (sd && sd.moved) return;      // 拖动过 = 视为滑动,不触发点击
  const b = buttonAt(p);
  if (b) pressButton(b);
}

/** 按下:集市走「松开才算点击 + 拖动可滑动」,其余界面即时响应 */
export function handleDown(p: Point): void {
  if (duel.on) setBoard(duel.player);         // 对战:输入永远作用于我方棋盘
  if (state.screen === 'shop') { shopPointerDown(p); return; }
  if (state.screen !== 'play' || state.paused) {
    const b = buttonAt(p);
    if (b) pressButton(b);
    return;
  }
  const b = buttonAt(p);
  if (b) {
    if (b.id === 'draft') tryDraft();
    else if (b.id === 'speed') cycleSpeed();
    else if (b.id === 'pause') pauseGame();
    else if (b.id === 'duelBoat') duelManualBoat();     // 对战:花粮派水军越河偷袭
    else if (b.id === 'useGear' && b.n !== undefined) useGear(b.n);
    return;
  }
  // 垦荒令口袋:拖出令牌(征兵键上方)
  if (state.kens > 0
      && p.x >= KEN_BTN.x - 6 && p.x <= KEN_BTN.x + KEN_BTN.w + 6
      && p.y >= KEN_BTN.y - 6 && p.y <= KEN_BTN.y + KEN_BTN.h + 6) {
    state.drag = { kind: 'ken', from: 'barracks', idx: -1, c: -1, r: -1, piece: null };
    return;
  }
  const s = slotAt(p.x, p.y);
  if (s !== -1 && state.barracks[s]) {
    state.drag = { kind: 'piece', from: 'barracks', idx: s, c: -1, r: -1, piece: state.barracks[s] as Piece };
    state.barracks[s] = null;
    return;
  }
  const cell = cellAt(p.x, p.y);
  if (cell) {
    const key = cell.c + ',' + cell.r;
    const pc = state.grid.get(key);
    if (pc) {
      pc.charge = null;   // 冲阵中的车被拿起来则中断冲锋
      pc.jump = null;     // 连跳中的马被拿起则中断连跳
      pc.stompPending = false;  // 腾空中的相被拿起则取消落地践踏
      state.grid.delete(key);
      // 特殊军:无论按在主格还是副格,两格登记都要一并拿起(旧版只摘「被点格 + 自己的副格」,
      // 按副格拿时二者同一格 → 主格登记残留成幽灵格,归还扫不到原位 → 棋子被丢到别处)
      const main = mainKey(pc);
      const sec = isSpec(pc) ? secKey(pc) : null;
      state.grid.delete(main);
      if (sec) state.grid.delete(sec);
      // 拖拽「原格」一律记主格:下游(归还/换位/预览描边)都按它对齐
      const [dc0, dr0] = (pc.c >= 0 && pc.r >= 0 ? main : key).split(',').map(Number);
      state.drag = { kind: 'piece', from: 'grid', idx: -1, c: dc0, r: dr0, piece: pc };
    }
  }
}

/** 归还拖拽中的棋子(原位被占时找空位;特殊军两格一起归位) */
function restore(d: DragState): void {
  if (!d.piece) return;
  const pc = d.piece;
  if (isSpec(pc)) {
    // 特殊军:来自棋盘先回原两格,来自兵营先回原槽;
    // 都不行 → 扫盘找放得下的两格 → 最后进任意空槽
    if (d.from === 'grid') {
      const main = mainKey(pc), sec = secKey(pc);
      if (sec && !state.grid.has(main) && !state.grid.has(sec)) {
        state.grid.set(main, pc); state.grid.set(sec, pc);
        return;
      }
    } else if (!state.barracks[d.idx]) {
      pc.c = -1; pc.r = -1;
      state.barracks[d.idx] = pc;
      return;
    }
    // 兜底扫盘找两格:优先回到原格附近(免得一次失败就把整军甩到棋盘另一头)
    const order: { c: number; r: number }[] = [];
    for (let r = 0; r < state.map.rows; r++) {
      for (let c = 0; c < state.map.cols; c++) order.push({ c, r });
    }
    if (pc.c >= 0 && pc.r >= 0) {
      const oc = pc.c, or = pc.r;
      const dist = (x: { c: number; r: number }): number =>
        Math.max(Math.abs(x.c - oc), Math.abs(x.r - or));
      order.sort((a, b) => dist(a) - dist(b));
    }
    for (const cell of order) {
      const fit = fitSpecial(pc, cell.c, cell.r);
      if (fit) { placeSpecialAt(pc, cell.c, cell.r, fit); return; }
    }
    const i = state.barracks.indexOf(null);
    if (i !== -1) { pc.c = -1; pc.r = -1; state.barracks[i] = pc; }
    return;
  }
  if (d.from === 'barracks') {
    if (!state.barracks[d.idx]) state.barracks[d.idx] = pc;
    else {
      const i = state.barracks.indexOf(null);
      if (i !== -1) state.barracks[i] = pc;
      else {
        const k = firstEmptyCell();
        if (k) { pc.c = k.c; pc.r = k.r; state.grid.set(k.c + ',' + k.r, pc); }
      }
    }
  } else {
    const key = d.c + ',' + d.r;
    if (!state.grid.get(key)) { pc.c = d.c; pc.r = d.r; state.grid.set(key, pc); }
    else {
      const k = firstEmptyCell();
      if (k) { pc.c = k.c; pc.r = k.r; state.grid.set(k.c + ',' + k.r, pc); }
      else {
        const i = state.barracks.indexOf(null);
        if (i !== -1) state.barracks[i] = pc;
      }
    }
  }
}

function mergeFeedback(x: number, y: number, p: Piece): void {
  p.mergeT = MERGE.flash;                 // 盘面弹亮(渲染读它画微弹 + 刻环发亮)
  addEffect(x, y, 'merge', MERGE.ringR);  // 细金双环轻扬(纯描边、快速渐散,不糊视野)
  addFloat(x, y - 40, '合成 Lv' + p.lv, '#b8860b', 22);
  // 军械·连弩机(本棋盘武装册:携带才生效;对战里双方各认自己那份)
  if (boardGear('lian')) {
    const n = gearOf('lian')?.fx.mergeGold ?? 0;
    if (n > 0) { state.gold += n; addFloat(x, y - 66, '+' + n + ' 粮', '#b8860b', 18); }
  }
}

/** 换位反馈:两点各扬起一撮尘土 */
function swapFeedback(x1: number, y1: number, x2: number, y2: number): void {
  addEffect(x1, y1, 'dust', 24);
  addEffect(x2, y2, 'dust', 24);
}

/** 松手:垦荒令拖到荒地开辟 / 棋子落在回收键(卖子)/ 兵营 / 棋盘 / 无效区
 *  落定后统一扫一遍成军(字牌贴齐即并格,幂等;落子格作为朝向判定提示) */
export function endDrag(p: Point): void {
  if (duel.on) setBoard(duel.player);         // 对战:落子只作用于我方棋盘
  landedTile = null;
  endDragInner(p);
  checkFusions(landedTile ?? cellAt(p.x, p.y));
}

/** 字牌「吸附」落点:吸附贴牌时,成军朝向该认这张牌落在哪,而不是被贴的那枚子 */
let landedTile: { c: number; r: number } | null = null;

function endDragInner(p: Point): void {
  const d = state.drag;
  if (!d) return;
  state.drag = null;
  if (d.kind === 'ken') { endKenDrag(p); return; }
  const pc = d.piece;
  if (!pc) return;

  // 落在回收键:卖子换粮(Lv1~5 → 1/2/4/8/16;特殊军照卖)
  if (p.x >= RECYCLE_BTN.x - 6 && p.x <= RECYCLE_BTN.x + RECYCLE_BTN.w + 6
      && p.y >= RECYCLE_BTN.y - 6 && p.y <= RECYCLE_BTN.y + RECYCLE_BTN.h + 6) {
    const val = sellValue(pc.lv);
    state.gold += val;
    addFloat(RECYCLE_BTN.x + RECYCLE_BTN.w / 2, RECYCLE_BTN.y - 26, '+' + val + ' 粮', '#b8860b', 22);
    addEffect(RECYCLE_BTN.x + RECYCLE_BTN.w / 2, RECYCLE_BTN.y + 46, 'splat', 50);
    return;
  }

  // 落在兵营格:空位放入 / 同类同级合成 / 有子则互换位置
  const s = slotAt(p.x, p.y);
  if (s !== -1) {
    const occ = state.barracks[s];
    if (!occ) { pc.c = -1; pc.r = -1; state.barracks[s] = pc; return; }
    if (!isTile(pc.type) && !pc.tag && !occ.tag && occ.type === pc.type && occ.lv === pc.lv) {
      if (occ.lv < MAXLV) {
        occ.lv++;
        const sc = slotCenter(s);
        mergeFeedback(sc.x, sc.y, occ);
        return;
      }
      toast('已满级');
      restore(d);
      return;
    }
    // 目标槽里是特殊军、拖来的子来自棋盘:军整支出到拖来那子腾出的格(两格对齐)。
    // 双格军绝不能按单格塞进 grid —— 旧版这样写会丢掉副格登记(军只剩一格)
    if (d.from !== 'barracks' && isSpec(occ)) {
      if (isSpec(pc)) { toast('两支特殊军无法换位'); restore(d); return; }
      const fit = fitSpecial(occ, d.c, d.r, new Set([mainKey(occ), secKey(occ) ?? '']));
      if (!fit) { toast('特殊军占两格 · 此处放不下'); restore(d); return; }
      occ.charge = null;
      occ.jump = null;
      state.barracks[s] = pc;
      pc.c = -1; pc.r = -1;
      placeSpecialAt(occ, d.c, d.r, fit);
      const sc0 = slotCenter(s);
      const org0 = cellCenter(d.c, d.r);
      swapFeedback(sc0.x, sc0.y, org0.x, org0.y);
      return;
    }
    // 换位:目标槽 ↔ 来源(兵营槽 / 棋盘格)
    occ.charge = null;
    occ.jump = null;
    state.barracks[s] = pc;
    if (d.from === 'barracks') {
      pc.c = -1; pc.r = -1;
      state.barracks[d.idx] = occ;                // 兵营 ⇄ 兵营:两边都进槽
    } else if (isSpec(pc)) {
      // 特殊军(棋盘) ⇄ 兵营子:普通子出到特殊军的主格(驻不下改用副格),另一格腾空
      const pcMain = mainKey(pc);
      const pcS = secKey(pc);
      const pick = (k: string | null): k is string => !!k
        && landable(occ, k) && !(occ.type === '仕' && !state.palace.has(k));
      let landing: string | null = null;
      if (pick(pcMain)) landing = pcMain;
      else if (pick(pcS)) landing = pcS;
      if (!landing) {
        state.barracks[s] = occ;
        toast('此处放不下换位');
        restore(d);
        return;
      }
      pc.c = -1; pc.r = -1;
      const [lc, lr] = landing.split(',').map(Number);
      occ.c = lc; occ.r = lr;
      state.grid.set(landing, occ);
    } else {
      const src = d.c + ',' + d.r;               // 被换出来的子要落到拖来那子的原格
      if (!canReceive(occ, src)) {               // 那格如果是荒地(仕驻宫内荒地),换不成
        state.barracks[s] = occ;
        toast('此处放不下换位');
        restore(d);
        return;
      }
      pc.c = -1; pc.r = -1;                      // 进兵营:坐标清零(否则会被当成在盘棋子)
      occ.c = d.c; occ.r = d.r;
      state.grid.set(src, occ);
    }
    const sc = slotCenter(s);
    const org = d.from === 'barracks' ? slotCenter(d.idx) : cellCenter(d.c, d.r);
    swapFeedback(sc.x, sc.y, org.x, org.y);
    return;
  }

  // 落在棋盘格:空格上阵 / 同类同级合成 / 有子则互换位置
  const cell = cellAt(p.x, p.y);
  if (cell) {
    const key = cell.c + ',' + cell.r;
    // 松手落回本子自己占的格(原地点一下):原样放回——不换向、不腾挪、不弹假提示
    if (isSpec(pc) && (key === mainKey(pc) || key === secKey(pc))) { restore(d); return; }
    if (state.blocked.has(key)) { toast('道路上不可布阵'); restore(d); return; }
    // 士不离宫:仕只能驻守帅的九宫(特殊军不基于仕,天然不涉)
    if (pc.type === '仕' && !state.palace.has(key)) { toast('士不离宫:仕只守帅旁九宫'); restore(d); return; }
    // 荒地未开垦一律落不下(仕可驻宫内荒地):字牌虽是「零件」,也要真地皮
    if (state.wasteland.has(key) && pc.type !== '仕') { toast('荒地未开垦,拖垦荒令来开辟'); restore(d); return; }
    const occ = state.grid.get(key);
    // 字牌拖到别的棋子身上:吸附到它四邻的空格(比换位更符合直觉,也让成军更顺手)
    if (occ && isTile(pc.type) && !isTile(occ.type)) {
      const spot = tileSnapSpot(cell.c, cell.r, p);
      if (spot) {
        pc.c = spot.c; pc.r = spot.r;
        landedTile = { c: spot.c, r: spot.r };
        state.grid.set(spot.c + ',' + spot.r, pc);
        return;
      }
      toast('这枚棋子四周没有空格 · 字牌贴不上去');
      restore(d);
      return;
    }
    if (!occ) {
      // 空格:特殊军两格都要落得下(副格先按原朝向、放不下同轴换向)
      if (isSpec(pc)) {
        // 原朝向那格若站着普通棋子(字牌/兵/马…),先试着把它换进本军腾出的旧格:
        // 「军占一个空位 + 一个子」的对调,比悄悄换向到另一侧更合手
        if (pushArmyNeighbor(pc, cell.c, cell.r, d)) return;
        const fit = fitSpecial(pc, cell.c, cell.r);
        if (!fit) {
          // 两侧都不可用(那格也是子 / 是荒地)→ 试「军 + 子」整组对调
          const plan = planArmySwap(pc, cell.c, cell.r, d, null);
          if (plan) { applyArmySwap(pc, cell.c, cell.r, plan); return; }
          toast('特殊军占两格 · 此处放不下');
          restore(d);
          return;
        }
        placeSpecialAt(pc, cell.c, cell.r, fit);
        return;
      }
      pc.c = cell.c; pc.r = cell.r;
      state.grid.set(key, pc);
      if (state.wasteland.has(key) && pc.type === '仕') {
        const cc = cellCenter(cell.c, cell.r);
        addEffect(cc.x, cc.y, 'dust', 24);
        addFloat(cc.x, cc.y - 48, '驻防 · 九宫', '#f9a825', 20);
      }
      return;
    }
    // 合成:同类同级且双方都是普通棋子(特殊军不吃合成,靠杀敌攒经验)
    if (!isTile(pc.type) && !pc.tag && !occ.tag && occ.type === pc.type && occ.lv === pc.lv) {
      if (occ.lv < MAXLV) {
        occ.lv++;
        occ.cd = 0;
        const cc = cellCenter(cell.c, cell.r);
        mergeFeedback(cc.x, cc.y, occ);
        return;
      }
      toast('已满级');
      restore(d);
      return;
    }
    // 特殊军之间不换位(两对双格互绕太绕,直接提示)
    if (isSpec(pc) && isSpec(occ)) {
      toast('两支特殊军无法换位');
      restore(d);
      return;
    }
    if (isSpec(pc)) {
      /* —— 拖的是特殊军,落在普通子上 ——
         特殊军两格放到目标格周围(目标子腾出);普通子换进特殊军
         原来的主格/副格之一(驻不下试另一格,另一格留空)。
         军来自兵营时它没有棋盘旧格可退:被顶开的子进它腾出的那个空槽 */
      const fit = fitSpecial(pc, cell.c, cell.r, new Set([key]));   // 目标格将被腾出
      if (!fit) {
        // 副格那格也站着子(或只剩荒地可退)→ 军与被顶开的两枚子整组对调
        const plan = planArmySwap(pc, cell.c, cell.r, d, null);
        if (plan) { applyArmySwap(pc, cell.c, cell.r, plan); return; }
        toast('特殊军占两格 · 此处放不下');
        restore(d);
        return;
      }
      if (d.from === 'barracks') {
        state.grid.delete(key);
        occ.c = -1; occ.r = -1;
        state.barracks[d.idx] = occ;
        placeSpecialAt(pc, cell.c, cell.r, fit);
        const cc = cellCenter(cell.c, cell.r);
        const sc = slotCenter(d.idx);
        swapFeedback(cc.x, cc.y, sc.x, sc.y);
        return;
      }
      const pcMain = mainKey(pc);
      const pcS = secKey(pc);
      const pick = (k: string | null): k is string => !!k
        && k !== key && k !== fit
        && landable(occ, k) && !(occ.type === '仕' && !state.palace.has(k));
      let landing: string | null = null;
      if (pick(pcMain)) landing = pcMain;
      else if (pick(pcS)) landing = pcS;
      if (!landing) { toast('此处放不下两军换位'); restore(d); return; }
      const [pcC, pcR] = pcMain.split(',').map(Number);
      state.grid.delete(key);
      const [lc, lr] = landing.split(',').map(Number);
      occ.c = lc; occ.r = lr;
      state.grid.set(landing, occ);
      placeSpecialAt(pc, cell.c, cell.r, fit);
      const cc = cellCenter(cell.c, cell.r);
      swapFeedback(cc.x, cc.y, cellCenter(pcC, pcR).x, cellCenter(pcC, pcR).y);
      return;
    }
    if (isSpec(occ)) {
      /* —— 拖的是普通子,落在特殊军上 ——
         来源是兵营:特殊军整支进槽,普通子出到其主格(驻不下改用副格);
         来源是棋盘:特殊军两格挪到普通子原格周围(自身两格视为可腾空),
         普通子进特殊军原主格/副格之一 */
      const occMain = mainKey(occ);
      const occS = secKey(occ);
      const [occC, occR] = occMain.split(',').map(Number);
      let fit: string | null = null;
      if (d.from === 'grid') {
        fit = fitSpecial(occ, d.c, d.r, new Set([occMain, occS ?? '']));
        if (!fit) {
          // 军要占的副格那格也是子 → 手里这枚 + 那枚,与军整组对调
          const plan = planArmySwap(occ, d.c, d.r, d, pc);
          if (plan) { applyArmySwap(occ, d.c, d.r, plan); return; }
          toast('特殊军占两格 · 换位放不下');
          restore(d);
          return;
        }
      }
      // 普通子落点:特殊军原主格优先;主格进了特殊军新占位或驻不下 → 改用原副格
      const inPair = (k: string): boolean => d.from === 'grid' && (k === d.c + ',' + d.r || k === fit);
      const pick = (k: string | null): k is string => !!k
        && !inPair(k) && landable(pc, k) && !(pc.type === '仕' && !state.palace.has(k));
      let landing: string | null = null;
      if (pick(occMain)) landing = occMain;
      else if (pick(occS)) landing = occS;
      if (!landing) { toast('此处放不下两军换位'); restore(d); return; }
      state.grid.delete(occMain);
      if (occS) state.grid.delete(occS);
      if (d.from === 'grid') {
        placeSpecialAt(occ, d.c, d.r, fit!);
      } else {
        state.barracks[d.idx] = occ;
        occ.c = -1; occ.r = -1;
      }
      const [lc, lr] = landing.split(',').map(Number);
      pc.c = lc; pc.r = lr;
      state.grid.set(landing, pc);
      const cc = cellCenter(lc, lr);
      swapFeedback(cc.x, cc.y, cellCenter(occC, occR).x, cellCenter(occC, occR).y);
      return;
    }
    // 换位:目标格 ↔ 来源(普通 ⇄ 普通)。两边都得站得住:
    //   仕不得换出九宫;被顶来的子也不得落进荒地(仕驻宫内荒地时换位会把字牌/兵按在荒地上)
    if (d.from === 'grid') {
      const src = d.c + ',' + d.r;
      if (occ.type === '仕' && !state.palace.has(src)) {
        toast('士不离宫:换位会让仕离开九宫');
        restore(d);
        return;
      }
      if (!canReceive(occ, src)) {
        toast('此处放不下换位');
        restore(d);
        return;
      }
    }
    occ.charge = null;
    occ.jump = null;
    pc.c = cell.c; pc.r = cell.r;
    state.grid.set(key, pc);
    if (d.from === 'grid') {
      occ.c = d.c; occ.r = d.r;
      state.grid.set(d.c + ',' + d.r, occ);
    } else {
      occ.c = -1; occ.r = -1;
      state.barracks[d.idx] = occ;
    }
    const cc = cellCenter(cell.c, cell.r);
    const org = d.from === 'grid' ? cellCenter(d.c, d.r) : slotCenter(d.idx);
    swapFeedback(cc.x, cc.y, org.x, org.y);
    return;
  }

  restore(d);
}

/** 垦荒令落子:荒地格 → 开辟;其他 → 令牌退回口袋 */
function endKenDrag(p: Point): void {
  const cell = cellAt(p.x, p.y);
  if (cell) {
    const key = cell.c + ',' + cell.r;
    if (state.wasteland.has(key)) {
      state.wasteland.delete(key);
      state.kens--;
      const cc = cellCenter(cell.c, cell.r);
      addEffect(cc.x, cc.y, 'stomp', 70);
      addFloat(cc.x, cc.y - 50, '垦荒 · 新阵地', '#2e7d32', 24);
      onGroundOpened(cc.x, cc.y);   // 军械·屯田令:开垦即得粮(不带则无事发生)
      return;
    }
    toast(state.blocked.has(key) ? '道路上无法开垦' : '此格已开垦');
    return;
  }
  toast('拖到「荒」格上开辟');
}

/* ---------- 事件接线 ---------- */

export function installInput(): void {
  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    const p = toLogical(e);
    pointer.x = p.x; pointer.y = p.y;
    handleDown(p);
  });
  window.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    pointer.x = p.x; pointer.y = p.y;
    if (state.screen === 'shop') shopPointerMove(p);
  });
  window.addEventListener('pointerup', (e) => {
    const p = toLogical(e);
    if (state.screen === 'shop') { shopPointerUp(p); return; }
    endDrag(p);
  });
  canvas.addEventListener('wheel', (e: WheelEvent) => {
    if (state.screen === 'shop') { e.preventDefault(); scrollShop(e.deltaY); }
  }, { passive: false });

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.screen === 'play' && !state.paused) tryDraft();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (state.screen === 'play') {
        if (state.paused) state.paused = false;
        else pauseGame();
      }
    } else if (e.key === 'g' || e.key === 'G') {
      state.gold += 50;
      addFloat(360, 60, '+50 粮(测试)', '#b8860b', 22);
    } else if (e.key === 'r' || e.key === 'R') {
      if (state.screen === 'play') {
        if (state.mode === 'endless') setupEndless();
        else setupLevel(state.level);
      }
    } else if (e.key === 's' || e.key === 'S') {
      cycleSpeed();
    }
  });
}

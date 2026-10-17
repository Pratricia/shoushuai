/* ============================================================
   游戏状态容器 + 关卡加载 + 当前地图查询
   ------------------------------------------------------------
   state 是唯一可变状态;setupLevel 按关卡数据解析地图并重置战场。
   ============================================================ */
import type { GameState, MapDef, Point, PathDef, DuelSide } from './types';
import { HEARTS, BARRACKS, START_DELAY, ENDLESS, DUEL } from './config';
import { MAPS, getMap, DUEL_MAP_BOTTOM, DUEL_MAP_TOP, DUEL_PLAYER_PATHS, DUEL_RIVAL_PATHS,
  DUEL_OPEN_PLAYER, DUEL_OPEN_RIVAL } from './data/maps';
import { LEVELS, ENDLESS_OPEN } from './data/levels';
import { getBoss } from './data/bosses';
import { bagList, passiveList, saveData, duelRankState } from './save';
import { gearOf } from './data/shop';
import { FUS } from './data/fu';
import type { FuDef } from './data/fu';
import { rollAiLoadout } from './data/ai';
import type { AiBrain } from './data/ai';
import { TILE_CHARS } from './data/specials';
import type { Piece } from './types';
import { computeBlocked } from './systems/geometry';

function initial(): GameState {
  const map = MAPS[0];
  return {
    screen: 'menu',
    mode: 'campaign',
    level: 1, gold: 0, drafts: 0, hearts: HEARTS,
    map,
    paths: map.paths.map(p => [p.spawn, ...p.points]),
    blocked: computeBlocked(map),
    wasteland: new Set(),
    palace: computePalace(map),
    boss: null,
    bossBanner: null,
    moneyGain: 0,
    moneyNote: '',
    rankUp: null,
    bag: [],
    gearSet: {},
    fuSet: {},
    gearCd: {},
    maxHearts: HEARTS,
    drumT: 0,
    kens: 0,
    barracks: [null, null, null, null, null],
    grid: new Map(),
    enemies: [], boats: [], projectiles: [], shells: [], zones: [], effects: [], floats: [],
    waveIdx: -1, waveEvents: [], waveT: 0, interWave: 0,
    levelT: 0, tideTold: false,
    speed: 1, paused: false, drag: null, toast: null,
    uiButtons: [],
  };
}

/* state 是对「当前活跃棋盘」的引用:普通模式恒指向唯一棋盘;
   对战模式每帧在两块棋盘(我方/对方 AI)之间切换,各系统零改动地跑两遍。
   ES 模块的 let 导出是活绑定——所有 import { state } 的模块都能看到切换;
   但导入方不能直接赋值,切换一律走 setBoard()。 */
export let state: GameState = initial();

/** 切换当前活跃棋盘(对战模式专用;普通模式无需调用) */
export function setBoard(b: GameState): void { state = b; }

/** 对战双棋盘容器。on=false 时其余字段无意义 */
export const duel: {
  on: boolean;
  over: boolean;         // 已分出胜负(定格在结算页,不再更新)
  player: GameState;     // 我方(下半屏,可操作)
  rival: GameState;      // 对方 AI(上半屏,只读展示)
  winner: DuelSide | null;
  ai: AiBrain;           // 对方 AI 大脑(流派 + 随机军械/兵符 + 计时)
} = { on: false, over: false, player: state, rival: state, winner: null, ai: emptyBrain() };

/** 占位大脑(非对战时无意义;setupDuel 会重新抽取) */
function emptyBrain(): AiBrain {
  return { preset: rollAiLoadout().preset, loadout: { passive: [], active: [], fu: [] }, draftT: 0, boatT: 0, gearT: 0, t: 0 };
}

/* ---------- 本棋盘武装册(我方 = 存档;对战对方 = 随机预设) ---------- */

/** 本棋盘是否已武装某军械(被动常驻 / 主动可点) */
export function boardGear(id: string): boolean {
  return (state.gearSet?.[id] ?? 0) > 0;
}

/** 本棋盘该兵种已铸的兵符(未铸 = null);攻击结算按机制取用,特殊军继承 */
export function boardFu(piece: string): FuDef | null {
  for (const f of FUS) {
    if (f.piece === piece && state.fuSet?.[f.id]) return f;
  }
  return null;
}

/** 帅的九宫(3×3,帅居底中):仕的专属布阵区 */
/** 帅的九宫(仕的专属布阵区):自帅位向**场内**展开的 3×3——
 *  帅位一律贴棋盘外缘(战役第 7 行 / 对战两帅位各贴一端),故九宫只能朝
 *  场内长;对战图两帅位镜像,这条规则让两侧九宫等大(否则贴第 0 行的那
 *  一侧会被棋盘边缘切得只剩一行) */
function computePalace(map: MapDef): Set<string> {
  const [sc, sr] = map.shuaiCell;
  const dir = sr === 0 ? 1 : -1;
  const cells = new Set<string>();
  for (let k = 0; k <= 2; k++) {
    const r = sr + dir * k;
    for (let c = sc - 1; c <= sc + 1; c++) {
      if (c >= 0 && c < map.cols && r >= 0 && r < map.rows) cells.add(c + ',' + r);
    }
  }
  return cells;
}

/** 战场重置(战役/无限共用):解析地图、封荒地、清空战局实体 */
function resetBattle(map: MapDef, open: [number, number][], gold: number, hearts: number): void {
  state.map = map;
  state.paths = map.paths.map(p => [p.spawn, ...p.points]);
  state.blocked = computeBlocked(map);
  state.palace = computePalace(map);
  // 荒地:除指定 open 格外,其余布阵格全部封住(垦荒令开辟)
  const openSet = new Set(open.map(([c, r]) => c + ',' + r));
  state.wasteland = new Set();
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const key = c + ',' + r;
      if (!state.blocked.has(key) && !openSet.has(key)) state.wasteland.add(key);
    }
  }
  state.kens = 0;
  state.gold = gold;
  state.drafts = 0;
  state.hearts = hearts;
  state.maxHearts = hearts;
  state.boss = null;
  state.bossBanner = null;
  state.moneyGain = 0;
  state.moneyNote = '';
  state.rankUp = null;
  // 技能槽:按存档装载主动军械(只有装进槽的主动技生效)
  // 武装册:本棋盘实际生效的军械 = 已携带的被动 + 已装槽的主动
  // (对战对方在 duelBoard/setupDuel 里覆盖为随机预设;未携带的被动不进册 → 一律不生效)
  state.bag = bagList();
  state.gearSet = {};
  for (const id of passiveList()) state.gearSet[id] = 1;
  for (const id of state.bag) state.gearSet[id] = 1;
  state.fuSet = { ...saveData.fu };
  state.gearCd = {};
  state.drumT = 0;
  state.barracks = [null, null, null, null, null];
  state.grid = new Map();
  state.enemies = [];
  state.boats = [];
  state.projectiles = [];
  state.shells = [];
  state.zones = [];
  state.effects = [];
  state.floats = [];
  state.waveIdx = -1;
  state.waveEvents = [];
  state.waveT = 0;
  state.interWave = START_DELAY;   // 开局布阵缓冲:首波延迟出兵
  state.levelT = 0;
  state.tideTold = false;
  state.drag = null;
  state.toast = null;
  state.paused = false;
}

/** 加载关卡:按关卡 mapId 解析地图、重算阻挡格、重置战场 */
export function setupLevel(n: number): void {
  const level = LEVELS[n - 1];
  const map = getMap(level.mapId);
  duel.on = false;
  duel.over = false;
  state.mode = 'campaign';
  state.level = n;
  // 军械库:基础粮/血照关卡数据;被动军械(屯粮车/金钟罩)在每波开始生效
  resetBattle(map, level.open, level.gold, HEARTS);
  prefillBarracks();
  // 本关 Boss:波次含「将」时必须配置 boss 字段(数据错误加载即报,不带病开局)
  const usesBoss = level.waves.some(wv => wv.some(g => g.t === '将'));
  state.boss = level.boss ? getBoss(level.boss) : null;
  if (usesBoss && !state.boss) throw new Error('关卡「' + level.name + '」波次含「将」但未配置 boss 字段');
  state.screen = 'play';
}

/** 无限模式:楚河汉界血战至帅陨落——波次程序生成、永不结算,
 *  强度随波数攀升(敌潮 × 波次系数),每 5 波一场 Boss,水军楼船自河上来袭 */
export function setupEndless(): void {
  duel.on = false;
  duel.over = false;
  state.mode = 'endless';
  state.level = 1;                 // 数值锚:与战役第 1 关同级,强度成长全在波次系数
  // 军械库同样生效(被动按波结算)
  resetBattle(getMap('chuhe'), ENDLESS_OPEN, ENDLESS.goldStart, ENDLESS.hearts);
  prefillBarracks();
  state.screen = 'play';
}

/** 对战模式:上下半屏 1v1——我方 + 对方 AI 各占一块棋盘(共享镜像竞技场),
 *  各自经济/兵营/军械单独计算,承受完全对称的自动波次;谁先破帅谁输 */
export function setupDuel(): void {
  const p = duelBoard(DUEL_MAP_BOTTOM, DUEL_PLAYER_PATHS, DUEL_OPEN_PLAYER, 'player');
  const r = duelBoard(DUEL_MAP_TOP, DUEL_RIVAL_PATHS, DUEL_OPEN_RIVAL, 'rival');
  duel.on = true;
  duel.over = false;
  duel.player = p;
  duel.rival = r;
  duel.winner = null;
  // 抽一套流派 + 军械/兵符:对方「有备而来」,但仍在同一套机制与上限内。
  // 件数下限随**我方段位**升高(见 data/ai.ts 的 AI_FLOOR):段位越高,对手牌面越整
  const { preset, loadout } = rollAiLoadout(duelRankState().tier);
  duel.ai = { preset, loadout, draftT: DUEL.aiDraft, boatT: DUEL.aiBoat, gearT: 0.6, t: 0 };
  r.gearSet = {};
  for (const id of loadout.passive) r.gearSet[id] = 1;
  for (const id of loadout.active) r.gearSet[id] = 1;
  r.bag = loadout.active.slice();
  r.fuSet = {};
  for (const id of loadout.fu) {
    const f = FUS.find(x => x.id === id);
    if (f) r.fuSet[id] = 1;
  }
  // 双方开局预置(老卒 / 军令旗,按各自武装册)
  setBoard(r);
  prefillBarracks();
  setBoard(p);
  state = p;
  state.screen = 'play';
  state.side = 'player';
  prefillBarracks();
}

/** 构建一块对战棋盘:复用 resetBattle,再按本方归属收窄路线/装备 */
function duelBoard(map: MapDef, paths: PathDef[], open: [number, number][], side: DuelSide): GameState {
  const prev = state;
  const b = initial();
  state = b;
  resetBattle(map, open, DUEL.goldStart, DUEL.hearts);
  b.side = side;
  b.mode = 'duel';
  b.screen = 'play';
  b.paths = paths.map(p => [p.spawn, ...p.points]);   // 只走本方半场的两条路线
  if (side === 'rival') { b.bag = []; b.gearSet = {}; b.fuSet = {}; }   // 对方武装在 setupDuel 里抽定
  state = prev;
  return b;
}

/** 军械库·开局预置:老卒(二级兵)+ 军令旗(随机字牌),塞进空槽(看本棋盘的武装册) */
function prefillBarracks(): void {
  const put = (p: Piece): void => {
    const slot = state.barracks.findIndex(q => q === null);
    if (slot >= 0) state.barracks[slot] = p;
  };
  if (boardGear('laozu')) put({ type: '兵', lv: 2, cd: 0, stunT: 0, c: -1, r: -1 });
  if (boardGear('ling')) {
    const n = gearOf('ling')?.fx.startTile ?? 1;
    for (let i = 0; i < n; i++) {
      const chars = [...TILE_CHARS];
      const ch = chars[Math.floor(Math.random() * chars.length)];
      put({ type: ch as Piece['type'], lv: 1, cd: 0, stunT: 0, c: -1, r: -1 });
    }
  }
}

/** 进入主菜单:载入地图一的静态棋盘做背景,清空所有战局实体(残局不再透出) */
export function enterMenu(): void {
  const map = MAPS[0];
  duel.on = false;
  duel.over = false;
  state.map = map;
  state.paths = map.paths.map(p => [p.spawn, ...p.points]);
  state.blocked = computeBlocked(map);
  state.palace = computePalace(map);
  state.enemies = [];
  state.boats = [];
  state.projectiles = [];
  state.shells = [];
  state.zones = [];
  state.effects = [];
  state.floats = [];
  state.grid = new Map();
  state.barracks = [null, null, null, null, null];
  state.drag = null;
  state.toast = null;
  state.hearts = HEARTS;
  state.wasteland = new Set();
  state.boss = null;
  state.kens = 0;
  state.paused = false;
  state.speed = 1;
  state.mode = 'campaign';
  state.levelT = 0;
  state.tideTold = false;
  state.screen = 'menu';
}

/* ---------- 当前地图查询(渲染 / 布阵 / 攻击共用) ---------- */

/** 布阵格中心 */
export function cellCenter(c: number, r: number): Point {
  return { x: state.map.colX[c], y: state.map.rowY[r] };
}

/** 兵营槽位中心 */
export function slotCenter(i: number): Point {
  return { x: BARRACKS.x0 + i * (BARRACKS.slot + BARRACKS.gap) + BARRACKS.slot / 2, y: BARRACKS.y + BARRACKS.h / 2 };
}

/** 逻辑坐标 → 命中布阵格(列距 95 / 行距 108:容差 x±46 y±52,不与邻格重叠) */
export function cellAt(x: number, y: number): { c: number; r: number } | null {
  for (let r = 0; r < state.map.rows; r++) {
    for (let c = 0; c < state.map.cols; c++) {
      if (Math.abs(x - state.map.colX[c]) <= 46 && Math.abs(y - state.map.rowY[r]) <= 52) return { c, r };
    }
  }
  return null;
}

/** 逻辑坐标 → 命中兵营槽位(未命中返回 -1) */
export function slotAt(x: number, y: number): number {
  for (let i = 0; i < BARRACKS.n; i++) {
    const sc = slotCenter(i);
    if (Math.abs(x - sc.x) <= 52 && Math.abs(y - sc.y) <= 52) return i;
  }
  return -1;
}

/** 第一个可布阵空格(道路格 / 荒地格 / 已占格跳过) */
export function firstEmptyCell(): { c: number; r: number } | null {
  for (let r = 0; r < state.map.rows; r++) {
    for (let c = 0; c < state.map.cols; c++) {
      const key = c + ',' + r;
      if (!state.blocked.has(key) && !state.wasteland.has(key) && !state.grid.has(key)) return { c, r };
    }
  }
  return null;
}

/* ============================================================
   共享类型定义
   模块边界:所有跨模块传递的数据形状都在这里声明
   ============================================================ */
import type { RankProgress } from './data/ranks';

export interface Point { x: number; y: number; }

export type PieceType = '兵' | '马' | '炮' | '车' | '相' | '仕';
/** 特殊字牌(棋语零件,如「连环马」拆出 连+环):不上阵作战,
 *  贴着对应基础棋子摆放(四邻格),凑齐全套即并格成军(见 data/specials.ts) */
export type TileType = '连' | '环' | '担' | '竿' | '巡' | '骑' | '过' | '河' | '飞' | '局' | '羊' | '角';
/** 征兵池与 Piece.type 的完整取值:基础棋子 ∪ 字牌 */
export type DraftType = PieceType | TileType;
export type EnemyType = '卒' | '马' | '车' | '象' | '砲' | '士' | '将' | '水';
export type GameMode = 'campaign' | 'endless' | 'duel';
/** 对战阵营:player = 我方(下半屏),rival = 对方 AI(上半屏) */
export type DuelSide = 'player' | 'rival';
export type Screen = 'menu' | 'start' | 'shop' | 'play' | 'clear' | 'over' | 'win';
export type TargetRule = 'front' | 'hp' | 'far';
export type AttackMode = 'stab' | 'hop' | 'shell' | 'charge' | 'stomp' | 'slash';

/* ---------- 静态定义(数据层) ---------- */

/** 兵种定义(数值 + 攻击方式参数) */
export interface PieceDef {
  mode: AttackMode;
  dmg: number;
  cd: number;
  range: number;
  target: TargetRule;
  desc: string;
  kb?: number;        // 击退距离(兵/相/车)
  hops?: number;      // 马:连跳次数
  jumpR?: number;     // 马:下一跳搜索半径
  decay?: number;     // 马:每跳伤害衰减
  splashR?: number;   // 炮:溅射半径
  chargeLen?: number; // 车:冲撞距离
  hitR?: number;      // 车:碾压判定半径
  hitCap?: number;    // 车:一次冲出最多命中几个敌军(达限提前收招,不再一条线通杀)
  drag?: number;      // 车:冲出途中每命中一敌的速度系数(<1,人马阻挡的迟滞感)
  stompR?: number;    // 相:践踏半径
  slow?: number;      // 相:减速时长(秒)
}

export interface EnemyDef {
  hp: number;
  spd: number;
  gold: number;
  dmg: number;
  r: number;
  pause?: number;        // 车:拐角歇整秒数(转向前原地停顿)
}

/** Boss 技能(数据驱动联合类型):新增一种技能 = 扩此联合 + skills.ts 加查询 /
 *  enemies.ts tickBoss 加 case,再在对应系统钩子(出怪/行军/伤害/渲染)读取 */
export type BossSkill =
  | { id: 'knockImmune' }                                                  // 免疫击退
  | { id: 'sacrificeImmune' }                                               // 免疫仕的舍身挡驾(必须硬杀)
  | { id: 'guardLink'; guard: EnemyType; radius: number; share: number }    // 护主链接:近卫分摊伤害
  | { id: 'leap'; cd: number; dist: number; stunR: number; stun: number }   // 卧槽马:腾空闪袭(跃过防线,空中不可选中,落地眩晕一圈)
  | { id: 'bombard'; cd: number; radius: number; stun: number }             // 当头炮:中宫炮(周期性架炮轰最密集阵地)
  | { id: 'mountShield'; radius: number; reduce: number }                   // 当头炮:炮架(贴着棋子时借架减伤)
  | { id: 'noSlow' }                                                        // 过河卒:不回头(免疫减速)
  | { id: 'rage'; threshold: number; spd: number }                          // 过河卒:越河狂奔(血量过门槛后提速)
  | { id: 'dash'; cd: number; dist: number; stunR: number; stun: number }   // 铁滑车:一线平推(地面冲刺,冲到即沿线眩晕)
  | { id: 'armor'; reduce: number }                                         // 铁滑车:铁甲(全伤害固定减免)
  | { id: 'summon'; hpGate: number[]; n: number; minion: EnemyType }         // 楚霸王:十面埋伏(血量过门槛召伏兵)
  | { id: 'bolt'; cd: number; range: number; stun: number }                 // 铁门栓:一子定栓(周期锁死射程内火力最猛的棋子)
  | { id: 'twin' };                                                         // 双车错:错车(成对出阵、金线相连,失伴者死斗提速)

/** Boss 主动技能运行态:leap = 腾空(空中不可选中)/ dash = 地面冲刺(可选中断) */
export interface BossAct {
  kind: 'leap' | 'dash';
  t: number; dur: number;
  fx: number; fy: number;   // 起跳/起冲点
  tx: number; ty: number;   // 落点(已在路径上推进 wpi)
}

/** Boss 定义 —— Boss 是一种敌军类型(出怪键「将」),每位具体 Boss 是注册表(data/bosses.ts)里的一条数据 */
export interface BossDef {
  id: string;             // 注册表键(关卡 boss 字段引用)
  name: string;           // 展示名(出阵飘字等)
  glyph: string;          // 棋面字
  title: string;          // 出阵告示一句话(技能特点,楚河横幅与图鉴共用)
  hp: number;
  spd: number;
  dmg: number;
  r: number;
  gold: number;
  count?: number;         // 一次出场几名(默认 1;双车错 = 2)
  skills: BossSkill[];    // 技能组合:行为经 systems/skills.ts 分发
}

export interface PathDef {
  name: string;
  spawn: Point;    // 出生点(敌营城楼内部,敌军在此生成)
  points: Point[]; // 行军路线(自城楼门前开始,末点=帅;道路不贯穿城楼)
}
export interface RiverLabel { text: string; x: number; }
export interface RiverDef { y: number; h: number; labels: RiverLabel[]; }

/** 战场地图定义 —— 数据驱动核心:新增地图只需在 data/maps.ts 加一条数据,引擎零改动 */
export interface MapDef {
  id: string;
  name: string;
  cols: number;          // 布阵格列数
  rows: number;          // 布阵格行数
  colX: number[];        // 每列格心的 x 坐标(允许不规则网格)
  rowY: number[];        // 每行格心的 y 坐标
  paths: PathDef[];      // 出怪口与行军路线(首点=出怪口,末点=帅)
  shuai: Point;          // 帅(终点)坐标
  shuaiCell: [number, number];  // 帅所在格 [c,r](九宫以帅为底中,仕的布阵区)
  shuai2Cell?: [number, number];  // 对战:另一侧帅台格 [c,r](底图同时画两座帅台;普通图不填)
  river: RiverDef;       // 楚河汉界河带(纯装饰)
}

export interface WaveGroup {
  t: EnemyType;
  n: number;
  gap: number;
  delay?: number;        // 组内开涌延迟(秒):波内世代递进——基础兵先涌、高级兵随后
}

/** 关卡定义 —— mapId 决定本关用哪张地图 */
export interface LevelDef {
  name: string;
  mapId: string;
  gold: number;
  gap: number;           // 波与波之间的出兵间隔(秒);0 = 连续出兵不等清场
  boss?: string;         // 本关「将」位出场的 Boss(bosses.ts 注册表键);选关模式仅 5 的倍数关卡配置
  open: [number, number][];  // 初始可布阵格 [c,r](其余封为荒地,垦荒令开辟)
  waves: WaveGroup[][];  // 每波若干组 {兵种, 数量, 出怪间隔}
}

/* ---------- 运行时实体 ---------- */

/** 车:冲阵动画状态(冲出段为距离推进制:每命中一敌速度×drag,命中数达 hitCap 提前折返) */
export interface ChargeState {
  fx: number; fy: number;   // 起点(棋子原位)
  tx: number; ty: number;   // 冲撞终点
  x: number; y: number;     // 当前位置
  t: number;                // 回位段内时间
  backDur: number;
  phase: 'out' | 'back';
  hit: Enemy[];             // 已碾压过的敌人(防重复判定;其长度=命中数)
  len: number;              // 冲出段总长(px)
  dist: number;             // 已冲出距离(px)
}

/** 马:连跳动画状态 */
export interface JumpState {
  hx: number; hy: number;   // 家(棋子原位)
  x: number; y: number;     // 当前位置
  fx: number; fy: number;   // 本跳起点
  tx: number; ty: number;   // 本跳终点
  h: number;                // 腾空高度
  t: number; dur: number; arc: number;
  phase: 'fly' | 'back';
  target: Enemy | null;
  hit: Enemy[];             // 已踏过的敌人
  dmg: number;
  hopLeft: number;
  jumpR: number;
  decay: number;
}

export interface Piece {
  type: DraftType;
  lv: number;
  cd: number;
  stunT: number;            // 被砲轰中:眩晕剩余秒数(期间不可行动)
  c: number;                // 所在列(未上阵时为 -1)
  r: number;                // 所在行(未上阵时为 -1)
  tag?: string;             // 特殊军名(SPECIALS 键):字牌成军标记——双格占位、经验升级
  vec?: { dc: number; dr: number };  // 特殊军朝向(成军时字牌相对棋子的方向):本体占 (c,r),副格占 (c+dc, r+dr)
  xp?: number;              // 特殊军经验值(击杀累积;攒满 need×lv 升一级,不再靠合成)
  charge?: ChargeState | null;
  jump?: JumpState | null;
  thrustT?: number;         // 兵:突刺前冲动画剩余秒
  thrustAng?: number;       // 兵:突刺方向(弧度)
  leapT?: number;           // 相:腾空重踏动画剩余秒
  stompPending?: boolean;   // 相:腾空中,落地瞬间结算践踏
  recoilT?: number;         // 炮:后坐动画剩余秒
  recoilDx?: number;        // 炮:后坐方向单位向量
  recoilDy?: number;
  mergeT?: number;          // 合体弹亮剩余秒(刻环一亮 + 微弹放,合成升 1 级时置入)
}

export interface Enemy {
  type: EnemyType;
  x: number; y: number;
  hp: number; maxHp: number;
  spd: number;
  slowT: number;
  kbT: number;
  armorBreakT: number;       // 兵符·破甲:剩余秒数(期间受到的一切伤害放大)
  walkPh: number;            // 行军步态相位(随实际位移推进:颠簸/摇摆动画;歇整/架炮时冻结)
  pauseT: number;            // 车:拐角歇整剩余时间
  aimT: number;              // 架炮蓄力剩余时间(砲一炮定音 / 当头炮中宫炮;蓄力中原地不动)
  aimX: number; aimY: number; // 砲/当头炮:炮击落点(蓄力时锁定)
  shotDone: boolean;         // 砲:一炮定音——一生只放一发(Boss 炮不设此限,由技能冷却控制)
  tide: number;              // 出生时敌潮系数(≥1,随 levelT 线性;Boss 恒为 1)
  dead: boolean;
  r: number; gold: number; dmg: number;
  boss: BossDef | null;    // Boss 定义(普通敌军为 null):数值/技能/造型的数据源
  act?: BossAct | null;     // Boss 主动技能进行态(腾空/冲刺):常规行军冻结
  cdT?: number;             // Boss 主动技能冷却剩余(懒初始化)
  sumWaves?: number;        // 楚霸王:已完成的召唤档数(血门槛逐档触发)
  raged?: boolean;          // 过河卒:狂奔播报已放(阈值只飘一次字)
  boltP?: Piece | null;     // 铁门栓:被锁的棋子(渲染层画铁链)
  twRaged?: boolean;        // 双车错:搭档已亡,孤车死斗中
  path: Point[];
  wpi: number;              // 下一个路点索引
}

/** 敌方巨弹(砲一炮定音 / 当头炮中宫炮):飞行中,落地眩晕圈内棋子 */
export interface EnemyShell {
  x: number; y: number;      // 发射点
  tx: number; ty: number;    // 落点(蓄力时已锁定)
  t: number; dur: number;
  radius?: number;           // 眩晕圈半径(缺省 SHELL.radius;当头炮用自己的参数)
  stun?: number;             // 眩晕时长(缺省 SHELL.stun)
  done?: boolean;
}

/** 战场区域(兵符机制:炮膛灼烧 / 相羽减速沼泽):范围内持续作用,到期消散 */
export interface Zone {
  kind: 'burn' | 'slow';
  x: number; y: number;
  r: number;                 // 作用半径
  t: number; dur: number;    // 已存续 / 总时长(秒)
  pulse: number;             // 灼烧脉冲计时(0.5s 一跳,免得伤害飘字刷屏)
}

/** 水军楼船(无限模式):自河随机一端驶入 → 泊桥下船 → 穿桥洞离场
 *  船体不可攻击;水军下船后走 桥南接线 直扑帅 */
export interface Boat {
  x: number; y: number;
  dir: number;              // 航向:1=自西向东,-1=自东向西
  bx: number;               // 目标桥 x
  state: 'sail' | 'dock' | 'leave';
  ph: number;               // 行船颠簸相位
  squad: number;            // 待下船水军数
  spawnT: number;           // 下一水军下船倒计时
  wave: number;             // 所属波次(1 基;水军强度锚)
  path: Point[];            // 水军登岸路线(泊位 → 上桥 → 桥南接线直扑帅)
  wait: number;             // 入场延迟(同波多船错峰)
  leaveT: number;           // 下船完毕后的收舷短顿(下场动画起势)
}

export interface Projectile {
  mode: 'shell';
  x: number; y: number;
  target: Enemy | null;
  tx: number; ty: number;
  dmg: number;
  splashR: number;
  owner?: Piece | null;      // 发射者(击杀归属:特殊军吃经验)
  sx?: number; sy?: number;   // 发射点(尾迹/弧线计算)
  flown?: number;             // 已飞行距离(抛物线进度)
  arc?: number;               // 抛物线最高点高度
  done?: boolean;
}

export type EffectType = 'stab' | 'jump' | 'stomp' | 'splat' | 'dust' | 'hit' | 'death' | 'palace' | 'shot' | 'slash'
  | 'muzzle' | 'smoke' | 'boom' | 'ripple' | 'merge';

export interface Effect { x: number; y: number; x2: number; y2: number; type: EffectType; r: number; t: number; dur: number; }

export interface FloatText { x: number; y: number; text: string; color: string; size: number; t: number; dur: number; }

export interface DragState {
  kind: 'piece' | 'ken';     // 拖的是棋子还是垦荒令
  from: 'barracks' | 'grid';
  idx: number;              // 兵营槽位(非兵营来源时为 -1)
  c: number; r: number;     // 棋盘格(非棋盘来源时为 -1)
  piece: Piece | null;      // ken 拖拽时为 null(令牌不占兵营)
}

export interface UIButton { id: string; x: number; y: number; w: number; h: number; n?: number; }

export interface SpawnEvent { t: EnemyType; at: number; }

/** 全局游戏状态(唯一可变状态容器) */
export interface GameState {
  screen: Screen;
  mode: GameMode;            // campaign = 十关战役 / endless = 无限模式 / duel = 上下半屏对战
  side?: DuelSide;           // 对战:本方归属(rival 不享军械被动/不产符片)
  level: number;             // endless 恒为 1(数值锚,强度成长全在波次系数)
  gold: number;
  drafts: number;
  hearts: number;
  map: MapDef;              // 当前地图(由关卡 mapId 解析)
  paths: Point[][];         // 当前地图的行军路线(map.paths 展开)
  blocked: Set<string>;     // 路径占用的格子 'c,r'(启动时自动计算)
  wasteland: Set<string>;   // 荒地格(未开垦,不可布阵;仕可驻扎宫内荒地)
  palace: Set<string>;      // 帅的九宫格(仕的专属布阵区)
  boss: BossDef | null;     // 本关 Boss 定义(关卡 boss 字段解析;波次里的「将」按此生成)
  bossBanner: { name: string; title: string; t: number } | null;  // Boss 出阵告示(楚河横幅,倒计时淡出)
  moneyGain: number;         // 本局结算发的军饷(结算页展示;0 = 本局无饷)
  moneyNote: string;         // 发饷缘由(首通犒赏 / 血战N波)
  rankUp: RankProgress | null;  // 对战:本局胜局触发的段位推进(结算页亮出;未升段也记录等级变化)
  bag: string[];             // 本局随身军械(开战按存档背包装载;主动技可点按钮反复用)
  gearSet: Record<string, number>;  // 本棋盘已解锁军械(我方=存档;对战对方=随机预设)id -> 1
  fuSet: Record<string, number>;    // 本棋盘已铸兵符(我方=存档;对战对方=随机预设)fuId -> 1
  gearCd: Record<string, number>;  // 主动军械冷却剩余秒数 id -> 剩余
  maxHearts: number;         // 本局帅血上限(灵药回复不超过此值)
  drumT: number;             // 战鼓:全军攻速加成剩余秒数(0 = 无)
  kens: number;             // 垦荒令数量(征兵随机掉落)
  barracks: (Piece | null)[];
  grid: Map<string, Piece>; // 'c,r' -> 棋子
  enemies: Enemy[];
  boats: Boat[];            // 水军楼船(仅无限模式出现)
  projectiles: Projectile[];
  shells: EnemyShell[];     // 敌砲巨弹(一炮定音)
  zones: Zone[];            // 战场区域(兵符:灼烧/减速沼泽)
  effects: Effect[];
  floats: FloatText[];
  waveIdx: number;
  waveEvents: SpawnEvent[];
  waveT: number;
  interWave: number;
  levelT: number;             // 关内游戏时间(秒,含倍速):敌潮成长的自变量
  tideTold: boolean;          // 敌潮强化首次提示已播(每关一次)
  speed: number;
  paused: boolean;            // 暂停中(更新冻结)
  drag: DragState | null;
  toast: { text: string; t: number } | null;
  uiButtons: UIButton[];
}

/* ============================================================
   全局数值配置(调平衡就改这里)
   ============================================================ */
import type { PieceDef, PieceType, DraftType, EnemyType, EnemyDef } from './types';

/** 画布逻辑尺寸(竖屏) */
export const W = 720;
export const H = 1280;
export const TAU = Math.PI * 2;

export const FONT = '"KaiTi","STKaiti","SimSun","Microsoft YaHei",serif';
export const INK = '#2f2820';
export const PAPER = '#efe7d5';

/** 兵营 / 征兵 / 回收(所有地图共用,位于屏幕底部) */
export const BARRACKS = { n: 5, slot: 88, gap: 6, x0: 40, y: 1186, h: 92 };
export const DRAFT_BTN = { x: 512, y: 1186, w: 98, h: 92 };
export const RECYCLE_BTN = { x: 616, y: 1186, w: 96, h: 92 };

/** 合成与成长 */
export const MAXLV = 5;
export const HEARTS = 3;

export const DRAFT: { base: number; accel: number; weights: Record<DraftType, number> } = {
  // 征兵费递增曲线:首征 6,之后每次的「涨价幅度」递增 2(涨 2/4/6/8/10…)
  // → 6 / 8 / 12 / 18 / 26 / 36 / 48 …(n²+n+6):前期贴旧手感、中后期越征越贵
  base: 6, accel: 2,
  // 字牌(棋语零件)混入征兵池:抽到是「半张军令」,凑齐贴子成军;
  // 单张不成战力、可回收(1 粮),权重即稀有度杠杆
  weights: { '兵': 32, '马': 18, '炮': 14, '车': 15, '相': 13, '仕': 8,
    '连': 3, '环': 3, '担': 3, '竿': 3, '巡': 3, '骑': 3, '过': 3, '河': 3, '飞': 3, '局': 3, '羊': 3, '角': 3 },
};

/** 特殊军经验:击杀敌军攒经验升级(替代合成升级),攒满 needLv[等级-1] 升 1 级
 *  数值口径:按威胁(血量档)标定,普通卒=3、重甲象=24;Boss 60 一枚大考经验包
 *  曲线刻意「越升级越慢」:成军即有战力(注册表倍率 + 独门机制),满级是长期目标
 *  v0.3 调慢(玩家反馈升级太快、满级来得没分量):40/100/180/280 → 60/160/320/520,
 *  每级 ×1.5/×1.6/×1.78/×1.86 递紧——前期仍能快点尝到 Lv2,后期一级一场硬仗 */
export const XP: { per: Record<EnemyType, number>; needLv: number[] } = {
  per: { '卒': 3, '马': 6, '车': 12, '象': 24, '砲': 14, '士': 16, '将': 60, '水': 5 },
  needLv: [60, 160, 320, 520],   // 升 Lv2/3/4/5 各需经验(合计 1060,约 350 卒)
};
/** 从 lv 升下一级所需经验(满级返回 Infinity) */
export function xpNeed(lv: number): number {
  return XP.needLv[lv - 1] ?? Infinity;
}

/** 开局布阵缓冲:进关后首波敌军的延迟出兵(秒),给玩家征兵布阵的反应时间 */
export const START_DELAY = 6;

/** 对战模式(上下半屏 1v1,镜像同步):双方各占半场、各自经济/兵营/军械单独计算,
 *  承受完全对称的自动波次;水军是唯一越河进攻手段(按波自动生成 + 玩家花粮主动派出)。
 *  谁先被破帅谁输——比的是谁活得更久。 */
export const DUEL = {
  goldStart: 8,     // 双方开局粮草
  hearts: 5,        // 双方帅血(水军抢滩一波可打掉数点,留足容错才比得出「谁活得更久」)
  boatCost: 14,     // 我方主动派水军的粮草
  boatSquad: 4,     // 对战楼船载员基数(比无限模式少:5 点帅血下一船≈4 伤,够痛但不秒杀)
  autoBoatWave: 6,  // 每几波自动放一波水军(双方河岸各一艘 → 保证对称;6 波 ≈ 改前「3 波随机砸一边」的各自承受率;
                    // 刻意与 5 波一次的 Boss 错开:改成 5 会让每次抢滩都叠在 Boss 波上,血压尖刺而不是加压)
  aiDraft: 2.4,     // 对方 AI 决策间隔(秒)
  aiPieces: 8,      // AI 初始可布阵格数(= 我方人均初始开放格;与开局 open 集等量)
  aiKenWaves: 2,    // AI 每几波多开一格(对标我方掷到垦荒令的节奏)
  aiKenMax: 8,      // AI 额外开格上限
  aiBoat: 16,       // AI 派水军间隔下限(秒)
  aiGoldBonus: 0,   // AI 每波额外粮草(0 = 与玩家完全同源:只靠击杀+自身军械;想给点余裕再调回 1)
  aiGearScan: 0.7,  // AI 主动军械扫描间隔(秒)
  aiReserve: 1.6,   // 派水军前保留的粮草(×征兵价;低于此值先攒兵)
  aiBoatReserveCap: 50, // 保留额封顶(×aiReserve=80):征兵价按 n² 涨,后期一次征兵要两三百粮,
                        // 若按真实征兵价留钱会长期攒不齐、粮草干屯在顶栏(「粮300」不动很蠢)。
                        // 封顶后余粮转去派水军——这是 AI 唯一能打掉我方帅血的手段
  unitMul: 1.15,    // 每波出怪量系数:单人单路(全波敌人走同一条道,密度本该翻倍),但行军道也从
                    // ~690px 拉长到 ~1260px(受火时间 ×1.8),两者相抵,故只小幅上调
                    // ⚠️ 加数量是「假压力」:敌人多 → 击杀粮草多 → 双方都更快成型;
                    //    真要加压只动血量(下三条),本项只负责校准单路密度
  hpMul: 1.25,      // 对战专属:敌潮**血量爬坡**再乘 1.25(只放大爬坡项,第 1 波仍是 1.0 倍)
                    // 单靠它只是把整条曲线整体抬高,第 20 波往后仍有「守住了就一直守住」的
                    // 平台期 → 由下面「战事升级」段补(当前实测口径见 lateQuad)
  lateFrom: 5,      // 「战事升级」闸门(0 基波次号):第 6 波(w0=5)及以前恒不加,
                    // 所以**前 6 波手感与旧版分毫不动**,第 7 波(w0=6)起才算第一波加压
  latePerWave: 0.03, // 第 7 波起:每多推一波,敌潮血量系数再 ×(1 + 3%)——**第 7 波当场就比第 6 波硬**
  lateQuad: 0.0015, // 第 7 波起再叠二次项(×(超出波数)²):越拖越紧,后期不留平台期
                    // 两档合起来(相对旧曲线的加压幅度):
                    //   第 7 波 ×1.03 · 第 9 波 ×1.12 · 第 11 波 ×1.22 · 第 14 波 ×1.38
                    //   第 18 波 ×1.61 · 第 22 波 ×1.91 · 第 25 波 ×2.14 · 第 30 波 ×2.75
                    // 实测(元帅档 · 5 种子 · 只看 AI 能撑多久):旧曲线中位 30 波 → 默认中位 21 波
                    // (同一条系数也乘到 Boss 头顶,末段「大考」不被常规波稀释)
                    // 仍只放大血量爬坡项、双方完全对称——不是机制改动,只是「后期越来越紧」;
                    // 想更狠/更软只动这两个数(都设 0 = 关掉,回到旧曲线)
};

/** 卖子所得(回收键):每级翻倍 */
export function sellValue(lv: number): number {
  return Math.pow(2, lv - 1);
}

/** 垦荒令:征兵随机掉落(每关首次征兵必掉),拖到荒地格开辟新的布阵位 */
export const KEN = { chance: 0.55, max: 3 };
/** 垦荒令口袋(位于征兵键上方,拖拽起点) */
export const KEN_BTN = { x: 512, y: 1104, w: 98, h: 70 };

/** 战备背包按钮排(兵营上方、垦荒口袋左侧):随身道具点击即用 */
export const BAG_BTN = { x: 40, y: 1104, w: 80, h: 70, gap: 8 };

/** 军械库·携行规则:主动军械要装进技能槽(上限 activeCap,对应局内技能按钮数);
    被动军械解锁后自行携带(上限 passiveCap,可随时取下;两者各自成池,互不抢格)。
    2026-10 定稿改动:被动从「解锁即常驻不限数」改为「携带制 + 上限 passiveCap」——
    军械库点卡片即携带/取下,只有携带的被动进本局武装册(state.ts 的 gearSet) */
export const GEAR_BAG = { activeCap: 2, passiveCap: 6 };

/** 每级成长:伤害 / 攻速 / 射程 / 范围类参数(践踏半径、跳跃距离、线长) */
export const GROWTH = { dmg: 2, cd: 0.93, range: 0.06, area: 0.05 };

/** 等级配色(Lv1~Lv5) */
export const TIER: Record<number, { bg: string; bd: string }> = {
  1: { bg: '#8d99ae', bd: '#5c677d' },
  2: { bg: '#43a047', bd: '#2e7d32' },
  3: { bg: '#1e88e5', bd: '#1565c0' },
  4: { bg: '#8e24aa', bd: '#6a1b9a' },
  5: { bg: '#f9a825', bd: '#ef6c00' },
};

/* 攻击模式:兵=突刺击退 / 马=踏营连跳 / 炮=远瞄溅射 / 车=冲阵折返 / 相=周身践踏 */
export const PIECES: Record<PieceType, PieceDef> = {
  '兵': { mode: 'stab',   dmg: 11, cd: 0.5,  range: 120, target: 'front', kb: 24, desc: '突刺·连戳推敌' },
  '马': { mode: 'hop',    dmg: 22, cd: 1.0,  range: 160, target: 'hp',    hops: 3, jumpR: 170, decay: 0.75, desc: '踏营·连环三跳' },
  '炮': { mode: 'shell',  dmg: 23, cd: 1.7,  range: 520, target: 'far',   splashR: 95, desc: '溅射·隔山打牛' },
  '车': { mode: 'charge', dmg: 55, cd: 2.2,  range: 260, target: 'hp',    chargeLen: 380, hitR: 46, kb: 55, hitCap: 5, drag: 0.82, desc: '冲阵·五敌折返' },
  '相': { mode: 'stomp',  dmg: 16, cd: 1.3,  range: 138, target: 'front', stompR: 140, slow: 1.8, kb: 40, desc: '践踏·缓敌周身' },
  '仕': { mode: 'slash',  dmg: 23, cd: 1.25, range: 110, target: 'front', desc: '宫斩·守御九宫(舍身挡驾)' },
};

/** 砲(敌)一炮定音:触发距离 / 蓄力 / 落点半径 / 眩晕时长 / 巨弹飞行 */
export const SHELL = { trigger: 340, aim: 2.0, radius: 130, stun: 3.0, flight: 0.6 };
/** 合体反馈:金环半径(px,不越出本格)/ 弹亮时长(秒)——小动画,不遮视野 */
export const MERGE = { ringR: 62, flash: 0.55 };
/** 敌潮(关内时间成长):晚出的敌军基础数值更强,后半程压力不靠堆数量
    hpPerSec / spdPerSec = 每游戏秒成长率;mark = 强化标与首次提示阈值;Boss 不吃敌潮 */
export const TIDE = { hpPerSec: 0.004, spdPerSec: 0, mark: 1.2 };

/* 敌军行军类七种(Boss 另立注册表 data/bosses.ts):
   卒=基准 / 马=略快 / 车=最快但拐角歇整 / 象=慢速重甲
   / 砲=一炮定音(眩晕拆阵) / 士=Boss 近卫(护主链接)。
   水=水军抢滩兵(无限模式:楼船泊桥放下的登陆队)。
   出怪键「将」= Boss 类型:具体出场者由关卡 boss 字段查注册表 */
export const ENEMIES: Record<Exclude<EnemyType, '将'>, EnemyDef> = {
  '卒': { hp: 30,  spd: 100, gold: 1, dmg: 1, r: 30 },
  '马': { hp: 55,  spd: 120, gold: 1, dmg: 1, r: 32 },
  '车': { hp: 110, spd: 140, gold: 1, dmg: 1, r: 38, pause: 0.85 },
  '象': { hp: 220, spd: 80,  gold: 1, dmg: 1, r: 42 },
  '砲': { hp: 130, spd: 90,  gold: 1, dmg: 1, r: 36 },
  '士': { hp: 150, spd: 38,  gold: 1, dmg: 1, r: 30 },
  '水': { hp: 42,  spd: 100, gold: 1, dmg: 1, r: 28 },
};

/** 水军楼船(无限模式):航速 / 载员 / 泊位 / 下船节奏 */
export const NAVY = {
  spd: 95,               // 航速(px/s)
  squadBase: 6,          // 基础载员
  squadPerWave: 0.5,     // 每波 +0.5 人
  squadMax: 14,          // 载员上限
  interval: 1.0,         // 下船间隔(秒)
  dockOffset: 56,        // 泊位离桥心距离(px)
};

/** 无限模式:血战至帅陨落。强度 = 敌潮(时间)× 波次系数(线性+二次),
    后期二次项保证拖长局必然崩盘;赏粮缓涨勉强跟上通胀 */
export const ENDLESS = {
  hearts: 5,             // 帅血(马拉松局的容错)
  goldStart: 6,
  hpPerWave: 0.09,       // 每波血量线性成长
  hpQuadPerWave: 0.003,  // 每波二次成长(长局绞杀)
  spdPerWave: 0.005,     // 每波提速 0.5%
  spdCap: 0.4,           // 提速上限(+40%)
  goldPer6: 6,           // 每过 6 波,单位赏粮 +1
  gapBase: 8.2,          // 波间隔基准(秒)
  gapDecay: 0.32,        // 每波缩短
  gapMin: 3.0,           // 波间隔下限
  /* —— 后期「精兵化」(waves.ts applyElite):第 16 波起,杂卒逐步折算成精锐 ——
     为什么需要它:出怪构成有数量上限(卒 30/马 12/车 10/象 8/砲 7),
     ~30 波后构成彻底饱和,只剩血量系数在涨——纯血量成长是「海绵化」,
     打起来是同一波兵更能扛,不是「更强的军队」。改成把杂卒换成重兵:
     出怪总数不涨(不给玩家多送击杀粮、通胀不失控),血质与拆阵力上行。
     标定(每波血质总量,未乘系数):旧版饱和后恒 5330;
       第 20 波 +15% → 第 30 波 +30% → 第 40 波 +45% → 第 46 波起吃满 75% 换卒、封顶 +52%
       (且砲/象占比上升 = 拆阵与冲线威胁涨得比血质更快) */
  eliteFrom: 16,         // 精兵化闸门:第 16 波起(此前手感与旧版分毫不动)
  elitePerWave: 0.8,     // 每波多折算 0.8 个卒(16 波换 1 → 30 波换 12 → 40 波换 20)
  eliteMaxShare: 0.75,   // 最多换掉 75% 的杂卒(留垫刀炮灰:马蹄连杀/溅射都要靶子)
  /* —— 无限 Boss 跟坡(enemies.ts bossWaveRamp)——
     旧口径「Boss 只吃 endlessBoss 的 +55%/出场」在第 30 波后明显掉队:
     常规兵吃 waveMul 二次爬坡(50 波 ≈ ×12.6),Boss 还是线性(50 波 ≈ ×5.95)
     → 大考被常规波稀释。让 Boss 吃「半份」波次爬坡(与对战 lateMul 的用意一致:
     末段大考不被常规波稀释),50 波时 Boss ≈ ×40 基础血,重新成为大考 */
  bossRampShare: 0.5,
};

/** 局外经济(军饷):跨局持久(localStorage),军资集市消费。
    战役按通关犒赏(首通全饷/复通四成,防无脑刷);无限按活过波数计饷,
    大考波(5 的倍数)另加;对战胜局按活过波数计饷 + 额外犒赏 */
export const ECON = {
  clearBase: 10,         // 通关犒赏基值(L1 首通 = 10+2 = 12)
  clearPer: 2,           // 每加一关的犒赏加成(L10 首通 = 30)
  replayShare: 0.4,      // 复通关赏比例(向上取整;首通才是全饷)
  wavePay: 2,            // 无限:每活过 1 波 +2
  bossPay: 6,            // 无限:每活过一场大考(5 的倍数波)+6
  duelWin: 12,           // 对战:胜局额外犒赏(比谁活得久,赢了才算赢家)
};

/** 兵符:Boss 击杀掉「符片」,集片铸符(每兵种一枚、永久生效)。
    铸给基础兵种,由其成军的特殊军同享(马蹄符加成连环马);
    掉量随 Boss 深度递增——无限 25 波后的 Boss 多掉一片

    兵符不是纯数值,是机制(见 FU_MECH):破甲/连杀/灼烧/撞晕/
    沼泽/处决——彼此咬合成流派(破甲放大灼烧、沼泽困住给火烤) */
export const FU_DROP = {
  base: 1,               // 每次必掉(保底)
  extraChance: 0.45,     // 追加 1 片概率
  deepWave: 25,          // 无限模式打到该波后,Boss 追加 1 片
};

/** 兵符机制的数值参数(杠杆) */
export const FU_MECH = {
  breakArmor: { amp: 0.25, dur: 3 },            // 卒伍符:命中破甲——期间受伤 +25%,3 秒
  burnShell: { dps: 7, dur: 3, radius: 84 },    // 炮膛符:弹落处燃起 3 秒火场(0.5s 一跳)
  stunCharge: { dur: 1.2 },                     // 车辕符:冲阵撞中即晕 1.2 秒
  slowStomp: { dur: 6, radius: 112 },           // 相羽符:践踏留下 6 秒减速沼泽
  execute: { pct: 0.28 },                       // 士魂符:斩击对残血(≤28%)直接处决
  burnPulse: 0.5,                               // 灼烧脉冲间隔
};

/** 特殊军独门机制参数(data/specials.ts 的 mech 键 → 这里取值)。
 *  原则与兵符相同:特殊军不能只是「数值大的基础兵」——每军要有一眼可见的
 *  独门打法(玩家反馈「感觉不出和常规兵种的区别」)。羊角士的机制早已有之
 *  (殉国破围,enemies.ts 挡驾处),不在此表 */
export const SP_MECH = {
  ringHop:   { radius: 78, dmg: 0.35 },          // 连环马:每踏落点震荡余波(一踏一片)
  stunShell: { pause: 1.0 },                     // 担竿炮:重轰落地,溅到的敌人被砸停原地
  twinShell: { dmg: 0.5, splash: 0.8 },          // 巡河炮:一炮双落,次远目标补半力小弹
  fullSteam: { kb: 1.6 },                        // 骑河车:冲阵全速(不吃碾压减速),撞飞更狠
  pierce:    { dmg: 0.6, band: 46, depth: 130 }, // 过河兵:突刺贯穿,连带其身后一敌
  crushLand: { inner: 0.45, dmg: 2, kb: 2 },     // 飞相局:落点中心双倍碎击,全圈强推散
};

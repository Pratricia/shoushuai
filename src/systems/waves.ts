/* ============================================================
   波次调度:出怪编排 / 波间歇 / 过关流转
   ------------------------------------------------------------
   战役模式:波次编排来自 data/levels.ts 静态数据。
   无限模式:波次构成由 endlessWaveInfo(n) 程序生成——世代
   递进(马 3 起 / 车 6 起 / 象 9 起 / 砲 11 起)、数量与密度
   随波数爬坡;每 5 波一场 Boss(注册表轮换、按出场序强化);
   每 3 波(自第 4 波)水军楼船自河上来袭;第 16 波起「精兵化」
   (杂卒折算成精锐,见 applyElite)。永不结算,血战至帅陨落。
   ============================================================ */
import type { SpawnEvent, WaveGroup, BossDef } from '../types';
import { state } from '../state';
import { LEVELS } from '../data/levels';
import { BOSSES } from '../data/bosses';
import { ENDLESS, DUEL } from '../config';
import { spawnEnemy } from './enemies';
import { sendBoat } from './navy';
import { onWaveStart } from './items';
import { duelAutoBoat } from './duel';
import { awardCampaign } from '../save';

/** 开波:把该波各组展开为按时间排序的出怪事件表(组内 delay 实现「基础先涌、高级随后」);
 *  水军参战章(第 11 关起):本波有排船则同时派楼船(载员由关卡数据指定,不走无限公式) */
export function startWave(i: number): void {
  state.waveIdx = i;
  const level = LEVELS[state.level - 1];
  const groups = level.waves[i];
  const ev: SpawnEvent[] = [];
  for (const g of groups) for (let k = 0; k < g.n; k++) ev.push({ t: g.t, at: 0.4 + (g.delay ?? 0) + k * g.gap });
  ev.sort((a, b) => a.at - b.at);
  state.waveEvents = ev;
  state.waveT = 0;
  onWaveStart();   // 被动军械:屯粮车/金钟罩/垦荒令按波结算
  if (level.navy) {
    let k = 0;
    for (const nv of level.navy) if (nv.at === i) { sendBoat(1, 3 + k * 7, k, nv.squad); k++; }
  }
}

/** 过关:停留结算页,由玩家选择「下一关」或「返回主菜单」;全关全通直接进通关页。
 *  同时发军饷(首通全饷、复通四成),结算页展示数额与缘由 */
export function levelClear(): void {
  const { n, first } = awardCampaign(state.level);
  state.moneyGain = n;
  state.moneyNote = first ? '首通犒赏' : '复通犒赏';
  state.screen = state.level >= LEVELS.length ? 'win' : 'clear';
}

/** 波次推进:连续出兵——当前波出完即按关卡 gap 进下一波,不等场上清空;
 *  最后一波出兵完毕且场上清空才过关。gap=0 的关卡是全程无缝洪流。 */
export function updateWaves(dt: number): void {
  if (state.mode !== 'campaign') { updateWavesEndless(dt); return; }
  const level = LEVELS[state.level - 1];
  if (state.interWave > 0) {
    state.interWave -= dt;
    if (state.interWave <= 0) startWave(state.waveIdx + 1);
    return;
  }
  state.waveT += dt;
  while (state.waveEvents.length && state.waveEvents[0].at <= state.waveT) {
    spawnEnemy(state.waveEvents.shift()!.t);
  }
  if (state.waveEvents.length > 0) return;
  if (state.waveIdx >= level.waves.length - 1) {
    // 最后一波出完:等场上清空即过关
    if (state.enemies.length === 0) levelClear();
  } else if (level.gap > 0) {
    state.interWave = level.gap;
  } else {
    startWave(state.waveIdx + 1);
  }
}

/* ---------- 无限模式 ---------- */

/** 无限模式波次构成(纯数据生成,HUD 预览与开波共用同一份) */
export interface EndlessWaveInfo { groups: WaveGroup[]; navy: number; boss: boolean; }

const w = (t: WaveGroup['t'], n: number, gap: number, delay = 0): WaveGroup => ({ t, n, gap, delay });
/** 数量折算:向上限收敛 + 可按 scale 打折(对战单人单路时 scale < 1) */
const cap = (v: number, m: number, scale = 1): number => Math.min(Math.max(0, Math.round(v * scale)), m);

/** 后期「精兵化」(仅无限模式;对战波压由 DUEL 的 hpMul/lateMul 承担,不掺这份):
 *  第 eliteFrom 波起,每波把更多杂卒折算成精锐(象/车/砲/马 按 40/25/20/15 分账、象吃尾差)。
 *  出怪总数不涨——不给玩家多送击杀粮;血质与拆阵威胁随波上行:后期加压靠「质」不靠「量」。
 *  在 groups 组好之后统一折算,HUD 预览与实发自然同一份 */
function applyElite(g: WaveGroup[], n: number): void {
  if (state.mode !== 'endless' || n < ENDLESS.eliteFrom) return;
  const zu = g.find(gr => gr.t === '卒');
  if (!zu) return;
  // 换卒上限:基础 75%,深波(eliteDeepFrom 起)每波 +0.8pt、至 92% 封顶——构成不封冻
  const share = Math.min(ENDLESS.eliteDeepCap,
    ENDLESS.eliteMaxShare + Math.max(0, n - ENDLESS.eliteDeepFrom) * ENDLESS.eliteDeepStep);
  const conv = Math.min(
    Math.round((n - ENDLESS.eliteFrom + 1) * ENDLESS.elitePerWave),
    Math.floor(zu.n * share),
  );
  if (conv <= 0) return;
  zu.n -= conv;
  const add: [WaveGroup['t'], number][] = [
    ['象', conv - Math.floor(conv * 0.25) - Math.floor(conv * 0.2) - Math.floor(conv * 0.15)],
    ['车', Math.floor(conv * 0.25)],
    ['砲', Math.floor(conv * 0.2)],
    ['马', Math.floor(conv * 0.15)],
  ];
  for (const [t, k] of add) {
    if (k <= 0) continue;
    const gr = g.find(x => x.t === t);
    if (gr) gr.n += k;
    else g.push(w(t, k, 2.4, 4));   // 兜底(eliteFrom 晚于各兵种解锁波,正常走不到)
  }
}

/** 无限波次构成(纯数据生成;HUD 预览与开波共用同一份)。
 *  scale 供对战模式折算单路出怪量(默认 1 = 无限模式原样) */
export function endlessWaveInfo(n: number, scale = 1): EndlessWaveInfo {
  const boss = n % 5 === 0;
  // 水军:第 4 波起每 3 波一发(Boss 波不混船);第 10 波起双船、22 起三船
  const navy = boss || n < 4 || n % 3 !== 1 ? 0 : n >= 22 ? 3 : n >= 10 ? 2 : 1;
  const g: WaveGroup[] = [];
  if (boss) {
    // Boss 波:卫队仪仗开道、将压轴,其余兵种减量陪衬(将不折损)
    g.push(w('卒', cap(6 + n * 0.5, 16, scale), 0.65));
    g.push(w('马', cap(2 + n * 0.2, 8, scale), 2.0, 3));
    if (n >= 10) g.push(w('车', cap(n * 0.25, 6, scale), 3.6, 6));
    g.push(w('士', cap(2, 2, scale), 1.6, 7));
    // 将位数量随 Boss 而定(双车错 count=2,两骑错路压上)
    const ids = Object.keys(BOSSES);
    const bd = BOSSES[ids[(n / 5 - 1) % ids.length]];
    g.push(w('将', bd.count ?? 1, 0.6, 9));
    return { groups: g, navy, boss };
  }
  const navyRelief = navy > 0 ? 0.7 : 1;   // 水军波:本地出怪减量,压力让给楼船
  g.push(w('卒', cap((8 + n * 1.1) * navyRelief, 30, scale), Math.max(0.45, 0.85 - n * 0.015)));
  if (n >= 3) g.push(w('马', cap((2 + n * 0.45) * navyRelief, 12, scale), Math.max(0.9, 1.7 - n * 0.04), 3));
  if (n >= 6) g.push(w('车', cap(1 + n * 0.35, 10, scale), Math.max(1.6, 3.4 - n * 0.08), 5));
  if (n >= 9) g.push(w('象', cap(1 + n * 0.25, 8, scale), 4.6, 6));
  if (n >= 11) g.push(w('砲', cap(1 + n * 0.22, 7, scale), 5.0, 7));
  applyElite(g, n);
  return { groups: g, navy, boss };
}

/** 无限模式 Boss:注册表按出场序轮换(未来新 Boss 自动加入轮换);
 *  血量/赏粮按出场次序递增,免疫数值与技能照搬原定义 */
function endlessBoss(n: number): BossDef {
  const ids = Object.keys(BOSSES);
  const bi = n / 5 - 1;                     // 第几位 Boss(0 基)
  const base = BOSSES[ids[bi % ids.length]];
  return { ...base, hp: base.hp * (1 + 0.55 * bi), gold: 25 + 15 * bi };
}

/** 无限模式波间隔:随波数收紧至下限(前期留布阵思考,后期逼近洪流) */
function endlessGap(n: number): number {
  return Math.max(ENDLESS.gapMin, ENDLESS.gapBase - ENDLESS.gapDecay * (n - 1));
}

/** 无限模式开波:展开出怪事件 + Boss 波换将 + 水军波派船 */
function startEndlessWave(i: number): void {
  state.waveIdx = i;
  const n = i + 1;
  // 对战:单人单路(一条行军道),出怪量按单路密度折算,免得同波敌人在唯一的路口挤成洪峰
  const info = endlessWaveInfo(n, state.mode === 'duel' ? DUEL.unitMul : 1);
  const ev: SpawnEvent[] = [];
  for (const g of info.groups) for (let k = 0; k < g.n; k++) ev.push({ t: g.t, at: 0.4 + (g.delay ?? 0) + k * g.gap });
  ev.sort((a, b) => a.at - b.at);
  state.waveEvents = ev;
  state.waveT = 0;
  onWaveStart();   // 被动军械按波结算(无限模式同样生效)
  if (info.boss) state.boss = endlessBoss(n);
  if (state.mode === 'duel') {
    // 对战:每波只给我方棋盘加一次 AI 军饷/派船逻辑(两块棋盘共享同一波次表)
    if (state.side === 'rival') state.gold += DUEL.aiGoldBonus;
    else if (n % DUEL.autoBoatWave === 0) duelAutoBoat(n);
  } else {
    for (let k = 0; k < info.navy; k++) sendBoat(n, 3 + k * 7, k);
  }
}

/** 无限模式波次推进:结构同战役(波出完按 gap 进下一波,不等清场),
 *  但永远没有「最后一波」——帅陨落(marchEnemies 置 over)是唯一结局 */
function updateWavesEndless(dt: number): void {
  if (state.interWave > 0) {
    state.interWave -= dt;
    if (state.interWave <= 0) startEndlessWave(state.waveIdx + 1);
    return;
  }
  state.waveT += dt;
  while (state.waveEvents.length && state.waveEvents[0].at <= state.waveT) {
    spawnEnemy(state.waveEvents.shift()!.t);
  }
  if (state.waveEvents.length > 0) return;
  state.interWave = endlessGap(state.waveIdx + 2);
}

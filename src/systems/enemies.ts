/* ============================================================
   敌军系统:出怪 + 沿路径行军(抵达帅即砍帅)+ Boss 主动技能
   ============================================================ */
import type { Enemy, EnemyType, Piece, BossDef, Point } from '../types';
import { state, cellCenter } from '../state';
import { ENEMIES, SHELL, TIDE, ENDLESS, DUEL } from '../config';
import { findSkill, immuneSacrifice, slowImmune, rageMul, airborne } from './skills';
import { rand, dist, clamp } from './geometry';
import { addEffect, addFloat, damageEnemy } from './combat';
import { specialKeys } from './fusion';
import { pieceStats } from './pieces';
import { isTile } from '../data/specials';
import { awardEndless } from '../save';

/** 无限模式波次强度系数(参数为 0 基波次号;战役模式恒乘 1):
    线性 + 二次爬坡——前期缓涨、长局必然崩盘,血战至帅陨落。
    对战模式 = 同一坡再乘 DUEL.hpMul,并整体乘「战事升级」系数 lateMul(w0)(见下) */
export function waveMul(w0: number): number {
  const ramp = 1 + ENDLESS.hpPerWave * w0 + ENDLESS.hpQuadPerWave * w0 * w0;
  return state.mode === 'duel' ? (1 + (ramp - 1) * DUEL.hpMul) * lateMul(w0) : ramp;
}

/** 对战专属「战事升级」(相对系数,1 = 不加):**第 7 波起**才开张、逐波抬眼。
 *  前 6 波恒为 1——开局手感与旧版分毫不差;第 7 波起线性 +3%/波(当场就比第 6 波硬),
 *  再叠二次项越拖越紧,后期不再有「守住了就一直守住」的平台期。
 *  Boss 走同一条系数(见 spawnEnemy),免得末段常规波涨得太凶、把「大考」相对压成小菜。
 *  仍然只动血量爬坡项、双方完全对称:不改任何机制、不给某一边额外数值 */
export function lateMul(w0: number): number {
  if (state.mode !== 'duel') return 1;
  const over = Math.max(0, w0 - DUEL.lateFrom);      // 第 7 波(0 基 6)起计入
  return 1 + DUEL.latePerWave * over + DUEL.lateQuad * over * over;
}

/** 无限模式波次提速系数(封顶 +40%):敌潮渐急,同兵种越走越快 */
export function waveSpdMul(w0: number): number {
  return 1 + Math.min(ENDLESS.spdCap, ENDLESS.spdPerWave * w0);
}

/** 出怪:随机选一条路线;成长 = 关卡间(血+15%/关、速+2%/关)× 关内敌潮(随 levelT 线性,Boss 除外)
 *  无限模式再叠乘波次系数(血量线性+二次 / 提速封顶),赏粮随波数缓涨
 *  「将」= Boss 类型:数值与技能取本关解析的 BossDef(state.boss) */
export function spawnEnemy(type: EnemyType): void {
  const isBoss = type === '将';
  const bd: BossDef | null = isBoss ? state.boss : null;
  if (isBoss && !bd) throw new Error('本关未配置 Boss,却请求生成「将」');
  const def: Pick<BossDef, 'hp' | 'spd' | 'gold' | 'dmg' | 'r'> =
    type === '将' ? bd! : ENEMIES[type];
  const endless = state.mode !== 'campaign';
  const w0 = endless ? Math.max(0, state.waveIdx) : 0;
  const tide = isBoss ? 1 : 1 + TIDE.hpPerSec * state.levelT;      // Boss 不吃敌潮(数值手调)
  const tideSpd = isBoss ? 1 : 1 + TIDE.spdPerSec * state.levelT;
  // Boss 也不吃波次系数——无限模式 Boss 强化全部由 endlessBoss 克隆定义承担;
  // 但「战事升级」段(第 7 波起)是通用加压, Boss 也一并跟上,免得末段大考反成小菜
  const hpMul = (1 + 0.15 * (state.level - 1)) * tide * (isBoss ? lateMul(w0) : waveMul(w0));
  const spdMul = (1 + 0.02 * (state.level - 1)) * tideSpd * (isBoss ? 1 : waveSpdMul(w0));
  const gold = def.gold + (endless && !isBoss ? Math.floor(w0 / ENDLESS.goldPer6) : 0);
  let path = state.paths[Math.floor(Math.random() * state.paths.length)];
  // 双车错:后出的那骑刻意换一条路(两路齐错);路线用尽才允许同行
  if (bd && (bd.count ?? 1) > 1) {
    const taken = state.enemies.filter(o => !o.dead && o.boss && o.boss.id === bd.id).map(o => o.path);
    const fresh = state.paths.filter(p => !taken.includes(p));
    if (fresh.length) path = fresh[Math.floor(Math.random() * fresh.length)];
  }
  const x = path[0].x + rand(-10, 10);
  state.enemies.push({
    type, x, y: path[0].y,
    hp: def.hp * hpMul, maxHp: def.hp * hpMul,
    spd: def.spd * spdMul, slowT: 0, kbT: 0, armorBreakT: 0, walkPh: Math.random() * Math.PI * 2,
    pauseT: 0, dead: false,
    aimT: 0, aimX: 0, aimY: 0, shotDone: false, tide,
    r: def.r, gold, dmg: def.dmg, boss: bd,
    path, wpi: 1,
  });
  if (bd) {
    // 出阵仪式:楚河汉界拉告示横幅(来将何人、什么路数)+ 出生点金环冲击
    state.bossBanner = { name: bd.name, title: bd.title, t: 3.4 };
    addEffect(path[0].x, path[0].y, 'stomp', 110);
    addFloat(x, path[0].y - 60, bd.name + ' 出阵!', '#a93226', 24);
  }
  // 敌潮首触:第一只强化敌军出场时提示一次
  if (!state.tideTold && tide >= TIDE.mark) {
    state.tideTold = true;
    addFloat(path[0].x, path[0].y - 44, '敌潮渐涨 · 来敌强化', '#a93226', 20);
  }
}

/* ---------- Boss 主动技能(tickBoss 逐帧驱动) ---------- */

/** 沿路径前推 dpx,返回落点与新的路点索引(不改本体) */
function advancePath(e: Enemy, dpx: number): { x: number; y: number; wpi: number } {
  let x = e.x, y = e.y, wpi = e.wpi, d = dpx;
  while (d > 0 && wpi < e.path.length) {
    const wp = e.path[wpi];
    const dd = dist(x, y, wp.x, wp.y);
    if (dd <= d) { x = wp.x; y = wp.y; d -= dd; wpi++; }
    else {
      x += (wp.x - x) / dd * d;
      y += (wp.y - y) / dd * d;
      d = 0;
    }
  }
  return { x, y, wpi };
}

/** 距终点的剩余路程(px) */
function remainingPath(e: Enemy): number {
  let d = 0, x = e.x, y = e.y;
  for (let i = e.wpi; i < e.path.length; i++) {
    d += dist(x, y, e.path[i].x, e.path[i].y);
    x = e.path[i].x;
    y = e.path[i].y;
  }
  return d;
}

/** 架炮落点:trigger 射程内最密集的棋子阵(砲一炮定音与当头炮中宫炮共用;双格军只算一次) */
function findCluster(ex: number, ey: number, trigger: number, clusterR: number): { x: number; y: number } | null {
  const pieces: { x: number; y: number }[] = [];
  for (const [k, p] of state.grid) {
    if (k !== p.c + ',' + p.r) continue;              // 特殊军双格登记去重
    const cc = cellCenter(p.c, p.r);
    if (dist(ex, ey, cc.x, cc.y) <= trigger) pieces.push(cc);
  }
  let best: { x: number; y: number; n: number } | null = null;
  for (const cc of pieces) {
    let n = 0;
    for (const qc of pieces) if (dist(cc.x, cc.y, qc.x, qc.y) <= clusterR) n++;
    if (!best || n > best.n) best = { x: cc.x, y: cc.y, n };
  }
  return best ? { x: best.x, y: best.y } : null;
}

/** 落地眩晕:圈内棋子停手并打断冲阵/连跳(砲巨弹与 Boss 落地共用;双格军只晕一次) */
function stunPieces(x: number, y: number, r: number, stun: number): void {
  for (const [k, p] of state.grid) {
    if (k !== p.c + ',' + p.r) continue;              // 特殊军双格登记去重
    const cc = cellCenter(p.c, p.r);
    if (dist(cc.x, cc.y, x, y) > r) continue;
    p.stunT = Math.max(p.stunT ?? 0, stun);
    p.charge = null;
    p.jump = null;
    addFloat(cc.x, cc.y - 44, '晕', '#5c677d', 20);
  }
}

/** 召唤:在 Boss 身边落一兵,沿 Boss 剩余路线继续行军(十面埋伏) */
function spawnMinionAt(e: Enemy, type: EnemyType): void {
  const rest = e.path.slice(e.wpi);
  if (rest.length === 0) return;                      // 路将走完,不再埋伏
  const def = ENEMIES[type as Exclude<EnemyType, '将'>];
  const w0 = state.mode !== 'campaign' ? Math.max(0, state.waveIdx) : 0;
  const tide = 1 + TIDE.hpPerSec * state.levelT;
  const hpMul = (1 + 0.15 * (state.level - 1)) * tide * waveMul(w0);
  const a = rand(0, Math.PI * 2);
  const x = clamp(e.x + Math.cos(a) * (e.r + 30), 40, 680);
  const y = Math.max(120, e.y + Math.sin(a) * (e.r + 16));
  const path: Point[] = [{ x, y }, ...rest];
  state.enemies.push({
    type, x, y,
    hp: def.hp * hpMul, maxHp: def.hp * hpMul,
    spd: def.spd * (1 + 0.02 * (state.level - 1)) * waveSpdMul(w0),
    slowT: 0, kbT: 0, armorBreakT: 0, walkPh: rand(0, Math.PI * 2), pauseT: 0, dead: false,
    aimT: 0, aimX: 0, aimY: 0, shotDone: false, tide,
    r: def.r, gold: def.gold, dmg: def.dmg, boss: null,
    path, wpi: 1,
  });
  addEffect(x, y, 'dust', 20);
}

/** Boss 主动技能逐帧:腾空/冲刺推进(冻结常规行军)+ 冷却触发 + 血门召唤
 *  被动技能(免疫/减伤/狂奔)由 combat / marchEnemies 在结算时查询 */
function tickBoss(e: Enemy, dt: number): void {
  if (!e.boss) return;
  // —— 进行态:位置沿 起点→落点 插值,腾空画弧(渲染层读 act) ——
  const act = e.act;
  if (act) {
    act.t += dt;
    const k = clamp(act.t / act.dur, 0, 1);
    e.x = act.fx + (act.tx - act.fx) * k;
    e.y = act.fy + (act.ty - act.fy) * k;
    if (k >= 1) {
      const sk = findSkill(e, act.kind === 'leap' ? 'leap' : 'dash');
      if (act.kind === 'leap') {
        addFloat(e.x, e.y - 64, '卧槽!', '#a93226', 24);
      } else {
        addFloat(e.x, e.y - 64, '平推!', '#a93226', 20);
      }
      if (sk) {
        stunPieces(e.x, e.y, sk.stunR, sk.stun);
        addEffect(e.x, e.y, 'stomp', sk.stunR * 0.8);
        addEffect(e.x, e.y + 14, 'dust', 30);
      }
      e.act = null;
    }
    return;
  }
  // —— 冷却触发:卧槽马 / 铁滑车(腾空或地面冲刺) ——
  const mv = findSkill(e, 'leap') ?? findSkill(e, 'dash');
  if (mv) {
    if (e.cdT === undefined) e.cdT = 3.2;             // 出阵后首发的缓冲
    e.cdT -= dt;
    if (e.cdT <= 0) {
      const dist2 = Math.min(mv.dist, remainingPath(e) - 80);
      if (dist2 > 60) {
        const land = advancePath(e, dist2);
        e.act = {
          kind: findSkill(e, 'leap') ? 'leap' : 'dash',
          t: 0, dur: findSkill(e, 'leap') ? 0.55 : 0.42,
          fx: e.x, fy: e.y, tx: land.x, ty: land.y,
        };
        e.wpi = land.wpi;                             // 路点直推到落点,落地后从那里继续行军
        addEffect(e.x, e.y, 'dust', 18);
      }
      e.cdT = mv.cd;
    }
  }
  // —— 冷却触发:当头炮(中宫炮,落点锁最密集阵地;蓄力走通用 aimT 通道) ——
  const bom = findSkill(e, 'bombard');
  if (bom && !mv && e.aimT === 0) {
    if (e.cdT === undefined) e.cdT = 4.0;
    e.cdT -= dt;
    if (e.cdT <= 0) {
      const c = findCluster(e.x, e.y, 900, bom.radius);
      if (c) {
        e.aimT = SHELL.aim;
        e.aimX = c.x;
        e.aimY = c.y;
        addFloat(e.x, e.y - e.r - 16, '架炮!', '#a93226', 18);
      }
      e.cdT = bom.cd;
    }
  }
  // —— 血门召唤:楚霸王「十面埋伏」(血量逐档过门,每档召一波伏兵) ——
  const su = findSkill(e, 'summon');
  if (su) {
    const done = e.sumWaves ?? 0;
    if (done < su.hpGate.length && e.hp / e.maxHp <= su.hpGate[done]) {
      for (let i = 0; i < su.n; i++) spawnMinionAt(e, su.minion);
      e.sumWaves = done + 1;
      addEffect(e.x, e.y, 'slash', 100);
      addFloat(e.x, e.y - 76, '十面埋伏!', '#a93226', 24);
    }
  }
  // —— 血门狂奔:过河卒(阈值只播报一次,红环由渲染层常驻) ——
  const rg = findSkill(e, 'rage');
  if (rg && !e.raged && e.hp / e.maxHp <= rg.threshold) {
    e.raged = true;
    addFloat(e.x, e.y - 64, '过河卒子,当车用!', '#a93226', 22);
    addEffect(e.x, e.y, 'dust', 30);
  }
  // —— 一子定栓:铁门栓(锁射程内火力最猛的棋子;把子挪出射程即解) ——
  const bl = findSkill(e, 'bolt');
  if (bl) {
    if (e.cdT === undefined) e.cdT = 3.5;              // 出阵后首发的缓冲
    e.cdT -= dt;
    if (e.cdT <= 0) {
      let best: Piece | null = null;
      let bestD = -1;
      for (const [k, p] of state.grid) {
        if (k !== p.c + ',' + p.r || isTile(p.type)) continue;   // 双格登记去重;字牌不是战力,不栓
        const cc = cellCenter(p.c, p.r);
        if (dist(e.x, e.y, cc.x, cc.y) > bl.range) continue;
        // 已晕的几乎不算数(重复锁同一枚是浪费),其余按火力取最猛
        const d = pieceStats(p).dmg * ((p.stunT ?? 0) > 0 ? 0.01 : 1);
        if (d > bestD) { bestD = d; best = p; }
      }
      if (best) {
        best.stunT = Math.max(best.stunT ?? 0, bl.stun);
        best.charge = null;
        best.jump = null;
        e.boltP = best;
        const cc = cellCenter(best.c, best.r);
        addFloat(e.x, e.y - e.r - 18, '铁门栓!', '#a93226', 22);
        addFloat(cc.x, cc.y - 44, '栓!', '#5c677d', 20);
        addEffect(cc.x, cc.y, 'slash', 60);
      }
      e.cdT = bl.cd;
    }
  }
  // —— 错车:双车错(搭档阵亡即「孤车死斗」,大幅提速) ——
  const tw = findSkill(e, 'twin');
  if (tw && !e.twRaged) {
    const partner = state.enemies.find(o => o !== e && !o.dead && o.boss && o.boss.id === e.boss!.id);
    if (!partner) {
      e.twRaged = true;
      e.spd = Math.round(e.spd * 1.5);
      addFloat(e.x, e.y - 64, '孤车死斗!', '#a93226', 24);
      addEffect(e.x, e.y, 'dust', 34);
    }
  }
}

/** 行军:减速 / 击退免疫 / 车拐角歇整 + 沿路点推进 + 抵达终点结算 */
export function marchEnemies(dt: number): void {
  const shuai = state.map.shuai;
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (e.boss) tickBoss(e, dt);   // Boss 主动技能(腾空/冲刺中常规行军冻结)
    if (e.act) continue;
    const sf = e.slowT > 0 && !slowImmune(e) ? 0.55 : 1;
    e.slowT = Math.max(0, e.slowT - dt);
    e.kbT = Math.max(0, e.kbT - dt);
    e.armorBreakT = Math.max(0, e.armorBreakT - dt);   // 兵符·破甲倒数
    // 砲·一炮定音:340px 内出现棋子阵 → 停车架炮(一生一次),落点锁定最密集处
    if (e.type === '砲' && !e.shotDone && e.aimT === 0) {
      const c = findCluster(e.x, e.y, SHELL.trigger, SHELL.radius);
      if (c) {
        e.aimT = SHELL.aim;
        e.aimX = c.x;
        e.aimY = c.y;
        addFloat(e.x, e.y - e.r - 14, '架炮!', '#a93226', 18);
      }
    }
    // 蓄力(砲/当头炮):原地不动;蓄满射出巨弹(参数取技能,砲用缺省)
    if (e.aimT > 0) {
      e.aimT -= dt;
      if (e.aimT <= 0) {
        e.aimT = 0;
        e.shotDone = true;
        const bom = findSkill(e, 'bombard');
        state.shells.push({
          x: e.x, y: e.y - 12, tx: e.aimX, ty: e.aimY, t: 0, dur: SHELL.flight,
          radius: bom ? bom.radius : undefined,
          stun: bom ? bom.stun : undefined,
        });
        addEffect(e.x, e.y, 'shot', 22);
      }
      continue;
    }
    if (e.pauseT > 0) { e.pauseT -= dt; continue; }   // 车:歇整中,原地不动
    const ox = e.x, oy = e.y;
    let step = e.spd * sf * rageMul(e) * dt;
    while (step > 0 && e.wpi < e.path.length) {
      const wp = e.path[e.wpi];
      const d = dist(e.x, e.y, wp.x, wp.y);
      if (d <= step) {
        e.x = wp.x; e.y = wp.y; step -= d; e.wpi++;
        // 拐角判定:刚抵达的路点,来向与去向不共线 → 车需原地歇整再转向
        const pd = e.type === '将' ? undefined : ENEMIES[e.type as Exclude<EnemyType, '将'>].pause;
        if (pd && e.wpi >= 2 && e.wpi < e.path.length) {
          const a = e.path[e.wpi - 2], b = e.path[e.wpi - 1], c = e.path[e.wpi];
          const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
          if (Math.abs(cross) > 1) { e.pauseT = pd; break; }
        }
      }
      else { e.x += (wp.x - e.x) / d * step; e.y += (wp.y - e.y) / d * step; step = 0; }
    }
    // 行军步态:按实际位移推进相位(一个步态周期 ≈ 26+体格半径 px;
    // 减速自然放慢脚步,歇整/架炮原地不动时相位冻结——不再纯平移)
    e.walkPh += dist(ox, oy, e.x, e.y) / (26 + e.r * 0.6);
    if (e.wpi >= e.path.length) {
      e.dead = true;
      // 仕·舍身挡驾:宫内仕与来敌同归于尽,帅血免扣(免疫此技能的 Boss 必须硬杀)
      if (!immuneSacrifice(e)) {
        let guardPiece: Piece | null = null;
        for (const p of state.grid.values()) {
          if (p.type === '仕' && state.palace.has(p.c + ',' + p.r)) { guardPiece = p; break; }
        }
        if (guardPiece) {
          for (const gk of specialKeys(guardPiece)) state.grid.delete(gk);   // 双格军两键一并殉国
          const gc = cellCenter(guardPiece.c, guardPiece.r);
          addEffect(gc.x, gc.y, 'slash', 80);
          addEffect(e.x, e.y, 'death', 30);
          addFloat(shuai.x, shuai.y - 50, '舍身护驾!', '#f9a825', 26);
          addFloat(gc.x, gc.y - 42, '仕 · 殉国', '#a93226', 20);
          /* 羊角士·殉国破围:双角之势,殉国一击连带重伤帅前之敌
             (临宫 150px 内的行军敌军吃 70 伤 + 减速——两张牌的保险升级) */
          if (guardPiece.tag) {
            let n = 0;
            for (const en of state.enemies) {
              if (en === e || en.dead || airborne(en)) continue;
              if (dist(en.x, en.y, shuai.x, shuai.y) <= 150) { damageEnemy(en, 70, 1.5, null); n++; }
            }
            if (n > 0) {
              addEffect(shuai.x, shuai.y, 'stomp', 150);
              addFloat(shuai.x, shuai.y - 80, '羊角双殉 ×' + n, '#a93226', 22);
            }
          }
          continue;
        }
      }
      state.hearts -= e.dmg;
      addEffect(shuai.x, shuai.y - 6, 'palace', 0);
      addFloat(shuai.x, shuai.y - 50, '-' + e.dmg, '#a93226', 26);
      if (state.hearts <= 0) {
        state.hearts = 0;
        // 无限模式殉局发饷:按活过波次计(大考波另加);战役重试不计饷
        if (state.mode === 'endless') {
          state.moneyGain = awardEndless(Math.max(0, state.waveIdx));
          state.moneyNote = '血战 ' + Math.max(0, state.waveIdx) + ' 波';
        }
        state.screen = 'over';
      }
    }
  }
}

/** 巨弹推进:落地眩晕圈内棋子(冲阵/连跳被打断);半径/时长按弹自参数 */
export function updateShells(dt: number): void {
  for (const sh of state.shells) {
    sh.t += dt;
    if (sh.t < sh.dur) continue;
    sh.done = true;
    const radius = sh.radius ?? SHELL.radius;
    const stun = sh.stun ?? SHELL.stun;
    addEffect(sh.tx, sh.ty, 'boom', radius * 0.62);
    addEffect(sh.tx, sh.ty, 'dust', 34);
    addFloat(sh.tx, sh.ty - 60, '轰!', '#a93226', 32);
    for (const [k, p] of state.grid) {
      if (k !== p.c + ',' + p.r) continue;            // 特殊军双格登记去重
      const cc = cellCenter(p.c, p.r);
      if (dist(cc.x, cc.y, sh.tx, sh.ty) > radius) continue;
      p.stunT = Math.max(p.stunT ?? 0, stun);
      p.charge = null;
      p.jump = null;
      addFloat(cc.x, cc.y - 44, '晕', '#5c677d', 20);
    }
  }
  state.shells = state.shells.filter(s => !s.done);
}

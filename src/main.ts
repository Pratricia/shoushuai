/* ============================================================
   入口:画布初始化、主循环(update / render 编排)、调试钩子
   ============================================================ */
import { canvas, ctx, view, resize } from './canvas';
import { state, duel, setBoard, setupLevel, setupEndless, setupDuel } from './state';
import { updateWaves } from './systems/waves';
import { marchEnemies, spawnEnemy, updateShells } from './systems/enemies';
import { updateBoats, sendBoat } from './systems/navy';
import { updatePieces, updateProjectiles } from './systems/pieces';
import { updateTimers, updateToast, damageEnemy, updateZones } from './systems/combat';
import { tryDraft } from './systems/economy';
import { useGear, drumRate, speedRate, tickGear, onWaveStart, onGroundOpened } from './systems/items';
import { updateDuel, duelManualBoat, duelFieldCount } from './systems/duel';
import { saveData, awardCampaign, awardEndless, awardDuel, resetSave, bagList, bagActiveCount, passiveList, passiveCarryCount, passiveOwnedCount, carriesGear,
  ownsGear, inBag, unlockGear, equipGear, unequipGear, equipPassive, unequipPassive, addShards, craftFu, fuOf,
  duelRankState, recordDuelWin, recordDuelLoss } from './save';
import { GEAR } from './data/shop';
import { RANKS, rankAt, rankTitle, advanceRank, winsToPromote, levelCn } from './data/ranks';
import { AI_PRESETS } from './data/ai';
import { DUEL, ENDLESS, KEN, ECON, GEAR_BAG } from './config';
import { LEVELS } from './data/levels';
import { handleDown, endDrag, cycleSpeed, installInput, shopPointerMove, shopPointerUp } from './input';
import { drawBoard, drawGridCells, drawGates, drawPalace } from './render/board';
import { drawShuai, drawBarracks, drawHUD, drawBag } from './render/hud';
import { drawDuelHud } from './render/duel';
import { drawMenuBg } from './render/menuBg';
import {
  drawEnemies, drawPieces, drawProjectiles, drawShells, drawEffects,
  drawFloats, drawToast, drawDrag, drawBoats, drawBossBanner, drawZones,
} from './render/units';
import { drawOverlays, scrollShop, getShopScroll, getShopListRect, resetShopScroll } from './render/overlays';

/** 单块棋盘的一帧推进(普通模式直接用;对战模式两块棋盘各调一次) */
function updateBoard(dt: number): void {
  state.levelT += dt;      // 关内游戏时间:敌潮成长的自变量(倍速下同步加速)
  updateWaves(dt);
  updateBoats(dt);
  marchEnemies(dt);
  updatePieces(dt);
  updateProjectiles(dt);
  updateShells(dt);
  updateZones(dt);      // 兵符区域:灼烧脉冲 / 沼泽续减速
  tickGear(dt);         // 主动军械:冷却推进
  state.enemies = state.enemies.filter(e => !e.dead);
  // Boss 出阵告示横幅倒计时(纯展示,随倍速同步)
  if (state.bossBanner) {
    state.bossBanner.t -= dt;
    if (state.bossBanner.t <= 0) state.bossBanner = null;
  }
  updateTimers(dt);
}

/** 主更新:对战模式驱动两块棋盘 + 对方 AI;普通模式单棋盘 */
function update(dt: number): void {
  if (duel.on && !duel.over) { updateDuel(dt, updateBoard); return; }
  updateBoard(dt);
}

/** 对战渲染:共享底图与城楼先画好,两块棋盘的实体各画一遍(对方半场 + 我方半场) */
function renderDuel(): void {
  setBoard(duel.player);       // 静态层用哪块棋盘都一样(两块共用同一张镜像竞技场 map)
  drawBoard();                 // 静态底图:两半台地 + 中央楚河汉界 + 两座帅台
  drawGates();                 // 四座出怪口城楼(两条路线共用;先落地,好让双方棋子都压在它之上)
  // 对方半场:荒地封印 → 地面装饰 → 帅台 → 楼船/敌军 → 棋子与飞行物
  setBoard(duel.rival);
  drawGridCells(0, 4);         // 对方半场的荒地封印(它也在逐波垦荒,看得见「荒」在减少)
  drawZones();
  drawShuai();                 // 对方帅(副帅台上,帅血在其下)
  drawBoats();
  drawEnemies();
  drawPieces();                // 对方布下的棋子(含成军的字牌)
  drawProjectiles();
  drawShells();
  drawEffects();
  drawFloats();
  // 我方半场:荒地封印 → 宫区 → 地面装饰 → 帅台 → 楼船/敌军 → 告示 → 棋子与飞行物
  setBoard(duel.player);
  drawGridCells(5, 9);         // 我方半场的荒地封印(对方半场同样画,见上)
  drawPalace();
  drawZones();
  drawShuai();
  drawBoats();
  drawEnemies();
  drawBossBanner();            // Boss 出阵告示(以中央楚河为舞台,双方共见)
  drawPieces();
  drawProjectiles();
  drawShells();
  drawEffects();
  drawFloats();
  drawDuelHud();
  drawBarracks();
  drawBag();
  drawToast();
  drawDrag();
  drawOverlays();
}

/** 主渲染:自底向上,uiButtons 每帧重建供输入命中测试 */
function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#141210';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);
  state.uiButtons.length = 0;
  // 主菜单/选关/集市:暮色楚汉山水背景(不再显示棋盘)
  if (state.screen === 'menu' || state.screen === 'start' || state.screen === 'shop') {
    drawMenuBg();
    drawOverlays();
    drawToast();
    return;
  }
  if (duel.on) { renderDuel(); return; }
  drawBoard();
  drawGridCells();
  drawPalace();
  drawZones();      // 兵符区域:灼烧火场/减速沼泽(地面贴片,棋子上方之下)
  drawShuai();
  drawBarracks();
  drawBag();       // 战备背包:兵营上方、随身道具即点即用
  drawHUD();
  drawBoats();      // 楼船在水面上、敌军(桥上行军)之下
  drawBossBanner(); // Boss 出阵告示:楚河汉界为舞台(敌军之下、棋盘之上)
  drawEnemies();
  drawGates();
  drawPieces();
  drawProjectiles();
  drawShells();
  drawEffects();
  drawFloats();
  drawToast();
  drawDrag();
  drawOverlays();
}

window.addEventListener('resize', resize);
resize();
installInput();

let last = performance.now();
function frame(now: number): void {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  updateToast(raw);   // 提示条走真实时间:任何画面都会正常淡出
  if (duel.on) {
    if (!duel.over && !duel.player.paused) updateDuel(raw * duel.player.speed, updateBoard);
  } else if (state.screen === 'play' && !state.paused) {
    updateBoard(raw * state.speed);
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- 调试钩子(灰盒测试用,正式版移除) ---------- */
declare global {
  interface Window { __game: Record<string, unknown>; }
}
window.__game = {
  get state() { return state; },
  get duel() { return duel; },
  setupLevel, setupEndless, setupDuel, tryDraft, update, render, damageEnemy,
  handleDown, endDrag, spawnEnemy, cycleSpeed, sendBoat,
  duelApi: { manualBoat: duelManualBoat, fieldCount: duelFieldCount, presets: AI_PRESETS },
  getPaths: () => state.paths, getBlocked: () => state.blocked,
  items: { useGear, drumRate, speedRate, tickGear, onWaveStart, onGroundOpened },
  shop: { scrollShop, getShopScroll, getShopListRect, resetShopScroll, move: shopPointerMove, up: shopPointerUp },
  save: { data: saveData, awardCampaign, awardEndless, awardDuel, resetSave,
    bagList, bagActiveCount, passiveList, passiveCarryCount, passiveOwnedCount, carriesGear, ownsGear, inBag,
    unlockGear, equipGear, unequipGear, equipPassive, unequipPassive,
    addShards, craftFu, fuOf, duelRankState, recordDuelWin, recordDuelLoss },
  ranks: { RANKS, rankAt, rankTitle, advanceRank, winsToPromote, levelCn },
  gear: GEAR,
  levels: LEVELS,   // 50 关全量审计用(预算/构成/水军排布/Boss 序)
  config: { DUEL, ENDLESS, KEN, ECON, GEAR_BAG },   // 灰盒调参:对战/无限波面压力、军械携行上限现场 A/B
};

/* ============================================================
   战场地图注册表(数据驱动)
   ------------------------------------------------------------
   新增一张地图的完整步骤:
     1. 在下方 MAPS 里加一条 MapDef(网格、路线、帅位、河带)
     2. 在 data/levels.ts 里让某个关卡引用它的 id
   引擎(阻挡格计算 / 行军 / 渲染 / 布阵)零改动。
   ============================================================ */
import type { MapDef, PathDef } from '../types';

/* 标准棋盘:7 列 × 9 行概念网格——北岸 4 行布阵格 + 河占整整 1 行(无格,
   纯水域)+ 南岸 4 行布阵格。两图共用同一套 colX / rowY 几何。 */
const COLS7 = [75, 170, 265, 360, 455, 550, 645];
const ROWS9 = [126, 234, 342, 450, 666, 774, 882, 990];   // 第 3、4 行之间为河行(rowY 间距 216 = 1 行布阵 + 1 行河)

export const MAPS: MapDef[] = [
  /* —— 地图一:双路经典 —— */
  {
    id: 'chuhe',
    name: '楚河汉界',
    cols: 7, rows: 8,
    colX: COLS7,
    rowY: ROWS9,
    shuai: { x: 360, y: 990 },
    shuaiCell: [3, 7],
    river: { y: 558, h: 88, labels: [{ text: '楚 河', x: 155 }, { text: '汉 界', x: 555 }] },
    paths: [
      /* A:左口,长路(西桥过河) */
      { name: 'A·左营长路', spawn: { x: 75, y: 112 }, points: [
        { x: 75, y: 150 }, { x: 75, y: 450 }, { x: 265, y: 450 }, { x: 265, y: 774 },
        { x: 550, y: 774 }, { x: 550, y: 990 }, { x: 360, y: 990 },
      ] },
      /* B:右口,短路(约快 25%,东桥过河) */
      { name: 'B·右营短路', spawn: { x: 645, y: 112 }, points: [
        { x: 645, y: 150 }, { x: 645, y: 450 }, { x: 455, y: 450 }, { x: 455, y: 774 },
        { x: 360, y: 774 }, { x: 360, y: 990 },
      ] },
    ],
  },

  /* —— 地图二:单口 U 形纵深(证明换图只改数据) —— */
  {
    id: 'gujun',
    name: '孤军深入',
    cols: 7, rows: 8,
    colX: COLS7,
    rowY: ROWS9,
    shuai: { x: 360, y: 990 },
    shuaiCell: [3, 7],
    river: { y: 558, h: 88, labels: [{ text: '楚 河', x: 300 }, { text: '汉 界', x: 555 }] },
    paths: [
      { name: 'U 形纵深', spawn: { x: 645, y: 112 }, points: [
        { x: 645, y: 150 }, { x: 645, y: 342 }, { x: 75, y: 342 }, { x: 75, y: 774 },
        { x: 550, y: 774 }, { x: 550, y: 990 }, { x: 360, y: 990 },
      ] },
    ],
  },
];

/* ============================================================
   对战竞技场(上下半屏 1v1):8 列 × 10 行,河行夹在第 4、5 行之间。
   上半(0~4 行)= 对方半场,下半(5~9 行)= 我方半场;两侧互为上下镜像。
   双方帅位各自贴外缘(我方第 9 行 / 对方第 0 行),各自只有一个出怪口
   (贴同侧外缘)。单条路线自出怪口直上/直下临河,沿楚河汉界横穿,再折向
   帅位一侧压向帅位——行军道的中段贴河,水军楼船正是从那一段抢滩上道
   (见 sendDuelBoat):河岸是半场里唯一会被「水陆两路夹击」的软肋。
   我方与对方的 MapDef 仅 shuai/shuaiCell 不同(共用 id 'duel',底图只构建一次)。
   ============================================================ */
const DUEL_COLS = [66, 150, 234, 318, 402, 486, 570, 654];
const DUEL_ROWS = [112, 196, 280, 364, 448, 660, 744, 828, 912, 996];   // 第 4、5 行之间为河行
const DUEL_RIVER = { y: 554, h: 84, labels: [{ text: '楚 河', x: 190 }, { text: '汉 界', x: 530 }] };

/** 我方(下半场)单条路线:出怪口(左缘第 7 行)→ 上折临河 → 沿楚河汉界横穿
 *  (第 5 行 = 半场临河行,水军从此段抢滩上道)→ 折右翼下行 → 自南缘压向帅位。
 *  中段贴河,故河岸是半场里唯一会被「水军抢滩」的软肋。 */
export const DUEL_PLAYER_PATHS: PathDef[] = [
  { name: '我·河岸长路', spawn: { x: 66, y: 828 }, points: [
    { x: 66, y: 660 }, { x: 570, y: 660 }, { x: 570, y: 996 }, { x: 318, y: 996 },
  ] },
];
/** 对方(上半场)同一条路线:以河心为轴上下镜像(第 2 行出怪 → 第 4 行临河) */
export const DUEL_RIVAL_PATHS: PathDef[] = [
  { name: '敌·河岸长路', spawn: { x: 66, y: 280 }, points: [
    { x: 66, y: 448 }, { x: 570, y: 448 }, { x: 570, y: 112 }, { x: 318, y: 112 },
  ] },
];
/** 底图/阻挡格用全量路线(两侧都画城楼、都封路) */
const DUEL_ALL_PATHS: PathDef[] = [...DUEL_PLAYER_PATHS, ...DUEL_RIVAL_PATHS];

export const DUEL_MAP_BOTTOM: MapDef = {
  id: 'duel', name: '楚河对垒 · 我阵',
  cols: 8, rows: 10, colX: DUEL_COLS, rowY: DUEL_ROWS,
  shuai: { x: 318, y: 996 }, shuaiCell: [3, 9], shuai2Cell: [3, 0],
  river: DUEL_RIVER, paths: DUEL_ALL_PATHS,
};
export const DUEL_MAP_TOP: MapDef = {
  ...DUEL_MAP_BOTTOM, name: '楚河对垒 · 敌阵',
  shuai: { x: 318, y: 112 }, shuaiCell: [3, 0], shuai2Cell: [3, 9],
};

/** 双方初始可布阵格(其余封荒地,垦荒令开辟):临河行(第 5/4 行)已划为行军道,
 *  故开局给「临河道下沿一排 + 帅前纵深三格」——先守河岸,再守帅门 */
export const DUEL_OPEN_PLAYER: [number, number][] = [[1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [1, 8], [3, 8], [5, 8]];
export const DUEL_OPEN_RIVAL: [number, number][] = [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [1, 1], [3, 1], [5, 1]];

/** 按 id 解析地图(关卡数据引用 mapId) */
export function getMap(id: string): MapDef {
  const m = MAPS.find(x => x.id === id);
  if (!m) throw new Error('未知地图 id: ' + id);
  return m;
}

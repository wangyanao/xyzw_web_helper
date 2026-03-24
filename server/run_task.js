/**
 * 服务端任务执行入口
 * 由 Flask APScheduler 调用：node run_task.js
 * 任务 JSON 通过 stdin 传入
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import GameClient, { transformTokenFromBin } from './gameClient.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS_FILE = join(__dirname, 'data', 'tokens.json');
const BIN_DIR = join(__dirname, 'bin');

/**
 * 对于 importMethod==='bin' 的 token，扫描 bin 目录找到匹配文件，
 * 重新 POST authuser 得到新 session JSON（避免过期）
 */
async function refreshTokenFromBin(tokenId, tokenName) {
  try {
    const files = readdirSync(BIN_DIR).filter(f => f.endsWith('.bin'));
    for (const f of files) {
      const data = readFileSync(join(BIN_DIR, f));
      const hash = createHash('md5').update(data).digest('hex');
      if (hash === tokenId) {
        const fresh = await transformTokenFromBin(data);
        log(tokenName, `已从 bin 文件刷新 session token`, 'info');
        return fresh;
      }
    }
    log(tokenName, `bin 目录未找到匹配文件 (tokenId=${tokenId})，使用已存储 token`, 'warning');
  } catch (e) {
    log(tokenName, `刷新 bin token 失败: ${e.message}，回退到已存储 token`, 'warning');
  }
  return null;
}

function loadTokens() {
  try {
    return JSON.parse(readFileSync(TOKENS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function log(name, msg, level = 'info') {
  // 输出本地时间（Asia/Shanghai +8），避免 toISOString() 的 UTC 偏差
  const ts = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-');
  console.log(JSON.stringify({ ts, name, msg, level }));
}

// 延迟工具
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================
// 单个命令执行（带容错）
// ============================================================
async function execCmd(client, tokenName, cmd, params = {}, desc = '', timeout = 10000) {
  try {
    const result = await client.sendWithPromise(cmd, params, timeout);
    log(tokenName, `✅ ${desc || cmd}`, 'success');
    return result;
  } catch (err) {
    log(tokenName, `⚠️  ${desc || cmd} 失败: ${err.message}`, 'warning');
    return null;
  }
}

// ============================================================
// 任务类型实现
// ============================================================

/**
 * 完整日常任务（对齐前端 DailyTaskRunner.run() 逻辑）
 * 包含：基础操作、固定奖励、钓鱼/灯神免费次数、任务积分/箱子领取
 */
async function runDailyBasic(client, tokenName, delay = 500) {
  // ── 1. 获取角色信息（判断任务完成状态）──
  let roleData = null;
  try {
    const res = await client.sendWithPromise('role_getroleinfo', {}, 10000);
    roleData = res?.role || null;
  } catch (e) {
    log(tokenName, `获取角色信息失败: ${e.message}，仍继续执行`, 'warning');
  }

  const completedTasks = roleData?.dailyTask?.complete ?? {};
  const isTaskDone = (id) => completedTasks[id] === -1;
  const statistics     = roleData?.statistics    ?? {};
  const statisticsTime = roleData?.statisticsTime ?? {};
  const isTodayAvail   = (t) => {
    if (!t) return true;
    return new Date().toDateString() !== new Date(t * 1000).toDateString();
  };

  // ── 2. 获取 battleVersion（用于 fight_* 命令）──
  const battleVersion = await getBattleVersion(client, tokenName);

  // ── 3. 保存当前阵容 ──
  let originalFormation = null;
  try {
    const ti = await client.sendWithPromise('presetteam_getinfo', {}, 5000);
    originalFormation = ti?.presetTeamInfo?.useTeamId ?? null;
    log(tokenName, `当前阵容: ${originalFormation}`);
  } catch (e) { log(tokenName, `获取阵容失败: ${e.message}`, 'warning'); }

  // ── 4. 基础操作 ──
  if (!isTaskDone(2))
    await execCmd(client, tokenName, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }, '分享游戏'); await sleep(delay);
  if (!isTaskDone(3))
    await execCmd(client, tokenName, 'friend_batch', { friendId: 0 }, '赠送好友金币'); await sleep(delay);
  if (!isTaskDone(4)) {
    await execCmd(client, tokenName, 'hero_recruit', { recruitType: 3, recruitNumber: 1 }, '免费招募'); await sleep(delay);
  }
  if (!isTaskDone(6) && isTodayAvail(statisticsTime['buy:gold'])) {
    for (let i = 0; i < 3; i++) {
      await execCmd(client, tokenName, 'system_buygold', { buyNum: 1 }, `免费点金 ${i+1}/3`); await sleep(delay);
    }
  }
  if (!isTaskDone(5)) {
    await execCmd(client, tokenName, 'system_claimhangupreward', {}, '领取挂机奖励'); await sleep(delay);
    for (let i = 0; i < 4; i++) {
      await execCmd(client, tokenName, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i+1}/4`); await sleep(delay);
    }
  }
  if (!isTaskDone(7)) {
    await execCmd(client, tokenName, 'item_openbox', { itemId: 2001, number: 10 }, '开启木质宝箱'); await sleep(delay);
  }

  // 重置罐子
  await execCmd(client, tokenName, 'bottlehelper_stop',  { bottleType: -1 }, '停止盐罐计时'); await sleep(delay);
  await execCmd(client, tokenName, 'bottlehelper_start', { bottleType: -1 }, '开始盐罐计时'); await sleep(delay);
  if (!isTaskDone(14))
    await execCmd(client, tokenName, 'bottlehelper_claim', { bottleType: -1 }, '领取盐罐奖励'); await sleep(delay);

  // ── 5. 固定奖励 ──
  const fixedCmds = [
    { cmd: 'system_signinreward',         params: {},                desc: '福利签到' },
    { cmd: 'legion_signin',               params: {},                desc: '俱乐部签到' },
    { cmd: 'discount_claimreward',        params: {},                desc: '领取每日礼包' },
    { cmd: 'collection_claimfreereward',  params: {},                desc: '领取每日免费奖励' },
    { cmd: 'card_claimreward',            params: {},                desc: '领取免费礼包' },
    { cmd: 'card_claimreward',            params: { cardId: 4003 }, desc: '领取永久卡礼包' },
    { cmd: 'mail_claimallattachment',     params: { category: 0 },  desc: '领取邮件奖励' },
    { cmd: 'collection_goodslist',        params: {},                desc: '刷新珍宝阁' },
    { cmd: 'collection_claimfreereward',  params: {},                desc: '领取珍宝阁免费礼包' },
  ];
  for (const { cmd, params, desc } of fixedCmds) {
    await execCmd(client, tokenName, cmd, params, desc); await sleep(delay);
  }

  // ── 6. 免费活动（钓鱼/灯神）──
  if (isTodayAvail(statistics['artifact:normal:lottery:time'])) {
    for (let i = 0; i < 3; i++) {
      await execCmd(client, tokenName, 'artifact_lottery', { lotteryNumber: 1, newFree: true, type: 1 }, `免费钓鱼 ${i+1}/3`); await sleep(delay);
    }
  }
  const kingdoms = ['魏国','蜀国','吴国','群雄'];
  for (let gid = 1; gid <= 4; gid++) {
    if (isTodayAvail(statisticsTime[`genie:daily:free:${gid}`])) {
      await execCmd(client, tokenName, 'genie_sweep', { genieId: gid }, `${kingdoms[gid-1]}灯神免费扫荡`); await sleep(delay);
    }
  }
  for (let i = 0; i < 3; i++) {
    await execCmd(client, tokenName, 'genie_buysweep', {}, `领取免费扫荡券 ${i+1}/3`); await sleep(delay);
  }

  // ── 7. 黑市 ──
  if (!isTaskDone(12))
    await execCmd(client, tokenName, 'store_purchase', {}, '黑市购买'); await sleep(delay);

  // ── 8. 咸王梦境（周日/一/三/四）──
  const dow = new Date().getDay();
  if ([0,1,3,4].includes(dow)) {
    await execCmd(client, tokenName, 'dungeon_selecthero', { battleTeam: { 0: 107 } }, '咸王梦境'); await sleep(delay);
  }

  // ── 9. 恢复原阵容 ──
  if (originalFormation !== null) {
    await client.sendWithPromise('presetteam_saveteam', { teamId: originalFormation }, 5000).catch(() => {});
    log(tokenName, `已恢复原阵容 ${originalFormation}`);
    await sleep(delay);
  }

  // ── 10. 任务积分 + 日常/周常/通行证奖励（关键：前端最后一步）──
  for (let taskId = 1; taskId <= 10; taskId++) {
    await execCmd(client, tokenName, 'task_claimdailypoint', { taskId }, `领取任务积分 ${taskId}/10`); await sleep(delay);
  }
  await execCmd(client, tokenName, 'task_claimdailyreward', {}, '领取日常任务奖励箱'); await sleep(delay);
  await execCmd(client, tokenName, 'task_claimweekreward',  {}, '领取周常任务奖励箱'); await sleep(delay);
  await execCmd(client, tokenName, 'activity_recyclewarorderrewardclaim', { actId: 1 }, '领取通行证奖励'); await sleep(delay);
}

/** 领取挂机奖励 */
async function runClaimHangUp(client, tokenName, delay = 500) {
  await execCmd(client, tokenName, 'system_claimhangupreward', {}, '领取挂机奖励');
  await sleep(delay);
}

/** 俱乐部签到 */
async function runClubSign(client, tokenName) {
  await execCmd(client, tokenName, 'legion_signin', {}, '俱乐部签到');
}

/** 领取每日免费奖励 */
async function runCollectionFree(client, tokenName) {
  await execCmd(client, tokenName, 'collection_claimfreereward', {}, '领取每日免费奖励');
}

/** 免费领取珍宝阁 */
async function runCollectionClaim(client, tokenName, delay = 500) {
  await execCmd(client, tokenName, 'collection_goodslist', {}, '刷新珍宝阁');
  await sleep(delay);
  await execCmd(client, tokenName, 'collection_claimfreereward', {}, '领取珍宝阁奖励');
}

/** 重置罐子（停止计时 → 开始计时，必须携带 bottleType: -1）*/
async function runResetBottles(client, tokenName, delay = 500) {
  await execCmd(client, tokenName, 'bottlehelper_stop',  { bottleType: -1 }, '停止计时（重置罐子）');
  await sleep(delay);
  await execCmd(client, tokenName, 'bottlehelper_start', { bottleType: -1 }, '开始计时（重置罐子）');
}

/** 一键领取盐罐 */
async function runClaimBottle(client, tokenName) {
  await execCmd(client, tokenName, 'bottlehelper_claim', { bottleType: -1 }, '一键领取盐罐');
}

/** 领取功法残卷挂机奖励 */
async function runLegacyClaim(client, tokenName) {
  await execCmd(client, tokenName, 'legacy_claimhangup', {}, '领取功法残卷');
}

/** 一键加钟（执行4次分享回调）*/
async function runAddHangUpTime(client, tokenName, delay = 500) {
  for (let i = 0; i < 4; i++) {
    await execCmd(client, tokenName, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }, `加钟 ${i + 1}/4`);
    await sleep(delay);
  }
}

/**
 * 调用 fight_startlevel 获取 battleVersion
 * 所有 fight_start* 战斗命令都必须携带此版本号，否则服务端返回 200750
 */
async function getBattleVersion(client, tokenName) {
  try {
    const res = await client.sendWithPromise('fight_startlevel', {}, 5000);
    const v = res?.battleData?.version ?? null;
    log(tokenName, `battleVersion: ${v}`, 'info');
    return v;
  } catch (e) {
    log(tokenName, `获取 battleVersion 失败: ${e.message}`, 'warning');
    return null;
  }
}

// 从竞技场响应中提取目标 roleId（对齐前端 pickArenaTargetId 逻辑）
function pickArenaTargetId(targets) {
  const candidate =
    targets?.rankList?.[0] ||
    targets?.roleList?.[0] ||
    targets?.targets?.[0] ||
    targets?.targetList?.[0] ||
    targets?.list?.[0];
  if (candidate?.roleId) return candidate.roleId;
  if (candidate?.id) return candidate.id;
  return targets?.roleId || targets?.id || null;
}

/** 竞技场战斗（最多3次，含阵容切换，与前端 batcharenafight 完全对齐）*/
async function runArenaFight(client, tokenName, batchSettings = {}, delay = 500) {
  const arenaFormation = batchSettings.arenaFormation ?? 1;
  let currentFormation = null;
  let switched = false;
  try {
    // 0. 获取 battleVersion（fight_startareaarena 必须携带，否则服务端返回 200750）
    const battleVersion = await getBattleVersion(client, tokenName);

    // 1. 获取当前阵容
    const teamInfo = await client.sendWithPromise('presetteam_getinfo', {}, 5000);
    currentFormation = teamInfo?.presetTeamInfo?.useTeamId ?? null;

    // 2. 切换到竞技场阵容
    if (currentFormation !== arenaFormation) {
      await client.sendWithPromise('presetteam_saveteam', { teamId: arenaFormation }, 5000);
      switched = true;
      log(tokenName, `切换到竞技场阵容 ${arenaFormation}`, 'info');
    } else {
      log(tokenName, `当前已是竞技场阵容 ${arenaFormation}，无需切换`, 'info');
    }

    // 3. 循环打3场（每场独立调用 arena_startarea）
    for (let i = 0; i < 3; i++) {
      // arena_startarea 仅做"进入竞技场"，忽略返回值
      await client.sendWithPromise('arena_startarea', {}, 5000).catch(() => {});
      // 从 arena_getareatarget 获取目标列表
      const targets = await client.sendWithPromise('arena_getareatarget', { refresh: false }, 5000);
      const targetId = pickArenaTargetId(targets);
      if (!targetId) {
        log(tokenName, '竞技场：未找到可用目标', 'warning');
        break;
      }
      // 必须注入 battleVersion，否则服务端拒绝（错误 200750）
      await execCmd(client, tokenName, 'fight_startareaarena', { battleVersion, targetId }, `竞技场第 ${i + 1}/3 场`);
      await sleep(delay);
    }
  } catch (err) {
    log(tokenName, `竞技场失败: ${err.message}`, 'warning');
  } finally {
    // 4. 战斗结束后恢复原阵容
    if (switched && currentFormation !== null) {
      await client.sendWithPromise('presetteam_saveteam', { teamId: currentFormation }, 5000).catch(() => {});
      log(tokenName, `已恢复原阵容 ${currentFormation}`, 'info');
    }
  }
}

/** 黑市一键采购 */
async function runStorePurchase(client, tokenName) {
  await execCmd(client, tokenName, 'store_purchase', {}, '黑市一键采购');
}

/** 俱乐部商店购买四圣碎片 */
async function runLegionStoreBuyGoods(client, tokenName) {
  await execCmd(client, tokenName, 'legion_storebuygoods', { id: 6 }, '购买四圣碎片');
}

/** 咸王梦境（仅周日/一/三/四开放）*/
async function runBatchMengjing(client, tokenName, delay = 500) {
  const dayOfWeek = new Date().getDay();
  const openDays = [0, 1, 3, 4]; // 周日/一/三/四
  if (!openDays.includes(dayOfWeek)) {
    log(tokenName, `咸王梦境：今日非开放日（今天周${['日','一','二','三','四','五','六'][dayOfWeek]}）`, 'warning');
    return;
  }
  const mjbattleTeam = { 0: 107 };
  await execCmd(client, tokenName, 'dungeon_selecthero', { battleTeam: mjbattleTeam }, '咸王梦境');
  await sleep(delay);
}

/** 换皮闯关 */
async function runSkinChallenge(client, tokenName, delay = 500) {
  try {
    const res = await client.sendWithPromise('towers_getinfo', {}, 5000);
    const towerData = res?.actId ? res : (res?.towerData?.actId ? res.towerData : res);
    if (!towerData?.actId) {
      log(tokenName, '换皮闯关：活动未开放', 'warning');
      return;
    }
    // 检查活动时间
    const actId = String(towerData.actId);
    if (actId.length >= 6) {
      const startDate = new Date(`20${actId.substring(0,2)}-${actId.substring(2,4)}-${actId.substring(4,6)}T00:00:00`);
      const endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 7);
      if (Date.now() < startDate.getTime() || Date.now() >= endDate.getTime()) {
        log(tokenName, '换皮闯关：活动已结束', 'warning');
        return;
      }
    }
    const levelRewardMap = towerData.levelRewardMap || {};
    const dayMap = { 5:[1], 6:[2], 0:[3], 1:[4], 2:[5], 3:[6], 4:[1,2,3,4,5,6] };
    const todayTypes = dayMap[new Date().getDay()] || [];
    for (const type of todayTypes) {
      const key = `${type}008`;
      if (levelRewardMap[key] || levelRewardMap[Number(key)]) continue; // 已通关
      await execCmd(client, tokenName, 'towers_start', { towerType: type }, `换皮闯关 BOSS${type}`, 8000);
      await sleep(delay);
    }
  } catch (err) {
    log(tokenName, `换皮闯关失败: ${err.message}`, 'warning');
  }
}

/** 灯神扫荡 */
async function runGenieSweep(client, tokenName, delay = 500) {
  try {
    const roleInfoRes = await client.sendWithPromise('role_getroleinfo', {}, 5000);
    const role = roleInfoRes?.role || roleInfoRes?.data?.role || {};
    const genieData = role.genie || {};
    const sweepTicketCount = role.items?.[1021]?.quantity || 0;
    if (sweepTicketCount <= 0) {
      log(tokenName, '灯神扫荡：扫荡券不足', 'warning');
      return;
    }
    // 找最高层数
    let maxLayer = -1, bestGenieId = -1;
    for (let i = 1; i <= 4; i++) {
      if (genieData[i] !== undefined && (genieData[i] + 1) > maxLayer) {
        maxLayer = genieData[i] + 1; bestGenieId = i;
      }
    }
    if (bestGenieId === -1) { log(tokenName, '灯神扫荡：未找到可扫荡关卡', 'warning'); return; }
    const names = { 1:'魏国', 2:'蜀国', 3:'吴国', 4:'群雄', 5:'深海' };
    log(tokenName, `灯神扫荡：${names[bestGenieId]}灯神 第${maxLayer}层，共${sweepTicketCount}张券`);
    let remaining = sweepTicketCount;
    while (remaining > 0) {
      const sweepCnt = Math.min(remaining, 20);
      const res = await client.sendWithPromise('genie_sweep', { genieId: bestGenieId, sweepCnt }, 8000);
      remaining = res?.role?.items?.[1021]?.quantity ?? 0;
      log(tokenName, `✅ 灯神扫荡 ${sweepCnt} 次，剩余 ${remaining} 张`, 'success');
      await sleep(delay);
    }
  } catch (err) {
    log(tokenName, `灯神扫荡失败: ${err.message}`, 'warning');
  }
}

/** 答题（study_startgame，仅发起，无法等待完成） */
async function runBatchStudy(client, tokenName) {
  await execCmd(client, tokenName, 'study_startgame', {}, '开始答题', 8000);
}

/** 宝库1-3层（bosstower_startboss x2 + bosstower_startbox x9）*/
async function runBaoku13(client, tokenName, delay = 500) {
  try {
    const info = await client.sendWithPromise('bosstower_getinfo', {}, 5000);
    const towerId = info?.bossTower?.towerId;
    if (towerId < 1 || towerId > 3) {
      log(tokenName, `宝库：当前层数 ${towerId} 不在1-3层范围，跳过`, 'warning');
      return;
    }
    for (let i = 0; i < 2; i++) {
      await execCmd(client, tokenName, 'bosstower_startboss', {}, `宝库BOSS ${i+1}/2`);
      await sleep(delay);
    }
    for (let i = 0; i < 9; i++) {
      await execCmd(client, tokenName, 'bosstower_startbox', {}, `宝库开箱 ${i+1}/9`);
      await sleep(delay);
    }
  } catch (err) { log(tokenName, `宝库1-3失败: ${err.message}`, 'warning'); }
}

/** 宝库4-5层（bosstower_startboss x2）*/
async function runBaoku45(client, tokenName, delay = 500) {
  try {
    const info = await client.sendWithPromise('bosstower_getinfo', {}, 5000);
    const towerId = info?.bossTower?.towerId;
    if (towerId < 4 || towerId > 5) {
      log(tokenName, `宝库：当前层数 ${towerId} 不在4-5层范围，跳过`, 'warning');
      return;
    }
    for (let i = 0; i < 2; i++) {
      await execCmd(client, tokenName, 'bosstower_startboss', {}, `宝库BOSS ${i+1}/2`);
      await sleep(delay);
    }
  } catch (err) { log(tokenName, `宝库4-5失败: ${err.message}`, 'warning'); }
}

/** 爬塔（fight_starttower，耗尽体力为止）*/
async function runClimbTower(client, tokenName, delay = 1000) {
  try {
    const battleVersion = await getBattleVersion(client, tokenName);
    const roleInfo = await client.sendWithPromise('role_getroleinfo', {}, 8000);
    let energy = roleInfo?.role?.tower?.energy || 0;
    log(tokenName, `爬塔：初始体力 ${energy}`);
    let count = 0; let fails = 0;
    while (energy > 0 && count < 100) {
      try {
        await client.sendWithPromise('fight_starttower', { battleVersion }, 8000);
        count++; fails = 0; energy--;
        log(tokenName, `✅ 爬塔第 ${count} 次`, 'success');
        await sleep(delay);
      } catch (err) {
        if (err.message?.includes('1500040')) {
          const floor = Math.floor((roleInfo?.role?.tower?.id || 0) / 10);
          if (floor > 0) await client.sendWithPromise('tower_claimreward', { rewardId: floor }, 3000).catch(() => {});
          await sleep(3000); continue;
        }
        if (++fails >= 3) break;
        await sleep(2000);
      }
      if (count % 5 === 0) {
        try { const r = await client.sendWithPromise('role_getroleinfo', {}, 5000); energy = r?.role?.tower?.energy || 0; } catch {}
      }
    }
    log(tokenName, `爬塔结束，共 ${count} 次`, 'success');
  } catch (err) { log(tokenName, `爬塔失败: ${err.message}`, 'warning'); }
}

/** 爬怪异塔（evotower_readyfight + evotower_fight，耗尽能量）*/
async function runClimbWeirdTower(client, tokenName, delay = 500) {
  try {
    let info = await client.sendWithPromise('evotower_getinfo', {}, 5000);
    let energy = info?.evoTower?.energy || 0;
    log(tokenName, `怪异塔：初始能量 ${energy}`);
    let count = 0; let fails = 0;
    while (energy > 0 && count < 100) {
      try {
        await client.sendWithPromise('evotower_readyfight', {}, 5000);
        const fightRes = await client.sendWithPromise('evotower_fight', { battleNum: 1, winNum: 1 }, 10000);
        count++; fails = 0;
        log(tokenName, `✅ 怪异塔第 ${count} 次`, 'success');
        await sleep(delay);
        // 通关10层领取奖励
        info = await client.sendWithPromise('evotower_getinfo', {}, 5000);
        const towerId = info?.evoTower?.towerId || 0;
        if (fightRes?.winList?.[0] && (towerId % 10) === 0) {
          await client.sendWithPromise('evotower_claimreward', {}, 5000).catch(() => {});
        }
        energy = info?.evoTower?.energy || 0;
      } catch (err) {
        if (++fails >= 3) break;
        await sleep(1000);
        try { info = await client.sendWithPromise('evotower_getinfo', {}, 5000); energy = info?.evoTower?.energy || 0; } catch {}
      }
    }
    log(tokenName, `怪异塔结束，共 ${count} 次`, 'success');
  } catch (err) { log(tokenName, `怪异塔失败: ${err.message}`, 'warning'); }
}

/** 领取怪异塔免费道具 */
async function runClaimFreeEnergy(client, tokenName) {
  try {
    const res = await client.sendWithPromise('mergebox_getinfo', { actType: 1 }, 5000);
    if (res?.mergeBox?.freeEnergy > 0) {
      await execCmd(client, tokenName, 'mergebox_claimfreeenergy', { actType: 1 }, `领取免费道具${res.mergeBox.freeEnergy}个`);
    } else {
      log(tokenName, '怪异塔免费道具：暂无可领取');
    }
  } catch (err) { log(tokenName, `领取免费道具失败: ${err.message}`, 'warning'); }
}

/** 使用怪异塔道具（mergebox_openbox 循环直到耗尽）*/
async function runUseItems(client, tokenName, delay = 500) {
  try {
    const infoRes = await client.sendWithPromise('mergebox_getinfo', { actType: 1 }, 5000);
    const towerRes = await client.sendWithPromise('evotower_getinfo', {}, 5000);
    let costTotalCnt = infoRes?.mergeBox?.costTotalCnt || 0;
    let lotteryLeft = towerRes?.evoTower?.lotteryLeftCnt || 0;
    if (lotteryLeft <= 0) { log(tokenName, '使用道具：无剩余', 'warning'); return; }
    log(tokenName, `使用道具：剩余 ${lotteryLeft}，已用 ${costTotalCnt}`);
    let used = 0;
    while (lotteryLeft > 0) {
      let pos = costTotalCnt < 2 ? { gridX: 4, gridY: 5 } : costTotalCnt < 102 ? { gridX: 7, gridY: 3 } : { gridX: 6, gridY: 3 };
      await client.sendWithPromise('mergebox_openbox', { actType: 1, pos }, 5000);
      costTotalCnt++; lotteryLeft--; used++;
      await sleep(delay);
    }
    await client.sendWithPromise('mergebox_claimcostprogress', { actType: 1 }, 5000).catch(() => {});
    log(tokenName, `✅ 使用道具 ${used} 次`, 'success');
  } catch (err) { log(tokenName, `使用道具失败: ${err.message}`, 'warning'); }
}

/** 合成怪异塔材料（mergebox_merge 循环）*/
async function runMergeItems(client, tokenName, delay = 500) {
  try {
    for (let loop = 0; loop < 20; loop++) {
      const infoRes = await client.sendWithPromise('mergebox_getinfo', { actType: 1 }, 5000);
      if (!infoRes?.mergeBox) break;
      // 领取合成奖励
      const taskMap = infoRes.mergeBox.taskMap || {};
      const taskClaimMap = infoRes.mergeBox.taskClaimMap || {};
      for (const taskId of Object.keys(taskMap)) {
        if (taskMap[taskId] !== 0 && !taskClaimMap[taskId]) {
          await client.sendWithPromise('mergebox_claimmergeprogress', { actType: 1, taskId: parseInt(taskId) }, 2000).catch(() => {});
          await sleep(delay);
        }
      }
      // 合成
      const gridMap = infoRes.mergeBox.gridMap || {};
      let merged = false;
      for (const [k, v] of Object.entries(gridMap)) {
        if (!v || !v.itemId) continue;
        const [gk] = k.split(',').map(Number);
        await client.sendWithPromise('mergebox_merge', { actType: 1, gridKey: k }, 2000).catch(() => {});
        merged = true; await sleep(delay);
      }
      if (!merged) break;
    }
    log(tokenName, '✅ 合成完成', 'success');
  } catch (err) { log(tokenName, `合成失败: ${err.message}`, 'warning'); }
}

/** 蟠桃园任务领取 */
async function runClaimPeachTasks(client, tokenName, delay = 500) {
  try {
    const res = await client.sendWithPromise('legion_getpayloadtask', {}, 5000);
    const payloadTask = res?.payloadTask;
    if (!payloadTask?.taskMap) { log(tokenName, '蟠桃园：无任务数据', 'warning'); return; }
    const PEACH_TASKS = (await import('../src/utils/batch/PeachTaskIds.js').catch(() => null))?.PEACH_TASKS || [];
    const taskMap = payloadTask.taskMap;
    for (const item of Object.values(taskMap)) {
      const tasks = PEACH_TASKS.filter(t => t.type === item.typ && item.progress >= t.target && item.claimedProgress < t.target);
      for (const task of tasks) {
        await execCmd(client, tokenName, 'legion_claimpayloadtask', { taskId: task.id }, `蟠桃园任务${task.id}`);
        await sleep(delay);
      }
    }
    // 积分奖励
    const res2 = await client.sendWithPromise('legion_getpayloadtask', {}, 5000);
    const pt = res2?.payloadTask;
    if (pt) {
      const pm = pt.progressMap || {};
      if ((pt.legionPoint || 0) > (pm[1] || pm['1'] || 0)) {
        await execCmd(client, tokenName, 'legion_claimpayloadtaskprogress', { taskGroup: 1 }, '蟠桃园俱乐部积分奖励');
      }
      if ((pt.selfPoint || 0) > (pm[2] || pm['2'] || 0)) {
        await execCmd(client, tokenName, 'legion_claimpayloadtaskprogress', { taskGroup: 2 }, '蟠桃园个人积分奖励');
      }
    }
  } catch (err) { log(tokenName, `蟠桃园失败: ${err.message}`, 'warning'); }
}

/** 梦境购买（使用 batchSettings.dreamPurchaseList）*/
async function runBuyDreamItems(client, tokenName, batchSettings = {}, delay = 500) {
  const purchaseList = batchSettings.dreamPurchaseList || [];
  if (!purchaseList.length) { log(tokenName, '梦境购买：未配置购买清单', 'warning'); return; }
  const dayOfWeek = new Date().getDay();
  if (![0, 1, 3, 4].includes(dayOfWeek)) {
    log(tokenName, `梦境购买：今日非开放日`, 'warning'); return;
  }
  try {
    const roleInfo = await client.sendWithPromise('role_getroleinfo', {}, 15000);
    const merchantData = roleInfo?.role?.dungeon?.merchant;
    if (!merchantData) { log(tokenName, '梦境购买：无法获取商店数据', 'warning'); return; }
    for (const itemKey of purchaseList) {
      const [mId, idx] = itemKey.split('-').map(Number);
      const items = merchantData[mId] || [];
      for (let pos = 0; pos < items.length; pos++) {
        if (items[pos] === idx) {
          await execCmd(client, tokenName, 'dungeon_buymerchant', { id: mId, index: idx, pos }, `梦境购买 ${mId}-${idx}`, 5000);
          await sleep(delay);
        }
      }
    }
  } catch (err) { log(tokenName, `梦境购买失败: ${err.message}`, 'warning'); }
}

// 标准化车辆列表（对齐前端 normalizeCars 逻辑）
function normalizeCars(raw) {
  const r = raw || {};
  const body = r.body || r;
  const roleCar = body.roleCar || body.rolecar || {};
  const carMap = roleCar.carDataMap || roleCar.cardatamap;
  if (carMap && typeof carMap === 'object') {
    return Object.entries(carMap).map(([id, info]) => ({ id, ...(info || {}) }));
  }
  let arr = body.cars || body.list || body.data || body.carList || [];
  if (!Array.isArray(arr) && typeof arr === 'object' && arr !== null) arr = Object.values(arr);
  return Array.isArray(arr) ? arr : [];
}

// 判断是否可收车（发出后满4小时，对齐前端 canClaim 逻辑）
function canClaim(car) {
  const t = Number(car?.sendAt || 0);
  if (!t) return false;
  const tsMs = t < 1e12 ? t * 1000 : t;
  return Date.now() - tsMs >= 4 * 60 * 60 * 1000;
}

/** 智能发车（简化版：直接发所有未出发的车） */
async function runSmartSendCar(client, tokenName, delay = 500) {
  try {
    const res = await client.sendWithPromise('car_getrolecar', {}, 10000);
    const cars = normalizeCars(res);
    log(tokenName, `智能发车：共找到 ${cars.length} 辆车`);
    if (cars.length > 0) {
      // 调试：打印第一辆车的字段，方便排查发车条件
      const sample = cars[0];
      log(tokenName, `[调试] 车辆样例: id=${sample.id} sendAt=${sample.sendAt} color=${sample.color} status=${sample.status}`, 'info');
    }
    let sent = 0;
    for (const car of cars) {
      const sendAt = Number(car.sendAt ?? car.sendtime ?? car.send_at ?? 0);
      if (sendAt !== 0) continue; // 已在路上
      await execCmd(client, tokenName, 'car_send', { carId: String(car.id), helperId: 0, text: '', isUpgrade: false }, `发车[id:${car.id} 色:${car.color}]`, 10000);
      sent++;
      await sleep(delay);
    }
    log(tokenName, `✅ 智能发车完成，共发 ${sent} 辆`, 'success');
  } catch (err) { log(tokenName, `智能发车失败: ${err.message}`, 'warning'); }
}

/** 一键收车 */
async function runClaimCars(client, tokenName, delay = 500) {
  try {
    const res = await client.sendWithPromise('car_getrolecar', {}, 10000);
    const cars = normalizeCars(res);
    log(tokenName, `收车：共找到 ${cars.length} 辆车`);
    if (cars.length > 0) {
      const sample = cars[0];
      log(tokenName, `[调试] 车辆样例: id=${sample.id} sendAt=${sample.sendAt} color=${sample.color} status=${sample.status}`, 'info');
    }
    let claimed = 0;
    for (const car of cars) {
      if (canClaim(car)) {
        await execCmd(client, tokenName, 'car_claim', { carId: String(car.id) }, `收车[id:${car.id} 色:${car.color}]`, 10000);
        claimed++;
        await sleep(delay);
      }
    }
    log(tokenName, `✅ 收车完成，共收 ${claimed} 辆`, 'success');
  } catch (err) { log(tokenName, `收车失败: ${err.message}`, 'warning'); }
}

/** 任务类型 → 执行函数映射 */
const TASK_RUNNERS = {
  startBatch:               (c, n, s) => runDailyBasic(c, n, s.commandDelay),
  claimHangUpRewards:       (c, n)    => runClaimHangUp(c, n),
  batchclubsign:            (c, n)    => runClubSign(c, n),
  collection_claimfreereward:(c, n)   => runCollectionFree(c, n),
  collection_claimreward:   (c, n)    => runCollectionClaim(c, n),
  resetBottles:             (c, n, s) => runResetBottles(c, n, s.commandDelay),
  batchlingguanzi:          (c, n)    => runClaimBottle(c, n),
  batchLegacyClaim:         (c, n)    => runLegacyClaim(c, n),
  batchAddHangUpTime:       (c, n, s) => runAddHangUpTime(c, n, s.commandDelay),
  batcharenafight:          (c, n, s) => runArenaFight(c, n, s, s.commandDelay),
  store_purchase:           (c, n)    => runStorePurchase(c, n),
  legion_storebuygoods:     (c, n)    => runLegionStoreBuyGoods(c, n),
  batchmengjing:            (c, n, s) => runBatchMengjing(c, n, s.commandDelay),
  skinChallenge:            (c, n, s) => runSkinChallenge(c, n, s.commandDelay),
  batchGenieSweep:          (c, n, s) => runGenieSweep(c, n, s.commandDelay),
  batchStudy:               (c, n)    => runBatchStudy(c, n),
  batchbaoku13:             (c, n, s) => runBaoku13(c, n, s.commandDelay),
  batchbaoku45:             (c, n, s) => runBaoku45(c, n, s.commandDelay),
  climbTower:               (c, n, s) => runClimbTower(c, n, s.commandDelay),
  climbWeirdTower:          (c, n, s) => runClimbWeirdTower(c, n, s.commandDelay),
  batchClaimFreeEnergy:     (c, n)    => runClaimFreeEnergy(c, n),
  batchUseItems:            (c, n, s) => runUseItems(c, n, s.commandDelay),
  batchMergeItems:          (c, n, s) => runMergeItems(c, n, s.commandDelay),
  batchClaimPeachTasks:     (c, n, s) => runClaimPeachTasks(c, n, s.commandDelay),
  batchBuyDreamItems:       (c, n, s) => runBuyDreamItems(c, n, s, s.commandDelay),
  batchSmartSendCar:        (c, n, s) => runSmartSendCar(c, n, s.commandDelay),
  batchClaimCars:           (c, n, s) => runClaimCars(c, n, s.commandDelay),
};

// ============================================================
// 主流程
// ============================================================

async function main() {
  // 从 stdin 读取任务 JSON
  let taskJson = '';
  for await (const chunk of process.stdin) taskJson += chunk;

  let task;
  try {
    task = JSON.parse(taskJson.trim());
  } catch (e) {
    console.error('任务 JSON 解析失败:', e.message);
    process.exit(1);
  }

  const { name: taskName, selectedTokens = [], selectedTasks = [], batchSettings = {} } = task;
  const delay = batchSettings.commandDelay ?? 500;
  const tokens = loadTokens();

  if (Object.keys(tokens).length === 0) {
    log(taskName, `⚠️  tokens.json 为空或不存在 (路径: ${TOKENS_FILE})，请确认前端已同步 Token`, 'error');
    process.exit(1);
  }

  log('scheduler', `=== 开始执行定时任务: ${taskName} ===`);

  for (const tokenId of selectedTokens) {
    const tokenData = tokens[tokenId];
    if (!tokenData) {
      log(taskName, `找不到 token: ${tokenId}`, 'error');
      continue;
    }

    const tokenName = tokenData.name || tokenId;
    const tokenStr = tokenData.token;
    if (!tokenStr) {
      log(taskName, `${tokenName} token 字符串为空`, 'error');
      continue;
    }

    const client = new GameClient({
      log: (msg, level) => log(tokenName, msg, level),
    });

    try {
      // bin 导入的 token 含过期 session，连接前先刷新
      let activeToken = tokenStr;
      if (tokenData.importMethod === 'bin') {
        const fresh = await refreshTokenFromBin(tokenId, tokenName);
        if (fresh) activeToken = fresh;
      }
      await client.connect(activeToken);
      log(tokenName, '连接成功');

      for (const taskType of selectedTasks) {
        const runner = TASK_RUNNERS[taskType];
        if (!runner) {
          log(tokenName, `不支持的任务类型: ${taskType}（需在 run_task.js 中补充）`, 'warning');
          continue;
        }
        log(tokenName, `执行任务: ${taskType}`);
        await runner(client, tokenName, batchSettings);
        await sleep(delay);
      }
    } catch (err) {
      log(tokenName, `执行失败: ${err.message}`, 'error');
    } finally {
      client.disconnect();
    }
  }

  log('scheduler', `=== 定时任务 ${taskName} 执行完毕 ===`);
}

main().catch(err => {
  console.error('run_task.js 异常:', err);
  process.exit(1);
});

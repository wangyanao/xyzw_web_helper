# XYZW 游戏接口调用指南

## 一、接口调用方式

### 1.1 基本调用模式

#### sendWithPromise 模式（推荐 - 等待响应）
```javascript
// 格式：client.sendWithPromise(cmd, params, timeout)
// 会等待服务器响应，返回 Promise

const result = await client.sendWithPromise('role_getroleinfo', {}, 10000);
// timeout 默认 10000ms，可自定义
```

#### 使用示例
```javascript
// 示例1：获取角色信息
const roleInfo = await client.sendWithPromise('role_getroleinfo', {}, 10000);

// 示例2：竞技场战斗
const result = await client.sendWithPromise('fight_startareaarena', { 
  battleVersion, 
  targetId 
}, 10000);

// 示例3：灯神扫荡
const sweepResult = await client.sendWithPromise('genie_sweep', { 
  genieId: 1, 
  sweepCnt: 5 
}, 8000);
```

### 1.2 在 Vue 组件中使用

```javascript
import { useTokenStore } from '@/stores/tokenStore';

export default {
  async setup() {
    const tokenStore = useTokenStore();
    
    // 获取当前选中 token 的 WebSocket 客户端
    const client = tokenStore.getWebSocketClient(tokenStore.selectedToken.id);
    
    // 发送命令
    const result = await client.sendWithPromise('role_getroleinfo', {}, 10000);
    
    return { result };
  }
}
```

### 1.3 在服务端 Node.js 中使用

```javascript
import GameClient from './gameClient.js';

const client = new GameClient(ws_url);
await client.connect(token);

// 调用接口
const result = await client.sendWithPromise('role_getroleinfo', {}, 10000);
```

---

## 二、所有可用接口列表（按功能分类）

### 2.1 角色/系统相关 (7个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `role_getroleinfo` | 获取角色信息 | `{}` | 10000ms |
| `system_getdatabundlever` | 获取数据包版本 | `{ isAudit: false }` | - |
| `system_buygold` | 购买金币 | `{ buyNum: 1 }` | - |
| `system_mysharecallback` | 分享回调/加钟 | `{ isSkipShareCard: true, type: 2 }` | - |
| `system_claimhangupreward` | 领取挂机奖励 | `{}` | - |
| `system_signinreward` | 福利签到 | `{}` | - |
| `system_custom` | 自定义系统命令 | `{ key: "", value: 0 }` | - |

### 2.2 任务/奖励 (7个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `task_claimdailypoint` | 领取任务积分 | `{ taskId: 1 }` | - |
| `task_claimdailyreward` | 领取日常任务奖励箱 | `{ rewardId: 0 }` | - |
| `task_claimweekreward` | 领取周常任务奖励箱 | `{ rewardId: 0 }` | - |
| `discount_claimreward` | 领取每日礼包 | `{ discountId: 1 }` | - |
| `card_claimreward` | 领取卡片礼包 | `{ cardId: 1 }` | - |
| `collection_claimfreereward` | 领取珍宝阁免费奖励 | `{}` | - |
| `activity_recyclewarorderrewardclaim` | 领取通行证奖励 | `{ actId: 1 }` | - |

### 2.3 竞技场/战斗 (8个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `arena_startarea` | 进入竞技场 | `{}` | 5000ms |
| `arena_getareatarget` | 获取竞技场目标 | `{ refresh: false }` | 5000ms |
| `fight_startlevel` | 获取 battleVersion | `{}` | 5000ms |
| `fight_startareaarena` | 竞技场战斗 | `{ battleVersion, targetId }` | 10000ms |
| `fight_startpvp` | PVP 战斗 | `{ battleVersion, ... }` | 10000ms |
| `fight_starttower` | 爬塔战斗 | `{ battleVersion }` | 8000ms |
| `fight_startdungeon` | 副本战斗 | `{ battleVersion, ... }` | 10000ms |
| `fight_startlegionboss` | 军团BOSS战 | `{}` | - |

### 2.4 爬塔相关 (6个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `tower_getinfo` | 获取爬塔信息 | `{}` | - |
| `tower_claimreward` | 领取爬塔奖励 | `{ rewardId: floor }` | 3000ms |
| `evotower_getinfo` | 获取怪异塔信息 | `{}` | 5000ms |
| `evotower_readyfight` | 怪异塔准备战斗 | `{}` | 5000ms |
| `evotower_fight` | 怪异塔战斗 | `{ battleNum: 1, winNum: 1 }` | 10000ms |
| `evotower_claimreward` | 领取怪异塔奖励 | `{}` | 5000ms |

### 2.5 合并宝箱系统 (7个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `mergebox_getinfo` | 获取宝箱信息 | `{ actType: 1 }` | 5000ms |
| `mergebox_claimfreeenergy` | 领取免费能量 | `{ actType: 1 }` | - |
| `mergebox_openbox` | 打开宝箱 | `{ actType: 1, pos }` | 5000ms |
| `mergebox_automergeitem` | 自动合并物品 | `{ actType: 1 }` | - |
| `mergebox_mergeitem` | 合并物品 | `{ actType: 1, gridKey }` | 2000ms |
| `mergebox_claimcostprogress` | 领取消耗进度奖励 | `{ actType: 1 }` | 5000ms |
| `mergebox_claimmergeprogress` | 领取合并进度奖励 | `{ actType: 1, taskId }` | 2000ms |

### 2.6 灯神相关 (2个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `genie_sweep` | 灯神扫荡 | `{ genieId: 1, sweepCnt: 5 }` | 8000ms |
| `genie_buysweep` | 购买扫荡券 | `{}` | - |

### 2.7 军团相关 (14个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `legion_getinfo` | 获取军团信息 | `{}` | - |
| `legion_signin` | 军团签到 | `{}` | - |
| `legion_getinfobyid` | 按ID获取军团信息 | `{}` | - |
| `legion_kickout` | 踢出成员 | `{}` | - |
| `legion_applylist` | 获取申请列表 | `{}` | - |
| `legion_approveapply` | 批准申请 | `{}` | - |
| `legion_refuseapply` | 拒绝申请 | `{}` | - |
| `legion_agree` | 同意 | `{}` | - |
| `legion_ignore` | 忽略 | `{}` | - |
| `legion_storebuygoods` | 军团商店购买 | `{ id: 6 }` | - |
| `legion_getarearank` | 获取区域排名 | `{}` | - |
| `legion_getpayloadtask` | 获取载重任务 | `{}` | 5000ms |
| `legionmatch_rolesignup` | 军团匹配报名 | `{}` | - |
| `legionwar_getdetails` | 获取军团战详情 | `{ date: "2025/10/04" }` | - |

### 2.8 商店系统 (3个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `store_goodslist` | 获取商店商品列表 | `{ storeId: 1 }` | - |
| `store_buy` | 商店购买 | `{ goodsId: 1 }` | - |
| `store_purchase` | 黑市购买 | `{}` | - |
| `store_refresh` | 商店刷新 | `{ storeId: 1 }` | - |

### 2.9 邮件系统 (3个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `mail_getlist` | 获取邮件列表 | `{ category: [0, 4, 5], lastId: 0, size: 60 }` | - |
| `mail_claimallattachment` | 领取所有邮件附件 | `{ category: 0 }` | - |
| `mail_getmtlinfo` | 获取邮件模板信息 | `{}` | - |

### 2.10 队伍系统 (5个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `presetteam_getinfo` | 获取阵容信息 | `{}` | 5000ms |
| `presetteam_setteam` | 设置阵容 | `{}` | - |
| `presetteam_saveteam` | 保存阵容 | `{ teamId: 1 }` | 5000ms |
| `fight_startlevel` | 获取战斗版本 | `{}` | 5000ms |
| `role_gettargetteam` | 获取目标阵容 | `{}` | - |

### 2.11 英雄系统 (4个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `hero_recruit` | 英雄招募 | `{ byClub: false, recruitNumber: 1, recruitType: 3 }` | - |
| `hero_heroupgradelevel` | 武将升级 | `{}` | - |
| `hero_heroupgradeorder` | 武将进阶 | `{}` | - |
| `hero_heroupgradestar` | 武将升星 | `{}` | - |

### 2.12 物品系统 (3个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `item_openbox` | 开启宝箱 | `{ itemId: 2001, number: 10 }` | - |
| `item_batchclaimboxpointreward` | 批量领取箱子积分奖励 | `{}` | - |
| `item_openpack` | 打开礼包 | `{}` | - |

### 2.13 盐罐机器人 (3个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `bottlehelper_start` | 启动盐罐计时 | `{ bottleType: -1 }` | - |
| `bottlehelper_stop` | 停止盐罐计时 | `{ bottleType: -1 }` | - |
| `bottlehelper_claim` | 领取盐罐奖励 | `{ bottleType: -1 }` | - |

### 2.14 钓鱼系统 (2个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `artifact_lottery` | 钓鱼摇奖 | `{ lotteryNumber: 1, newFree: true, type: 1 }` | - |
| `artifact_exchange` | 钓鱼兑换 | `{}` | - |

### 2.15 功法系统 (4个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `legacy_getinfo` | 获取功法信息 | `{}` | - |
| `legacy_claimhangup` | 领取功法挂机奖励 | `{}` | - |
| `legacy_gift_send` | 赠送功法残卷 | `{ recipientId: 0, itemId: 0, quantity: 0 }` | - |
| `legacy_sendgift` | 发送功法残卷 | `{ itemCnt: 0, legacyUIds: [], targetId: 0 }` | - |

### 2.16 装备系统 (3个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `equipment_confirm` | 确认装备 | `{ heroId: 0, part: 0, quenchId: 0, quenches: {} }` | - |
| `equipment_quench` | 装备淬炼 | `{ heroId: 0, part: 0, quenchId: 0, quenches: {}, seed: 0, skipOrange: false }` | - |
| `equipment_updatequenchlock` | 更新淬炼锁定 | `{ heroId: 0, part: 0, slot: 0, isLocked: false }` | - |

### 2.17 答题系统 (3个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `study_startgame` | 开始答题 | `{}` | 8000ms |
| `study_answer` | 回答问题 | `{}` | - |
| `study_claimreward` | 领取答题奖励 | `{ rewardId: 1 }` | - |

### 2.18 换皮闯关 (2个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `towers_getinfo` | 获取闯关信息 | `{}` | 5000ms |
| `towers_start` | 开始闯关 | `{ towerType: 1 }` | 8000ms |

### 2.19 好友系统 (1个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `friend_batch` | 赠送好友金币 | `{ friendId: 0 }` | - |

### 2.20 排名系统 (3个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `rank_getserverrank` | 获取服务器排名 | `{}` | - |
| `rank_getroleinfo` | 获取排名角色信息 | `{}` | - |
| `bosstower_gethelprank` | 获取宝库帮助排名 | `{}` | - |

### 2.21 宝库/咸王相关 (4个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `bosstower_getinfo` | 获取宝库信息 | `{}` | 5000ms |
| `bosstower_startboss` | 宝库BOSS战 | `{}` | - |
| `bosstower_startbox` | 宝库开箱 | `{}` | - |
| `matchteam_getroleteaminfo` | 获取匹配队伍信息 | `{}` | - |

### 2.22 车辆相关 (6个)

| 命令 | 功能 | 参数 | 超时 |
|------|------|------|------|
| `car_getrolecar` | 获取角色车辆 | `{}` | 10000ms |
| `car_refresh` | 刷新车辆 | `{ carId: 0 }` | - |
| `car_claim` | 领取车辆奖励 | `{ carId: 0 }` | - |
| `car_send` | 发车 | `{ carId: 0, helperId: 0, text: "" }` | - |
| `car_getmemberhelpingcnt` | 获取成员帮助数 | `{}` | - |
| `car_research` | 车辆研究 | `{}` | - |

---

## 三、关于"十殿"(Hall)接口

### 搜索结果：

经过完整搜索工作区所有 `.js` 和 `.vue` 文件，**未找到与"十殿"、"hall"、"palace"、"lord"相关的接口定义**。

### 可能的原因：

1. **功能尚未实现**：十殿相关功能可能还没有在前端实现
2. **已作为其他功能集成**：可能被整合到其他模块（如装备系统、宝库系统等）
3. **使用不同的英文术语**：可能使用了其他名称

### 相关可能功能：

- **宝库系统**：`bosstower_*` - 可能与十殿相关
  - `bosstower_getinfo` - 获取宝库信息
  - `bosstower_startboss` - BOSS战
  - `bosstower_startbox` - 开箱

- **防御塔**：`tower_*` / `evotower_*` - 防守性游戏内容

---

## 四、实际调用示例汇总

### 4.1 完整的日常任务流程（来自 run_task.js）

```javascript
async function runDailyBasic(client, tokenName, delay = 500) {
  // 1. 获取角色信息
  const res = await client.sendWithPromise('role_getroleinfo', {}, 10000);
  const roleData = res?.role || null;

  // 2. 获取 battleVersion（重要！所有 fight_* 命令都需要）
  const battleVersionRes = await client.sendWithPromise('fight_startlevel', {}, 5000);
  const battleVersion = battleVersionRes?.battleData?.version;

  // 3. 保存当前阵容
  const teamInfo = await client.sendWithPromise('presetteam_getinfo', {}, 5000);
  const originalFormation = teamInfo?.presetTeamInfo?.useTeamId;

  // 4. 执行一系列命令
  await client.sendWithPromise('system_mysharecallback', { isSkipShareCard: true, type: 2 }, 5000);
  await sleep(delay);
  
  await client.sendWithPromise('friend_batch', { friendId: 0 }, 5000);
  await sleep(delay);
  
  await client.sendWithPromise('hero_recruit', { recruitType: 3, recruitNumber: 1 }, 5000);
  await sleep(delay);

  // 5. 恢复原阵容
  if (originalFormation !== null) {
    await client.sendWithPromise('presetteam_saveteam', { teamId: originalFormation }, 5000);
  }

  // 6. 领取各种奖励
  for (let taskId = 1; taskId <= 10; taskId++) {
    await client.sendWithPromise('task_claimdailypoint', { taskId }, 5000);
    await sleep(delay);
  }
  
  await client.sendWithPromise('task_claimdailyreward', { rewardId: 0 }, 5000);
  await client.sendWithPromise('task_claimweekreward', { rewardId: 0 }, 5000);
}
```

### 4.2 竞技场战斗示例

```javascript
async function runArenaFight(client, battleVersion, delay = 500) {
  // 获取当前阵容
  const teamInfo = await client.sendWithPromise('presetteam_getinfo', {}, 5000);
  const currentFormation = teamInfo?.presetTeamInfo?.useTeamId;
  
  // 切换到竞技场阵容
  await client.sendWithPromise('presetteam_saveteam', { teamId: 1 }, 5000);
  
  // 进行3场战斗
  for (let i = 0; i < 3; i++) {
    // 进入竞技场
    await client.sendWithPromise('arena_startarea', {}, 5000);
    
    // 获取目标
    const targets = await client.sendWithPromise('arena_getareatarget', { refresh: false }, 5000);
    const targetId = targets?.rankList?.[0]?.roleId;
    
    // 开战（必须包含 battleVersion）
    await client.sendWithPromise('fight_startareaarena', { 
      battleVersion, 
      targetId 
    }, 10000);
    
    await sleep(delay);
  }
  
  // 恢复原阵容
  await client.sendWithPromise('presetteam_saveteam', { teamId: currentFormation }, 5000);
}
```

---

## 五、关键要点

### 5.1 重要参数说明

| 参数 | 说明 | 使用例 |
|------|------|--------|
| `battleVersion` | 战斗系统版本号，所有 `fight_start*` 命令必须包含 | 从 `fight_startlevel` 响应获取 |
| `teamId` | 阵容ID，用于 `presetteam_saveteam` | 通常为 1-5 |
| `genieId` | 灯神ID，范围 1-4（魏蜀吴群） | `genie_sweep` 使用 |
| `taskId` | 任务ID | `task_claimdailypoint` 使用 |

### 5.2 超时设置建议

- **快速命令**：3000-5000ms（查询、签到等）
- **战斗命令**：8000-10000ms（涉及网络计算）
- **大量数据**：15000ms（获取详细信息）

### 5.3 错误代码

常见错误码可参考 [xyzwWebSocket.js](./src/utils/xyzwWebSocket.js) 中的 `errorCodeMap`：

- `200750`：缺少 battleVersion（战斗命令必须包含）
- `1500040`：上座塔奖励未领取
- `1500020`：能量不足
- `1500010`：已经全部通关

---

## 六、接口统计

- **总接口数**：93个
- **功能模块**：22个
- **最常用**：role_getroleinfo, presetteam_saveteam, task_claimdailypoint
- **特殊接口**：fight_startlevel（必须先调用获取 battleVersion）

---

最后更新：2026-03-27

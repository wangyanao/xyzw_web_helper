# 游戏接口快速参考表

## 最常用接口速查

### 基础操作
```javascript
// 获取角色信息
await client.sendWithPromise('role_getroleinfo', {}, 10000);

// 获取战斗版本（所有战斗命令必须先调用）
await client.sendWithPromise('fight_startlevel', {}, 5000);

// 获取/保存阵容
const team = await client.sendWithPromise('presetteam_getinfo', {}, 5000);
await client.sendWithPromise('presetteam_saveteam', { teamId: 1 }, 5000);
```

### 日常任务
```javascript
// 基础任务
await client.sendWithPromise('system_mysharecallback', { isSkipShareCard: true, type: 2 }, 5000);  // 分享/加钟
await client.sendWithPromise('friend_batch', { friendId: 0 }, 5000);                              // 赠送好友
await client.sendWithPromise('hero_recruit', { recruitType: 3, recruitNumber: 1 }, 5000);        // 免费招募
await client.sendWithPromise('system_buygold', { buyNum: 1 }, 5000);                               // 免费点金

// 签到相关
await client.sendWithPromise('system_signinreward', {}, 5000);           // 福利签到
await client.sendWithPromise('legion_signin', {}, 5000);                 // 俱乐部签到

// 领取奖励
await client.sendWithPromise('system_claimhangupreward', {}, 5000);      // 挂机奖励
await client.sendWithPromise('bottlehelper_claim', {}, 5000);            // 盐罐奖励
await client.sendWithPromise('mail_claimallattachment', {}, 5000);       // 邮件奖励

// 任务积分和周奖
for (let i = 1; i <= 10; i++) {
  await client.sendWithPromise('task_claimdailypoint', { taskId: i }, 5000);
}
await client.sendWithPromise('task_claimdailyreward', {}, 5000);   // 日常任务箱
await client.sendWithPromise('task_claimweekreward', {}, 5000);    // 周常任务箱
```

### 战斗系列
```javascript
// 竞技场（3次）
const battleVersion = /* 从 fight_startlevel 获取 */;
for (let i = 0; i < 3; i++) {
  await client.sendWithPromise('arena_startarea', {}, 5000);
  const targets = await client.sendWithPromise('arena_getareatarget', { refresh: false }, 5000);
  const targetId = targets?.rankList?.[0]?.roleId;
  await client.sendWithPromise('fight_startareaarena', { battleVersion, targetId }, 10000);
}

// 爬塔
for (let i = 0; i < maxEnergy; i++) {
  await client.sendWithPromise('fight_starttower', { battleVersion }, 8000);
}

// 怪异塔
await client.sendWithPromise('evotower_readyfight', {}, 5000);
await client.sendWithPromise('evotower_fight', { battleNum: 1, winNum: 1 }, 10000);

// BOSS战（宝库）
await client.sendWithPromise('bosstower_startboss', {}, 5000);
```

### 副本/活动
```javascript
// 灯神扫荡
await client.sendWithPromise('genie_sweep', { genieId: 1, sweepCnt: 5 }, 8000);

// 钓鱼
await client.sendWithPromise('artifact_lottery', { lotteryNumber: 1, newFree: true, type: 1 }, 5000);

// 答题
await client.sendWithPromise('study_startgame', {}, 8000);

// 咸王梦境（周日一三四）
await client.sendWithPromise('dungeon_selecthero', { battleTeam: { 0: 107 } }, 5000);

// 换皮闯关
await client.sendWithPromise('towers_start', { towerType: 1 }, 8000);
```

### 系统维护
```javascript
// 盐罐重置
await client.sendWithPromise('bottlehelper_stop', { bottleType: -1 }, 5000);
await client.sendWithPromise('bottlehelper_start', { bottleType: -1 }, 5000);

// 获取邮件
await client.sendWithPromise('mail_getlist', { category: [0, 4, 5], lastId: 0, size: 60 }, 5000);

// 军团操作
await client.sendWithPromise('legion_getinfo', {}, 5000);
await client.sendWithPromise('legion_storebuygoods', { id: 6 }, 5000);
```

---

## 接口命名规则

### 前缀含义
| 前缀 | 含义 | 示例 |
|------|------|------|
| `role_` | 角色相关 | role_getroleinfo |
| `fight_` | 战斗系列 | fight_startareaarena |
| `arena_` | 竞技场 | arena_getareatarget |
| `tower_` | 爬塔 | tower_claimreward |
| `evotower_` | 怪异塔 | evotower_fight |
| `bosstower_` | 宝库/BOSS塔 | bosstower_startboss |
| `legion_` | 军团 | legion_signin |
| `task_` | 任务 | task_claimdailypoint |
| `system_` | 系统 | system_claimhangupreward |
| `genie_` | 灯神 | genie_sweep |
| `artifact_` | 钓鱼/圣物 | artifact_lottery |
| `study_` | 答题 | study_startgame |
| `presetteam_` | 阵容管理 | presetteam_saveteam |
| `mail_` | 邮件 | mail_getlist |
| `mergebox_` | 合并宝箱 | mergebox_openbox |
| `car_` | 车辆 | car_getrolecar |
| `equipment_` | 装备 | equipment_quench |
| `hero_` | 英雄 | hero_recruit |
| `item_` | 物品 | item_openbox |
| `bottlehelper_` | 盐罐机器人 | bottlehelper_claim |
| `store_` | 商店 | store_purchase |
| `collection_` | 珍宝阁 | collection_claimfreereward |

---

## 调用超时时间建议

| 超时时间 | 适用接口 | 说明 |
|---------|---------|------|
| 3000ms | tower_claimreward | 快速确认 |
| 5000ms | 大多数查询/操作 | 标准超时 |
| 8000ms | 战斗系列（tower/boss） | 涉及运算 |
| 10000ms | fight_startareaarena, role_getroleinfo | 可能较慢 |
| 15000ms | 大量数据获取 | 如军团信息 |

---

## 常见组合流程

### 完整日常任务（30-40分钟）
```
1. 获取 roleInfo
2. 获取 battleVersion
3. 基础操作（签到/分享/招募/点金）
4. 竞技场3次
5. 爬塔（耗尽体力）
6. 怪异塔（耗尽能量）
7. 灯神扫荡
8. 钓鱼/答题
9. 领取各种奖励
10. 任务积分+周奖
```

### 快速日常（5-10分钟）
```
1. 签到（福利/俱乐部）
2. 领取挂机奖励
3. 领取邮件
4. 领取任务积分
5. 领取每日礼包
```

### 战斗集中（15-20分钟）
```
1. 获取 battleVersion
2. 竞技场3次
3. 爬塔
4. 怪异塔
```

---

## 错误处理示例

```javascript
async function safeExecute(client, cmd, params = {}, timeout = 5000, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.sendWithPromise(cmd, params, timeout);
    } catch (err) {
      console.log(`执行 ${cmd} 失败: ${err.message} (${i + 1}/${retries})`);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 2000));
      } else {
        throw err;
      }
    }
  }
}

// 使用
try {
  const result = await safeExecute(client, 'role_getroleinfo', {}, 10000, 3);
} catch (err) {
  console.error('最终失败:', err);
}
```

---

## Vue 组件中的使用模板

```vue
<script setup>
import { useTokenStore } from '@/stores/tokenStore';
import { ref } from 'vue';

const tokenStore = useTokenStore();
const loading = ref(false);
const error = ref(null);

async function executeCommand() {
  try {
    loading.value = true;
    error.value = null;
    
    const client = tokenStore.getWebSocketClient(tokenStore.selectedToken.id);
    if (!client) {
      error.value = '未找到 WebSocket 连接';
      return;
    }
    
    const result = await client.sendWithPromise('role_getroleinfo', {}, 10000);
    console.log('成功:', result);
  } catch (err) {
    error.value = err.message;
    console.error('错误:', err);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <button @click="executeCommand" :disabled="loading">{{ loading ? '执行中...' : '执行命令' }}</button>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
```

---

最后更新：2026-03-27 | 接口总数：93 | 功能模块：22

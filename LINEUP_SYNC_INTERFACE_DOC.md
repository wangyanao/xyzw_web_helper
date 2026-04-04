# 阵容助手与日常任务阵容同步接口说明

## 1. 目标

本文档用于说明两套功能的调用链路与接口：

- 阵容助手页面中的保存、切换、应用
- 日常任务中的阵容切换与后续战斗任务

并给出中午执行同步失败时的排查顺序。

---

## 2. 阵容助手页面链路

### 2.1 已保存阵容读取

前端读取：

- GET /api/lineups/{tokenId}
- 文件位置：src/components/cards/Unlimitedlineup.vue
- 关键函数：fetchLineupsFromBackend、loadSavedLineups

行为：

1. 按当前 tokenId 读取后端阵容
2. 读取成功后，刷新本地缓存作为离线兜底
3. token 切换时自动触发重新加载

### 2.2 已保存阵容保存

前端保存：

- PUT /api/lineups/{tokenId}
- 文件位置：src/components/cards/Unlimitedlineup.vue
- 关键函数：saveCurrentLineup、saveLineupsToStorage

行为：

1. 从游戏服取 role 与 presetteam 最新数据
2. 生成阵容快照（英雄、等级、鱼灵、鱼珠技能、科技、玩具）
3. 写入 ownerTokenId 与 ownerRoleId
4. 发送 PUT 同步到后端

后端校验：

- 文件位置：server/app.py
- 关键接口：PUT /api/lineups/<token_id>

行为：

1. lineups 必须是数组
2. 每一项必须是对象
3. 若携带 ownerTokenId，必须与 URL token_id 一致，否则 400
4. 入库前强制写 ownerTokenId = token_id

### 2.3 阵容应用到游戏

前端应用：

- 文件位置：src/components/cards/Unlimitedlineup.vue
- 关键函数：applyLineup

主要命令顺序：

1. role_getroleinfo
2. presetteam_getinfo
3. hero_exchange（必要时）
4. hero_gobackbattle / hero_gointobattle
5. hero_heroupgradelevel / hero_heroupgradeorder / hero_rebirth（按目标等级）
6. artifact_unload / artifact_load
7. pearl_unloadskill / pearl_replaceskill / pearl_exchangeskill
8. legion_resetresearch / legion_research
9. lordweapon_changedefaultweapon

---

## 3. 日常任务里的阵容切换链路

日常任务并不是调用阵容助手的 applyLineup，它是独立实现。

### 3.1 竞技场任务

- 文件位置：src/utils/batch/tasksArena.js

主要流程：

1. presetteam_getinfo 获取当前 useTeamId
2. 若与配置 arenaFormation 不同，调用 presetteam_saveteam 切换
3. 后续执行 arena_startarea 等竞技场命令

### 3.2 怪异塔任务

- 文件位置：src/utils/batch/tasksTower.js

主要流程：

1. presetteam_getinfo 获取当前 useTeamId
2. 若与配置 towerFormation 不同，调用 presetteam_saveteam 切换
3. 后续执行 evotower_getinfo / fight_starttower 等命令

### 3.3 DailyTaskRunner 通用切换

- 文件位置：src/utils/dailyTaskRunner.js
- 关键函数：ensureFormation

主要流程：

1. presetteam_getinfo
2. 比对 targetFormation
3. presetteam_saveteam
4. 若失败，进入强制切换分支再试一次

---

## 4. 今天中午“切换阵容同步失败”高概率原因

结合当前代码，优先排查以下问题：

1. WebSocket 状态不是 connected
2. token 的任务配置中 arenaFormation 或 towerFormation 为空、非法或超范围
3. presetteam_getinfo 返回结构异常，缺少 presetTeamInfo
4. presetteam_saveteam 成功返回但未生效，后续任务立即执行导致用旧阵容开战
5. 超时时间固定 5000ms，网络抖动时容易触发 timeout
6. 多任务并发触发时，阵容切换与战斗命令相互竞争

---

## 5. 建议你立刻加的观测日志

在任务日志中打印以下信息，能快速定位失败点：

1. tokenId、任务名、目标阵容编号
2. presetteam_getinfo 响应里的 useTeamId（切换前）
3. presetteam_saveteam 的响应
4. 再次 presetteam_getinfo 的 useTeamId（切换后确认）
5. 战斗命令发送前最终 useTeamId

---

## 6. 建议加固点（避免再次出现切换失败）

1. 切换后强制二次确认
   - presetteam_saveteam 后，再调一次 presetteam_getinfo
   - 若 useTeamId 仍不等于目标值，重试 1 到 2 次

2. 任务侧超时上调
   - 5000ms 提高到 8000 到 12000ms

3. 任务侧串行化同 token 的关键命令
   - 切换阵容与开战之间加短暂等待和确认

4. 统一复用 ensureFormation
   - 减少 tasksArena 与 tasksTower 中重复且略有差异的切换实现

---

## 7. 接口总表

### 后端 HTTP

- GET /api/lineups/{tokenId}
- PUT /api/lineups/{tokenId}
- DELETE /api/lineups/{tokenId}

### 游戏 WebSocket 关键命令

- presetteam_getinfo
- presetteam_saveteam
- hero_gointobattle
- hero_gobackbattle
- hero_exchange
- hero_heroupgradelevel
- hero_heroupgradeorder
- hero_rebirth
- artifact_load
- artifact_unload
- pearl_unloadskill
- pearl_replaceskill
- pearl_exchangeskill
- legion_resetresearch
- legion_research
- lordweapon_changedefaultweapon

---

## 8. 关键源码位置

- src/components/cards/Unlimitedlineup.vue
- src/utils/batch/tasksArena.js
- src/utils/batch/tasksTower.js
- src/utils/dailyTaskRunner.js
- src/stores/tokenStore.ts
- server/app.py

<template>
  <MyCard class="auto-hero-upgrade" :statusClass="{ active: state.isRunning }">
    <template #icon>
      <img src="/icons/legionCup.png" alt="自动升级图标" />
    </template>
    <template #title>
      <h3>武将自动升级</h3>
      <p>指定等级，一键升级至目标</p>
    </template>
    <template #badge>
      <span>{{ state.isRunning ? "运行中" : "已停止" }}</span>
    </template>

    <!-- 武将选择 -->
    <template #default>
      <div class="settings">
        <div class="setting-item">
          <span class="label">武将选择</span>
          <n-select
            v-model:value="selectedHeroId"
            :options="heroOptions"
            placeholder="选择武将"
            @update:value="handleHeroSelect"
          />
        </div>
      </div>
    </template>

    <!-- 升级控制 -->
    <template #action>
      <div class="action-container" v-if="selectedHeroInfo">
        <!-- 武将信息展示 -->
        <div class="hero-display">
          <div class="hero-avatar">
            <img :src="selectedHeroInfo.avatar" :alt="selectedHeroInfo.name" />
          </div>
          <div class="hero-info">
            <div class="hero-name">{{ selectedHeroInfo.name }}</div>
            <div class="hero-level">
              等级: {{ selectedHeroInfo.level }}/6000
            </div>
            <div class="hero-order">
              进阶: {{ selectedHeroInfo.order }}
            </div>
          </div>
        </div>

        <!-- 目标等级输入 -->
        <div class="level-control">
          <div class="control-item">
            <span class="label">目标等级</span>
            <n-input-number
              v-model:value="targetLevel"
              :min="selectedHeroInfo.level + 1"
              :max="6000"
              :step="1"
              placeholder="输入目标等级"
              :disabled="state.isRunning"
              clearable
            />
          </div>
          <div class="level-info">
            <span class="info-text">
              需升级: {{ Math.max(0, targetLevel - selectedHeroInfo.level) }}级
            </span>
          </div>

          <!-- 未测量时：显示测试按钮 -->
          <div v-if="targetLevel && state.speedGrowthPerLevel === null" class="probe-section">
            <n-button
              size="small"
              :loading="state.probing"
              :disabled="state.isRunning || state.probing"
              @click="probeGrowthRate"
            >
              {{ state.probing ? '测试中...' : '测试成长率（升1级）' }}
            </n-button>
            <span class="probe-hint">升1级来测量该武将的实际成长率</span>
          </div>

          <!-- 已测量：显示属性预测 -->
          <div v-if="estimatedPropertyAtTarget" class="estimated-property">
            <div class="estimated-title">✓ 基于实测成长率的属性预测</div>
            <div class="property-comparison">
              <div class="property-item">
                <span class="property-label">攻击</span>
                <span class="property-current">{{ selectedHeroInfo.attack }}</span>
                <span class="property-arrow">→</span>
                <span class="property-target">{{ estimatedPropertyAtTarget.attack }}</span>
              </div>
              <div class="property-item">
                <span class="property-label">速度</span>
                <span class="property-current">{{ selectedHeroInfo.speed }}</span>
                <span class="property-arrow">→</span>
                <span class="property-target">{{ estimatedPropertyAtTarget.speed }}</span>
              </div>
            </div>
            <div class="growth-rate-info">
              <span>成长率: 攻击 {{ state.attackGrowthPerLevel.toFixed(2) }}/级, 速度 {{ state.speedGrowthPerLevel.toFixed(2) }}/级</span>
            </div>
          </div>
        </div>

        <!-- 进度显示 -->
        <div v-if="state.isRunning" class="progress-display">
          <n-progress
            :percentage="progressPercentage"
            :show-indicator="false"
            processing
          />
          <div class="progress-text">
            {{ state.progressText }}
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="button-group">
          <n-button
            type="primary"
            size="small"
            :disabled="!canStartUpgrade || state.isRunning"
            :loading="state.isRunning"
            @click="startAutoUpgrade"
          >
            {{ state.isRunning ? "升级中..." : "开始升级" }}
          </n-button>
          <n-button
            v-if="state.isRunning"
            type="error"
            size="small"
            @click="stopUpgrade"
          >
            停止
          </n-button>
        </div>

        <!-- 日志显示 -->
        <div v-if="state.logs.length > 0" class="logs-display">
          <div class="logs-title">升级日志</div>
          <div class="logs-content">
            <div
              v-for="(log, index) in state.logs.slice(-5)"
              :key="index"
              class="log-item"
              :class="log.level"
            >
              <span class="log-time">{{ log.time }}</span>
              <span class="log-msg">{{ log.msg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 未选择武将时的提示 -->
      <div v-else class="empty-state">
        <p>请先选择武将</p>
      </div>
    </template>
  </MyCard>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useMessage } from "naive-ui";
import { useTokenStore } from "@/stores/tokenStore";
import MyCard from "../Common/MyCard.vue";
import { HERO_DICT } from "@/utils/HeroList";

const tokenStore = useTokenStore();
const message = useMessage();

// 响应式数据
const selectedHeroId = ref(null);
const targetLevel = ref(null);
const state = ref({
  isRunning: false,
  probing: false,             // 是否正在测试成长率
  progressText: "待开始",
  logs: [],
  stopRequested: false,
  speedGrowthPerLevel: null,  // 记录实际的每级速度成长
  attackGrowthPerLevel: null, // 记录实际的每级攻击成长
});

// 计算属性
const heroOptions = computed(() => {
  const heroes = Object.values(tokenStore.gameData.roleInfo?.role?.heroes || {});
  return heroes
    .filter((hero) => hero.level < 6000)
    .map((hero) => ({
      label: `${HERO_DICT[hero.heroId]?.name || hero.heroId} (${hero.level}/6000)`,
      value: hero.heroId,
    }));
});

const selectedHeroInfo = computed(() => {
  if (!selectedHeroId.value) return null;
  const hero = tokenStore.gameData.roleInfo?.role?.heroes?.[selectedHeroId.value];
  if (!hero) return null;
  return {
    ...hero,
    avatar: HERO_DICT[hero.heroId]?.avatar || "",
    name: HERO_DICT[hero.heroId]?.name || hero.heroId,
  };
});

const canStartUpgrade = computed(() => {
  return (
    selectedHeroId.value &&
    targetLevel.value &&
    targetLevel.value > selectedHeroInfo.value?.level &&
    targetLevel.value <= 6000 &&
    !state.value.isRunning
  );
});

const progressPercentage = computed(() => {
  if (!selectedHeroInfo.value) return 0;
  const current = selectedHeroInfo.value.level;
  const target = targetLevel.value || 6000;
  const original = targetLevel.value - current;
  const progress = (current - selectedHeroInfo.value.level) / original;
  return Math.min(100, Math.round(progress * 100));
});

/**
 * 根据实际或预估的成长率计算目标等级时的属性
 * - 如果已测量成长率，使用实际值
 * - 如果未测量，使用保守的线性估计
 */
const estimatedPropertyAtTarget = computed(() => {
  // 只有测量过成长率才显示预测
  if (
    !selectedHeroInfo.value ||
    !targetLevel.value ||
    state.value.speedGrowthPerLevel === null
  ) {
    return null;
  }

  const current = selectedHeroInfo.value;
  const currentLevel = current.level;
  const targetLvl = targetLevel.value;

  if (targetLvl <= currentLevel) {
    return null;
  }

  const levelDiff = targetLvl - currentLevel;

  // 计算目标属性（基础属性 + 每级增长 × 提升的级数）
  const estimatedAttack = Math.round(
    current.attack + state.value.attackGrowthPerLevel * levelDiff
  );
  const estimatedSpeed = Math.round(
    current.speed + state.value.speedGrowthPerLevel * levelDiff
  );

  return {
    attack: estimatedAttack,
    speed: estimatedSpeed,
  };
});

// 方法
const handleHeroSelect = () => {
  targetLevel.value = null;
  state.value.logs = [];
  state.value.speedGrowthPerLevel = null;
  state.value.attackGrowthPerLevel = null;
};

const addLog = (msg, level = "info") => {
  const time = new Date().toLocaleTimeString("zh-CN");
  state.value.logs.push({ msg, level, time });
};

/**
 * 测试成长率：升1级来测量该武将的实际每级成长值
 */
const probeGrowthRate = async () => {
  if (!tokenStore.selectedToken || !selectedHeroId.value) {
    message.warning("请先选择武将");
    return;
  }

  const tokenId = tokenStore.selectedToken.id;
  const wsStatus = tokenStore.getWebSocketStatus(tokenId);
  if (wsStatus !== "connected") {
    message.error("WebSocket未连接");
    return;
  }

  const beforeAttack = selectedHeroInfo.value.attack;
  const beforeSpeed = selectedHeroInfo.value.speed;
  const beforeLevel = selectedHeroInfo.value.level;

  state.value.probing = true;

  try {
    // 升1级
    const res = await tokenStore.sendMessageWithPromise(
      tokenId,
      "hero_heroupgradelevel",
      { heroId: selectedHeroId.value, upgradeNum: 1 },
      5000
    );

    const newHero = res?.role?.heroes?.[selectedHeroId.value];
    if (newHero) {
      const afterAttack = newHero.attack;
      const afterSpeed = newHero.speed;

      state.value.attackGrowthPerLevel = afterAttack - beforeAttack;
      state.value.speedGrowthPerLevel = afterSpeed - beforeSpeed;

      message.success(
        `成长率已测量：攻击 +${state.value.attackGrowthPerLevel}/级，速度 +${state.value.speedGrowthPerLevel}/级`
      );

      // 刷新游戏数据
      tokenStore.sendMessage(tokenId, "role_getroleinfo");
    } else {
      message.warning("升级响应异常，请重试");
    }
  } catch (e) {
    message.error(`测试失败: ${e.message}`);
  } finally {
    state.value.probing = false;
  }
};

const startAutoUpgrade = async () => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }

  if (!selectedHeroId.value || !targetLevel.value) {
    message.warning("请选择武将并输入目标等级");
    return;
  }

  if (targetLevel.value <= selectedHeroInfo.value.level) {
    message.warning("目标等级必须高于当前等级");
    return;
  }

  if (targetLevel.value > 6000) {
    message.warning("目标等级不能超过6000");
    return;
  }

  // 进阶等级阈值
  const LEVEL_BREAKPOINTS = [
    { level: 100, order: 1 },
    { level: 200, order: 2 },
    { level: 300, order: 3 },
    { level: 500, order: 4 },
    { level: 700, order: 5 },
    { level: 900, order: 6 },
    { level: 1100, order: 7 },
    { level: 1300, order: 8 },
    { level: 1500, order: 9 },
    { level: 1800, order: 10 },
    { level: 2100, order: 11 },
    { level: 2400, order: 12 },
    { level: 2800, order: 13 },
    { level: 3200, order: 14 },
    { level: 3600, order: 15 },
    { level: 4000, order: 16 },
    { level: 4500, order: 17 },
    { level: 5000, order: 18 },
    { level: 5500, order: 19 },
  ];

  /**
   * 找到当前等级到目标等级之间，下一个需要进阶的阈值等级
   * 返回该阈值等级，如果没有则返回 null
   */
  const getNextBreakpoint = (currentLevel, currentOrder, target) => {
    for (const bp of LEVEL_BREAKPOINTS) {
      if (bp.level > currentLevel && bp.level <= target && bp.order > currentOrder) {
        return bp;
      }
    }
    return null;
  };

  state.value.isRunning = true;
  state.value.stopRequested = false;
  state.value.logs = [];
  state.value.progressText = "初始化中...";
  addLog(`开始升级武将至 ${targetLevel.value} 级...`, "info");

  try {
    const tokenId = tokenStore.selectedToken.id;
    let currentLevel = selectedHeroInfo.value.level;
    let currentOrder = selectedHeroInfo.value.order;
    let upgradeCount = 0;

    while (currentLevel < targetLevel.value && !state.value.stopRequested) {
      // 先检查当前等级是否正好在进阶点上，如果是则先进阶
      const atBreakpoint = LEVEL_BREAKPOINTS.find(
        (b) => b.level === currentLevel && b.order > currentOrder
      );
      if (atBreakpoint) {
        state.value.progressText = `到达进阶阈值 ${currentLevel} 级，执行进阶...`;
        addLog(
          `📈 到达进阶阈值 ${currentLevel} 级，执行进阶...`,
          "info"
        );
        try {
          const advRes = await tokenStore.sendMessageWithPromise(
            tokenId,
            "hero_heroupgradeorder",
            { heroId: selectedHeroId.value },
            5000
          );
          const newHero = advRes?.role?.heroes?.[selectedHeroId.value];
          if (newHero) {
            currentOrder = newHero.order || currentOrder;
            addLog(`✓ 进阶成功，当前进阶等级: ${currentOrder}`, "success");
          } else {
            addLog(`⚠️  进阶响应异常`, "warning");
          }
        } catch (e) {
          addLog(`⚠️  进阶失败: ${e.message}`, "warning");
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      // 计算本次升级的步长：不能越过下一个进阶点
      const nextBp = getNextBreakpoint(currentLevel, currentOrder, targetLevel.value);
      let stepTarget;  // 本轮升级的终点

      if (nextBp && nextBp.level <= currentLevel + 50) {
        // 下一个进阶点在 50 级以内，先升到进阶点
        stepTarget = nextBp.level;
      } else {
        // 没有进阶点阻挡，正常升 50 或到目标
        stepTarget = Math.min(currentLevel + 50, targetLevel.value);
      }

      const need = stepTarget - currentLevel;

      if (need <= 0) {
        break; // 避免死循环
      }

      // 将 need 拆解为合法步长 [50, 10, 5, 1] 的组合
      const VALID_STEPS = [50, 10, 5, 1];
      const steps = [];
      let remaining = need;
      for (const s of VALID_STEPS) {
        while (remaining >= s) {
          steps.push(s);
          remaining -= s;
        }
      }

      state.value.progressText = `升级中... (${currentLevel}→${stepTarget}，共${steps.length}步)`;
      addLog(
        `升级中... (当前 ${currentLevel}→${stepTarget}，升${need}级，分${steps.length}步)`,
        "info"
      );

      let stepFailed = false;
      const beforeAttack = selectedHeroInfo.value.attack;
      const beforeSpeed = selectedHeroInfo.value.speed;
      const beforeLevel = currentLevel;

      for (const step of steps) {
        if (state.value.stopRequested) break;
        try {
          const upgradeRes = await tokenStore.sendMessageWithPromise(
            tokenId,
            "hero_heroupgradelevel",
            { heroId: selectedHeroId.value, upgradeNum: step },
            5000
          );

          const newHero = upgradeRes?.role?.heroes?.[selectedHeroId.value];
          if (newHero) {
            currentLevel = newHero.level || currentLevel;
            currentOrder = newHero.order || currentOrder;

            // 第一轮升级完成后测量成长率
            if (state.value.speedGrowthPerLevel === null && currentLevel > beforeLevel) {
              const levelGained = currentLevel - beforeLevel;
              const speedIncrease = (newHero.speed || beforeSpeed) - beforeSpeed;
              const attackIncrease = (newHero.attack || beforeAttack) - beforeAttack;
              state.value.speedGrowthPerLevel = speedIncrease / levelGained;
              state.value.attackGrowthPerLevel = attackIncrease / levelGained;
              addLog(
                `📊 已测量成长率: 速度/级 ${state.value.speedGrowthPerLevel.toFixed(2)}, 攻击/级 ${state.value.attackGrowthPerLevel.toFixed(2)}`,
                "info"
              );
            }
          }
          await new Promise((r) => setTimeout(r, 200));
        } catch (e) {
          addLog(`升级失败(+${step}): ${e.message}`, "error");
          stepFailed = true;
          break;
        }
      }

      if (stepFailed) break;

      upgradeCount++;
      addLog(
        `✓ 升级成功，当前等级: ${currentLevel}/6000，进阶: ${currentOrder}`,
        "success"
      );

      await new Promise((r) => setTimeout(r, 500));
    }

    if (state.value.stopRequested) {
      addLog("⊘ 升级已被用户中止", "warning");
    } else {
      // 最终验证
      try {
        const finalRes = await tokenStore.sendMessageWithPromise(
          tokenId,
          "role_getroleinfo",
          {},
          8000
        );
        const finalHero = finalRes?.role?.heroes?.[selectedHeroId.value];
        if (finalHero) {
          currentLevel = finalHero.level || currentLevel;
          currentOrder = finalHero.order || currentOrder;
        }
      } catch (e) {
        addLog(`最终验证失败: ${e.message}`, "warning");
      }

      if (currentLevel >= targetLevel.value) {
        addLog(
          `✅ 升级完成！共升级 ${upgradeCount}次，最终等级: ${currentLevel}/6000，进阶: ${currentOrder}`,
          "success"
        );
        
        // 显示测量到的成长率
        if (state.value.speedGrowthPerLevel !== null) {
          addLog(
            `📊 最终测量成长率: 速度/级 ${state.value.speedGrowthPerLevel.toFixed(2)}, 攻击/级 ${state.value.attackGrowthPerLevel.toFixed(2)}`,
            "info"
          );
        }
        
        message.success("武将升级完成");
        state.value.progressText = "已完成";
      } else {
        addLog(
          `ℹ️  升级停止，当前等级: ${currentLevel}/6000`,
          "info"
        );
        state.value.progressText = "已停止";
      }
    }
  } catch (error) {
    const errorMsg = error?.message || String(error);
    addLog(`❌ 错误: ${errorMsg}`, "error");
    message.error(`升级出错: ${errorMsg}`);
    state.value.progressText = "已出错";
  } finally {
    state.value.isRunning = false;
  }
};

const stopUpgrade = () => {
  state.value.stopRequested = true;
  state.value.isRunning = false;
  addLog("⊘ 升级已停止", "warning");
  message.warning("升级已停止");
};

// 监听游戏数据变化，自动更新选中的武将信息
watch(
  () => tokenStore.gameData.roleInfo?.role?.heroes,
  () => {
    if (selectedHeroInfo.value && !state.value.isRunning) {
      // 刷新显示数据
    }
  },
  { deep: true },
);
</script>

<style scoped lang="scss">
.auto-hero-upgrade {
  .settings {
    margin-bottom: 16px;

    .setting-item {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .label {
        font-weight: 500;
        font-size: 14px;
      }
    }
  }

  .action-container {
    display: flex;
    flex-direction: column;
    gap: 16px;

    .hero-display {
      display: flex;
      gap: 12px;
      padding: 12px;
      background: var(--card-bg);
      border-radius: 8px;
      align-items: center;

      .hero-avatar {
        width: 60px;
        height: 60px;
        border-radius: 8px;
        overflow: hidden;
        flex-shrink: 0;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .hero-info {
        flex: 1;

        .hero-name {
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 4px;
        }

        .hero-level,
        .hero-order {
          font-size: 12px;
          color: var(--text-color-2);
        }
      }
    }

    .level-control {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .control-item {
        display: flex;
        flex-direction: column;
        gap: 4px;

        .label {
          font-weight: 500;
          font-size: 14px;
        }
      }

      .level-info {
        .info-text {
          font-size: 12px;
          color: var(--text-color-2);
        }
      }

      .probe-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px;
        background: var(--card-bg);
        border-radius: 8px;
        border-left: 3px solid #1890ff;

        .probe-hint {
          font-size: 11px;
          color: var(--text-color-3);
        }
      }

      .estimated-property {
        padding: 12px;
        background: var(--card-bg);
        border-radius: 8px;
        border-left: 3px solid #52c41a;

        .estimated-title {
          font-weight: 600;
          font-size: 12px;
          color: #52c41a;
          margin-bottom: 8px;
        }

        .property-comparison {
          display: flex;
          flex-direction: column;
          gap: 6px;

          .property-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;

            .property-label {
              min-width: 40px;
              font-weight: 500;
            }

            .property-current {
              color: var(--text-color-2);
            }

            .property-arrow {
              color: var(--text-color-3);
            }

            .property-target {
              font-weight: 600;
              color: #ff7a45;
            }
          }
        }

        .growth-rate-info {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--text-color-3);
          font-size: 11px;
          color: #52c41a;
          font-weight: 500;
        }

        .estimated-note {
          margin-top: 8px;
          font-size: 11px;
          color: var(--text-color-3);
          font-style: italic;
        }
      }
    }

    .progress-display {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--card-bg);
      border-radius: 8px;

      .progress-text {
        text-align: center;
        font-size: 12px;
        color: var(--text-color-2);
        font-weight: 500;
      }
    }

    .button-group {
      display: flex;
      gap: 8px;
      justify-content: space-between;
    }

    .logs-display {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--card-bg);
      border-radius: 8px;

      .logs-title {
        font-weight: 600;
        font-size: 12px;
        color: var(--text-color-2);
      }

      .logs-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 200px;
        overflow-y: auto;

        .log-item {
          display: flex;
          gap: 8px;
          font-size: 11px;
          line-height: 1.4;

          .log-time {
            color: var(--text-color-3);
            flex-shrink: 0;
          }

          .log-msg {
            flex: 1;
            word-break: break-word;
          }

          &.success {
            color: #31a944;
          }

          &.error {
            color: #d63031;
          }

          &.warning {
            color: #f39c12;
          }

          &.info {
            color: var(--text-color-2);
          }
        }
      }
    }
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    color: var(--text-color-2);
    font-size: 14px;
    text-align: center;
  }
}
</style>

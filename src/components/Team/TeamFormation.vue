<template>
  <div class="status-card team-formation-card">
    <div class="card-header">
      <img
        src="/icons/Ob7pyorzmHiJcbab2c25af264d0758b527bc1b61cc3b.png"
        alt="阵容"
        class="icon"
      />
      <div class="info">
        <h3>阵容</h3>
        <p>当前使用的战斗阵容</p>
      </div>
      <div class="team-selector">
        <button
          v-for="teamId in availableTeams"
          :key="teamId"
          :disabled="loading || switching"
          :class="[
            'team-button',
            {
              active: currentTeam === teamId,
              virtual: isVirtualTemplateTeam(teamId),
            },
          ]"
          @click="selectTeam(teamId)"
        >
          {{ teamId }}
        </button>
        <button
          class="refresh-button"
          :disabled="loading"
          title="刷新队伍数据"
          @click="refreshTeamData(true)"
        >
          <svg
            class="refresh-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M3 21v-5h5" />
          </svg>
          <span class="refresh-text">刷新</span>
        </button>
      </div>
    </div>

    <div class="card-content">
      <div class="current-team-info">
        <span class="label">当前阵容</span>
        <span class="team-number">
          <template v-if="!loading">
            {{ isCurrentVirtualTeam ? `模板 ${currentTeam}` : `阵容 ${currentTeam}` }}
          </template>
          <template v-else>加载中…</template>
        </span>
      </div>

      <div class="team-meta-row">
        <span :class="['team-kind-badge', isCurrentVirtualTeam ? 'virtual' : 'real']">
          {{ isCurrentVirtualTeam ? '本地模板' : '真实阵容' }}
        </span>
        <span v-if="isCurrentVirtualTeam" class="team-kind-note">
          仅保存在本地，可供后续支持 battleTeam 的功能复用
        </span>
      </div>

      <div class="heroes-container">
        <div v-if="!loading" class="heroes-formation">
          <!-- 前排 2个 -->
          <div class="formation-row front-row">
            <div
              v-for="hero in currentTeamHeroes.slice(0, 2)"
              :key="hero.id || hero.name"
              class="hero-item"
            >
              <div class="hero-circle">
                <img
                  v-if="hero.avatar"
                  :src="hero.avatar"
                  :alt="hero.name"
                  class="hero-avatar"
                />
                <div v-else class="hero-placeholder">
                  {{ hero.name?.substring(0, 2) || "?" }}
                </div>
              </div>
              <span class="hero-name">{{ hero.name || "未知" }}</span>
            </div>
          </div>
          <!-- 后排 3个 -->
          <div class="formation-row back-row">
            <div
              v-for="hero in currentTeamHeroes.slice(2)"
              :key="hero.id || hero.name"
              class="hero-item"
            >
              <div class="hero-circle">
                <img
                  v-if="hero.avatar"
                  :src="hero.avatar"
                  :alt="hero.name"
                  class="hero-avatar"
                />
                <div v-else class="hero-placeholder">
                  {{ hero.name?.substring(0, 2) || "?" }}
                </div>
              </div>
              <span class="hero-name">{{ hero.name || "未知" }}</span>
            </div>
          </div>
        </div>

        <div v-if="!loading && !currentTeamHeroes.length" class="empty-team">
          <p>{{ isCurrentVirtualTeam ? '当前模板为空，请在下方配置阵容' : '暂无队伍信息' }}</p>
        </div>
        <div v-if="loading" class="empty-team">
          <p>正在加载队伍信息…</p>
        </div>
      </div>

      <div v-if="isCurrentVirtualTeam" class="virtual-editor">
        <div class="virtual-editor-header">
          <span class="virtual-editor-title">模板配置</span>
          <span class="virtual-editor-hint">不会写回游戏服务器</span>
        </div>

        <div class="virtual-editor-toolbar">
          <label class="toolbar-group">
            <span>复制来源</span>
            <select v-model.number="copySourceTeam" class="editor-select compact">
              <option v-for="teamId in realTeamIds" :key="teamId" :value="teamId">
                真实阵容 {{ teamId }}
              </option>
            </select>
          </label>

          <button
            class="editor-button"
            :disabled="!realTeamIds.length"
            @click="copyRealTeamToVirtual"
          >
            复制到当前模板
          </button>

          <button class="editor-button secondary" @click="clearCurrentVirtualTeam">
            清空模板
          </button>
        </div>

        <div class="virtual-editor-grid">
          <label v-for="pos in teamSlots" :key="pos" class="editor-slot">
            <span class="editor-slot-label">{{ positionLabels[pos] }}</span>
            <select
              class="editor-select"
              :value="getVirtualSlotHeroId(pos)"
              @change="onVirtualSlotChange(pos, $event)"
            >
              <option :value="0">空位</option>
              <option v-for="hero in ownedHeroOptions" :key="hero.id" :value="hero.id">
                {{ hero.name }} · Lv.{{ hero.level }}
              </option>
            </select>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useTokenStore } from "@/stores/tokenStore";
import { useMessage } from "naive-ui";
import { HERO_DICT } from "@/utils/HeroList.js";

const tokenStore = useTokenStore();
const message = useMessage();

const MAX_TEAM_ID = 6;
const VIRTUAL_TEMPLATE_START = 3;
const teamSlots = [0, 1, 2, 3, 4];
const positionLabels = ["前排 1", "前排 2", "后排 1", "后排 2", "后排 3"];

const loading = ref(false);
const switching = ref(false);
const currentTeam = ref(1);
const availableTeams = ref<number[]>([1, 2, 3, 4, 5, 6]);
const copySourceTeam = ref(1);
const virtualTemplates = ref<Record<number, Record<string, number>>>({});

const wsStatus = computed(() => {
  if (!tokenStore.selectedToken) return "disconnected";
  return tokenStore.getWebSocketStatus(tokenStore.selectedToken.id);
});

const presetTeamRaw = computed(() => tokenStore.gameData?.presetTeam ?? null);
const ownedHeroesMap = computed(
  () => (tokenStore.gameData as any)?.roleInfo?.role?.heroes || {},
);

function buildEmptyTemplate() {
  return {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
  };
}

function getVirtualTemplateStorageKey(tokenId: string | number) {
  return `virtual-team-templates:${tokenId}`;
}

function normalizeTemplate(template: any) {
  const normalized = buildEmptyTemplate();
  for (const pos of teamSlots) {
    const value = Number(template?.[String(pos)] || 0);
    normalized[String(pos)] = Number.isFinite(value) ? value : 0;
  }
  return normalized;
}

function loadVirtualTemplates(tokenId: string | number) {
  try {
    const raw = localStorage.getItem(getVirtualTemplateStorageKey(tokenId));
    if (!raw) {
      virtualTemplates.value = {};
      return;
    }
    const parsed = JSON.parse(raw);
    const nextTemplates: Record<number, Record<string, number>> = {};
    for (let teamId = VIRTUAL_TEMPLATE_START; teamId <= MAX_TEAM_ID; teamId++) {
      if (parsed?.[teamId]) {
        nextTemplates[teamId] = normalizeTemplate(parsed[teamId]);
      }
    }
    virtualTemplates.value = nextTemplates;
  } catch (error) {
    console.warn("加载虚拟阵容模板失败:", error);
    virtualTemplates.value = {};
  }
}

function persistVirtualTemplates() {
  const tokenId = tokenStore.selectedToken?.id;
  if (!tokenId) return;
  localStorage.setItem(
    getVirtualTemplateStorageKey(tokenId),
    JSON.stringify(virtualTemplates.value),
  );
}

function getHeroAvatar(heroId: number) {
  const avatarPath = HERO_DICT[heroId]?.avatar;
  return avatarPath
    ? import.meta.env.BASE_URL + avatarPath.replace(/^\//, "")
    : undefined;
}

function teamInfoToHeroes(teamInfo: Record<string, any> | null, isVirtual = false) {
  if (!teamInfo) return [] as any[];
  const heroes: any[] = [];
  for (const [pos, hero] of Object.entries(teamInfo)) {
    const heroId = Number(
      isVirtual ? hero : (hero as any)?.heroId ?? (hero as any)?.id ?? 0,
    );
    if (!heroId) continue;
    const meta = HERO_DICT[heroId];
    const ownedHero = (ownedHeroesMap.value as any)?.[heroId];
    heroes.push({
      id: heroId,
      name: meta?.name ?? `英雄${heroId}`,
      type: meta?.type ?? "",
      position: Number(pos),
      level: ownedHero?.level ?? (hero as any)?.level ?? 1,
      avatar: getHeroAvatar(heroId),
    });
  }
  heroes.sort((a, b) => a.position - b.position);
  return heroes;
}

function normalizePresetTeam(raw: any) {
  if (!raw)
    return {
      useTeamId: 1,
      teams: {} as Record<number, { teamInfo: Record<string, any> }>,
    };
  const root = raw.presetTeamInfo ?? raw;
  const findUseIdRec = (obj: any): number | null => {
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.useTeamId === "number") return obj.useTeamId;
    for (const k of Object.keys(obj)) {
      const v = findUseIdRec(obj[k]);
      if (v) return v;
    }
    return null;
  };
  const useTeamId =
    root.useTeamId ?? root.presetTeamInfo?.useTeamId ?? findUseIdRec(root) ?? 1;

  const dict = root.presetTeamInfo ?? root;
  const teams: Record<number, { teamInfo: Record<string, any> }> = {};
  const ids = Object.keys(dict || {}).filter((k) => /^\d+$/.test(k));
  for (const idStr of ids) {
    const id = Number(idStr);
    const node = dict[idStr];
    if (!node) {
      teams[id] = { teamInfo: {} };
      continue;
    }
    if (node.teamInfo) {
      teams[id] = { teamInfo: node.teamInfo };
    } else if (node.heroes) {
      const ti: Record<string, any> = {};
      node.heroes.forEach((h: any, idx: number) => {
        ti[String(idx + 1)] = h;
      });
      teams[id] = { teamInfo: ti };
    } else if (typeof node === "object") {
      const hasHero = Object.values(node).some(
        (v: any) => v && typeof v === "object" && "heroId" in v,
      );
      teams[id] = { teamInfo: hasHero ? node : {} };
    } else {
      teams[id] = { teamInfo: {} };
    }
  }
  return { useTeamId: Number(useTeamId) || 1, teams };
}

const presetTeam = computed(() => normalizePresetTeam(presetTeamRaw.value));
const realTeamIds = computed(() =>
  Object.keys(presetTeam.value.teams)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b),
);
const ownedHeroOptions = computed(() =>
  Object.values(ownedHeroesMap.value as Record<string, any>)
    .map((hero: any) => ({
      id: Number(hero.heroId),
      name: HERO_DICT[Number(hero.heroId)]?.name ?? `英雄${hero.heroId}`,
      level: Number(hero.level || 1),
      power: Number(hero.power || 0),
    }))
    .filter((hero) => hero.id > 0)
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      return b.power - a.power;
    }),
);

const isVirtualTemplateTeam = (teamId: number) =>
  teamId >= VIRTUAL_TEMPLATE_START &&
  teamId <= MAX_TEAM_ID &&
  !realTeamIds.value.includes(teamId);

const isCurrentVirtualTeam = computed(() =>
  isVirtualTemplateTeam(currentTeam.value),
);

function getRealTeamInfo(teamId: number) {
  return ((presetTeam.value.teams as any)?.[teamId]?.teamInfo || null) as
    | Record<string, any>
    | null;
}

function getVirtualTeamTemplate(teamId: number) {
  return virtualTemplates.value[teamId] || buildEmptyTemplate();
}

const currentTeamHeroes = computed(() => {
  if (isCurrentVirtualTeam.value) {
    return teamInfoToHeroes(getVirtualTeamTemplate(currentTeam.value), true);
  }
  return teamInfoToHeroes(getRealTeamInfo(currentTeam.value));
});

const executeGameCommand = async (
  tokenId: string | number,
  cmd: string,
  params = {},
  description = "",
  timeout = 8000,
) => {
  try {
    return await tokenStore.sendMessageWithPromise(
      String(tokenId),
      cmd,
      params,
      timeout,
    );
  } catch (error: any) {
    if (description)
      message.error(`${description}失败：${error?.message ?? error}`);
    throw error;
  }
};

const getTeamInfoWithCache = async (force = false) => {
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return null;
  }
  const tokenId = tokenStore.selectedToken.id;
  if (!force) {
    const cached = (tokenStore.gameData as any)?.presetTeam?.presetTeamInfo;
    if (cached) return cached;
  }
  loading.value = true;
  try {
    const result = await executeGameCommand(
      tokenId,
      "presetteam_getinfo",
      {},
      "获取阵容信息",
    );
    tokenStore.$patch((state: any) => {
      state.gameData = { ...(state.gameData ?? {}), presetTeam: result };
    });
    return result?.presetTeamInfo ?? null;
  } catch (e) {
    console.error("获取阵容信息失败:", e);
    return null;
  } finally {
    loading.value = false;
  }
};

const updateAvailableTeams = () => {
  availableTeams.value = Array.from({ length: MAX_TEAM_ID }, (_, i) => i + 1);
};
const updateCurrentTeam = (forceServerTeam = false) => {
  const serverTeamId = (presetTeam.value as any).useTeamId || 1;
  if (forceServerTeam || !isVirtualTemplateTeam(currentTeam.value)) {
    currentTeam.value = serverTeamId;
  }
};

const getVirtualSlotHeroId = (pos: number) =>
  Number(getVirtualTeamTemplate(currentTeam.value)?.[String(pos)] || 0);

const updateVirtualSlot = (pos: number, heroId: number) => {
  const nextTemplate = {
    ...getVirtualTeamTemplate(currentTeam.value),
  };

  if (heroId > 0) {
    for (const slot of teamSlots) {
      if (slot !== pos && Number(nextTemplate[String(slot)]) === heroId) {
        nextTemplate[String(slot)] = 0;
      }
    }
  }

  nextTemplate[String(pos)] = heroId;
  virtualTemplates.value = {
    ...virtualTemplates.value,
    [currentTeam.value]: normalizeTemplate(nextTemplate),
  };
  persistVirtualTemplates();
};

const onVirtualSlotChange = (pos: number, event: Event) => {
  const target = event.target as HTMLSelectElement;
  updateVirtualSlot(pos, Number(target.value || 0));
};

const copyRealTeamToVirtual = () => {
  if (!isCurrentVirtualTeam.value) return;
  const sourceTeamId = realTeamIds.value.includes(copySourceTeam.value)
    ? copySourceTeam.value
    : realTeamIds.value[0];
  const sourceTeam = getRealTeamInfo(sourceTeamId);
  if (!sourceTeam) {
    message.warning("当前没有可复制的真实阵容");
    return;
  }

  const copiedTemplate = buildEmptyTemplate();
  for (const pos of teamSlots) {
    copiedTemplate[String(pos)] = Number(
      (sourceTeam as any)?.[String(pos)]?.heroId || 0,
    );
  }

  virtualTemplates.value = {
    ...virtualTemplates.value,
    [currentTeam.value]: copiedTemplate,
  };
  persistVirtualTemplates();
  message.success(`已复制真实阵容 ${sourceTeamId} 到模板 ${currentTeam.value}`);
};

const clearCurrentVirtualTeam = () => {
  if (!isCurrentVirtualTeam.value) return;
  virtualTemplates.value = {
    ...virtualTemplates.value,
    [currentTeam.value]: buildEmptyTemplate(),
  };
  persistVirtualTemplates();
  message.success(`模板 ${currentTeam.value} 已清空`);
};

const selectTeam = async (teamId: number) => {
  if (switching.value || loading.value) return;
  if (!tokenStore.selectedToken) {
    message.warning("请先选择Token");
    return;
  }
  if (isVirtualTemplateTeam(teamId)) {
    currentTeam.value = teamId;
    if (!ownedHeroOptions.value.length) {
      tokenStore.sendMessage(tokenStore.selectedToken.id, "role_getroleinfo");
    }
    return;
  }
  if (!realTeamIds.value.includes(teamId)) {
    message.warning(`当前账号未返回阵容 ${teamId} 数据，无法切换`);
    return;
  }
  const prev = currentTeam.value;
  switching.value = true;
  try {
    await executeGameCommand(
      tokenStore.selectedToken.id,
      "presetteam_saveteam",
      { teamId },
      `切换到阵容 ${teamId}`,
    );
    currentTeam.value = teamId;
    message.success(`已切换到阵容 ${teamId}`);
    await refreshTeamData(true);
  } catch (e) {
    currentTeam.value = prev;
  } finally {
    switching.value = false;
  }
};

const refreshTeamData = async (force = false) => {
  await getTeamInfoWithCache(force);
};

onMounted(async () => {
  if (tokenStore.selectedToken) {
    loadVirtualTemplates(tokenStore.selectedToken.id);
  }
  if (tokenStore.selectedToken && wsStatus.value === "connected") {
    await refreshTeamData(false);
    updateAvailableTeams();
    updateCurrentTeam(true);
    if (!presetTeamRaw.value) {
      await refreshTeamData(true);
      updateAvailableTeams();
      updateCurrentTeam(true);
    }
  }
});

watch(wsStatus, (newStatus, oldStatus) => {
  if (
    newStatus === "connected" &&
    oldStatus !== "connected" &&
    tokenStore.selectedToken
  ) {
    setTimeout(async () => {
      await refreshTeamData(false);
      updateAvailableTeams();
      updateCurrentTeam(true);
      if (!presetTeamRaw.value) {
        await refreshTeamData(true);
        updateAvailableTeams();
        updateCurrentTeam(true);
      }
    }, 1000);
  }
});

watch(
  () => tokenStore.selectedToken,
  async (newToken, oldToken) => {
    if (newToken && newToken.id !== (oldToken as any)?.id) {
      loadVirtualTemplates(newToken.id);
      const status = tokenStore.getWebSocketStatus(newToken.id);
      if (status === "connected") {
        await refreshTeamData(true);
        updateAvailableTeams();
        updateCurrentTeam(true);
      } else {
        updateCurrentTeam(true);
      }
    }
  },
);

watch(
  () => realTeamIds.value,
  (ids) => {
    if (!ids.length) {
      copySourceTeam.value = 1;
      return;
    }
    if (!ids.includes(copySourceTeam.value)) {
      copySourceTeam.value = ids[0];
    }
  },
  { immediate: true },
);

watch(
  () => presetTeamRaw.value,
  () => {
    updateAvailableTeams();
    updateCurrentTeam(false);
  },
  { deep: true },
);
</script>

<style scoped lang="scss">
.team-formation-card {
  min-height: 220px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.info h3 {
  margin: 0 0 2px 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.info p {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.team-selector {
  display: flex;
  gap: var(--spacing-xs);
}

.team-button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.team-button:hover {
  background: var(--bg-secondary);
}

.team-button.active {
  background: var(--primary-color);
  color: white;
}

.team-button.virtual {
  border: 1px dashed rgba(59, 130, 246, 0.35);
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
}

.team-button.virtual.active {
  border-style: solid;
  background: #2563eb;
  color: white;
}

.team-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-secondary, #6b7280);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 0.15s ease);
}

.refresh-button:hover {
  background: var(--bg-secondary, #f9fafb);
  border-color: var(--border-hover, #d1d5db);
  color: var(--text-primary, #374151);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.refresh-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.refresh-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.refresh-icon {
  width: 14px;
  height: 14px;
  transition: transform var(--transition-fast, 0.15s ease);
}

.refresh-button:not(:disabled):hover .refresh-icon {
  transform: rotate(180deg);
}

.refresh-button:disabled .refresh-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.card-content .current-team-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.card-content .label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.card-content .team-number {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
}

.team-meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--spacing-sm);
  flex-wrap: wrap;
}

.team-kind-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.team-kind-badge.real {
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.team-kind-badge.virtual {
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.team-kind-note {
  font-size: 12px;
  color: var(--text-secondary);
}

.heroes-container {
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-medium);
  padding: var(--spacing-sm);
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.heroes-formation {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  align-items: center;
  width: 100%;
}

.formation-row {
  display: flex;
  gap: var(--spacing-lg);
  justify-content: center;
  width: 100%;
}

.hero-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 64px;
}

.hero-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.hero-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-placeholder {
  font-size: 12px;
  color: var(--text-secondary);
}

.hero-name {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  min-width: 90px;
  max-width: 140px;
  white-space: nowrap;
}

.empty-team {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.virtual-editor {
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm);
  border: 1px solid rgba(59, 130, 246, 0.16);
  border-radius: var(--border-radius-medium);
  background: rgba(59, 130, 246, 0.04);
}

.virtual-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.virtual-editor-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.virtual-editor-hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.virtual-editor-toolbar {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.virtual-editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.editor-slot {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.editor-slot-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.editor-select {
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.editor-select.compact {
  min-width: 120px;
}

.editor-button {
  height: 34px;
  padding: 0 12px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.editor-button.secondary {
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-primary);
}

.editor-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .card-header {
    flex-direction: column;
    gap: var(--spacing-sm);
    text-align: center;
    align-items: center;
  }

  .team-selector {
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .heroes-container {
    padding: var(--spacing-sm);
  }

  .heroes-formation {
    gap: var(--spacing-sm);
  }

  .formation-row {
    gap: var(--spacing-sm);
  }

  .hero-item {
    min-width: 45px;
  }

  .hero-circle {
    width: 40px;
    height: 40px;
  }

  .hero-name {
    font-size: 10px;
    min-width: 0;
    max-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .virtual-editor-grid {
    grid-template-columns: 1fr;
  }
}
</style>

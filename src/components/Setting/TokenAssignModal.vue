<template>
  <n-modal
    v-model:show="show"
    preset="card"
    title="分配 Token"
    style="width: 480px"
    :mask-closable="false"
  >
    <div v-if="token" class="assign-modal">
      <div class="token-info">
        <n-tag type="info" size="small">{{ token.server }}</n-tag>
        <span class="token-name">{{ token.name }}</span>
      </div>

      <p class="assign-tip">选择可以看到此 Token 的普通用户：</p>

      <n-spin :show="loading">
        <n-checkbox-group v-model:value="selected">
          <n-space vertical>
            <n-checkbox
              v-for="u in regularUsers"
              :key="u.id"
              :value="u.id"
              :label="u.username"
            />
            <n-empty v-if="!regularUsers.length" description="暂无普通用户" size="small" />
          </n-space>
        </n-checkbox-group>
      </n-spin>

      <n-space justify="end" style="margin-top: 20px">
        <n-button @click="show = false">取消</n-button>
        <n-button type="primary" :loading="saving" @click="handleSave">保存</n-button>
      </n-space>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useUserStore } from '@/stores/userStore'
import { useTokenStore } from '@/stores/tokenStore'

const props = defineProps({
  modelValue: Boolean,
  token: Object,
})
const emit = defineEmits(['update:modelValue'])

const message = useMessage()
const userStore = useUserStore()
const tokenStore = useTokenStore()

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const saving = ref(false)

const regularUsers = computed(() =>
  userStore.userList.filter((u) => u.role !== 'admin'),
)

const selected = ref([])

watch(show, async (v) => {
  if (v) {
    loading.value = true
    await userStore.fetchUsers()
    loading.value = false
    // 从 userList 里找哪些用户的 assignedTokenIds 包含当前 token
    if (props.token) {
      selected.value = userStore.userList
        .filter((u) => u.assignedTokenIds?.includes(props.token.id))
        .map((u) => u.id)
    }
  }
})

async function handleSave() {
  if (!props.token) return
  saving.value = true

  // 对所有普通用户重新计算各自的 assignedTokenIds
  // 策略：selected 里的用户确保包含该 token；未选用户则从其列表里移除
  const results = await Promise.all(
    regularUsers.value.map(async (u) => {
      const existing = (u.assignedTokenIds || []).filter((id) => id !== props.token.id)
      const newIds = selected.value.includes(u.id)
        ? [...existing, props.token.id]
        : existing
      if (JSON.stringify(newIds.sort()) !== JSON.stringify((u.assignedTokenIds || []).sort())) {
        return userStore.assignTokensToUser(u.id, newIds)
      }
      return true
    })
  )

  saving.value = false
  if (results.every(Boolean)) {
    message.success('分配已保存')
    show.value = false
  } else {
    message.error('部分保存失败，请重试')
  }
}
</script>

<style scoped>
.assign-modal { padding: 4px 0; }
.token-info { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.token-name { font-weight: 600; font-size: 15px; }
.assign-tip { font-size: 13px; color: #888; margin-bottom: 12px; }
</style>


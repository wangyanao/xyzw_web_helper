/**
 * 多租户 Token 可见性过滤
 * 独立 composable 避免 tokenStore ↔ userStore 循环依赖
 */
import { computed } from 'vue'
import { gameTokens } from '@/stores/tokenStore'
import { useUserStore } from '@/stores/userStore'

export function useVisibleTokens() {
  const userStore = useUserStore()

  const visibleTokens = computed(() => {
    if (userStore.isAdmin) return gameTokens.value

    const uid = userStore.currentUserId
    if (!uid) return []

    // 后端返回的分配列表（即 users.json 中 assignedTokenIds）
    const assignedIds = userStore.assignedTokenIds

    return gameTokens.value.filter((t) => {
      // 自己创建的 token 自己可见
      if (t.ownerId === uid) return true
      // admin 通过后端 assignedTokenIds 分配给自己的（以后端 users.json 为准）
      if (assignedIds.includes(t.id)) return true
      return false
    })
  })

  return { visibleTokens }
}

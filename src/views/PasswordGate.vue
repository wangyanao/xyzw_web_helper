<template>
  <div class="password-gate">
    <div class="gate-card">
      <div class="gate-header">
        <img src="/icons/xiaoyugan.png" alt="XYZW" class="gate-logo" />
        <h1 class="gate-title">XYZW 游戏管理系统</h1>
        <p class="gate-subtitle">请登录以继续</p>
      </div>

      <div class="gate-body">
        <n-input
          ref="usernameRef"
          v-model:value="username"
          placeholder="用户名"
          size="large"
          :disabled="loading"
          style="margin-bottom: 12px"
          @keydown.enter="() => passwordRef?.focus()"
        >
          <template #prefix>
            <n-icon><PersonCircle /></n-icon>
          </template>
        </n-input>

        <n-input
          ref="passwordRef"
          v-model:value="password"
          type="password"
          placeholder="密码"
          size="large"
          :disabled="loading"
          @keydown.enter="handleLogin"
        >
          <template #prefix>
            <n-icon><LockClosed /></n-icon>
          </template>
        </n-input>

        <n-button
          type="primary"
          size="large"
          block
          :loading="loading"
          style="margin-top: 16px"
          @click="handleLogin"
        >
          登 录
        </n-button>

        <transition name="fade">
          <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        </transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { LockClosed, PersonCircle } from '@vicons/ionicons5'
import { useUserStore } from '@/stores/userStore'
import { useTokenStore } from '@/stores/tokenStore'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const tokenStore = useTokenStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const usernameRef = ref(null)
const passwordRef = ref(null)

onMounted(() => {
  usernameRef.value?.focus()
})

async function handleLogin() {
  if (!username.value.trim()) {
    errorMsg.value = '请输入用户名'
    return
  }
  if (!password.value.trim()) {
    errorMsg.value = '请输入密码'
    return
  }
  loading.value = true
  errorMsg.value = ''
  const result = await userStore.login(username.value.trim(), password.value)
  if (result === true) {
    // 拉取完整用户信息（含 assignedTokenIds）
    await userStore.refreshMe()
    // 登录后按当前用户可见范围重建 token 列表
    await tokenStore.reloadTokensForCurrentUser()
  }
  loading.value = false
  if (result === true) {
    const redirect = route.query.redirect || '/'
    router.replace(decodeURIComponent(redirect))
  } else if (result === 'notfound') {
    errorMsg.value = '用户名不存在'
    username.value = ''
    password.value = ''
    usernameRef.value?.focus()
  } else {
    errorMsg.value = typeof result === 'string' && result !== 'false' ? result : '密码错误，请重试'
    password.value = ''
    passwordRef.value?.focus()
  }
}
</script>

<style scoped>
.password-gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.gate-card {
  width: 360px;
  padding: 40px 36px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  backdrop-filter: blur(20px);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
}

.gate-header {
  text-align: center;
  margin-bottom: 32px;
}

.gate-logo {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  margin-bottom: 16px;
}

.gate-title {
  font-size: 20px;
  font-weight: 700;
  color: #e8e8f0;
  margin: 0 0 8px;
}

.gate-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.error-msg {
  margin-top: 12px;
  text-align: center;
  font-size: 13px;
  color: #ff6b6b;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

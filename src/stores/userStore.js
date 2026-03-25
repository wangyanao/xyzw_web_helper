/**
 * 多用户管理 Store（后端联动版）
 *
 * 角色说明:
 *   admin  - 管理员：可见所有 Token，可分配 Token 给普通用户，可管理账号
 *   user   - 普通用户：只能看到自己新增的 Token 和管理员分配给自己的 Token
 *
 * 默认管理员账号: admin / xyzw@2024
 * 用户数据持久化在后端 server/data/users.json
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const SESSION_KEY = 'xyzw_session_token'
const SESSION_USER_KEY = 'xyzw_current_user'

const API_BASE = '/api'

async function sha256(message) {
  const buf = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getSessionToken() {
  return sessionStorage.getItem(SESSION_KEY) || ''
}

function authHeaders() {
  return { 'X-Session-Token': getSessionToken(), 'Content-Type': 'application/json' }
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export const useUserStore = defineStore('users', () => {
  // 当前会话用户（sessionStorage 持久，关闭浏览器失效）
  const _raw = sessionStorage.getItem(SESSION_USER_KEY)
  const currentUser = ref(_raw ? JSON.parse(_raw) : null)

  // 后端拉取的用户列表（admin 专用）
  const userList = ref([])

  const isLoggedIn = computed(() => !!currentUser.value)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const currentUserId = computed(() => currentUser.value?.id ?? null)
  /** 当前用户被分配的 token ID 列表（普通用户使用） */
  const assignedTokenIds = computed(() => currentUser.value?.assignedTokenIds ?? [])

  function _persistSession(user, token) {
    currentUser.value = user
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
    sessionStorage.setItem(SESSION_KEY, token)
  }

  function _clearSession() {
    currentUser.value = null
    sessionStorage.removeItem(SESSION_USER_KEY)
    sessionStorage.removeItem(SESSION_KEY)
  }

  /**
   * 登录
   * 返回 true 成功；'notfound' 用户名不存在；false 密码错误；string 其他错误信息
   */
  const login = async (username, password) => {
    const passwordHash = await sha256(password)
    const { ok, status, data } = await apiFetch('/users/login', {
      method: 'POST',
      body: JSON.stringify({ username, passwordHash }),
    })
    if (ok) {
      _persistSession({ ...data.user, assignedTokenIds: data.user.assignedTokenIds ?? [] }, data.token)
      return true
    }
    if (status === 404) return 'notfound'
    if (status === 401) return false
    return data.error || '登录失败'
  }

  /** 登出（通知后端销毁 session） */
  const logout = async () => {
    await apiFetch('/users/logout', { method: 'POST' }).catch(() => {})
    _clearSession()
  }

  /** 刷新当前用户信息（含 assignedTokenIds） */
  const refreshMe = async () => {
    const { ok, data } = await apiFetch('/users/me')
    if (ok) {
      const updated = { ...currentUser.value, ...data }
      _persistSession(updated, getSessionToken())
    }
  }

  /** 管理员：拉取所有用户列表（非 admin 静默跳过） */
  const fetchUsers = async () => {
    if (!isAdmin.value) return
    const { ok, data } = await apiFetch('/users')
    if (ok && Array.isArray(data)) userList.value = data
  }

  /** 管理员：创建新用户 */
  const createUser = async (username, password, role = 'user') => {
    const passwordHash = await sha256(password)
    const { ok, data } = await apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify({ username, passwordHash, role }),
    })
    if (ok) {
      await fetchUsers()
      return { ok: true }
    }
    return { ok: false, msg: data.error || '创建失败' }
  }

  /** 管理员：删除用户 */
  const deleteUser = async (userId) => {
    const { ok, data } = await apiFetch(`/users/${userId}`, { method: 'DELETE' })
    if (ok) await fetchUsers()
    return ok ? true : (data.error || false)
  }

  /** 修改密码（admin 可改任意人，普通用户只能改自己） */
  const changePassword = async (userId, newPassword) => {
    const passwordHash = await sha256(newPassword)
    const { ok } = await apiFetch(`/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ passwordHash }),
    })
    return ok
  }

  /** 管理员：为某用户分配可见 token 列表 */
  const assignTokensToUser = async (userId, tokenIds) => {
    const { ok, data } = await apiFetch(`/users/${userId}/tokens`, {
      method: 'PUT',
      body: JSON.stringify({ tokenIds }),
    })
    if (ok) {
      // 若操作的是当前登录用户自身（普通用户自己新增 token 时），同步刷新内存状态
      if (currentUser.value && currentUser.value.id === userId) {
        await refreshMe()
      } else {
        // 管理员分配他人时刷新用户列表
        await fetchUsers()
      }
    }
    return ok ? true : (data.error || false)
  }

  return {
    currentUser,
    userList,
    isLoggedIn,
    isAdmin,
    currentUserId,
    assignedTokenIds,
    login,
    logout,
    refreshMe,
    fetchUsers,
    createUser,
    deleteUser,
    changePassword,
    assignTokensToUser,
  }
})


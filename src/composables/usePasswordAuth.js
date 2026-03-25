/**
 * 访问密码验证
 *
 * 默认密码: xyzw@2024
 * 修改密码: 请更新 PASSWORD_HASH 常量（SHA-256 哈希值）
 * 生成方法: node -e "const c=require('crypto');console.log(c.createHash('sha256').update('你的新密码').digest('hex'))"
 */

// SHA-256("xyzw@2024")
const PASSWORD_HASH = '641811a7fd997ab79c5840dcd13d9396daea46a460801647b2b1577f4cf12c5d'

const AUTH_KEY = 'xyzw_app_authed'

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function usePasswordAuth() {
  const isAuthenticated = () => sessionStorage.getItem(AUTH_KEY) === 'true'

  const verify = async (password) => {
    const hash = await sha256(password)
    if (hash === PASSWORD_HASH) {
      sessionStorage.setItem(AUTH_KEY, 'true')
      return true
    }
    return false
  }

  const logout = () => sessionStorage.removeItem(AUTH_KEY)

  return { isAuthenticated, verify, logout }
}

# 纯前端 Token 一天过期问题分析与解决

## 🔴 问题诊断

### 根本原因
手动导入的 Token 存在 **24 小时自动过期** 的逻辑，用户导入 Token 超过 24 小时后，应用启动时会自动删除该 Token。

### 问题位置分析

#### 问题 1: 过期检查逻辑 (tokenStore.ts 第 1166-1191 行)

```typescript
const cleanExpiredTokens = async () => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);  // ← 24小时前
  
  const tokensToRemove = gameTokens.value.filter((token) => {
    // URL/bin/wxQrcode 导入的 token 长期有效
    if (
      token.importMethod === "url" ||
      token.importMethod === "bin" ||
      token.importMethod === "wxQrcode" ||
      token.upgradedToPermanent
    ) {
      return false;
    }
    
    // ❌ 问题：手动导入的 token 只有 24 小时逻辑
    const lastUsed = new Date(token.lastUsed || token.createdAt);
    return lastUsed <= oneDayAgo;  // ← 超过 24 小时就删除
  });
};
```

#### 问题 2: 自动清理的触发时机 (tokenStore.ts 第 1401 行)

```typescript
// 在应用初始化时执行
const initStore = () => {
  // ...
  cleanExpiredTokens();  // ← 应用启动时删除过期 token
  // ...
};
```

#### 问题 3: lastUsed 只在 selectToken 时更新

```typescript
const selectToken = (tokenId: string) => {
  selectedTokenId.value = tokenId;
  
  // 只在选中时更新一次
  updateToken(tokenId, { lastUsed: new Date().toISOString() });  // ← 只有这里更新
  
  // ...
};
```

### 触发过期的场景
1. 用户导入手动 Token → `createdAt` = 导入时间
2. 用户使用该 Token 超过 24 小时（或 24 小时后重新打开应用）
3. 应用启动时执行 `cleanExpiredTokens()`
4. **Token 被自动删除** ❌

---

## ✅ 解决方案

### 方案 A: 立即修复（推荐）- 手动 Token 永不过期

**修改 src/stores/tokenStore.ts**

找到 `cleanExpiredTokens` 函数（第 1166 行），修改过期检查逻辑：

```typescript
const cleanExpiredTokens = async () => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const tokensToRemove = gameTokens.value.filter((token) => {
    // 所有导入方式的 token 都设为长期有效
    // 👇 修改：移除对所有 token 的过期检查
    if (
      token.importMethod === "url" ||
      token.importMethod === "bin" ||
      token.importMethod === "wxQrcode" ||
      token.importMethod === "manual" ||  // ← 添加：手动导入也长期有效
      token.upgradedToPermanent
    ) {
      return false;  // 不删除
    }
    
    // ❌ 实际上，上面的逻辑会覆盖所有 importMethod，所以旧逻辑永不执行
    const lastUsed = new Date(token.lastUsed || token.createdAt);
    return lastUsed <= oneDayAgo;
  });
};
```

**或者更简洁的方式：**

```typescript
const cleanExpiredTokens = async () => {
  // 目前所有导入方式都不应该自动过期
  // 手动删除由用户在 UI 中完成
  // 自动清理逻辑保留空置，供将来扩展
  return 0;
};
```

### 方案 B: 可配置的过期时间

允许用户自定义 Token 有效期：

```typescript
// 定义过期配置（可从配置文件读取）
const TOKEN_EXPIRY_CONFIG = {
  manual: null,           // null = 永不过期
  url: null,             // 永不过期（通过刷新保持）
  bin: null,             // 永不过期
  wxQrcode: null,        // 永不过期
};

const cleanExpiredTokens = async () => {
  const now = new Date();
  
  const tokensToRemove = gameTokens.value.filter((token) => {
    const expiryDays = TOKEN_EXPIRY_CONFIG[token.importMethod];
    
    if (expiryDays === null) {
      return false;  // 永不过期
    }
    
    const expiryTime = new Date(
      new Date(token.lastUsed || token.createdAt).getTime() + 
      expiryDays * 24 * 60 * 60 * 1000
    );
    
    return now > expiryTime;
  });
};
```

### 方案 C: 仅在显式删除时移除 Token

完全禁用自动删除，只允许用户手动删除：

```typescript
const cleanExpiredTokens = async () => {
  // 禁用自动过期删除
  // 用户在 UI 中点击"删除"按钮时才会移除 token
  // 这样更符合用户预期
  return 0;
};
```

---

## 🛠️ 建议的修复步骤

### 步骤 1: 选择方案
- **最推荐**: 方案 A（手动 Token 永不过期）
- **最安全**: 方案 C（禁用自动删除）

### 步骤 2: 编辑 tokenStore.ts

修改 `cleanExpiredTokens` 函数（第 1166 行）：

**替换这段代码**:
```typescript
const cleanExpiredTokens = async () => {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // 找出需要清理的token
  const tokensToRemove = gameTokens.value.filter((token) => {
    // URL和bin文件导入的token设为长期有效，不会过期
    // 升级为长期有效的token也不会过期
    if (
      token.importMethod === "url" ||
      token.importMethod === "bin" ||
      token.importMethod === "wxQrcode" ||
      token.upgradedToPermanent
    ) {
      return false;
    }
    // 手动导入的token按原逻辑处理（24小时过期）
    const lastUsed = new Date(token.lastUsed || token.createdAt);
    return lastUsed <= oneDayAgo;
  });

  const cleanedCount = tokensToRemove.length;
  
  // 逐个删除，触发清理逻辑（WebSocket断开、IndexedDB删除等）
  for (const token of tokensToRemove) {
    await removeToken(token.id);
  }
  
  return cleanedCount;
};
```

**替换为**:
```typescript
const cleanExpiredTokens = async () => {
  // 禁用自动过期删除逻辑
  // 所有导入方式的 token（manual/url/bin/wxQrcode）都长期有效
  // Token 只在用户显式删除时才会被移除
  
  // 注意：如果未来需要实现过期机制，可以在这里添加
  // 目前为了用户体验，不会自动删除任何 token
  return 0;
};
```

### 步骤 3: 验证测试

```bash
# 1. 清空浏览器 localStorage（可选）
# localStorage.clear()

# 2. 导入一个手动 Token

# 3. 等待超过 24 小时（或在浏览器开发者工具修改时间）

# 4. 刷新应用

# 5. 验证 Token 仍然存在 ✅
```

---

## 📊 对比：不同导入方式的 Token 有效期

| 导入方式 | 改修前 | 改修后 | 说明 |
|---------|--------|--------|------|
| manual (手动) | ❌ 24小时 | ✅ 永不过期 | 用户手动输入的 Token |
| url | ✅ 长期有效 | ✅ 长期有效 | 从 URL 刷新获取 |
| bin | ✅ 长期有效 | ✅ 长期有效 | 从二进制文件导入 |
| wxQrcode | ✅ 长期有效 | ✅ 长期有效 | 从二维码导入 |
| upgradedToPermanent | ✅ 长期有效 | ✅ 长期有效 | 用户升级为永久 |

---

## 📝 额外优化建议

### 1. 添加 Token 使用跟踪（可选）

在 `selectToken` 中已经有了，但可以扩展到其他使用场景：

```typescript
// 在 WebSocket 连接成功时也更新 lastUsed
const createWebSocketConnection = (tokenId: string, token: string) => {
  // ...
  wsClient.on('connected', () => {
    // 连接成功时更新最后使用时间
    updateToken(tokenId, { 
      lastUsed: new Date().toISOString() 
    });
  });
};
```

### 2. 为用户提供手动升级选项（可选）

`upgradeTokenToPermanent` 函数已经存在，用户可以在 UI 中看到：

```
[升级为永久 Token] 按钮
```

### 3. 显示 Token 状态信息

在 TokenManager.vue 中显示：
- ✅ Token 创建时间
- ✅ Token 最后使用时间
- ✅ Token 过期状态（仅显示信息，不自动删除）

---

## 🔍 快速诊断脚本

在浏览器控制台运行，检查当前 Token 状态：

```javascript
// 检查 localStorage 中的 token 信息
const tokens = JSON.parse(localStorage.getItem('gameTokens') || '[]');

tokens.forEach(token => {
  const createdAt = new Date(token.createdAt);
  const lastUsed = new Date(token.lastUsed);
  const now = new Date();
  const hoursSinceCreated = (now - createdAt) / (1000 * 60 * 60);
  const hoursSinceUsed = (now - lastUsed) / (1000 * 60 * 60);
  
  console.log(`
Token: ${token.name || token.id.substr(0, 8)}
方法: ${token.importMethod}
创建于: ${createdAt.toLocaleString()} (${hoursSinceCreated.toFixed(1)} 小时前)
最后使用: ${lastUsed.toLocaleString()} (${hoursSinceUsed.toFixed(1)} 小时前)
是否长期: ${token.upgradedToPermanent ? '是' : '否'}
状态: ${hoursSinceCreated > 24 ? '⚠️ 超过24小时' : '✅ 有效'}
  `);
});
```

---

## 总结

| 项目 | 说明 |
|------|------|
| **问题** | 手动导入的 Token 24 小时后自动删除 |
| **根原因** | `cleanExpiredTokens` 对 manual 类型 Token 的过期检查 |
| **影响范围** | 所有手动导入的 Token |
| **修复难度** | ⭐ 简单（修改 1 个函数） |
| **推荐方案** | 禁用自动删除，所有 Token 长期有效 |
| **修改文件** | src/stores/tokenStore.ts（第 1166-1191 行） |

修改后，您导入的 Token 将**永久保存** ✅

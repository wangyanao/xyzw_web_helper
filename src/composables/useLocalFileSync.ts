/**
 * 本地文件同步 Composable
 * 使用 File System Access API（Chrome/Edge 89+）将 Token 自动同步到本地文件
 *
 * 功能：
 * - 绑定本地 JSON 文件（持久化文件句柄到 IndexedDB）
 * - Token 变更时自动保存
 * - 启动时自动检测已绑定文件
 * - 从本地文件加载 Token
 */

import { openDB } from "idb";
import { ref, computed } from "vue";

// ============================================================
// 模块级单例状态（跨组件共享）
// ============================================================

const HANDLE_DB_NAME = "xyzw_file_handles";
const HANDLE_DB_VERSION = 1;
const HANDLE_STORE = "handles";
const TOKEN_FILE_KEY = "token_backup_file";

// 绑定的文件句柄
const linkedFileHandle = ref<FileSystemFileHandle | null>(null);
// 绑定文件的文件名
const linkedFileName = ref<string>("");
// 是否已绑定文件
const isLinked = ref(false);
// 是否正在同步中
const isSyncing = ref(false);
// 上次同步时间
const lastSyncTime = ref<Date | null>(null);
// 同步错误信息
const syncError = ref<string | null>(null);
// 是否已初始化
let initialized = false;

// ============================================================
// IndexedDB 文件句柄持久化
// ============================================================

const getHandleDB = () =>
  openDB(HANDLE_DB_NAME, HANDLE_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
    },
  });

const saveHandleToIDB = async (handle: FileSystemFileHandle) => {
  try {
    const db = await getHandleDB();
    await db.put(HANDLE_STORE, handle, TOKEN_FILE_KEY);
  } catch (e) {
    console.warn("[LocalFileSync] 保存文件句柄失败:", e);
  }
};

const loadHandleFromIDB = async (): Promise<FileSystemFileHandle | null> => {
  try {
    const db = await getHandleDB();
    return (await db.get(HANDLE_STORE, TOKEN_FILE_KEY)) || null;
  } catch (e) {
    return null;
  }
};

const deleteHandleFromIDB = async () => {
  try {
    const db = await getHandleDB();
    await db.delete(HANDLE_STORE, TOKEN_FILE_KEY);
  } catch (e) {
    console.warn("[LocalFileSync] 删除文件句柄失败:", e);
  }
};

// ============================================================
// 文件权限管理
// ============================================================

const verifyPermission = async (
  handle: FileSystemFileHandle,
  mode: "read" | "readwrite" = "readwrite",
): Promise<boolean> => {
  const opts = { mode } as FileSystemHandlePermissionDescriptor;
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
};

// ============================================================
// 主 Composable
// ============================================================

export function useLocalFileSync() {
  // 是否支持 File System Access API
  const isSupported = computed(
    () =>
      typeof window !== "undefined" &&
      "showSaveFilePicker" in window &&
      "showOpenFilePicker" in window,
  );

  /**
   * 初始化 - 从 IndexedDB 加载已绑定的文件句柄
   * 在应用启动时调用一次
   */
  const init = async () => {
    if (initialized) return;
    initialized = true;

    if (!isSupported.value) return;

    const handle = await loadHandleFromIDB();
    if (handle) {
      linkedFileHandle.value = handle;
      linkedFileName.value = handle.name;
      isLinked.value = true;
    }
  };

  /**
   * 绑定新的本地文件（弹出保存对话框）
   * 返回 true 表示绑定成功
   */
  const linkFile = async (): Promise<boolean> => {
    if (!isSupported.value) return false;

    try {
      const handle = await window.showSaveFilePicker({
        types: [
          {
            description: "Token 备份文件",
            accept: { "application/json": [".json"] },
          },
        ],
        suggestedName: "xyzw_tokens_backup.json",
      });

      linkedFileHandle.value = handle;
      linkedFileName.value = handle.name;
      isLinked.value = true;
      syncError.value = null;

      await saveHandleToIDB(handle);
      return true;
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        syncError.value = String(e?.message || e);
      }
      return false;
    }
  };

  /**
   * 解除文件绑定
   */
  const unlinkFile = async () => {
    linkedFileHandle.value = null;
    linkedFileName.value = "";
    isLinked.value = false;
    lastSyncTime.value = null;
    syncError.value = null;
    await deleteHandleFromIDB();
  };

  /**
   * 将 Token 数据保存到已绑定的文件
   */
  const saveToLinkedFile = async (tokens: any[]): Promise<boolean> => {
    if (!linkedFileHandle.value) return false;

    try {
      isSyncing.value = true;

      const hasPermission = await verifyPermission(
        linkedFileHandle.value,
        "readwrite",
      );
      if (!hasPermission) {
        syncError.value = "文件写入权限被拒绝，请重新绑定文件";
        return false;
      }

      const data = {
        tokens,
        exportedAt: new Date().toISOString(),
        version: "2.0",
        source: "local_file_sync",
      };

      const writable = await linkedFileHandle.value.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      lastSyncTime.value = new Date();
      syncError.value = null;
      return true;
    } catch (e: any) {
      syncError.value = String(e?.message || e);
      return false;
    } finally {
      isSyncing.value = false;
    }
  };

  /**
   * 从已绑定的文件读取 Token 数据
   */
  const loadFromLinkedFile = async (): Promise<any | null> => {
    if (!linkedFileHandle.value) return null;

    try {
      const hasPermission = await verifyPermission(
        linkedFileHandle.value,
        "read",
      );
      if (!hasPermission) {
        syncError.value = "文件读取权限被拒绝";
        return null;
      }

      const file = await linkedFileHandle.value.getFile();
      const content = await file.text();
      return JSON.parse(content);
    } catch (e: any) {
      syncError.value = String(e?.message || e);
      return null;
    }
  };

  /**
   * 打开系统文件选择器读取 Token 文件（不绑定）
   * 适用于一次性从文件加载
   */
  const openAndLoadFile = async (): Promise<any | null> => {
    if (!isSupported.value) return null;

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Token 备份文件",
            accept: { "application/json": [".json"] },
          },
        ],
        multiple: false,
      });

      const file = await handle.getFile();
      const content = await file.text();
      return JSON.parse(content);
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        syncError.value = String(e?.message || e);
      }
      return null;
    }
  };

  /**
   * 打开系统文件选择器并直接绑定该文件（用于绑定已有备份）
   */
  const openAndLinkFile = async (): Promise<boolean> => {
    if (!isSupported.value) return false;

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Token 备份文件",
            accept: { "application/json": [".json"] },
          },
        ],
        multiple: false,
      });

      linkedFileHandle.value = handle;
      linkedFileName.value = handle.name;
      isLinked.value = true;
      syncError.value = null;

      await saveHandleToIDB(handle);
      return true;
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        syncError.value = String(e?.message || e);
      }
      return false;
    }
  };

  /**
   * 格式化上次同步时间为人类可读字符串
   */
  const lastSyncTimeText = computed(() => {
    if (!lastSyncTime.value) return "";
    const d = lastSyncTime.value;
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  });

  return {
    // 状态
    isSupported,
    isLinked,
    isSyncing,
    lastSyncTime,
    lastSyncTimeText,
    syncError,
    linkedFileName,

    // 方法
    init,
    linkFile,
    unlinkFile,
    saveToLinkedFile,
    loadFromLinkedFile,
    openAndLoadFile,
    openAndLinkFile,
  };
}

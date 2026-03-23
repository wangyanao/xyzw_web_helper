/**
 * useServerBinSync
 * 新浏览器/清缓存后，自动从服务器拉取 bin 文件并恢复 Token
 */
import { getTokenId, transformToken } from '@/utils/token';
import { useIndexedDB } from '@/hooks/useIndexedDB';

interface BinFileInfo {
  name: string;
  size: number;
  mtime: number;
}

/**
 * 从服务器拉取 bin 文件列表并导入 token
 * @returns 成功导入的 token 数组，失败时返回空数组
 */
export const syncBinsFromServer = async (): Promise<{
  id: string;
  name: string;
  server: string;
  token: string;
  importMethod: string;
}[]> => {
  // 1. 获取 bin 文件列表
  let files: BinFileInfo[] = [];
  try {
    const resp = await fetch('/api/bin/list');
    if (!resp.ok) return [];
    const json = await resp.json();
    files = json.files ?? [];
  } catch {
    return [];
  }

  if (files.length === 0) return [];

  const { storeArrayBuffer } = useIndexedDB();
  const results: {
    id: string;
    name: string;
    server: string;
    token: string;
    importMethod: string;
  }[] = [];

  // 2. 逐个下载并解析
  for (const file of files) {
    try {
      const dlResp = await fetch(`/api/bin/download/${encodeURIComponent(file.name)}`);
      if (!dlResp.ok) continue;

      const arrayBuffer = await dlResp.arrayBuffer();

      // 解析文件名 xyzw-{server}-{name}.bin → server / name
      const baseName = file.name.replace(/\.bin$/i, '');           // xyzw-1服-张三
      const withoutPrefix = baseName.replace(/^xyzw-/, '');        // 1服-张三
      const dashIdx = withoutPrefix.indexOf('-');
      const server = dashIdx !== -1 ? withoutPrefix.slice(0, dashIdx) : withoutPrefix;
      const name = dashIdx !== -1 ? withoutPrefix.slice(dashIdx + 1) : withoutPrefix;

      // 获取 tokenId 和 roleToken
      const tokenId = getTokenId(arrayBuffer);
      const roleToken = await transformToken(arrayBuffer);

      // 同步保存到 IndexedDB（本地缓存）
      await storeArrayBuffer(tokenId, arrayBuffer);

      results.push({
        id: tokenId,
        name: name || baseName,
        server: server || '未知服',
        token: roleToken,
        importMethod: 'bin',
      });
    } catch (e) {
      console.warn(`[serverBinSync] 恢复失败: ${file.name}`, e);
    }
  }

  return results;
};

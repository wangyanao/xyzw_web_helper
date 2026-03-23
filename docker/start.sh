#!/bin/sh
# 启动脚本：先启动 Flask 后端，再启动 nginx

# 创建 bin 存储目录
mkdir -p /app/server/bin

# 后台启动 Flask
echo "[start] 启动 Flask bin 服务 (port 5001)..."
cd /app/server && python3 app.py &

# 等待 Flask 就绪（最多 10 秒）
for i in $(seq 1 10); do
    if wget -q -O /dev/null http://127.0.0.1:5001/api/bin/health 2>/dev/null; then
        echo "[start] Flask 已就绪"
        break
    fi
    echo "[start] 等待 Flask 启动... ($i/10)"
    sleep 1
done

# 前台启动 nginx
echo "[start] 启动 nginx..."
exec nginx -g 'daemon off;'

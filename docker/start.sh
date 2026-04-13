#!/bin/sh
# 启动脚本：先启动后端（Flask），再启动 nginx

# 确保系统时区为北京时间
export TZ=Asia/Shanghai

# 创建 bin 存储目录
mkdir -p /root/app/server/bin

# 后台启动后端（Flask）
echo "[start] 启动 bin 服务 (Flask, port 5001)..."
cd /root/app/server && python3 app.py &

# 等待后端就绪（最多 10 秒）
for i in $(seq 1 10); do
    if wget -q -O /dev/null http://127.0.0.1:5001/api/bin/health 2>/dev/null; then
        echo "[start] 后端已就绪"
        break
    fi
    echo "[start] 等待后端启动... ($i/10)"
    sleep 1
done

# 前台启动 nginx
echo "[start] 启动 nginx..."
exec nginx -g 'daemon off;'

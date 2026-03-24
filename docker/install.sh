# 3. 加载镜像
docker load -i /tmp/xyzw-bin-server.tar

# 4. 运行容器
docker run -d \
  -p 5001:5001 \
  -v /root/app/server/bin:/root/app/server/bin \
  -v /root/app/server/data:/root/app/server/data \
  --name xyzw-bin-server \
  --restart unless-stopped \
  xyzw-bin-server:latest
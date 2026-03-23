# 1. 构建镜像
version := 1.0.2
build:
	docker build -f docker/dockerfile -t xyzw-bin-server:$(version) .

# 2. 保存为 tar 文件
save:
	docker save xyzw-bin-server:$(version) -o xyzw-bin-server-$(version).tar

send:
	scp -P 36000 xyzw-bin-server-$(version).tar root@192.168.31.250:~/.

dist:
	npm run build

send_dist:
	scp -r -P 36000 dist/* root@192.168.31.250:/root/app/web/dist/

run:
	@echo "docker run -d \
	-p 5001:5001 \
	-v /root/app/server/bin:/root/app/server/bin \
	--name xyzw-bin-server \
	--restart unless-stopped \
	xyzw-bin-server:$(version)"

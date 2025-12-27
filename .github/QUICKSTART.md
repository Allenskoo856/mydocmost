# 🚀 GitHub Actions Docker 自动构建快速开始

## 第一步：配置 DockerHub Secrets

1. **获取 DockerHub Token**
   ```
   访问: https://hub.docker.com/settings/security
   创建新的 Access Token (权限选择 Read, Write, Delete)
   复制生成的 token（只显示一次）
   ```

2. **在 GitHub 添加 Secrets**
   ```
   仓库 → Settings → Secrets and variables → Actions → New repository secret
   
   添加两个 secrets:
   - Name: DOCKERHUB_USERNAME, Value: 你的DockerHub用户名
   - Name: DOCKERHUB_TOKEN,    Value: 刚才复制的token
   ```

## 第二步：修改镜像名称（如果需要）

编辑 `.github/workflows/docker-build.yml`:

```yaml
env:
  IMAGE_NAME: ${{ secrets.DOCKERHUB_USERNAME }}/docmost  # 修改 docmost 为你的镜像名
```

## 第三步：触发构建

### 方式一：推送代码（自动触发）

```bash
git add .
git commit -m "Setup GitHub Actions Docker build"
git push origin main
```

### 方式二：创建版本标签

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 方式三：手动触发

```
GitHub → Actions → Build and Push Docker Image → Run workflow
```

## 第四步：查看构建状态

```
GitHub → Actions 标签页 → 查看正在运行的 workflow
```

构建时间参考：
- amd64 架构：约 10-15 分钟
- arm64 架构：约 20-30 分钟（首次构建）
- 后续构建有缓存会更快

## 第五步：使用镜像

### 拉取镜像

```bash
# 默认拉取 latest 标签（包含 amd64 和 arm64）
docker pull 你的用户名/docmost:latest

# Docker 会自动选择匹配当前系统架构的镜像
```

### 运行测试

```bash
docker run -d \
  --name docmost-test \
  -p 3000:3000 \
  -e APP_SECRET="test-secret-key-at-least-32-chars-long-please" \
  -e DATABASE_URL="postgresql://user:pass@host:5432/docmost" \
  -e REDIS_URL="redis://redis:6379" \
  你的用户名/docmost:latest
```

### 使用 docker-compose

```bash
# 复制示例文件
cp docker-compose.custom.example.yml docker-compose.custom.yml

# 编辑配置
nano docker-compose.custom.yml  # 修改镜像名称和环境变量

# 启动服务
docker-compose -f docker-compose.custom.yml up -d

# 查看日志
docker-compose -f docker-compose.custom.yml logs -f docmost
```

## 验证多架构支持

```bash
# 检查镜像支持的架构
docker buildx imagetools inspect 你的用户名/docmost:latest

# 应该看到类似输出:
# Platform:  linux/amd64
# Platform:  linux/arm64
```

## 常见问题

### Q: 构建失败，显示 "denied: requested access"
**A:** 检查 DOCKERHUB_USERNAME 和 DOCKERHUB_TOKEN 是否正确配置

### Q: 构建时间太长
**A:** 首次构建 arm64 需要 20-30 分钟是正常的，后续构建会利用缓存加速

### Q: 如何只构建 x86 架构？
**A:** 编辑 `.github/workflows/docker-build.yml`，修改:
```yaml
platforms: linux/amd64  # 删除 linux/arm64
```

### Q: 如何使用特定版本？
**A:** 推送 git tag 会自动创建对应版本的镜像:
```bash
git tag v1.0.0
git push origin v1.0.0
# 会生成: v1.0.0, v1.0, v1, latest
```

## 下一步

- 📚 查看完整文档: `.github/DOCKER_BUILD_GUIDE.md`
- 🔍 监控构建状态: GitHub Actions 标签页
- 📦 查看镜像: https://hub.docker.com/r/你的用户名/docmost
- ⭐ 添加构建徽章到 README

## 构建徽章

添加到 README.md:

```markdown
[![Docker Build](https://github.com/你的用户名/mydocmost/actions/workflows/docker-build.yml/badge.svg)](https://github.com/你的用户名/mydocmost/actions/workflows/docker-build.yml)
```

## 技术支持

如有问题，请查看：
1. GitHub Actions 日志（详细的构建输出）
2. `.github/DOCKER_BUILD_GUIDE.md`（完整文档）
3. Docker Hub 仓库（检查镜像是否成功推送）

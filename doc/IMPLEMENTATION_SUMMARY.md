# GitHub Actions Docker 多架构构建配置总结

## ✅ 已完成的配置

### 1. 主要构建流程 (`.github/workflows/docker-build.yml`)
- ✅ 支持多架构：`linux/amd64` (x86_64) 和 `linux/arm64` (ARM)
- ✅ 自动触发：推送到 main/master 分支或版本标签时自动构建
- ✅ 智能标签生成：latest, 版本号, 分支名, SHA
- ✅ GitHub Actions 缓存：加速后续构建
- ✅ 手动触发支持

### 2. 测试构建流程 (`.github/workflows/docker-test.yml`)
- ✅ 仅构建 amd64 架构（快速测试用）
- ✅ 不推送到 DockerHub（节省时间）
- ✅ 适用于开发分支测试

### 3. 配置文档
- ✅ `.github/QUICKSTART.md` - 快速开始指南
- ✅ `.github/DOCKER_BUILD_GUIDE.md` - 完整配置文档
- ✅ `docker-compose.custom.example.yml` - Docker Compose 示例

## 📋 使用前需要完成的配置

### 必须配置的 GitHub Secrets

在你的 GitHub 仓库中添加以下 Secrets：

1. **DOCKERHUB_USERNAME**
   - 你的 DockerHub 用户名
   - 例如：`zhangsan`

2. **DOCKERHUB_TOKEN**
   - DockerHub Access Token（不是密码）
   - 获取方式：https://hub.docker.com/settings/security
   - 权限：Read, Write, Delete

### 可选：修改镜像名称

如果你想自定义镜像名称，编辑 `.github/workflows/docker-build.yml`：

```yaml
env:
  IMAGE_NAME: ${{ secrets.DOCKERHUB_USERNAME }}/你的镜像名称
```

## 🚀 触发构建的方式

### 1. 推送到主分支（自动触发）
```bash
git add .
git commit -m "Your changes"
git push origin main
```

### 2. 创建版本标签（自动触发）
```bash
git tag v1.0.0
git push origin v1.0.0
```

会生成以下镜像标签：
- `latest` (如果是主分支)
- `v1.0.0`
- `v1.0`
- `v1`
- `main-abc123` (分支名-SHA)

### 3. 手动触发
- GitHub 仓库 → Actions → Build and Push Docker Image → Run workflow

## 📦 生成的镜像标签

根据不同的触发方式，会自动生成相应的标签：

| 触发方式 | 生成的标签 | 示例 |
|---------|-----------|------|
| 推送到 main | `latest`, `main`, `main-abc123` | `yourname/docmost:latest` |
| 推送到 dev | `dev`, `dev-abc123` | `yourname/docmost:dev` |
| 推送 tag v1.2.3 | `v1.2.3`, `v1.2`, `v1`, `latest` | `yourname/docmost:v1.2.3` |
| Pull Request | `pr-123` | 仅构建不推送 |

## 🏗️ 构建架构说明

支持的架构：
- **linux/amd64** - x86_64 (Intel/AMD 处理器)
- **linux/arm64** - ARM 64-bit (Apple Silicon M1/M2, AWS Graviton, 树莓派 4)

Docker 会自动为用户的系统选择正确的架构镜像。

## ⏱️ 构建时间参考

| 架构 | 首次构建 | 缓存后构建 |
|------|---------|-----------|
| amd64 | 10-15 分钟 | 5-8 分钟 |
| arm64 | 20-30 分钟 | 10-15 分钟 |

注意：ARM64 通过 QEMU 模拟构建，速度较慢是正常现象。

## 🔍 验证构建结果

### 查看构建状态
```bash
# GitHub Actions 页面查看实时日志
# 或者查看构建徽章状态
```

### 检查镜像
```bash
# 查看 DockerHub 上的镜像
https://hub.docker.com/r/你的用户名/docmost

# 查看镜像支持的架构
docker buildx imagetools inspect 你的用户名/docmost:latest
```

### 拉取并测试
```bash
# 拉取镜像
docker pull 你的用户名/docmost:latest

# 查看本地镜像
docker images | grep docmost

# 运行测试
docker run --rm 你的用户名/docmost:latest pnpm --version
```

## 📝 使用镜像

### 基本用法
```bash
docker run -d \
  --name docmost \
  -p 3000:3000 \
  -e APP_SECRET="your-secret-at-least-32-chars" \
  -e DATABASE_URL="postgresql://user:pass@host:5432/docmost" \
  -e REDIS_URL="redis://redis:6379" \
  -v docmost-storage:/app/data/storage \
  你的用户名/docmost:latest
```

### 使用 Docker Compose
```bash
# 复制示例配置
cp docker-compose.custom.example.yml docker-compose.prod.yml

# 修改配置（镜像名称、密码等）
nano docker-compose.prod.yml

# 启动服务
docker-compose -f docker-compose.prod.yml up -d
```

## 🐛 故障排查

### 问题：构建失败 "denied: requested access"
**原因**：DockerHub 认证失败
**解决**：
1. 检查 GitHub Secrets 是否正确配置
2. 确认 DOCKERHUB_TOKEN 是 Access Token，不是密码
3. 确认 Token 权限包含 Write

### 问题：ARM64 构建超时
**原因**：QEMU 模拟构建速度慢
**解决**：
1. 首次构建需要耐心等待（20-30分钟）
2. 后续构建会利用缓存加速
3. 可以暂时只构建 amd64 架构进行测试

### 问题：推送到 DockerHub 失败
**原因**：镜像名称格式错误
**解决**：
1. 镜像名称必须是：`用户名/镜像名`
2. 用户名必须与 DOCKERHUB_USERNAME 一致
3. 确保 DockerHub 上存在该仓库（首次推送会自动创建）

## 🎯 下一步建议

1. **添加构建徽章到 README**
   ```markdown
   [![Docker Build](https://github.com/你的用户名/mydocmost/actions/workflows/docker-build.yml/badge.svg)](https://github.com/你的用户名/mydocmost/actions/workflows/docker-build.yml)
   ```

2. **设置 DockerHub 自动构建描述**
   - 在 DockerHub 仓库页面设置 README
   - 添加使用说明和版本信息

3. **配置版本发布流程**
   - 使用 semantic versioning (v1.0.0)
   - 每次发布创建 Git tag
   - 自动生成 Release Notes

4. **监控和维护**
   - 定期检查构建日志
   - 清理旧的镜像标签
   - 更新依赖版本

## 📚 相关文档

- **快速开始**: `.github/QUICKSTART.md`
- **完整指南**: `.github/DOCKER_BUILD_GUIDE.md`
- **Docker Compose**: `docker-compose.custom.example.yml`

## 🔗 相关链接

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Docker Buildx 文档](https://docs.docker.com/buildx/)
- [DockerHub 文档](https://docs.docker.com/docker-hub/)
- [多架构镜像指南](https://docs.docker.com/build/building/multi-platform/)

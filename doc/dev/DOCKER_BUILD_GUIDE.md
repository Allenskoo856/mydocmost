# GitHub Actions Docker 构建配置说明

本文档说明如何配置 GitHub Actions 自动构建并推送 Docker 镜像到 DockerHub。

## 功能特性

- ✅ 支持多架构构建：`linux/amd64` (x86_64) 和 `linux/arm64` (ARM)
- ✅ 自动触发：推送到 main/master 分支或创建版本标签时自动构建
- ✅ 智能标签：自动生成版本标签、分支标签和 latest 标签
- ✅ 构建缓存：使用 GitHub Actions 缓存加速构建
- ✅ 手动触发：支持在 GitHub Actions 页面手动运行

## 配置步骤

### 1. 获取 DockerHub 访问令牌

1. 登录 [DockerHub](https://hub.docker.com/)
2. 点击右上角头像 → **Account Settings**
3. 选择 **Security** → **New Access Token**
4. 输入令牌描述（如：`github-actions`），权限选择 **Read, Write, Delete**
5. 点击 **Generate**，**复制生成的令牌**（只显示一次）

### 2. 配置 GitHub Secrets

1. 进入你的 GitHub 仓库
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**，添加以下两个 secrets：

   - **Name**: `DOCKERHUB_USERNAME`
     - **Secret**: 你的 DockerHub 用户名

   - **Name**: `DOCKERHUB_TOKEN`
     - **Secret**: 刚才生成的 DockerHub 访问令牌

### 3. 修改镜像名称（可选）

如果你的 DockerHub 用户名和镜像名称不是 `docmost`，需要修改 `.github/workflows/docker-build.yml` 文件：

```yaml
env:
  IMAGE_NAME: ${{ secrets.DOCKERHUB_USERNAME }}/你的镜像名称
```

## 触发构建

### 自动触发

- **推送代码到 main/master 分支**：
  ```bash
  git add .
  git commit -m "Your changes"
  git push origin main
  ```

- **创建版本标签**：
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```

### 手动触发

1. 进入 GitHub 仓库的 **Actions** 标签页
2. 选择左侧的 **Build and Push Docker Image** workflow
3. 点击右侧的 **Run workflow** 按钮
4. 选择分支后点击 **Run workflow**

## 镜像标签说明

构建成功后，会自动生成以下标签：

- `latest`: 最新的 main/master 分支构建
- `main` 或 `master`: 对应分支的最新构建
- `v1.0.0`: 版本标签（如果推送了 tag）
- `v1.0`: 主版本号 + 次版本号
- `v1`: 主版本号
- `main-abc123`: 分支名 + commit SHA

## 使用镜像

### 拉取镜像

```bash
# 拉取最新版本（默认 linux/amd64）
docker pull 你的用户名/docmost:latest

# 拉取指定版本
docker pull 你的用户名/docmost:v1.0.0

# 拉取特定架构
docker pull --platform linux/arm64 你的用户名/docmost:latest
docker pull --platform linux/amd64 你的用户名/docmost:latest
```

### 运行容器

```bash
docker run -d \
  --name docmost \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/docmost" \
  -e REDIS_URL="redis://redis:6379" \
  -e APP_SECRET="your-secret-key" \
  -v docmost-storage:/app/data/storage \
  你的用户名/docmost:latest
```

## 验证多架构支持

使用 Docker Buildx 检查镜像支持的架构：

```bash
docker buildx imagetools inspect 你的用户名/docmost:latest
```

输出示例：
```
Name:      你的用户名/docmost:latest
MediaType: application/vnd.docker.distribution.manifest.list.v2+json
Digest:    sha256:...

Manifests:
  Name:      你的用户名/docmost:latest@sha256:...
  MediaType: application/vnd.docker.distribution.manifest.v2+json
  Platform:  linux/amd64

  Name:      你的用户名/docmost:latest@sha256:...
  MediaType: application/vnd.docker.distribution.manifest.v2+json
  Platform:  linux/arm64
```

## 构建状态徽章

将以下徽章添加到你的 README.md：

```markdown
[![Docker Build](https://github.com/你的用户名/mydocmost/actions/workflows/docker-build.yml/badge.svg)](https://github.com/你的用户名/mydocmost/actions/workflows/docker-build.yml)
```

## 故障排查

### 问题：构建失败，提示 "denied: requested access to the resource is denied"

**解决方案**：
- 检查 DOCKERHUB_USERNAME 和 DOCKERHUB_TOKEN 是否正确配置
- 确认 DockerHub 令牌有 Write 权限
- 检查镜像名称格式是否正确（`用户名/镜像名`）

### 问题：ARM64 架构构建时间过长

**说明**：ARM64 架构通过 QEMU 模拟构建，速度较慢是正常现象。首次构建可能需要 20-40 分钟。

**优化建议**：
- GitHub Actions 缓存会在后续构建中加速
- 可以考虑使用自托管的 ARM64 runner

### 问题：构建超时

**解决方案**：
- GitHub Actions 免费版单个 job 限制 6 小时
- 如果超时，可以尝试分开构建不同架构
- 或者只构建 amd64 架构（注释掉 arm64）

## 高级配置

### 仅构建特定架构

编辑 `.github/workflows/docker-build.yml`，修改 `platforms` 字段：

```yaml
# 仅构建 x86_64
platforms: linux/amd64

# 仅构建 ARM64
platforms: linux/arm64

# 构建两种架构
platforms: linux/amd64,linux/arm64
```

### 添加更多架构

支持的架构列表：
- `linux/amd64` - x86_64
- `linux/arm64` - ARM 64-bit (Apple Silicon, AWS Graviton, 树莓派 4)
- `linux/arm/v7` - ARM 32-bit (旧版树莓派)
- `linux/arm/v6` - ARM 32-bit (树莓派 Zero)
- `linux/ppc64le` - IBM POWER
- `linux/s390x` - IBM Z

### 推送到多个镜像仓库

除了 DockerHub，还可以同时推送到 GitHub Container Registry (ghcr.io)：

```yaml
- name: Log in to GitHub Container Registry
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

- name: Extract metadata
  id: meta
  uses: docker/metadata-action@v5
  with:
    images: |
      ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
      ghcr.io/${{ github.repository }}
```

## 参考资源

- [Docker Buildx 文档](https://docs.docker.com/buildx/working-with-buildx/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Docker Hub 文档](https://docs.docker.com/docker-hub/)

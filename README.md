<div align="center">
    <h1><b>Docmost</b></h1>
    <p>
        Open-source collaborative wiki and documentation software.
        <br />
        <a href="https://docmost.com"><strong>Website</strong></a> | 
        <a href="https://docmost.com/docs"><strong>Documentation</strong></a> |
        <a href="https://twitter.com/DocmostHQ"><strong>Twitter / X</strong></a>
    </p>
</div>
<br />

```markdown
[![Docker Build](https://github.com/Allenskoo856/mydocmost/actions/workflows/docker-build.yml/badge.svg)](https://github.com/Allenskoo856/mydocmost/actions/workflows/docker-build.yml)
```

## Features

- Real-time collaboration
- Diagrams (Draw.io, Excalidraw and Mermaid)
- Spaces
- Permissions management
- Groups
- Comments
- Page history
- Search
- File attachments
- Embeds (Airtable, Loom, Miro and more)
- Translations (10+ languages)

### Screenshots

<p align="center">
<img alt="home" src="https://docmost.com/screenshots/home.png" width="70%">
<img alt="editor" src="https://docmost.com/screenshots/editor.png" width="70%">
</p>

---

## 子目录部署指南

本项目支持在子目录下部署（例如 `https://example.com/docmost/`），而不仅仅是根路径部署。

### 环境变量配置

在 `.env` 文件中设置以下变量：

```bash
# 应用 URL（包含完整路径）
APP_URL=https://example.com

# 子目录路径（必须以 / 开头，不以 / 结尾）
BASE_PATH=/docmost
```

### Docker 部署

#### 方式一：使用环境变量

```yaml
# docker-compose.yml
version: '3.8'
services:
  docmost:
    image: your-registry/docmost:latest
    environment:
      - APP_URL=https://example.com
      - BASE_PATH=/docmost
      - DATABASE_URL=postgresql://user:pass@db:5432/docmost
      - REDIS_URL=redis://redis:6379
      - APP_SECRET=your-secret-key-min-32-chars
    ports:
      - "3000:3000"
```

#### 方式二：构建时指定

```bash
docker build --build-arg BASE_PATH=/docmost -t docmost:custom .
```

### Nginx 反向代理配置

以下是完整的 Nginx 配置示例，支持子目录部署：

```nginx
# /etc/nginx/conf.d/docmost.conf

upstream docmost_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 80;
    listen 443 ssl http2;
    server_name example.com;

    # SSL 配置（如果使用 HTTPS）
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # 子目录代理配置
    location /docmost/ {
        proxy_pass http://docmost_backend/docmost/;
        proxy_http_version 1.1;
        
        # 基本代理头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        
        # WebSocket 支持（用于实时协作）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # 缓冲设置
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Socket.IO 专用配置
    location /docmost/socket.io/ {
        proxy_pass http://docmost_backend/docmost/socket.io/;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 必需
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 长连接超时
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 协作编辑 WebSocket 配置
    location /docmost/collab/ {
        proxy_pass http://docmost_backend/docmost/collab/;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 必需
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 长连接超时
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### 简化版 Nginx 配置

如果您的 Nginx 版本支持，可以使用更简洁的配置：

```nginx
server {
    listen 80;
    server_name example.com;

    location /docmost/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }
}
```

### 验证部署

部署完成后，执行以下检查：

1. **访问主页**：`https://example.com/docmost/`
2. **检查静态资源**：确保 CSS/JS 正确加载（无 404 错误）
3. **测试登录**：登录后应跳转到 `/docmost/home`
4. **测试 Cookie**：检查浏览器 DevTools，`authToken` 的 Path 应为 `/docmost`
5. **测试协作编辑**：打开两个浏览器窗口，验证实时同步功能
6. **测试文件上传**：上传图片并确认能正常显示

### 常见问题

#### Q: 页面跳转到错误的路径（如 `/login` 而不是 `/docmost/login`）
A: 确保 `BASE_PATH` 环境变量已正确设置，并重新构建/重启应用。

#### Q: WebSocket 连接失败
A: 检查 Nginx 配置中的 WebSocket 相关头（`Upgrade` 和 `Connection`）是否正确设置。

#### Q: 静态资源 404
A: 确保 Nginx 的 `proxy_pass` 路径末尾包含 `/`，例如 `proxy_pass http://backend/docmost/;`

#### Q: Cookie 无法清除（注销失败）
A: 检查 Cookie 的 Path 是否与 `BASE_PATH` 一致。


# Enterprise Edition (EE) Features - 企业版功能说明

## ⚠️ 重要提示

本目录 (`apps/client/src/ee`) 包含企业版特性代码。对于内网部署，这些功能已通过配置禁用，但代码保留以符合AGPL 3.0开源协议要求。

## 📋 EE功能列表

本目录包含以下企业版功能：

### 1. 计费系统 (Billing)
- 订阅计划管理
- 试用期管理
- Stripe支付集成
- **内网部署**: 通过 `CLOUD=false` 自动隐藏

### 2. 安全功能 (Security)
- SSO单点登录 (SAML, OIDC, Google, LDAP)
- 多因素认证 (MFA/2FA)
- 强制SSO登录
- 域名白名单
- **内网部署**: 通过 `CLOUD=false` 自动隐藏

### 3. 许可证管理 (License)
- 企业许可证激活
- 许可证状态验证
- **内网部署**: 通过 `CLOUD=false` 自动隐藏

### 4. API密钥管理 (API Keys)
- 用户API密钥
- 工作区API密钥
- **内网部署**: 通过 `CLOUD=false` 自动隐藏

### 5. AI功能 (AI)
- AI语义搜索
- AI内容生成
- **内网部署**: 需额外配置AI服务，可选功能

### 6. 评论增强 (Comments)
- 评论解决/关闭功能
- **内网部署**: 部分功能可用

### 7. 云服务集成 (Cloud)
- 多工作区切换
- 云端登录
- 工作区创建
- **内网部署**: 完全禁用

## 🔒 AGPL 3.0 合规性说明

### 为什么保留EE代码？

根据AGPL 3.0协议第1条：
> "源代码"指的是对作品进行修改的首选形式，包括所有模块、接口定义文件以及用于控制编译和安装的脚本。

保留完整的源代码（包括EE部分）符合AGPL精神，确保：
1. ✅ 完整的源代码可访问性
2. ✅ 可以研究和学习完整实现
3. ✅ 可以根据需要修改任何部分
4. ✅ 可以根据需要启用任何功能

### EE代码的许可证

本目录中的某些文件包含独立的 `LICENSE` 声明。这些文件可能：
- 采用与主项目相同的AGPL 3.0许可
- 或采用其他兼容的开源许可

**重要**: 请查看具体文件中的许可证声明。

## 🚀 内网部署配置

### 禁用所有EE功能

在 `.env` 文件中设置：

```bash
CLOUD=false
```

这将自动隐藏以下界面元素：
- 设置菜单中的Billing、License、Security选项
- 登录页面的SSO登录选项
- 试用期到期提示
- PostHog分析跟踪

### 核心功能不受影响

禁用EE功能后，以下核心功能完全可用：
- ✅ 用户注册和登录
- ✅ 空间和文档管理
- ✅ 实时协作编辑
- ✅ 权限和角色管理
- ✅ 文件上传和附件
- ✅ 搜索功能（基于PostgreSQL）
- ✅ 评论功能
- ✅ 文档导入导出
- ✅ 页面历史和版本
- ✅ 分享功能

## 🛠️ 开发者说明

### EE功能的代码结构

```
apps/client/src/ee/
├── ai/              # AI功能
├── api-key/         # API密钥管理
├── billing/         # 计费系统
├── cloud/           # 云服务
├── comment/         # 评论增强
├── components/      # 共享组件
├── hooks/           # 共享Hooks
├── licence/         # 许可证管理 (注意拼写)
├── mfa/             # 多因素认证
├── pages/           # EE页面
├── security/        # 安全功能(SSO)
└── utils.ts         # 工具函数
```

### 功能开关机制

EE功能通过以下方式控制：

1. **环境变量**: `CLOUD`
2. **配置函数**: `isCloud()` from `@/lib/config.ts`
3. **条件渲染**: `{isCloud() && <EEComponent />}`
4. **路由保护**: `{isCloud() && <Route ... />}`

### 如何完全删除EE代码（不推荐）

如果您决定完全删除EE代码（违背AGPL精神但技术上可行）：

```bash
# ⚠️ 警告：此操作不可逆，且需大量代码调整

# 1. 删除EE目录
rm -rf apps/client/src/ee

# 2. 需要修改的文件（约60+个）
# - apps/client/src/App.tsx (删除EE路由)
# - apps/client/src/components/settings/settings-sidebar.tsx (删除EE菜单)
# - apps/client/src/components/layouts/* (删除EE组件引用)
# - apps/client/src/features/**/（删除EE功能集成）
# - 等等...

# 3. 更新TypeScript引用
# 搜索并删除所有 from "@/ee" 导入

# 4. 重新构建
pnpm install
pnpm build
```

**强烈不推荐**此做法，原因：
- ❌ 违背AGPL 3.0完整源码原则
- ❌ 修改工作量大，易出错
- ❌ 未来升级困难
- ❌ 失去学习和研究价值

## 📖 相关文档

- [AGPL 3.0 许可证全文](../../LICENSE)
- [内网部署完整指南](../../INTERNAL_NETWORK_DEPLOYMENT_GUIDE.md)
- [环境变量配置示例](../../.env.internal.example)
- [Docmost官方文档](https://docmost.com/docs)

## ❓ 常见问题

**Q: 保留EE代码会有安全风险吗？**
A: 不会。通过 `CLOUD=false` 配置，EE功能不会被加载或执行。就像一个"死代码"。

**Q: 是否需要删除EE代码才能合规？**
A: 不需要。保留完整源码更符合AGPL 3.0精神。只需通过配置禁用功能即可。

**Q: 如何验证EE功能已禁用？**
A: 检查以下几点：
1. 设置菜单中无Billing/License/Security选项
2. 登录页面无SSO按钮
3. 无Trial到期提示
4. 浏览器开发工具Network标签无对外请求

**Q: 可以选择性启用某些EE功能吗？**
A: 理论上可以，但需要修改代码逻辑，不推荐。建议要么全部禁用，要么咨询原作者获取商业许可。

## 📧 联系方式

如有关于EE功能或许可证的问题，请联系：
- Docmost官方: https://docmost.com
- GitHub仓库: https://github.com/docmost/docmost
- 许可证咨询: 参考项目README中的联系方式

---

**最后更新**: 2025-12-27
**适用版本**: Docmost (AGPL 3.0)

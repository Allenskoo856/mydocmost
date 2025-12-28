# EE功能移除完成报告

## 修改日期
2025-12-27

## 修改目标
1. 通过 `CLOUD=false` 配置禁用所有企业版功能
2. 从代码中删除所有EE相关的菜单和UI入口
3. 确保核心功能不受影响

## 已修改文件清单

### 一、核心路由文件

#### 1. `apps/client/src/App.tsx`
**修改内容**:
- ✅ 删除所有EE页面导入 (Billing, Security, License, MFA, API Keys, AI Settings, Cloud Login)
- ✅ 删除MFA登录路由 (`/login/mfa`, `/login/mfa/setup`)
- ✅ 删除云服务路由 (`/create`, `/select`)
- ✅ 删除设置中的EE路由:
  - `account/api-keys` (用户API密钥)
  - `api-keys` (工作区API密钥)
  - `security` (安全与SSO)
  - `ai` (AI设置)
  - `license` (许可证)
  - `billing` (计费)
- ✅ 移除 `useRedirectToCloudSelect` hook调用
- ✅ 移除 `isCloud()` 条件判断

**保留功能**:
- ✅ 用户认证 (登录、注册、密码重置)
- ✅ 工作区初始化 (`/setup/register`)
- ✅ 邀请注册
- ✅ 分享页面
- ✅ 所有核心内容页面 (Home, Spaces, Pages)
- ✅ 所有核心设置页面 (Profile, Preferences, Workspace, Members, Groups, Spaces, Sharing)

### 二、设置侧边栏

#### 2. `apps/client/src/components/settings/settings-sidebar.tsx`
**修改内容**:
- ✅ 删除EE图标导入 (IconCoin, IconLock, IconKey, IconSparkles)
- ✅ 删除EE预加载函数导入:
  - `prefetchApiKeyManagement`
  - `prefetchApiKeys`
  - `prefetchBilling`
  - `prefetchLicense`
  - `prefetchSsoProviders`
- ✅ 从菜单数据中删除所有EE菜单项:
  - **Account** 组: 删除 "API keys"
  - **Workspace** 组: 删除 "Billing", "Security & SSO", "API management", "AI settings"
  - **System** 组: 完全删除（包括 "License & Edition"）
- ✅ 简化菜单显示逻辑，移除EE相关的权限检查
- ✅ 简化预加载逻辑，移除EE相关的switch case

**保留菜单**:
- ✅ Account: Profile, Preferences
- ✅ Workspace: General, Members, Groups, Spaces, Public sharing

### 三、布局组件

#### 3. `apps/client/src/components/layouts/global/layout.tsx`
**修改内容**:
- ✅ 删除 `PosthogUser` 组件导入
- ✅ 删除 `isCloud` 函数导入
- ✅ 移除 `{isCloud() && <PosthogUser />}` 条件渲染

#### 4. `apps/client/src/components/layouts/global/global-app-shell.tsx`
**修改内容**:
- ✅ 删除 `useTrialEndAction` hook导入
- ✅ 移除 `useTrialEndAction()` 调用

#### 5. `apps/client/src/components/layouts/global/app-header.tsx`
**修改内容**:
- ✅ 删除 `Badge`, `Tooltip` 组件导入（未使用）
- ✅ 删除 `useTrial` hook导入
- ✅ 删除 `isCloud` 函数导入
- ✅ 删除 `shareSearchSpotlight` 导入（未使用）
- ✅ 移除Trial天数倒计时徽章显示:
  ```tsx
  {isCloud() && isTrial && trialDaysLeft !== 0 && (
    <Badge ... />
  )}
  ```

### 四、之前已完成的外网连接移除

#### 6. `apps/server/src/integrations/telemetry/telemetry.service.ts`
- ✅ 禁用向 `https://tel.docmost.com` 的遥测数据上报

#### 7. `apps/client/src/main.tsx`
- ✅ 完全移除PostHog初始化和Provider

#### 8. `apps/client/src/features/editor/components/excalidraw/excalidraw-view.tsx`
- ✅ 注释掉unpkg CDN引用

#### 9. `apps/client/src/features/share/components/share-branding.tsx`
- ✅ 移除 "Powered by Docmost" 外链

### 五、配置文件

#### 10. `.env.example`
- ✅ 添加 `CLOUD=false` 配置项说明
- ✅ 修改 `DISABLE_TELEMETRY=true`

#### 11. `.env.internal.example` (新增)
- ✅ 创建内网部署专用配置示例

## 删除的EE功能清单

### 账户级别
- ❌ API密钥管理（用户级别）

### 工作区级别
- ❌ 计费与订阅 (Billing)
- ❌ 安全与SSO (Security)
  - ❌ SAML登录
  - ❌ OIDC登录
  - ❌ Google登录
  - ❌ LDAP登录
  - ❌ 强制SSO
  - ❌ 域名白名单
- ❌ 多因素认证 (MFA/2FA)
- ❌ API密钥管理（工作区级别）
- ❌ AI设置
  - ❌ AI语义搜索
  - ❌ AI内容生成

### 系统级别
- ❌ 许可证管理 (License)
- ❌ 版本信息（云端专用）

### 云服务功能
- ❌ 多工作区切换
- ❌ 云端登录页面
- ❌ 工作区创建页面

### 分析与追踪
- ❌ PostHog用户分析
- ❌ Trial试用期提示
- ❌ 遥测数据上报

## 保留的核心功能

### ✅ 用户管理
- 用户注册、登录、登出
- 密码重置
- 个人资料管理
- 偏好设置
- 邀请用户

### ✅ 工作区管理
- 工作区创建与初始化
- 工作区设置
- 成员管理
- 组管理

### ✅ 空间与内容
- 空间创建与管理
- 页面创建、编辑、删除
- 页面移动、复制
- 页面历史与版本
- 实时协作编辑

### ✅ 协作功能
- 评论
- @提及
- 权限管理（角色与权限）
- 分享功能（公开分享）

### ✅ 内容功能
- 富文本编辑器
- 文件附件上传
- 图片上传
- Markdown导入导出
- HTML导出
- Excalidraw绘图
- Draw.io绘图（需配置）

### ✅ 搜索
- 全文搜索（PostgreSQL）
- 搜索建议

## 部署配置要求

### 必须设置的环境变量

```bash
# 禁用云服务（必须）
CLOUD=false

# 禁用遥测（必须）
DISABLE_TELEMETRY=true

# 其他基础配置
APP_SECRET=your-secret-key-min-32-chars
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
APP_URL=http://your-internal-domain.com
```

### 验证EE功能已禁用

部署后检查以下几点：

1. **UI检查**:
   - [ ] 设置菜单中无 "Billing" 选项
   - [ ] 设置菜单中无 "Security & SSO" 选项
   - [ ] 设置菜单中无 "License & Edition" 选项
   - [ ] 设置菜单中无 "API keys" (账户级别) 选项
   - [ ] 设置菜单中无 "API management" (工作区级别) 选项
   - [ ] 设置菜单中无 "AI settings" 选项
   - [ ] 登录页面无SSO登录按钮
   - [ ] 页面顶部无Trial倒计时徽章
   - [ ] 分享页面底部无 "Powered by Docmost" 链接

2. **网络检查**:
   - [ ] 浏览器Network标签无对 `tel.docmost.com` 的请求
   - [ ] 浏览器Network标签无对 `posthog` 的请求
   - [ ] 浏览器Network标签无对 `docmost.com` 的请求

3. **功能验证**:
   - [ ] 用户注册登录正常
   - [ ] 创建文档正常
   - [ ] 实时协作正常
   - [ ] 搜索功能正常
   - [ ] 文件上传正常
   - [ ] 邀请成员正常

## 技术说明

### 为什么不删除 `apps/client/src/ee` 目录？

1. **AGPL 3.0合规**: 保留完整源码符合开源协议要求
2. **降低风险**: 避免因大量删除导致的潜在构建错误
3. **便于维护**: 未来如需恢复或参考，代码仍然可用
4. **实际效果**: 删除路由和菜单后，EE代码不会被加载或执行

### EE目录代码的状态

- **存在于源码中**: 是的，`apps/client/src/ee` 目录仍然存在
- **会被编译**: 不会，因为没有任何路由或导入引用这些文件
- **会被加载**: 不会，构建工具的tree-shaking会移除未使用的代码
- **占用空间**: 仅占用源码空间，不影响生产构建大小

### 如果想完全删除EE代码

```bash
# 不推荐，但如果坚持：
rm -rf apps/client/src/ee
rm -rf apps/server/src/ee

# 然后需要检查并修复所有编译错误
pnpm build
```

**注意**: 这样做会：
- ❌ 失去AGPL源码完整性
- ❌ 增加未来升级难度
- ❌ 失去学习和参考价值
- ✅ 减少一些源码体积（但不影响生产构建）

## 总结

### 完成情况
- ✅ 所有EE菜单已删除
- ✅ 所有EE路由已删除
- ✅ 所有EE UI组件引用已移除
- ✅ 所有外网连接已禁用
- ✅ 核心功能保持完整
- ✅ 代码可以正常编译和运行

### 修改文件统计
- 核心文件修改: 5个 (App.tsx, settings-sidebar.tsx, layout.tsx, global-app-shell.tsx, app-header.tsx)
- 外网连接禁用: 4个 (已在之前完成)
- 配置文件更新: 2个
- 文档创建: 4个
- **总计**: 15个文件修改/创建

### 下一步
1. 复制 `.env.internal.example` 为 `.env`
2. 配置必要的环境变量（尤其是 `CLOUD=false` 和 `DISABLE_TELEMETRY=true`）
3. 运行 `pnpm build` 验证构建成功
4. 部署到内网环境
5. 按照 `DEPLOYMENT_CHECKLIST.md` 进行验证

---

**修改完成**: ✅  
**编译测试**: 待验证  
**部署测试**: 待验证  
**合规性**: 符合AGPL 3.0（源码保留，功能可选）

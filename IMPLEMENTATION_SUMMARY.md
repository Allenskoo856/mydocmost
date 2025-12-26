# 多级页面导入功能实现总结

## 功能概述
实现了在任意层级页面下导入子页面的功能。用户可以通过页面树菜单中的"导入到此页"选项，将 Markdown、HTML 或 ZIP 压缩包导入为当前页面的子页面。

## 改动文件清单

### 1. 数据库迁移
**文件**: `apps/server/src/database/migrations/20251226T233755-add_parent_page_id_to_file_tasks.ts`
- 新建迁移文件，为 `file_tasks` 表添加 `parent_page_id` 字段
- 字段类型：`uuid`，外键引用 `pages.id`，级联删除策略为 `set null`

### 2. 后端改动

#### 2.1 ImportController (`apps/server/src/integrations/import/import.controller.ts`)
- **依赖注入**: 添加 `PageRepo` 依赖
- **importPage 方法**:
  - 从请求中提取 `targetParentId` 字段
  - 校验父页面存在性、是否已删除、是否在同一空间、是否被锁定
  - 将 `targetParentId` 传递给 `importService.importPage`
- **importZip 方法**:
  - 从请求中提取 `targetParentId` 字段
  - 执行相同的父页面校验逻辑
  - 将 `targetParentId` 传递给 `importService.importZip`

#### 2.2 ImportService (`apps/server/src/integrations/import/services/import.service.ts`)
- **importPage 方法签名**:
  - 新增可选参数 `targetParentId?: string`
  - 调用 `getNewPagePosition` 时传入 `targetParentId`
  - 创建页面时设置 `parentPageId: targetParentId || null`
- **getNewPagePosition 方法**:
  - 修改方法签名，新增 `parentPageId: string | null = null` 参数
  - 查询时使用动态条件：`where('parentPageId', parentPageId ? '=' : 'is', parentPageId)`
  - 支持在指定父页面下查找最后一个子页的 position
- **importZip 方法**:
  - 新增可选参数 `targetParentId?: string`
  - 创建 `fileTask` 时将 `parentPageId: targetParentId || null` 写入数据库

#### 2.3 FileImportTaskService (`apps/server/src/integrations/import/services/file-import-task.service.ts`)
- **processGenericImport 方法**:
  - 在构建完页面父子关系后，检查 `fileTask.parentPageId`
  - 如果存在，将所有根级页面（`parentPageId === null`）的 `parentPageId` 设置为 `fileTask.parentPageId`
  - 修改 `nextPagePosition` 调用，传入 `fileTask.parentPageId || null` 作为父页面参数

### 3. 前端改动

#### 3.1 PageService API (`apps/client/src/features/page/services/page-service.ts`)
- **importPage 函数**:
  - 新增可选参数 `targetParentId?: string`
  - 如果提供了 `targetParentId`，添加到 FormData 中
- **importZip 函数**:
  - 新增可选参数 `targetParentId?: string`
  - 如果提供了 `targetParentId`，添加到 FormData 中

#### 3.2 PageImportModal (`apps/client/src/features/page/components/page-import-modal.tsx`)
- **PageImportModalProps 接口**:
  - 新增可选属性 `targetParentId?: string`
- **ImportFormatSelection 接口和组件**:
  - 新增 `targetParentId` prop，并传递给子逻辑
- **handleZipUpload 函数**:
  - 调用 `importZip` 时传入 `targetParentId` 参数
- **handleFileUpload 函数**:
  - 调用 `importPage` 时传入 `targetParentId` 参数

#### 3.3 SpaceTree 页面树菜单 (`apps/client/src/features/page/tree/components/space-tree.tsx`)
- **导入图标**: 添加 `IconFileImport` 到导入列表
- **导入 PageImportModal 组件**
- **NodeMenu 组件**:
  - 新增 `importModalOpened` 状态和相关的 `open/close` 方法
  - 在菜单中添加"导入到此页"选项（在"导出页面"之后，仅在非只读模式显示）
  - 渲染 `PageImportModal`，传入 `spaceId`、`targetParentId={node.id}` 和 `open/onClose` props

## 核心逻辑说明

### 1. 父页面校验
- **存在性**: 父页面必须存在且未被删除
- **空间一致性**: 父页面必须在同一个 space 中
- **锁定状态**: 不允许导入到已锁定的页面
- **权限**: 沿用现有的空间编辑权限（`SpaceCaslAction.Edit`）

### 2. Position 生成策略
- 单页导入：在目标父页面（或空间根）的最后一个子页后生成新 position
- ZIP 导入：
  - 保持 ZIP 内部的目录结构和层级关系
  - 仅将 ZIP 内部的"根"页面挂到 `targetParentId` 下
  - 使用 fractional indexing 和字母排序生成 position

### 3. 刷新策略
- 复用现有的刷新机制（`refetchRootTreeNodeEvent`）
- 单页导入成功后，页面会添加到树数据中
- ZIP 导入轮询任务状态，成功后触发根节点刷新

## 使用方式

### 用户操作流程
1. 在页面树中找到目标页面
2. 点击页面右侧的 `···` 菜单按钮
3. 选择"导入到此页"（Import into this page）
4. 在弹出的导入弹窗中选择导入格式：
   - Markdown (.md)
   - HTML (.html)
   - Notion (ZIP)
   - Confluence (ZIP，企业版)
   - Generic (ZIP)
5. 选择文件并上传
6. 等待导入完成，导入的页面将成为目标页面的子页面

### API 调用示例

#### 单页导入
```typescript
const formData = new FormData();
formData.append('spaceId', 'space-uuid');
formData.append('targetParentId', 'parent-page-uuid'); // 可选
formData.append('file', file);

await api.post('/pages/import', formData);
```

#### ZIP 导入
```typescript
const formData = new FormData();
formData.append('spaceId', 'space-uuid');
formData.append('source', 'notion'); // 'generic' | 'notion' | 'confluence'
formData.append('targetParentId', 'parent-page-uuid'); // 可选
formData.append('file', zipFile);

await api.post('/pages/import-zip', formData);
```

## 注意事项

1. **数据库迁移**: 部署前需要先运行迁移 `pnpm --filter ./apps/server run migration:latest`
2. **向后兼容**: `targetParentId` 是可选参数，不传时行为与原来一致（导入到空间根）
3. **权限继承**: 导入的页面继承父页面所在空间的权限设置
4. **ZIP 结构**: ZIP 导入时，压缩包内部的相对路径层级关系会被保留
5. **刷新机制**: 当前使用根刷新策略，导入到深层父页后可能需要手动展开父节点查看

## 后续优化建议

1. **局部刷新**: 改进刷新事件，支持传递 `parentId`，实现针对性的子树刷新
2. **自动展开**: 导入成功后自动展开目标父节点并高亮新导入的页面
3. **进度提示**: 在导入成功通知中显示父页面标题和跳转链接
4. **批量操作**: 考虑支持同时选择多个文件导入到同一父页面

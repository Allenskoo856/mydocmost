jest.mock('../../integrations/export/export.service', () => ({
  ExportService: class ExportService {},
}));
jest.mock('../page/services/page.service', () => ({
  PageService: class PageService {},
}));
jest.mock('../space/services/space.service', () => ({
  SpaceService: class SpaceService {},
}));
jest.mock('./utils/markdown-to-page-content.util', () => ({
  markdownToPageContent: jest.fn(),
}));

import * as Y from 'yjs';
import { Page, Workspace } from '@docmost/db/types/entity.types';
import { markdownToPageContent } from './utils/markdown-to-page-content.util';
import { McpContextService } from './mcp-context.service';
import { McpSessionStateService } from './mcp-session-state.service';
import { McpToolsService } from './mcp-tools.service';

const WORKSPACE_ID = 'd9428888-122b-11e1-b85c-61cd3cbb3210';
const SPACE_ID = 'd9428888-122b-11e1-b85c-61cd3cbb3211';

describe('McpToolsService', () => {
  const contextService = {
    load: jest.fn(),
    listWorkspaces: jest.fn(),
    resolveWorkspace: jest.fn(),
  } as unknown as jest.Mocked<McpContextService>;
  const workspaceRepo = {};
  const spaceRepo = {
    findById: jest.fn(),
  };
  const pageRepo = {
    findById: jest.fn(),
    findActiveChildren: jest.fn(),
    getPageAndDescendants: jest.fn(),
    updatePage: jest.fn(),
  };
  const spaceService = {};
  const pageService = {};
  const exportService = {
    exportPage: jest.fn(),
  };
  const collaborationGateway = {
    openDirectConnection: jest.fn(),
  };
  const environmentService = {
    getMcpMaxSessions: jest.fn().mockReturnValue(100),
    getMcpRateLimitRps: jest.fn().mockReturnValue(10),
  };
  const sessionStateService = new McpSessionStateService();
  const service = new McpToolsService(
    contextService,
    workspaceRepo as never,
    spaceRepo as never,
    pageRepo as never,
    spaceService as never,
    pageService as never,
    exportService as never,
    collaborationGateway as never,
    environmentService as never,
    sessionStateService,
    undefined as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(markdownToPageContent).mockReset();
  });

  it('advertises the complete reliable tool set', () => {
    expect(service.getTools().map((tool) => tool.name)).toEqual([
      'get_context',
      'list_workspaces',
      'list_spaces',
      'search_pages',
      'create_space',
      'insert_page_tree',
      'create_page',
      'update_page',
      'move_page',
      'list_space_pages',
      'get_page',
      'get_page_markdown',
      'analyze_page_tree',
      'plan_page_changes',
      'apply_page_changes',
    ]);
  });

  it('marks workspaceId optional on workspace-scoped tools', () => {
    const tools = service.getTools();
    for (const tool of tools.filter(
      (entry) => entry.name !== 'list_workspaces',
    )) {
      expect(tool.inputSchema.required ?? []).not.toContain('workspaceId');
    }
  });

  it('returns only public workspace fields and structured content', async () => {
    contextService.listWorkspaces.mockResolvedValue([
      {
        id: WORKSPACE_ID,
        name: 'Workspace',
        hostname: 'docs.internal',
        defaultSpaceId: SPACE_ID,
        createdAt: new Date('2026-07-18T00:00:00.000Z'),
        licenseKey: 'must-not-leak',
      } as Workspace,
    ]);

    const result = await service.call('list_workspaces', {});
    const payload = readPayload(result);

    expect(payload.workspaces[0]).toEqual({
      id: WORKSPACE_ID,
      name: 'Workspace',
      hostname: 'docs.internal',
      defaultSpaceId: SPACE_ID,
      createdAt: '2026-07-18T00:00:00.000Z',
    });
    expect(result.structuredContent).toEqual(payload);
  });

  it('returns context without requiring workspaceId for one workspace', async () => {
    const workspace = {
      id: WORKSPACE_ID,
      name: 'Workspace',
      hostname: 'docs.internal',
      defaultSpaceId: SPACE_ID,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
    } as Workspace;
    contextService.listWorkspaces.mockResolvedValue([workspace]);
    contextService.resolveWorkspace.mockResolvedValue(workspace);

    const result = await service.call('get_context', {});
    expect(readPayload(result)).toMatchObject({
      workspace: { id: WORKSPACE_ID },
      workspaceSelectionRequired: false,
      transports: ['streamable-http', 'legacy-sse'],
    });
  });

  it('binds the resolved workspace to the MCP session context', async () => {
    const workspace = {
      id: WORKSPACE_ID,
      name: 'Workspace',
      hostname: 'docs.internal',
      defaultSpaceId: SPACE_ID,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
    } as Workspace;
    contextService.listWorkspaces.mockResolvedValue([workspace]);
    contextService.resolveWorkspace.mockResolvedValue(workspace);
    const sessionContext: Record<string, unknown> = {};

    const result = await service.call('get_context', {}, sessionContext);

    expect(sessionContext).toEqual({ workspaceId: WORKSPACE_ID });
    expect(readPayload(result)).toMatchObject({
      workspaceBound: true,
      boundWorkspaceId: WORKSPACE_ID,
    });
  });

  it('rejects an explicit workspace that conflicts with the bound session', async () => {
    const result = await service.call(
      'get_context',
      { workspaceId: 'd9428888-122b-11e1-b85c-61cd3cbb3299' },
      { workspaceId: WORKSPACE_ID },
    );

    expect(readText(result)).toContain('[WORKSPACE_CONTEXT_MISMATCH]');
    expect(result.structuredContent).toMatchObject({
      error: {
        code: 'WORKSPACE_CONTEXT_MISMATCH',
        retryable: false,
      },
    });
  });

  it('returns a complete page context with breadcrumb, children, and version', async () => {
    const page = createPage();
    const parent = {
      ...createPage(),
      id: 'd9428888-122b-11e1-b85c-61cd3cbb3213',
      slugId: 'parent-page',
      title: 'Parent',
    } as Page;
    page.parentPageId = parent.id;
    const child = {
      ...createPage(),
      id: 'd9428888-122b-11e1-b85c-61cd3cbb3214',
      slugId: 'child-page',
      title: 'Child',
      parentPageId: page.id,
    } as Page;
    contextService.load.mockResolvedValue({
      workspace: { id: WORKSPACE_ID },
      user: { id: 'agent-user' },
    } as never);
    pageRepo.findById
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(parent);
    pageRepo.findActiveChildren.mockResolvedValue([child]);
    spaceRepo.findById.mockResolvedValue({
      id: SPACE_ID,
      slug: 'docs',
      workspaceId: WORKSPACE_ID,
      deletedAt: null,
    });
    collaborationGateway.openDirectConnection.mockResolvedValue(
      createDirectConnection(),
    );
    exportService.exportPage.mockResolvedValue('# Page');

    const result = await service.call('get_page', { pageId: page.id });
    const payload = readPayload(result);

    expect(payload).toMatchObject({
      page: {
        id: page.id,
        markdown: '# Page',
        version: page.updatedAt.toISOString(),
      },
      breadcrumb: [{ id: parent.id, title: parent.title }],
      children: [{ id: child.id, title: child.title }],
    });
  });

  it('plans and idempotently applies a batch page update', async () => {
    const page = createPage();
    contextService.load.mockResolvedValue({
      workspace: { id: WORKSPACE_ID },
      user: { id: 'agent-user' },
    } as never);
    pageRepo.findById.mockResolvedValue(page);
    pageRepo.updatePage.mockResolvedValue(undefined);

    const planResult = await service.call('plan_page_changes', {
      operations: [
        {
          clientId: 'rename-page',
          type: 'update',
          pageId: page.id,
          title: 'Renamed',
        },
      ],
    });
    const plan = readPayload(planResult);
    expect(plan).toMatchObject({
      summary: { ready: 1, conflicts: 0, invalid: 0 },
      requiresApproval: true,
    });

    const first = await service.call('apply_page_changes', {
      planId: plan.planId,
      idempotencyKey: 'rename-page-once',
    });
    const second = await service.call('apply_page_changes', {
      planId: plan.planId,
      idempotencyKey: 'rename-page-once',
    });

    expect(readPayload(first)).toMatchObject({
      status: 'success',
      summary: { succeeded: 1, failed: 0 },
    });
    expect(readPayload(second)).toEqual(readPayload(first));
    expect(pageRepo.updatePage).toHaveBeenCalledTimes(1);
  });

  it('rejects page trees larger than 100 nodes before loading context', async () => {
    const pages = Array.from({ length: 101 }, (_, index) => ({
      title: `Page ${index}`,
      content: 'Content',
    }));

    const result = await service.call('insert_page_tree', {
      workspaceId: WORKSPACE_ID,
      spaceId: SPACE_ID,
      pages,
    });

    expect(readText(result)).toContain('[TREE_TOO_LARGE]');
    expect(contextService.load).not.toHaveBeenCalled();
  });

  it('rejects page trees deeper than ten levels', async () => {
    let node: Record<string, unknown> = { title: '10', content: 'Content' };
    for (let depth = 9; depth >= 0; depth -= 1) {
      node = { title: String(depth), content: 'Content', children: [node] };
    }

    const result = await service.call('insert_page_tree', {
      spaceId: SPACE_ID,
      pages: [node],
    });

    expect(readText(result)).toContain('[TREE_TOO_DEEP]');
    expect(contextService.load).not.toHaveBeenCalled();
  });

  it('requires expectedUpdatedAt for content updates', async () => {
    const page = createPage();
    contextService.load.mockResolvedValue({
      workspace: { id: WORKSPACE_ID },
      user: { id: 'agent-user' },
    } as never);
    pageRepo.findById.mockResolvedValue(page);

    const result = await service.call('update_page', {
      pageId: 'page-slug',
      content: 'updated',
    });

    expect(readText(result)).toContain('[VERSION_REQUIRED]');
    expect(collaborationGateway.openDirectConnection).not.toHaveBeenCalled();
  });

  it('rejects a content update when updatedAt changed after the read', async () => {
    const original = createPage();
    const changed = {
      ...original,
      updatedAt: new Date('2026-07-18T00:01:00.000Z'),
    };
    const connection = createDirectConnection();
    contextService.load.mockResolvedValue({
      workspace: { id: WORKSPACE_ID },
      user: { id: 'agent-user' },
    } as never);
    pageRepo.findById
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(changed);
    collaborationGateway.openDirectConnection.mockResolvedValue(connection);
    jest.mocked(markdownToPageContent).mockResolvedValue({
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      textContent: 'updated',
      ydoc: null,
    });

    const result = await service.call('update_page', {
      pageId: original.id,
      content: 'updated',
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });

    expect(readText(result)).toContain('[PAGE_CONFLICT]');
    expect(connection.transact).toHaveBeenCalledTimes(1);
    expect(connection.disconnect).toHaveBeenCalled();
  });

  it('updates collaborative content through a direct Yjs connection', async () => {
    const original = createPage();
    const updated = {
      ...original,
      updatedAt: new Date('2026-07-18T00:01:00.000Z'),
    };
    const connection = createDirectConnection();
    contextService.load.mockResolvedValue({
      workspace: { id: WORKSPACE_ID },
      user: { id: 'agent-user' },
    } as never);
    pageRepo.findById
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(updated);
    collaborationGateway.openDirectConnection.mockResolvedValue(connection);
    jest.mocked(markdownToPageContent).mockResolvedValue({
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      textContent: 'updated',
      ydoc: null,
    });

    const result = await service.call('update_page', {
      pageId: original.id,
      content: 'updated',
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ id: original.id });
    expect(connection.transact).toHaveBeenCalledTimes(2);
    expect(connection.disconnect).toHaveBeenCalled();
  });

  it('returns a structured error for unknown tools', async () => {
    const result = await service.call('missing_tool', {});

    expect(result.isError).toBe(true);
    expect(readText(result)).toContain('[UNKNOWN_TOOL]');
    expect(result.structuredContent).toMatchObject({
      error: { code: 'UNKNOWN_TOOL', message: 'Unknown tool: missing_tool' },
    });
  });

  function createPage(): Page {
    return {
      id: 'd9428888-122b-11e1-b85c-61cd3cbb3212',
      slugId: 'page-slug',
      title: 'Page',
      icon: null,
      parentPageId: null,
      spaceId: SPACE_ID,
      workspaceId: WORKSPACE_ID,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
      updatedAt: new Date('2026-07-18T00:00:00.000Z'),
      deletedAt: null,
      contributorIds: [],
    } as Page;
  }

  function createDirectConnection() {
    const document = new Y.Doc();
    return {
      transact: jest.fn(async (callback: (document: Y.Doc) => void) => {
        callback(document);
      }),
      disconnect: jest.fn().mockResolvedValue(undefined),
    };
  }

  function readText(result: Awaited<ReturnType<McpToolsService['call']>>) {
    const content = result.content[0];
    if (content.type !== 'text') throw new Error('Expected text content');
    return content.text;
  }

  function readPayload(result: Awaited<ReturnType<McpToolsService['call']>>) {
    return JSON.parse(readText(result));
  }
});

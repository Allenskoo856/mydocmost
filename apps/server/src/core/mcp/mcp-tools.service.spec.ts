import { NotFoundException } from '@nestjs/common';

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

import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { Workspace } from '@docmost/db/types/entity.types';
import { McpContextService } from './mcp-context.service';
import { McpToolsService } from './mcp-tools.service';

describe('McpToolsService', () => {
  const contextService = {
    load: jest.fn(),
  } as unknown as jest.Mocked<McpContextService>;
  const workspaceRepo = {
    findAll: jest.fn(),
  } as unknown as jest.Mocked<WorkspaceRepo>;
  const service = new McpToolsService(
    contextService,
    workspaceRepo,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('advertises all nine tools', () => {
    expect(service.getTools().map((tool) => tool.name)).toEqual([
      'list_workspaces',
      'create_space',
      'insert_page_tree',
      'create_page',
      'update_page',
      'move_page',
      'list_space_pages',
      'get_page_markdown',
      'analyze_page_tree',
    ]);
  });

  it('returns only public workspace fields', async () => {
    workspaceRepo.findAll.mockResolvedValue([
      {
        id: 'workspace-id',
        name: 'Workspace',
        hostname: 'docs.internal',
        createdAt: new Date('2026-07-18T00:00:00.000Z'),
        licenseKey: 'must-not-leak',
      } as Workspace,
    ]);

    const result = await service.call('list_workspaces', {});
    const payload = readPayload(result);

    expect(payload.workspaces[0]).toEqual({
      id: 'workspace-id',
      name: 'Workspace',
      hostname: 'docs.internal',
      createdAt: '2026-07-18T00:00:00.000Z',
    });
  });

  it('rejects page trees larger than 100 nodes before loading context', async () => {
    const pages = Array.from({ length: 101 }, (_, index) => ({
      title: `Page ${index}`,
      content: 'Content',
    }));

    const result = await service.call('insert_page_tree', {
      workspaceId: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
      spaceId: 'd9428888-122b-11e1-b85c-61cd3cbb3211',
      pages,
    });

    expect(readText(result)).toContain('[TREE_TOO_LARGE]');
    expect(contextService.load).not.toHaveBeenCalled();
  });

  it('maps missing workspaces without leaking exception details', async () => {
    contextService.load.mockRejectedValue(
      new NotFoundException('database-specific workspace detail'),
    );

    const result = await service.call('create_space', {
      workspaceId: 'd9428888-122b-11e1-b85c-61cd3cbb3210',
      name: 'Docs',
      slug: 'docs',
    });

    expect(readText(result)).toBe('[WORKSPACE_NOT_FOUND] Workspace not found');
  });

  it('returns a structured error for unknown tools', async () => {
    const result = await service.call('missing_tool', {});

    expect(result.isError).toBe(true);
    expect(readText(result)).toContain('[UNKNOWN_TOOL]');
  });

  function readText(result: Awaited<ReturnType<McpToolsService['call']>>) {
    const content = result.content[0];
    if (content.type !== 'text') throw new Error('Expected text content');
    return content.text;
  }

  function readPayload(result: Awaited<ReturnType<McpToolsService['call']>>) {
    return JSON.parse(readText(result));
  }
});

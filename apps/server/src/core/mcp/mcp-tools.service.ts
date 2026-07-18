import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { generateSlugId } from '../../common/helpers';
import { ExportService } from '../../integrations/export/export.service';
import { PageService } from '../page/services/page.service';
import { SpaceService } from '../space/services/space.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { Page, Space } from '@docmost/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { McpCreateSpaceDto } from './dto/create-space.dto';
import {
  McpCreatePageDto,
  McpMovePageDto,
  McpUpdatePageDto,
} from './dto/page.dto';
import {
  McpAnalyzePageTreeDto,
  McpGetPageMarkdownDto,
  McpInsertPageTreeDto,
  McpListSpacePagesDto,
  McpTreePageNodeDto,
} from './dto/tree.dto';
import { McpContextService } from './mcp-context.service';
import { formatMcpError, McpToolError } from './utils/mcp-error.util';
import {
  markdownToPageContent,
  McpPageContent,
} from './utils/markdown-to-page-content.util';
import { validateMcpDto } from './utils/mcp-validation.util';

interface PreparedTreeNode {
  title: string;
  icon?: string;
  pageContent: McpPageContent;
  children: PreparedTreeNode[];
}

interface PageTreeNode {
  id: string;
  slugId: string;
  title: string;
  icon: string | null;
  position: string;
  parentPageId: string | null;
  spaceId: string;
  deletedAt: Date | null;
  hasChildren: boolean;
  children?: PageTreeNode[];
}

@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);

  constructor(
    private readonly contextService: McpContextService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceService: SpaceService,
    private readonly pageService: PageService,
    private readonly exportService: ExportService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  getTools(): Tool[] {
    const workspaceId = { type: 'string', format: 'uuid' } as const;
    const pageNode = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        icon: { type: 'string' },
        children: { type: 'array', items: { $ref: '#/$defs/pageNode' } },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    } as const;

    return [
      {
        name: 'list_workspaces',
        description: 'List active Docmost workspaces available to the Agent.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: 'create_space',
        description: 'Create a space in a workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId,
            name: { type: 'string', minLength: 2, maxLength: 50 },
            slug: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
              pattern: '^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$',
            },
            description: { type: 'string' },
          },
          required: ['workspaceId', 'name', 'slug'],
          additionalProperties: false,
        },
      },
      {
        name: 'insert_page_tree',
        description:
          'Atomically create up to 100 nested pages in an existing or new space.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId,
            spaceId: { type: 'string', format: 'uuid' },
            spaceName: { type: 'string', minLength: 2, maxLength: 50 },
            spaceSlug: { type: 'string', minLength: 2, maxLength: 50 },
            parentPageId: { type: 'string', format: 'uuid' },
            pages: { type: 'array', minItems: 1, items: pageNode },
          },
          required: ['workspaceId', 'pages'],
          additionalProperties: false,
          $defs: { pageNode },
        },
      },
      {
        name: 'create_page',
        description: 'Create one Markdown page in a space.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId,
            spaceId: { type: 'string', format: 'uuid' },
            parentPageId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            content: { type: 'string' },
            icon: { type: 'string' },
          },
          required: ['workspaceId', 'spaceId', 'content'],
          additionalProperties: false,
        },
      },
      {
        name: 'update_page',
        description: 'Update a page title, icon, or Markdown content.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId,
            pageId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            content: { type: 'string' },
            icon: { type: 'string' },
          },
          required: ['workspaceId', 'pageId'],
          additionalProperties: false,
        },
      },
      {
        name: 'move_page',
        description:
          'Move a page under another parent or to a workspace-local space root.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId,
            pageId: { type: 'string', format: 'uuid' },
            targetParentPageId: {
              anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }],
            },
            targetSpaceId: { type: 'string', format: 'uuid' },
          },
          required: ['workspaceId', 'pageId'],
          additionalProperties: false,
        },
      },
      {
        name: 'list_space_pages',
        description: 'List pages in a space as a flat list or tree.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId,
            spaceId: { type: 'string', format: 'uuid' },
            format: { type: 'string', enum: ['tree', 'flat'], default: 'tree' },
            includeDeleted: { type: 'boolean', default: false },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 1000,
              default: 100,
            },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
          required: ['workspaceId', 'spaceId'],
          additionalProperties: false,
        },
      },
      {
        name: 'get_page_markdown',
        description: 'Return a page as Markdown.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId,
            pageId: { type: 'string', format: 'uuid' },
          },
          required: ['workspaceId', 'pageId'],
          additionalProperties: false,
        },
      },
      {
        name: 'analyze_page_tree',
        description: 'Return structural statistics for a space page tree.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId,
            spaceId: { type: 'string', format: 'uuid' },
          },
          required: ['workspaceId', 'spaceId'],
          additionalProperties: false,
        },
      },
    ];
  }

  async call(name: string, args: unknown): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'list_workspaces':
          return await this.listWorkspaces();
        case 'create_space':
          return await this.createSpace(args);
        case 'insert_page_tree':
          return await this.insertPageTree(args);
        case 'create_page':
          return await this.createPage(args);
        case 'update_page':
          return await this.updatePage(args);
        case 'move_page':
          return await this.movePage(args);
        case 'list_space_pages':
          return await this.listSpacePages(args);
        case 'get_page_markdown':
          return await this.getPageMarkdown(args);
        case 'analyze_page_tree':
          return await this.analyzePageTree(args);
        default:
          throw new McpToolError('UNKNOWN_TOOL', `Unknown tool: ${name}`);
      }
    } catch (error) {
      const normalized = this.normalizeError(error);
      if (normalized.code === 'INTERNAL_ERROR') {
        this.logger.error(`MCP tool ${name} failed`, error);
      }
      return formatMcpError(normalized.code, normalized.message);
    }
  }

  private async listWorkspaces(): Promise<CallToolResult> {
    const workspaces = (await this.workspaceRepo.findAll()).map(
      (workspace) => ({
        id: workspace.id,
        name: workspace.name,
        hostname: workspace.hostname,
        createdAt: workspace.createdAt,
      }),
    );
    return this.success({ workspaces });
  }

  private async createSpace(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpCreateSpaceDto, args);
    const { user, workspace } = await this.loadContext(dto.workspaceId);
    const space = await this.spaceService.createSpace(user, workspace.id, dto);
    return this.success(space);
  }

  private async insertPageTree(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpInsertPageTreeDto, args);
    const nodeCount = this.countTreeNodes(dto.pages);
    if (nodeCount === 0) {
      throw new McpToolError('VALIDATION_ERROR', 'pages must not be empty');
    }
    if (nodeCount > 100) {
      throw new McpToolError(
        'TREE_TOO_LARGE',
        'insert_page_tree supports at most 100 nodes',
      );
    }
    if (
      (!dto.spaceId && (!dto.spaceName || !dto.spaceSlug)) ||
      (dto.spaceId && (dto.spaceName || dto.spaceSlug))
    ) {
      throw new McpToolError(
        'VALIDATION_ERROR',
        'Provide either spaceId or both spaceName and spaceSlug',
      );
    }

    const { user, workspace } = await this.loadContext(dto.workspaceId);
    const preparedPages = await this.prepareTreeNodes(dto.pages);

    const result = await this.db.transaction().execute(async (trx) => {
      let space: Space;
      if (dto.spaceId) {
        space = await this.requireSpace(dto.spaceId, workspace.id, trx);
      } else {
        space = await this.spaceService.createSpace(
          user,
          workspace.id,
          {
            name: dto.spaceName,
            slug: dto.spaceSlug,
            description: '',
          },
          trx,
        );
      }

      if (dto.parentPageId) {
        const parent = await this.requirePage(
          dto.parentPageId,
          workspace.id,
          trx,
        );
        if (parent.spaceId !== space.id) {
          throw new McpToolError(
            'PARENT_NOT_FOUND',
            'Parent page is not in the target space',
          );
        }
      }

      const pages = [];
      for (const node of preparedPages) {
        pages.push(
          await this.insertTreeNode(
            node,
            space.id,
            dto.parentPageId ?? null,
            user.id,
            workspace.id,
            trx,
          ),
        );
      }
      return { spaceId: space.id, pages };
    });

    return this.success(result);
  }

  private async createPage(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpCreatePageDto, args);
    const { user, workspace } = await this.loadContext(dto.workspaceId);
    const pageContent = await markdownToPageContent(dto.content);

    const page = await this.db.transaction().execute(async (trx) => {
      await this.requireSpace(dto.spaceId, workspace.id, trx);
      if (dto.parentPageId) {
        const parent = await this.requirePage(
          dto.parentPageId,
          workspace.id,
          trx,
        );
        if (parent.spaceId !== dto.spaceId) {
          throw new McpToolError(
            'PARENT_NOT_FOUND',
            'Parent page is not in the target space',
          );
        }
      }

      return this.insertPageRecord(
        {
          title: dto.title ?? pageContent.title ?? 'Untitled',
          icon: dto.icon,
          pageContent,
        },
        dto.spaceId,
        dto.parentPageId ?? null,
        user.id,
        workspace.id,
        trx,
      );
    });

    return this.success(page);
  }

  private async updatePage(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpUpdatePageDto, args);
    const { user, workspace } = await this.loadContext(dto.workspaceId);
    const page = await this.requirePage(dto.pageId, workspace.id);
    if (
      dto.title === undefined &&
      dto.icon === undefined &&
      dto.content === undefined
    ) {
      throw new McpToolError(
        'VALIDATION_ERROR',
        'Provide at least one of title, icon, or content',
      );
    }

    const pageContent =
      dto.content === undefined
        ? undefined
        : await markdownToPageContent(dto.content);
    const contributors = new Set(page.contributorIds ?? []);
    contributors.add(user.id);

    await this.pageRepo.updatePage(
      {
        workspaceId: workspace.id,
        title: dto.title,
        icon: dto.icon,
        content: pageContent?.content,
        textContent: pageContent?.textContent,
        ydoc: pageContent?.ydoc,
        lastUpdatedById: user.id,
        contributorIds: [...contributors],
      },
      page.id,
    );

    return this.success(
      await this.pageRepo.findById(page.id, { includeContent: true }),
    );
  }

  private async movePage(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpMovePageDto, args);
    const { workspace } = await this.loadContext(dto.workspaceId);
    let page = await this.requirePage(dto.pageId, workspace.id);
    const descendants = await this.pageRepo.getPageAndDescendants(page.id, {
      includeContent: false,
    });
    const descendantIds = new Set(descendants.map((entry) => entry.id));

    let targetParent: Page | undefined;
    if (dto.targetParentPageId) {
      targetParent = await this.requirePage(
        dto.targetParentPageId,
        workspace.id,
      );
      if (descendantIds.has(targetParent.id)) {
        throw new McpToolError(
          'INVALID_MOVE',
          'A page cannot be moved below itself or one of its descendants',
        );
      }
    }

    const targetSpaceId =
      dto.targetSpaceId ?? targetParent?.spaceId ?? page.spaceId;
    await this.requireSpace(targetSpaceId, workspace.id);
    if (targetParent && targetParent.spaceId !== targetSpaceId) {
      throw new McpToolError(
        'INVALID_MOVE',
        'Target parent is not in the target space',
      );
    }

    if (targetSpaceId !== page.spaceId) {
      await this.pageService.movePageToSpace(page, targetSpaceId);
      page = await this.requirePage(page.id, workspace.id);
      if (!targetParent) {
        return this.success(page);
      }
    }

    const position = await this.nextPagePosition(
      targetSpaceId,
      targetParent?.id ?? null,
      this.db,
    );
    await this.pageService.movePage(
      {
        pageId: page.id,
        parentPageId: targetParent?.id ?? null,
        position,
      },
      page,
    );

    return this.success(await this.requirePage(page.id, workspace.id));
  }

  private async listSpacePages(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpListSpacePagesDto, args);
    const { workspace } = await this.loadContext(dto.workspaceId);
    await this.requireSpace(dto.spaceId, workspace.id);

    let baseQuery = this.db
      .selectFrom('pages')
      .where('workspaceId', '=', workspace.id)
      .where('spaceId', '=', dto.spaceId);
    if (!dto.includeDeleted) {
      baseQuery = baseQuery.where('deletedAt', 'is', null);
    }

    const [{ count }, rows] = await Promise.all([
      baseQuery
        .select((expression) => expression.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow(),
      baseQuery
        .select([
          'id',
          'slugId',
          'title',
          'icon',
          'position',
          'parentPageId',
          'spaceId',
          'deletedAt',
        ])
        .orderBy('position', (order) => order.collate('C').asc())
        .limit(dto.limit)
        .offset(dto.offset)
        .execute(),
    ]);

    const childCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.parentPageId) {
        childCounts.set(
          row.parentPageId,
          (childCounts.get(row.parentPageId) ?? 0) + 1,
        );
      }
    }
    const pages: PageTreeNode[] = rows.map((row) => ({
      ...row,
      hasChildren: (childCounts.get(row.id) ?? 0) > 0,
    }));

    return this.success({
      spaceId: dto.spaceId,
      total: Number(count),
      pages: dto.format === 'flat' ? pages : this.buildPageTree(pages),
    });
  }

  private async getPageMarkdown(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpGetPageMarkdownDto, args);
    const { workspace } = await this.loadContext(dto.workspaceId);
    const page = await this.pageRepo.findById(dto.pageId, {
      includeContent: true,
    });
    if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
      throw new McpToolError('PAGE_NOT_FOUND', 'Page not found');
    }

    const markdown = await this.exportService.exportPage(
      'markdown',
      page,
      true,
    );
    return this.success({
      pageId: page.id,
      title: page.title,
      markdown,
      updatedAt: page.updatedAt,
      spaceId: page.spaceId,
    });
  }

  private async analyzePageTree(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpAnalyzePageTreeDto, args);
    const { workspace } = await this.loadContext(dto.workspaceId);
    await this.requireSpace(dto.spaceId, workspace.id);

    const pages = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'parentPageId', 'textContent'])
      .where('workspaceId', '=', workspace.id)
      .where('spaceId', '=', dto.spaceId)
      .where('deletedAt', 'is', null)
      .execute();
    const byId = new Map(pages.map((page) => [page.id, page]));
    const childCounts = new Map<string, number>();
    for (const page of pages) {
      if (page.parentPageId) {
        childCounts.set(
          page.parentPageId,
          (childCounts.get(page.parentPageId) ?? 0) + 1,
        );
      }
    }

    const depthDistribution: Record<string, number> = {};
    let maxDepth = 0;
    for (const page of pages) {
      const depth = this.pageDepth(page.id, byId);
      maxDepth = Math.max(maxDepth, depth);
      depthDistribution[depth] = (depthDistribution[depth] ?? 0) + 1;
    }

    const topPagesByChildren = pages
      .map((page) => ({
        id: page.id,
        title: page.title,
        childrenCount: childCounts.get(page.id) ?? 0,
      }))
      .filter((page) => page.childrenCount > 0)
      .sort((left, right) => right.childrenCount - left.childrenCount)
      .slice(0, 10);

    return this.success({
      spaceId: dto.spaceId,
      totalPages: pages.length,
      maxDepth,
      rootPages: pages.filter((page) => !page.parentPageId).length,
      orphanPages: pages.filter(
        (page) => page.parentPageId && !byId.has(page.parentPageId),
      ).length,
      emptyContentPages: pages.filter((page) => !page.textContent?.trim())
        .length,
      depthDistribution,
      topPagesByChildren,
    });
  }

  private async loadContext(workspaceId: string) {
    try {
      return await this.contextService.load(workspaceId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('MCP agent user is disabled')
      ) {
        throw new McpToolError('AGENT_USER_DISABLED', error.message);
      }
      if (error instanceof NotFoundException) {
        throw new McpToolError('WORKSPACE_NOT_FOUND', 'Workspace not found');
      }
      throw error;
    }
  }

  private async requireSpace(
    spaceId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Space> {
    const space = await this.spaceRepo.findById(spaceId, workspaceId, { trx });
    if (!space) {
      throw new McpToolError('SPACE_NOT_FOUND', 'Space not found');
    }
    return space;
  }

  private async requirePage(
    pageId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Page> {
    const page = await this.pageRepo.findById(pageId, { trx });
    if (!page || page.workspaceId !== workspaceId || page.deletedAt) {
      throw new McpToolError('PAGE_NOT_FOUND', 'Page not found');
    }
    return page;
  }

  private async prepareTreeNodes(
    nodes: McpTreePageNodeDto[],
  ): Promise<PreparedTreeNode[]> {
    return Promise.all(
      nodes.map(async (node) => ({
        title: node.title,
        icon: node.icon,
        pageContent: await markdownToPageContent(node.content),
        children: await this.prepareTreeNodes(node.children ?? []),
      })),
    );
  }

  private async insertTreeNode(
    node: PreparedTreeNode,
    spaceId: string,
    parentPageId: string | null,
    userId: string,
    workspaceId: string,
    trx: KyselyTransaction,
  ): Promise<{ id: string; title: string; children: unknown[] }> {
    const page = await this.insertPageRecord(
      node,
      spaceId,
      parentPageId,
      userId,
      workspaceId,
      trx,
    );
    const children = [];
    for (const child of node.children) {
      children.push(
        await this.insertTreeNode(
          child,
          spaceId,
          page.id,
          userId,
          workspaceId,
          trx,
        ),
      );
    }
    return { id: page.id, title: page.title, children };
  }

  private async insertPageRecord(
    node: Pick<PreparedTreeNode, 'title' | 'icon' | 'pageContent'>,
    spaceId: string,
    parentPageId: string | null,
    userId: string,
    workspaceId: string,
    trx: KyselyTransaction,
  ): Promise<Page> {
    const position = await this.nextPagePosition(spaceId, parentPageId, trx);
    return this.pageRepo.insertPage(
      {
        slugId: generateSlugId(),
        title: node.title || node.pageContent.title || 'Untitled',
        icon: node.icon,
        content: node.pageContent.content,
        textContent: node.pageContent.textContent,
        ydoc: node.pageContent.ydoc,
        position,
        parentPageId,
        spaceId,
        creatorId: userId,
        workspaceId,
        lastUpdatedById: userId,
      },
      trx,
    );
  }

  private async nextPagePosition(
    spaceId: string,
    parentPageId: string | null,
    db: KyselyDB | KyselyTransaction,
  ): Promise<string> {
    let query = db
      .selectFrom('pages')
      .select('position')
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position', (order) => order.collate('C').desc())
      .limit(1);
    query = parentPageId
      ? query.where('parentPageId', '=', parentPageId)
      : query.where('parentPageId', 'is', null);
    const lastPage = await query.executeTakeFirst();
    return generateJitteredKeyBetween(lastPage?.position ?? null, null);
  }

  private countTreeNodes(nodes: McpTreePageNodeDto[]): number {
    return nodes.reduce(
      (count, node) => count + 1 + this.countTreeNodes(node.children ?? []),
      0,
    );
  }

  private buildPageTree(pages: PageTreeNode[]): PageTreeNode[] {
    const byId = new Map(
      pages.map((page) => [page.id, { ...page, children: [] }]),
    );
    const roots: PageTreeNode[] = [];
    for (const page of byId.values()) {
      const parent = page.parentPageId
        ? byId.get(page.parentPageId)
        : undefined;
      if (parent) {
        parent.children.push(page);
      } else {
        roots.push(page);
      }
    }
    return roots;
  }

  private pageDepth(
    pageId: string,
    pages: Map<string, { id: string; parentPageId: string | null }>,
  ): number {
    const visited = new Set<string>();
    let current = pages.get(pageId);
    let depth = 0;
    while (current?.parentPageId && pages.has(current.parentPageId)) {
      if (visited.has(current.id)) return depth;
      visited.add(current.id);
      depth += 1;
      current = pages.get(current.parentPageId);
    }
    return depth;
  }

  private normalizeError(error: unknown): { code: string; message: string } {
    if (error instanceof McpToolError) {
      return { code: error.code, message: error.message };
    }
    if (error instanceof BadRequestException) {
      return { code: 'VALIDATION_ERROR', message: error.message };
    }
    return { code: 'INTERNAL_ERROR', message: 'Tool execution failed' };
  }

  private success(value: unknown): CallToolResult {
    return {
      content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    };
  }
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import {
  CallToolResult,
  LATEST_PROTOCOL_VERSION,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import { sql } from 'kysely';
import { generateSlugId } from '../../common/helpers';
import { CollaborationGateway } from '../../collaboration/collaboration.gateway';
import { jsonToNode } from '../../collaboration/collaboration.util';
import { ExportService } from '../../integrations/export/export.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { PageService } from '../page/services/page.service';
import { SpaceService } from '../space/services/space.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { Page, Space, Workspace } from '@docmost/db/types/entity.types';
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
import {
  McpGetContextDto,
  McpListSpacesDto,
  McpSearchPagesDto,
} from './dto/discovery.dto';
import { McpContextService } from './mcp-context.service';
import { formatMcpError, McpToolError } from './utils/mcp-error.util';
import {
  markdownToPageContent,
  McpPageContent,
} from './utils/markdown-to-page-content.util';
import { validateMcpDto } from './utils/mcp-validation.util';

const MAX_TREE_NODES = 100;
const MAX_TREE_DEPTH = 10;
const MAX_PAGE_CONTENT_BYTES = 1024 * 1024;
const MAX_TREE_RESULT_NODES = 1000;

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

const workspaceIdSchema = {
  type: 'string',
  format: 'uuid',
  description:
    'Optional workspace UUID. Omit it when the server has exactly one active workspace.',
} as const;

const objectOutput = (
  properties: Record<string, object>,
  required: string[] = [],
) => ({
  type: 'object' as const,
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: true,
});

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
    private readonly collaborationGateway: CollaborationGateway,
    private readonly environmentService: EnvironmentService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  getTools(): Tool[] {
    const pageNode = {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 255 },
        content: {
          type: 'string',
          description: 'Markdown content, at most 1 MiB per page.',
        },
        icon: { type: 'string' },
        children: { type: 'array', items: { $ref: '#/$defs/pageNode' } },
      },
      required: ['title', 'content'],
      additionalProperties: false,
    } as const;

    return [
      {
        name: 'get_context',
        description:
          'Return the resolved workspace, supported transports, and MCP limits. When multiple workspaces exist, pass workspaceId or use list_workspaces.',
        inputSchema: {
          type: 'object',
          properties: { workspaceId: workspaceIdSchema },
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            workspace: { anyOf: [{ type: 'object' }, { type: 'null' }] },
            workspaceSelectionRequired: { type: 'boolean' },
            transports: { type: 'array', items: { type: 'string' } },
            limits: { type: 'object' },
          },
          ['workspaceSelectionRequired', 'transports', 'limits'],
        ),
        annotations: {
          title: 'Get MCP context',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'list_workspaces',
        description: 'List active Docmost workspaces available to the Agent.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          { workspaces: { type: 'array', items: { type: 'object' } } },
          ['workspaces'],
        ),
        annotations: {
          title: 'List workspaces',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'list_spaces',
        description:
          'List spaces in the resolved workspace. Use the returned space id or slug with page tools.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            query: {
              type: 'string',
              description: 'Optional name/description search.',
            },
            limit: { type: 'integer', minimum: 1, maximum: 1000, default: 100 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            workspaceId: { type: 'string' },
            total: { type: 'integer' },
            spaces: { type: 'array', items: { type: 'object' } },
          },
          ['workspaceId', 'total', 'spaces'],
        ),
        annotations: {
          title: 'List spaces',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'search_pages',
        description:
          'Search page titles and text in the resolved workspace, optionally limited to one space.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            query: { type: 'string', minLength: 1 },
            spaceId: {
              type: 'string',
              description: 'Optional space UUID or slug.',
            },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
          required: ['query'],
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            total: { type: 'integer' },
            pages: { type: 'array', items: { type: 'object' } },
          },
          ['total', 'pages'],
        ),
        annotations: {
          title: 'Search pages',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'create_space',
        description: 'Create a space in the resolved workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            name: { type: 'string', minLength: 2, maxLength: 50 },
            slug: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
              pattern: '^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$',
            },
            description: { type: 'string' },
          },
          required: ['name', 'slug'],
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            id: { type: 'string' },
            name: { type: ['string', 'null'] },
            slug: { type: 'string' },
            workspaceId: { type: 'string' },
          },
          ['id', 'slug', 'workspaceId'],
        ),
        annotations: {
          title: 'Create space',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'insert_page_tree',
        description:
          'Atomically create up to 100 nested Markdown pages (maximum depth 10) in an existing or new space.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            spaceId: {
              type: 'string',
              description: 'Existing space UUID or slug.',
            },
            spaceName: { type: 'string', minLength: 2, maxLength: 50 },
            spaceSlug: {
              type: 'string',
              minLength: 2,
              maxLength: 50,
              pattern: '^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$',
            },
            parentPageId: {
              type: 'string',
              description: 'Optional parent page UUID or slugId.',
            },
            pages: { type: 'array', minItems: 1, items: pageNode },
          },
          required: ['pages'],
          additionalProperties: false,
          $defs: { pageNode },
        },
        outputSchema: objectOutput(
          {
            spaceId: { type: 'string' },
            pages: { type: 'array', items: { type: 'object' } },
          },
          ['spaceId', 'pages'],
        ),
        annotations: {
          title: 'Insert page tree',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'create_page',
        description: 'Create one Markdown page in a space.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            spaceId: { type: 'string', description: 'Space UUID or slug.' },
            parentPageId: {
              type: 'string',
              description: 'Parent UUID or slugId.',
            },
            title: { type: 'string', maxLength: 255 },
            content: {
              type: 'string',
              description: 'Markdown, at most 1 MiB.',
            },
            icon: { type: 'string' },
          },
          required: ['spaceId', 'content'],
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            id: { type: 'string' },
            slugId: { type: 'string' },
            title: { type: 'string' },
            spaceId: { type: 'string' },
            updatedAt: { type: 'string' },
          },
          ['id', 'slugId', 'title', 'spaceId'],
        ),
        annotations: {
          title: 'Create page',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'update_page',
        description:
          'Update a page title, icon, or Markdown content. content updates require expectedUpdatedAt from get_page_markdown.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            pageId: { type: 'string', description: 'Page UUID or slugId.' },
            title: { type: 'string', maxLength: 255 },
            content: {
              type: 'string',
              description: 'Markdown, at most 1 MiB.',
            },
            icon: { type: 'string' },
            expectedUpdatedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Required when content is present.',
            },
          },
          required: ['pageId'],
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            id: { type: 'string' },
            slugId: { type: 'string' },
            title: { type: 'string' },
            spaceId: { type: 'string' },
            updatedAt: { type: 'string' },
          },
          ['id', 'slugId', 'title', 'spaceId'],
        ),
        annotations: {
          title: 'Update page',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'move_page',
        description:
          'Move a page under another parent or to a workspace-local space root.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            pageId: { type: 'string', description: 'Page UUID or slugId.' },
            targetParentPageId: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Target parent UUID/slugId, or null for the root.',
            },
            targetSpaceId: {
              type: 'string',
              description: 'Target space UUID or slug.',
            },
          },
          required: ['pageId'],
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            id: { type: 'string' },
            parentPageId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            spaceId: { type: 'string' },
          },
          ['id', 'spaceId'],
        ),
        annotations: {
          title: 'Move page',
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: 'list_space_pages',
        description:
          'List pages in a space. flat mode is paginated; tree mode returns a complete tree up to 1000 nodes and requires offset=0.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            spaceId: { type: 'string', description: 'Space UUID or slug.' },
            format: { type: 'string', enum: ['tree', 'flat'], default: 'tree' },
            includeDeleted: { type: 'boolean', default: false },
            limit: { type: 'integer', minimum: 1, maximum: 1000 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
          required: ['spaceId'],
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            spaceId: { type: 'string' },
            total: { type: 'integer' },
            pages: { type: 'array', items: { type: 'object' } },
          },
          ['spaceId', 'total', 'pages'],
        ),
        annotations: {
          title: 'List space pages',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'get_page_markdown',
        description:
          'Return the latest collaborative page state as Markdown. Use updatedAt with update_page.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            pageId: { type: 'string', description: 'Page UUID or slugId.' },
          },
          required: ['pageId'],
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            pageId: { type: 'string' },
            title: { type: 'string' },
            markdown: { type: 'string' },
            updatedAt: { type: 'string' },
            spaceId: { type: 'string' },
            spaceSlug: { type: 'string' },
          },
          ['pageId', 'title', 'markdown', 'updatedAt', 'spaceId'],
        ),
        annotations: {
          title: 'Get page Markdown',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: 'analyze_page_tree',
        description: 'Return structural statistics for a space page tree.',
        inputSchema: {
          type: 'object',
          properties: {
            workspaceId: workspaceIdSchema,
            spaceId: { type: 'string', description: 'Space UUID or slug.' },
          },
          required: ['spaceId'],
          additionalProperties: false,
        },
        outputSchema: objectOutput(
          {
            spaceId: { type: 'string' },
            totalPages: { type: 'integer' },
            maxDepth: { type: 'integer' },
            rootPages: { type: 'integer' },
          },
          ['spaceId', 'totalPages', 'maxDepth', 'rootPages'],
        ),
        annotations: {
          title: 'Analyze page tree',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
    ];
  }

  async call(name: string, args: unknown): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'get_context':
          return await this.getContext(args);
        case 'list_workspaces':
          return await this.listWorkspaces();
        case 'list_spaces':
          return await this.listSpaces(args);
        case 'search_pages':
          return await this.searchPages(args);
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

  private async getContext(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpGetContextDto, args);
    const workspaces = await this.contextService.listWorkspaces();
    let workspace: Workspace | null = null;

    if (dto.workspaceId || workspaces.length === 1) {
      workspace = await this.contextService.resolveWorkspace(dto.workspaceId);
    } else if (workspaces.length === 0) {
      throw new McpToolError('WORKSPACE_NOT_FOUND', 'Workspace not found');
    }

    return this.success({
      server: {
        name: 'docmost-mcp-server',
        version: '1.1.0',
        protocolVersion: LATEST_PROTOCOL_VERSION,
      },
      workspace: workspace ? this.workspaceSummary(workspace) : null,
      workspaceSelectionRequired: workspaces.length > 1 && !workspace,
      workspaces: workspaces.map((entry) => this.workspaceSummary(entry)),
      transports: ['streamable-http', 'legacy-sse'],
      limits: {
        maxTreeNodes: MAX_TREE_NODES,
        maxTreeDepth: MAX_TREE_DEPTH,
        maxPageContentBytes: MAX_PAGE_CONTENT_BYTES,
        maxTreeResultNodes: MAX_TREE_RESULT_NODES,
        maxSessions: this.environmentService.getMcpMaxSessions(),
        rateLimitRps: this.environmentService.getMcpRateLimitRps(),
      },
    });
  }

  private async listWorkspaces(): Promise<CallToolResult> {
    const workspaces = (await this.contextService.listWorkspaces()).map(
      (workspace) => this.workspaceSummary(workspace),
    );
    return this.success({ workspaces });
  }

  private async listSpaces(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpListSpacesDto, args);
    const { workspace } = await this.loadContext(dto.workspaceId);
    const pattern = dto.query?.trim() ? `%${dto.query.trim()}%` : undefined;

    let baseQuery = this.db
      .selectFrom('spaces')
      .where('workspaceId', '=', workspace.id)
      .where('deletedAt', 'is', null);

    if (pattern) {
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb(
            sql`f_unaccent(coalesce(spaces.name, ''))`,
            'ilike',
            sql`f_unaccent(${pattern})`,
          ),
          eb(
            sql`f_unaccent(coalesce(spaces.description, ''))`,
            'ilike',
            sql`f_unaccent(${pattern})`,
          ),
        ]),
      );
    }

    const countQuery = baseQuery.select((eb) =>
      eb.fn.countAll<number>().as('count'),
    );
    const rowsQuery = baseQuery.select([
      'id',
      'name',
      'slug',
      'description',
      'visibility',
      'defaultRole',
      'workspaceId',
      'createdAt',
      'updatedAt',
    ]);

    const [{ count }, spaces] = await Promise.all([
      countQuery.executeTakeFirstOrThrow(),
      rowsQuery
        .orderBy('createdAt', 'asc')
        .limit(dto.limit)
        .offset(dto.offset)
        .execute(),
    ]);

    return this.success({
      workspaceId: workspace.id,
      total: Number(count),
      spaces: spaces.map((space) => this.spaceSummary(space as Space)),
    });
  }

  private async searchPages(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpSearchPagesDto, args);
    const { workspace } = await this.loadContext(dto.workspaceId);
    const space = dto.spaceId
      ? await this.requireSpace(dto.spaceId, workspace.id)
      : undefined;
    const pattern = `%${dto.query.trim()}%`;

    let baseQuery = this.db
      .selectFrom('pages')
      .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
      .where('pages.workspaceId', '=', workspace.id)
      .where('pages.deletedAt', 'is', null)
      .where('spaces.deletedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb(
            sql`f_unaccent(coalesce(pages.title, ''))`,
            'ilike',
            sql`f_unaccent(${pattern})`,
          ),
          eb(
            sql`f_unaccent(coalesce(pages.text_content, ''))`,
            'ilike',
            sql`f_unaccent(${pattern})`,
          ),
        ]),
      );
    if (space) {
      baseQuery = baseQuery.where('pages.spaceId', '=', space.id);
    }

    const countQuery = baseQuery.select((eb) =>
      eb.fn.countAll<number>().as('count'),
    );
    const rowsQuery = baseQuery.select([
      'pages.id',
      'pages.slugId',
      'pages.title',
      'pages.icon',
      'pages.parentPageId',
      'pages.createdAt',
      'pages.updatedAt',
      'pages.spaceId',
      'spaces.name as spaceName',
      'spaces.slug as spaceSlug',
      sql<string>`substring(coalesce(pages.text_content, '') from 1 for 240)`.as(
        'highlight',
      ),
    ]);

    const [{ count }, pages] = await Promise.all([
      countQuery.executeTakeFirstOrThrow(),
      rowsQuery
        .orderBy(
          sql<number>`case when f_unaccent(coalesce(pages.title, '')) ilike f_unaccent(${pattern}) then 1 else 0 end`,
          'desc',
        )
        .orderBy('pages.updatedAt', 'desc')
        .limit(dto.limit)
        .offset(dto.offset)
        .execute(),
    ]);

    return this.success({
      total: Number(count),
      pages: pages.map((page) => ({
        id: page.id,
        slugId: page.slugId,
        title: page.title,
        icon: page.icon,
        highlight: page.highlight?.replace(/\s+/g, ' ').trim() ?? '',
        parentPageId: page.parentPageId,
        space: {
          id: page.spaceId,
          name: page.spaceName,
          slug: page.spaceSlug,
        },
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
      })),
    });
  }

  private async createSpace(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpCreateSpaceDto, args);
    const { workspaceId: _workspaceId, ...createDto } = dto;
    const { user, workspace } = await this.loadContext(dto.workspaceId);
    const space = await this.spaceService.createSpace(
      user,
      workspace.id,
      createDto,
    );
    return this.success(this.spaceSummary(space));
  }

  private async insertPageTree(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpInsertPageTreeDto, args);
    const nodeCount = this.countTreeNodes(dto.pages);
    if (nodeCount > MAX_TREE_NODES) {
      throw new McpToolError(
        'TREE_TOO_LARGE',
        `insert_page_tree supports at most ${MAX_TREE_NODES} nodes`,
      );
    }
    if (this.treeDepth(dto.pages) > MAX_TREE_DEPTH) {
      throw new McpToolError(
        'TREE_TOO_DEEP',
        `insert_page_tree supports a maximum depth of ${MAX_TREE_DEPTH}`,
      );
    }
    this.assertTreeContentSize(dto.pages);

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

      let parentPageId: string | null = null;
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
        parentPageId = parent.id;
      }

      const pages = [];
      for (const node of preparedPages) {
        pages.push(
          await this.insertTreeNode(
            node,
            space.id,
            parentPageId,
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
    this.assertContentSize(dto.content);
    const { user, workspace } = await this.loadContext(dto.workspaceId);
    const pageContent = await markdownToPageContent(dto.content);

    const page = await this.db.transaction().execute(async (trx) => {
      const space = await this.requireSpace(dto.spaceId, workspace.id, trx);
      let parentPageId: string | null = null;
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
        parentPageId = parent.id;
      }

      return this.insertPageRecord(
        {
          title: dto.title ?? pageContent.title ?? 'Untitled',
          icon: dto.icon,
          pageContent,
        },
        space.id,
        parentPageId,
        user.id,
        workspace.id,
        trx,
      );
    });

    return this.success(this.pageSummary(page));
  }

  private async updatePage(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpUpdatePageDto, args);
    const { user, workspace } = await this.loadContext(dto.workspaceId);
    let page = await this.requirePage(dto.pageId, workspace.id);
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

    if (dto.content !== undefined && !dto.expectedUpdatedAt) {
      throw new McpToolError(
        'VERSION_REQUIRED',
        'expectedUpdatedAt is required when updating content',
      );
    }

    if (dto.content !== undefined) {
      this.assertContentSize(dto.content);
      const pageContent = await markdownToPageContent(dto.content);
      const connection = await this.collaborationGateway.openDirectConnection(
        `page.${page.id}`,
        { user },
      );

      try {
        await connection.transact(() => undefined);
        page = await this.requirePage(page.id, workspace.id);
        if (!this.sameTimestamp(page.updatedAt, dto.expectedUpdatedAt)) {
          throw new McpToolError(
            'PAGE_CONFLICT',
            'Page changed after it was read',
          );
        }

        await connection.transact((document) => {
          prosemirrorToYXmlFragment(
            jsonToNode(pageContent.content),
            document.getXmlFragment('default'),
          );
        });
      } finally {
        await connection.disconnect();
      }
    }

    if (dto.title !== undefined || dto.icon !== undefined) {
      page = await this.requirePage(page.id, workspace.id);
      const contributors = new Set(page.contributorIds ?? []);
      contributors.add(user.id);
      await this.pageRepo.updatePage(
        {
          workspaceId: workspace.id,
          title: dto.title,
          icon: dto.icon,
          lastUpdatedById: user.id,
          contributorIds: [...contributors],
        },
        page.id,
      );
    }

    return this.success(
      this.pageSummary(await this.requirePage(page.id, workspace.id)),
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

    const targetSpace = dto.targetSpaceId
      ? await this.requireSpace(dto.targetSpaceId, workspace.id)
      : targetParent
        ? await this.requireSpace(targetParent.spaceId, workspace.id)
        : await this.requireSpace(page.spaceId, workspace.id);
    if (targetParent && targetParent.spaceId !== targetSpace.id) {
      throw new McpToolError(
        'INVALID_MOVE',
        'Target parent is not in the target space',
      );
    }

    if (targetSpace.id !== page.spaceId) {
      await this.pageService.movePageToSpace(page, targetSpace.id);
      page = await this.requirePage(page.id, workspace.id);
      if (!targetParent) {
        return this.success(this.pageSummary(page));
      }
    }

    const position = await this.nextPagePosition(
      targetSpace.id,
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

    return this.success(
      this.pageSummary(await this.requirePage(page.id, workspace.id)),
    );
  }

  private async listSpacePages(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpListSpacePagesDto, args);
    const { workspace } = await this.loadContext(dto.workspaceId);
    const space = await this.requireSpace(dto.spaceId, workspace.id);
    const isTree = dto.format === 'tree';
    if (isTree && dto.offset !== 0) {
      throw new McpToolError(
        'VALIDATION_ERROR',
        'tree format requires offset=0',
      );
    }
    const limit = dto.limit ?? (isTree ? MAX_TREE_RESULT_NODES : 100);

    let baseQuery = this.db
      .selectFrom('pages')
      .where('workspaceId', '=', workspace.id)
      .where('spaceId', '=', space.id);
    if (!dto.includeDeleted) {
      baseQuery = baseQuery.where('deletedAt', 'is', null);
    }

    const { count } = await baseQuery
      .select((expression) => expression.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    const total = Number(count);
    if (isTree && total > limit) {
      throw new McpToolError(
        'TREE_TOO_LARGE',
        `Space has ${total} pages; tree mode limit is ${limit}. Use flat mode.`,
      );
    }

    const rows = await baseQuery
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
      .limit(limit)
      .offset(isTree ? 0 : dto.offset)
      .execute();

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
      spaceId: space.id,
      total,
      pages: isTree ? this.buildPageTree(pages) : pages,
    });
  }

  private async getPageMarkdown(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpGetPageMarkdownDto, args);
    const { user, workspace } = await this.loadContext(dto.workspaceId);
    let page = await this.requirePage(dto.pageId, workspace.id);
    const connection = await this.collaborationGateway.openDirectConnection(
      `page.${page.id}`,
      { user },
    );
    try {
      await connection.transact(() => undefined);
    } finally {
      await connection.disconnect();
    }

    page = await this.pageRepo.findById(page.id, { includeContent: true });
    if (!page || page.workspaceId !== workspace.id || page.deletedAt) {
      throw new McpToolError('PAGE_NOT_FOUND', 'Page not found');
    }
    const space = await this.requireSpace(page.spaceId, workspace.id);
    const markdown = await this.exportService.exportPage(
      'markdown',
      page,
      true,
    );
    return this.success({
      pageId: page.id,
      slugId: page.slugId,
      title: page.title,
      markdown,
      updatedAt: page.updatedAt,
      spaceId: page.spaceId,
      spaceSlug: space.slug,
    });
  }

  private async analyzePageTree(args: unknown): Promise<CallToolResult> {
    const dto = await validateMcpDto(McpAnalyzePageTreeDto, args);
    const { workspace } = await this.loadContext(dto.workspaceId);
    const space = await this.requireSpace(dto.spaceId, workspace.id);

    const pages = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'parentPageId', 'textContent'])
      .where('workspaceId', '=', workspace.id)
      .where('spaceId', '=', space.id)
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
      spaceId: space.id,
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

  private async loadContext(workspaceId?: string) {
    try {
      return await this.contextService.load(workspaceId);
    } catch (error) {
      if (error instanceof McpToolError) throw error;
      if (
        error instanceof Error &&
        error.message.includes('MCP agent user is disabled')
      ) {
        throw new McpToolError('AGENT_USER_DISABLED', error.message);
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
    if (!space || space.deletedAt) {
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
  ): Promise<{
    id: string;
    slugId: string;
    title: string;
    children: unknown[];
  }> {
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
    return {
      id: page.id,
      slugId: page.slugId,
      title: page.title,
      children,
    };
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

  private treeDepth(nodes: McpTreePageNodeDto[], depth = 1): number {
    if (nodes.length === 0) return depth - 1;
    return Math.max(
      ...nodes.map((node) =>
        node.children?.length
          ? this.treeDepth(node.children, depth + 1)
          : depth,
      ),
    );
  }

  private assertTreeContentSize(nodes: McpTreePageNodeDto[]): void {
    for (const node of nodes) {
      this.assertContentSize(node.content);
      this.assertTreeContentSize(node.children ?? []);
    }
  }

  private assertContentSize(content: string): void {
    if (Buffer.byteLength(content, 'utf8') > MAX_PAGE_CONTENT_BYTES) {
      throw new McpToolError(
        'PAYLOAD_TOO_LARGE',
        `Page content must not exceed ${MAX_PAGE_CONTENT_BYTES} bytes`,
      );
    }
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

  private sameTimestamp(actual: Date, expected?: string): boolean {
    if (!expected) return false;
    return new Date(actual).getTime() === new Date(expected).getTime();
  }

  private workspaceSummary(workspace: Workspace) {
    return {
      id: workspace.id,
      name: workspace.name,
      hostname: workspace.hostname,
      defaultSpaceId: workspace.defaultSpaceId,
      createdAt: workspace.createdAt,
    };
  }

  private spaceSummary(space: Space) {
    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: space.description,
      visibility: space.visibility,
      defaultRole: space.defaultRole,
      workspaceId: space.workspaceId,
      createdAt: space.createdAt,
      updatedAt: space.updatedAt,
    };
  }

  private pageSummary(page: Page) {
    return {
      id: page.id,
      slugId: page.slugId,
      title: page.title,
      icon: page.icon,
      parentPageId: page.parentPageId,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
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

  private success(value: Record<string, unknown>): CallToolResult {
    const serialized = JSON.parse(JSON.stringify(value)) as Record<
      string,
      unknown
    >;
    return {
      content: [{ type: 'text', text: JSON.stringify(serialized, null, 2) }],
      structuredContent: serialized,
    };
  }
}

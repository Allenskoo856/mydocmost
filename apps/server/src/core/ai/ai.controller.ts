import {
  Body,
  Controller,
  ForbiddenException,
  BadRequestException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FastifyReply } from 'fastify';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { AiService, AskEvent } from './ai.service';
import { AiIndexingService } from './ai-indexing.service';
import { AskDto } from './dto/ask.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiIndexingService: AiIndexingService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Get('status')
  async status(@AuthWorkspace() workspace: Workspace) {
    if (!this.aiService.isEnabled()) {
      return { enabled: false, totalPages: 0, indexedPages: 0 };
    }
    const stats = await this.aiIndexingService.getWorkspaceStats(workspace.id);
    return { enabled: true, ...stats };
  }

  @HttpCode(HttpStatus.OK)
  @Post('reindex-workspace')
  async reindexWorkspace(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    if (!this.aiService.isEnabled()) {
      throw new BadRequestException('AI is not enabled');
    }

    // Stable jobId dedupes concurrent rebuilds of the same workspace.
    await this.aiQueue.add(
      QueueJob.WORKSPACE_CREATE_EMBEDDINGS,
      { workspaceId: workspace.id },
      {
        jobId: `ai-workspace-reindex-${workspace.id}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return { ok: true };
  }

  @Post('ask')
  async ask(
    @Body() dto: AskDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ): Promise<void> {
    res.raw.setHeader('Content-Type', 'text/event-stream');
    res.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    res.raw.setHeader('Connection', 'keep-alive');
    // Disable proxy buffering so SSE streams through Nginx in subpath deploys.
    res.raw.setHeader('X-Accel-Buffering', 'no');
    res.hijack();

    const write = (event: AskEvent) => {
      res.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      for await (const event of this.aiService.streamAsk(dto.question, {
        userId: user.id,
        workspaceId: workspace.id,
        scope: { spaceId: dto.spaceId, pageId: dto.pageId },
      })) {
        write(event);
      }
    } catch {
      write({ type: 'error', message: 'AI request failed' });
    } finally {
      res.raw.end();
    }
  }
}

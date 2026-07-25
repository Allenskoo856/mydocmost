import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiService, AskEvent } from './ai.service';
import { AskDto } from './dto/ask.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @HttpCode(HttpStatus.OK)
  @Get('status')
  status() {
    return { enabled: this.aiService.isEnabled() };
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

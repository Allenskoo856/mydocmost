import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import {
  logPerf,
  measureAsync,
  roundPerf,
} from '../helpers/perf.util';
import { Workspace } from '@docmost/db/types/entity.types';

@Injectable()
export class DomainMiddleware implements NestMiddleware {
  private selfHostedWorkspaceCache: Workspace | null | undefined;

  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
  ) {}
  async use(
    req: FastifyRequest['raw'],
    _res: FastifyReply['raw'],
    next: () => void,
  ) {
    if (this.environmentService.isSelfHosted()) {
      let workspace = this.selfHostedWorkspaceCache;
      let durationMs = 0;

      if (workspace === undefined) {
        const measured = await measureAsync('middleware.workspace.findFirst', () =>
          this.workspaceRepo.findFirst(),
        );
        workspace = measured.result;
        durationMs = measured.durationMs;
        this.selfHostedWorkspaceCache = workspace ?? null;
      }

      if (!workspace) {
        //throw new NotFoundException('Workspace not found');
        (req as any).workspaceId = null;
        return next();
      }

      // TODO: unify
      (req as any).workspaceId = workspace.id;
      (req as any).workspace = workspace;

      if (durationMs > 0) {
        logPerf('middleware.workspace.cached', {
          mode: 'self-hosted',
          durationMs: roundPerf(durationMs),
        });
      }
    } else if (this.environmentService.isCloud()) {
      const header = req.headers.host;
      const subdomain = header.split('.')[0];

      const { result: workspace, durationMs } = await measureAsync(
        'middleware.workspace.findByHostname',
        () => this.workspaceRepo.findByHostname(subdomain),
        { subdomain },
      );

      if (!workspace) {
        (req as any).workspaceId = null;
        return next();
      }

      (req as any).workspaceId = workspace.id;
      (req as any).workspace = workspace;

      logPerf('middleware.workspace.cloud', {
        subdomain,
        durationMs: roundPerf(durationMs),
      });
    }

    next();
  }
}

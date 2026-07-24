import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { McpPageChangeOperationDto } from './dto/changes.dto';

export interface McpSessionContext {
  workspaceId?: string;
}

export interface McpPlannedOperation {
  clientId: string;
  type: 'create' | 'update' | 'move';
  status: 'ready' | 'conflict' | 'invalid';
  input: McpPageChangeOperationDto;
  page?: {
    id: string;
    slugId: string;
    title: string | null;
    spaceId: string;
    parentPageId: string | null;
    updatedAt: Date;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface McpChangePlan {
  planId: string;
  workspaceId: string;
  createdAt: number;
  requiresApproval: boolean;
  summary: {
    total: number;
    ready: number;
    conflicts: number;
    invalid: number;
  };
  operations: McpPlannedOperation[];
}

export interface McpApplyResult {
  operationId: string;
  planId: string;
  status: 'success' | 'partial_success' | 'failed';
  summary: {
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
  items: Array<Record<string, unknown>>;
}

@Injectable()
export class McpSessionStateService {
  private readonly plans = new Map<string, McpChangePlan>();
  private readonly applyResults = new Map<string, McpApplyResult>();
  private readonly planTtlMs = 30 * 60 * 1000;
  private readonly applyTtlMs = 30 * 60 * 1000;

  createSessionContext(): McpSessionContext {
    return {};
  }

  bindWorkspace(session: McpSessionContext, workspaceId: string): void {
    session.workspaceId = workspaceId;
  }

  createPlan(
    workspaceId: string,
    operations: McpPlannedOperation[],
  ): McpChangePlan {
    this.cleanup();
    const summary = {
      total: operations.length,
      ready: operations.filter((item) => item.status === 'ready').length,
      conflicts: operations.filter((item) => item.status === 'conflict').length,
      invalid: operations.filter((item) => item.status === 'invalid').length,
    };
    const plan: McpChangePlan = {
      planId: randomUUID(),
      workspaceId,
      createdAt: Date.now(),
      requiresApproval: true,
      summary,
      operations,
    };
    this.plans.set(plan.planId, plan);
    return plan;
  }

  getPlan(planId: string): McpChangePlan | undefined {
    this.cleanup();
    return this.plans.get(planId);
  }

  getApplyResult(
    planId: string,
    idempotencyKey: string,
  ): McpApplyResult | undefined {
    this.cleanup();
    return this.applyResults.get(this.applyKey(planId, idempotencyKey));
  }

  saveApplyResult(
    planId: string,
    idempotencyKey: string,
    result: McpApplyResult,
  ): McpApplyResult {
    this.cleanup();
    this.applyResults.set(this.applyKey(planId, idempotencyKey), {
      ...result,
      // keep for cleanup timing
      planId,
    });
    return result;
  }

  private applyKey(planId: string, idempotencyKey: string): string {
    return `${planId}:${idempotencyKey}`;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [planId, plan] of this.plans) {
      if (now - plan.createdAt > this.planTtlMs) {
        this.plans.delete(planId);
      }
    }
    for (const [key, result] of this.applyResults) {
      const plan = this.plans.get(result.planId);
      if (!plan || now - plan.createdAt > this.applyTtlMs) {
        this.applyResults.delete(key);
      }
    }
  }
}

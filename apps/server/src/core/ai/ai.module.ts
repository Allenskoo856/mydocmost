import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiModelService } from './ai-model.service';
import { AiRetrievalService } from './ai-retrieval.service';
import { AiIndexingService } from './ai-indexing.service';
import { AiProcessor } from './ai.processor';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    AiModelService,
    AiRetrievalService,
    AiIndexingService,
    AiProcessor,
  ],
  exports: [AiService, AiRetrievalService, AiModelService],
})
export class AiModule {}

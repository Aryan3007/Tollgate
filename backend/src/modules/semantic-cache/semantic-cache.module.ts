import { Module } from '@nestjs/common';
import { Embedder } from './embedder.js';
import { LocalEmbedder } from './local-embedder.js';
import { SemanticCacheService } from './semantic-cache.service.js';

@Module({
  providers: [{ provide: Embedder, useClass: LocalEmbedder }, SemanticCacheService],
  exports: [SemanticCacheService],
})
export class SemanticCacheModule {}

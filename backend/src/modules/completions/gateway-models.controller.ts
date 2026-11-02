import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentKey } from '../../common/http/principal.decorators.js';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { VirtualKeyGuard } from '../auth/virtual-key.guard.js';
import type { KeyContext } from '../keys/key-context.js';
import { CompletionsService, type ModelListing } from './completions.service.js';

class OpenAIModelDto {
  @ApiProperty({ example: 'gpt-4o-mini' })
  id: string;

  @ApiProperty({ enum: ['model'], example: 'model' })
  object: 'model';

  @ApiProperty({ example: 1793101200, description: 'Unix timestamp in seconds' })
  created: number;

  @ApiProperty({ example: 'openai', description: 'Provider that serves the model' })
  owned_by: string;
}

class ModelListingDto {
  @ApiProperty({ enum: ['list'], example: 'list' })
  object: 'list';

  @ApiProperty({ type: [OpenAIModelDto] })
  data: OpenAIModelDto[];
}

@ApiTags('Chat completions')
@ApiBearerAuth('virtual-key')
@UseGuards(VirtualKeyGuard)
@Controller('models')
export class GatewayModelsController {
  constructor(private readonly completions: CompletionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List models (OpenAI-compatible)',
    description: 'Models the calling virtual key is allowed to use. Bounded by the key’s allow-list (max 50).',
  })
  @ApiResponse({ status: 200, description: 'Allowed models', type: ModelListingDto })
  @ApiErrors({ 401: 'Missing, unknown, revoked or expired virtual key' })
  list(@CurrentKey() key: KeyContext): Promise<ModelListing> {
    return this.completions.listModels(key);
  }
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Documentation-only classes for Swagger. Runtime validation lives in the
// Zod schema next to this file.

const ROLES = ['system', 'developer', 'user', 'assistant', 'tool'] as const;

export class ChatMessageDto {
  @ApiProperty({ enum: ROLES, example: 'user', description: 'Author of the message' })
  role: (typeof ROLES)[number];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Summarise our refund policy in two lines.',
    description:
      'Message text, max 1,000,000 characters. Content-part arrays (text, image_url) are also accepted and passed through unchanged.',
  })
  content: string | null;

  @ApiPropertyOptional({ example: 'support-bot', maxLength: 64, description: 'Optional participant name' })
  name?: string;
}

export class StreamOptionsDto {
  @ApiPropertyOptional({
    example: true,
    description: 'When true, a final chunk with token usage and empty choices is sent before [DONE].',
  })
  include_usage?: boolean;
}

export class ChatCompletionRequestDto {
  @ApiProperty({ example: 'gpt-4o-mini', maxLength: 128, description: 'Model to call' })
  model: string;

  @ApiProperty({
    type: [ChatMessageDto],
    minItems: 1,
    maxItems: 2048,
    description: 'Conversation so far, oldest first',
  })
  messages: ChatMessageDto[];

  @ApiPropertyOptional({
    example: false,
    description: 'Stream the response as server-sent events (`text/event-stream`), ending with `data: [DONE]`.',
  })
  stream?: boolean;

  @ApiPropertyOptional({ type: StreamOptionsDto, description: 'Streaming options; only used when stream is true' })
  stream_options?: StreamOptionsDto;

  @ApiPropertyOptional({ minimum: 0, maximum: 2, example: 0, description: 'Sampling temperature' })
  temperature?: number;

  @ApiPropertyOptional({ minimum: 1, example: 256, description: 'Maximum tokens to generate' })
  max_tokens?: number;

  @ApiPropertyOptional({ minimum: 1, example: 256, description: 'Newer alias of max_tokens used by reasoning models' })
  max_completion_tokens?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 8, example: 1, description: 'Number of choices to generate' })
  n?: number;
}

export class UsageDto {
  @ApiProperty({ example: 18 })
  prompt_tokens: number;

  @ApiProperty({ example: 42 })
  completion_tokens: number;

  @ApiProperty({ example: 60 })
  total_tokens: number;
}

export class AssistantMessageDto {
  @ApiProperty({ example: 'assistant' })
  role: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Refunds are issued within 7 days of a return. Shipping fees are non-refundable.',
  })
  content: string | null;
}

export class ChatCompletionChoiceDto {
  @ApiProperty({ example: 0 })
  index: number;

  @ApiProperty({ type: AssistantMessageDto })
  message: AssistantMessageDto;

  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['stop', 'length', 'tool_calls', 'content_filter'],
    example: 'stop',
  })
  finish_reason: string | null;
}

export class ChatCompletionDto {
  @ApiProperty({ example: 'chatcmpl-9x2a' })
  id: string;

  @ApiProperty({ enum: ['chat.completion'], example: 'chat.completion' })
  object: 'chat.completion';

  @ApiProperty({ example: 1793101200, description: 'Unix timestamp in seconds' })
  created: number;

  @ApiProperty({ example: 'gpt-4o-mini-2024-07-18', description: 'Model that served the request' })
  model: string;

  @ApiProperty({ type: [ChatCompletionChoiceDto] })
  choices: ChatCompletionChoiceDto[];

  @ApiProperty({ type: UsageDto })
  usage: UsageDto;
}

export class OpenAIErrorDetailDto {
  @ApiProperty({ example: 'messages: Too small: expected array to have >=1 items' })
  message: string;

  @ApiProperty({
    enum: ['invalid_request_error', 'authentication_error', 'permission_error', 'rate_limit_error', 'api_error'],
    example: 'invalid_request_error',
  })
  type: string;

  @ApiProperty({ example: 'invalid_request', description: 'Machine-readable error code' })
  code: string;

  @ApiProperty({ type: String, nullable: true, example: 'messages', description: 'Request field that caused the error' })
  param: string | null;
}

export class OpenAIErrorDto {
  @ApiProperty({ type: OpenAIErrorDetailDto })
  error: OpenAIErrorDetailDto;
}

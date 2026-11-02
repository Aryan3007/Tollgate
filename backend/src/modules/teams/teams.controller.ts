import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { uuidParam, type Paginated } from '../../common/pagination.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import {
  CreateTeamDto,
  PaginatedTeamsDto,
  TeamDto,
  UpdateTeamDto,
} from './dto/team.dto.js';
import {
  createTeamSchema,
  listTeamsQuery,
  updateTeamSchema,
  type CreateTeamInput,
  type ListTeamsQuery,
  type UpdateTeamInput,
} from './dto/team.schemas.js';
import { TeamsService, type TeamWithSpend } from './teams.service.js';

const idParam = new ZodValidationPipe(uuidParam);

@ApiTags('Admin: teams')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a team',
    description: 'A team owns virtual keys and has its own monthly budget and rate limits.',
  })
  @ApiBody({ type: CreateTeamDto })
  @ApiResponse({ status: 201, description: 'Team created', type: TeamDto })
  @ApiErrors({
    400: 'Invalid body',
    401: 'Missing or invalid admin token',
    409: 'Team name already taken',
    500: 'Unexpected error',
  })
  create(
    @Body(new ZodValidationPipe(createTeamSchema)) body: CreateTeamInput,
  ): Promise<TeamWithSpend> {
    return this.teams.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List teams', description: 'Paginated, newest first by default.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, 1-indexed' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Items per page, max 100' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'name'], description: 'Field to sort by' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Sort direction' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Partial match on team name' })
  @ApiResponse({ status: 200, description: 'Page of teams', type: PaginatedTeamsDto })
  @ApiErrors({ 400: 'Invalid query', 401: 'Missing or invalid admin token', 500: 'Unexpected error' })
  list(
    @Query(new ZodValidationPipe(listTeamsQuery)) query: ListTeamsQuery,
  ): Promise<Paginated<TeamWithSpend>> {
    return this.teams.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a team' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Team ID' })
  @ApiResponse({ status: 200, description: 'The team', type: TeamDto })
  @ApiErrors({ 400: 'id is not a UUID', 401: 'Missing or invalid admin token', 404: 'Team not found' })
  get(@Param('id', idParam) id: string): Promise<TeamWithSpend> {
    return this.teams.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a team',
    description: 'New limits apply to all of the team’s keys on their next request.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Team ID' })
  @ApiBody({ type: UpdateTeamDto })
  @ApiResponse({ status: 200, description: 'Updated team', type: TeamDto })
  @ApiErrors({
    400: 'Invalid body or id',
    401: 'Missing or invalid admin token',
    404: 'Team not found',
    409: 'Team name already taken',
  })
  update(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(updateTeamSchema)) body: UpdateTeamInput,
  ): Promise<TeamWithSpend> {
    return this.teams.update(id, body);
  }
}

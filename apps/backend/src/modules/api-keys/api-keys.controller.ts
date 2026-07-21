import { Controller, Get, Post, Delete, Body, Param, HttpCode, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto, ApiKeyResponseDto, ApiKeyUsageDto } from './dto/api-key.dto';

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key for the authenticated user' })
  @ApiResponse({ status: 201, type: ApiKeyResponseDto })
  async createApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ): Promise<ApiKeyResponseDto & { key: string }> {
    return this.apiKeysService.createApiKey(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated user's active API keys" })
  @ApiResponse({ status: 200, type: [ApiKeyResponseDto] })
  async getApiKeys(@CurrentUser() user: AuthenticatedUser): Promise<ApiKeyResponseDto[]> {
    return this.apiKeysService.getApiKeys(user.userId);
  }

  @Delete(':keyId')
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke one of the authenticated user's API keys" })
  async revokeApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('keyId') keyId: string,
  ): Promise<void> {
    return this.apiKeysService.revokeApiKey(user.userId, keyId);
  }

  @Get(':keyId/usage')
  @ApiOperation({
    summary: "Get usage metadata for one of the authenticated user's API keys",
  })
  @ApiResponse({ status: 200, type: ApiKeyUsageDto })
  async getApiKeyUsage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('keyId') keyId: string,
  ): Promise<ApiKeyUsageDto> {
    return this.apiKeysService.getApiKeyUsage(user.userId, keyId);
  }
}

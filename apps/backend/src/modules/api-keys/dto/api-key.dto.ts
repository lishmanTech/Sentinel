import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'Human-readable label for the key', example: 'CI deploy key' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

export class ApiKeyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    required: false,
    description: 'The plaintext key — only ever present in the create response.',
  })
  key?: string;

  @ApiProperty({ description: 'Last 4 characters of the key, for identification in listings.' })
  keyPreview!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  lastUsedAt!: Date | null;

  @ApiProperty({ nullable: true })
  revokedAt!: Date | null;
}

export class ApiKeyUsageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  keyPreview!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ nullable: true })
  lastUsedAt!: Date | null;

  @ApiProperty()
  requestCount!: number;
}

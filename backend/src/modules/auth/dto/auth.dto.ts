import { ApiProperty } from '@nestjs/swagger';

// Documentation-only classes for Swagger. Runtime validation lives in
// auth.schemas.ts.

export class LoginDto {
  @ApiProperty({ format: 'email', maxLength: 254, example: 'admin@tollgate.local' })
  email: string;

  @ApiProperty({ minLength: 1, maxLength: 128, example: 'correct-horse-battery-staple' })
  password: string;
}

export class AdminDto {
  @ApiProperty({ format: 'uuid', example: '7a1c2e9b-4d3f-4b8a-9e6c-1f2a3b4c5d6e' })
  id: string;

  @ApiProperty({ format: 'email', example: 'admin@tollgate.local' })
  email: string;
}

export class SessionDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…', description: 'JWT to send as `Authorization: Bearer <token>`' })
  accessToken: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expiresIn: number;

  @ApiProperty({ type: AdminDto })
  admin: AdminDto;
}

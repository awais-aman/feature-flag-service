import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}

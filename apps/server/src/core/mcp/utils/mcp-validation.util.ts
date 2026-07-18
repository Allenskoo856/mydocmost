import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { McpToolError } from './mcp-error.util';

export async function validateMcpDto<T extends object>(
  type: ClassConstructor<T>,
  input: unknown,
): Promise<T> {
  const dto = plainToInstance(type, input ?? {});
  const errors = await validate(dto, {
    forbidNonWhitelisted: true,
    whitelist: true,
    stopAtFirstError: true,
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}).map(
        (message) => `${error.property}: ${message}`,
      ),
    );
    throw new McpToolError('VALIDATION_ERROR', messages.join('; '));
  }

  return dto;
}

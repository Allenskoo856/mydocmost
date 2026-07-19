import { NestFactory, Reflector } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import {
  Logger,
  NotFoundException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { TransformHttpResponseInterceptor } from './common/interceptors/http-response.interceptor';
import { WsRedisIoAdapter } from './ws/adapter/ws-redis.adapter';
import { InternalLogFilter } from './common/logger/internal-log-filter';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import fastifyIp from 'fastify-ip';
import { EnvironmentService } from './integrations/environment/environment.service';
import { getMcpControllerPath } from './core/mcp/mcp-path.util';
import { envPath } from './common/helpers';
import { existsSync } from 'node:fs';

async function bootstrap() {
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      routerOptions: {
        maxParamLength: 1000,
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
      },
    }),
    {
      rawBody: true,
      logger: new InternalLogFilter(),
    },
  );

  const environmentService = app.get(EnvironmentService);
  const basePath = environmentService.getBasePath();
  const apiPrefix = basePath ? `${basePath.replace(/^\//, '')}/api` : 'api';
  const fullApiPrefix = `/${apiPrefix}`;

  app.setGlobalPrefix(apiPrefix, {
    exclude: [
      'robots.txt',
      'share/:shareId/p/:pageSlug',
      {
        path: `${getMcpControllerPath(basePath)}/(.*)`,
        method: RequestMethod.ALL,
      },
    ],
  });

  const reflector = app.get(Reflector);
  const redisIoAdapter = new WsRedisIoAdapter(app, basePath);
  await redisIoAdapter.connectToRedis();

  app.useWebSocketAdapter(redisIoAdapter);

  await app.register(fastifyIp);
  await app.register(fastifyMultipart);
  await app.register(fastifyCookie);

  app
    .getHttpAdapter()
    .getInstance()
    .decorateReply('setHeader', function (name: string, value: unknown) {
      this.header(name, value);
    })
    .decorateReply('end', function () {
      this.send('');
    })
    .addHook('preHandler', function (req, reply, done) {
      // don't require workspaceId for the following paths
      const excludedPaths = [
        `${fullApiPrefix}/auth/setup`,
        `${fullApiPrefix}/health`,
        `${fullApiPrefix}/billing/stripe/webhook`,
        `${fullApiPrefix}/workspace/check-hostname`,
        `${fullApiPrefix}/sso/google`,
        `${fullApiPrefix}/workspace/create`,
        `${fullApiPrefix}/workspace/joined`,
      ];

      if (
        req.originalUrl.startsWith(fullApiPrefix) &&
        !excludedPaths.some((path) => req.originalUrl.startsWith(path))
      ) {
        if (!req.raw?.['workspaceId'] && req.originalUrl !== fullApiPrefix) {
          throw new NotFoundException('Workspace not found');
        }
        done();
      } else {
        done();
      }
    });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
      transform: true,
    }),
  );

  app.enableCors();
  app.useGlobalInterceptors(new TransformHttpResponseInterceptor(reflector));
  app.enableShutdownHooks();

  const logger = new Logger('NestApplication');

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`UnhandledRejection, reason: ${reason}`, promise);
  });

  process.on('uncaughtException', (error) => {
    logger.error('UncaughtException:', error);
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host, () => {
    logger.log(
      `Listening on http://127.0.0.1:${port} / ${process.env.APP_URL}`,
    );
  });
}

bootstrap();

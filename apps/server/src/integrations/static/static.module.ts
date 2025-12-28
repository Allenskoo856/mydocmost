import { Module, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { join } from 'path';
import * as fs from 'node:fs';
import fastifyStatic from '@fastify/static';
import { EnvironmentService } from '../environment/environment.service';

@Module({})
export class StaticModule implements OnModuleInit {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly environmentService: EnvironmentService,
  ) {}

  public async onModuleInit() {
    const httpAdapter = this.httpAdapterHost.httpAdapter;
    const app = httpAdapter.getInstance();

    const clientDistPath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'client/dist',
    );

    const indexFilePath = join(clientDistPath, 'index.html');

    if (fs.existsSync(clientDistPath) && fs.existsSync(indexFilePath)) {
      const indexTemplateFilePath = join(clientDistPath, 'index-template.html');
      const windowVar = '<!--window-config-->';

      const configString = {
        ENV: this.environmentService.getNodeEnv(),
        APP_URL: this.environmentService.getAppUrl(),
        BASE_PATH: this.environmentService.getBasePath(),
        CLOUD: this.environmentService.isCloud(),
        FILE_UPLOAD_SIZE_LIMIT:
          this.environmentService.getFileUploadSizeLimit(),
        FILE_IMPORT_SIZE_LIMIT:
          this.environmentService.getFileImportSizeLimit(),
        DRAWIO_URL: this.environmentService.getDrawioUrl(),
        SUBDOMAIN_HOST: this.environmentService.isCloud()
          ? this.environmentService.getSubdomainHost()
          : undefined,
        COLLAB_URL: this.environmentService.getCollabUrl(),
        BILLING_TRIAL_DAYS: this.environmentService.isCloud()
          ? this.environmentService.getBillingTrialDays()
          : undefined,
      };

      const windowScriptContent = `<script>window.CONFIG=${JSON.stringify(configString)};</script>`;

      if (!fs.existsSync(indexTemplateFilePath)) {
        fs.copyFileSync(indexFilePath, indexTemplateFilePath);
      }

      const html = fs.readFileSync(indexTemplateFilePath, 'utf8');
      const transformedHtml = html.replace(windowVar, windowScriptContent);

      fs.writeFileSync(indexFilePath, transformedHtml);

      const basePath = this.environmentService.getBasePath();

      if (!basePath) {
        // 根目录部署：使用 fastify-static 的默认行为
        await app.register(fastifyStatic, {
          root: clientDistPath,
          wildcard: false,
        });

        app.get('*', (req: any, res: any) => {
          res.type('text/html').send(fs.createReadStream(indexFilePath));
        });
      } else {
        // 子目录部署：需要精确控制路径
        const normalizedBasePath = basePath.endsWith('/')
          ? basePath.slice(0, -1)
          : basePath;

        // 注册静态文件服务（不包括 index.html）
        await app.register(fastifyStatic, {
          root: clientDistPath,
          prefix: `${normalizedBasePath}/`,
          wildcard: false,
          index: false,
          redirect: false,
        });

        // 手动处理 index.html 的所有可能路径
        // 1. 不带斜杠的路径 (例如 /doc)
        app.get(normalizedBasePath, (req: any, res: any) => {
          res.type('text/html').send(fs.createReadStream(indexFilePath));
        });

        // 2. 通配符匹配所有子路径 (例如 /doc/*, 包括 /doc/)
        app.get(`${normalizedBasePath}/*`, (req: any, res: any) => {
          res.type('text/html').send(fs.createReadStream(indexFilePath));
        });
      }
    }
  }
}

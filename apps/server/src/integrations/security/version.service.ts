import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('./../../../package.json');

@Injectable()
export class VersionService {
  constructor() {}

  async getVersion() {
    // 内网部署：禁用外网版本检查
    return {
      currentVersion: packageJson?.version,
      latestVersion: 0, // 不检查更新
      releaseUrl: '', // 移除GitHub链接
    };
  }
}

export function getMcpControllerPath(basePath = process.env.BASE_PATH): string {
  const normalizedBasePath = (basePath ?? '').trim().replace(/^\/+|\/+$/g, '');

  return normalizedBasePath ? `${normalizedBasePath}/mcp` : 'mcp';
}

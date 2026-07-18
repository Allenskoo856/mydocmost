import { getMcpControllerPath } from './mcp-path.util';

describe('getMcpControllerPath', () => {
  it.each([
    [undefined, 'mcp'],
    ['', 'mcp'],
    ['/', 'mcp'],
    ['/docmost', 'docmost/mcp'],
    ['/docmost/', 'docmost/mcp'],
  ])('maps base path %p to %s', (basePath, expected) => {
    expect(getMcpControllerPath(basePath)).toBe(expected);
  });
});

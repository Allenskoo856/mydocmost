export interface IEmbedProvider {
  id: string;
  name: string;
  regex: RegExp;
  getEmbedUrl: (match: RegExpMatchArray, url?: string) => string;
}

export const embedProviders: IEmbedProvider[] = [
  // 所有外网嵌入功能已移除，仅保留iframe作为通用嵌入
  {
    id: "iframe",
    name: "Iframe",
    regex: /any-iframe/,
    getEmbedUrl: (match, url) => {
      return url;
    },
  },
];

export function getEmbedProviderById(id: string) {
  return embedProviders.find(
    (provider) => provider.id.toLowerCase() === id.toLowerCase(),
  );
}

export interface IEmbedResult {
  embedUrl: string;
  provider: string;
}

export function getEmbedUrlAndProvider(url: string): IEmbedResult {
  for (const provider of embedProviders) {
    const match = url.match(provider.regex);
    if (match) {
      return {
        embedUrl: provider.getEmbedUrl(match, url),
        provider: provider.name.toLowerCase(),
      };
    }
  }
  return {
    embedUrl: url,
    provider: "iframe",
  };
}

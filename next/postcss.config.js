import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 断点与容器阈值集中定义在 tokens.css：
 * - @custom-media 展开为页面级媒体查询（仅导航/侧栏/性能降级）
 * - @custom-container 展开为组件级容器查询
 * 不新增依赖，不改变 Vite 构建入口或输出结构。
 */
const root = dirname(fileURLToPath(import.meta.url));
const tokenSource = readFileSync(resolve(root, 'src/styles/tokens.css'), 'utf8');

function collectDefinitions(atRuleName) {
  const pattern = new RegExp(`@${atRuleName}\\s+(--[\\w-]+)\\s+([^;]+);`, 'g');
  return new Map(
    [...tokenSource.matchAll(pattern)].map((match) => [match[1], match[2].trim()]),
  );
}

const mediaDefinitions = collectDefinitions('custom-media');
const containerDefinitions = collectDefinitions('custom-container');

function expandConditions(atRule, definitions) {
  atRule.params = atRule.params.replace(/\((--[\w-]+)\)/g, (full, name) => {
    return definitions.has(name) ? definitions.get(name) : full;
  });
}

const qttfResponsiveTokens = {
  postcssPlugin: 'qttf-responsive-tokens',
  Once(rootNode) {
    rootNode.walkAtRules('custom-media', (atRule) => atRule.remove());
    rootNode.walkAtRules('custom-container', (atRule) => atRule.remove());
    rootNode.walkAtRules('media', (atRule) => expandConditions(atRule, mediaDefinitions));
    rootNode.walkAtRules('container', (atRule) => expandConditions(atRule, containerDefinitions));
  },
};

export default {
  plugins: [qttfResponsiveTokens],
};

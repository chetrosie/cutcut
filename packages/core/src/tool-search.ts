export type ToolType = "builtin" | "mcp" | "plugin";

export interface ToolDefinition {
  name: string;
  description: string;
  type: ToolType;
  tags?: string[];
}

export interface ScoreContext {
  query: string;
  queryTokens: string[];
  expandedQueryTokens: string[];
  tool: ToolDefinition;
  toolNameTokens: string[];
  toolDescriptionTokens: string[];
  toolTagTokens: string[];
  allToolTokens: string[];
}

export interface ToolSearchOptions {
  limit?: number;
  type?: ToolType | "all";
  scorer?: (context: ScoreContext) => number;
  includeDebug?: boolean;
  includeScoreBreakdown?: boolean;
  useCache?: boolean;
}

export interface ToolSearchDebug {
  matchedQueryTokens: string[];
  matchedExpandedTokens: string[];
  fuzzyMatches: Array<{ queryToken: string; toolToken: string; distance: number }>;
}

export interface ToolSearchWeights {
  nameMatch: number;
  descriptionMatch: number;
  tagMatch: number;
  synonymMatch: number;
}

export type ToolSearchSynonyms = Record<string, string[]>;

export interface ToolScoreBreakdown {
  nameMatch: number;
  descriptionMatch: number;
  tagMatch: number;
  synonymMatch: number;
  finalScore: number;
}

export interface ToolSearchResult {
  tool: ToolDefinition;
  score: number;
  debug?: ToolSearchDebug;
  scoreBreakdown?: ToolScoreBreakdown;
}

export interface ToolSearchCacheStats {
  size: number;
  hits: number;
  misses: number;
}

export interface ToolSearchEngineConfig {
  tools?: ToolDefinition[];
  cacheSize?: number;
  synonyms?: ToolSearchSynonyms;
  weights?: Partial<ToolSearchWeights>;
  useCacheByDefault?: boolean;
}

export interface ToolSearchEngine {
  search: (query: string, options?: ToolSearchOptions) => ToolSearchResult[];
  getTools: () => ToolDefinition[];
  setTools: (tools: ToolDefinition[]) => void;
  addTool: (tool: ToolDefinition) => void;
  removeToolByName: (toolName: string) => boolean;
  configure: (config: Omit<ToolSearchEngineConfig, "tools">) => void;
  clearCache: () => void;
  getCacheStats: () => ToolSearchCacheStats;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_CACHE_SIZE = 100;

const DEFAULT_SYNONYMS: ToolSearchSynonyms = {
  search: ["find", "lookup", "query", "discover"],
  find: ["search", "lookup", "query"],
  web: ["internet", "online", "browser"],
  file: ["document", "path", "fs"],
  read: ["open", "load"],
  write: ["save", "persist"],
  code: ["source", "symbol", "program"],
  calendar: ["schedule", "event", "agenda"],
  run: ["execute", "start", "launch"],
  config: ["settings", "preferences", "setup"],
};

const DEFAULT_WEIGHTS: ToolSearchWeights = {
  nameMatch: 0.55,
  descriptionMatch: 0.2,
  tagMatch: 0.15,
  synonymMatch: 0.1,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function uniqueTokens(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

function normalizeWeights(weights?: Partial<ToolSearchWeights>): ToolSearchWeights {
  const merged: ToolSearchWeights = {
    ...DEFAULT_WEIGHTS,
    ...(weights ?? {}),
  };

  const total = merged.nameMatch + merged.descriptionMatch + merged.tagMatch + merged.synonymMatch;
  if (total <= 0) return { ...DEFAULT_WEIGHTS };

  return {
    nameMatch: merged.nameMatch / total,
    descriptionMatch: merged.descriptionMatch / total,
    tagMatch: merged.tagMatch / total,
    synonymMatch: merged.synonymMatch / total,
  };
}

function mergeSynonyms(base: ToolSearchSynonyms, extra?: ToolSearchSynonyms): ToolSearchSynonyms {
  const merged: ToolSearchSynonyms = { ...base };
  if (!extra) return merged;

  for (const [key, value] of Object.entries(extra)) {
    const normalizedKey = key.toLowerCase();
    const existing = merged[normalizedKey] ?? [];
    merged[normalizedKey] = uniqueTokens([...existing, ...value.map((x) => x.toLowerCase())]);
  }

  return merged;
}

function expandWithSynonyms(tokens: string[], synonyms: ToolSearchSynonyms): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const related = synonyms[token] ?? [];
    for (const synonym of related) expanded.add(synonym);
  }
  return [...expanded];
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function fuzzyTokenMatchScore(queryToken: string, toolToken: string): number {
  if (!queryToken || !toolToken) return 0;
  if (queryToken === toolToken) return 1;

  // Minimum length for prefix/contains matching to avoid false positives
  // e.g., "agenda".startsWith("a") or "calendar".includes("a")
  const minLenForSubstringMatch = 2;

  if (
    queryToken.length >= minLenForSubstringMatch &&
    toolToken.length >= minLenForSubstringMatch
  ) {
    if (toolToken.startsWith(queryToken) || queryToken.startsWith(toolToken)) return 0.75;
    if (toolToken.includes(queryToken) || queryToken.includes(toolToken)) return 0.6;
  }

  const distance = levenshteinDistance(queryToken, toolToken);
  const maxLen = Math.max(queryToken.length, toolToken.length);
  if (maxLen === 0) return 0;

  const similarity = 1 - distance / maxLen;
  return similarity >= 0.66 ? similarity * 0.7 : 0;
}

function bestTokenMatchScore(queryToken: string, toolTokens: string[]): number {
  let best = 0;
  for (const toolToken of toolTokens) {
    const score = fuzzyTokenMatchScore(queryToken, toolToken);
    if (score > best) best = score;
  }
  return best;
}

function computeBreakdown(
  context: ScoreContext,
  weights: ToolSearchWeights,
): ToolScoreBreakdown {
  const {
    queryTokens,
    expandedQueryTokens,
    toolNameTokens,
    toolDescriptionTokens,
    toolTagTokens,
    allToolTokens,
  } = context;

  if (queryTokens.length === 0) {
    return {
      nameMatch: 0,
      descriptionMatch: 0,
      tagMatch: 0,
      synonymMatch: 0,
      finalScore: 0,
    };
  }

  const nameMatch = queryTokens.reduce((sum, token) => sum + bestTokenMatchScore(token, toolNameTokens), 0) /
    queryTokens.length;
  const descriptionMatch = queryTokens.reduce(
    (sum, token) => sum + bestTokenMatchScore(token, toolDescriptionTokens),
    0,
  ) / queryTokens.length;
  const tagMatch = queryTokens.reduce((sum, token) => sum + bestTokenMatchScore(token, toolTagTokens), 0) /
    queryTokens.length;

  const synonymMatch = expandedQueryTokens.length > 0
    ? expandedQueryTokens.reduce((sum, token) => sum + bestTokenMatchScore(token, allToolTokens), 0) /
      expandedQueryTokens.length
    : 0;

  const raw =
    nameMatch * weights.nameMatch +
    descriptionMatch * weights.descriptionMatch +
    tagMatch * weights.tagMatch +
    synonymMatch * weights.synonymMatch;

  return {
    nameMatch,
    descriptionMatch,
    tagMatch,
    synonymMatch,
    finalScore: Math.min(1, Math.max(0, raw)),
  };
}

function buildDebug(context: ScoreContext): ToolSearchDebug {
  const toolTokenSet = new Set(context.allToolTokens);
  const matchedQueryTokens = context.queryTokens.filter((token) => toolTokenSet.has(token));
  const matchedExpandedTokens = context.expandedQueryTokens.filter((token) => toolTokenSet.has(token));

  const fuzzyMatches: Array<{ queryToken: string; toolToken: string; distance: number }> = [];
  for (const queryToken of context.queryTokens) {
    let bestToken = "";
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const toolToken of context.allToolTokens) {
      const distance = levenshteinDistance(queryToken, toolToken);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestToken = toolToken;
      }
    }

    if (bestToken && bestDistance > 0 && bestDistance <= 2) {
      fuzzyMatches.push({ queryToken, toolToken: bestToken, distance: bestDistance });
    }
  }

  return { matchedQueryTokens, matchedExpandedTokens, fuzzyMatches };
}

function cloneResults(results: ToolSearchResult[]): ToolSearchResult[] {
  return results.map((result) => ({
    ...result,
    debug: result.debug
      ? {
          matchedQueryTokens: [...result.debug.matchedQueryTokens],
          matchedExpandedTokens: [...result.debug.matchedExpandedTokens],
          fuzzyMatches: result.debug.fuzzyMatches.map((x) => ({ ...x })),
        }
      : undefined,
    scoreBreakdown: result.scoreBreakdown ? { ...result.scoreBreakdown } : undefined,
  }));
}

function buildToolsSignature(tools: ToolDefinition[]): string {
  return tools
    .map((tool) => `${tool.type}|${tool.name}|${tool.description}|${(tool.tags ?? []).join(",")}`)
    .join("||");
}

interface RuntimeConfig {
  synonyms: ToolSearchSynonyms;
  weights: ToolSearchWeights;
  cacheSize: number;
  useCacheByDefault: boolean;
}

interface RuntimeState {
  cache: Map<string, ToolSearchResult[]>;
  hits: number;
  misses: number;
}

function makeCacheKey(
  normalizedQuery: string,
  options: ToolSearchOptions,
  toolsSignature: string,
): string {
  return JSON.stringify({
    query: normalizedQuery,
    type: options.type ?? "all",
    limit: options.limit ?? DEFAULT_LIMIT,
    includeDebug: Boolean(options.includeDebug),
    includeScoreBreakdown: Boolean(options.includeScoreBreakdown),
    toolsSignature,
  });
}

function setCache(
  state: RuntimeState,
  runtime: RuntimeConfig,
  key: string,
  value: ToolSearchResult[],
): void {
  if (state.cache.has(key)) state.cache.delete(key);
  state.cache.set(key, cloneResults(value));

  if (state.cache.size > runtime.cacheSize) {
    const oldestKey = state.cache.keys().next().value;
    if (oldestKey) state.cache.delete(oldestKey);
  }
}

function runToolSearch(
  query: string,
  tools: ToolDefinition[],
  options: ToolSearchOptions,
  runtime: RuntimeConfig,
  state: RuntimeState,
): ToolSearchResult[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const queryTokens = uniqueTokens(tokenize(normalizedQuery));
  if (queryTokens.length === 0) return [];

  if (options.limit !== undefined && options.limit <= 0) return [];

  const normalizedLimit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? DEFAULT_LIMIT));
  const expandedQueryTokens = uniqueTokens(expandWithSynonyms(queryTokens, runtime.synonyms));

  const filtered = options.type && options.type !== "all"
    ? tools.filter((tool) => tool.type === options.type)
    : tools;

  const canUseCache = (options.useCache ?? runtime.useCacheByDefault) && !options.scorer;
  const key = canUseCache
    ? makeCacheKey(normalizedQuery, { ...options, limit: normalizedLimit }, buildToolsSignature(filtered))
    : "";

  if (canUseCache && state.cache.has(key)) {
    state.hits += 1;
    return cloneResults(state.cache.get(key) ?? []);
  }

  if (canUseCache) state.misses += 1;

  const includeScoreBreakdown = options.includeScoreBreakdown || options.includeDebug;

  const ranked = filtered
    .map((tool) => {
      const toolNameTokens = uniqueTokens(tokenize(tool.name));
      const toolDescriptionTokens = uniqueTokens(tokenize(tool.description));
      const toolTagTokens = uniqueTokens(tokenize((tool.tags ?? []).join(" ")));
      const allToolTokens = uniqueTokens([...toolNameTokens, ...toolDescriptionTokens, ...toolTagTokens]);

      const context: ScoreContext = {
        query: normalizedQuery,
        queryTokens,
        expandedQueryTokens,
        tool,
        toolNameTokens,
        toolDescriptionTokens,
        toolTagTokens,
        allToolTokens,
      };

      const breakdown = computeBreakdown(context, runtime.weights);
      const score = options.scorer ? options.scorer(context) : breakdown.finalScore;

      const result: ToolSearchResult = {
        tool,
        score,
      };

      if (includeScoreBreakdown) {
        result.scoreBreakdown = breakdown;
      }

      if (options.includeDebug) {
        result.debug = buildDebug(context);
      }

      return result;
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
    .slice(0, normalizedLimit);

  if (canUseCache) {
    setCache(state, runtime, key, ranked);
  }

  return ranked;
}

export function createToolSearchEngine(config: ToolSearchEngineConfig = {}): ToolSearchEngine {
  let tools = [...(config.tools ?? [])];
  let runtime: RuntimeConfig = {
    synonyms: mergeSynonyms(DEFAULT_SYNONYMS, config.synonyms),
    weights: normalizeWeights(config.weights),
    cacheSize: Math.max(1, config.cacheSize ?? DEFAULT_CACHE_SIZE),
    useCacheByDefault: config.useCacheByDefault ?? true,
  };

  const state: RuntimeState = {
    cache: new Map<string, ToolSearchResult[]>(),
    hits: 0,
    misses: 0,
  };

  const clearCache = () => {
    state.cache.clear();
    state.hits = 0;
    state.misses = 0;
  };

  return {
    search: (query: string, options: ToolSearchOptions = {}) =>
      runToolSearch(query, tools, options, runtime, state),
    getTools: () => [...tools],
    setTools: (nextTools: ToolDefinition[]) => {
      tools = [...nextTools];
      clearCache();
    },
    addTool: (tool: ToolDefinition) => {
      tools.push(tool);
      clearCache();
    },
    removeToolByName: (toolName: string) => {
      const before = tools.length;
      tools = tools.filter((tool) => tool.name !== toolName);
      const removed = tools.length !== before;
      if (removed) clearCache();
      return removed;
    },
    configure: (nextConfig: Omit<ToolSearchEngineConfig, "tools">) => {
      runtime = {
        synonyms: mergeSynonyms(DEFAULT_SYNONYMS, nextConfig.synonyms),
        weights: normalizeWeights(nextConfig.weights),
        cacheSize: Math.max(1, nextConfig.cacheSize ?? runtime.cacheSize),
        useCacheByDefault: nextConfig.useCacheByDefault ?? runtime.useCacheByDefault,
      };
      clearCache();
    },
    clearCache,
    getCacheStats: () => ({
      size: state.cache.size,
      hits: state.hits,
      misses: state.misses,
    }),
  };
}

const defaultEngine = createToolSearchEngine();
let defaultToolsSignature = "";

export function clearToolSearchCache(): void {
  defaultEngine.clearCache();
}

export function getToolSearchCacheStats(): ToolSearchCacheStats {
  return defaultEngine.getCacheStats();
}

export function toolSearch(
  query: string,
  tools: ToolDefinition[],
  options: ToolSearchOptions = {},
): ToolSearchResult[] {
  const signature = buildToolsSignature(tools);
  if (signature !== defaultToolsSignature) {
    defaultEngine.setTools(tools);
    defaultToolsSignature = signature;
  }

  return defaultEngine.search(query, options);
}

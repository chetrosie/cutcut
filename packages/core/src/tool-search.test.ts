import { describe, expect, it } from "bun:test";
import {
  clearToolSearchCache,
  createToolSearchEngine,
  getToolSearchCacheStats,
  toolSearch,
  type ToolDefinition,
} from "./tool-search";

const tools: ToolDefinition[] = [
  {
    name: "Read",
    description: "Read text from a workspace file",
    type: "builtin",
    tags: ["file", "io", "read"],
  },
  {
    name: "WebSearch",
    description: "Search the web and return top results",
    type: "builtin",
    tags: ["web", "search"],
  },
  {
    name: "CalendarEvents",
    description: "List and create calendar events",
    type: "plugin",
    tags: ["calendar", "events"],
  },
  {
    name: "McpCodebaseSearch",
    description: "Search code symbols in MCP server",
    type: "mcp",
    tags: ["code", "search", "symbols"],
  },
  {
    name: "Settings",
    description: "Configure app settings and preferences",
    type: "plugin",
    tags: ["config", "preferences"],
  },
];

describe("toolSearch", () => {
  it("returns ranked matches by query relevance", () => {
    const result = toolSearch("search web", tools, { type: "all" });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.tool.name).toBe("WebSearch");
  });

  it("filters by tool type", () => {
    const result = toolSearch("search", tools, { type: "mcp" });
    expect(result.every((item) => item.tool.type === "mcp")).toBe(true);
    expect(result[0]?.tool.name).toBe("McpCodebaseSearch");
  });

  it("respects the limit option", () => {
    const result = toolSearch("search", tools, { type: "all", limit: 1 });
    expect(result.length).toBe(1);
  });

  it("returns empty array for empty query", () => {
    expect(toolSearch("   ", tools).length).toBe(0);
  });

  it("returns empty array when limit is zero", () => {
    const result = toolSearch("search", tools, { limit: 0 });
    expect(result.length).toBe(0);
  });

  it("supports typo-tolerant matching", () => {
    const result = toolSearch("serach", tools, { type: "all" });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.tool.name).toBe("McpCodebaseSearch");
  });

  it("supports synonym expansion", () => {
    const result = toolSearch("config", tools, { type: "all" });
    expect(result.some((item) => item.tool.name === "Settings")).toBe(true);
  });

  it("allows custom scorer override", () => {
    const result = toolSearch("search", tools, {
      scorer: ({ tool }) => (tool.name === "CalendarEvents" ? 10 : 0),
      useCache: false,
    });

    expect(result[0]?.tool.name).toBe("CalendarEvents");
    expect(result[0]?.score).toBe(10);
  });

  it("returns score breakdown when enabled", () => {
    const result = toolSearch("search web", tools, {
      includeScoreBreakdown: true,
      useCache: false,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.scoreBreakdown).toBeDefined();
    expect(result[0]?.scoreBreakdown?.finalScore).toBeCloseTo(result[0]?.score ?? 0, 6);
  });

  it("returns debug details when enabled", () => {
    const result = toolSearch("serach web", tools, {
      includeDebug: true,
      useCache: false,
    });

    expect(result[0]?.debug).toBeDefined();
    expect(Array.isArray(result[0]?.debug?.fuzzyMatches)).toBe(true);
  });

  it("uses cache when enabled", () => {
    clearToolSearchCache();

    const first = toolSearch("search", tools, { useCache: true });
    const afterFirst = getToolSearchCacheStats();
    const second = toolSearch("search", tools, { useCache: true });
    const afterSecond = getToolSearchCacheStats();

    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    expect(afterFirst.misses).toBe(1);
    expect(afterSecond.hits).toBe(1);
  });

  it("does not use cache for custom scorer", () => {
    clearToolSearchCache();

    toolSearch("search", tools, {
      scorer: () => 1,
      useCache: true,
    });

    const stats = getToolSearchCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});

describe("createToolSearchEngine", () => {
  it("supports dynamic tool updates", () => {
    const engine = createToolSearchEngine({ tools: [tools[0]] });

    const before = engine.search("calendar");
    expect(before.length).toBe(0);

    engine.addTool(tools[2]);

    const after = engine.search("calendar");
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]?.tool.name).toBe("CalendarEvents");
  });

  it("supports replacing tool registry", () => {
    const engine = createToolSearchEngine({ tools: [tools[0], tools[1]] });
    const before = engine.search("web");
    expect(before[0]?.tool.name).toBe("WebSearch");

    engine.setTools([tools[2]]);

    const after = engine.search("web");
    expect(after.length).toBe(0);
  });

  it("supports config overrides for synonyms", () => {
    const engine = createToolSearchEngine({
      tools,
      synonyms: {
        browsing: ["web"],
      },
    });

    const result = engine.search("browsing");
    expect(result.some((item) => item.tool.name === "WebSearch")).toBe(true);
  });

  it("supports config overrides for weights", () => {
    const engine = createToolSearchEngine({
      tools,
      weights: {
        nameMatch: 1,
        descriptionMatch: 0,
        tagMatch: 0,
        synonymMatch: 0,
      },
    });

    const result = engine.search("search");
    expect(result[0]?.tool.name).toBe("McpCodebaseSearch");
  });

  it("keeps cache isolated per engine instance", () => {
    const engineA = createToolSearchEngine({ tools, useCacheByDefault: true });
    const engineB = createToolSearchEngine({ tools, useCacheByDefault: true });

    engineA.search("search");
    engineA.search("search");

    const aStats = engineA.getCacheStats();
    const bStats = engineB.getCacheStats();

    expect(aStats.hits).toBe(1);
    expect(bStats.hits).toBe(0);
    expect(bStats.misses).toBe(0);
  });

  it("clears cache when tools change", () => {
    const engine = createToolSearchEngine({ tools, useCacheByDefault: true });

    engine.search("search");
    engine.search("search");
    expect(engine.getCacheStats().hits).toBe(1);

    engine.removeToolByName("WebSearch");
    const statsAfterMutation = engine.getCacheStats();

    expect(statsAfterMutation.hits).toBe(0);
    expect(statsAfterMutation.misses).toBe(0);
  });
});

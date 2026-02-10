import {
  clearToolSearchCache,
  getToolSearchCacheStats,
  toolSearch,
  type ToolDefinition,
} from "../src/tool-search";

const tools: ToolDefinition[] = [
  { name: "Read", description: "Read text from files", type: "builtin", tags: ["file", "io"] },
  { name: "Write", description: "Write text to files", type: "builtin", tags: ["file", "io"] },
  { name: "WebSearch", description: "Search on the web", type: "builtin", tags: ["web", "search"] },
  { name: "CodeSearch", description: "Search source code symbols", type: "mcp", tags: ["code", "search"] },
  { name: "CalendarEvents", description: "Manage calendar events", type: "plugin", tags: ["calendar"] },
  { name: "Settings", description: "Manage app settings and config", type: "plugin", tags: ["config"] },
];

const queries = [
  "search web",
  "serach web",
  "find code",
  "config",
  "calendar schedule",
  "read file",
  "write file",
];

function runBenchmark(
  label: string,
  iterations: number,
  runner: () => void,
): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) runner();
  const end = performance.now();
  const duration = end - start;
  console.log(`${label}: ${duration.toFixed(2)}ms total (${(duration / iterations).toFixed(4)}ms/op)`);
  return duration;
}

function main() {
  const iterations = 3000;

  console.log("ToolSearch benchmark");
  console.log(`Tools: ${tools.length}, Queries: ${queries.length}, Iterations per mode: ${iterations}`);
  console.log("---");

  clearToolSearchCache();
  runBenchmark("No cache", iterations, () => {
    const query = queries[Math.floor(Math.random() * queries.length)];
    toolSearch(query, tools, { useCache: false, includeScoreBreakdown: false });
  });

  clearToolSearchCache();
  runBenchmark("With cache warmup", iterations, () => {
    const query = queries[Math.floor(Math.random() * queries.length)];
    toolSearch(query, tools, { useCache: true, includeScoreBreakdown: false });
  });
  const warmupStats = getToolSearchCacheStats();
  console.log(`Cache after warmup -> size=${warmupStats.size}, hits=${warmupStats.hits}, misses=${warmupStats.misses}`);

  runBenchmark("With cache (debug+breakdown)", iterations, () => {
    const query = queries[Math.floor(Math.random() * queries.length)];
    toolSearch(query, tools, {
      useCache: true,
      includeDebug: true,
      includeScoreBreakdown: true,
    });
  });
  const finalStats = getToolSearchCacheStats();
  console.log(`Cache final -> size=${finalStats.size}, hits=${finalStats.hits}, misses=${finalStats.misses}`);
}

main();

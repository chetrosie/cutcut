# CutCut

一个现代化的媒体处理平台，包含工具搜索引擎和媒体处理工作器。

## 项目结构

```
cutcut/
├── packages/
│   └── core/                 # 核心工具库
│       ├── src/
│       │   ├── tool-search.ts      # 工具搜索引擎
│       │   └── tool-search.test.ts # 测试文件
│       └── scripts/
│           └── tool-search-bench.ts # 性能基准测试
├── services/
│   └── media-worker/         # 媒体处理工作器
│       └── src/
│           └── worker.ts          # 异步任务处理
├── infra/
│   ├── vps/                  # VPS 部署配置
│   │   └── docker-compose.yml
│   ├── cloudflare/           # Cloudflare 部署配置
│   └── github/               # GitHub Actions 工作流
│       └── workflows/
│           └── ci.yml
└── .github/
    └── workflows/
        ├── deploy-vps.yml    # VPS 自动部署
        └── deploy-cloudflare.yml
```

## 核心模块

### Tool Search Engine (`packages/core`)

一个高性能、可配置的工具搜索引擎，支持：

- **模糊匹配** - 容忍拼写错误，基于 Levenshtein 距离
- **同义词扩展** - 自动扩展查询词以发现更多相关工具
- **可配置权重** - 自定义名称、描述、标签、同义词的匹配权重
- **类型过滤** - 支持 `builtin`、`mcp`、`plugin` 类型过滤
- **结果缓存** - LRU 缓存提升重复查询性能
- **调试模式** - 返回详细的匹配过程信息

#### 使用示例

```typescript
import { toolSearch, createToolSearchEngine } from "@cutcut/core";

const tools = [
  { name: "WebSearch", description: "Search the web", type: "builtin", tags: ["web", "search"] },
  { name: "Calendar", description: "Manage events", type: "plugin", tags: ["calendar", "events"] },
];

// 简单搜索
const results = toolSearch("search web", tools);
// => [{ tool: WebSearch, score: 0.85 }]

// 使用搜索引擎实例
const engine = createToolSearchEngine({
  tools,
  weights: { nameMatch: 0.5, descriptionMatch: 0.3, tagMatch: 0.1, synonymMatch: 0.1 },
  synonyms: { browsing: ["web"] },
});

const webResults = engine.search("browsing");
```

### Media Worker (`services/media-worker`)

异步媒体处理工作器，负责：

- 从队列接收媒体处理任务
- 下载、转码媒体文件
- 向主服务报告处理进度

## 快速开始

### 环境要求

- [Bun](https://bun.sh/) >= 1.0
- Docker (用于生产部署)

### 本地开发

```bash
# 安装依赖
bun install

# 运行测试
bun test

# 运行工具搜索性能基准测试
bun run bench:tool-search
```

## 部署

### VPS 部署

项目使用 GitHub Actions 自动构建并部署到 VPS。

#### 前置条件

1. VPS 服务器已安装 Docker 和 Docker Compose
2. GitHub Repository 配置了以下 Secrets：

| Secret | 说明 |
|--------|------|
| `VPS_HOST` | VPS 服务器地址 |
| `VPS_USER` | SSH 用户名 |
| `VPS_SSH_KEY` | SSH 私钥 |

#### 部署流程

推送到 `main` 分支会自动触发：

1. 构建 Docker 镜像
2. 推送到 GitHub Container Registry (`ghcr.io`)
3. SSH 到 VPS 拉取新镜像并重启服务

#### 手动部署

```bash
# 在 VPS 上
cd /opt/cutcut
docker compose pull
docker compose up -d
```

### Cloudflare 部署

配置文件位于 `infra/cloudflare/`，支持部署到 Cloudflare Workers。

## 技术栈

- **运行时**: [Bun](https://bun.sh/)
- **语言**: TypeScript
- **测试**: Bun Test
- **容器化**: Docker
- **CI/CD**: GitHub Actions
- **镜像仓库**: GitHub Container Registry

## 开发

```bash
# 运行测试
bun test

# 监听模式
bun test --watch

# 运行特定测试文件
bun test packages/core/src/tool-search.test.ts
```

## License

MIT

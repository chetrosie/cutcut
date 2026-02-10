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

项目使用 GitHub Actions 自动构建 Docker 镜像并部署到 VPS。

#### 步骤 1: 准备 VPS 服务器

```bash
# 1. 安装 Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. 安装 Docker Compose
sudo apt install docker-compose-plugin

# 3. 创建项目目录
sudo mkdir -p /opt/cutcut
sudo chown $USER:$USER /opt/cutcut

# 4. 克隆仓库
cd /opt
git clone https://github.com/chetrosie/cutcut.git cutcut
cd cutcut
```

#### 步骤 2: 配置环境变量

在 VPS 的 `/opt/cutcut/infra/vps/` 目录创建 `.env` 文件：

```bash
# /opt/cutcut/infra/vps/.env

# API 配置
API_BASE_URL=https://your-api-server.com
API_INTERNAL_TOKEN=your-internal-token

# Redis 配置 (可选，使用默认配置即可)
REDIS_URL=redis://redis:6379
```

#### 步骤 3: 配置 GitHub Secrets

进入 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**，添加以下 Secrets：

| Secret 名称 | 说明 | 示例 |
|-------------|------|------|
| `VPS_HOST` | VPS 服务器 IP 或域名 | `192.168.1.100` 或 `vps.example.com` |
| `VPS_USER` | SSH 登录用户名 | `ubuntu` 或 `root` |
| `VPS_SSH_KEY` | SSH 私钥 | 见下方说明 |

**生成 SSH 密钥用于 GitHub Actions：**

```bash
# 在本地生成专用密钥
ssh-keygen -t ed25519 -C "github-actions@cutcut" -f ~/.ssh/cutcut_deploy

# 将公钥添加到 VPS
ssh-copy-id -i ~/.ssh/cutcut_deploy.pub user@your-vps

# 测试连接
ssh -i ~/.ssh/cutcut_deploy user@your-vps

# 复制私钥内容，粘贴到 GitHub Secret
cat ~/.ssh/cutcut_deploy
```

#### 步骤 4: 首次部署

```bash
# 在 VPS 上手动拉取镜像并启动
cd /opt/cutcut/infra/vps

# 登录 GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u chetrosie --password-stdin

# 拉取并启动
docker compose pull
docker compose up -d

# 查看日志
docker compose logs -f media-worker
```

#### 步骤 5: 自动部署

配置完成后，每次推送到 `main` 分支会自动触发：

```
GitHub Actions 自动执行：
1. 检出代码
2. 构建 Docker 镜像
3. 推送到 ghcr.io/chetrosie/cutcut-media-worker:latest
4. SSH 到 VPS 执行 docker compose pull && docker compose up -d
```

#### 常用运维命令

```bash
# 查看服务状态
docker compose ps

# 查看实时日志
docker compose logs -f media-worker

# 重启服务
docker compose restart media-worker

# 停止所有服务
docker compose down

# 更新并重启
docker compose pull && docker compose up -d
```

---

### Cloudflare 部署

支持部署到 Cloudflare Workers/Pages，提供两种部署方式：

#### 方式 A: 使用 Cloudflare Dashboard (网页版)

适合不熟悉命令行的用户，通过浏览器完成所有配置。

##### 1. 创建 D1 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 左侧菜单选择 **Workers & Pages** → **D1 SQL Database**
3. 点击 **Create database**
4. 名称输入 `cutcut-db`
5. 点击 **Create**
6. 创建完成后，记录 **Database ID**（格式类似 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）

##### 2. 创建 R2 存储桶

1. 左侧菜单选择 **R2 Object Storage**
2. 点击 **Create bucket**
3. Bucket name 输入 `cutcut-media`
4. 选择 **Locational** 类型
5. 点击 **Create bucket**

##### 3. 创建 Queue 队列

1. 左侧菜单选择 **Workers & Pages** → **Queues**
2. 点击 **Create queue**
3. Queue name 输入 `cutcut-task-queue`
4. 点击 **Create queue**

##### 4. 创建 Worker

1. 左侧菜单选择 **Workers & Pages**
2. 点击 **Create application**
3. 选择 **Create Worker**
4. 名称输入 `cutcut-edge`
5. 点击 **Deploy**
6. 部署完成后点击 **Edit code**

##### 5. 上传代码

在代码编辑器中：

1. 删除默认代码
2. 将本项目构建后的 `.open-next/worker.js` 内容粘贴进去
3. 点击 **Deploy**

##### 6. 绑定资源

回到 Worker 设置页面：

1. 点击 **Settings** → **Bindings**
2. 添加以下绑定：

| 绑定类型 | Variable name | 值 |
|---------|---------------|-----|
| D1 Database | `DB` | 选择 `cutcut-db` |
| R2 Bucket | `MEDIA_BUCKET` | 选择 `cutcut-media` |
| Queue | `TASK_QUEUE` | 选择 `cutcut-task-queue` |

##### 7. 配置自定义域名 (可选)

1. 点击 **Settings** → **Triggers**
2. 点击 **Add Custom Domain**
3. 输入你的域名（如 `api.yourdomain.com`）
4. 点击 **Add Custom Domain**

---

#### 方式 B: 使用 Wrangler CLI

适合开发者和自动化部署场景。

##### 1. 安装 Wrangler

```bash
npm install -g wrangler
# 或
bun install -g wrangler
```

##### 2. 登录 Cloudflare

```bash
wrangler login
```

##### 3. 创建 Cloudflare 资源

```bash
# 创建 D1 数据库
wrangler d1 create cutcut-db
# 记录返回的 database_id

# 创建 R2 存储桶
wrangler r2 bucket create cutcut-media

# 创建队列
wrangler queues create cutcut-task-queue
```

##### 4. 更新配置

编辑 `infra/cloudflare/wrangler.toml`，替换 `database_id`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "cutcut-db"
database_id = "你的实际数据库ID"  # 从步骤 3 获取
```

##### 5. 部署

```bash
cd infra/cloudflare

# 本地开发
wrangler dev

# 部署到生产环境
wrangler deploy
```

##### 6. 配置自定义域名 (可选)

```bash
# 添加自定义域名
wrangler domains add your-domain.com

# 或在 Cloudflare Dashboard 中配置
```

---

### 常见问题

#### Docker 镜像拉取失败

```bash
# 检查是否已登录 GHCR
docker login ghcr.io -u chetrosie

# 检查镜像是否存在
docker pull ghcr.io/chetrosie/cutcut-media-worker:latest
```

#### GitHub Actions 部署失败

1. 检查 Secrets 是否正确配置
2. 检查 SSH 密钥是否有服务器访问权限
3. 查看 Actions 日志定位具体错误

#### VPS 服务无法启动

```bash
# 检查环境变量
cat /opt/cutcut/infra/vps/.env

# 检查端口占用
sudo lsof -i :6379

# 检查 Docker 网络
docker network ls
```

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

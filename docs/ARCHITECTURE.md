# SivitaHub MVP 架构

```text
Browser
  ├── GET /api/wheels
  ├── POST /api/import/preview
  └── GET /api/github/connect
           │
Node.js 22 HTTP Server
  ├── Static UI
  ├── Catalog service
  ├── GitHub URL validator
  ├── GitHub read client
  ├── Deterministic wheel manifest generator
  └── Optional GitHub App installation session
           │
           └── GitHub REST API
```

## 为什么第一版零第三方依赖

这是产品验证策略，不是最终技术栈承诺：可以在没有包管理网络的环境中完成测试，先验证 API 边界、GitHub 权限和清单标准，后续迁移框架时保留领域模块。

## 安全边界

- 服务端只根据严格解析的 `github.com/owner/repo` 构造 `api.github.com` 请求，避免 SSRF。
- README、描述、Topics 和源码文件都视为未信任输入，前端只通过 `textContent` 渲染。
- 公共仓库可匿名读取；私有仓库使用 GitHub App installation token；令牌不下发浏览器。
- 导入流程不执行 `npm install`、`pip install`、Dockerfile、构建脚本或 GitHub Actions。

## 当前持久化

精选轮子来自 `data/wheels.json`。GitHub App 会话只保存在进程内存中。生产阶段将迁移到 PostgreSQL，并增加仓库快照、轮子版本、产品、谱系边、构建结果、许可证和安全发现。

# SivitaHub

SivitaHub 是一个建立在 GitHub 之上的「开源轮子注册表与二创网络」。它不重新托管代码，也不替代 GitHub；它负责把仓库转换成可发现、可理解、可比较、可二创的结构化轮子。

当前仓库包含第一版可运行 MVP：

- 轮子目录、分类、搜索与详情；
- 粘贴 GitHub 仓库地址后读取元数据、README、许可证和常见依赖清单；
- 自动检测技术栈、能力标签、扩展点；
- 生成机器可读的 `wheel-v1` 清单与 YAML 预览；
- 预留 GitHub App 一键安装流程，平台只申请仓库只读权限；
- 全部运行代码零第三方依赖，便于先验证产品闭环。

## 本地运行

要求 Node.js 22 或更新版本。

```bash
cp .env.example .env
npm start
```

打开 `http://localhost:3000`。

开发模式：

```bash
npm run dev
```

测试与静态检查：

```bash
npm test
npm run check
```

## 核心原则

1. **GitHub 是代码事实源**：SivitaHub 不管理 Git 历史，也不保存用户源码副本。
2. **平台只保存结构化元数据**：轮子说明、版本快照、兼容关系、二创谱系和验证结果。
3. **默认只读**：连接私有仓库时使用 GitHub App，最低权限为 Metadata read + Contents read。
4. **AI 结论必须分级**：自动推断与维护者确认分开显示，不能冒充项目作者声明。
5. **许可证先于二创**：无许可证或自定义许可证项目不得默认开放一键二创。

## 目录

```text
public/                  无构建步骤的 Web 前端
src/                     API、GitHub 读取、清单生成和连接逻辑
data/wheels.json         第一批精选轮子种子数据
schemas/wheel-v1.schema.json
                         轮子清单 JSON Schema
tests/                   Node 内置测试
docs/                    产品、架构、GitHub App 和路线图
.github/workflows/ci.yml  GitHub Actions 门禁
```

## GitHub App

公共仓库导入无需登录。私有仓库的一键连接需要创建 GitHub App，并设置：

- Repository permissions → Metadata: Read-only
- Repository permissions → Contents: Read-only
- Setup URL → `https://你的域名/api/github/callback`
- Request user authorization during installation → 关闭（MVP 不需要用户 OAuth Token）

完整步骤见 [`docs/GITHUB_APP_SETUP.md`](docs/GITHUB_APP_SETUP.md)。

## 当前边界

- 当前目录数据来自仓库内的精选 JSON；尚未接 PostgreSQL。
- GitHub App 会话保存在进程内存，服务器重启后需重新连接。
- 当前清单分析是确定性规则，不调用 LLM。
- 不执行导入仓库中的任何脚本，避免供应链和沙箱风险。
- 尚未选择开源许可证；公开仓库不等于已授权复用。

## 下一步

下一阶段会加入 PostgreSQL、维护者认领、版本快照、二创成品谱系和 AI 辅助说明生成。具体见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

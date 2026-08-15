# GitHub App 一键只读连接

SivitaHub 不要求用户提交 PAT。私有仓库读取通过 GitHub App installation 完成。

## 创建 GitHub App

在 GitHub：`Settings → Developer settings → GitHub Apps → New GitHub App`

建议填写：

- GitHub App name：`SivitaHub Dev`
- Homepage URL：`http://localhost:3000`
- Setup URL：`http://localhost:3000/api/github/callback`
- Redirect on update：开启
- Webhook：MVP 可以先关闭

## 最小权限

Repository permissions：

- Metadata：Read-only
- Contents：Read-only

不要申请 Administration、Actions write、Issues write、Pull requests write、Workflows write 或 Secrets。

允许用户选择 `Only select repositories`，不要强迫授权全部仓库。

## 环境变量

```dotenv
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=sivitahub-dev
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
SESSION_SECRET=至少32位随机字符串
PUBLIC_BASE_URL=http://localhost:3000
```

## 流程

```text
点击“连接 GitHub”
→ GitHub App 安装页
→ 用户选择仓库
→ GitHub 回调 /api/github/callback
→ 服务器验证签名 state
→ 验证 installation 可签发 token
→ 浏览器只保存 HttpOnly session id
→ 后续导入使用短期 installation token
```

当前会话保存在进程内存中，生产环境应改为 Redis 或数据库。

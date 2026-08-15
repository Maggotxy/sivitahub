# SivitaHub 产品定义

## 一句话定位

SivitaHub 是面向 AI 开发时代的开源构件注册表与二创网络：用户从 GitHub 找到可复用轮子，理解它的边界和许可证，组合成自己的产品，并保留完整来源谱系。

## 平台对象

- **Repository**：GitHub 上的源码容器。Repository 不是轮子，只是来源。
- **Wheel**：可以被独立理解和复用的构件。一个仓库可以包含多个 Wheel。
- **Recipe**：描述如何安装、配置、替换或组合 Wheel 的方案。
- **Product**：基于一个或多个 Wheel 做出的真实成品，可以公开或私有。
- **Lineage Edge**：记录 `FORK_OF`、`TEMPLATE_FROM`、`REMIX_OF`、`COMPOSED_FROM`、`PORT_OF`、`PATCHED_WITH`、`INSPIRED_BY`。

## MVP 用户路径

1. 用户搜索分类或能力关键词。
2. 用户打开精选轮子，查看来源、技术栈和适用场景。
3. 用户粘贴 GitHub 仓库地址。
4. SivitaHub 只读获取仓库元数据、README、许可证和依赖清单。
5. 系统生成事实快照、推断标签和 `wheel-v1` 清单。
6. 后续版本允许维护者认领、修正并发布轮子页面。
7. 用户基于轮子创建自己的 GitHub 项目，并将二创成品回填到谱系图。

## 非目标

- 不做代码托管或 GitHub 镜像；
- 不在 API 主进程执行第三方仓库代码；
- 不把 AI 推断冒充维护者声明；
- 不要求用户提交 Personal Access Token。

## 第一阶段成功指标

- 导入预览成功率；
- 维护者确认率；
- 从轮子页进入 GitHub 的比例；
- 有真实成品关联的轮子数量；
- 组合后构建成功率；
- 许可证明确的轮子占比。

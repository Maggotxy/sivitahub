const state = {
  query: "",
  category: "all",
  wheels: [],
  categories: [],
  meta: null,
  github: { configured: false, connected: false, repositories: [] },
  manifestYaml: "",
};

const elements = {};
let searchTimer = null;

function byId(id) {
  return document.getElementById(id);
}

function createElement(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text != null) node.textContent = String(options.text);
  if (options.href) node.href = options.href;
  if (options.target) node.target = options.target;
  if (options.rel) node.rel = options.rel;
  if (options.type) node.type = options.type;
  if (options.title) node.title = options.title;
  if (options.src) node.src = options.src;
  if (options.alt != null) node.alt = options.alt;
  for (const [name, value] of Object.entries(options.dataset || {})) node.dataset[name] = value;
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function safeGitHubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" ? url.href : "#";
  } catch {
    return "#";
  }
}

function safeAvatarUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "avatars.githubusercontent.com" ? url.href : "";
  } catch {
    return "";
  }
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 15_000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `请求失败（${response.status}）`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("请求超时，请稍后重试。");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function toast(message, tone = "default") {
  const item = createElement("div", { className: `toast toast-${tone}` }, [
    createElement("span", { className: "toast-icon", text: tone === "error" ? "!" : "✓" }),
    createElement("span", { text: message }),
  ]);
  elements.toastRegion.append(item);
  window.setTimeout(() => item.classList.add("toast-leave"), 3200);
  window.setTimeout(() => item.remove(), 3650);
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { notation: Number(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "未知";
  try { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)); }
  catch { return String(value); }
}

async function loadMeta() {
  state.meta = await api("/api/meta");
  elements.metricWheels.textContent = String(state.meta.stats.wheels);
  elements.metricCategories.textContent = String(state.meta.stats.categories);
}

async function loadCategories() {
  const payload = await api("/api/categories");
  state.categories = payload.categories || [];
  renderCategories();
}

async function loadGithubSession() {
  state.github = await api("/api/github/session");
  renderGithubStatus();
}

function renderGithubStatus() {
  const { configured, connected, repositories = [] } = state.github;
  elements.githubStatus.classList.toggle("is-connected", connected);
  if (connected) {
    elements.githubStatus.textContent = `${repositories.length} 个仓库已授权`;
    elements.connectGithubButton.textContent = "断开 GitHub";
    elements.importAuthNote.textContent = `已通过 GitHub App 连接，可读取你选择的 ${repositories.length} 个仓库。`;
  } else if (configured) {
    elements.githubStatus.textContent = "GitHub App 可连接";
    elements.connectGithubButton.textContent = "连接 GitHub";
    elements.importAuthNote.textContent = "公共仓库可直接解析；连接 GitHub 后可读取你选择的私有仓库。";
  } else {
    elements.githubStatus.textContent = "只读公共仓库";
    elements.connectGithubButton.textContent = "配置 GitHub App";
    elements.importAuthNote.textContent = "当前使用 GitHub 公共 API；按文档配置 GitHub App 后可一键读取私有仓库。";
  }
}

async function handleGithubButton() {
  if (state.github.connected) {
    elements.connectGithubButton.disabled = true;
    try {
      await api("/api/github/logout", { method: "POST", body: "{}" });
      await loadGithubSession();
      toast("已断开本次 GitHub 会话。");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      elements.connectGithubButton.disabled = false;
    }
    return;
  }
  if (!state.github.configured) {
    toast("先按 docs/GITHUB_APP_SETUP.md 配置 GitHub App。", "error");
    return;
  }
  window.location.assign("/api/github/connect");
}

function renderCategories() {
  elements.categoryList.replaceChildren();
  const allButton = createElement("button", { className: "category-button", text: "全部", type: "button", dataset: { category: "all" } });
  allButton.classList.toggle("is-active", state.category === "all");
  elements.categoryList.append(allButton);
  for (const category of state.categories) {
    const button = createElement("button", { className: "category-button", type: "button", dataset: { category: category.name } }, [
      createElement("span", { text: category.name }),
      createElement("small", { text: category.count }),
    ]);
    button.classList.toggle("is-active", state.category === category.name);
    elements.categoryList.append(button);
  }
}

async function loadWheels() {
  elements.resultsCount.textContent = "正在载入轮子…";
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.category !== "all") params.set("category", state.category);
  try {
    const payload = await api(`/api/wheels?${params.toString()}`);
    state.wheels = payload.wheels || [];
    renderWheels();
  } catch (error) {
    elements.resultsCount.textContent = "轮子载入失败";
    elements.wheelGrid.replaceChildren();
    toast(error.message, "error");
  }
}

function wheelCard(wheel, index) {
  const stack = createElement("div", { className: "tag-row" }, (wheel.stack || []).slice(0, 3).map((item) => createElement("span", { text: item })));
  const openButton = createElement("button", { className: "text-button", type: "button", text: "查看复用说明 →", dataset: { wheel: wheel.slug } });
  const sourceLink = createElement("a", { className: "source-link", href: safeGitHubUrl(wheel.sourceUrl), target: "_blank", rel: "noreferrer", text: wheel.repository });
  if (sourceLink.href.endsWith("/#")) sourceLink.removeAttribute("href");
  return createElement("article", { className: `wheel-card-item${wheel.featured ? " is-featured" : ""}` }, [
    createElement("div", { className: "wheel-card-top" }, [
      createElement("span", { className: "wheel-index", text: String(index + 1).padStart(2, "0") }),
      createElement("span", { className: "wheel-kind", text: wheel.kind }),
    ]),
    createElement("div", { className: "wheel-title-row" }, [
      createElement("div", { className: "mini-wheel", text: "✦" }),
      createElement("div", {}, [createElement("h3", { text: wheel.name }), sourceLink]),
    ]),
    createElement("p", { className: "wheel-summary", text: wheel.summary }),
    stack,
    createElement("div", { className: "wheel-card-footer" }, [
      createElement("span", { text: wheel.category }),
      openButton,
    ]),
  ]);
}

function renderWheels() {
  elements.wheelGrid.replaceChildren(...state.wheels.map(wheelCard));
  elements.resultsCount.textContent = `${state.wheels.length} 个匹配轮子`;
  elements.emptyState.hidden = state.wheels.length > 0;
  elements.wheelGrid.hidden = state.wheels.length === 0;
}

async function openWheel(slug) {
  try {
    const { wheel } = await api(`/api/wheels/${encodeURIComponent(slug)}`);
    const capabilities = createElement("div", { className: "dialog-tags" }, (wheel.capabilities || []).map((item) => createElement("span", { text: item })));
    const stack = createElement("div", { className: "dialog-stack" }, (wheel.stack || []).map((item) => createElement("span", { text: item })));
    const source = createElement("a", { className: "button button-dark", href: safeGitHubUrl(wheel.sourceUrl), target: "_blank", rel: "noreferrer", text: "打开 GitHub ↗" });
    elements.dialogContent.replaceChildren(
      createElement("p", { className: "eyebrow", text: `${wheel.category} / ${wheel.kind}` }),
      createElement("h2", { text: wheel.name }),
      createElement("p", { className: "dialog-summary", text: wheel.summary }),
      createElement("h3", { text: "可复用能力" }),
      capabilities,
      createElement("h3", { text: "技术栈" }),
      stack,
      createElement("div", { className: "dialog-note" }, [
        createElement("strong", { text: "当前状态：精选种子" }),
        createElement("p", { text: "许可证、构建状态和扩展点将在真实导入后重新检测；这里的描述不冒充项目维护者声明。" }),
      ]),
      source,
    );
    elements.wheelDialog.showModal();
  } catch (error) {
    toast(error.message, "error");
  }
}

function fact(label, value) {
  return createElement("div", { className: "fact" }, [createElement("span", { text: label }), createElement("strong", { text: value || "未知" })]);
}

function renderTokenList(title, values, emptyText) {
  return createElement("div", { className: "result-group" }, [
    createElement("h4", { text: title }),
    values?.length
      ? createElement("div", { className: "result-tokens" }, values.map((value) => createElement("span", { text: value })))
      : createElement("p", { className: "result-empty", text: emptyText }),
  ]);
}

function renderImportResult(payload) {
  const { snapshot, manifest, manifestYaml, authentication } = payload;
  state.manifestYaml = manifestYaml;
  const repository = snapshot.repository;
  const avatar = safeAvatarUrl(repository.owner?.avatarUrl);
  const titleChildren = [];
  if (avatar) titleChildren.push(createElement("img", { src: avatar, alt: "" }));
  titleChildren.push(createElement("div", {}, [
    createElement("small", { text: "GITHUB SNAPSHOT" }),
    createElement("h3", { text: repository.fullName }),
    createElement("a", { href: safeGitHubUrl(repository.url), target: "_blank", rel: "noreferrer", text: "查看源仓库 ↗" }),
  ]));
  const header = createElement("div", { className: "result-header" }, [
    createElement("div", { className: "result-title" }, titleChildren),
    createElement("span", { className: `license-badge${repository.license ? "" : " needs-review"}`, text: repository.license || "许可证待确认" }),
  ]);
  const copyButton = createElement("button", { className: "button button-ghost button-small", type: "button", text: "复制 YAML" });
  copyButton.addEventListener("click", copyManifest);
  const manifestBlock = createElement("div", { className: "manifest-output" }, [
    createElement("div", { className: "manifest-output-head" }, [createElement("span", { text: "wheel.yaml · 自动生成" }), copyButton]),
    createElement("pre", { text: manifestYaml }),
  ]);
  elements.importResult.replaceChildren(
    header,
    createElement("p", { className: "result-description", text: repository.description || snapshot.readme.excerpt || "仓库没有提供简介。" }),
    createElement("div", { className: "facts-grid" }, [
      fact("默认分支", repository.defaultBranch),
      fact("主要语言", repository.language || "待检测"),
      fact("Stars", formatNumber(repository.stars)),
      fact("最近推送", formatDate(repository.pushedAt)),
      fact("可见性", repository.visibility),
      fact("读取方式", authentication === "github-app-installation" ? "GitHub App" : authentication === "server-token" ? "服务端令牌" : "匿名 API"),
    ]),
    renderTokenList("检测到的技术栈", snapshot.stack, "暂未从根目录清单识别技术栈。"),
    renderTokenList("推断能力", snapshot.capabilities, "暂未检测到明确能力标签。"),
    renderTokenList("可扩展目录", snapshot.extensionPoints, "未发现常见扩展目录，后续需要更深层分析。"),
    createElement("div", { className: "result-warning" }, [
      createElement("strong", { text: manifest.license.status === "detected" ? "许可证已由 GitHub API 检测" : "许可证需要人工复核" }),
      createElement("p", { text: "自动清单只提供工程方向，不代表法律意见；在复制、修改或商用前仍需核对仓库中的完整许可证文本。" }),
    ]),
    manifestBlock,
  );
  elements.importResult.hidden = false;
  elements.importResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function copyManifest() {
  try {
    await navigator.clipboard.writeText(state.manifestYaml);
    toast("wheel.yaml 已复制。");
  } catch {
    const area = document.createElement("textarea");
    area.value = state.manifestYaml;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    toast("wheel.yaml 已复制。");
  }
}

async function handleImport(event) {
  event.preventDefault();
  const repository = elements.repositoryInput.value.trim();
  if (!repository) return;
  elements.importButton.disabled = true;
  elements.importButton.textContent = "正在解析…";
  elements.importResult.hidden = true;
  try {
    const payload = await api("/api/import/preview", {
      method: "POST",
      body: JSON.stringify({ repository }),
      timeoutMs: 25_000,
    });
    renderImportResult(payload);
    toast("仓库快照和 wheel 清单已生成。");
  } catch (error) {
    toast(error.message, "error");
    elements.importResult.hidden = false;
    elements.importResult.replaceChildren(createElement("div", { className: "import-error" }, [
      createElement("strong", { text: "无法完成导入预览" }),
      createElement("p", { text: error.message }),
    ]));
  } finally {
    elements.importButton.disabled = false;
    elements.importButton.textContent = "开始解析";
  }
}

function updateSearch(value, { scroll = false } = {}) {
  state.query = value.trim();
  elements.heroSearchInput.value = value;
  elements.catalogSearchInput.value = value;
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadWheels, 180);
  if (scroll) document.querySelector("#catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindEvents() {
  elements.heroSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updateSearch(elements.heroSearchInput.value, { scroll: true });
  });
  elements.catalogSearchInput.addEventListener("input", () => updateSearch(elements.catalogSearchInput.value));
  elements.categoryList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    renderCategories();
    loadWheels();
  });
  elements.wheelGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-wheel]");
    if (button) openWheel(button.dataset.wheel);
  });
  elements.importForm.addEventListener("submit", handleImport);
  elements.connectGithubButton.addEventListener("click", handleGithubButton);
  elements.dialogCloseButton.addEventListener("click", () => elements.wheelDialog.close());
  elements.wheelDialog.addEventListener("click", (event) => {
    if (event.target === elements.wheelDialog) elements.wheelDialog.close();
  });
}

async function init() {
  for (const id of [
    "githubStatus", "connectGithubButton", "metricWheels", "metricCategories", "categoryList",
    "catalogSearchInput", "resultsCount", "wheelGrid", "emptyState", "heroSearchForm", "heroSearchInput",
    "importForm", "repositoryInput", "importButton", "importAuthNote", "importResult", "wheelDialog",
    "dialogContent", "dialogCloseButton", "toastRegion",
  ]) elements[id] = byId(id);
  bindEvents();
  const query = new URLSearchParams(window.location.search);
  if (query.get("github") === "connected") {
    toast("GitHub App 安装已完成，正在核对授权仓库。" );
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
  }
  const initial = await Promise.allSettled([loadMeta(), loadCategories(), loadGithubSession()]);
  for (const result of initial) if (result.status === "rejected") toast(result.reason.message, "error");
  await loadWheels();
}

init().catch((error) => toast(error.message, "error"));

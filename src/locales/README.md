# 界面语言

AI Helper 使用 Tauri + React，前端通过 i18next / react-i18next 读取此目录中的独立 JSON 文案；Rust 托盘菜单同样读取这些文件。界面切换不请求在线翻译服务。

- `zh-CN.json`：简体中文，默认语言及缺失文案的回退语言。
- `zh-TW.json`、`en.json`、`fr.json`、`ru.json`、`ja.json`、`vi.json`：繁体中文、英语、法语、俄语、日语、越南语。
- `languages.json`：语言代码、菜单顺序和语言的原生名称。

组件使用 `t("settings.title")` 取文案，使用 `useLocale()` 订阅语言变化。带变量的句子使用 `{{v0}}` 等占位符，翻译时保留占位符、路径、命令、工具名和模型标识。新增文案先添加简体中文键，再添加其他语言的同名键；不在 JSX 中直接填写可见文案。对于翻译需要调整语序的句子，整句使用一个键，不拼接多个词条。

修改翻译只需编辑相应 JSON 后重新构建软件。增加新语言时，添加完整 JSON、在 `languages.json` 注册，同时在 `src-tauri/src/native_locale.rs` 的资源映射中注册。语言偏好保存在现有应用的 `ai-helper.preferences.v1` 本地设置中，切换立即生效，下次启动保留，未知语言代码回退简体中文。

网站返回的账号名、模型名和错误详情保留来源内容。网站分组使用两套内容：软件简体中文和繁体中文统一优先读取 `zh_tw`（兼容旧 `zh` / `zh_cn`），其他语言读取 `en`；英文分组说明读取 `description_en`。通过 `src/lib/site-content.ts` 统一用于密钥列表/编辑/详情、工具分组监控、账户、使用记录和模型广场，所有请求仍提交原始分组编号。缺少翻译时名称回退原始编号，说明沿用网站的回退规则。货币继续使用 USD。

API 节点同样由 `site-content.ts` 读取网站 `/api/status` 的 `api_endpoints`，展示首选和备用地址；原有自定义配置保持可选。账户网站地址保持 `https://www.uocode.com`。`python output/playwright/verify-site-content.py` 使用隔离数据验证七语言名称/说明、原始分组值和节点选择。

首批外语文案包含机器翻译，后续可以直接在对应 JSON 中校订。开发用 `scripts/prepare-translations.py` 只处理源代码中的静态文案并输出可审查的补丁；应用运行时不会使用这个脚本，也不会提交账号或运行数据。

验证：`python output/playwright/verify-locales-and-spacing.py` 使用隔离账户，检查七种语言即时切换、保存及重新加载、问号弹框、四工具的两种窗口尺寸、Bridge 状态高度和底部操作栏间距。

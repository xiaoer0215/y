# 发行版本配置

`versions.json` 是三个发行通道的唯一登记文件：

- `uocode` 使用当前 `www.uocode.com` 配置；
- `nez-api` 使用 `ne.aineapi.com`；
- `yusr` 使用 `www.yusr.ai`；
- 每个版本独立配置产品名、登录设备显示名、网站/API 地址和更新清单地址。

更新清单地址应由你的更新服务器提供，例如：

```text
https://www.uocode.com/downloads/uocode/latest.json
```

仓库只负责保存源码和构建流程，客户端运行时读取的是更新清单地址，不直接依赖 GitHub 仓库页面。

构建某个启用版本时设置品牌 ID，源码不需要改动：

```powershell
$env:AI_HELPER_BRAND_ID = "uocode"
pnpm tauri build
```

`src-tauri/build.rs` 会把品牌名编译进客户端的登录 User-Agent，例如：

```text
Uocode Client/0.5.18 (Windows)
```

网站现有登录设备解析器会自动显示软件名、系统和版本。由于 `𝓝ě𝔃 𝓐𝓹ǐ` 使用装饰字符，HTTP User-Agent 采用 ASCII 名称 `Nez Api`；客户端品牌显示名仍可使用原始名称。

GitHub 发布流水线当前只构建默认的 Uocode 版本。完整多站点构建还需要把网站/API 域名、Tauri 产品名、图标、更新地址和 Release 资产命名都接到品牌配置；仅切换登录设备标识不构成独立网站发行版。

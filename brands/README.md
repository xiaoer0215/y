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
node scripts/select-brand.mjs uocode
pnpm tauri build
```

`src-tauri/build.rs` 会把品牌名编译进客户端的登录 User-Agent，例如：

```text
Uocode Client/0.5.18 (Windows)
```

网站现有登录设备解析器会自动显示软件名、系统和版本。由于 `𝓝ě𝔃 𝓐𝓹ǐ` 使用装饰字符，HTTP User-Agent 采用 ASCII 名称 `Nez Api`；客户端品牌显示名仍可使用原始名称。

GitHub 发布流水线按仓库名称选择品牌：`xiaoer0215/u` 对应 Uocode，`xiaoer0215/n` 对应 Nez Api，`xiaoer0215/y` 对应 Yusr.ai。三个私有仓库分别构建 Windows x64 安装版、便携版，以及 macOS Apple Silicon / Intel 安装包。

每个仓库分别配置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` Actions Secrets。私钥保存在发布者本地忽略目录 `output/release-signing`，不可提交。

当前应用已启用远程更新。客户端优先读取对应品牌网站的 `latest.json`，清单中的安装包 URL 必须是站点可直接访问的公开下载地址；GitHub 私有 Release 只作为发布源，不应把访问令牌编译进客户端。部署新版本时同步上传清单、签名包和安装包，再用客户端“检查更新”验证。

macOS 包包含 Tauri 更新签名，但尚未做 Apple Developer 签名和公证，首次打开可能需要在系统“隐私与安全性”中允许。

# Desktop Client

三个品牌共用的 Tauri v2 + React + Rust 桌面客户端，当前版本 `0.5.18`。

## 发行仓库

| 仓库 | 品牌 | 网站 |
| --- | --- | --- |
| [u](https://github.com/xiaoer0215/u) | Uocode Client | https://www.uocode.com |
| [n](https://github.com/xiaoer0215/n) | 𝓝ě𝔃 𝓐𝓹ǐ | https://ne.aineapi.com |
| [y](https://github.com/xiaoer0215/y) | Yusr.ai | https://www.yusr.ai |

每个仓库的 `v0.5.18` Release 均包含 Windows x64 安装包、便携包，以及 macOS Apple Silicon / Intel 安装包。私有仓库下载需要 GitHub 访问权限。

## 本地构建

环境：Node.js 22、pnpm 10.12.3、Rust 1.95.0、Windows C++ Build Tools 或 macOS Xcode Command Line Tools。

```powershell
pnpm install
node scripts/select-brand.mjs uocode
pnpm typecheck
pnpm dev
```

品牌参数可替换为 `nez-api` 或 `yusr`。生产构建：

```powershell
pnpm build
```

## 远程更新

客户端已启用远程更新，优先读取品牌配置中的 `latest.json`，例如：

```text
https://www.uocode.com/downloads/uocode/latest.json
https://ne.aineapi.com/downloads/nez-api/latest.json
https://www.yusr.ai/downloads/yusr/latest.json
```

更新清单、签名包和安装包需要部署到对应网站的公开下载目录。私有 GitHub Release 仅用于发布和存档，不能把仓库令牌编译到客户端。

## 许可

MIT License。完整发行配置和签名说明见 [`brands/README.md`](brands/README.md)。

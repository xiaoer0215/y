# AI Helper 二开版 Mac 测试构建

当前源码来自本地二开工作区，包含未提交和未跟踪的业务代码，不是上游原版。Windows 环境不能直接生成本项目的 macOS 安装包；源码压缩包是构建材料，不是已编译的安装包。

## 在 Mac 上生成测试包

准备 macOS 构建环境：

- Xcode Command Line Tools：终端执行 `xcode-select --install`，按系统提示完成安装。
- Node.js 22 或更新版本，包含 npm。
- Rust/rustup，项目使用 `rust-toolchain.toml` 指定的 1.95.0。
- 首次构建需要网络下载依赖。构建机需有足够磁盘空间存放 Rust 编译产物。

解压源码包后双击 `Build-Mac-Test.command`。也可以在源码目录运行：

```bash
bash scripts/build-macos-test.sh
```

默认生成 universal 通用版，同时包含 Apple Silicon（M 系列）和 Intel 代码。如果只构建一种架构：

```bash
bash scripts/build-macos-test.sh aarch64-apple-darwin
bash scripts/build-macos-test.sh x86_64-apple-darwin
```

脚本安装对应 Rust 目标、安装前端依赖、运行类型检查与后端测试，再编译并打包。完成后检查实际架构、应用签名和 DMG，并在下面目录输出 `.dmg`、`.app.zip` 和 `SHA256SUMS.txt`：

```text
release/macos-test/1.0.62/universal/
```

这是本地 ad-hoc 签名测试包，没有 Apple 公证。下载到另一台 Mac 后，首次打开可能需要在“系统设置 → 隐私与安全性”中选择“仍要打开”。配置声明最低 macOS 11，实际兼容性还需在目标 Mac 验证。

## 使用 GitHub 的 Mac 构建机

将这份完整二开源码放入你自己的仓库，进入 Actions → **Build macOS Test Package** → Run workflow，选择 `universal-apple-darwin`。完成后在该次运行的 Artifacts 中下载测试包。此工作流只生成构建附件，不推送版本标签、不创建 Release、不需要 Apple 或更新签名密钥。

源码包仅带这个测试工作流。它不包含 `.git`、原作者的发布/推送工作流、运行日志、账户配置、安装依赖或已编译的 Windows 程序。

## 当前需要测试的功能

- 普通登录、内置快捷登录窗口、公告、充值二维码、余额与分组倍率。
- 模型广场、密钥选择和绑定、七种语言与各页面布局。
- 四个工作台的配置写入、路径探测、启动客户端/终端，以及 WorkBuddy 流式测试和 Accio Bridge 模型列表。
- 托盘、关闭到托盘、重新打开主窗口。

开机自启目前只有 Windows 实现；Mac 上开启会返回“当前平台暂不支持开机自启”。部分兼容授权窗口也只有 Windows 实现，常规内置授权窗口仍需在 Mac 验证。本次仅增加构建工具，没有改动二开业务代码或网站源码。

# 账号密码保管箱 (VaultSec)

跨平台本地优先的密码管理器。所有密码条目以 **AES-256-GCM** 加密存储，主密钥由主密码经 **PBKDF2-SHA256（600,000 次迭代 + 随机盐）** 派生保护，主密码与明文**永不落盘、永不上传**。

- 📱 **Android**（Capacitor 原生壳，支持指纹双因子与快捷解锁）
- 🌐 **Web**（Chrome / Edge / 支持 WebAuthn 的浏览器）

## 核心安全特性

| 特性 | 说明 |
|------|------|
| 加密算法 | AES-256-GCM（逐条目随机 IV，支持完整性校验） |
| 密钥派生 | PBKDF2-SHA256，600,000 次迭代 + 随机 16 字节盐 |
| 信封加密 | 随机 VaultKey 加密条目，VaultKey 由 PBKDF2 派生的 KEK 包装 |
| 双因子解锁 | 主密码 + 生物识别（Android Keystore / Windows Hello） |
| 快捷解锁 | 指纹免密进入（原生凭据受 TEE 硬件保护） |
| 备份迁移 | 加密备份导出/导入，换机不丢数据（不含主密码） |
| 防暴力破解 | 密码连续输错 N 次自动销毁全部数据 |

## 技术栈

- **前端**：Vue 3 + Vite + Pinia + Vue Router
- **移动端**：Capacitor 7（`@aparajita/capacitor-biometric-auth`、`@aparajita/capacitor-secure-storage`、`@capacitor/filesystem`、`@capacitor/share`）
- **加密**：Web Crypto API（`crypto.subtle`）

## 目录结构

```
├── src/                    # 前端源码
│   ├── crypto/             # 加密原语（PBKDF2 / AES-GCM / 密钥派生）
│   ├── services/           # 存储、生物识别、备份导入导出
│   ├── stores/             # Pinia 状态（保险库生命周期、设置）
│   ├── views/              # 页面（设置/解锁/列表/详情/首次配置）
│   └── utils/              # 密码强度、剪贴板、防抖门控等
├── android/                # Android 原生工程（Capacitor 生成 + 签名配置）
├── resources/              # 应用图标源图（icon.png）
├── docs/                   # 设计文档（安全设计 / 产品规格）
└── dist/                   # Web 构建产物（勿提交）
```

## 本地开发

```bash
# 安装依赖
npm install

# Web 开发模式
npm run dev

# 构建 Web 产物
npm run build
```

> 要求：Node.js ≥ 18；Windows 桌面版建议 Node.js ≥ 20。

## 打包指南

### Android（APK）

```bash
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleRelease    # Windows
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

签名：Release 构建使用 `android/app/vault-release.jks`（**该文件不入库**，由 `~/.gradle/gradle.properties` 注入 `VAULT_STORE_*` 属性）。

### Web（静态部署）

```bash
npm run build
# 将 dist/ 部署到任意 HTTPS 静态服务器
```

> Web 版需要 HTTPS（或 localhost）才能使用 Web Crypto 与 WebAuthn。

## 备份与换机

- 设置页 →「导出密码库」生成加密备份文件（不含主密码）
- 新设备首次启动 →「从备份文件导入」→ 使用**原主密码**解锁
- 生物识别随设备绑定（TEE / 平台认证器），换机后需重新录入

## 安全说明

- 主密码为唯一解密入口，**丢失无法找回**，请务必牢记并做好备份
- 建议启用「双因子解锁」（密码 + 指纹）以获得最高安全等级
- 详细威胁模型与加密架构见 [docs/security-design.md](docs/security-design.md)

## 许可证

私有项目，保留所有权利。

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.vault.secure',
  productName: '账号密码保管箱',
  directories: {
    output: 'dist',
    buildResources: 'assets',
  },
  files: [
    'build/**/*',
    'app/**/*',
    'generated/**/*',
    // `assets` is also the electron-builder `buildResources` directory, whose
    // contents are NOT packaged by default. Include it explicitly so the
    // splash screen (and any other runtime assets) ship in the app.
    'assets/**/*',
    'package.json',
    // Platform runtime + plugins, prepared by `capacitor-electron vendor`.
    { from: 'vendor/node_modules', to: 'node_modules' },
  ],
  // 产物命名（保留 .exe/.AppImage 等真实扩展名由 electron-builder 决定）
  artifactName: 'VaultSec-${version}-${os}-${arch}.${ext}',
  // ---------- Windows ----------
  win: {
    target: [
      // NSIS 安装包
      { target: 'nsis', arch: ['x64'] },
      // 免安装便携版
      { target: 'portable', arch: ['x64'] },
    ],
    // 1024x1024 PNG，electron-builder 会自动生成 .ico
    icon: 'assets/icon.png',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '账号密码保管箱',
    artifactName: 'VaultSec-${version}-setup-${arch}.${ext}',
  },
  portable: {
    artifactName: 'VaultSec-${version}-portable-${arch}.${ext}',
  },
  // ---------- Linux ----------
  linux: {
    target: ['AppImage', 'deb'],
    icon: 'assets/icon.png',
    category: 'Utility',
    maintainer: 'mengfei0001 <mengfei0001@users.noreply.github.com>',
    synopsis: '跨平台本地优先的密码管理器',
    description: '最高安全等级跨平台密码管理器（AES-256-GCM 加密，本地优先，数据永不离开设备）',
  },
};

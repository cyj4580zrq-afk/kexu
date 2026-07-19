# 课序

课序是一款面向大学生的轻量课程表应用，支持 Android 与 iOS，包含移动端首页、完整周课表、课程增删、结课提示、深色模式、同步快照与武汉纺织大学外经贸学院教务系统直连同步。

## 主要功能

- 首页展示当前或下一节课程与今日安排
- 按教学周、星期查看完整课表
- 已结课课程使用明显颜色标记
- 手机端直接登录教务系统并同步课表
- 本地保存课程及最近 20 次同步快照
- 支持主题色、深色模式、紧凑卡片和交互动效
- Android 返回键按页面层级返回，首页二次确认退出

## 项目结构

```text
.
|-- app.py                 FastAPI 教务同步服务与网页入口
|-- index.html             桌面网页版本
|-- requirements.txt       Python 依赖
`-- android-app/
    |-- www/               Android 与 iOS 共用页面和同步逻辑
    |-- android/           Capacitor Android 原生工程
    |-- ios/               Capacitor iOS 与 Xcode 原生工程
    |-- package.json       前端与 Capacitor 依赖
    `-- capacitor.config.json
```

## 运行网页版本

需要 Python 3.10 或更高版本。

```powershell
python -m pip install -r requirements.txt
python app.py
```

默认访问地址为 `http://127.0.0.1:8000`。

## 构建 Android

需要 Node.js、JDK 21 与 Android SDK。

```powershell
cd android-app
npm install
node node_modules\@capacitor\cli\bin\capacitor sync android
cd android
.\gradlew.bat assembleDebug
```

调试 APK 会生成在 `android-app/android/app/build/outputs/apk/debug/`。

## 构建 iOS

iOS 需要 macOS、Xcode 16 或更高版本，以及有效的 Apple 开发者签名。Windows 可以维护和同步源码，但不能签名生成可安装 IPA。

```bash
cd android-app
npm ci
npm run sync:ios
npm run open:ios
```

在 Xcode 中选择 `App` Target，在 Signing & Capabilities 中选择开发团队和唯一 Bundle Identifier，然后连接 iPhone 运行，或通过 Product > Archive 创建归档并发布。

仓库中的 `iOS Build` 工作流会在 macOS Runner 上执行无签名的模拟器编译，用于确认 Xcode 工程和 Swift Package 依赖可正常构建。该检查不会生成可安装到真机的 IPA。

## 版本发布

公开版本统一使用 `vX.Y.Z` 标签。发布前必须同时完成以下调整：

1. 更新 `android-app/package.json`、`package-lock.json`、Android `build.gradle`、iOS Xcode 工程和应用内显示的版本号。
2. 在 `CHANGELOG.md` 顶部增加对应版本及更新内容。
3. 提交并推送代码，然后创建并推送同版本标签。

```powershell
git tag v0.4.0
git push origin main
git push origin v0.4.0
```

标签推送后，GitHub Actions 会自动构建 APK、创建 GitHub Release，并附上 `CHANGELOG.md` 中该版本的更新内容。版本号不一致或缺少更新日志时，发布会停止，避免生成信息不完整的安装包。

## 数据与隐私

教务密码仅用于当次登录请求，不会写入本地存储。课程和同步快照保存在用户设备中。教务系统不可用时，已经同步的课表仍可离线查看。

本项目未包含任何教务账号、密码、签名密钥或本机 SDK 路径。

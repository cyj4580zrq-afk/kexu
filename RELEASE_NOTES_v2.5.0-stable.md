# 课序 v2.5.0-stable

## 本次更新

- 修复退出账号后立即再次登录，可能出现“unexpected end of stream”并导致教务授权失败的问题。
- 退出账号时清理教务系统旧会话；重新输入教务密码登录前也会创建新会话，不再携带旧的 `JSESSIONID` 与 `route` Cookie。
- 改进 Android 网络异常处理：读取响应失败时释放连接，短暂断流会自动重试一次。

## 安装说明

下载并安装 `Kexu-Android-v2.5.0-stable.apk`。Android 将其识别为更新版本，可直接覆盖旧版，现有课表、成绩和本地设置会保留。

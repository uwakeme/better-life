# Changelog

本项目的所有显著变更都将记录在本文件。

格式基于 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]
### Added
- 部署与发版流水线：push main 即跑完全部自检；部署后端走「备份 → 传代码 → 装依赖 → 建表 → 预检配置 → 重启 → 探活 → 失败自动回滚」；推 tag 用 miniprogram-ci 把小程序包传到公众平台的开发版本（[ae8b8a7](https://github.com/uwakeme/better-life/commit/ae8b8a7)）。
- 小程序注册信息与品牌头像：名称暂定「Wake日子有方」、简称「日子有方」、99 字简介定稿；头像定稿为便签簇 + 放大镜（144×144 上传用 + 512×512 源图），色值取自设计令牌。注册四栏与填表前的商标、近似自查清单见 [docs/miniprogram-registration.md](docs/miniprogram-registration.md)。

### Fixed
- 日历日期统一按北京时间：接口里的更新时间、核查日期等固定按 UTC+8 取「哪一天」，不再因服务器时区差一天，北京时间 0 点到 8 点的时间戳也不再算到前一天（[4a23160](https://github.com/uwakeme/better-life/commit/4a23160)）。

[Unreleased]: https://github.com/uwakeme/better-life/compare/HEAD

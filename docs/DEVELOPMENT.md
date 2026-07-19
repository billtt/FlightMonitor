# 开发环境

## 组成与前置条件

采集端需要 .NET 8 SDK；完整运行还需要 Windows、Microsoft Flight Simulator 2020 和可用的
SimConnect。Web 端需要 Node.js 与 npm。仓库没有声明固定 Node 版本；在引入版本文件前，应先在
目标部署环境确认版本。当前依赖锁定在 `server/package-lock.json`，安装时优先使用 `npm ci`。

外部功能还需要：

- Google Maps JavaScript API key：用于 `/` 和 `/chart-tool` 地图。
- SimBrief numeric user ID：用于 `/plan`。
- 可访问 `aviationweather.gov`：用于 `/metar`。

## Web 端配置与启动

从模板创建本地配置。`default.json` 已被 `.gitignore` 排除，不得提交：

```bash
cp server/config/default-sample.json server/config/default.json
cd server
npm ci
PORT=3000 node app.js
```

默认端口是 3000。生产脚本 `server/pm2.config.js` 使用 PM2、端口 3002 和日志目录；它属于部署
入口，不是本地开发的必需条件。若使用 PM2，需预先安装 PM2 并确保 `server/logs` 可写。

### 本地 smoke test

另开终端执行：

```bash
curl -s http://127.0.0.1:3000/status
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"timestamp":"2026-01-01T00:00:00Z","GS":420,"TAS":430,"IAS":280,"ETE":3600,"distance":420,"totalDistance":777840,"altitude":30000,"latitude":25.08,"longitude":121.23,"headingTrue":90,"fuelWeight":10000,"fuelPerHour":1200}' \
  http://127.0.0.1:3000/
curl -s http://127.0.0.1:3000/status
```

第一个请求通常返回 `{}`；POST 后第二个 `/status` 应返回提交的数据。状态仅驻留内存，重启服务
后清空。使用真实 Google Maps key 时再打开 `http://127.0.0.1:3000/` 验证地图。

`/plan` 会访问 SimBrief，`/metar?icao=RCTP` 会访问 Aviation Weather。这两项是外部网络测试，
不要把服务不可达或配额问题与本地解析错误混为一谈。

## C# 采集端

还原和编译：

```bash
dotnet restore FlightMonitor.sln
dotnet build FlightMonitor.sln
```

仓库当前目标是 `net8.0`。`App.config` 和 `packages.config` 是早期 .NET Framework 配置遗留，
实际 SDK-style 项目依赖以 `FlightMonitor.csproj` 为准。不要同时维护两套依赖声明，除非明确要
恢复旧框架支持。

完整运行只应在 Windows + MSFS 环境进行：

```powershell
dotnet run --project FlightMonitor.csproj
```

程序启动后会同步等待 SimConnect；连接失败时约每 60 秒重试。连接成功后每 3 秒读取一批
SimVars，并向 `FSMonitor.cs` 中目前硬编码的服务 URL 提交 JSON。端到端测试时确认控制台出现
`Connected.`，服务的 `/status` 时间戳持续更新，浏览器位置和数值随模拟器变化。

## 验证矩阵

| 改动 | 必做检查 | 条件允许时 |
| --- | --- | --- |
| C# / SimVar / 数据计算 | `dotnet build FlightMonitor.sln --no-restore` | Windows + MSFS 端到端采样 |
| `server/app.js` | `node --check server/app.js`，POST/GET status smoke test | `/plan`、`/metar` 外部请求 |
| 浏览器业务 JS | 对所改文件运行 `node --check` | 有效 Maps key 下浏览器手测 |
| EJS/CSS/地图交互 | 启动服务并渲染目标路由 | 多视口、真实航路与 chart overlay |
| 配置/部署脚本 | 检查模板无秘密，shell/JS 语法 | 在目标 PM2 主机验证重启和日志 |

项目尚无自动化测试或 lint 配置。`npm test` 当前故意失败，因此在新增真实测试前不要执行它作为
验收门禁。新增测试时，同时更新 `server/package.json` 和本文件。

## 常见陷阱

- 不要在没有 SimConnect 的机器上运行采集端来判断构建是否成功；它会持续连接/等待。
- `FSMonitor.cs` 的上报 URL 是硬编码的，改动它属于部署行为变化，必须显式说明。
- 浏览器依赖 `_status` 的字段名和单位。特别是距离混合使用 meters、nautical miles，必须沿数据流
  检查后再修改。
- chart 图片和坐标 JSON 位于忽略的 `server/public/charts/`，本地缺少它们是正常情况。
- 不要输出或提交实际 `server/config/default.json` 内容。

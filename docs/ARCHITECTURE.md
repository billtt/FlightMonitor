# 架构与数据流

## 总览

```text
MSFS 2020
   | SimConnect / SimVars（每 3 秒）
   v
C# collector: Program.cs + FSMonitor.cs
   | JSON, POST /
   v
Express server: server/app.js
   | in-memory latest status      | external HTTP
   | GET /status                  +--> SimBrief /plan
   v                              +--> Aviation Weather /metar
EJS + browser JS
   |
   +--> Google Maps, route, METAR, chart overlays
```

### 采集端

`Program.cs` 创建 `FSMonitor`，然后每 100 ms 调用一次 SimConnect 消息分派。`FSMonitor.cs`：

1. 注册 `InitRequests()` 中声明的 SimVars。
2. 连接成功后每 3 秒请求所有变量。
3. 等到本轮所有请求的 `Pending` 都清除后，计算剩余距离和燃油流量。
4. 将最新批次作为 JSON POST 到服务端。

主要上报字段如下：

| 字段 | 来源/计算 | 单位 |
| --- | --- | --- |
| `timestamp` | 本机 `DateTime.Now` | 当前为本地化字符串 |
| `fuelWeight` | FUEL TOTAL QUANTITY WEIGHT | lb |
| `GS`, `TAS`, `IAS` | 对应 SimVar | knots |
| `totalDistance` | GPS FLIGHTPLAN TOTAL DISTANCE | meters |
| `ETE` | GPS ETE | seconds |
| `altitude` | PRESSURE ALTITUDE | feet |
| `latitude`, `longitude` | PLANE LATITUDE/LONGITUDE | degrees |
| `headingMagnetic`, `headingTrue` | 对应 heading | degrees |
| `distance` | `GS * ETE / 3600` | nautical miles |
| `fuelPerHour` | 相邻采样燃油差 / 时间 | lb/hour |

字段名、单位和时间戳是跨组件契约。当前没有 schema 或版本协商。

### 服务端

`server/app.js` 是单进程 Express 应用：

- `POST /`：若时间戳比当前状态新，则替换内存中的 `_status`。
- `GET /status`：返回最新状态。
- `GET /`：渲染监控页面并注入 debug 和 Maps key。
- `GET /chart-tool`：渲染 chart 对齐工具。
- `GET /plan`：获取并简化 SimBrief XML 航路。
- `GET /metar?icao=XXXX`：获取并简化 METAR XML；按 ICAO 缓存 10 分钟。

服务没有数据库、认证、持久化或多实例同步。若公开部署，`POST /` 可被任意调用方覆盖状态是当前
设计限制；增加认证时必须同时更新采集端。

### 浏览器端

- `server/views/index.ejs`：主页面和 Maps loader。
- `server/public/js/FlightMonitor.js`：轮询状态、地图/飞机、SimBrief 航路、进度、下降参考、
  METAR 和 chart overlay 的主要状态机。
- `server/public/js/Utils.js`：距离、航向和时间显示辅助函数。
- `server/public/js/MapConvertor.js` 与 `gcj-transform.js`：坐标转换相关代码；当前 WGS/GCJ adapter
  实际直接返回原坐标。
- `server/views/ChartTool.ejs` + `ChartTool.js`：人工对齐机场 chart 图片并输出 bounds 配置。

前端无 bundler、模块系统或编译步骤，脚本依赖加载顺序和共享全局变量。拆分/模块化时应一次性处理
EJS 引用顺序和全局 API，而不能只改某个文件的导出形式。

## 外部与部署依赖

- Google Maps JavaScript API：浏览器直接加载。
- SimBrief XML API：服务端代理；当前专门为该请求关闭证书校验，这是既存安全债务。
- Aviation Weather METAR API：服务端代理。
- PM2：`server/service.sh` 和 `server/pm2.config.js` 的生产进程管理器。
- `server/public/charts/<ICAO>.png/.json`：部署时单独提供且不受 Git 跟踪。

## 变更影响提示

- 改 SimVar/单位：检查采集、状态 JSON、所有前端计算和显示标签。
- 改时间戳：检查服务端新旧状态比较和浏览器延迟颜色计算，优先使用跨时区明确的 ISO 8601。
- 改航路解析：用缺字段、空 navlog 和非 waypoint fix 的 SimBrief 响应验证。
- 改 METAR 解析：考虑缺少可选天气、风向或 flight category 的响应。
- 改为多实例部署：内存状态和 cache 必须迁移到共享存储或明确 sticky routing。

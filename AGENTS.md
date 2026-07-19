# AGENTS.md

本文件适用于整个仓库，供自动化开发代理和贡献者使用。开始修改前，先阅读
`README.md`、`docs/DEVELOPMENT.md` 和 `docs/ARCHITECTURE.md`。

## 项目目标

FlightMonitor 从 Microsoft Flight Simulator 2020 的 SimConnect 接口采集飞行数据，
定期提交给 Web 服务，并在浏览器的 Google 地图上展示飞机位置、航路、进度、下降参考
和 METAR。仓库包含两个独立运行的部分：

- 根目录：C#/.NET 8 控制台采集端，仅在安装了 MSFS/SimConnect 的 Windows 环境中具备完整运行条件。
- `server/`：Node.js/Express 服务和 EJS/jQuery 前端，可独立开发；SimBrief、航空天气和 Google Maps 是外部服务。

## 修改边界

- 不要提交 `server/config/default.json`、API key、SimBrief 用户 ID 或其他凭据。配置模板是
  `server/config/default-sample.json`。
- 不要提交构建产物、`node_modules`、IDE 文件或 `server/public/charts`；这些路径已被忽略。
- `server/public/js` 和 `server/public/css` 中包含 vendored 第三方文件。除非任务明确要求升级依赖，
  不要格式化或手工修改 `jquery-*`、`bootstrap*`、`moment.js`、`gcj-transform.js`。
- `dlls/` 中的 SimConnect DLL 是运行时依赖。不要替换、删除或反编译它们，除非任务明确要求升级。
- 保持改动聚焦；不要顺手修复本文记录的既存警告或重构无关代码。

## 关键约定

- 采集端与服务端通过根路径 `POST /` 的 JSON 协议耦合。重命名 `FSMonitor.cs` 中的
  `ShortName`、改变单位或时间戳格式前，必须同步检查 `server/public/js/FlightMonitor.js`。
- 新增 SimVar 时，为它提供唯一、稳定的短名称和正确的 SimConnect 单位，并确认一次采样中
  所有请求都能完成；`AllReceived()` 会阻止不完整批次发送。
- 服务端的 `_status` 和 METAR cache 都仅在内存中，重启即丢失；不要在未明确设计持久化时
  假定它们跨进程或跨实例共享。
- 配置由 `config` 包加载。开发配置放在忽略的 `server/config/default.json`，环境变量仅直接用于
  `PORT`；不要把秘密写入模板、视图或日志。
- 前端是无打包步骤的浏览器 JavaScript。若修改静态资源，必要时更新 EJS 中的 `?v=` 缓存版本。
- 延续现有语言风格：C# 使用 4 空格和 PascalCase 类型/方法；服务端及前端 JS 使用 4 空格、
  分号和 single quotes（模板字符串适用于插值）。避免对 vendored 文件运行全仓库格式化。

## 开发与验证

详细安装和手工验证见 `docs/DEVELOPMENT.md`。最小检查按改动范围执行：

```bash
# C#（任意平台可做编译检查；完整运行必须在 Windows + MSFS）
dotnet build FlightMonitor.sln --no-restore

# Node 依赖与语法
cd server
npm ci
node --check app.js
node --check public/js/FlightMonitor.js
node --check public/js/ChartTool.js
node --check public/js/Utils.js
node --check public/js/MapConvertor.js
```

当前没有自动化测试：`npm test` 是会以状态 1 退出的占位脚本，不应作为成功门禁。修改后应补充
与范围相称的手工检查，并在交付说明中明确哪些检查未能执行以及原因。

服务端可用临时配置启动：

```bash
cp server/config/default-sample.json server/config/default.json
cd server
npm ci
PORT=3000 node app.js
```

启动后至少检查 `GET /status`；地图、`/plan` 和 `/metar` 需要有效配置或外网。不要将占位凭据
误报为完整的浏览器验证。

## 已知基线

- 在非 Windows 平台，`dotnet build` 可能针对原生 `SimConnect.dll` 报 “PE image does not have
  metadata” 警告，但当前仍可产出程序集。
- C# nullable 分析当前有多处警告；除非本次改动触及相同行，否则将其视为既存基线。
- `Program.Main` 会不断尝试连接 SimConnect；没有模拟器时不要把 `dotnet run` 当作普通 smoke test。
- 端到端验证需要 Windows、MSFS 2020、SimConnect、服务端配置和可访问的外部 API。

## 提交前检查

1. 查看 `git diff` 和 `git status --short`，确保没有秘密、生成物或无关修改。
2. 按修改范围执行上述编译/语法检查。
3. 若改变 API 或状态字段，同步更新 `docs/ARCHITECTURE.md` 和相关消费端。
4. 在结果中报告验证命令、既存警告、未验证的外部依赖及任何行为变化。

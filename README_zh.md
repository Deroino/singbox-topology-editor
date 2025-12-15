# Sing-Box 拓扑编辑器

一个用于可视化编辑和管理 Sing-Box 代理链路拓扑的 Web 应用程序。支持拖拽式节点编辑、多层跳转配置、配置文件管理和自动安装 sing-box 核心。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.7+-green.svg)
![Sing-Box](https://img.shields.io/badge/sing--box-1.12.12-orange.svg)

## 特性

### 核心功能
- 🎨 **可视化拓扑编辑器** - 拖拽式节点编辑，直观的连接关系展示
- 🔗 **多层跳转支持** - 支持多跳代理链路配置（Hop 1 → Hop 2 → ... → Hop N）
- 📦 **节点库管理** - 统一管理所有代理节点，支持导入常见代理链接格式
- 💾 **多配置文件** - 支持创建、保存、切换多个配置 Profile
- ⚖️ **轮询负载均衡** - 自动识别并启动 Round-Robin 负载均衡代理

### 自动化特性
- 🚀 **零配置启动** - 首次运行自动下载并安装 sing-box 核心
- 🔄 **配置验证** - 保存配置前自动验证 sing-box 配置文件
- 📊 **实时日志** - Web 界面实时查看 sing-box 运行日志

### 技术特性
- 🌐 **纯 Python 后端** - 基于标准库，无需额外依赖
- 💻 **原生前端** - 纯 JavaScript + HTML + CSS，无框架依赖
- 🔒 **安全性** - 防路径遍历、安全文件解压、配置验证

## 项目结构

```
singbox-topology-editor/
├── main.py                 # 主程序入口和 HTTP 服务器
├── installer.py            # sing-box 核心自动安装模块
├── proxy_manager.py        # 轮询负载均衡代理管理
├── config_handler.py       # 配置文件处理和验证
├── process_manager.py      # sing-box 进程生命周期管理
├── scripts/
│   └── install_core.py     # 独立的 sing-box 安装脚本
├── web/
│   ├── index.html          # 主界面
│   ├── css/                # 样式文件
│   └── js/                 # 前端逻辑
│       ├── app.js          # 主应用逻辑
│       ├── chain-core.js   # 拓扑链路核心逻辑
│       ├── sharelink-parser.js  # 代理链接解析器
│       └── ...
├── bin/                    # sing-box 二进制文件（自动生成）
├── config/                 # 配置文件目录（自动生成）
│   ├── config.json         # 当前运行配置
│   └── profiles/           # 配置文件存储
└── temp/                   # 临时文件目录

```

## 快速开始

### 系统要求

- Python 3.7 或更高版本
- 支持的操作系统：
  - ✅ Linux (amd64)
  - ✅ macOS (amd64)
  - ✅ Windows (amd64)

### 安装运行

1. **克隆仓库**
   ```bash
   git clone <repository-url>
   cd singbox-topology-editor
   ```

2. **启动服务**
   ```bash
   python main.py
   ```

   首次运行会自动下载并安装 sing-box 核心（约 30-45MB），请耐心等待。

3. **访问 Web 界面**

   打开浏览器访问：http://localhost:19999

### 手动安装 sing-box 核心（可选）

如果自动安装失败，可以手动安装：

```bash
python scripts/install_core.py
```

指定版本：
```bash
python scripts/install_core.py --version 1.10.0
```

## 使用指南

### 1. 创建节点库

在左侧 **Node Library** 面板：
- 点击 **+ New Node** 手动创建节点
- 点击 **📥 Import Links** 导入代理链接（支持常见格式）

### 2. 配置拓扑

在主工作区：
1. 从节点库拖拽节点到编辑区
2. 点击 **Add Layer (Hop)** 添加跳转层
3. 连接节点构建代理链路
4. 配置 Inbound 入口（支持 mixed, http, socks 等）

### 3. 启动服务

1. 点击顶部 **Start Core** 启动 sing-box
2. 配置系统代理指向 `127.0.0.1:10808`（默认端口）
3. 查看底部日志面板确认运行状态

### 4. 管理配置

在左侧 **Profiles** 面板：
- 点击 Profile 名称切换配置
- 点击 **+ New Profile** 创建新配置
- 修改后自动保存到当前 Profile

## API 接口

后端提供以下 HTTP API：

### 核心控制
- `POST /api/start` - 启动 sing-box 核心
- `POST /api/stop` - 停止 sing-box 核心
- `POST /api/status` - 查询运行状态

### 配置管理
- `POST /api/save_config` - 保存配置文件
- `GET /api/core_logs` - 获取运行日志

### Profile 管理
- `GET /api/profiles/list` - 列出所有 Profile
- `GET /api/profiles/load?name=xxx` - 加载指定 Profile
- `POST /api/profiles/create` - 创建新 Profile
- `POST /api/profiles/save` - 保存 Profile
- `POST /api/profiles/delete` - 删除 Profile

## 高级功能

### 轮询负载均衡（Round-Robin）

编辑器自动识别以下命名模式的节点并启动轮询负载均衡：

- **Outbound**: `sys-rr-{group_id}-lb` (类型: socks, 指向 127.0.0.1)
- **Inbound**: `sys-rr-{group_id}-in-{index}` (类型: socks)

满足条件时，系统会自动启动本地 SOCKS5 代理，按顺序轮询后端节点。

### 支持的节点类型

- ✅ Direct
- ✅ SOCKS5
- ✅ HTTP
- ✅ Shadowsocks
- ✅ VMess
- ✅ VLESS
- ✅ Trojan
- ✅ Hysteria / Hysteria2
- ✅ Selector (手动选择)
- ✅ URLTest (自动测速选择)

### 配置文件格式

配置文件使用 sing-box 标准格式，支持所有 sing-box 配置选项。详见 [sing-box 官方文档](https://sing-box.sagernet.org/)。

## 常见问题

### Q: 启动失败提示 "Binary missing"？
**A:** 检查网络连接，或手动运行 `python scripts/install_core.py` 安装核心。

### Q: 配置保存失败？
**A:** 检查配置是否符合 sing-box 规范，查看日志面板获取详细错误信息。

### Q: 如何更改监听端口？
**A:** 修改 `main.py` 中的 `PORT` 常量（默认 19999）。

### Q: 支持 IPv6 吗？
**A:** 取决于 sing-box 核心和节点配置，编辑器本身不限制。

## 开发指南

### 项目架构

```
main.py                     → HTTP 服务器和请求路由
├── installer.py            → 安装逻辑（下载、解压、验证）
├── proxy_manager.py        → SOCKS5 轮询代理实现
├── config_handler.py       → 配置验证、Profile 管理
└── process_manager.py      → 进程启动、停止、监控
```

### 添加新节点类型

1. 修改 `web/js/app.js` 中的 `DEFAULT_NODE_TYPES`
2. 在 `web/js/chain-core.js` 中实现转换逻辑
3. 更新 UI 组件以支持新字段

### 调试模式

启用详细日志：
```python
# 在 main.py 中
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 代码规范
- 遵循 PEP 8（Python）
- 使用有意义的变量名和注释
- 保持单一职责原则
- 编写清晰的提交信息

### 提交前检查
- [ ] 代码通过 Python 语法检查
- [ ] 测试核心功能（启动/停止/配置保存）
- [ ] 更新相关文档

## 安全建议

⚠️ **重要提示**：
1. **仅在可信网络环境运行** - 默认绑定 `0.0.0.0`，外网可访问
2. **不要暴露到公网** - 无身份验证机制
3. **定期备份配置** - 配置文件存储在 `config/profiles/`
4. **谨慎导入未知链接** - 可能包含恶意配置

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 致谢

- [sing-box](https://github.com/SagerNet/sing-box) - 核心代理工具
- 所有贡献者和用户

## 联系方式

- 问题反馈：[GitHub Issues](../../issues)
- 功能建议：[GitHub Discussions](../../discussions)

---

**注意**：本项目仅供学习和研究使用，请遵守当地法律法规。
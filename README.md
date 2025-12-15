# Sing-Box Topology Editor

A web application for visually editing and managing Sing-Box proxy chain topologies. Features drag-and-drop node editing, multi-hop configuration, profile management, and automatic sing-box core installation.  

⚠️This is a pure vibe coding project. It may contain bugs, unexpected behaviors, and was primarily built for fun and learning.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.7+-green.svg)
![Sing-Box](https://img.shields.io/badge/sing--box-1.12.12-orange.svg)
<img width="2549" height="1225" alt="image" src="https://github.com/user-attachments/assets/49d16fbb-7228-4b54-9ae0-240ebe060aa7" />
<img width="2554" height="1212" alt="image" src="https://github.com/user-attachments/assets/f31c913b-5ced-4b06-b7e1-20db726fdca3" />

## Features

### Core Functionality
- 🎨 **Visual Topology Editor** - Drag-and-drop node editing with intuitive connection visualization
- 🔗 **Multi-Hop Support** - Configure multi-hop proxy chains (Hop 1 → Hop 2 → ... → Hop N)
- 📦 **Node Library Management** - Unified management of all proxy nodes, support for importing common proxy link formats
- 💾 **Multiple Config Profiles** - Create, save, and switch between multiple configuration profiles
- ⚖️ **Round-Robin Load Balancing** - Automatically detect and start round-robin load balancing proxies

### Automation Features
- 🚀 **Zero-Configuration Startup** - Automatically download and install sing-box core on first run
- 🔄 **Configuration Validation** - Automatically validate sing-box configuration files before saving
- 📊 **Real-time Logging** - View sing-box logs in real-time through the web interface

### Technical Features
- 🌐 **Pure Python Backend** - Based on standard library, no additional dependencies required
- 💻 **Vanilla Frontend** - Pure JavaScript + HTML + CSS, no framework dependencies
- 🔒 **Security** - Path traversal protection, safe file extraction, configuration validation

## Project Structure

```
singbox-topology-editor/
├── main.py                 # Main entry point and HTTP server
├── installer.py            # Automatic sing-box core installation module
├── proxy_manager.py        # Round-robin proxy management
├── config_handler.py       # Configuration file handling and validation
├── process_manager.py      # Sing-box process lifecycle management
├── scripts/
│   └── install_core.py     # Standalone sing-box installation script
├── web/
│   ├── index.html          # Main interface
│   ├── css/                # Style sheets
│   └── js/                 # Frontend logic
│       ├── app.js          # Main application logic
│       ├── chain-core.js   # Topology chain core logic
│       ├── sharelink-parser.js  # Proxy link parser
│       └── ...
├── bin/                    # Sing-box binary files (auto-generated)
├── config/                 # Configuration directory (auto-generated)
│   ├── config.json         # Current running configuration
│   └── profiles/           # Profile storage
└── temp/                   # Temporary files directory

```

## Quick Start

### System Requirements

- Python 3.7 or higher
- Supported operating systems:
  - ✅ Linux (amd64)
  - ✅ macOS (amd64)
  - ✅ Windows (amd64)

### Installation and Running

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd singbox-topology-editor
   ```

2. **Start the service**
   ```bash
   python main.py
   ```

   The first run will automatically download and install the sing-box core (approximately 30-45MB), please be patient.

3. **Access the Web Interface**

   Open your browser and visit: http://localhost:19999

### Manual sing-box Core Installation (Optional)

If automatic installation fails, you can install manually:

```bash
python scripts/install_core.py
```

Specify version:
```bash
python scripts/install_core.py --version 1.10.0
```

## Usage Guide

### 1. Create Node Library

In the left **Node Library** panel:
- Click **+ New Node** to manually create nodes
- Click **📥 Import Links** to import proxy links (supports common formats)

### 2. Configure Topology

In the main workspace:
1. Drag nodes from the node library to the editor area
2. Click **Add Layer (Hop)** to add hop layers
3. Connect nodes to build proxy chains
4. Configure Inbound entry points (supports mixed, http, socks, etc.)

### 3. Start Service

1. Click **Start Core** at the top to start sing-box
2. Configure system proxy to point to `127.0.0.1:10808` (default port)
3. Check the bottom log panel to confirm running status

### 4. Manage Configurations

In the left **Profiles** panel:
- Click profile name to switch configurations
- Click **+ New Profile** to create new configurations
- Changes are automatically saved to the current profile

## API Reference

The backend provides the following HTTP APIs:

### Core Control
- `POST /api/start` - Start sing-box core
- `POST /api/stop` - Stop sing-box core
- `POST /api/status` - Query running status

### Configuration Management
- `POST /api/save_config` - Save configuration file
- `GET /api/core_logs` - Get runtime logs

### Profile Management
- `GET /api/profiles/list` - List all profiles
- `GET /api/profiles/load?name=xxx` - Load specified profile
- `POST /api/profiles/create` - Create new profile
- `POST /api/profiles/save` - Save profile
- `POST /api/profiles/delete` - Delete profile

## Advanced Features

### Round-Robin Load Balancing

The editor automatically detects nodes with the following naming patterns and starts round-robin load balancing:

- **Outbound**: `sys-rr-{group_id}-lb` (type: socks, pointing to 127.0.0.1)
- **Inbound**: `sys-rr-{group_id}-in-{index}` (type: socks)

When conditions are met, the system automatically starts a local SOCKS5 proxy that round-robins backend nodes in sequence.

### Supported Node Types

- ✅ Direct
- ✅ SOCKS5
- ✅ HTTP
- ✅ Shadowsocks
- ✅ VMess
- ✅ VLESS
- ✅ Trojan
- ✅ Hysteria / Hysteria2
- ✅ Selector (manual selection)
- ✅ URLTest (automatic speed test selection)

### Configuration File Format

Configuration files use the standard sing-box format and support all sing-box configuration options. See [sing-box official documentation](https://sing-box.sagernet.org/) for details.

## FAQ

### Q: Startup fails with "Binary missing" error?
**A:** Check your network connection, or manually run `python scripts/install_core.py` to install the core.

### Q: Configuration save fails?
**A:** Verify that the configuration complies with sing-box specifications, check the log panel for detailed error messages.

### Q: How to change the listening port?
**A:** Modify the `PORT` constant in `main.py` (default 19999).

### Q: Is IPv6 supported?
**A:** It depends on the sing-box core and node configuration. The editor itself doesn't impose restrictions.

## Development Guide

### Project Architecture

```
main.py                     → HTTP server and request routing
├── installer.py            → Installation logic (download, extract, verify)
├── proxy_manager.py        → SOCKS5 round-robin proxy implementation
├── config_handler.py       → Configuration validation, profile management
└── process_manager.py      → Process start, stop, monitoring
```

### Adding New Node Types

1. Modify `DEFAULT_NODE_TYPES` in `web/js/app.js`
2. Implement conversion logic in `web/js/chain-core.js`
3. Update UI components to support new fields

### Debug Mode

Enable verbose logging:
```python
# In main.py
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Contributing

Issues and Pull Requests are welcome!

### Code Standards
- Follow PEP 8 (Python)
- Use meaningful variable names and comments
- Maintain single responsibility principle
- Write clear commit messages

### Pre-commit Checklist
- [ ] Code passes Python syntax check
- [ ] Test core functionality (start/stop/config save)
- [ ] Update relevant documentation

## Security Recommendations

⚠️ **Important Notes**:
1. **Only run in trusted network environments** - Default binding to `0.0.0.0`, accessible from external network
2. **Do not expose to the internet** - No authentication mechanism
3. **Regularly backup configurations** - Configurations stored in `config/profiles/`
4. **Be cautious importing unknown links** - May contain malicious configurations

## License

MIT License - See [LICENSE](LICENSE) file for details

## Acknowledgments

- [sing-box](https://github.com/SagerNet/sing-box) - Core proxy tool
- All contributors and users

## Contact

- Issue reporting: [GitHub Issues](../../issues)
- Feature suggestions: [GitHub Discussions](../../discussions)

---

**Note**: This project is for learning and research purposes only. Please comply with local laws and regulations.

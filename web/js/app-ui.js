const API_URL = '/api';
const nodeConfigModal = document.getElementById('config-modal');
const nodePickerModal = document.getElementById('node-picker-modal');
const nodePickerSelect = document.getElementById('node-picker-select');
const selectorModal = document.getElementById('selector-modal');
const selectorDefaultSelect = document.getElementById('selector-default');
const selectorInboundTag = document.getElementById('selector-inbound-tag');
const importModal = document.getElementById('import-modal');
const configPanel = document.getElementById('config-panel');
const configOverlay = document.getElementById('config-overlay');
const configEditor = document.getElementById('config-editor');
const inboundModal = document.getElementById('inbound-modal');
const profileModal = document.getElementById('profile-modal');
const ModalControllers = {};
const DrawerControllers = {};
let currentSelectorInbound = null;
let isSidebarCollapsed = false;
let logCollapsed = false;
let consoleHeight = 160;
let redrawTimer = null;
const REDRAW_DEBOUNCE = 20;

// --- Global Error Handler ---
window.onerror = function(msg, url, lineNo, columnNo, error) {
    log(`JS Error: ${msg} (@ line ${lineNo})`, 'error');
    return false;
};

// --- Logging ---
function log(msg, type = 'info', options = {}) {
    const { toast = true } = options;
    const consoleEl = document.getElementById('console-log');
    if (consoleEl) {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        consoleEl.appendChild(entry);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }
    if (toast && typeof showToast === 'function') showToast(msg, type);
}

function clearConsole() {
    const consoleEl = document.getElementById('console-log');
    if (consoleEl) consoleEl.innerHTML = '';
    log('Console cleared', 'info', { toast: false });
}

function setConsoleVisibility(show) {
    const container = document.getElementById("console-container");
    const btn = document.getElementById("btn-console-toggle");
    const floatBtn = document.getElementById("floating-console-toggle");
    if (!container) return;
    logCollapsed = !show;
    if (show) {
        container.style.height = `${consoleHeight}px`;
        container.style.maxHeight = `${Math.max(160, consoleHeight)}px`;
        container.classList.add('console-open');
        container.classList.remove('console-closed');
    } else {
        container.classList.remove('console-open');
        container.classList.add('console-closed');
        container.style.height = "";
        container.style.maxHeight = "";
    }
    if (btn) btn.textContent = show ? "Hide Logs" : "Show Logs";
    if (floatBtn) floatBtn.style.display = show ? "none" : "block";
    forceRedraw();
    scheduleRedraw();
}

function toggleConsole() {
    // logCollapsed=true means hidden; pass true to show, false to hide
    setConsoleVisibility(logCollapsed);
}

// --- Config Panel ---
function isConfigPanelOpen() {
    return (DrawerControllers.config && DrawerControllers.config.isOpen()) || false;
}

function updateConfigEditor() {
    if (!configEditor || !isConfigPanelOpen()) return;
    try {
        const cfg = buildSingboxConfig();
        configEditor.value = JSON.stringify(cfg, null, 2);
    } catch (e) {
        configEditor.value = `// Failed to build config\n${e.message}`;
    }
}

function setConfigPanel(open) {
    const ctrl = DrawerControllers.config;
    if (!ctrl) return;
    open ? ctrl.open() : ctrl.close();
}

function openConfigPanel() { setConfigPanel(true); }
function closeConfigPanel() { setConfigPanel(false); }

function initUIControllers() {
    if (window.UIKit) {
        ModalControllers.inbound = UIKit.registerModal('inbound', inboundModal);
        ModalControllers.profile = UIKit.registerModal('profile', profileModal);
        ModalControllers.nodeConfig = UIKit.registerModal('node-config', nodeConfigModal);
        ModalControllers.nodePicker = UIKit.registerModal('node-picker', nodePickerModal);
        ModalControllers.selector = UIKit.registerModal('selector', selectorModal);
        ModalControllers.importer = UIKit.registerModal('importer', importModal);
        DrawerControllers.config = UIKit.registerDrawer('config-panel', configPanel, configOverlay, { onOpen: updateConfigEditor });
    }
}

function initSidebarResizer() {
    const resizer = document.getElementById('sidebar-resizer');
    const sidebar = document.querySelector('.sidebar');
    if (!resizer || !sidebar) return;
    let dragging = false;
    resizer.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
        if (!dragging || isSidebarCollapsed) return;
        const newW = Math.min(480, Math.max(180, e.clientX));
        sidebar.style.width = `${newW}px`;
    });
    document.addEventListener('mouseup', () => { dragging = false; });
}

function setSidebarCollapsed(flag) {
    const sidebar = document.querySelector('.sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const btn = document.getElementById('sidebar-toggle-btn');
    const floatBtn = document.getElementById('floating-sidebar-toggle');
    isSidebarCollapsed = !!flag;
    if (sidebar) {
        sidebar.style.display = 'flex';
        sidebar.style.width = isSidebarCollapsed ? '0px' : '240px';
        sidebar.style.padding = isSidebarCollapsed ? '0' : '20px';
        sidebar.style.gap = isSidebarCollapsed ? '0' : '25px';
        sidebar.classList.toggle('collapsed', isSidebarCollapsed);
    }
    if (resizer) resizer.style.display = isSidebarCollapsed ? 'none' : 'block';
    if (btn) btn.textContent = isSidebarCollapsed ? '☰' : '☰';
    if (floatBtn) floatBtn.style.display = isSidebarCollapsed ? 'block' : 'none';
    forceRedraw();
    scheduleRedraw();
}

function toggleSidebar() {
    setSidebarCollapsed(!isSidebarCollapsed);
}

function scheduleRedraw() {
    if (redrawTimer) clearTimeout(redrawTimer);
    redrawTimer = setTimeout(forceRedraw, REDRAW_DEBOUNCE);
}

function forceRedraw() {
    const svgLayer = document.getElementById('connections-layer');
    if (svgLayer) drawConnections(svgLayer);
}

function initLogResizer() {
    const resizer = document.getElementById('log-resizer');
    const consoleContainer = document.getElementById('console-container');
    if (!resizer || !consoleContainer) return;
    let dragging = false;
    resizer.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
        if (!dragging || logCollapsed) return;
        const rect = consoleContainer.getBoundingClientRect();
        const totalHeight = window.innerHeight;
        const newH = Math.min(300, Math.max(120, totalHeight - e.clientY - 20));
        consoleContainer.style.height = `${newH}px`;
        consoleContainer.style.maxHeight = `${Math.max(160, newH)}px`;
        consoleHeight = newH;
        scheduleRedraw();
    });
    document.addEventListener('mouseup', () => { dragging = false; });
}

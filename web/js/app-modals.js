// --- Config Modal ---
function openConfig(node, layerId) {
    appState.modalMode = 'placement';
    appState.editingNode = node;
    appState.editingLayerId = layerId;
    const def = resolveNodeDefinition(node);
    const tagVal = def ? def.tag : node.tag;
    const typeVal = def ? def.type : node.type;
    if (ModalControllers.nodeConfig) ModalControllers.nodeConfig.open();
    const tagInput = document.getElementById('node-tag');
    const typeSelect = document.getElementById('node-type');
    if (tagInput) { tagInput.value = tagVal || ''; tagInput.disabled = true; }
    if (typeSelect) { typeSelect.value = typeVal || 'selector'; typeSelect.disabled = true; }
    updateFormFields(); 
}

function openNodeEditor(tag) {
    appState.modalMode = 'library';
    if (tag === 'direct') {
        log('The "direct" node is built-in and cannot be edited.', 'error');
        return;
    }
    if (tag && tag.startsWith('sys-rr-')) {
        log('Tags starting with "sys-rr-" are reserved.', 'error');
        return;
    }
    const existing = tag ? findNodeDefinition(tag) : null;
    const draft = existing ? { ...existing } : { id: 'lib-' + Date.now(), tag: `node-${Math.floor(Math.random()*1000)}`, type: 'shadowsocks' };
    appState.editingNode = draft;
    appState.editingNodeOriginalTag = existing ? existing.tag : draft.tag;
    const tagInput = document.getElementById('node-tag');
    const typeSelect = document.getElementById('node-type');
    if (ModalControllers.nodeConfig) ModalControllers.nodeConfig.open();
    if (tagInput) { tagInput.disabled = false; tagInput.value = draft.tag || ''; }
    if (typeSelect) { typeSelect.disabled = false; typeSelect.value = draft.type || 'selector'; }
    updateFormFields();
}

function closeModal() {
    if (ModalControllers.nodeConfig) ModalControllers.nodeConfig.close();
    appState.editingNode = null;
    appState.editingLayerId = null;
    appState.editingNodeOriginalTag = null;
    appState.modalMode = 'library';
    const tagInput = document.getElementById('node-tag');
    const typeSelect = document.getElementById('node-type');
    if (tagInput) tagInput.disabled = false;
    if (typeSelect) typeSelect.disabled = false;
}

function updateFormFields() {
    const mode = appState.modalMode || 'library';
    const node = appState.editingNode;
    const type = (document.getElementById('node-type') || {}).value || getNodeType(node);
    const container = document.getElementById('dynamic-fields');
    if (!container) return;
    container.replaceChildren();

    // Placement mode now only shows info, no more checkboxes
    if (mode === 'placement') {
        if (!node) return;

        const addReadonly = (labelText, valueText) => {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = labelText;
            const box = document.createElement('div');
            box.className = 'readonly-box';
            box.textContent = valueText || '';
            group.append(label, box);
            container.appendChild(group);
        };

        addReadonly('Node Tag', getNodeTag(node));
        addReadonly('Type', getNodeType(node));

        const detours = Array.isArray(node.detours) ? node.detours : [];
        if (detours.length > 0) {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = 'Flows To (Links)';
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.padding = '0';
            ul.style.marginTop = '5px';

            detours.forEach(d => {
                const li = document.createElement('li');
                li.style.background = '#18181b';
                li.style.padding = '5px 8px';
                li.style.marginBottom = '4px';
                li.style.borderRadius = '4px';
                li.style.fontSize = '12px';
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';

                const text = document.createElement('span');
                text.textContent = d;

                const del = document.createElement('span');
                del.textContent = '×';
                del.style.color = '#ef4444';
                del.style.cursor = 'pointer';
                del.addEventListener('click', () => unlinkNode(d));

                li.append(text, del);
                ul.appendChild(li);
            });

            group.append(label, ul);
            container.appendChild(group);
        } else {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = 'Flows To';
            const msg = document.createElement('div');
            msg.style.color = '#71717a';
            msg.style.fontSize = '12px';
            msg.style.fontStyle = 'italic';
            msg.textContent = 'No outgoing connections. Drag from the bottom port to another node to connect.';
            group.append(label, msg);
            container.appendChild(group);
        }
        return;
    }

    const addField = (labelText, id, valueText, placeholder = '') => {
        const group = document.createElement('div');
        group.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = labelText;

        const input = document.createElement('input');
        input.type = 'text';
        input.id = id;
        input.value = valueText || '';
        input.placeholder = placeholder || '';

        group.append(label, input);
        container.appendChild(group);
    };
    const nodeData = node || {};

    if (['shadowsocks', 'trojan', 'vmess', 'vless', 'hysteria2', 'socks', 'http'].includes(type)) {
        addField('Server', 'f-server', nodeData.server, '1.2.3.4');
        addField('Port', 'f-port', nodeData.port, '443');
        if (type === 'shadowsocks') { addField('Password', 'f-pass', nodeData.password); addField('Method', 'f-method', nodeData.method, 'aes-256-gcm'); }
        if (['vmess', 'vless', 'hysteria2', 'trojan'].includes(type)) addField('UUID/Password', 'f-auth', nodeData.password || nodeData.uuid);
        if (type === 'hysteria2') addField('SNI', 'f-sni', nodeData.tls ? nodeData.tls.server_name : '');
    }
}

// Helper to remove link from modal
function unlinkNode(targetTag) {
    if (appState.editingNode && appState.editingNode.detours) {
        appState.editingNode.detours = appState.editingNode.detours.filter(t => t !== targetTag);
        render(); // Update graph
        saveCurrentProfile();
        updateFormFields(); // Update modal
    }
}


function saveNodeConfig() {
    const mode = appState.modalMode || 'library';
    
    // In placement mode, connections are managed live via the 'unlinkNode' function or drag-and-drop.
    // The "Save" button here is purely cosmetic/confirmative to close the modal.
    if (mode === 'placement') {
        closeModal();
        return;
    }

    const node = appState.editingNode;
    if (!node) return;
    const originalTag = appState.editingNodeOriginalTag || node.tag;
    node.tag = document.getElementById('node-tag').value;
    node.type = document.getElementById('node-type').value;
    const getVal = id => document.getElementById(id) ? document.getElementById(id).value : null;

    if (getVal('f-server')) { node.server = getVal('f-server'); node.port = parseInt(getVal('f-port')); }
    if (getVal('f-pass')) node.password = getVal('f-pass');
    if (getVal('f-method')) node.method = getVal('f-method');
    if (getVal('f-auth')) {
        if (node.type.includes('vmess') || node.type.includes('vless')) node.uuid = getVal('f-auth');
        else node.password = getVal('f-auth');
    }
    if (getVal('f-sni')) { if (!node.tls) node.tls = {enabled:true}; node.tls.server_name = getVal('f-sni'); }

    if (node.tag === 'direct' || originalTag === 'direct') {
        log('The "direct" tag is reserved.', 'error');
        return;
    }
    if (node.tag.startsWith('sys-rr-') || originalTag.startsWith('sys-rr-')) {
        log('Tags starting with "sys-rr-" are reserved.', 'error');
        return;
    }

    const exists = appState.nodeLibrary.find(n => n.tag === node.tag);
    if (exists && originalTag !== node.tag) {
        log('Tag already exists. Choose another one.', 'error');
        return;
    }

    const idx = appState.nodeLibrary.findIndex(n => n.tag === originalTag);
    if (idx >= 0) appState.nodeLibrary[idx] = { ...node };
    else appState.nodeLibrary.push({ ...node, id: node.id || ('lib-' + Date.now()) });

    applyTagChange(originalTag, node.tag);
    closeModal();
    render();
    saveCurrentProfile();
    log(`Saved node ${node.tag}`, 'success');
}

function deleteCurrentNode() {
    if (!appState.editingNode) return;
    if (appState.modalMode === 'library') {
        deleteLibraryNode(appState.editingNode.tag);
        return;
    }
    const layer = appState.layers.find(l => l.id === appState.editingLayerId);
    if (!layer) return;
    layer.nodes = layer.nodes.filter(n => n.id !== appState.editingNode.id);
    closeModal();
    render();
    saveCurrentProfile();
}

function deleteLibraryNode(tag) {
    if (!tag) return;
    if (tag === 'direct') {
        log('Cannot delete the "direct" node.', 'error');
        return;
    }
    if (tag.startsWith('sys-rr-')) {
        log('Tags starting with "sys-rr-" are reserved.', 'error');
        return;
    }
    const { placementsRemoved, detoursRemoved } = removeOutboundTag(tag);
    appState.nodeLibrary = appState.nodeLibrary.filter(n => n.tag !== tag);
    closeModal();
    render();
    saveCurrentProfile();
    log(`Deleted library node ${tag} (removed ${placementsRemoved} placement(s), ${detoursRemoved} link(s))`, 'success');
}

// --- Import Share Links ---
function openImportModal() {
    const importText = document.getElementById('import-text');
    if (ModalControllers.importer) ModalControllers.importer.open();
    if (importText) importText.value = '';
}

function closeImportModal() {
    if (ModalControllers.importer) ModalControllers.importer.close();
}

function confirmImport() {
    const text = document.getElementById('import-text').value.trim();
    if (!text) {
        log('Please paste share links or subscription', 'error');
        return;
    }

    try {
        const results = importShareLinks(text, appState.nodeLibrary);

        if (results.success.length > 0) {
            appState.nodeLibrary.push(...results.success);
            render();
            saveCurrentProfile();
            log(`Imported ${results.success.length} node(s)`, 'success');
        }

        if (results.failed.length > 0) {
            log(`Failed to parse ${results.failed.length} link(s). Check console.`, 'error');
            console.error('Parse failures:', results.failed);
        }

        if (results.success.length === 0 && results.failed.length === 0) {
            log('No valid links found in input', 'warning');
        } else {
            closeImportModal();
        }
    } catch (e) {
        log('Import error: ' + e.message, 'error');
    }
}

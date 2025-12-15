// --- Render Updates ---
function render() {
    const editorEl = document.getElementById('chain-editor');
    const nodesLayer = document.getElementById('nodes-layer');
    const svgLayer = document.getElementById('connections-layer');

    normalizeTopology();
    
    nodesLayer.replaceChildren();
    svgLayer.replaceChildren();

    const tagToLayerIndex = new Map();
    (appState.layers || []).forEach((layer, idx) => (layer.nodes || []).forEach(n => {
        if (n && n.tag) tagToLayerIndex.set(n.tag, idx);
    }));

    const rrManagedCandidates = new Set();
    (appState.layers || []).forEach((layer, idx) => (layer.nodes || []).forEach(n => {
        if (!n || getNodeType(n) !== 'roundrobin') return;
        const detours = Array.isArray(n.detours) ? n.detours.filter(Boolean) : [];
        const candidates = detours.filter(t => tagToLayerIndex.get(t) === idx + 1);
        const hasOutput = detours.some(t => {
            if (t === 'direct') return idx === (appState.layers.length - 2);
            return tagToLayerIndex.get(t) === idx + 2;
        });
        if (hasOutput) candidates.forEach(t => rrManagedCandidates.add(t));
    }));
    
    // 1. Inbounds
    if (!Array.isArray(appState.inbounds)) appState.inbounds = [];

    const startContainer = document.createElement('div');
    startContainer.className = 'system-node-container';
    startContainer.dataset.label = 'INBOUNDS';
    
    appState.inbounds.forEach(ib => {
        const ibEl = document.createElement('div');
        ibEl.className = 'system-node start';
        ibEl.dataset.nodeTag = ib.tag;
        ibEl.addEventListener('click', (event) => {
            if (event.target && event.target.classList && event.target.classList.contains('port')) return;
            if (event.target && event.target.classList && (event.target.classList.contains('inbound-del') || event.target.classList.contains('inbound-gear'))) return;
            openInboundModal(ib.tag);
        });

        const title = document.createElement('div');
        title.textContent = ib.tag;

        const port = document.createElement('div');
        port.style.fontSize = '10px';
        port.style.opacity = '0.7';
        port.textContent = `:${ib.port}`;

        const outPort = document.createElement('div');
        outPort.className = 'port out';
        outPort.addEventListener('mousedown', (event) => DragManager.startLinkDrag(event, ib.tag, true));

        ibEl.append(title, port, outPort);

        const del = document.createElement('div');
        del.className = 'inbound-del';
        del.textContent = '×';
        del.style.position = 'absolute';
        del.style.top = '2px';
        del.style.right = '2px';
        del.style.cursor = 'pointer';
        del.style.color = 'var(--neon-red)';
        del.style.fontSize = '10px';
        del.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteInbound(ib.tag);
        });
        ibEl.appendChild(del);

        if (ib.detours && ib.detours.length > 1) {
            const gear = document.createElement('div');
            gear.className = 'inbound-gear';
            gear.textContent = '⚙';
            gear.style.position = 'absolute';
            gear.style.bottom = '2px';
            gear.style.right = '2px';
            gear.style.cursor = 'pointer';
            gear.style.color = 'var(--neon-blue)';
            gear.style.fontSize = '10px';
            gear.addEventListener('click', (event) => {
                event.stopPropagation();
                openSelectorModal(ib.tag);
            });
            ibEl.appendChild(gear);
        }
        startContainer.appendChild(ibEl);
    });
    
    // Add Inbound Button
    const addIbBtn = document.createElement('button');
    addIbBtn.className = 'btn-xs';
    addIbBtn.style.height = '100%';
    addIbBtn.textContent = '+ ADD';
    addIbBtn.addEventListener('click', openInboundModal);
    startContainer.appendChild(addIbBtn);

    nodesLayer.appendChild(startContainer);

    // 2. Layers
    appState.layers.forEach((layer, lIndex) => {
        const layerEl = document.createElement('div');
        layerEl.className = 'layer-container';
        layerEl.dataset.id = layer.id;
        layerEl.dataset.index = lIndex;
        
        // Drag Events
        layerEl.draggable = true;
        layerEl.ondragstart = (e) => DragManager.startLayerDrag(e, lIndex);
        layerEl.ondragover = (e) => {
            const targetId = DragManager.state.draggingType === 'layer' ? lIndex : layer.id;
            DragManager.onDragOver(e, 'layer', targetId);
        };
        // Note: For layer sorting, targetId is index. For node/library drop, targetId is layerId.
        layerEl.ondrop = (e) => {
            const targetId = DragManager.state.draggingType === 'layer' ? lIndex : layer.id;
            DragManager.onDrop(e, 'layer', targetId);
        };
        layerEl.ondragleave = (e) => DragManager.onDragLeave(e);

        // Header
        const header = document.createElement('div');
        header.className = 'layer-header';

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';

        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.textContent = '☰';

        const title = document.createElement('span');
        title.className = 'layer-title';
        title.textContent = `HOP ${lIndex + 1}: ${layer.title}`;

        left.append(dragHandle, title);

        const actions = document.createElement('div');
        actions.className = 'layer-actions';

        const addNodeBtn = document.createElement('button');
        addNodeBtn.className = 'btn-xs';
        addNodeBtn.textContent = '+ Node';
        addNodeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            addNodeToLayer(layer.id);
        });
        actions.appendChild(addNodeBtn);

        if (lIndex > 0) {
            const delBtn = document.createElement('button');
            delBtn.className = 'btn-xs btn-danger-text';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteLayer(layer.id);
            });
            actions.appendChild(delBtn);
        }

        header.append(left, actions);

        const nodesGrid = document.createElement('div');
        nodesGrid.className = 'layer-nodes';

        const appendNodeCard = (node) => {
            const nodeTag = getNodeTag(node);
            const nodeType = getNodeType(node);
            const nodeEl = document.createElement('div');
            nodeEl.dataset.nodeTag = nodeTag;
            nodeEl.className = `node-card type-${nodeType}`;
            nodeEl.draggable = true;
            
            nodeEl.ondragstart = (e) => DragManager.startNodeDrag(e, node.id, layer.id);

            const inPort = document.createElement('div');
            inPort.className = 'port in';
            inPort.dataset.tag = nodeTag;

            const icon = document.createElement('div');
            icon.className = 'node-icon';
            icon.textContent = getTypeIcon(nodeType);

            const tagEl = document.createElement('div');
            tagEl.className = 'node-tag';
            tagEl.textContent = nodeTag;

            const outPort = document.createElement('div');
            outPort.className = 'port out';
            if (rrManagedCandidates.has(nodeTag)) {
                outPort.style.opacity = '0.25';
                outPort.style.cursor = 'not-allowed';
                outPort.title = 'Managed by Round Robin';
                outPort.style.pointerEvents = 'none';
            } else {
                outPort.addEventListener('mousedown', (event) => DragManager.startLinkDrag(event, nodeTag, false));
            }

            const del = document.createElement('div');
            del.textContent = '×';
            del.style.position = 'absolute';
            del.style.top = '2px';
            del.style.right = '2px';
            del.style.cursor = 'pointer';
            del.style.color = 'var(--text-muted)';
            del.style.fontSize = '10px';
            del.addEventListener('click', (event) => {
                event.stopPropagation();
                deletePlacementNode(layer.id, node.id);
            });

            nodeEl.append(inPort, icon, tagEl, outPort, del);

            nodeEl.addEventListener('mousedown', (e) => { e.stopPropagation(); });
            nodeEl.addEventListener('click', (e) => {
                if (!e.target.classList.contains('port')) openConfig(node, layer.id);
            });
            nodesGrid.appendChild(nodeEl);
        };

        layer.nodes.forEach(appendNodeCard);

        layerEl.append(header, nodesGrid);
        nodesLayer.appendChild(layerEl);
    });

    const endContainer = document.createElement('div');
    endContainer.className = 'system-node-container';
    endContainer.dataset.label = 'INTERNET';

    const internetEl = document.createElement('div');
    internetEl.className = 'system-node end';
    internetEl.id = 'system-internet';
    internetEl.dataset.nodeTag = 'direct';

    const internetTitle = document.createElement('div');
    internetTitle.textContent = 'Internet';
    const internetHint = document.createElement('div');
    internetHint.style.fontSize = '10px';
    internetHint.style.opacity = '0.7';
    internetHint.textContent = 'Exit';

    const internetInPort = document.createElement('div');
    internetInPort.className = 'port in';
    internetInPort.dataset.tag = 'direct';

    internetEl.append(internetTitle, internetHint, internetInPort);
    endContainer.appendChild(internetEl);
    nodesLayer.appendChild(endContainer);
    
    // Run multiple passes to avoid transient misalignment (layout/scroll timing)
    const redraw = () => drawConnections(svgLayer);
    requestAnimationFrame(() => {
        requestAnimationFrame(redraw); // after layout settles
    });
    setTimeout(redraw, 60); // fallback in case of delayed fonts/layout
    updateConfigEditor();
    renderNodeLibrary();
}

function renderNodeLibrary() {
    const listEl = document.getElementById('node-library-list');
    if (!listEl) return;

    listEl.replaceChildren();

    if (!appState.nodeLibrary || appState.nodeLibrary.length === 0) {
        const li = document.createElement('li');
        li.style.color = '#666';
        li.style.fontSize = '11px';
        li.style.padding = '10px';
        li.style.textAlign = 'center';
        li.textContent = 'No nodes yet';
        listEl.appendChild(li);
        return;
    }

    appState.nodeLibrary.forEach(node => {
        if (!node || node.tag === 'direct') return;
        const li = document.createElement('li');
        li.className = 'node-lib-item';
        li.draggable = true;
        li.title = 'Drag to a hop to add';
        li.ondragstart = (e) => DragManager.startLibraryDrag(e, node.tag);
        li.ondragend = () => document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';

        const left = document.createElement('div');
        const tagEl = document.createElement('div');
        tagEl.className = 'node-lib-tag';
        tagEl.textContent = node.tag;
        const typeEl = document.createElement('div');
        typeEl.style.fontSize = '10px';
        typeEl.style.color = '#666';
        typeEl.style.marginTop = '2px';
        typeEl.textContent = node.type || 'unknown';
        left.append(tagEl, typeEl);

        const right = document.createElement('div');
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-xs';
        editBtn.style.padding = '2px 6px';
        editBtn.style.marginRight = '4px';
        editBtn.textContent = '✎';
        editBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            openNodeEditor(node.tag);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'btn-xs btn-danger-text';
        delBtn.style.padding = '2px 6px';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteLibraryNode(node.tag);
        });

        right.append(editBtn, delBtn);
        row.append(left, right);
        li.appendChild(row);
        listEl.appendChild(li);
    });
}

function drawConnections(svgEl) {
    // Cyberpunk Arrow and Gradients
    svgEl.innerHTML = `
    <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="#00f3ff" opacity="0.8" />
        </marker>
        <marker id="arrow-hover" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="#00f3ff" />
        </marker>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:rgba(0, 243, 255, 0.3);stop-opacity:1" />
            <stop offset="50%" style="stop-color:rgba(0, 243, 255, 0.6);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(188, 19, 254, 0.4);stop-opacity:1" />
        </linearGradient>
        <linearGradient id="lineGradientHover" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:rgba(0, 243, 255, 0.9);stop-opacity:1" />
            <stop offset="50%" style="stop-color:rgba(0, 243, 255, 1);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgba(188, 19, 254, 0.8);stop-opacity:1" />
        </linearGradient>
        <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
            </feMerge>
        </filter>
    </defs>`;

    const tagMap = new Map();
    const nodesLayer = document.getElementById('nodes-layer');
    if (nodesLayer) {
        nodesLayer.querySelectorAll('[data-node-tag]').forEach(el => {
            const tag = el.dataset.nodeTag;
            if (tag) tagMap.set(tag, el);
        });
    }

    const drawForNode = (sourceTag, detours) => {
        const sourceEl = tagMap.get(sourceTag);
        if (!sourceEl) {
            console.warn(`Source element not found for tag: ${sourceTag}`);
            return;
        }
        detours.forEach(targetTag => {
            const targetEl = tagMap.get(targetTag);
            if (!targetEl) {
                console.warn(`Target element not found for tag: ${targetTag}`);
                return;
            }
            drawCurve(svgEl, sourceEl, targetEl, sourceTag, targetTag);
        });
    };

    if (appState.inbounds) {
        appState.inbounds.forEach(ib => {
            if (ib.detours && ib.detours.length > 0) drawForNode(ib.tag, ib.detours);
        });
    }

    appState.layers.forEach(l => l.nodes.forEach(sourceNode => {
        if (sourceNode.detours && sourceNode.detours.length > 0) {
            drawForNode(getNodeTag(sourceNode), sourceNode.detours);
        }
    }));
}

function drawCurve(svg, startEl, endEl, sourceTag, targetTag) {
    const svgRect = svg.getBoundingClientRect();
    const startRect = startEl.getBoundingClientRect();
    const endRect = endEl.getBoundingClientRect();

    const outPort = startEl.querySelector('.port.out');
    const inPort = endEl.querySelector('.port.in');

    let x1, y1, x2, y2;

    if (outPort) {
        const p = outPort.getBoundingClientRect();
        x1 = p.left - svgRect.left + p.width / 2;
        y1 = p.top - svgRect.top + p.height / 2;
    } else {
        x1 = startRect.left - svgRect.left + startRect.width / 2;
        y1 = startRect.top - svgRect.top + startRect.height;
    }

    if (inPort) {
        const p = inPort.getBoundingClientRect();
        x2 = p.left - svgRect.left + p.width / 2;
        y2 = p.top - svgRect.top + p.height / 2;
    } else {
        x2 = endRect.left - svgRect.left + endRect.width / 2;
        y2 = endRect.top - svgRect.top;
    }

    const dy = Math.abs(y2 - y1);
    const d = `M ${x1} ${y1} C ${x1} ${y1 + dy * 0.5}, ${x2} ${y2 - dy * 0.5}, ${x2} ${y2}`;

    // Main path (gradient, semi-transparent)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', 'url(#lineGradient)');
    path.setAttribute('stroke-width', '3.5');  // main line width
    path.setAttribute('fill', 'none');
    path.setAttribute('marker-end', 'url(#arrow)');
    path.style.transition = 'all 0.3s';
    path.style.pointerEvents = 'none';

    // Flow path (animated glow effect)
    const flowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    flowPath.classList.add('flow-path');
    flowPath.setAttribute('d', d);
    flowPath.setAttribute('stroke', '#00f3ff');
    flowPath.setAttribute('stroke-width', '4');  // glow line width
    flowPath.setAttribute('stroke-dasharray', '14 26');
    flowPath.setAttribute('stroke-dashoffset', '0');
    flowPath.setAttribute('fill', 'none');
    flowPath.setAttribute('stroke-linecap', 'round');
    flowPath.style.pointerEvents = 'none';
    flowPath.style.filter = 'drop-shadow(0 0 4px rgba(0, 243, 255, 0.8))';
    flowPath.style.opacity = '0.7';

    const flowAnim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    flowAnim.setAttribute('attributeName', 'stroke-dashoffset');
    flowAnim.setAttribute('from', '0');
    flowAnim.setAttribute('to', '-40');
    flowAnim.setAttribute('dur', '1.15s');
    flowAnim.setAttribute('repeatCount', 'indefinite');
    flowPath.appendChild(flowAnim);

    // Append glow layer
    svg.appendChild(flowPath);

    // Hover effects
    svg.appendChild(path);

    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('stroke', 'rgba(0, 0, 0, 0)');
    hitPath.setAttribute('stroke-width', '14');
    hitPath.setAttribute('fill', 'none');
    hitPath.style.cursor = 'pointer';
    hitPath.style.pointerEvents = 'stroke';
    hitPath.style.strokeLinecap = 'round';

    const setHover = (on) => {
        if (on) {
            path.setAttribute('stroke', 'url(#lineGradientHover)');
            path.setAttribute('stroke-width', '4.5');
            path.setAttribute('filter', 'url(#glow)');
            path.setAttribute('marker-end', 'url(#arrow-hover)');
            flowPath.setAttribute('stroke-width', '5');
            flowPath.style.filter = 'drop-shadow(0 0 8px rgba(0, 243, 255, 1))';
            flowPath.style.opacity = '1';
        } else {
            path.setAttribute('stroke', 'url(#lineGradient)');
            path.setAttribute('stroke-width', '3.5');
            path.removeAttribute('filter');
            path.setAttribute('marker-end', 'url(#arrow)');
            flowPath.setAttribute('stroke-width', '4');
            flowPath.style.filter = 'drop-shadow(0 0 4px rgba(0, 243, 255, 0.8))';
            flowPath.style.opacity = '0.7';
        }
    };

    hitPath.onmouseover = () => setHover(true);
    hitPath.onmouseout = () => setHover(false);
    hitPath.onclick = (e) => {
        e.stopPropagation();
        deleteConnection(sourceTag, targetTag);
    };

    svg.appendChild(hitPath);
}

function deleteConnection(sourceTag, targetTag) {
    let found = false;

    // Check in inbounds
    if (appState.inbounds) {
        appState.inbounds.forEach(ib => {
            if (ib.tag === sourceTag && ib.detours) {
                const idx = ib.detours.indexOf(targetTag);
                if (idx !== -1) {
                    ib.detours.splice(idx, 1);
                    if (ib.selectorDefault === targetTag) {
                        ib.selectorDefault = ib.detours.length > 0 ? ib.detours[0] : null;
                    }
                    found = true;
                }
            }
        });
    }

    // Check in layer nodes
    appState.layers.forEach(layer => {
        layer.nodes.forEach(node => {
            const tag = getNodeTag(node);
            if (tag === sourceTag && node.detours) {
                const idx = node.detours.indexOf(targetTag);
                if (idx !== -1) {
                    node.detours.splice(idx, 1);
                    found = true;
                }
            }
        });
    });

    if (found) {
        render();
        scheduleRedraw();
        updateConfigEditor();
        saveCurrentProfile();
        log(`Connection deleted: ${sourceTag} → ${targetTag}`, 'success');
    } else {
        log(`Connection not found: ${sourceTag} → ${targetTag}`, 'error');
    }
}

function getTypeIcon(type) {
    const map = { 'mixed':'🚪','selector':'🔀','urltest':'⚡','roundrobin':'⟳','direct':'🌐','block':'🚫','shadowsocks':'🔒','vmess':'V','vless':'L','hysteria2':'H2','trojan':'T','socks':'🧦','http':'H' };
    return map[type] || '?';
}

// --- Operations ---
async function addLayer() {
    const newLayer = { id: 'layer-' + Date.now(), title: 'Layer', nodes: [] };
    if (appState.layers.length > 1) appState.layers.splice(appState.layers.length - 1, 0, newLayer);
    else appState.layers.push(newLayer);
    render();
    scheduleRedraw(); // ensure connections redraw after layout shift
    updateConfigEditor();
    await saveCurrentProfile(); // Ensure this function exists!
    log("Added new layer", "success");
}

function deleteLayer(layerId) {
    appState.layers = appState.layers.filter(l => l.id !== layerId);
    render();
    scheduleRedraw(); // keep lines in sync after removing a hop
    updateConfigEditor();
    saveCurrentProfile();
    log(`Deleted layer ${layerId}`, 'success');
}

function deletePlacementNode(layerId, nodeId) {
    const layer = appState.layers.find(l => l.id === layerId);
    if (!layer) return;
    layer.nodes = layer.nodes.filter(n => n.id !== nodeId);
    render();
    scheduleRedraw();
    updateConfigEditor();
    saveCurrentProfile();
    log(`Deleted node from layer ${layerId}`, 'success');
}

function addNodeToLayer(layerId) {
    const layer = appState.layers.find(l => l.id === layerId);
    if (!layer) return;
    if (!appState.nodeLibrary || appState.nodeLibrary.length === 0) {
        log("No nodes in library. Create one from sidebar first.", "error");
        return;
    }
    appState.nodePickerLayerId = layerId;
    if (nodePickerSelect) {
        nodePickerSelect.innerHTML = '';
        const placed = new Set();
        (appState.layers || []).forEach(l => (l.nodes || []).forEach(n => { if (n && n.tag) placed.add(n.tag); }));
        appState.nodeLibrary.forEach(n => {
            if (!n || !n.tag) return;
            if (n.tag === 'direct') return;
            if (placed.has(n.tag)) return;
            const opt = document.createElement('option');
            opt.value = n.tag;
            opt.textContent = `${n.tag} (${n.type || 'unknown'})`;
            nodePickerSelect.appendChild(opt);
        });
    }
    if (!nodePickerSelect || nodePickerSelect.options.length === 0) {
        log("All library nodes are already placed. Create a new one first.", "warning");
        appState.nodePickerLayerId = null;
        return;
    }
    if (ModalControllers.nodePicker) ModalControllers.nodePicker.open();
}

function confirmNodePicker() {
    if (!appState.nodePickerLayerId) return closeNodePicker();
    const layer = appState.layers.find(l => l.id === appState.nodePickerLayerId);
    if (!layer) return closeNodePicker();
    const tag = nodePickerSelect ? nodePickerSelect.value : null;
    const def = findNodeDefinition(tag);
    if (!def) {
        log("Please choose a node from the list.", "error");
        return;
    }
    if (def.tag === 'direct') {
        log('Cannot place the "direct" node. Use the Internet node instead.', "error");
        return;
    }
    if (isTagPlaced(def.tag)) {
        log(`Node "${def.tag}" is already placed. Duplicate placements are not allowed.`, "error");
        return;
    }
    const newNode = { id: 'node-' + Date.now(), tag: def.tag, detours: [] };
    layer.nodes.push(newNode);
    closeNodePicker();
    render();
    saveCurrentProfile();
}

function closeNodePicker() {
    appState.nodePickerLayerId = null;
    if (ModalControllers.nodePicker) ModalControllers.nodePicker.close();
}

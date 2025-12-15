// --- Drag & Interaction Manager ---
const DragManager = {
    state: {
        draggingType: null, // 'layer' | 'node' | 'link'
        sourceId: null,     // layerId or nodeId or tag
        sourceLayerId: null, // for node drag
        linkStart: null,    // {x, y, tag, isSystemStart}
        tempLine: null
    },

    init(svgLayer) {
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.svgLayer = svgLayer;
    },

    startLayerDrag(e, layerIndex) {
        if (e.target.closest('.node-card') || e.target.closest('.btn-xs')) return; // Ignore if clicking node or button
        this.state.draggingType = 'layer';
        this.state.sourceId = layerIndex;
        e.dataTransfer.effectAllowed = 'move';
        e.target.style.opacity = '0.4';
    },

    startNodeDrag(e, nodeId, layerId) {
        e.stopPropagation(); // Stop layer drag
        this.state.draggingType = 'node';
        this.state.sourceId = nodeId;
        this.state.sourceLayerId = layerId;
        e.dataTransfer.effectAllowed = 'move';
        e.target.style.opacity = '0.6';
    },

    startLibraryDrag(e, tag) {
        this.state.draggingType = 'library';
        this.state.sourceId = tag;
        this.state.sourceLayerId = null;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', tag);
        }
    },

    startLinkDrag(e, tag, isSystemStart) {
        e.stopPropagation();
        e.preventDefault(); // Prevent native drag
        const rect = e.target.getBoundingClientRect();
        this.state.draggingType = 'link';
        this.state.linkStart = {
            tag,
            isSystemStart,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    },

    onDragOver(e, targetType, targetId) {
        e.preventDefault();
        if (targetType !== 'layer') return;
        const dragging = this.state.draggingType;
        if (!dragging || dragging === 'link') return;
        const selector = dragging === 'layer'
            ? `.layer-container[data-index="${targetId}"]`
            : `.layer-container[data-id="${targetId}"]`;
        const el = document.querySelector(selector) || e.currentTarget?.closest('.layer-container');
        if (el) el.classList.add('drag-over');
    },

    onDragLeave(e) {
        if (e.target.classList.contains('layer-container')) {
            e.target.classList.remove('drag-over');
        }
    },

    onDrop(e, targetType, targetId) {
        e.preventDefault();
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        
        if (this.state.draggingType === 'layer' && targetType === 'layer') {
            const src = this.state.sourceId;
            const tgt = targetId;
            if (src !== null && src !== tgt) {
                const item = appState.layers.splice(src, 1)[0];
                appState.layers.splice(tgt, 0, item);
                render();
                saveCurrentProfile();
            }
        } else if (this.state.draggingType === 'node' && targetType === 'layer') {
            // Node moved to (possibly different) layer
            const srcLayer = appState.layers.find(l => l.id === this.state.sourceLayerId);
            const tgtLayer = appState.layers.find(l => l.id === targetId);
            if (srcLayer && tgtLayer) {
                const nodeIndex = srcLayer.nodes.findIndex(n => n.id === this.state.sourceId);
                if (nodeIndex > -1) {
                    const node = srcLayer.nodes.splice(nodeIndex, 1)[0];
                    tgtLayer.nodes.push(node);
                    render();
                    saveCurrentProfile();
                }
            }
        } else if (this.state.draggingType === 'library' && targetType === 'layer') {
            const tgtLayer = appState.layers.find(l => l.id === targetId);
            const def = findNodeDefinition(this.state.sourceId);
            if (tgtLayer && def) {
                if (def.tag === 'direct') {
                    log('Cannot place the "direct" node. Use the Internet node instead.', 'error');
                    return;
                }
                if (isTagPlaced(def.tag)) {
                    log(`Node "${def.tag}" is already placed. Duplicate placements are not allowed.`, 'error');
                    return;
                }
                const newNode = { id: 'node-' + Date.now(), tag: def.tag, detours: [] };
                tgtLayer.nodes.push(newNode);
                render();
                saveCurrentProfile();
                log(`Added ${def.tag} to layer`, 'success');
            }
        }
        
        // Reset
        this.state.draggingType = null;
        this.state.sourceId = null;
        if (e.target.style) e.target.style.opacity = '1';
    },

    onMouseMove(e) {
        if (this.state.draggingType !== 'link' || !this.state.linkStart) return;
        
        // Draw temp line
        if (!this.state.tempLine) {
            this.state.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            this.state.tempLine.setAttribute('stroke', '#00f3ff');
            this.state.tempLine.setAttribute('stroke-width', '2');
            this.state.tempLine.setAttribute('stroke-dasharray', '8,4');
            this.state.tempLine.setAttribute('fill', 'none');
            this.state.tempLine.setAttribute('opacity', '0.8');
            this.state.tempLine.style.filter = 'drop-shadow(0 0 6px rgba(0, 243, 255, 0.8))';
            this.svgLayer.appendChild(this.state.tempLine);
        }

        const svgRect = this.svgLayer.getBoundingClientRect();
        const startX = this.state.linkStart.x - svgRect.left;
        const startY = this.state.linkStart.y - svgRect.top;
        const endX = e.clientX - svgRect.left;
        const endY = e.clientY - svgRect.top;

        const d = `M ${startX} ${startY} L ${endX} ${endY}`;
        this.state.tempLine.setAttribute('d', d);
    },

    onMouseUp(e) {
        if (this.state.draggingType === 'link') {
            // Check if dropped on a port
            const target = e.target;
            if (target.classList.contains('port') && target.classList.contains('in')) {
                const targetTag = target.dataset.tag; // Ensure we put tag on dataset
                this.completeLink(targetTag);
            }

            // Cleanup
            if (this.state.tempLine) {
                this.state.tempLine.remove();
                this.state.tempLine = null;
            }
            this.state.draggingType = null;
            this.state.linkStart = null;
        }
    },

    completeLink(targetTag) {
        const sourceTag = this.state.linkStart.tag;
        if (sourceTag === targetTag) return;
        const isInternetTarget = targetTag === 'direct';

        // Helper: Get layer index of a node
        const getLayerIndex = (tag) => {
            for (let i = 0; i < appState.layers.length; i++) {
                const found = appState.layers[i].nodes.find(n => n.tag === tag);
                if (found) return i;
            }
            return -1;
        };

        // Inbound Source
        if (this.state.linkStart.isSystemStart) {
            const inbound = appState.inbounds.find(i => i.tag === sourceTag);
            if (inbound) {
                if (isInternetTarget) {
                    log('Connection blocked: Inbound cannot connect to Internet directly. Connect to HOP 1.', 'error');
                    return;
                }
                if (!isInternetTarget) {
                    const targetLayerIndex = getLayerIndex(targetTag);
                    if (targetLayerIndex !== 0) {
                        log(`Connection blocked: Inbound -> ${targetTag} (must connect to HOP 1)`, 'error');
                        return;
                    }
                }

                if (!inbound.detours) inbound.detours = [];
                if (!inbound.detours.includes(targetTag)) {
                    inbound.detours.push(targetTag);

                    // Warn if inbound has multiple detours
                    if (inbound.detours.length > 1) {
                        log(`⚠️  Warning: Inbound ${sourceTag} has ${inbound.detours.length} connections. A selector will be created.`, 'info');
                    }

                    render();
                    saveCurrentProfile();
                    log(`Linked [In] ${sourceTag} -> ${targetTag}`, 'success');
                }
            }
            return;
        }

        // Node Source
        let sourceNode = null;
        let sourceLayerIndex = -1;
        for (let i = 0; i < appState.layers.length; i++) {
            const found = appState.layers[i].nodes.find(n => n.tag === sourceTag);
            if (found) {
                sourceNode = found;
                sourceLayerIndex = i;
                break;
            }
        }
        if (!sourceNode) return;

        const sourceType = getNodeType(sourceNode);
        const isRoundRobin = sourceType === 'roundrobin';
        const isSelectorLike = sourceType === 'selector' || sourceType === 'urltest' || isRoundRobin;

        const isManagedByRoundRobin = () => {
            const parentLayerIndex = sourceLayerIndex - 1;
            if (parentLayerIndex < 0) return false;
            const parentLayer = appState.layers[parentLayerIndex];
            if (!parentLayer || !Array.isArray(parentLayer.nodes)) return false;

            return parentLayer.nodes.some(p => {
                if (!p || getNodeType(p) !== 'roundrobin') return false;
                const detours = Array.isArray(p.detours) ? p.detours.filter(Boolean) : [];
                if (!detours.includes(sourceTag)) return false;

                return detours.some(d => {
                    if (d === 'direct') return parentLayerIndex === (appState.layers.length - 2);
                    return getLayerIndex(d) === parentLayerIndex + 2;
                });
            });
        };

        if (!isRoundRobin && isManagedByRoundRobin()) {
            log(`Connection blocked: ${sourceTag} is managed by a Round Robin node. Connect from the Round Robin node instead.`, 'error');
            return;
        }

        if (isRoundRobin) {
            if (isInternetTarget) {
                if (sourceLayerIndex !== (appState.layers.length - 2)) {
                    const sourceHop = sourceLayerIndex + 1;
                    log(`Connection blocked: ${sourceTag} (HOP ${sourceHop}) -> Internet. Round Robin can connect to Internet only when its pool is in the last hop.`, 'error');
                    return;
                }
            } else {
                const targetLayerIndex = getLayerIndex(targetTag);
                const isPoolLink = targetLayerIndex === sourceLayerIndex + 1;
                const isOutputLink = targetLayerIndex === sourceLayerIndex + 2;
                if (!isPoolLink && !isOutputLink) {
                    const sourceHop = sourceLayerIndex + 1;
                    const targetHop = targetLayerIndex + 1;
                    log(`Connection blocked: ${sourceTag} (HOP ${sourceHop}) -> ${targetTag} (HOP ${targetHop}). Round Robin can link to pool (next hop) or output (HOP +2).`, 'error');
                    return;
                }
            }
        } else {
            if (!isInternetTarget) {
                const targetLayerIndex = getLayerIndex(targetTag);
                if (targetLayerIndex !== sourceLayerIndex + 1) {
                    const sourceHop = sourceLayerIndex + 1;
                    const targetHop = targetLayerIndex + 1;
                    log(`Connection blocked: ${sourceTag} (HOP ${sourceHop}) -> ${targetTag} (HOP ${targetHop}); must connect to HOP ${sourceHop + 1}`, 'error');
                    return;
                }
            } else {
                const isLastHop = sourceLayerIndex === (appState.layers.length - 1);
                if (!isLastHop) {
                    const sourceHop = sourceLayerIndex + 1;
                    log(`Connection blocked: ${sourceTag} (HOP ${sourceHop}) -> Internet (must connect to next hop)`, 'error');
                    return;
                }
            }
        }

        if (!sourceNode.detours) sourceNode.detours = [];
        if (isRoundRobin) {
            const isAfterTarget = isInternetTarget || (getLayerIndex(targetTag) === sourceLayerIndex + 2);
            if (isAfterTarget) {
                sourceNode.detours = (sourceNode.detours || []).filter(d => {
                    if (!d) return false;
                    if (d === 'direct') return false;
                    return getLayerIndex(d) !== sourceLayerIndex + 2;
                });
                sourceNode.detours.push(targetTag);
            } else {
                if (!sourceNode.detours.includes(targetTag)) {
                    sourceNode.detours.push(targetTag);
                }
            }
        } else if (isSelectorLike) {
            if (!sourceNode.detours.includes(targetTag)) {
                sourceNode.detours.push(targetTag);
            }
        } else {
            sourceNode.detours = [targetTag];
        }
        render();
        saveCurrentProfile();
        log(`Linked ${sourceTag} -> ${targetTag}`, 'success');
    }
};

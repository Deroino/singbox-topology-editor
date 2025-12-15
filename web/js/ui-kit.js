(() => {
    const modals = new Map();
    const drawers = new Map();

    const anyOpen = () => {
        for (const m of modals.values()) {
            if (m.el.classList.contains('show')) return true;
        }
        for (const d of drawers.values()) {
            if (d.panel.classList.contains('open')) return true;
        }
        return false;
    };

    const lockScroll = () => document.body.classList.add('modal-open');
    const unlockScroll = () => {
        if (!anyOpen()) document.body.classList.remove('modal-open');
    };

    function registerModal(key, el, opts = {}) {
        if (!el) return null;
        if (modals.has(key)) return modals.get(key).api;
        const state = {
            el,
            onOpen: opts.onOpen,
            onClose: opts.onClose
        };
        const api = {
            open() {
                state.el.classList.add('show');
                lockScroll();
                state.onOpen && state.onOpen();
            },
            close() {
                state.el.classList.remove('show');
                state.onClose && state.onClose();
                unlockScroll();
            },
            isOpen() {
                return state.el.classList.contains('show');
            }
        };
        modals.set(key, { ...state, api });
        return api;
    }

    function registerDrawer(key, panel, overlay, opts = {}) {
        if (!panel) return null;
        if (drawers.has(key)) return drawers.get(key).api;
        const state = { panel, overlay, onOpen: opts.onOpen, onClose: opts.onClose };
        const api = {
            open() {
                state.panel.classList.add('open');
                if (state.overlay) {
                    state.overlay.classList.add('open');
                    if (!state.overlay.dataset.bound) {
                        state.overlay.addEventListener('click', () => api.close());
                        state.overlay.dataset.bound = 'true';
                    }
                }
                lockScroll();
                state.onOpen && state.onOpen();
            },
            close() {
                state.panel.classList.remove('open');
                if (state.overlay) state.overlay.classList.remove('open');
                state.onClose && state.onClose();
                unlockScroll();
            },
            isOpen() {
                return state.panel.classList.contains('open');
            }
        };
        drawers.set(key, { ...state, api });
        return api;
    }

    window.UIKit = {
        registerModal,
        registerDrawer
    };
})();

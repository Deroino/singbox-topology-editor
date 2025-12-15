(() => {
    'use strict';

    window.DragManager = DragManager;

    window.addLayer = addLayer;
    window.deleteLayer = deleteLayer;
    window.addNodeToLayer = addNodeToLayer;
    window.confirmNodePicker = confirmNodePicker;
    window.closeNodePicker = closeNodePicker;
    window.deletePlacementNode = deletePlacementNode;

    window.openInboundModal = openInboundModal;
    window.closeInboundModal = closeInboundModal;
    window.confirmInbound = confirmInbound;
    window.deleteInbound = deleteInbound;

    window.openSelectorModal = openSelectorModal;
    window.closeSelectorModal = closeSelectorModal;
    window.saveSelectorConfig = saveSelectorConfig;

    window.openConfigPanel = openConfigPanel;
    window.closeConfigPanel = closeConfigPanel;

    window.openNodeEditor = openNodeEditor;
    window.deleteCurrentNode = deleteCurrentNode;
    window.saveNodeConfig = saveNodeConfig;
    window.closeModal = closeModal;
    window.updateFormFields = updateFormFields;
    window.deleteLibraryNode = deleteLibraryNode;
    window.unlinkNode = unlinkNode;

    window.createNewProfile = createNewProfile;
    window.deleteProfile = deleteProfile;

    window.restartCore = restartCore;
    window.exportConfig = exportConfig;
    window.toggleService = toggleService;

    window.openImportModal = openImportModal;
    window.closeImportModal = closeImportModal;
    window.confirmImport = confirmImport;

    window.toggleConsole = toggleConsole;
    window.clearConsole = clearConsole;
    window.toggleSidebar = toggleSidebar;

    init();
})();

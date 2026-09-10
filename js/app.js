/**
 * Kiosk Dashboard - Main Application Logic
 * ==========================================
 * Handles grid initialization, widget management, 
 * layout save/load, and status monitoring.
 */

// ============================================
// Global State
// ============================================
const AppState = {
    isEditMode: false,
    gridStep: 10,
    dashboardWidth: 1920,
    dashboardHeight: 1080,
    gridColumnCount: 24, // Based on 1920px / 80px per column (default)
    lastDataUpdate: null,
    dataTimeoutMinutes: 5,
    charts: {} // Store chart instances by widget ID
};

// ============================================
// Gridstack Instance
// ============================================
let grid = null;

// ============================================
// DOM Elements
// ============================================
let elements = {};

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard initializing...');
    
    // Cache DOM elements
    cacheElements();
    
    // Initialize Gridstack
    initGridstack();
    
    // Setup event listeners
    setupEventListeners();
    
    // Start status monitoring
    startStatusMonitoring();
    
    // Try to load saved layout from localStorage
    loadLayoutFromStorage();
    
    // Hide add widget button by default (only visible in edit mode)
    elements.btnAddWidget.style.display = 'none';
    
    console.log('Dashboard initialized successfully');
});

/**
 * Cache DOM elements for faster access
 */
function cacheElements() {
    elements = {
        toolbar: document.getElementById('toolbar'),
        btnEditMode: document.getElementById('btn-edit-mode'),
        btnAddWidget: document.getElementById('btn-add-widget'),
        btnSaveLayout: document.getElementById('btn-save-layout'),
        btnLoadLayout: document.getElementById('btn-load-layout'),
        fileInput: document.getElementById('file-input'),
        gridStepSelect: document.getElementById('grid-step'),
        statusIndicator: document.getElementById('status-indicator'),
        statusText: document.getElementById('status-text'),
        dashboardContainer: document.getElementById('dashboard-container'),
        gridStack: document.getElementById('grid-stack'),
        modalOverlay: document.getElementById('modal-overlay'),
        addWidgetForm: document.getElementById('add-widget-form'),
        btnCancelModal: document.getElementById('btn-cancel-modal'),
        widgetIdInput: document.getElementById('widget-id'),
        widgetWidthInput: document.getElementById('widget-width'),
        widgetHeightInput: document.getElementById('widget-height'),
        widgetTypeSelect: document.getElementById('widget-type')
    };
}

/**
 * Initialize Gridstack with configuration
 */
function initGridstack() {
    const cellHeight = AppState.gridStep * 8; // Base cell height
    
    grid = GridStack.init({
        column: AppState.gridColumnCount,
        cellHeight: cellHeight,
        margin: 5,
        float: true,
        disableResize: !AppState.isEditMode,
        disableDrag: !AppState.isEditMode,
        animate: true,
        removable: '.trash',
        removeTimeout: 100,
        handle: '.grid-stack-item-content',
        resizable: {
            handles: 'e, se, s, sw, w'
        }
    }, elements.gridStack);
    
    // Apply edit mode styling
    updateEditModeStyles();
    
    console.log(`Gridstack initialized with ${AppState.gridColumnCount} columns, cell height: ${cellHeight}px`);
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Edit mode toggle
    elements.btnEditMode.addEventListener('click', toggleEditMode);
    
    // Add widget button
    elements.btnAddWidget.addEventListener('click', showAddWidgetModal);
    
    // Save layout button
    elements.btnSaveLayout.addEventListener('click', saveLayoutToFile);
    
    // Load layout button
    elements.btnLoadLayout.addEventListener('click', () => {
        elements.fileInput.click();
    });
    
    // File input change (load layout)
    elements.fileInput.addEventListener('change', handleFileLoad);
    
    // Grid step change
    elements.gridStepSelect.addEventListener('change', handleGridStepChange);
    
    // Modal form submit
    elements.addWidgetForm.addEventListener('submit', handleAddWidgetSubmit);
    
    // Modal cancel
    elements.btnCancelModal.addEventListener('click', hideAddWidgetModal);
    
    // Close modal on overlay click
    elements.modalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.modalOverlay) {
            hideAddWidgetModal();
        }
    });
    
    // Online/Offline events
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
}

// ============================================
// Edit Mode Management
// ============================================

/**
 * Toggle edit mode on/off
 */
function toggleEditMode() {
    AppState.isEditMode = !AppState.isEditMode;
    
    // Update button state
    elements.btnEditMode.classList.toggle('active', AppState.isEditMode);
    elements.btnEditMode.innerHTML = AppState.isEditMode 
        ? '<i class="fas fa-check"></i> Готово' 
        : '<i class="fas fa-edit"></i> Редактирование';
    
    // Show/hide add widget button
    elements.btnAddWidget.style.display = AppState.isEditMode ? 'inline-flex' : 'none';
    
    // Enable/disable gridstack interactions
    if (AppState.isEditMode) {
        grid.enableMove(true);
        grid.enableResize(true);
        elements.dashboardContainer.classList.add('edit-mode');
    } else {
        grid.enableMove(false);
        grid.enableResize(false);
        elements.dashboardContainer.classList.remove('edit-mode');
    }
    
    updateEditModeStyles();
    console.log(`Edit mode: ${AppState.isEditMode ? 'ON' : 'OFF'}`);
}

/**
 * Update styles based on edit mode
 */
function updateEditModeStyles() {
    const items = document.querySelectorAll('.grid-stack-item');
    items.forEach(item => {
        const content = item.querySelector('.grid-stack-item-content');
        if (content) {
            // Show/hide action buttons
            const actions = content.querySelector('.widget-actions');
            if (actions) {
                actions.style.display = AppState.isEditMode ? 'flex' : 'none';
            }
        }
    });
}

// ============================================
// Widget Management
// ============================================

/**
 * Show modal for adding new widget
 */
function showAddWidgetModal() {
    if (!AppState.isEditMode) {
        console.warn('Cannot add widget: edit mode is disabled');
        return;
    }
    elements.widgetIdInput.value = 'widget_' + Date.now();
    elements.modalOverlay.style.display = 'flex';
    elements.widgetIdInput.focus();
}

/**
 * Hide add widget modal
 */
function hideAddWidgetModal() {
    elements.modalOverlay.style.display = 'none';
    elements.addWidgetForm.reset();
}

/**
 * Handle add widget form submission
 */
function handleAddWidgetSubmit(e) {
    e.preventDefault();
    
    const widgetId = elements.widgetIdInput.value.trim();
    const width = parseInt(elements.widgetWidthInput.value) || 4;
    const height = parseInt(elements.widgetHeightInput.value) || 3;
    const type = elements.widgetTypeSelect.value;
    
    if (!widgetId) {
        alert('Введите ID виджета');
        return;
    }
    
    // Check if widget with this ID already exists
    const existingWidget = grid.engine.nodes.find(n => n.id === widgetId);
    if (existingWidget) {
        alert('Виджет с таким ID уже существует');
        return;
    }
    
    // Temporarily enable edit mode if not already enabled
    const wasEditMode = AppState.isEditMode;
    if (!wasEditMode) {
        grid.enableMove(true);
        grid.enableResize(true);
    }
    
    // Add widget to grid
    addWidget(widgetId, width, height, type);
    
    // Restore previous edit mode state
    if (!wasEditMode) {
        grid.enableMove(false);
        grid.enableResize(false);
    } else {
        // If already in edit mode, ensure drag handles are updated
        updateEditModeStyles();
    }
    
    hideAddWidgetModal();
    console.log(`Widget added: ${widgetId} (${width}x${height})`);
}

/**
 * Add a widget to the grid
 */
function addWidget(id, width, height, type, x = null, y = null) {
    const widgetNode = {
        id: id,
        x: x,
        y: y,
        w: width,
        h: height,
        content: createWidgetContent(id, type)
    };
    
    grid.addWidget(widgetNode);
    
    // Update edit mode styles to show drag handles
    updateEditModeStyles();
    
    // Initialize widget-specific functionality
    initializeWidget(id, type);
}

/**
 * Create HTML content for widget
 */
function createWidgetContent(id, type) {
    return `
        <div class="grid-stack-item-content">
            <div class="widget-header">
                <span class="widget-title">${id}</span>
                <div class="widget-actions">
                    <button class="widget-action-btn" title="Настройки" onclick="configureWidget('${id}')">
                        <i class="fas fa-cog"></i>
                    </button>
                    <button class="widget-action-btn delete-btn" title="Удалить" onclick="deleteWidget('${id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="widget-body">
                <div class="widget-status-border status-green"></div>
            </div>
        </div>
    `;
}

/**
 * Initialize widget-specific functionality
 */
function initializeWidget(id, type) {
    if (type === 'chart') {
        initChart(id);
    }
}

/**
 * Initialize a Chart.js chart for a widget
 */
function initChart(widgetId) {
    const canvas = document.getElementById(`chart-${widgetId}`);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Resize canvas to fit container
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'],
            datasets: [{
                label: 'Данные',
                data: [12, 19, 3, 5, 2, 3],
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: 'white'
                    }
                }
            },
            scales: {
                y: {
                    ticks: {
                        color: 'white'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: 'white'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
    
    AppState.charts[widgetId] = chart;
}

/**
 * Delete a widget from the grid
 */
function deleteWidget(widgetId) {
    if (!confirm(`Удалить виджет "${widgetId}"?`)) return;
    
    const node = grid.engine.nodes.find(n => n.id === widgetId);
    if (node) {
        grid.removeWidget(node.el);
        
        // Destroy chart if exists
        if (AppState.charts[widgetId]) {
            AppState.charts[widgetId].destroy();
            delete AppState.charts[widgetId];
        }
        
        console.log(`Widget deleted: ${widgetId}`);
    }
}

/**
 * Configure widget (placeholder for future implementation)
 */
function configureWidget(widgetId) {
    alert(`Настройки для виджета "${widgetId}" будут реализованы в следующей версии`);
}

// ============================================
// Layout Save/Load
// ============================================

/**
 * Save current layout to JSON file
 */
function saveLayoutToFile() {
    const layoutData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        gridConfig: {
            column: AppState.gridColumnCount,
            cellHeight: AppState.gridStep * 8
        },
        widgets: grid.engine.nodes.map(node => ({
            id: node.id,
            x: node.x,
            y: node.y,
            w: node.w,
            h: node.h,
            type: detectWidgetType(node.el)
        }))
    };
    
    const jsonString = JSON.stringify(layoutData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-layout-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Also save to localStorage
    localStorage.setItem('dashboardLayout', jsonString);
    
    console.log('Layout saved to file and localStorage');
}

/**
 * Load layout from JSON file
 */
function handleFileLoad(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const layoutData = JSON.parse(event.target.result);
            applyLayout(layoutData);
            console.log('Layout loaded from file');
        } catch (error) {
            console.error('Error parsing layout file:', error);
            alert('Ошибка при загрузке файла макета');
        }
    };
    reader.readAsText(file);
    
    // Reset file input
    e.target.value = '';
}

/**
 * Load layout from localStorage
 */
function loadLayoutFromStorage() {
    const savedLayout = localStorage.getItem('dashboardLayout');
    if (savedLayout) {
        try {
            const layoutData = JSON.parse(savedLayout);
            applyLayout(layoutData);
            console.log('Layout loaded from localStorage');
        } catch (error) {
            console.error('Error parsing saved layout:', error);
        }
    }
}

/**
 * Apply layout data to the grid
 */
function applyLayout(layoutData) {
    // Clear existing grid
    grid.removeAll();
    
    // Apply widgets
    if (layoutData.widgets && Array.isArray(layoutData.widgets)) {
        layoutData.widgets.forEach(widgetData => {
            const widgetNode = {
                id: widgetData.id,
                x: widgetData.x,
                y: widgetData.y,
                w: widgetData.w,
                h: widgetData.h,
                content: createWidgetContent(widgetData.id, widgetData.type || 'text')
            };
            
            grid.addWidget(widgetNode);
            initializeWidget(widgetData.id, widgetData.type || 'text');
        });
        
        // Update edit mode styles after loading layout
        updateEditModeStyles();
    }
    
    console.log(`Applied layout with ${layoutData.widgets ? layoutData.widgets.length : 0} widgets`);
}

/**
 * Detect widget type from element
 */
function detectWidgetType(el) {
    if (el.querySelector('canvas')) return 'chart';
    if (el.querySelector('img')) return 'image';
    if (el.querySelector('.widget-custom')) return 'custom';
    return 'text';
}

// ============================================
// Grid Step Management
// ============================================

/**
 * Handle grid step change
 */
function handleGridStepChange(e) {
    const newStep = parseInt(e.target.value);
    AppState.gridStep = newStep;
    
    // Update CSS variable
    document.documentElement.style.setProperty('--grid-step', `${newStep}px`);
    
    // Recalculate grid
    const newCellHeight = newStep * 8;
    grid.cellHeight(newCellHeight);
    
    console.log(`Grid step changed to ${newStep}px, cell height: ${newCellHeight}px`);
}

// ============================================
// Status Monitoring
// ============================================

/**
 * Start status monitoring (online/offline + data freshness)
 */
function startStatusMonitoring() {
    // Initial check
    updateStatusIndicator();
    
    // Check every minute
    setInterval(() => {
        updateStatusIndicator();
    }, 60000);
    
    // Try to load data.json periodically (if exists)
    setInterval(() => {
        checkDataFreshness();
    }, 30000);
}

/**
 * Update status indicator based on online status and data freshness
 */
function updateStatusIndicator() {
    const isOnline = navigator.onLine;
    const isDataFresh = isDataFreshEnough();
    
    const isOk = isOnline && isDataFresh;
    
    if (isOk) {
        elements.statusIndicator.className = 'status-indicator status-green';
        elements.statusText.textContent = 'Онлайн';
        elements.dashboardContainer.classList.remove('status-red');
        elements.dashboardContainer.classList.add('status-green');
    } else {
        elements.statusIndicator.className = 'status-indicator status-red';
        elements.statusText.textContent = !isOnline ? 'Нет сети' : 'Данные устарели';
        elements.dashboardContainer.classList.remove('status-green');
        elements.dashboardContainer.classList.add('status-red');
    }
}

/**
 * Check if data is fresh enough
 */
function isDataFreshEnough() {
    if (!AppState.lastDataUpdate) return false;
    
    const now = Date.now();
    const diffMinutes = (now - AppState.lastDataUpdate) / (1000 * 60);
    
    return diffMinutes < AppState.dataTimeoutMinutes;
}

/**
 * Check data freshness by attempting to load data.json
 */
async function checkDataFreshness() {
    try {
        const response = await fetch('./data/data.json?' + Date.now());
        if (response.ok) {
            AppState.lastDataUpdate = Date.now();
            updateStatusIndicator();
        }
    } catch (error) {
        // File doesn't exist or can't be loaded - that's OK for now
        console.log('data.json not found or not accessible');
    }
}

/**
 * Handle online/offline status change
 */
function handleOnlineStatus() {
    updateStatusIndicator();
    console.log(`Network status: ${navigator.onLine ? 'online' : 'offline'}`);
}

// ============================================
// Keyboard Shortcuts
// ============================================

/**
 * Handle keyboard shortcuts
 */
function handleKeyboardShortcuts(e) {
    // Ctrl+S - Save layout
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveLayoutToFile();
    }
    
    // Ctrl+O - Load layout
    if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        elements.fileInput.click();
    }
    
    // Delete key - Remove selected widget (in edit mode)
    if (e.key === 'Delete' && AppState.isEditMode) {
        // Could implement widget selection here
    }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Set global status manually (for testing)
 */
function setGlobalStatus(status) {
    if (status === 'green') {
        elements.statusIndicator.className = 'status-indicator status-green';
        elements.statusText.textContent = 'Онлайн';
        elements.dashboardContainer.classList.remove('status-red');
        elements.dashboardContainer.classList.add('status-green');
    } else if (status === 'red') {
        elements.statusIndicator.className = 'status-indicator status-red';
        elements.statusText.textContent = 'Ошибка';
        elements.dashboardContainer.classList.remove('status-green');
        elements.dashboardContainer.classList.add('status-red');
    }
}

/**
 * Set widget local status
 */
function setWidgetStatus(widgetId, status) {
    const widget = document.querySelector(`.grid-stack-item[gs-id="${widgetId}"]`);
    if (widget) {
        const statusBorder = widget.querySelector('.widget-status-border');
        if (statusBorder) {
            statusBorder.className = `widget-status-border status-${status}`;
        }
    }
}

// Export functions for external access
window.dashboardAPI = {
    setGlobalStatus,
    setWidgetStatus,
    addWidget,
    deleteWidget,
    saveLayoutToFile,
    toggleEditMode
};

console.log('Dashboard API available via window.dashboardAPI');

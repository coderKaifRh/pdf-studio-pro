/**
 * PDF Studio Pro - Enterprise-Grade PDF Editor Engine
 * Fully equipped with:
 * - Option A: Smart Text Layer Select & Erase + Full Undo/Redo Engine
 * - Option B: Drag-and-Drop Page Reordering, Duplication & Page Extraction
 * - Option C: Freehand Signature/Draw Tool + Resizable Image/Stamp Insertion
 */

const { PDFDocument, rgb, StandardFonts, degrees } = window.PDFLib;

// Application State
const state = {
  pdfBytes: null,
  pdfDoc: null,
  pdfjsDoc: null,
  fileName: 'document.pdf',
  numPages: 0,
  currentPage: 1,
  zoom: 1.0,
  activeTool: 'select', // 'select' | 'text' | 'erase' | 'draw'
  isDirty: false,
  
  // Per-page annotations: { [pageNum]: Array<Annotation> }
  // Annotation types:
  // - 'text': { id, type, pdfX, pdfY, text, fontSize, color, fontFamily, bold }
  // - 'whiteout': { id, type, pdfX, pdfY, pdfWidth, pdfHeight, color }
  // - 'drawing': { id, type, strokePoints: [{pdfX, pdfY}], color, strokeWidth }
  // - 'image': { id, type, pdfX, pdfY, pdfWidth, pdfHeight, imageBytes, isPng, dataUrl }
  annotations: {},
  
  selectedAnnotationId: null,
  isDrawing: false,
  currentStrokePoints: [],
  drawStartCanvasX: 0,
  drawStartCanvasY: 0,
  currentViewport: null,
  scaleFactor: 1.5,
  pageToDelete: null,
  selectedMergeFile: null,
  
  // Drag & Drop reordering state
  draggedPageNum: null
};

// Undo / Redo History Stacks
const historyStack = [];
const redoStack = [];

function pushHistory(action) {
  historyStack.push(action);
  redoStack.length = 0; // Clear redo on new action
  updateHistoryButtons();
  markDirty(true);
}

function updateHistoryButtons() {
  if (elements.btnUndo) elements.btnUndo.disabled = (historyStack.length === 0);
  if (elements.btnRedo) elements.btnRedo.disabled = (redoStack.length === 0);
}

function undo() {
  if (historyStack.length === 0) return;
  const action = historyStack.pop();
  if (action && typeof action.undo === 'function') {
    action.undo();
    redoStack.push(action);
    updateHistoryButtons();
    showToast('Undo', 'info', 1000);
  }
}

function redo() {
  if (redoStack.length === 0) return;
  const action = redoStack.pop();
  if (action && typeof action.redo === 'function') {
    action.redo();
    historyStack.push(action);
    updateHistoryButtons();
    showToast('Redo', 'info', 1000);
  }
}

// Elements Cache
const elements = {
  btnUndo: document.getElementById('btn-undo'),
  btnRedo: document.getElementById('btn-redo'),
  docTitle: document.getElementById('doc-title'),
  docIndicator: document.getElementById('doc-indicator'),
  fileInput: document.getElementById('file-input'),
  imageFileInput: document.getElementById('image-file-input'),
  btnOpenFile: document.getElementById('btn-open-file'),
  btnSampleFile: document.getElementById('btn-sample-file'),
  btnSaveFile: document.getElementById('btn-save-file'),
  
  // Tools
  toolSelect: document.getElementById('tool-select'),
  toolText: document.getElementById('tool-text'),
  toolErase: document.getElementById('tool-erase'),
  toolDraw: document.getElementById('tool-draw'),
  btnAddImage: document.getElementById('btn-add-image'),
  
  btnInsertPage: document.getElementById('btn-insert-page'),
  btnDuplicatePage: document.getElementById('btn-duplicate-page'),
  btnExtractPage: document.getElementById('btn-extract-page'),
  btnMergePdf: document.getElementById('btn-merge-pdf'),
  btnDeletePage: document.getElementById('btn-delete-page'),
  btnRotatePage: document.getElementById('btn-rotate-page'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  
  // Steppers
  btnPrevPage: document.getElementById('btn-prev-page'),
  btnNextPage: document.getElementById('btn-next-page'),
  pageNumDisplay: document.getElementById('page-num-display'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomFit: document.getElementById('btn-zoom-fit'),
  zoomDisplay: document.getElementById('zoom-display'),
  
  // Options
  optTextSize: document.getElementById('opt-text-size'),
  optTextFont: document.getElementById('opt-text-font'),
  optTextColor: document.getElementById('opt-text-color'),
  optTextBold: document.getElementById('opt-text-bold'),
  optEraseColor: document.getElementById('opt-erase-color'),
  optDrawSettings: document.getElementById('opt-draw-settings'),
  optSelectInfo: document.getElementById('opt-select-info'),
  
  fontSizeInput: document.getElementById('font-size-input'),
  fontFamilyInput: document.getElementById('font-family-input'),
  textColorInput: document.getElementById('text-color-input'),
  btnTextBold: document.getElementById('btn-text-bold'),
  eraseColorInput: document.getElementById('erase-color-input'),
  penWidthSelect: document.getElementById('pen-width-select'),
  penColorInput: document.getElementById('pen-color-input'),
  
  // Sidebar
  appSidebar: document.getElementById('app-sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  btnMobileSidebarToggle: document.getElementById('btn-mobile-sidebar-toggle'),
  btnCloseSidebarMobile: document.getElementById('btn-close-sidebar-mobile'),
  thumbnailList: document.getElementById('thumbnail-list'),
  sidebarPageCount: document.getElementById('sidebar-page-count'),
  sidebarAddPage: document.getElementById('sidebar-add-page'),
  sidebarMergePdf: document.getElementById('sidebar-merge-pdf'),
  
  // Viewport
  viewportContainer: document.getElementById('viewport-container'),
  pdfPageWrapper: document.getElementById('pdf-page-wrapper'),
  pdfCanvas: document.getElementById('pdf-canvas'),
  textLayer: document.getElementById('text-layer'),
  textSelectionPill: document.getElementById('text-selection-pill'),
  drawingCanvas: document.getElementById('drawing-canvas'),
  annotationLayer: document.getElementById('annotation-layer'),
  emptyState: document.getElementById('empty-state'),
  btnBrowseFile: document.getElementById('btn-browse-file'),
  btnLoadSampleHero: document.getElementById('btn-load-sample-hero'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingText: document.getElementById('loading-text'),
  
  // Modals
  modalInsertPage: document.getElementById('modal-insert-page'),
  btnCloseInsertModal: document.getElementById('btn-close-insert-modal'),
  btnCancelInsert: document.getElementById('btn-cancel-insert'),
  btnConfirmInsert: document.getElementById('btn-confirm-insert'),
  insertPosition: document.getElementById('insert-position'),
  insertSize: document.getElementById('insert-size'),
  insertOrientation: document.getElementById('insert-orientation'),
  
  modalMergePdf: document.getElementById('modal-merge-pdf'),
  btnCloseMergeModal: document.getElementById('btn-close-merge-modal'),
  btnCancelMerge: document.getElementById('btn-cancel-merge'),
  btnConfirmMerge: document.getElementById('btn-confirm-merge'),
  mergeFileInput: document.getElementById('merge-file-input'),
  mergePosition: document.getElementById('merge-position'),
  
  modalConfirmDelete: document.getElementById('modal-confirm-delete'),
  btnCloseDeleteModal: document.getElementById('btn-close-delete-modal'),
  btnCancelDelete: document.getElementById('btn-cancel-delete'),
  btnConfirmDelete: document.getElementById('btn-confirm-delete'),
  deletePageMessage: document.getElementById('delete-page-message'),
  
  toastContainer: document.getElementById('toast-container')
};

let isBoldActive = false;

// -------------------------------------------------------------
// Toast & Loading Helpers
// -------------------------------------------------------------
function showToast(message, type = 'info', duration = 2400) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.15s ease';
    setTimeout(() => toast.remove(), 150);
  }, duration);
}

function showLoading(text = 'Processing...') {
  elements.loadingText.textContent = text;
  elements.loadingOverlay.style.display = 'flex';
}

function hideLoading() {
  elements.loadingOverlay.style.display = 'none';
}

function markDirty(dirty = true) {
  state.isDirty = dirty;
  if (elements.docIndicator) {
    elements.docIndicator.classList.toggle('unsaved', dirty);
  }
}

// -------------------------------------------------------------
// Document Loading & Synchronization
// -------------------------------------------------------------
async function loadPDFFromBytes(bytes, name = 'document.pdf') {
  try {
    showLoading('Parsing PDF document...');
    state.pdfBytes = bytes;
    state.fileName = name;
    elements.docTitle.textContent = name;
    
    state.pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    state.numPages = state.pdfDoc.getPageCount();
    
    const loadingTask = window.pdfjsLib.getDocument({ data: bytes.slice() });
    state.pdfjsDoc = await loadingTask.promise;
    
    state.currentPage = 1;
    state.annotations = {};
    state.selectedAnnotationId = null;
    historyStack.length = 0;
    redoStack.length = 0;
    updateHistoryButtons();
    markDirty(false);
    
    elements.btnSaveFile.disabled = false;
    elements.emptyState.style.display = 'none';
    elements.pdfPageWrapper.style.display = 'block';
    
    updateHeaderAndNav();
    await renderCurrentPage();
    await renderThumbnails();
    
    // Auto-fit to width on mobile screens
    if (window.innerWidth <= 768 && elements.btnZoomFit) {
      setTimeout(() => elements.btnZoomFit.click(), 80);
    }
    
    showToast(`Loaded ${name} (${state.numPages} pages)`, 'success');
  } catch (err) {
    console.error('Failed to load PDF:', err);
    showToast('Failed to parse PDF: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function syncPdfDoc() {
  const bytes = await state.pdfDoc.save();
  state.pdfBytes = bytes;
  state.numPages = state.pdfDoc.getPageCount();
  const loadingTask = window.pdfjsLib.getDocument({ data: bytes.slice() });
  state.pdfjsDoc = await loadingTask.promise;
  markDirty(true);
  updateHeaderAndNav();
}

// -------------------------------------------------------------
// Canvas & Text Layer Rendering (Option A)
// -------------------------------------------------------------
async function renderCurrentPage() {
  if (!state.pdfjsDoc || state.currentPage < 1 || state.currentPage > state.numPages) return;
  
  try {
    const page = await state.pdfjsDoc.getPage(state.currentPage);
    
    const actualScale = state.zoom * state.scaleFactor;
    const viewport = page.getViewport({ scale: actualScale });
    state.currentViewport = viewport;
    
    const displayWidth = viewport.width / state.scaleFactor;
    const displayHeight = viewport.height / state.scaleFactor;
    
    const canvas = elements.pdfCanvas;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    
    const drawCanvas = elements.drawingCanvas;
    drawCanvas.width = viewport.width;
    drawCanvas.height = viewport.height;
    drawCanvas.style.width = `${displayWidth}px`;
    drawCanvas.style.height = `${displayHeight}px`;
    
    elements.textLayer.style.width = `${displayWidth}px`;
    elements.textLayer.style.height = `${displayHeight}px`;
    elements.annotationLayer.style.width = `${displayWidth}px`;
    elements.annotationLayer.style.height = `${displayHeight}px`;
    elements.pdfPageWrapper.style.width = `${displayWidth}px`;
    elements.pdfPageWrapper.style.height = `${displayHeight}px`;

    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    
    // Render PDF.js Text Layer for Smart Text Selection
    await renderPdfTextLayer(page, viewport);
    
    renderAnnotations();
    highlightActiveThumbnail();
  } catch (err) {
    console.error('Error rendering page:', err);
  }
}

// Option A: Smart Text Layer Generation
async function renderPdfTextLayer(page, viewport) {
  const container = elements.textLayer;
  container.innerHTML = '';
  
  try {
    const textContent = await page.getTextContent();
    if (textContent.items.length === 0) return;
    
    // Create text items scaled for display
    textContent.items.forEach(item => {
      const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.hypot(tx[2], tx[3]);
      
      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.fontFamily = item.fontName || 'sans-serif';
      span.style.fontSize = `${fontHeight / state.scaleFactor}px`;
      span.style.left = `${tx[4] / state.scaleFactor}px`;
      span.style.top = `${(tx[5] - fontHeight) / state.scaleFactor}px`;
      span.style.transformOrigin = 'left bottom';
      
      container.appendChild(span);
    });
  } catch (err) {
    console.warn('Text layer render notice:', err);
  }
}

// Smart Text Selection & Erase Listener (Mouse & Touch)
function handleTextSelectionChange(e) {
  if (e && e.target && e.target.closest('#text-selection-pill')) return;
  
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  
  if (selectedText && elements.textLayer && elements.textLayer.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    if (rect.width > 0 && rect.height > 0) {
      elements.textSelectionPill.style.display = 'flex';
      const left = Math.max(10, Math.min(window.innerWidth - 180, rect.left + (rect.width / 2) - 80));
      const top = Math.max(50, rect.top - 44);
      elements.textSelectionPill.style.left = `${left}px`;
      elements.textSelectionPill.style.top = `${top}px`;
      return;
    }
  }
  
  elements.textSelectionPill.style.display = 'none';
}

document.addEventListener('mouseup', handleTextSelectionChange);
document.addEventListener('touchend', (e) => {
  // Brief timeout to let mobile selection finalize
  setTimeout(() => handleTextSelectionChange(e), 60);
});

// Click "Erase Selected Text" Action Pill
elements.textSelectionPill.addEventListener('click', () => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || !state.currentViewport) return;
  
  const range = selection.getRangeAt(0);
  const clientRects = Array.from(range.getClientRects());
  const pageBounds = elements.annotationLayer.getBoundingClientRect();
  
  const createdWhiteouts = [];
  
  clientRects.forEach(rect => {
    if (rect.width <= 2 || rect.height <= 2) return;
    
    // Canvas coords
    const cX1 = (rect.left - pageBounds.left) * state.scaleFactor;
    const cY1 = (rect.top - pageBounds.top) * state.scaleFactor;
    const cX2 = (rect.right - pageBounds.left) * state.scaleFactor;
    const cY2 = (rect.bottom - pageBounds.top) * state.scaleFactor;
    
    const [pdfX1, pdfY1] = state.currentViewport.convertToPdfPoint(cX1, cY1);
    const [pdfX2, pdfY2] = state.currentViewport.convertToPdfPoint(cX2, cY2);
    
    const whiteoutAnn = {
      id: 'whiteout_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type: 'whiteout',
      pdfX: Math.min(pdfX1, pdfX2) - 1, // slight 1pt breathing room
      pdfY: Math.min(pdfY1, pdfY2) - 1,
      pdfWidth: Math.abs(pdfX2 - pdfX1) + 2,
      pdfHeight: Math.abs(pdfY2 - pdfY1) + 2,
      color: '#ffffff'
    };
    
    getPageAnnotations(state.currentPage).push(whiteoutAnn);
    createdWhiteouts.push(whiteoutAnn);
  });
  
  if (createdWhiteouts.length > 0) {
    const pageNum = state.currentPage;
    pushHistory({
      type: 'SMART_ERASE',
      undo: () => {
        const anns = getPageAnnotations(pageNum);
        createdWhiteouts.forEach(cw => {
          const idx = anns.findIndex(a => a.id === cw.id);
          if (idx !== -1) anns.splice(idx, 1);
        });
        renderAnnotations();
      },
      redo: () => {
        getPageAnnotations(pageNum).push(...createdWhiteouts);
        renderAnnotations();
      }
    });
    
    selection.removeAllRanges();
    elements.textSelectionPill.style.display = 'none';
    renderAnnotations();
    showToast('Selected text erased with clean whiteout!', 'success');
  }
});

// -------------------------------------------------------------
// Annotations Management (Text, Whiteout, Draw, Image)
// -------------------------------------------------------------
function getPageAnnotations(pageNum) {
  if (!state.annotations[pageNum]) {
    state.annotations[pageNum] = [];
  }
  return state.annotations[pageNum];
}

function renderAnnotations() {
  const container = elements.annotationLayer;
  container.innerHTML = '';
  if (!state.currentViewport) return;
  
  const viewport = state.currentViewport;
  const pageAnns = getPageAnnotations(state.currentPage);
  
  pageAnns.forEach(ann => {
    const el = document.createElement('div');
    el.className = `annotation-element annotation-${ann.type}`;
    el.dataset.id = ann.id;
    
    if (state.selectedAnnotationId === ann.id) {
      el.classList.add('selected');
    }
    
    // 1. Whiteout / Erase box
    if (ann.type === 'whiteout') {
      const [vX1, vY1] = viewport.convertToViewportPoint(ann.pdfX, ann.pdfY + ann.pdfHeight);
      const [vX2, vY2] = viewport.convertToViewportPoint(ann.pdfX + ann.pdfWidth, ann.pdfY);
      
      const left = Math.min(vX1, vX2) / state.scaleFactor;
      const top = Math.min(vY1, vY2) / state.scaleFactor;
      const width = Math.abs(vX2 - vX1) / state.scaleFactor;
      const height = Math.abs(vY2 - vY1) / state.scaleFactor;
      
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.backgroundColor = ann.color || '#ffffff';
      
      if (state.selectedAnnotationId === ann.id) {
        addResizeHandle(el, ann, 'se');
      }
    } 
    // 2. Text Box
    else if (ann.type === 'text') {
      const [vX, vY] = viewport.convertToViewportPoint(ann.pdfX, ann.pdfY);
      el.style.left = `${vX / state.scaleFactor}px`;
      el.style.top = `${vY / state.scaleFactor}px`;
      el.style.fontSize = `${ann.fontSize * state.zoom}px`;
      el.style.color = ann.color;
      el.style.fontFamily = getFontFamilyCss(ann.fontFamily);
      el.style.fontWeight = ann.bold ? 'bold' : 'normal';
      el.textContent = ann.text;
      el.contentEditable = (state.activeTool === 'select');
      
      el.addEventListener('input', () => {
        ann.text = el.innerText;
        markDirty(true);
      });
    }
    // 3. Image Stamp (Option C)
    else if (ann.type === 'image') {
      const [vX1, vY1] = viewport.convertToViewportPoint(ann.pdfX, ann.pdfY + ann.pdfHeight);
      const [vX2, vY2] = viewport.convertToViewportPoint(ann.pdfX + ann.pdfWidth, ann.pdfY);
      
      const left = Math.min(vX1, vX2) / state.scaleFactor;
      const top = Math.min(vY1, vY2) / state.scaleFactor;
      const width = Math.abs(vX2 - vX1) / state.scaleFactor;
      const height = Math.abs(vY2 - vY1) / state.scaleFactor;
      
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.backgroundImage = `url(${ann.dataUrl})`;
      
      if (state.selectedAnnotationId === ann.id) {
        addResizeHandle(el, ann, 'se');
        addResizeHandle(el, ann, 'nw');
      }
    }
    // 4. Freehand Signature / Drawing (Option C)
    else if (ann.type === 'drawing') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'annotation-drawing');
      svg.style.position = 'absolute';
      svg.style.left = '0';
      svg.style.top = '0';
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.pointerEvents = 'none';
      
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      
      let d = '';
      ann.strokePoints.forEach((pt, i) => {
        const [vx, vy] = viewport.convertToViewportPoint(pt.pdfX, pt.pdfY);
        const sx = vx / state.scaleFactor;
        const sy = vy / state.scaleFactor;
        d += (i === 0 ? `M ${sx} ${sy}` : ` L ${sx} ${sy}`);
      });
      
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', ann.color || '#0f172a');
      path.setAttribute('stroke-width', (ann.strokeWidth || 2) * state.zoom);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      
      svg.appendChild(path);
      container.appendChild(svg);
      return; // SVG handled
    }
    
    // Badge Delete Button
    if (state.selectedAnnotationId === ann.id) {
      const badge = document.createElement('div');
      badge.className = 'element-badge-controls';
      badge.innerHTML = `
        <button class="element-badge-btn delete" title="Delete (Del)">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
          </svg>
        </button>
      `;
      badge.querySelector('.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAnnotation(ann.id);
      });
      el.appendChild(badge);
    }
    
    setupDragAnnotation(el, ann);
    
    el.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      selectAnnotation(ann.id);
    });
    
    container.appendChild(el);
  });
}

function selectAnnotation(id) {
  state.selectedAnnotationId = id;
  const ann = getPageAnnotations(state.currentPage).find(a => a.id === id);
  if (ann && ann.type === 'text') {
    elements.fontSizeInput.value = ann.fontSize;
    elements.fontFamilyInput.value = ann.fontFamily;
    elements.textColorInput.value = ann.color;
    isBoldActive = !!ann.bold;
    elements.btnTextBold.classList.toggle('active', isBoldActive);
  } else if (ann && ann.type === 'whiteout') {
    elements.eraseColorInput.value = ann.color;
  }
  renderAnnotations();
}

function deselectAllAnnotations() {
  if (state.selectedAnnotationId !== null) {
    state.selectedAnnotationId = null;
    renderAnnotations();
  }
}

function deleteAnnotation(id) {
  const pageAnns = getPageAnnotations(state.currentPage);
  const index = pageAnns.findIndex(a => a.id === id);
  if (index !== -1) {
    const deletedAnn = pageAnns[index];
    const pageNum = state.currentPage;
    
    pageAnns.splice(index, 1);
    state.selectedAnnotationId = null;
    
    pushHistory({
      type: 'DELETE_ANNOTATION',
      undo: () => {
        getPageAnnotations(pageNum).splice(index, 0, deletedAnn);
        renderAnnotations();
      },
      redo: () => {
        const anns = getPageAnnotations(pageNum);
        const idx = anns.findIndex(a => a.id === deletedAnn.id);
        if (idx !== -1) anns.splice(idx, 1);
        renderAnnotations();
      }
    });
    
    renderAnnotations();
    showToast('Element deleted', 'info', 1200);
  }
}

function getFontFamilyCss(family) {
  switch (family) {
    case 'TimesRoman': return '"Times New Roman", Times, serif';
    case 'Courier': return '"Courier New", Courier, monospace';
    case 'Helvetica':
    default: return 'var(--font-sans)';
  }
}

function addResizeHandle(el, ann, position) {
  const handle = document.createElement('div');
  handle.className = `resize-handle handle-${position}`;
  
  handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const initW = ann.pdfWidth;
    const initH = ann.pdfHeight;
    
    function onPointerMove(moveEvt) {
      const dx = (moveEvt.clientX - startX) / state.zoom;
      const dy = (moveEvt.clientY - startY) / state.zoom;
      ann.pdfWidth = Math.max(8, initW + dx);
      ann.pdfHeight = Math.max(8, initH + dy);
      markDirty(true);
      renderAnnotations();
    }
    
    function onPointerUp(upEvt) {
      if (handle.releasePointerCapture) {
        try { handle.releasePointerCapture(upEvt.pointerId); } catch (_) {}
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }
    
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
  
  el.appendChild(handle);
}

// Drag Annotation with PDF Coordinate Mapping (Mouse & Touch)
function setupDragAnnotation(el, ann) {
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.element-badge-controls') || e.target.classList.contains('resize-handle')) return;
    if (el.contentEditable === 'true' && document.activeElement === el) return;
    
    const startScreenX = e.clientX;
    const startScreenY = e.clientY;
    const initialPdfX = ann.pdfX;
    const initialPdfY = ann.pdfY;
    
    function onPointerMove(moveEvt) {
      const dxScreen = (moveEvt.clientX - startScreenX) * state.scaleFactor;
      const dyScreen = (moveEvt.clientY - startScreenY) * state.scaleFactor;
      
      const [initCanvasX, initCanvasY] = state.currentViewport.convertToViewportPoint(initialPdfX, initialPdfY);
      const [curPdfX, curPdfY] = state.currentViewport.convertToPdfPoint(
        initCanvasX + dxScreen,
        initCanvasY + dyScreen
      );
      
      ann.pdfX = curPdfX;
      ann.pdfY = curPdfY;
      markDirty(true);
      renderAnnotations();
    }
    
    function onPointerUp(upEvt) {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }
    
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  });
}

// -------------------------------------------------------------
// Interactive Drawing & Canvas Actions (Option C: Freehand Pen - Touch & Mouse)
// -------------------------------------------------------------
elements.viewportContainer.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('#annotation-layer') && !e.target.closest('.annotation-element')) {
    deselectAllAnnotations();
  }
});

elements.annotationLayer.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.annotation-element')) return;
  if (!state.currentViewport) return;
  
  const rect = elements.annotationLayer.getBoundingClientRect();
  const canvasX = (e.clientX - rect.left) * state.scaleFactor;
  const canvasY = (e.clientY - rect.top) * state.scaleFactor;
  
  // 1. Text Insertion
  if (state.activeTool === 'text') {
    const [pdfX, pdfY] = state.currentViewport.convertToPdfPoint(canvasX, canvasY);
    
    const newTextAnn = {
      id: 'text_' + Date.now(),
      type: 'text',
      pdfX: pdfX,
      pdfY: pdfY,
      text: 'Type text here...',
      fontSize: parseInt(elements.fontSizeInput.value, 10) || 14,
      fontFamily: elements.fontFamilyInput.value || 'Helvetica',
      color: elements.textColorInput.value || '#0f172a',
      bold: isBoldActive
    };
    
    const pageNum = state.currentPage;
    getPageAnnotations(pageNum).push(newTextAnn);
    
    pushHistory({
      type: 'ADD_TEXT',
      undo: () => {
        const anns = getPageAnnotations(pageNum);
        const idx = anns.findIndex(a => a.id === newTextAnn.id);
        if (idx !== -1) anns.splice(idx, 1);
        renderAnnotations();
      },
      redo: () => {
        getPageAnnotations(pageNum).push(newTextAnn);
        renderAnnotations();
      }
    });
    
    selectAnnotation(newTextAnn.id);
    setTool('select');
    
    setTimeout(() => {
      const createdEl = elements.annotationLayer.querySelector(`[data-id="${newTextAnn.id}"]`);
      if (createdEl) {
        createdEl.focus();
        document.execCommand('selectAll', false, null);
      }
    }, 40);
  } 
  // 2. Whiteout Box
  else if (state.activeTool === 'erase') {
    state.isDrawing = true;
    state.drawStartCanvasX = canvasX;
    state.drawStartCanvasY = canvasY;
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }
  // 3. Freehand Draw / Signature (Option C)
  else if (state.activeTool === 'draw') {
    state.isDrawing = true;
    state.currentStrokePoints = [];
    const [pdfX, pdfY] = state.currentViewport.convertToPdfPoint(canvasX, canvasY);
    state.currentStrokePoints.push({ pdfX, pdfY });
    
    const ctx = elements.drawingCanvas.getContext('2d');
    ctx.strokeStyle = elements.penColorInput.value || '#0f172a';
    ctx.lineWidth = parseFloat(elements.penWidthSelect.value || 3) * state.scaleFactor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(canvasX, canvasY);
    if (e.target.setPointerCapture) {
      try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }
});

window.addEventListener('pointermove', (e) => {
  if (!state.isDrawing) return;
  
  const rect = elements.annotationLayer.getBoundingClientRect();
  const currentCanvasX = (e.clientX - rect.left) * state.scaleFactor;
  const currentCanvasY = (e.clientY - rect.top) * state.scaleFactor;
  
  const ctx = elements.drawingCanvas.getContext('2d');
  
  if (state.activeTool === 'erase') {
    ctx.clearRect(0, 0, elements.drawingCanvas.width, elements.drawingCanvas.height);
    const x = Math.min(state.drawStartCanvasX, currentCanvasX);
    const y = Math.min(state.drawStartCanvasY, currentCanvasY);
    const w = Math.abs(currentCanvasX - state.drawStartCanvasX);
    const h = Math.abs(currentCanvasY - state.drawStartCanvasY);
    
    ctx.fillStyle = elements.eraseColorInput.value || '#ffffff';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 1.5 * state.scaleFactor;
    ctx.setLineDash([3 * state.scaleFactor, 3 * state.scaleFactor]);
    ctx.strokeRect(x, y, w, h);
  } else if (state.activeTool === 'draw') {
    const [pdfX, pdfY] = state.currentViewport.convertToPdfPoint(currentCanvasX, currentCanvasY);
    state.currentStrokePoints.push({ pdfX, pdfY });
    ctx.lineTo(currentCanvasX, currentCanvasY);
    ctx.stroke();
  }
});

window.addEventListener('pointerup', (e) => {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  
  const ctx = elements.drawingCanvas.getContext('2d');
  ctx.clearRect(0, 0, elements.drawingCanvas.width, elements.drawingCanvas.height);
  
  // Finish Whiteout
  if (state.activeTool === 'erase') {
    const rect = elements.annotationLayer.getBoundingClientRect();
    const endCanvasX = (e.clientX - rect.left) * state.scaleFactor;
    const endCanvasY = (e.clientY - rect.top) * state.scaleFactor;
    
    const minCanvasX = Math.min(state.drawStartCanvasX, endCanvasX);
    const maxCanvasX = Math.max(state.drawStartCanvasX, endCanvasX);
    const minCanvasY = Math.min(state.drawStartCanvasY, endCanvasY);
    const maxCanvasY = Math.max(state.drawStartCanvasY, endCanvasY);
    
    const w = maxCanvasX - minCanvasX;
    const h = maxCanvasY - minCanvasY;
    
    if (w >= 4 && h >= 4 && state.currentViewport) {
      const [pdfX1, pdfY1] = state.currentViewport.convertToPdfPoint(minCanvasX, minCanvasY);
      const [pdfX2, pdfY2] = state.currentViewport.convertToPdfPoint(maxCanvasX, maxCanvasY);
      
      const whiteoutAnn = {
        id: 'whiteout_' + Date.now(),
        type: 'whiteout',
        pdfX: Math.min(pdfX1, pdfX2),
        pdfY: Math.min(pdfY1, pdfY2),
        pdfWidth: Math.abs(pdfX2 - pdfX1),
        pdfHeight: Math.abs(pdfY2 - pdfY1),
        color: elements.eraseColorInput.value || '#ffffff'
      };
      
      const pageNum = state.currentPage;
      getPageAnnotations(pageNum).push(whiteoutAnn);
      
      pushHistory({
        type: 'ADD_WHITEOUT',
        undo: () => {
          const anns = getPageAnnotations(pageNum);
          const idx = anns.findIndex(a => a.id === whiteoutAnn.id);
          if (idx !== -1) anns.splice(idx, 1);
          renderAnnotations();
        },
        redo: () => {
          getPageAnnotations(pageNum).push(whiteoutAnn);
          renderAnnotations();
        }
      });
      
      selectAnnotation(whiteoutAnn.id);
      showToast('Text erased / whiteouted', 'success', 1200);
    }
  } 
  // Finish Draw / Signature (Option C)
  else if (state.activeTool === 'draw' && state.currentStrokePoints.length > 1) {
    const drawAnn = {
      id: 'draw_' + Date.now(),
      type: 'drawing',
      strokePoints: [...state.currentStrokePoints],
      color: elements.penColorInput.value || '#0f172a',
      strokeWidth: parseFloat(elements.penWidthSelect.value || 3)
    };
    
    const pageNum = state.currentPage;
    getPageAnnotations(pageNum).push(drawAnn);
    
    pushHistory({
      type: 'ADD_DRAWING',
      undo: () => {
        const anns = getPageAnnotations(pageNum);
        const idx = anns.findIndex(a => a.id === drawAnn.id);
        if (idx !== -1) anns.splice(idx, 1);
        renderAnnotations();
      },
      redo: () => {
        getPageAnnotations(pageNum).push(drawAnn);
        renderAnnotations();
      }
    });
    
    renderAnnotations();
    showToast('Signature / drawing saved', 'success', 1200);
  }
});

// -------------------------------------------------------------
// Image Insertion (Option C)
// -------------------------------------------------------------
elements.btnAddImage.addEventListener('click', () => {
  elements.imageFileInput.click();
});

elements.imageFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    showLoading('Loading image stamp...');
    const arrayBuffer = await file.arrayBuffer();
    const dataUrl = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    
    const imgObj = new Image();
    imgObj.src = dataUrl;
    await new Promise(r => imgObj.onload = r);
    
    // Natural aspect ratio scaling to ~160 points width
    const aspect = imgObj.naturalWidth / (imgObj.naturalHeight || 1);
    const pdfW = 160;
    const pdfH = pdfW / aspect;
    
    // Position in page center
    const curPage = state.pdfDoc.getPage(state.currentPage - 1);
    const pdfX = (curPage.getWidth() - pdfW) / 2;
    const pdfY = (curPage.getHeight() - pdfH) / 2;
    
    const isPng = file.type.includes('png') || file.name.toLowerCase().endsWith('.png');
    
    const imgAnn = {
      id: 'img_' + Date.now(),
      type: 'image',
      pdfX: pdfX,
      pdfY: pdfY,
      pdfWidth: pdfW,
      pdfHeight: pdfH,
      imageBytes: new Uint8Array(arrayBuffer),
      isPng: isPng,
      dataUrl: dataUrl
    };
    
    const pageNum = state.currentPage;
    getPageAnnotations(pageNum).push(imgAnn);
    
    pushHistory({
      type: 'ADD_IMAGE',
      undo: () => {
        const anns = getPageAnnotations(pageNum);
        const idx = anns.findIndex(a => a.id === imgAnn.id);
        if (idx !== -1) anns.splice(idx, 1);
        renderAnnotations();
      },
      redo: () => {
        getPageAnnotations(pageNum).push(imgAnn);
        renderAnnotations();
      }
    });
    
    selectAnnotation(imgAnn.id);
    renderAnnotations();
    showToast('Image inserted! Drag or resize anywhere.', 'success');
  } catch (err) {
    console.error('Failed to load image:', err);
    showToast('Failed to load image: ' + err.message, 'error');
  } finally {
    hideLoading();
    elements.imageFileInput.value = '';
  }
});

// -------------------------------------------------------------
// Drag-and-Drop Page Reordering & Thumbnails (Option B)
// -------------------------------------------------------------
async function renderThumbnails() {
  if (!state.pdfjsDoc) return;
  
  elements.thumbnailList.innerHTML = '';
  elements.sidebarPageCount.textContent = state.numPages;
  
  for (let pageNum = 1; pageNum <= state.numPages; pageNum++) {
    const card = document.createElement('div');
    card.className = `thumbnail-card ${pageNum === state.currentPage ? 'active' : ''}`;
    card.dataset.pageNum = pageNum;
    card.setAttribute('draggable', 'true');
    
    const canvas = document.createElement('canvas');
    canvas.className = 'thumbnail-canvas';
    card.appendChild(canvas);
    
    const info = document.createElement('div');
    info.className = 'thumbnail-info';
    info.innerHTML = `
      <span class="tabular-nums">Page ${pageNum}</span>
      <div class="thumbnail-actions">
        ${pageNum > 1 ? `<button class="btn btn-circle btn-ghost btn-sm btn-move-up" title="Move Page Up">▲</button>` : ''}
        ${pageNum < state.numPages ? `<button class="btn btn-circle btn-ghost btn-sm btn-move-down" title="Move Page Down">▼</button>` : ''}
        ${state.numPages > 1 ? `
          <button class="btn btn-circle btn-ghost btn-sm btn-card-delete" title="Delete Page ${pageNum}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
            </svg>
          </button>
        ` : ''}
      </div>
    `;
    card.appendChild(info);
    
    card.addEventListener('click', (e) => {
      if (e.target.closest('.thumbnail-actions')) return;
      goToPage(pageNum);
      if (window.innerWidth <= 768) {
        closeMobileSidebar();
      }
    });
    
    // Quick Up / Down Reorder Buttons
    const upBtn = card.querySelector('.btn-move-up');
    if (upBtn) {
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderSinglePage(pageNum, pageNum - 1);
      });
    }
    const downBtn = card.querySelector('.btn-move-down');
    if (downBtn) {
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderSinglePage(pageNum, pageNum + 1);
      });
    }
    
    const delBtn = card.querySelector('.btn-card-delete');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptDeletePage(pageNum);
      });
    }
    
    // HTML5 Drag and Drop Handlers
    setupThumbnailDragEvents(card, pageNum);
    
    elements.thumbnailList.appendChild(card);
    renderSingleThumbnail(pageNum, canvas);
  }
}

function setupThumbnailDragEvents(card, pageNum) {
  card.addEventListener('dragstart', (e) => {
    state.draggedPageNum = pageNum;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', pageNum);
  });
  
  card.addEventListener('dragend', () => {
    state.draggedPageNum = null;
    card.classList.remove('dragging');
    document.querySelectorAll('.thumbnail-card').forEach(c => {
      c.classList.remove('drag-over-top', 'drag-over-bottom');
    });
  });
  
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (state.draggedPageNum === pageNum) return;
    
    const rect = card.getBoundingClientRect();
    const midY = rect.top + (rect.height / 2);
    if (e.clientY < midY) {
      card.classList.add('drag-over-top');
      card.classList.remove('drag-over-bottom');
    } else {
      card.classList.add('drag-over-bottom');
      card.classList.remove('drag-over-top');
    }
  });
  
  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over-top', 'drag-over-bottom');
  });
  
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over-top', 'drag-over-bottom');
    const fromPage = state.draggedPageNum;
    const toPage = pageNum;
    
    if (fromPage && toPage && fromPage !== toPage) {
      reorderSinglePage(fromPage, toPage);
    }
  });
}

// Reorder a single page from -> to
async function reorderSinglePage(fromPageNum, toPageNum) {
  try {
    showLoading(`Moving Page ${fromPageNum} to ${toPageNum}...`);
    
    // Construct new page indices array (0-based)
    const indices = [];
    for (let i = 0; i < state.numPages; i++) indices.push(i);
    
    const fromIdx = fromPageNum - 1;
    const toIdx = toPageNum - 1;
    indices.splice(fromIdx, 1);
    indices.splice(toIdx, 0, fromIdx);
    
    // Create new PDFDoc with reordered pages
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(state.pdfDoc, indices);
    copiedPages.forEach(p => newDoc.addPage(p));
    state.pdfDoc = newDoc;
    
    // Remap annotations
    const oldAnnotations = { ...state.annotations };
    const newAnnotations = {};
    indices.forEach((originalIdx, newIdx) => {
      const oldPageNum = originalIdx + 1;
      const newPageNum = newIdx + 1;
      if (oldAnnotations[oldPageNum]) {
        newAnnotations[newPageNum] = oldAnnotations[oldPageNum];
      }
    });
    state.annotations = newAnnotations;
    
    await syncPdfDoc();
    state.currentPage = toPageNum;
    
    pushHistory({
      type: 'REORDER_PAGE',
      undo: () => reorderSinglePage(toPageNum, fromPageNum),
      redo: () => reorderSinglePage(fromPageNum, toPageNum)
    });
    
    await renderCurrentPage();
    await renderThumbnails();
    showToast(`Page moved to position ${toPageNum}`, 'success');
  } catch (err) {
    console.error('Failed to reorder page:', err);
    showToast('Failed to move page: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function renderSingleThumbnail(pageNum, canvas) {
  try {
    const page = await state.pdfjsDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.25 });
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch (err) {
    console.error(`Error rendering thumbnail for page ${pageNum}:`, err);
  }
}

function highlightActiveThumbnail() {
  const cards = elements.thumbnailList.querySelectorAll('.thumbnail-card');
  cards.forEach(card => {
    const pageNum = parseInt(card.dataset.pageNum, 10);
    card.classList.toggle('active', pageNum === state.currentPage);
  });
}

// -------------------------------------------------------------
// Navigation & Zoom
// -------------------------------------------------------------
function goToPage(pageNum) {
  if (pageNum < 1 || pageNum > state.numPages || pageNum === state.currentPage) return;
  state.currentPage = pageNum;
  state.selectedAnnotationId = null;
  updateHeaderAndNav();
  renderCurrentPage();
}

function updateHeaderAndNav() {
  elements.pageNumDisplay.textContent = state.numPages > 0 ? `${state.currentPage} / ${state.numPages}` : '0 / 0';
  elements.btnPrevPage.disabled = state.currentPage <= 1;
  elements.btnNextPage.disabled = state.currentPage >= state.numPages;
  elements.btnDeletePage.disabled = state.numPages <= 1;
  elements.zoomDisplay.textContent = `${Math.round(state.zoom * 100)}%`;
}

elements.btnPrevPage.addEventListener('click', () => goToPage(state.currentPage - 1));
elements.btnNextPage.addEventListener('click', () => goToPage(state.currentPage + 1));

elements.btnZoomIn.addEventListener('click', () => {
  if (state.zoom < 2.5) {
    state.zoom = Math.min(2.5, state.zoom + 0.15);
    updateHeaderAndNav();
    renderCurrentPage();
  }
});

elements.btnZoomOut.addEventListener('click', () => {
  if (state.zoom > 0.4) {
    state.zoom = Math.max(0.4, state.zoom - 0.15);
    updateHeaderAndNav();
    renderCurrentPage();
  }
});

elements.zoomDisplay.addEventListener('click', () => {
  state.zoom = 1.0;
  updateHeaderAndNav();
  renderCurrentPage();
  showToast('Reset zoom to 100%', 'info', 1000);
});

elements.btnZoomFit.addEventListener('click', () => {
  const padding = (window.innerWidth <= 768) ? 20 : 80;
  const containerWidth = elements.viewportContainer.clientWidth - padding;
  if (state.currentViewport && containerWidth > 40) {
    const naturalWidth = state.currentViewport.width / (state.zoom * state.scaleFactor);
    state.zoom = Math.max(0.3, Math.min(2.5, containerWidth / naturalWidth));
    updateHeaderAndNav();
    renderCurrentPage();
  }
});

// -------------------------------------------------------------
// Tool Switching
// -------------------------------------------------------------
function setTool(toolName) {
  state.activeTool = toolName;
  
  elements.toolSelect.classList.toggle('active', toolName === 'select');
  elements.toolText.classList.toggle('active', toolName === 'text');
  elements.toolErase.classList.toggle('active', toolName === 'erase');
  elements.toolDraw.classList.toggle('active', toolName === 'draw');
  
  const isText = (toolName === 'text');
  const isErase = (toolName === 'erase');
  const isDraw = (toolName === 'draw');
  const isSelect = (toolName === 'select');
  
  if (elements.pdfPageWrapper) {
    elements.pdfPageWrapper.classList.toggle('touch-drawing', isDraw || isErase);
  }
  
  elements.optTextSize.style.display = isText ? 'flex' : 'none';
  elements.optTextFont.style.display = isText ? 'flex' : 'none';
  elements.optTextColor.style.display = isText ? 'flex' : 'none';
  elements.optTextBold.style.display = isText ? 'flex' : 'none';
  elements.optEraseColor.style.display = isErase ? 'flex' : 'none';
  elements.optDrawSettings.style.display = isDraw ? 'flex' : 'none';
  elements.optSelectInfo.style.display = isSelect ? 'flex' : 'none';
  
  if (isText || isErase) {
    elements.annotationLayer.style.cursor = 'crosshair';
  } else if (isDraw) {
    elements.annotationLayer.style.cursor = 'crosshair';
  } else {
    elements.annotationLayer.style.cursor = 'default';
  }
  
  const textEls = elements.annotationLayer.querySelectorAll('.annotation-text');
  textEls.forEach(el => {
    el.contentEditable = isSelect;
  });
}

elements.toolSelect.addEventListener('click', () => setTool('select'));
elements.toolText.addEventListener('click', () => setTool('text'));
elements.toolErase.addEventListener('click', () => setTool('erase'));
elements.toolDraw.addEventListener('click', () => setTool('draw'));

elements.btnUndo.addEventListener('click', undo);
elements.btnRedo.addEventListener('click', redo);

elements.btnTextBold.addEventListener('click', () => {
  isBoldActive = !isBoldActive;
  elements.btnTextBold.classList.toggle('active', isBoldActive);
  if (state.selectedAnnotationId) {
    const ann = getPageAnnotations(state.currentPage).find(a => a.id === state.selectedAnnotationId);
    if (ann && ann.type === 'text') {
      ann.bold = isBoldActive;
      markDirty(true);
      renderAnnotations();
    }
  }
});

// Swatch handlers
document.querySelectorAll('[data-color]').forEach(dot => {
  dot.addEventListener('click', () => {
    const color = dot.dataset.color;
    elements.textColorInput.value = color;
    elements.textColorInput.dispatchEvent(new Event('input'));
  });
});

document.querySelectorAll('[data-erase-color]').forEach(dot => {
  dot.addEventListener('click', () => {
    const color = dot.dataset.eraseColor;
    elements.eraseColorInput.value = color;
    elements.eraseColorInput.dispatchEvent(new Event('input'));
  });
});

document.querySelectorAll('[data-pen-color]').forEach(dot => {
  dot.addEventListener('click', () => {
    elements.penColorInput.value = dot.dataset.penColor;
  });
});

elements.fontSizeInput.addEventListener('change', () => {
  if (state.selectedAnnotationId) {
    const ann = getPageAnnotations(state.currentPage).find(a => a.id === state.selectedAnnotationId);
    if (ann && ann.type === 'text') {
      ann.fontSize = parseInt(elements.fontSizeInput.value, 10);
      markDirty(true);
      renderAnnotations();
    }
  }
});

elements.textColorInput.addEventListener('input', () => {
  if (state.selectedAnnotationId) {
    const ann = getPageAnnotations(state.currentPage).find(a => a.id === state.selectedAnnotationId);
    if (ann && ann.type === 'text') {
      ann.color = elements.textColorInput.value;
      markDirty(true);
      renderAnnotations();
    }
  }
});

elements.eraseColorInput.addEventListener('input', () => {
  if (state.selectedAnnotationId) {
    const ann = getPageAnnotations(state.currentPage).find(a => a.id === state.selectedAnnotationId);
    if (ann && ann.type === 'whiteout') {
      ann.color = elements.eraseColorInput.value;
      markDirty(true);
      renderAnnotations();
    }
  }
});

// -------------------------------------------------------------
// Keyboard Shortcuts
// -------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  // Undo / Redo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
    e.preventDefault();
    redo();
    return;
  }

  // Ctrl+S / Cmd+S: Save PDF
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    elements.btnSaveFile.click();
    return;
  }
  
  // Ctrl+O / Cmd+O: Open File
  if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
    e.preventDefault();
    elements.fileInput.click();
    return;
  }

  // Delete / Backspace: Remove selected element
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedAnnotationId) {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.isContentEditable && activeEl.classList.contains('annotation-text')) {
      return;
    }
    deleteAnnotation(state.selectedAnnotationId);
  }
  
  if (e.key === 'Escape') {
    deselectAllAnnotations();
    setTool('select');
  }
  
  if (document.activeElement.tagName !== 'INPUT' && !document.activeElement.isContentEditable) {
    if (e.key === 'v' || e.key === 'V') setTool('select');
    if (e.key === 't' || e.key === 'T') setTool('text');
    if (e.key === 'e' || e.key === 'E') setTool('erase');
    if (e.key === 'd' || e.key === 'D') setTool('draw');
    if (e.key === 'i' || e.key === 'I') elements.btnAddImage.click();
    if (e.key === 'r' || e.key === 'R') elements.btnRotatePage.click();
    if (e.key === '[' || e.key === 'PageUp') goToPage(state.currentPage - 1);
    if (e.key === ']' || e.key === 'PageDown') goToPage(state.currentPage + 1);
    if (e.key === '+' || e.key === '=') elements.btnZoomIn.click();
    if (e.key === '-') elements.btnZoomOut.click();
    if (e.key === '0') elements.zoomDisplay.click();
  }
});

// -------------------------------------------------------------
// Page Operations: Duplicate & Extract Page (Option B)
// -------------------------------------------------------------
// 1. Duplicate Page
elements.btnDuplicatePage.addEventListener('click', async () => {
  if (!state.pdfDoc || state.currentPage < 1) return;
  
  try {
    showLoading(`Duplicating Page ${state.currentPage}...`);
    const curIdx = state.currentPage - 1;
    const [copiedPage] = await state.pdfDoc.copyPages(state.pdfDoc, [curIdx]);
    
    // Insert right after current page
    state.pdfDoc.insertPage(curIdx + 1, copiedPage);
    
    // Shift & copy annotations
    const newAnnotations = {};
    const newPageNum = state.currentPage + 1;
    
    Object.keys(state.annotations).forEach(k => {
      const idx = parseInt(k, 10);
      if (idx > curIdx + 1) {
        newAnnotations[idx + 1] = state.annotations[idx];
      } else {
        newAnnotations[idx] = state.annotations[idx];
      }
    });
    // Duplicate current annotations
    if (state.annotations[state.currentPage]) {
      newAnnotations[newPageNum] = JSON.parse(JSON.stringify(state.annotations[state.currentPage]));
    }
    state.annotations = newAnnotations;
    
    await syncPdfDoc();
    state.currentPage = newPageNum;
    
    pushHistory({
      type: 'DUPLICATE_PAGE',
      undo: async () => {
        state.pdfDoc.removePage(newPageNum - 1);
        await syncPdfDoc();
        await renderCurrentPage();
        await renderThumbnails();
      },
      redo: () => elements.btnDuplicatePage.click()
    });
    
    await renderCurrentPage();
    await renderThumbnails();
    showToast(`Page ${curIdx + 1} duplicated as Page ${newPageNum}`, 'success');
  } catch (err) {
    console.error('Failed to duplicate page:', err);
    showToast('Failed to duplicate page: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

// 2. Extract / Split Page
elements.btnExtractPage.addEventListener('click', async () => {
  if (!state.pdfDoc || state.currentPage < 1) return;
  
  try {
    showLoading(`Extracting Page ${state.currentPage} as standalone PDF...`);
    const extractDoc = await PDFDocument.create();
    const curIdx = state.currentPage - 1;
    const [page] = await extractDoc.copyPages(state.pdfDoc, [curIdx]);
    extractDoc.addPage(page);
    
    const bytes = await extractDoc.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const baseName = state.fileName.replace(/\.pdf$/i, '');
    a.download = `${baseName}-page-${state.currentPage}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    
    showToast(`Page ${state.currentPage} extracted and downloaded!`, 'success');
  } catch (err) {
    console.error('Failed to extract page:', err);
    showToast('Failed to extract page: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

// -------------------------------------------------------------
// Page Operations: Delete, Insert, Merge, Rotate
// -------------------------------------------------------------
function promptDeletePage(pageNum) {
  if (state.numPages <= 1) {
    showToast('A document must have at least one page.', 'error');
    return;
  }
  state.pageToDelete = pageNum;
  elements.deletePageMessage.textContent = `Are you sure you want to delete Page ${pageNum}?`;
  elements.modalConfirmDelete.classList.add('show');
}

elements.btnDeletePage.addEventListener('click', () => {
  promptDeletePage(state.currentPage);
});

elements.btnCancelDelete.addEventListener('click', () => {
  elements.modalConfirmDelete.classList.remove('show');
  state.pageToDelete = null;
});
elements.btnCloseDeleteModal.addEventListener('click', () => {
  elements.modalConfirmDelete.classList.remove('show');
  state.pageToDelete = null;
});

elements.btnConfirmDelete.addEventListener('click', async () => {
  elements.modalConfirmDelete.classList.remove('show');
  if (!state.pageToDelete) return;
  
  const pageNum = state.pageToDelete;
  state.pageToDelete = null;
  
  try {
    showLoading(`Deleting Page ${pageNum}...`);
    state.pdfDoc.removePage(pageNum - 1);
    
    delete state.annotations[pageNum];
    const newAnnotations = {};
    Object.keys(state.annotations).forEach(k => {
      const idx = parseInt(k, 10);
      if (idx > pageNum) {
        newAnnotations[idx - 1] = state.annotations[idx];
      } else {
        newAnnotations[idx] = state.annotations[idx];
      }
    });
    state.annotations = newAnnotations;
    
    await syncPdfDoc();
    
    if (state.currentPage > state.numPages) {
      state.currentPage = state.numPages;
    }
    
    await renderCurrentPage();
    await renderThumbnails();
    showToast(`Page ${pageNum} deleted`, 'success');
  } catch (err) {
    console.error('Failed to delete page:', err);
    showToast('Failed to delete page: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

// Insert Page Modal
function openInsertPageModal() {
  elements.modalInsertPage.classList.add('show');
}
elements.btnInsertPage.addEventListener('click', openInsertPageModal);
elements.sidebarAddPage.addEventListener('click', openInsertPageModal);
elements.btnCancelInsert.addEventListener('click', () => elements.modalInsertPage.classList.remove('show'));
elements.btnCloseInsertModal.addEventListener('click', () => elements.modalInsertPage.classList.remove('show'));

elements.btnConfirmInsert.addEventListener('click', async () => {
  elements.modalInsertPage.classList.remove('show');
  try {
    showLoading('Inserting blank page...');
    
    const position = elements.insertPosition.value;
    const sizeType = elements.insertSize.value;
    const orientation = elements.insertOrientation.value;
    
    let width = 595.28;
    let height = 841.89;
    
    if (sizeType === 'letter') {
      width = 612; height = 792;
    } else if (sizeType === 'match' && state.pdfDoc.getPageCount() > 0) {
      const curPage = state.pdfDoc.getPage(state.currentPage - 1);
      width = curPage.getWidth();
      height = curPage.getHeight();
    }
    
    if (orientation === 'landscape' && height > width) {
      const temp = width; width = height; height = temp;
    } else if (orientation === 'portrait' && width > height) {
      const temp = width; width = height; height = temp;
    }
    
    let insertIndex = state.currentPage;
    if (position === 'before') insertIndex = state.currentPage - 1;
    else if (position === 'first') insertIndex = 0;
    else if (position === 'last') insertIndex = state.pdfDoc.getPageCount();
    
    state.pdfDoc.insertPage(insertIndex, [width, height]);
    
    const newAnnotations = {};
    const inserted1Based = insertIndex + 1;
    Object.keys(state.annotations).forEach(k => {
      const idx = parseInt(k, 10);
      if (idx >= inserted1Based) {
        newAnnotations[idx + 1] = state.annotations[idx];
      } else {
        newAnnotations[idx] = state.annotations[idx];
      }
    });
    state.annotations = newAnnotations;
    
    await syncPdfDoc();
    state.currentPage = inserted1Based;
    
    await renderCurrentPage();
    await renderThumbnails();
    showToast(`Blank page inserted at #${inserted1Based}`, 'success');
  } catch (err) {
    console.error('Failed to insert page:', err);
    showToast('Failed to insert page: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

// Merge PDF Modal
function openMergePdfModal() {
  elements.mergeFileInput.value = '';
  elements.btnConfirmMerge.disabled = true;
  elements.modalMergePdf.classList.add('show');
}
elements.btnMergePdf.addEventListener('click', openMergePdfModal);
elements.sidebarMergePdf.addEventListener('click', openMergePdfModal);
elements.btnCancelMerge.addEventListener('click', () => elements.modalMergePdf.classList.remove('show'));
elements.btnCloseMergeModal.addEventListener('click', () => elements.modalMergePdf.classList.remove('show'));

elements.mergeFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    state.selectedMergeFile = file;
    elements.btnConfirmMerge.disabled = false;
  }
});

elements.btnConfirmMerge.addEventListener('click', async () => {
  elements.modalMergePdf.classList.remove('show');
  if (!state.selectedMergeFile) return;
  
  try {
    showLoading('Merging PDF document...');
    const arrayBuffer = await state.selectedMergeFile.arrayBuffer();
    const sourceDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    
    const sourcePageIndices = sourceDoc.getPageIndices();
    const copiedPages = await state.pdfDoc.copyPages(sourceDoc, sourcePageIndices);
    
    const position = elements.mergePosition.value;
    let insertIndex = state.pdfDoc.getPageCount();
    if (position === 'after_current') insertIndex = state.currentPage;
    else if (position === 'beginning') insertIndex = 0;
    
    const numCopied = copiedPages.length;
    const newAnnotations = {};
    const inserted1Based = insertIndex + 1;
    Object.keys(state.annotations).forEach(k => {
      const idx = parseInt(k, 10);
      if (idx >= inserted1Based) {
        newAnnotations[idx + numCopied] = state.annotations[idx];
      } else {
        newAnnotations[idx] = state.annotations[idx];
      }
    });
    state.annotations = newAnnotations;
    
    for (let i = 0; i < copiedPages.length; i++) {
      state.pdfDoc.insertPage(insertIndex + i, copiedPages[i]);
    }
    
    await syncPdfDoc();
    state.currentPage = insertIndex + 1;
    
    await renderCurrentPage();
    await renderThumbnails();
    showToast(`Merged ${copiedPages.length} pages from ${state.selectedMergeFile.name}`, 'success');
  } catch (err) {
    console.error('Failed to merge PDF:', err);
    showToast('Failed to merge PDF: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

// Rotate Page
elements.btnRotatePage.addEventListener('click', async () => {
  if (!state.pdfDoc || state.currentPage < 1) return;
  try {
    showLoading('Rotating page...');
    const page = state.pdfDoc.getPage(state.currentPage - 1);
    const currentRotation = page.getRotation().angle;
    page.setRotation(degrees((currentRotation + 90) % 360));
    
    await syncPdfDoc();
    await renderCurrentPage();
    await renderThumbnails();
    showToast(`Page ${state.currentPage} rotated 90°`, 'info', 1200);
  } catch (err) {
    console.error('Failed to rotate page:', err);
  } finally {
    hideLoading();
  }
});

function openMobileSidebar() {
  elements.appSidebar.classList.add('mobile-open');
  if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.add('show');
}

function closeMobileSidebar() {
  elements.appSidebar.classList.remove('mobile-open');
  if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('show');
}

function toggleSidebar() {
  if (window.innerWidth <= 768) {
    if (elements.appSidebar.classList.contains('mobile-open')) {
      closeMobileSidebar();
    } else {
      openMobileSidebar();
    }
  } else {
    elements.appSidebar.classList.toggle('collapsed');
  }
}

if (elements.btnToggleSidebar) {
  elements.btnToggleSidebar.addEventListener('click', toggleSidebar);
}
if (elements.btnMobileSidebarToggle) {
  elements.btnMobileSidebarToggle.addEventListener('click', toggleSidebar);
}
if (elements.btnCloseSidebarMobile) {
  elements.btnCloseSidebarMobile.addEventListener('click', closeMobileSidebar);
}
if (elements.sidebarBackdrop) {
  elements.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
}

// -------------------------------------------------------------
// Save & Download Edited PDF (Bakes Text, Whiteouts, Images, Drawings)
// -------------------------------------------------------------
elements.btnSaveFile.addEventListener('click', async () => {
  if (!state.pdfDoc) return;
  
  try {
    showLoading('Baking annotations and exporting PDF...');
    
    const helveticaFont = await state.pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await state.pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const timesFont = await state.pdfDoc.embedFont(StandardFonts.TimesRoman);
    const courierFont = await state.pdfDoc.embedFont(StandardFonts.Courier);
    
    function getFontObject(fontFamily, bold) {
      if (bold) return helveticaBoldFont;
      if (fontFamily === 'TimesRoman') return timesFont;
      if (fontFamily === 'Courier') return courierFont;
      return helveticaFont;
    }
    
    // Process each page
    for (const pageNumStr of Object.keys(state.annotations)) {
      const pageNum = parseInt(pageNumStr, 10);
      if (pageNum < 1 || pageNum > state.numPages) continue;
      
      const pageAnns = state.annotations[pageNum];
      if (!pageAnns || pageAnns.length === 0) continue;
      
      const page = state.pdfDoc.getPage(pageNum - 1);
      
      for (const ann of pageAnns) {
        // 1. Whiteout / Redaction
        if (ann.type === 'whiteout') {
          const hex = ann.color || '#ffffff';
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          
          page.drawRectangle({
            x: ann.pdfX,
            y: ann.pdfY,
            width: ann.pdfWidth,
            height: ann.pdfHeight,
            color: rgb(r, g, b),
            borderWidth: 0
          });
        } 
        // 2. Text Insert
        else if (ann.type === 'text') {
          const font = getFontObject(ann.fontFamily, ann.bold);
          const fontSize = ann.fontSize || 14;
          
          const hex = ann.color || '#000000';
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          
          page.drawText(ann.text || '', {
            x: ann.pdfX,
            y: ann.pdfY - (fontSize * 0.8),
            size: fontSize,
            font: font,
            color: rgb(r, g, b)
          });
        }
        // 3. Image Stamp (Option C)
        else if (ann.type === 'image' && ann.imageBytes) {
          try {
            const embeddedImg = ann.isPng 
              ? await state.pdfDoc.embedPng(ann.imageBytes)
              : await state.pdfDoc.embedJpg(ann.imageBytes);
              
            page.drawImage(embeddedImg, {
              x: ann.pdfX,
              y: ann.pdfY,
              width: ann.pdfWidth,
              height: ann.pdfHeight
            });
          } catch (imgErr) {
            console.warn('Image embed warning:', imgErr);
          }
        }
        // 4. Freehand Signature / Drawing (Option C)
        else if (ann.type === 'drawing' && ann.strokePoints && ann.strokePoints.length > 1) {
          const hex = ann.color || '#0f172a';
          const r = parseInt(hex.slice(1, 3), 16) / 255;
          const g = parseInt(hex.slice(3, 5), 16) / 255;
          const b = parseInt(hex.slice(5, 7), 16) / 255;
          
          for (let i = 0; i < ann.strokePoints.length - 1; i++) {
            const p1 = ann.strokePoints[i];
            const p2 = ann.strokePoints[i + 1];
            page.drawLine({
              start: { x: p1.pdfX, y: p1.pdfY },
              end: { x: p2.pdfX, y: p2.pdfY },
              thickness: ann.strokeWidth || 2,
              color: rgb(r, g, b)
            });
          }
        }
      }
    }
    
    const finalPdfBytes = await state.pdfDoc.save();
    
    const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    const baseName = state.fileName.replace(/\.pdf$/i, '');
    a.download = `${baseName}-edited.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    
    markDirty(false);
    showToast('Exported PDF successfully', 'success');
  } catch (err) {
    console.error('Failed to save PDF:', err);
    showToast('Export failed: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

// File Open & Drag-Drop Handling
elements.btnOpenFile.addEventListener('click', () => elements.fileInput.click());
elements.btnBrowseFile.addEventListener('click', () => elements.fileInput.click());

elements.fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    const arrayBuffer = await file.arrayBuffer();
    await loadPDFFromBytes(new Uint8Array(arrayBuffer), file.name);
  }
});

const dropArea = elements.viewportContainer;
['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.emptyState.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.emptyState.classList.remove('dragover');
  });
});

dropArea.addEventListener('drop', async (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type === 'application/pdf') {
    const file = files[0];
    const arrayBuffer = await file.arrayBuffer();
    await loadPDFFromBytes(new Uint8Array(arrayBuffer), file.name);
  } else if (files.length > 0) {
    showToast('Please drop a valid PDF file.', 'error');
  }
});

// Demo Sample PDF Generator
async function generateSamplePdf() {
  try {
    showLoading('Generating demo document...');
    const doc = await PDFDocument.create();
    
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
    
    // Page 1
    const page1 = doc.addPage([595.28, 841.89]);
    page1.drawText('Invoice #INV-2026-9842', {
      x: 50,
      y: 780,
      size: 20,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.15)
    });
    
    page1.drawText('Issue Date: September 20, 2026', { x: 50, y: 748, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
    page1.drawText('Billed To: Acme Technology Labs', { x: 50, y: 730, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
    
    page1.drawRectangle({
      x: 50,
      y: 680,
      width: 495,
      height: 24,
      color: rgb(0.95, 0.95, 0.97)
    });
    page1.drawText('ITEM DESCRIPTION', { x: 60, y: 688, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    page1.drawText('HOURS', { x: 340, y: 688, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    page1.drawText('RATE', { x: 410, y: 688, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    page1.drawText('TOTAL', { x: 480, y: 688, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
    
    page1.drawText('Frontend Architecture & Design Engineering', { x: 60, y: 650, size: 11, font });
    page1.drawText('40', { x: 345, y: 650, size: 11, font });
    page1.drawText('$150.00', { x: 410, y: 650, size: 11, font });
    page1.drawText('$6,000.00', { x: 480, y: 650, size: 11, font });
    
    page1.drawText('CONFIDENTIAL CONTRACT TERMS (Try Selecting & Erasing):', { x: 50, y: 560, size: 11, font: fontBold, color: rgb(0.8, 0.2, 0.2) });
    page1.drawText('Private Discount Code: LINEAR_SPECIAL_DISCOUNT_80', { x: 50, y: 535, size: 11, font });
    page1.drawText('Internal Note: Authorized by lead design engineer.', { x: 50, y: 515, size: 11, font });
    
    page1.drawText('Interactive Superpowers Testing Guide:', { x: 50, y: 440, size: 12, font: fontBold });
    page1.drawText('1. Option A: Highlight text above with mouse to see the floating "Erase Selected Text" pill!', { x: 50, y: 415, size: 10, font });
    page1.drawText('2. Undo/Redo: Press Ctrl+Z to undo any action, Ctrl+Y to redo.', { x: 50, y: 395, size: 10, font });
    page1.drawText('3. Option B: Drag thumbnail pages in sidebar up/down to reorder, or click Duplicate/Extract.', { x: 50, y: 375, size: 10, font });
    page1.drawText('4. Option C: Select "Draw / Sign" (D) to draw a signature, or "Image" (I) to stamp a logo.', { x: 50, y: 355, size: 10, font });
    
    // Page 2
    const page2 = doc.addPage([595.28, 841.89]);
    page2.drawText('Appendix & Legal Disclaimers (Page 2)', {
      x: 50,
      y: 780,
      size: 18,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2)
    });
    page2.drawText('This second page is designed to test drag & drop reordering and page splitting.', { x: 50, y: 740, size: 11, font });
    
    const sampleBytes = await doc.save();
    await loadPDFFromBytes(sampleBytes, 'demo-invoice.pdf');
  } catch (err) {
    console.error('Error creating sample PDF:', err);
    showToast('Failed to create sample PDF: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

elements.btnSampleFile.addEventListener('click', generateSamplePdf);
elements.btnLoadSampleHero.addEventListener('click', generateSamplePdf);

setTool('select');

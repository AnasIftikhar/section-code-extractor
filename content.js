// Content script for element selection and extraction

let highlightMode = false;
let currentHighlightedElement = null;
let overlay = null;

// Initialize overlay for highlighting
function createOverlay() {
  if (overlay) return;

  overlay = document.createElement('div');
  overlay.id = 'section-extractor-overlay';
  overlay.style.cssText = `
    position: absolute;
    border: 3px solid #4CAF50;
    background: rgba(76, 175, 80, 0.1);
    pointer-events: none;
    z-index: 999999;
    display: none;
  `;
  document.body.appendChild(overlay);
}

// Highlight element on hover
function highlightElement(e) {
  if (!highlightMode) return;

  e.stopPropagation();
  currentHighlightedElement = e.target;

  const rect = e.target.getBoundingClientRect();
  overlay.style.display = 'block';
  overlay.style.top = (rect.top + window.scrollY) + 'px';
  overlay.style.left = (rect.left + window.scrollX) + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';
}

// Remove highlight
function removeHighlight() {
  if (overlay) {
    overlay.style.display = 'none';
  }
  currentHighlightedElement = null;
}

// Extract HTML from element
function extractHTML(element) {
  const clone = element.cloneNode(true);

  // Remove script tags and event handlers
  const scripts = clone.querySelectorAll('script');
  scripts.forEach(s => s.remove());

  // Format HTML with proper indentation
  return formatHTML(clone.outerHTML);
}

// Format HTML with indentation
function formatHTML(html) {
  let formatted = '';
  let indent = 0;

  html.split(/>\s*</).forEach(node => {
    if (node.match(/^\/\w/)) indent--;
    formatted += '  '.repeat(Math.max(0, indent)) + '<' + node + '>\n';
    if (node.match(/^<?\w[^>]*[^\/]$/) && !node.startsWith("input")) indent++;
  });

  return formatted.substring(1, formatted.length - 2);
}

// Extract CSS for element and its children
function extractCSS(element) {
  const styles = new Map();
  const elements = [element, ...element.querySelectorAll('*')];

  elements.forEach(el => {
    // Get computed styles
    const computed = window.getComputedStyle(el);
    const cssText = [];

    // Important CSS properties to extract
    const importantProps = [
      'display', 'position', 'top', 'left', 'right', 'bottom',
      'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'background', 'background-color', 'background-image', 'background-size', 'background-position',
      'border', 'border-radius', 'box-shadow',
      'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
      'flex', 'flex-direction', 'justify-content', 'align-items', 'gap',
      'grid', 'grid-template-columns', 'grid-template-rows', 'grid-gap',
      'transform', 'transition', 'animation',
      'opacity', 'z-index', 'overflow'
    ];

    importantProps.forEach(prop => {
      const value = computed.getPropertyValue(prop);
      if (value && value !== 'none' && value !== 'normal' && value !== '0px') {
        cssText.push(`  ${prop}: ${value};`);
      }
    });

    if (cssText.length > 0) {
      const selector = getSelector(el);
      styles.set(selector, cssText.join('\n'));
    }
  });

  // Combine all styles
  let css = '';
  styles.forEach((rules, selector) => {
    css += `${selector} {\n${rules}\n}\n\n`;
  });

  return css;
}

// Generate CSS selector for element
function getSelector(el) {
  if (el.id) return `#${el.id}`;

  const classes = Array.from(el.classList)
    .filter(c => !c.startsWith('section-extractor'))
    .slice(0, 3)
    .join('.');

  if (classes) return `.${classes}`;

  return el.tagName.toLowerCase();
}

// Extract JavaScript event listeners and inline handlers
function extractJS(element) {
  const scripts = [];
  const elements = [element, ...element.querySelectorAll('*')];

  elements.forEach((el, index) => {
    // Check for inline event handlers
    const eventAttrs = ['onclick', 'onload', 'onchange', 'onsubmit', 'onmouseover', 'onmouseout'];
    eventAttrs.forEach(attr => {
      if (el.hasAttribute(attr)) {
        scripts.push(`// Inline ${attr} on element ${index}`);
        scripts.push(el.getAttribute(attr));
        scripts.push('');
      }
    });

    // Try to detect event listeners (limited capability)
    if (el.onclick) {
      scripts.push(`// Click handler on element ${index}`);
      scripts.push(el.onclick.toString());
      scripts.push('');
    }
  });

  // Extract inline script tags
  const inlineScripts = element.querySelectorAll('script:not([src])');
  inlineScripts.forEach((script, index) => {
    if (script.textContent.trim()) {
      scripts.push(`// Inline script ${index + 1}`);
      scripts.push(script.textContent);
      scripts.push('');
    }
  });

  return scripts.length > 0 ? scripts.join('\n') : '// No JavaScript detected for this section';
}

// Handle element click for extraction
function handleElementClick(e) {
  if (!highlightMode) return;

  e.preventDefault();
  e.stopPropagation();

  const element = currentHighlightedElement || e.target;

  // Extract all code
  const html = extractHTML(element);
  const css = extractCSS(element);
  const js = extractJS(element);

  // Get section name from element
  const sectionName = element.id ||
    element.className.split(' ')[0] ||
    element.tagName.toLowerCase();

  // Send to background script
  chrome.runtime.sendMessage({
    action: 'saveExtractedData',
    data: {
      html,
      css,
      js,
      sectionName,
      url: window.location.href,
      timestamp: new Date().toISOString()
    }
  }, () => {
    // Open popup
    alert('Code extracted! Click the extension icon to view.');
    toggleHighlightMode();
  });
}

// Toggle highlight mode
function toggleHighlightMode() {
  highlightMode = !highlightMode;

  if (highlightMode) {
    createOverlay();
    document.addEventListener('mouseover', highlightElement);
    document.addEventListener('mouseout', removeHighlight);
    document.addEventListener('click', handleElementClick);
    document.body.style.cursor = 'crosshair';
  } else {
    document.removeEventListener('mouseover', highlightElement);
    document.removeEventListener('mouseout', removeHighlight);
    document.removeEventListener('click', handleElementClick);
    document.body.style.cursor = 'default';
    removeHighlight();
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleHighlight') {
    toggleHighlightMode();
    sendResponse({ success: true });
  } else if (request.action === 'extractElement') {
    if (!highlightMode) {
      toggleHighlightMode();
    }
    sendResponse({ success: true });
  }
  return true;
});

// Initialize - wait for page to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createOverlay);
} else {
  createOverlay();
}
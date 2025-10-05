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

  // Clean up elementor-specific classes and IDs
  cleanupElementorAttributes(clone);

  // Format HTML with proper indentation
  return formatHTML(clone.outerHTML);
}

// Clean up Elementor-specific attributes
function cleanupElementorAttributes(element) {
  const allElements = [element, ...element.querySelectorAll('*')];

  allElements.forEach(el => {
    // Remove Elementor-specific classes
    const classes = Array.from(el.classList);
    classes.forEach(cls => {
      if (cls.startsWith('elementor-') || cls.startsWith('e-con') || cls.startsWith('e-flex')) {
        el.classList.remove(cls);
      }
    });

    // Remove Elementor-specific IDs
    if (el.id && el.id.startsWith('elementor-')) {
      el.removeAttribute('id');
    }

    // Remove data attributes
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('data-elementor') || attr.name.startsWith('data-id') || attr.name.startsWith('data-element')) {
        el.removeAttribute(attr.name);
      }
    });
  });
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

// Extract only relevant styles
function extractRelevantStyles(el, computed) {
  const rules = [];
  const parent = el.parentElement;
  const parentComputed = parent ? window.getComputedStyle(parent) : null;

  // Layout & Display
  if (computed.display !== 'block' && computed.display !== 'inline') {
    rules.push(`  display: ${computed.display};`);
  }

  if (computed.position !== 'static') {
    rules.push(`  position: ${computed.position};`);
    ['top', 'right', 'bottom', 'left'].forEach(prop => {
      const val = computed[prop];
      if (val !== 'auto' && val !== '0px') {
        rules.push(`  ${prop}: ${val};`);
      }
    });
  }

  // Flexbox
  if (computed.display === 'flex') {
    if (computed.flexDirection !== 'row') {
      rules.push(`  flex-direction: ${computed.flexDirection};`);
    }
    if (computed.justifyContent !== 'normal' && computed.justifyContent !== 'flex-start') {
      rules.push(`  justify-content: ${computed.justifyContent};`);
    }
    if (computed.alignItems !== 'normal' && computed.alignItems !== 'stretch') {
      rules.push(`  align-items: ${computed.alignItems};`);
    }
    if (computed.gap !== '0px' && computed.gap !== 'normal') {
      rules.push(`  gap: ${computed.gap};`);
    }
  }

  // Dimensions
  const width = computed.width;
  const height = computed.height;

  if (width && !width.includes('%') && parseFloat(width) > 0 && isExplicitSize(el, 'width')) {
    rules.push(`  width: ${width};`);
  }
  if (height && height !== 'auto' && parseFloat(height) > 0 && isExplicitSize(el, 'height')) {
    rules.push(`  height: ${height};`);
  }
  if (computed.maxWidth !== 'none') {
    rules.push(`  max-width: ${computed.maxWidth};`);
  }
  if (computed.minHeight !== '0px' && computed.minHeight !== 'auto') {
    rules.push(`  min-height: ${computed.minHeight};`);
  }

  // Spacing
  ['margin', 'padding'].forEach(prop => {
    const val = computed[prop];
    if (hasNonZeroSpacing(val)) {
      rules.push(`  ${prop}: ${val};`);
    }
  });

  // Background
  if (hasVisibleBackground(computed.backgroundColor)) {
    rules.push(`  background-color: ${computed.backgroundColor};`);
  }
  if (computed.backgroundImage !== 'none') {
    rules.push(`  background-image: ${computed.backgroundImage};`);
    if (computed.backgroundSize !== 'auto') {
      rules.push(`  background-size: ${computed.backgroundSize};`);
    }
    if (computed.backgroundPosition !== '0% 0%') {
      rules.push(`  background-position: ${computed.backgroundPosition};`);
    }
    if (computed.backgroundRepeat !== 'repeat') {
      rules.push(`  background-repeat: ${computed.backgroundRepeat};`);
    }
  }

  // Border
  if (hasVisibleBorder(computed)) {
    if (computed.borderWidth !== '0px') {
      rules.push(`  border: ${computed.borderWidth} ${computed.borderStyle} ${computed.borderColor};`);
    }
  }
  if (computed.borderRadius !== '0px') {
    rules.push(`  border-radius: ${computed.borderRadius};`);
  }

  // Visual Effects
  if (computed.boxShadow !== 'none') {
    rules.push(`  box-shadow: ${computed.boxShadow};`);
  }
  if (computed.opacity !== '1') {
    rules.push(`  opacity: ${computed.opacity};`);
  }
  if (computed.transform !== 'none') {
    rules.push(`  transform: ${computed.transform};`);
  }

  // Typography (only if different from parent)
  if (!parentComputed || computed.color !== parentComputed.color) {
    if (hasVisibleColor(computed.color)) {
      rules.push(`  color: ${computed.color};`);
    }
  }

  if (!parentComputed || computed.fontFamily !== parentComputed.fontFamily) {
    rules.push(`  font-family: ${computed.fontFamily};`);
  }

  if (!parentComputed || computed.fontSize !== parentComputed.fontSize) {
    if (computed.fontSize !== '16px') {
      rules.push(`  font-size: ${computed.fontSize};`);
    }
  }

  if (computed.fontWeight !== '400' && computed.fontWeight !== 'normal') {
    rules.push(`  font-weight: ${computed.fontWeight};`);
  }

  if (computed.textAlign !== 'start' && computed.textAlign !== 'left') {
    rules.push(`  text-align: ${computed.textAlign};`);
  }

  if (computed.textDecoration !== 'none solid rgb(0, 0, 0)' &&
    !computed.textDecoration.includes('none')) {
    rules.push(`  text-decoration: ${computed.textDecoration};`);
  }

  if (computed.lineHeight !== 'normal' && shouldIncludeLineHeight(computed)) {
    rules.push(`  line-height: ${computed.lineHeight};`);
  }

  // Cursor
  if (computed.cursor !== 'auto' && computed.cursor !== 'default' && computed.cursor !== 'crosshair') {
    rules.push(`  cursor: ${computed.cursor};`);
  }

  // Transitions
  if (computed.transition !== 'all 0s ease 0s' && !computed.transition.includes('0s')) {
    rules.push(`  transition: ${computed.transition};`);
  }

  // Z-index (only if positioned)
  if (computed.position !== 'static' && computed.zIndex !== 'auto') {
    rules.push(`  z-index: ${computed.zIndex};`);
  }

  return rules;
}

// Extract hover styles by checking stylesheets
function extractHoverStyles(el) {
  const rules = [];
  const selector = getScopedSelector(el);

  try {
    // Check all stylesheets for hover rules
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (rule.selectorText && rule.selectorText.includes(':hover')) {
            // Check if this rule might apply to our element
            const baseSelector = rule.selectorText.split(':hover')[0].trim();
            if (el.matches(baseSelector)) {
              // Extract hover properties
              Array.from(rule.style).forEach(prop => {
                const value = rule.style.getPropertyValue(prop);
                if (value) {
                  rules.push(`  ${prop}: ${value};`);
                }
              });
            }
          }
        });
      } catch (e) {
        // Skip inaccessible stylesheets (CORS)
      }
    });
  } catch (e) {
    console.log('Could not access stylesheets for hover detection');
  }

  return rules;
}

// Generate responsive styles
function generateResponsiveStyles(element, baseSelector) {
  let responsive = '';

  responsive += '/* ========== Responsive Styles ========== */\n\n';

  // Tablet
  responsive += '/* Tablet */\n';
  responsive += '@media (max-width: 1024px) {\n';
  responsive += `  ${baseSelector} {\n`;
  responsive += '    padding: 20px;\n';
  responsive += '  }\n';
  responsive += '}\n\n';

  // Mobile
  responsive += '/* Mobile */\n';
  responsive += '@media (max-width: 768px) {\n';
  responsive += `  ${baseSelector} {\n`;
  responsive += '    flex-direction: column;\n';
  responsive += '    padding: 15px;\n';
  responsive += '  }\n';
  responsive += '}\n\n';

  return responsive;
}

// Get scoped selector (not generic tags)
function getScopedSelector(el, baseSelector = '') {
  // Priority 1: Use meaningful ID
  if (el.id && !el.id.startsWith('elementor-') && !el.id.startsWith('menu-item-')) {
    return `#${el.id}`;
  }

  // Priority 2: Use meaningful classes
  const meaningfulClasses = Array.from(el.classList).filter(cls =>
    !cls.startsWith('elementor-') &&
    !cls.startsWith('e-con') &&
    !cls.startsWith('e-flex') &&
    !cls.startsWith('wp-') &&
    cls.length > 2
  );

  if (meaningfulClasses.length > 0) {
    return `.${meaningfulClasses.slice(0, 2).join('.')}`;
  }

  // Priority 3: Use semantic tag with context
  const tag = el.tagName.toLowerCase();

  // For common tags, add more context
  if (['div', 'span', 'a', 'li', 'ul'].includes(tag)) {
    const parent = el.parentElement;
    if (parent && parent.classList.length > 0) {
      const parentClass = Array.from(parent.classList).find(c =>
        !c.startsWith('elementor-') && c.length > 2
      );
      if (parentClass) {
        return `.${parentClass} ${tag}`;
      }
    }
  }

  return tag;
}

// Helper functions
function isExplicitSize(el, prop) {
  const style = el.style[prop];
  return style && style !== '' && style !== 'auto';
}

function hasNonZeroSpacing(value) {
  if (!value) return false;
  return value.split(' ').some(v => parseFloat(v) > 0);
}

function hasVisibleBackground(bg) {
  if (!bg) return false;
  const transparent = ['rgba(0, 0, 0, 0)', 'transparent', 'rgba(255, 255, 255, 0)'];
  return !transparent.includes(bg);
}

function hasVisibleBorder(computed) {
  return parseFloat(computed.borderWidth) > 0;
}

function hasVisibleColor(color) {
  if (!color) return false;
  const transparent = ['rgba(0, 0, 0, 0)', 'transparent'];
  return !transparent.includes(color);
}

function shouldIncludeLineHeight(computed) {
  const lh = parseFloat(computed.lineHeight);
  const fs = parseFloat(computed.fontSize);
  if (!lh || !fs) return false;
  const ratio = lh / fs;
  // Only include if significantly different from default (1.2-1.5)
  return ratio < 1.1 || ratio > 1.6;
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

  if (scripts.length === 0) {
    return `// No JavaScript detected for this section
// Add your custom JavaScript here if needed

// Example: Add event listeners
// document.querySelector('.your-button').addEventListener('click', function() {
//   console.log('Button clicked');
// });`;
  }

  return scripts.join('\n');
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
  const sectionName = getSectionName(element);

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
    // Deactivate highlight mode
    toggleHighlightMode();

    // Show success message
    showSuccessNotification();
  });
}

// Get meaningful section name
function getSectionName(element) {
  // Try to find meaningful identifier
  if (element.id && !element.id.startsWith('elementor-')) {
    return element.id;
  }

  const meaningfulClass = Array.from(element.classList).find(c =>
    !c.startsWith('elementor-') &&
    !c.startsWith('e-') &&
    c.length > 2
  );

  if (meaningfulClass) {
    return meaningfulClass;
  }

  // Use tag name with index
  const tag = element.tagName.toLowerCase();
  return `${tag}-section`;
}

// Show success notification
function showSuccessNotification() {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 10000000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    animation: slideIn 0.3s ease;
  `;
  notification.innerHTML = '✓ Code extracted! Click extension icon to view.';

  // Add animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Toggle highlight mode
function toggleHighlightMode() {
  highlightMode = !highlightMode;

  if (highlightMode) {
    createOverlay();
    document.addEventListener('mouseover', highlightElement, true);
    document.addEventListener('mouseout', removeHighlight, true);
    document.addEventListener('click', handleElementClick, true);
    document.body.style.cursor = 'crosshair';
  } else {
    document.removeEventListener('mouseover', highlightElement, true);
    document.removeEventListener('mouseout', removeHighlight, true);
    document.removeEventListener('click', handleElementClick, true);
    document.body.style.cursor = 'default';
    removeHighlight();

    // Notify background script
    chrome.runtime.sendMessage({ action: 'highlightDeactivated' });
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
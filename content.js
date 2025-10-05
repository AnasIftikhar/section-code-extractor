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
  const processedSelectors = new Set();

  elements.forEach(el => {
    const computed = window.getComputedStyle(el);
    const rules = extractRelevantStyles(el, computed);

    if (rules.length > 0) {
      const selector = getScopedSelector(el);

      // Skip if no valid selector or already processed
      if (!selector || processedSelectors.has(selector)) {
        return;
      }

      processedSelectors.add(selector);

      // Add base styles
      let cssBlock = rules.join('\n');

      // Add hover styles if available
      const hoverStyles = extractHoverStyles(el);
      if (hoverStyles.length > 0) {
        styles.set(`${selector}:hover`, hoverStyles.join('\n'));
      }

      styles.set(selector, cssBlock);
    }
  });

  // Combine all styles with better organization
  let css = '/* ========== Extracted Section Styles ========== */\n';
  css += '/* Copy these styles to Elementor Custom CSS */\n\n';

  styles.forEach((rules, selector) => {
    css += `${selector} {\n${rules}\n}\n\n`;
  });

  // Add basic responsive styles
  css += generateResponsiveStyles(element, getScopedSelector(element));

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

function extractRelevantStyles(el, computed) {
  const rules = [];
  const parent = el.parentElement;
  const parentComputed = parent ? window.getComputedStyle(parent) : null;

  // Skip extraction for generic elements without meaningful classes/IDs
  const hasIdentifier = el.id || el.classList.length > 0;
  const isGenericTag = ['div', 'span', 'ul', 'li', 'a', 'img'].includes(el.tagName.toLowerCase());

  if (isGenericTag && !hasIdentifier) {
    return []; // Skip generic elements
  }

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
  if (computed.display === 'flex' || computed.display === 'inline-flex') {
    if (computed.flexDirection !== 'row') {
      rules.push(`  flex-direction: ${computed.flexDirection};`);
    }
    if (computed.justifyContent !== 'normal' && computed.justifyContent !== 'flex-start') {
      rules.push(`  justify-content: ${computed.justifyContent};`);
    }
    if (computed.alignItems !== 'normal' && computed.alignItems !== 'stretch') {
      rules.push(`  align-items: ${computed.alignItems};`);
    }
    if (computed.flexWrap !== 'nowrap') {
      rules.push(`  flex-wrap: ${computed.flexWrap};`);
    }
    if (computed.gap !== '0px' && computed.gap !== 'normal') {
      rules.push(`  gap: ${computed.gap};`);
    }
  }

  // Grid
  if (computed.display === 'grid' || computed.display === 'inline-grid') {
    if (computed.gridTemplateColumns !== 'none') {
      rules.push(`  grid-template-columns: ${computed.gridTemplateColumns};`);
    }
    if (computed.gridTemplateRows !== 'none') {
      rules.push(`  grid-template-rows: ${computed.gridTemplateRows};`);
    }
    if (computed.gap !== '0px') {
      rules.push(`  gap: ${computed.gap};`);
    }
  }

  // Dimensions - be more selective
  const width = computed.width;
  const height = computed.height;

  if (width && width !== 'auto' && !width.includes('px') || (parseFloat(width) > 0 && parseFloat(width) < 2000)) {
    if (el.style.width || computed.maxWidth !== 'none') {
      rules.push(`  width: ${width};`);
    }
  }

  if (height && height !== 'auto' && parseFloat(height) > 0) {
    if (el.style.height || computed.minHeight !== '0px') {
      rules.push(`  height: ${height};`);
    }
  }

  if (computed.maxWidth !== 'none' && computed.maxWidth !== width) {
    rules.push(`  max-width: ${computed.maxWidth};`);
  }

  if (computed.minHeight !== '0px' && computed.minHeight !== 'auto') {
    rules.push(`  min-height: ${computed.minHeight};`);
  }

  // Spacing - only if non-zero
  if (hasNonZeroSpacing(computed.margin)) {
    rules.push(`  margin: ${computed.margin};`);
  }

  if (hasNonZeroSpacing(computed.padding)) {
    rules.push(`  padding: ${computed.padding};`);
  }

  // Background - only visible backgrounds
  const bgColor = computed.backgroundColor;
  if (hasVisibleBackground(bgColor)) {
    rules.push(`  background-color: ${bgColor};`);
  }

  if (computed.backgroundImage !== 'none') {
    rules.push(`  background-image: ${computed.backgroundImage};`);
    if (computed.backgroundSize !== 'auto auto') {
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
  const borderWidth = computed.borderWidth;
  if (hasVisibleBorder(computed)) {
    const borderStyle = computed.borderStyle;
    const borderColor = computed.borderColor;
    rules.push(`  border: ${borderWidth} ${borderStyle} ${borderColor};`);
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

  // Typography - CRITICAL for exact replication
  const textColor = computed.color;
  if (hasVisibleColor(textColor)) {
    // Always include color for text elements
    const isTextElement = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'li', 'button'].includes(el.tagName.toLowerCase());
    if (isTextElement || !parentComputed || textColor !== parentComputed.color) {
      rules.push(`  color: ${textColor};`);
    }
  }

  // Font family - always include for styled elements
  const fontFamily = computed.fontFamily;
  if (!parentComputed || fontFamily !== parentComputed.fontFamily) {
    if (fontFamily !== 'Times New Roman' && fontFamily !== 'serif') {
      rules.push(`  font-family: ${fontFamily};`);
    }
  }

  // Font size - CRITICAL
  const fontSize = computed.fontSize;
  if (fontSize && fontSize !== '16px') {
    rules.push(`  font-size: ${fontSize};`);
  }

  // Font weight - CRITICAL for headings and emphasis
  const fontWeight = computed.fontWeight;
  if (fontWeight !== '400' && fontWeight !== 'normal') {
    rules.push(`  font-weight: ${fontWeight};`);
  }

  // Text alignment
  if (computed.textAlign !== 'start' && computed.textAlign !== 'left') {
    rules.push(`  text-align: ${computed.textAlign};`);
  }

  // Text decoration
  if (computed.textDecoration && !computed.textDecoration.includes('none')) {
    rules.push(`  text-decoration: ${computed.textDecoration};`);
  }

  // Letter spacing - important for styled text
  const letterSpacing = computed.letterSpacing;
  if (letterSpacing && letterSpacing !== 'normal' && letterSpacing !== '0px') {
    rules.push(`  letter-spacing: ${letterSpacing};`);
  }

  // Text transform
  if (computed.textTransform !== 'none') {
    rules.push(`  text-transform: ${computed.textTransform};`);
  }

  // Line height - important for readability
  if (computed.lineHeight !== 'normal' && shouldIncludeLineHeight(computed)) {
    rules.push(`  line-height: ${computed.lineHeight};`);
  }

  // Cursor - for interactive elements
  const cursor = computed.cursor;
  if (cursor !== 'auto' && cursor !== 'default' && cursor !== 'text') {
    rules.push(`  cursor: ${cursor};`);
  }

  // Transitions - for smooth interactions
  const transition = computed.transition;
  if (transition && !transition.includes('all 0s') && transition !== 'all 0s ease 0s') {
    rules.push(`  transition: ${transition};`);
  }

  // Z-index - for layering
  if (computed.position !== 'static' && computed.zIndex !== 'auto' && computed.zIndex !== '0') {
    rules.push(`  z-index: ${computed.zIndex};`);
  }

  // Overflow - important for scrolling
  if (computed.overflow !== 'visible') {
    rules.push(`  overflow: ${computed.overflow};`);
  }

  return rules;
}
// Extract hover styles by checking stylesheets
function extractHoverStyles(el) {
  const rules = [];
  const selector = getScopedSelector(el);

  if (!selector) return rules;

  try {
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (rule.selectorText && rule.selectorText.includes(':hover')) {
            const baseSelector = rule.selectorText.split(':hover')[0].trim();

            // Check if this rule applies to our element
            try {
              if (el.matches(baseSelector)) {
                // Extract only important hover properties
                const importantHoverProps = [
                  'background-color', 'color', 'border-color',
                  'opacity', 'transform', 'box-shadow'
                ];

                importantHoverProps.forEach(prop => {
                  const value = rule.style.getPropertyValue(prop);
                  if (value && value !== 'initial' && value !== 'inherit') {
                    rules.push(`  ${prop}: ${value};`);
                  }
                });
              }
            } catch (e) {
              // Element doesn't match selector
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
  if (!baseSelector) return '';

  let responsive = '\n/* ========== Responsive Styles ========== */\n';
  responsive += '/* Adjust these breakpoints based on your design */\n\n';

  const computed = window.getComputedStyle(element);

  // Tablet
  responsive += '/* Tablet (1024px and below) */\n';
  responsive += '@media (max-width: 1024px) {\n';
  responsive += `  ${baseSelector} {\n`;

  if (computed.display === 'flex') {
    responsive += '    flex-wrap: wrap;\n';
  }
  if (parseFloat(computed.padding) > 20) {
    responsive += '    padding: 20px;\n';
  }
  if (parseFloat(computed.fontSize) > 16) {
    const tabletSize = Math.round(parseFloat(computed.fontSize) * 0.9);
    responsive += `    font-size: ${tabletSize}px;\n`;
  }

  responsive += '  }\n';
  responsive += '}\n\n';

  // Mobile
  responsive += '/* Mobile (768px and below) */\n';
  responsive += '@media (max-width: 768px) {\n';
  responsive += `  ${baseSelector} {\n`;

  if (computed.display === 'flex') {
    responsive += '    flex-direction: column;\n';
  }
  if (parseFloat(computed.padding) > 15) {
    responsive += '    padding: 15px;\n';
  }
  if (parseFloat(computed.fontSize) > 14) {
    const mobileSize = Math.round(parseFloat(computed.fontSize) * 0.85);
    responsive += `    font-size: ${mobileSize}px;\n`;
  }
  if (parseFloat(computed.gap) > 0) {
    responsive += '    gap: 15px;\n';
  }

  responsive += '  }\n';
  responsive += '}\n';

  return responsive;
}
// Get scoped selector (not generic tags)
function getScopedSelector(el, baseSelector = '') {
  // Priority 1: Use meaningful ID (skip Elementor/WordPress IDs)
  if (el.id &&
    !el.id.startsWith('elementor-') &&
    !el.id.startsWith('menu-item-') &&
    !el.id.startsWith('post-') &&
    !el.id.startsWith('comment-')) {
    return `#${el.id}`;
  }

  // Priority 2: Use meaningful classes (filter out framework classes)
  const meaningfulClasses = Array.from(el.classList).filter(cls =>
    !cls.startsWith('elementor-') &&
    !cls.startsWith('e-con') &&
    !cls.startsWith('e-flex') &&
    !cls.startsWith('e-') &&
    !cls.startsWith('wp-') &&
    !cls.startsWith('ekit-') &&
    !cls.startsWith('elementskit-') &&
    !cls.includes('lazyload') &&
    !cls.includes('animated') &&
    cls.length > 1 &&
    cls !== 'active' &&
    cls !== 'current'
  );

  if (meaningfulClasses.length > 0) {
    // Use up to 2 classes for specificity
    return `.${meaningfulClasses.slice(0, 2).join('.')}`;
  }

  // Priority 3: Use semantic tag with parent context
  const tag = el.tagName.toLowerCase();

  // For generic tags, add parent context
  if (['div', 'span', 'a', 'li', 'ul', 'p'].includes(tag)) {
    const parent = el.parentElement;
    if (parent) {
      const parentClasses = Array.from(parent.classList).filter(c =>
        !c.startsWith('elementor-') &&
        !c.startsWith('e-') &&
        !c.startsWith('wp-') &&
        c.length > 2
      );

      if (parentClasses.length > 0) {
        return `.${parentClasses[0]} > ${tag}`;
      }

      // Use parent tag if no class
      if (parent.tagName.toLowerCase() !== 'body') {
        return `${parent.tagName.toLowerCase()} > ${tag}`;
      }
    }

    // Skip extraction for naked generic tags
    return null;
  }

  // For semantic tags (header, nav, section, etc.), use as is
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
// Popup script for displaying extracted code

let currentData = null;

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadExtractedData();
  setupEventListeners();
});

// Simple syntax highlighter
function highlightCode(elementId, language) {
  const element = document.getElementById(elementId);
  let code = element.textContent;

  if (language === 'html') {
    code = code.replace(/(&lt;|<)([a-zA-Z0-9]+)/g, '<span class="token tag">$1$2</span>');
    code = code.replace(/([a-zA-Z-]+)(=)/g, '<span class="token attr-name">$1</span>$2');
    code = code.replace(/(["'])([^"']*)(["'])/g, '<span class="token attr-value">$1$2$3</span>');
  } else if (language === 'css') {
    code = code.replace(/([a-zA-Z-]+)(\s*:)/g, '<span class="token property">$1</span>$2');
    code = code.replace(/(:[\s]*)([^;{]+)/g, '$1<span class="token string">$2</span>');
    code = code.replace(/([.#][a-zA-Z0-9_-]+)/g, '<span class="token selector">$1</span>');
  } else if (language === 'javascript') {
    code = code.replace(/\b(function|const|let|var|if|else|return|for|while)\b/g, '<span class="token keyword">$1</span>');
    code = code.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, '<span class="token function">$1</span>(');
    code = code.replace(/\b(\d+)\b/g, '<span class="token number">$1</span>');
    code = code.replace(/(["'`])([^"'`]*)(["'`])/g, '<span class="token string">$1$2$3</span>');
  }

  element.innerHTML = code;
}

// Load extracted data from background script
async function loadExtractedData() {
  chrome.runtime.sendMessage({ action: 'getExtractedData' }, (response) => {
    if (chrome.runtime.lastError) {
      // Ignore connection errors
      console.log('Connection error (expected):', chrome.runtime.lastError.message);
      showNoData();
      return;
    }
    if (response && response.data) {
      currentData = response.data;
      displayData(currentData);
    } else {
      showNoData();
    }
  });
}

// Display extracted data
function displayData(data) {
  document.getElementById('noData').style.display = 'none';
  document.getElementById('dataContainer').style.display = 'flex';

  // Update section info
  document.getElementById('sectionName').textContent = data.sectionName;
  document.getElementById('sectionUrl').textContent = data.url;
  document.getElementById('sectionUrl').title = data.url;

  // Update code displays with simple highlighting
  document.getElementById('htmlCode').textContent = data.html;
  document.getElementById('cssCode').textContent = data.css;
  document.getElementById('jsCode').textContent = data.js;

  // Apply simple syntax highlighting
  highlightCode('htmlCode', 'html');
  highlightCode('cssCode', 'css');
  highlightCode('jsCode', 'javascript');
}

// Show no data state
function showNoData() {
  document.getElementById('noData').style.display = 'flex';
  document.getElementById('dataContainer').style.display = 'none';
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Copy buttons
  document.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      copyCode(btn.dataset.copy, btn);
    });
  });

  // Copy All button
  document.getElementById('copyAllBtn').addEventListener('click', copyAllCode);

  // Copy Separate button  <-- ADD THIS LINE HERE
  document.getElementById('copySeparateBtn').addEventListener('click', copySeparateSections);

  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportAsZip);

  // Clear button
  document.getElementById('clearBtn').addEventListener('click', clearData);

  // Toggle highlight button - now closes popup and activates on page
  document.getElementById('toggleHighlight').addEventListener('click', () => {
    window.close(); // Close popup, background script will handle activation
  });
}

// Switch between tabs
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');

  // Update content panels
  document.querySelectorAll('.content-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`${tabName}Content`).classList.add('active');
}

// Copy code to clipboard
async function copyCode(type, button) {
  if (!currentData) return;

  let code = '';
  switch (type) {
    case 'html':
      code = currentData.html;
      break;
    case 'css':
      code = currentData.css;
      break;
    case 'js':
      code = currentData.js;
      break;
  }

  try {
    await navigator.clipboard.writeText(code);

    // Visual feedback
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="icon">✓</span> Copied!';
    button.classList.add('copied');

    setTimeout(() => {
      button.innerHTML = originalText;
      button.classList.remove('copied');
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy to clipboard');
  }
}

// Copy all code as complete HTML file
async function copyAllCode(event) {
  if (!currentData) return;

  const button = event.target.closest('button');
  const allCode = generateFullHTML(currentData);

  try {
    await navigator.clipboard.writeText(allCode);

    // Visual feedback
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="icon">✓</span> All Code Copied!';
    button.style.background = '#4CAF50';

    setTimeout(() => {
      button.innerHTML = originalText;
      button.style.background = '';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy to clipboard');
  }
}

// Copy all code as separate sections
async function copySeparateSections(event) {
  if (!currentData) return;

  const button = event.target.closest('button');
  const separateCode = `<!-- ========== HTML ========== -->
${currentData.html}

/* ========== CSS ========== */
${currentData.css}

// ========== JavaScript ==========
${currentData.js}`;

  try {
    await navigator.clipboard.writeText(separateCode);

    // Visual feedback
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="icon">✓</span> Sections Copied!';
    button.style.background = '#4CAF50';

    setTimeout(() => {
      button.innerHTML = originalText;
      button.style.background = '#667eea';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy to clipboard');
  }
}

// Export as individual files
async function exportAsZip() {
  if (!currentData) return;

  try {
    const folderName = sanitizeFilename(currentData.sectionName);

    // Download HTML
    downloadFile(generateFullHTML(currentData), `${folderName}_index.html`, 'text/html');

    // Small delay between downloads
    await new Promise(resolve => setTimeout(resolve, 300));

    // Download CSS
    downloadFile(currentData.css, `${folderName}_style.css`, 'text/css');

    await new Promise(resolve => setTimeout(resolve, 300));

    // Download JS
    downloadFile(currentData.js, `${folderName}_script.js`, 'text/javascript');

    await new Promise(resolve => setTimeout(resolve, 300));

    // Download README
    downloadFile(generateReadme(currentData), `${folderName}_README.md`, 'text/markdown');

    // Visual feedback
    const btn = document.getElementById('exportBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="icon">✓</span> Exported!';

    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  } catch (err) {
    console.error('Export failed:', err);
    alert('Failed to export files');
  }
}

// Helper function to download files
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Generate full HTML document
function generateFullHTML(data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.sectionName}</title>
  <link rel="stylesheet" href="${sanitizeFilename(data.sectionName)}_style.css">
</head>
<body>
  <!-- Extracted from: ${data.url} -->
  <!-- Extracted on: ${new Date(data.timestamp).toLocaleString()} -->
  
${data.html}

  <script src="${sanitizeFilename(data.sectionName)}_script.js"></script>
</body>
</html>`;
}

// Generate README file
function generateReadme(data) {
  return `# ${data.sectionName}

## Section Information

- **Source URL**: ${data.url}
- **Extracted**: ${new Date(data.timestamp).toLocaleString()}
- **Extractor**: Section Code Extractor Chrome Extension

## Files

- \`${sanitizeFilename(data.sectionName)}_index.html\` - HTML structure of the section
- \`${sanitizeFilename(data.sectionName)}_style.css\` - CSS styles for the section
- \`${sanitizeFilename(data.sectionName)}_script.js\` - JavaScript code for the section

## Usage for Elementor

1. Open your WordPress site with Elementor
2. Create a new section or edit existing one
3. Use HTML widget to paste the HTML code
4. Add custom CSS in Elementor's custom CSS section
5. Add JavaScript using a code snippet plugin or theme functions

## Notes

- Some styles may need adjustment for Elementor compatibility
- External resources (images, fonts) may need to be re-linked
- JavaScript event listeners may need to be re-attached in Elementor context
- Test responsiveness and adjust media queries as needed

## Recommendations

- Review and clean up unnecessary CSS classes
- Optimize images and assets for web
- Check for WordPress/Elementor conflicts
- Test across different browsers and devices

---

Generated by Section Code Extractor
`;
}

// Sanitize filename
function sanitizeFilename(name) {
  return name
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
    .substring(0, 50);
}

// Clear extracted data
function clearData() {
  if (confirm('Clear extracted data? This cannot be undone.')) {
    currentData = null;
    chrome.runtime.sendMessage({
      action: 'clearExtractedData'
    }, () => {
      window.close(); // Close popup after clearing
    });
  }
}
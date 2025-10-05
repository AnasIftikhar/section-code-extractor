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
    if (response.data) {
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
  // Toggle highlight mode button
  document.getElementById('toggleHighlight').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleHighlight' }, (response) => {
        // Show confirmation before closing
        const btn = document.getElementById('toggleHighlight');
        btn.innerHTML = '<span class="icon">✓</span> Activated! Go click on page';
        btn.style.background = '#4CAF50';

        setTimeout(() => {
          window.close();
        }, 1000);
      });
    });
  });

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

  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportAsZip);

  // Clear button
  document.getElementById('clearBtn').addEventListener('click', clearData);
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

// Export as individual files (simplified without ZIP)
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
    alert('Failed to export ZIP file');
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
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <!-- Extracted from: ${data.url} -->
  <!-- Extracted on: ${new Date(data.timestamp).toLocaleString()} -->
  
${data.html}

  <script src="script.js"></script>
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

- \`index.html\` - HTML structure of the section
- \`style.css\` - CSS styles for the section
- \`script.js\` - JavaScript code for the section

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
      action: 'saveExtractedData',
      data: null
    });
    showNoData();
  }
}
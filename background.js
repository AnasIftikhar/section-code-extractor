// Background script for Chrome Extension

let extractedData = null;
let isHighlightActive = false;

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "extractSection",
    title: "Extract Section Code",
    contexts: ["all"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "extractSection") {
    activateHighlightMode(tab.id);
  }
});

// Handle extension icon click - Main entry point
chrome.action.onClicked.addListener(async (tab) => {
  // If we have extracted data, open popup to view it
  if (extractedData && !isHighlightActive) {
    chrome.action.setPopup({ popup: 'popup.html' });
    // The popup will open automatically on next click
    // So we need to trigger it programmatically
    return;
  }

  // Otherwise, activate highlight mode
  await activateHighlightMode(tab.id);
});

// Activate highlight mode with proper injection
async function activateHighlightMode(tabId) {
  try {
    // Get tab info
    const tab = await chrome.tabs.get(tabId);

    // Check if URL is restricted
    if (!tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('file://')) {

      // Show error badge
      chrome.action.setBadgeText({ text: '✗', tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#f44336', tabId: tabId });

      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: tabId });
      }, 2000);

      return;
    }

    // Inject CSS and JS
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['content.css']
      });
    } catch (err) {
      console.log('CSS already injected or failed:', err);
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
    } catch (err) {
      console.log('Script already injected or failed:', err);
    }

    // Wait a moment for scripts to initialize
    await new Promise(resolve => setTimeout(resolve, 150));

    // Send message to toggle highlight mode
    chrome.tabs.sendMessage(tabId, { action: 'toggleHighlight' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('Error:', chrome.runtime.lastError.message);

        // Show error badge
        chrome.action.setBadgeText({ text: '✗', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#f44336', tabId: tabId });

        setTimeout(() => {
          chrome.action.setBadgeText({ text: '', tabId: tabId });
        }, 2000);

        return;
      }

      // Show success badge
      isHighlightActive = true;
      chrome.action.setBadgeText({ text: '👆', tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId: tabId });
    });

  } catch (error) {
    console.error('Activation failed:', error);
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveExtractedData') {
    extractedData = request.data;
    isHighlightActive = false;

    // Show data ready badge
    chrome.action.setBadgeText({ text: '✓', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#667eea', tabId: sender.tab.id });

    // Set popup so next click opens it
    chrome.action.setPopup({ popup: 'popup.html' });

    sendResponse({ success: true });
  } else if (request.action === 'getExtractedData') {
    sendResponse({ data: extractedData });
  } else if (request.action === 'clearExtractedData') {
    extractedData = null;
    isHighlightActive = false;

    // Clear badge and popup
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setPopup({ popup: '' });

    sendResponse({ success: true });
  } else if (request.action === 'highlightDeactivated') {
    isHighlightActive = false;
    chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
    sendResponse({ success: true });
  }
  return true;
});

// Clear badge when tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (!extractedData) {
    chrome.action.setBadgeText({ text: '', tabId: activeInfo.tabId });
    chrome.action.setPopup({ popup: '' });
  }
});
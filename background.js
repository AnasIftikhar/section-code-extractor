// Background script for Chrome Extension

let extractedData = null;

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "extractSection",
    title: "Extract Section Code",
    contexts: ["all"]
  });
  
  chrome.contextMenus.create({
    id: "toggleHighlight",
    title: "Toggle Highlight Mode",
    contexts: ["all"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "extractSection") {
    chrome.tabs.sendMessage(tab.id, { action: "extractElement" });
  } else if (info.menuItemId === "toggleHighlight") {
    chrome.tabs.sendMessage(tab.id, { action: "toggleHighlight" });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveExtractedData") {
    extractedData = request.data;
    sendResponse({ success: true });
  } else if (request.action === "getExtractedData") {
    sendResponse({ data: extractedData });
  }
  return true;
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "toggleHighlight" });
});
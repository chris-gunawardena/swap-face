// background.js

// This is a basic background script for a Chrome extension.

// Example: Listener for browser action clicks
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed.');
});

// Example: Listener for messages from other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message);
    sendResponse({ response: 'Message received by background script' });
});

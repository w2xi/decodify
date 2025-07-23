// 弹窗脚本
document.addEventListener('DOMContentLoaded', function() {
  const refreshBtn = document.getElementById('refresh-btn');
  const decodedCountElement = document.getElementById('decoded-count');
  
  // 获取当前标签页
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentTab = tabs[0];
    
    // 获取解码统计信息
    updateStats(currentTab.id);
    
    // 刷新按钮事件
    refreshBtn.addEventListener('click', function() {
      // 重新注入内容脚本
      chrome.scripting.executeScript({
        target: {tabId: currentTab.id},
        files: ['content.js']
      }, function() {
        // 更新统计信息
        setTimeout(() => updateStats(currentTab.id), 1000);
      });
      
      // 按钮反馈
      refreshBtn.textContent = '扫描中...';
      refreshBtn.disabled = true;
      
      setTimeout(() => {
        refreshBtn.textContent = '重新扫描页面';
        refreshBtn.disabled = false;
      }, 2000);
    });
  });
  
  function updateStats(tabId) {
    // 向内容脚本发送消息获取统计信息
    chrome.tabs.sendMessage(tabId, {action: 'getStats'}, function(response) {
      if (chrome.runtime.lastError) {
        // 如果内容脚本未加载，显示0
        decodedCountElement.textContent = '0';
        return;
      }
      
      if (response && response.count !== undefined) {
        decodedCountElement.textContent = response.count;
      } else {
        decodedCountElement.textContent = '0';
      }
    });
  }
});

// 监听来自内容脚本的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'updateStats') {
    const decodedCountElement = document.getElementById('decoded-count');
    if (decodedCountElement) {
      decodedCountElement.textContent = request.count || '0';
    }
  }
}); 
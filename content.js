// Base64解码器内容脚本
class Base64Decoder {
  constructor() {
    this.processedElements = new WeakSet();
    this.minLength = 16; // 最小Base64长度
    this.maxLength = 10000; // 设置最大长度限制
    this.decodedCount = 0; // 解码计数
    this.init();
  }

  init() {
    // 页面加载完成后开始处理
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.scanPage());
    } else {
      this.scanPage();
    }

    // 监听DOM变化，处理动态内容
    this.observeChanges();
    
    // 监听来自弹窗的消息
    this.setupMessageListener();
  }

  // 设置消息监听器
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'getStats') {
        sendResponse({ count: this.decodedCount });
      }
    });
  }

  // Base64解码函数（修复deprecated函数）
  decode(str) {
    try {
      const decoded = window.atob(str);
      // 将二进制字符串转换为UTF-8
      return decodeURIComponent(decoded.split('').map(c => 
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join(''));
    } catch (error) {
      throw new Error('Invalid Base64 string');
    }
  }

  // Base64编码函数（修复deprecated函数）
  encode(str) {
    try {
      // 将UTF-8字符串转换为二进制字符串
      const binary = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, 
        (match, p1) => String.fromCharCode(parseInt(p1, 16))
      );
      return window.btoa(binary);
    } catch (error) {
      throw new Error('Encoding failed');
    }
  }

  // 检查是否为有效的Base64字符串
  isValidBase64(str) {
    // 基本长度检查
    if (!str || str.length < this.minLength || str.length > this.maxLength) {
      return false;
    }

    const regex = /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$/;
    if (!regex.test(str)) {
      return false;
    }

    try {
      // 尝试解码验证
      const decoded = this.decode(str);
      
      // 检查解码长度是否合理
      if (decoded.length < 4) {
        return false;
      }
      
      // 检查解码结果是否包含可打印字符
      return this.isPrintableContent(decoded);
    } catch (error) {
      // Malformed UTF-8 data or invalid Base64
      return false;
    }
  }

  // 检查解码内容是否为可打印内容
  isPrintableContent(str) {
    if (!str) return false;
    
    let printableCount = 0;
    let controlCount = 0;
    
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      
      if (code >= 32 && code <= 126) {
        // 可打印ASCII字符
        printableCount++;
      } else if (code >= 128) {
        // Unicode字符
        printableCount++;
      } else if (code === 9 || code === 10 || code === 13) {
        // 常见控制字符：制表符、换行符、回车符
        printableCount++;
      } else {
        // 其他控制字符
        controlCount++;
      }
    }
    
    // 至少85%的字符是可打印的
    const printableRatio = printableCount / str.length;
    if (printableRatio < 0.85) {
      return false;
    }
    
    // 控制字符不能超过15%
    const controlRatio = controlCount / str.length;
    if (controlRatio > 0.15) {
      return false;
    }
    
    // 检查是否包含常见的文本内容指示符
    return this.looksLikeTextContent(str);
  }

  // 检查是否像文本内容
  looksLikeTextContent(str) {
    // 如果包含常见单词或字符，更可能是文本
    const commonPatterns = [
      /[a-zA-Z]{3,}/, // 包含3个以上连续字母
      /\s/, // 包含空格
      /[.,:;!?]/, // 包含标点符号
      /[\u4e00-\u9fff]/, // 包含中文字符
      /{|}|\[|\]/, // 包含JSON结构字符
      /<|>/, // 包含HTML标签字符
      /http|www|\.com|\.org/, // 包含URL
    ];
    
    return commonPatterns.some(pattern => pattern.test(str));
  }

  // 处理单个文本节点
  processTextNode(textNode) {
    if (this.processedElements.has(textNode)) return;
    
    const text = textNode.textContent.trim();
    if (!text) return;

    // 检查是否已经有解码容器在这个节点附近
    if (this.hasDecodedContainer(textNode)) return;

    // 查找可能的Base64字符串 - 更严格的分词
    const candidates = this.extractBase64Candidates(text);
    let hasBase64 = false;

    candidates.forEach(candidate => {
      if (this.isValidBase64(candidate)) {
        hasBase64 = true;
        this.addDecodeButton(textNode, candidate);
        this.decodedCount++;
      }
    });

    if (hasBase64) {
      this.processedElements.add(textNode);
    }
  }

  // 检查文本节点附近是否已经有解码容器
  hasDecodedContainer(textNode) {
    const parent = textNode.parentElement;
    if (!parent) return false;
    
    // 检查父元素中是否已经有解码容器
    const existingContainers = parent.querySelectorAll('.__base64-decoder-container__');
    return existingContainers.length > 0;
  }

  // 提取Base64候选字符串
  extractBase64Candidates(text) {
    const candidates = [];
    
    // 按空格和常见分隔符分割
    const words = text.split(/[\s,;(){}[\]"'<>]/);
    
    for (let word of words) {
      // 移除前后的标点符号，但保留Base64字符
      const cleaned = word.replace(/^[^\w+/]+|[^\w+/=]+$/g, '');
      
      if (cleaned.length >= this.minLength) {
        candidates.push(cleaned);
      }
    }
    
    return candidates;
  }

  // 添加解码按钮和显示区域
  addDecodeButton(textNode, base64String) {
    const parent = textNode.parentElement;
    if (!parent) return;

    // 防止重复添加 - 检查是否已经存在相同的解码结果
    const existingContainers = parent.querySelectorAll('.__base64-decoder-container__');
    for (let container of existingContainers) {
      if (container.getAttribute('data-original') === base64String) {
        return; // 已经存在相同的解码结果
      }
    }

    try {
      const decoded = this.decode(base64String);
      
      // 创建解码显示容器
      const container = document.createElement('span');
      container.className = '__base64-decoder-container__';
      container.textContent = decoded;
      container.title = '🔓 Base64解码结果 - 点击复制';
      container.setAttribute('data-original', base64String); // 存储原始Base64字符串
      
      // 添加点击复制功能
      container.addEventListener('click', (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        this.copyToClipboard(decoded);
        this.showCopyFeedback(container);
      });

      // 插入到原文本后面
      parent.insertBefore(container, textNode.nextSibling);
      
    } catch (e) {
      console.error('Base64解码失败:', e);
    }
  }

  // 复制到剪贴板
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  // 显示复制成功反馈
  showCopyFeedback(element) {
    // 防止重复触发反馈
    if (element.classList.contains('copying')) return;
    
    element.classList.add('copying');
    const originalText = element.textContent;
    element.textContent = 'Copied!';
    
    setTimeout(() => {
      element.textContent = originalText;
      element.classList.remove('copying');
    }, 1500);
  }

  // 监听DOM变化
  observeChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // 检查是否有新的文本节点添加
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE || 
                (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim())) {
              shouldScan = true;
            }
          });
        }
      });
      
      if (shouldScan) {
        // 延迟执行，避免频繁扫描
        clearTimeout(this.scanTimeout);
        this.scanTimeout = setTimeout(() => this.scanPage(), 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 扫描页面中的文本节点
  scanPage() {
    // 重置计数器
    this.decodedCount = 0;
    
    // 清理已处理的元素集合，重新开始
    this.processedElements = new WeakSet();
    
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 跳过script、style等标签
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'noscript', 'iframe', 'input', 'textarea', 'pre'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    textNodes.forEach(textNode => this.processTextNode(textNode));
    
    // 通知弹窗更新统计信息
    this.notifyStatsUpdate();
  }

  // 通知统计信息更新
  notifyStatsUpdate() {
    try {
      chrome.runtime.sendMessage({ 
        action: 'updateStats', 
        count: this.decodedCount 
      });
    } catch (e) {
      // 忽略错误，可能是弹窗未打开
    }
  }
}

// 初始化解码器
new Base64Decoder(); 
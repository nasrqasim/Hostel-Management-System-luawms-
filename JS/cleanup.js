(function () {
  function sanitizeTextNode(textNode) {
    const original = textNode.nodeValue || '';
    if (!/n\)\!/i.test(original)) return false;
    const cleaned = original.replace(/n\)\!/gi, '');
    if (cleaned.trim() === '') {
      const parent = textNode.parentNode;
      if (parent) parent.removeChild(textNode);
    } else if (cleaned !== original) {
      textNode.nodeValue = cleaned;
    }
    return true;
  }

  function removeStrayNodes(root) {
    const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    for (let currentNode; (currentNode = walker.nextNode()); ) sanitizeTextNode(currentNode);
  }

  const start = () => removeStrayNodes(document.body);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  new MutationObserver(mutations => mutations.forEach(mutation => {
    if (mutation.type === 'characterData' && mutation.target && mutation.target.nodeType === 3) {
      sanitizeTextNode(mutation.target);
    }
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 3) sanitizeTextNode(node);
      else if (node.nodeType === 1) removeStrayNodes(node);
    });
  })).observe(document.body, { childList: true, subtree: true, characterData: true, characterDataOldValue: false });
})();



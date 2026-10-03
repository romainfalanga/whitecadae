// Mobile uses the document scroll; desktop keeps its bounded conversation.
export function chatViewport(node, browser = window) {
  const page = browser.getComputedStyle(node).overflowY === 'visible';
  return {
    page,
    atEnd() {
      if (!page) return node.scrollHeight - node.scrollTop - node.clientHeight < 70;
      const viewport = browser.visualViewport;
      const bottom = viewport ? viewport.height + viewport.offsetTop : browser.innerHeight;
      const player = parseFloat(browser.getComputedStyle(node.ownerDocument.documentElement).getPropertyValue('--player-height')) || 0;
      return node.getBoundingClientRect().bottom <= bottom - player + 40;
    },
    toEnd() {
      if (page) node.closest('.ace-chat').querySelector('.ace-composer').scrollIntoView({block:'end',behavior:'instant'});
      else node.scrollTop = node.scrollHeight;
    },
    preserve(update) {
      const top = page ? 0 : node.getBoundingClientRect().top;
      const anchor = Array.from(node.querySelectorAll('[data-message]')).find(item => item.getBoundingClientRect().bottom > top);
      const before = anchor?.getBoundingClientRect().top;
      const id = anchor?.dataset.message;
      update();
      const next = id && Array.from(node.querySelectorAll('[data-message]')).find(item => item.dataset.message === id);
      if (!next) return;
      const delta = next.getBoundingClientRect().top - before;
      if (!delta) return;
      if (page) browser.scrollBy({top:delta,behavior:'instant'});
      else node.scrollTop += delta;
    },
  };
}

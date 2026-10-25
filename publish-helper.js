(function () {
  'use strict';
  const article = document.getElementById('wechat-article');
  const toolbar = document.querySelector('[data-publish-toolbar]');
  if (!article || !toolbar) return;

  const richButton = toolbar.querySelector('[data-copy-rich]');
  const textButton = toolbar.querySelector('[data-copy-text]');
  const titleButton = toolbar.querySelector('[data-copy-title]');
  const status = toolbar.querySelector('[data-copy-status]');
  const images = Array.from(article.querySelectorAll('img'));
  let prepared = null;

  function report(message, error) {
    status.textContent = message;
    status.style.color = error ? '#a71933' : '#40586c';
  }

  function plainText() {
    return article.innerText.replace(/\n{3,}/g, '\n\n').trim();
  }

  function imageAsDataUrl(src) {
    const url = new URL(src, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) {
      return Promise.reject(new Error('请通过“打开预览.sh”打开本地网页，才能复制图片。'));
    }
    return fetch(url.href).then(function (response) {
      if (!response.ok) throw new Error('图片读取失败：' + url.pathname.split('/').pop());
      return response.blob();
    }).then(async function (blob) {
      const bitmap = await createImageBitmap(blob);
      const filename = url.pathname.split('/').pop().toLowerCase();
      const detailed = /paper-|patent-|copyright-/.test(filename);
      const longEdge = detailed ? 2800 : 1400;
      const ratio = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
      if (ratio < 1 || blob.size > 900000) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * ratio);
        canvas.height = Math.round(bitmap.height * ratio);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const jpeg = /^image\/jpeg$/i.test(blob.type) || !detailed;
        const compressed = await new Promise(function (resolve, reject) {
          canvas.toBlob(function (result) { result ? resolve(result) : reject(new Error('图片压缩失败')); }, jpeg ? 'image/jpeg' : 'image/png', 0.86);
        });
        if (compressed.size < blob.size) blob = compressed;
      }
      bitmap.close();
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('图片编码失败')); };
        reader.readAsDataURL(blob);
      });
    });
  }

  function publishMarkup(dataUrls) {
    const copy = article.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[data-carousel]').forEach(function (group) {
      const twoColumns = group.dataset.carousel === 'awards' || group.dataset.carousel === 'ip';
      group.style.cssText = 'width:100%;overflow:visible;white-space:normal;margin:0 0 18px;padding:0;font-size:0;';
      Array.from(group.children).forEach(function (item, index) {
        item.style.cssText = twoColumns
          ? 'display:inline-block;box-sizing:border-box;vertical-align:top;width:48%;max-width:48%;margin:0 0 14px;white-space:normal;font-size:14px;'
          : 'display:block;box-sizing:border-box;width:100%;max-width:100%;margin:0 0 16px;white-space:normal;font-size:14px;';
        if (twoColumns && index % 2 === 0) item.style.marginRight = '4%';
      });
    });
    copy.querySelectorAll('img').forEach(function (img, index) {
      img.src = dataUrls[index];
      img.style.width = '100%';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
      img.style.background = 'transparent';
      img.removeAttribute('loading');
    });
    copy.querySelectorAll('[data-section],[data-paper-links],[data-faculty],[data-student-group],[data-carousel]').forEach(function (node) {
      Array.from(node.attributes).forEach(function (attribute) {
        if (attribute.name.startsWith('data-')) node.removeAttribute(attribute.name);
      });
    });
    return copy.outerHTML;
  }

  async function prepare() {
    if (location.protocol === 'file:') {
      report('请双击“打开预览.sh”，从本机网页打开后再复制图文。', true);
      return null;
    }
    richButton.disabled = true;
    report('正在准备 ' + images.length + ' 张图片，稍候即可一键复制…');
    try {
      const dataUrls = [];
      for (let index = 0; index < images.length; index++) {
        dataUrls.push(await imageAsDataUrl(images[index].getAttribute('src')));
      }
      prepared = publishMarkup(dataUrls);
      richButton.disabled = false;
      report('图文已准备好（' + images.length + ' 张图）。');
      return prepared;
    } catch (error) {
      report(error.message + '；仍可复制纯文字。', true);
      return null;
    }
  }

  function legacyCopy(html, text) {
    let copied = false;
    const receiver = function (event) {
      event.clipboardData.setData('text/html', html);
      event.clipboardData.setData('text/plain', text);
      event.preventDefault();
      copied = true;
    };
    document.addEventListener('copy', receiver, {once: true});
    try { document.execCommand('copy'); } finally { document.removeEventListener('copy', receiver); }
    return copied;
  }

  richButton.addEventListener('click', async function () {
    if (!prepared) return;
    const text = plainText();
    try {
      if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([prepared], {type: 'text/html'}),
          'text/plain': new Blob([text], {type: 'text/plain'})
        })]);
      } else if (!legacyCopy(prepared, text)) {
        throw new Error('浏览器未允许复制排版内容');
      }
      report('已复制完整排版（含 ' + images.length + ' 张图）。粘贴后请检查图片、链接和手机预览；复制不等于已发布。');
    } catch (error) {
      report('复制未完成：' + error.message + '。可改用浏览器手动选中正文复制。', true);
    }
  });

  async function copyText(value, label) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(value);
      else if (!legacyCopy('<p>' + value.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>', value)) throw new Error('浏览器未允许复制');
      report(label + '已复制。');
    } catch (error) { report(label + '复制失败：' + error.message, true); }
  }
  textButton.addEventListener('click', function () { copyText(plainText(), '纯文字'); });
  titleButton.addEventListener('click', function () { copyText(document.title, '标题'); });
  prepare();
})();

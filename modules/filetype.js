(function () {
  const NI = (window.NI = window.NI || {});
  // 支持的扩展名已知 MIME 类型
  const MIME = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    svg: "image/svg+xml",
    avif: "image/avif",
    ico: "image/x-icon",
    tif: "image/tiff",
    tiff: "image/tiff",
  };
  const isJPEG = (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
  const isPNG = (h) =>
    h.length >= 8 &&
    h[0] === 0x89 &&
    h[1] === 0x50 &&
    h[2] === 0x4e &&
    h[3] === 0x47 &&
    h[4] === 0x0d &&
    h[5] === 0x0a &&
    h[6] === 0x1a &&
    h[7] === 0x0a;
  const isGIF = (h) =>
    h.length >= 6 &&
    h[0] === 0x47 &&
    h[1] === 0x49 &&
    h[2] === 0x46 &&
    h[3] === 0x38 &&
    (h[4] === 0x37 || h[4] === 0x39) &&
    h[5] === 0x61;
  const isBMP = (h) => h[0] === 0x42 && h[1] === 0x4d;
  const isWEBP = (h) =>
    h.length >= 12 &&
    h[0] === 0x52 &&
    h[1] === 0x49 &&
    h[2] === 0x46 &&
    h[3] === 0x46 &&
    h[8] === 0x57 &&
    h[9] === 0x45 &&
    h[10] === 0x42 &&
    h[11] === 0x50;
  const isICO = (h) => h.length >= 4 && h[0] === 0x00 && h[1] === 0x00 && (h[2] === 0x01 || h[2] === 0x02) && h[3] === 0x00;
  const isTIFF = (h) => (h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a && h[3] === 0x00) || (h[0] === 0x4d && h[1] === 0x4d && h[2] === 0x00 && h[3] === 0x2a);
  const isAVIF = (h) => {
    if (h.length < 12) return false;
    const b4 = String.fromCharCode(h[4], h[5], h[6], h[7]);
    const brand = String.fromCharCode(h[8], h[9], h[10], h[11]);
    return b4 === 'ftyp' && (brand === 'avif' || brand === 'avis');
  };

  // 解码一小段为UTF-8以检测SVG文本头部
  function isSVGBuffer(buf) {
    try {
      const dec = new TextDecoder('utf-8');
      let s = dec.decode(buf);
      s = s.replace(/^\uFEFF/, '').trimStart().slice(0, 128).toLowerCase();
      return s.startsWith('<svg') || (s.startsWith('<?xml') && s.includes('<svg'));
    } catch { return false; }
  }

  NI.filetype = {
    MIME,
    async detect(file) {
      const ab = await file.slice(0, 512).arrayBuffer();
      const h = new Uint8Array(ab);
      if (isJPEG(h)) return { ext: "jpg", mime: MIME.jpg };
      if (isPNG(h)) return { ext: "png", mime: MIME.png };
      if (isGIF(h)) return { ext: "gif", mime: MIME.gif };
      if (isBMP(h)) return { ext: "bmp", mime: MIME.bmp };
      if (isWEBP(h)) return { ext: "webp", mime: MIME.webp };
      if (isICO(h)) return { ext: "ico", mime: MIME.ico };
      if (isTIFF(h)) return { ext: "tiff", mime: MIME.tiff };
      if (isAVIF(h)) return { ext: "avif", mime: MIME.avif };
      if (isSVGBuffer(ab)) return { ext: "svg", mime: MIME.svg };
      return null;
    },
    normalizeName(name, ext) {
      const base = name.replace(/\.[^.]+$/, "");
      return `${base}.${ext}`;
    },
  };
})();

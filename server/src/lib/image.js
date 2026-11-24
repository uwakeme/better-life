const MAX_DIMENSION = 4096;
const MAX_PIXELS = 16000000;

let crcTable = null;

function crc32 (buffer) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validDimensions (width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= MAX_DIMENSION && height <= MAX_DIMENSION && width * height <= MAX_PIXELS;
}

function validPng (buf) {
  if (buf.length < 45 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return false;
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    const end = offset + 12 + length;
    if (end > buf.length) return false;
    if (crc32(buf.subarray(offset + 4, end - 4)) !== buf.readUInt32BE(end - 4)) return false;
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) return false;
      if (!validDimensions(buf.readUInt32BE(offset + 8), buf.readUInt32BE(offset + 12))) return false;
      sawHeader = true;
    }
    if (type === 'IDAT') sawData = true;
    offset = end;
    if (type === 'IEND') {
      if (length !== 0) return false;
      sawEnd = true;
      break;
    }
  }
  return sawHeader && sawData && sawEnd && offset === buf.length;
}

function validJpeg (buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return false;
  let offset = 2;
  let dimensions = false;
  let scan = false;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) return false;
    while (offset < buf.length && buf[offset] === 0xff) offset++;
    if (offset >= buf.length) return false;
    const marker = buf[offset++];
    if (marker === 0xd9) return dimensions && scan && offset === buf.length;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buf.length) return false;
    const length = buf.readUInt16BE(offset);
    if (length < 2 || offset + length > buf.length) return false;
    const start = offset + 2;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (length < 8) return false;
      dimensions = validDimensions(buf.readUInt16BE(start + 5), buf.readUInt16BE(start + 3));
    }
    offset += length;
    if (marker === 0xda) {
      if (!dimensions) return false;
      scan = true;
      const end = buf.subarray(offset).indexOf(Buffer.from([0xff, 0xd9]));
      return end >= 0 && offset + end + 2 === buf.length;
    }
  }
  return false;
}

function skipSubBlocks (buf, offset) {
  while (offset < buf.length) {
    const size = buf[offset++];
    if (!size) return offset;
    offset += size;
    if (offset > buf.length) return -1;
  }
  return -1;
}

function validGif (buf) {
  if (buf.length < 14 || !/^GIF8[79]a$/.test(buf.subarray(0, 6).toString('ascii'))) return false;
  if (!validDimensions(buf.readUInt16LE(6), buf.readUInt16LE(8))) return false;
  let offset = 13;
  if (buf[10] & 0x80) offset += 3 * (1 << ((buf[10] & 7) + 1));
  let sawImage = false;
  while (offset < buf.length) {
    const block = buf[offset++];
    if (block === 0x3b) return sawImage && offset === buf.length;
    if (block === 0x21) {
      if (offset >= buf.length) return false;
      offset = skipSubBlocks(buf, offset + 1);
      if (offset < 0) return false;
    } else if (block === 0x2c) {
      if (offset + 9 > buf.length) return false;
      if (!validDimensions(buf.readUInt16LE(offset + 4), buf.readUInt16LE(offset + 6))) return false;
      const packed = buf[offset + 8];
      offset += 9;
      if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1));
      if (offset >= buf.length) return false;
      offset = skipSubBlocks(buf, offset + 1);
      if (offset < 0) return false;
      sawImage = true;
    } else {
      return false;
    }
  }
  return false;
}

function validWebp (buf) {
  if (buf.length < 20 || buf.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      buf.subarray(8, 12).toString('ascii') !== 'WEBP' || buf.readUInt32LE(4) !== buf.length - 8) return false;
  let offset = 12;
  let image = false;
  while (offset + 8 <= buf.length) {
    const type = buf.subarray(offset, offset + 4).toString('ascii');
    const length = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buf.length) return false;
    if (type === 'VP8X') {
      if (length < 10) return false;
      const width = 1 + buf.readUIntLE(start + 4, 3);
      const height = 1 + buf.readUIntLE(start + 7, 3);
      if (!validDimensions(width, height)) return false;
      image = true;
    } else if (type === 'VP8 ') {
      if (length < 10 || buf.subarray(start + 3, start + 6).toString('hex') !== '9d012a') return false;
      if (!validDimensions(buf.readUInt16LE(start + 6) & 0x3fff, buf.readUInt16LE(start + 8) & 0x3fff)) return false;
      image = true;
    } else if (type === 'VP8L') {
      if (length < 5 || buf[start] !== 0x2f) return false;
      const bits = buf.readUInt32LE(start + 1);
      if (!validDimensions(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff))) return false;
      image = true;
    }
    offset = end + (length & 1);
  }
  return image && offset === buf.length;
}

function decodeBase64Image (value, maxBytes) {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw Object.assign(new Error('图片编码不正确'), { code: 'VALIDATION' });
  }
  const buffer = Buffer.from(value, 'base64');
  if (buffer.toString('base64') !== value) {
    throw Object.assign(new Error('图片编码不正确'), { code: 'VALIDATION' });
  }
  if (!buffer.length) throw Object.assign(new Error('文件内容为空'), { code: 'VALIDATION' });
  if (buffer.length > maxBytes) throw Object.assign(new Error('图片太大了，请压缩后再试'), { code: 'VALIDATION' });
  const valid = validPng(buffer) || validJpeg(buffer) || validGif(buffer) || validWebp(buffer);
  if (!valid) throw Object.assign(new Error('只能上传完整有效的图片文件'), { code: 'VALIDATION' });
  return buffer;
}

module.exports = { decodeBase64Image };

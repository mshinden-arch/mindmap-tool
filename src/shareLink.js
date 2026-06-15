import { PALETTE_OPTIONS } from "./constants";
import { normalize } from "./mindmapUtils";

export const SHARE_VERSION = 1;
export const SHARE_BASE_URL = String(import.meta.env.VITE_SHARE_BASE_URL || "").trim();

const SHARE_HASH_PREFIX = "#share=";
const MAX_SHARE_URL_LENGTH = 120_000;
const MAX_ENCODED_LENGTH = 100_000;
const MAX_DECODED_BYTES = 2_000_000;
const MAX_NODE_COUNT = 2_000;
const MAX_NODE_TEXT_LENGTH = 10_000;

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("共有リンクのデータ形式が正しくありません。");
  }

  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function compress(bytes) {
  if (typeof CompressionStream === "undefined") return null;

  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function decompress(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("このブラウザでは圧縮された共有リンクを開けません。");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalLength += value.length;
    if (totalLength > MAX_DECODED_BYTES) {
      await reader.cancel();
      throw new Error("共有リンクのデータが大きすぎます。");
    }
    chunks.push(value);
  }

  const output = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
}

function validateMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) {
    throw new Error("共有リンクにマインドマップが含まれていません。");
  }
  if (typeof rawMap.rootId !== "string" || !rawMap.rootId) {
    throw new Error("共有リンクのルートノードが正しくありません。");
  }
  if (!rawMap.nodes || typeof rawMap.nodes !== "object" || Array.isArray(rawMap.nodes)) {
    throw new Error("共有リンクのノード情報が正しくありません。");
  }

  const nodeEntries = Object.entries(rawMap.nodes);
  const nodes = nodeEntries.map(([, node]) => node);
  if (!nodes.length || nodes.length > MAX_NODE_COUNT) {
    throw new Error("共有リンクのノード数が上限を超えています。");
  }

  const nodeIds = new Set();
  nodeEntries.forEach(([nodeKey, node]) => {
    if (!node || typeof node !== "object" || typeof node.id !== "string" || !node.id) {
      throw new Error("共有リンクに不正なノードが含まれています。");
    }
    if (
      nodeKey !== node.id ||
      node.id.length > 200 ||
      Object.hasOwn(Object.prototype, node.id)
    ) {
      throw new Error("共有リンクに不正なノードIDが含まれています。");
    }
    if (nodeIds.has(node.id)) {
      throw new Error("共有リンクに重複したノードがあります。");
    }
    if (
      node.parentId !== null &&
      (typeof node.parentId !== "string" || !node.parentId || node.parentId.length > 200)
    ) {
      throw new Error("共有リンクの親ノード情報が正しくありません。");
    }
    if (String(node.text || "").length > MAX_NODE_TEXT_LENGTH) {
      throw new Error("共有リンクに長すぎるテキストが含まれています。");
    }
    nodeIds.add(node.id);
  });

  if (!nodeIds.has(rawMap.rootId)) {
    throw new Error("共有リンクのルートノードが見つかりません。");
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  if (nodeById.get(rawMap.rootId).parentId !== null) {
    throw new Error("共有リンクのルート構造が正しくありません。");
  }

  nodes.forEach((node) => {
    if (node.id !== rawMap.rootId && !nodeById.has(node.parentId)) {
      throw new Error("共有リンクに参照先のないノードがあります。");
    }

    const visited = new Set();
    let cursor = node;
    while (cursor.parentId !== null) {
      if (visited.has(cursor.id)) {
        throw new Error("共有リンクのノード構造に循環があります。");
      }
      visited.add(cursor.id);
      cursor = nodeById.get(cursor.parentId);
      if (!cursor) {
        throw new Error("共有リンクに参照先のないノードがあります。");
      }
    }
    if (cursor.id !== rawMap.rootId) {
      throw new Error("共有リンクにルートへ接続されていないノードがあります。");
    }
  });

  return normalize(rawMap);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("共有リンクの内容が正しくありません。");
  }
  if (payload.shareVersion !== SHARE_VERSION) {
    throw new Error("この共有リンクのバージョンには対応していません。");
  }

  return {
    shareVersion: payload.shareVersion,
    map: validateMap(payload.map),
    paletteId: PALETTE_OPTIONS.includes(payload.paletteId) ? payload.paletteId : "default",
  };
}

function getShareBaseUrl() {
  if (!SHARE_BASE_URL) {
    throw new Error("共有URLの設定がされていません。");
  }

  let url;
  try {
    url = new URL(SHARE_BASE_URL);
  } catch (error) {
    throw new Error("共有URLの設定が正しくありません。", { cause: error });
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("共有URLの設定が正しくありません。");
  }

  return SHARE_BASE_URL.replace(/\/+$/u, "");
}

export function hasSharePayload(hash = window.location.hash) {
  return hash.startsWith(SHARE_HASH_PREFIX);
}

export function cloneSharedMap(map) {
  return {
    ...map,
    nodes: Object.fromEntries(Object.entries(map.nodes).map(([id, node]) => [id, { ...node }])),
  };
}

export async function createShareUrl(map, paletteId) {
  const shareBaseUrl = getShareBaseUrl();
  const payload = {
    shareVersion: SHARE_VERSION,
    map,
    paletteId: PALETTE_OPTIONS.includes(paletteId) ? paletteId : "default",
  };
  const rawBytes = new TextEncoder().encode(JSON.stringify(payload));

  if (rawBytes.length > MAX_DECODED_BYTES) {
    throw new Error("マインドマップが大きすぎるため、共有リンクを作成できません。");
  }

  const compressedBytes = await compress(rawBytes);
  const useCompression = compressedBytes && compressedBytes.length < rawBytes.length;
  const format = useCompression ? "g" : "r";
  const encoded = bytesToBase64Url(useCompression ? compressedBytes : rawBytes);
  if (encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error("共有リンクが長すぎます。ノードや文章を減らしてから再度お試しください。");
  }
  const url = `${shareBaseUrl}${SHARE_HASH_PREFIX}v${SHARE_VERSION}.${format}.${encoded}`;

  if (url.length > MAX_SHARE_URL_LENGTH) {
    throw new Error("共有リンクが長すぎます。ノードや文章を減らしてから再度お試しください。");
  }

  return url;
}

export async function readShareUrl(url = window.location.href) {
  const hash = new URL(url).hash;
  if (!hasSharePayload(hash)) {
    throw new Error("共有リンクのデータが見つかりません。");
  }

  const token = hash.slice(SHARE_HASH_PREFIX.length);
  const match = /^v(\d+)\.([gr])\.([A-Za-z0-9_-]+)$/u.exec(token);
  if (!match) {
    throw new Error("共有リンクの形式が正しくありません。");
  }

  const version = Number(match[1]);
  if (version !== SHARE_VERSION) {
    throw new Error("この共有リンクのバージョンには対応していません。");
  }
  if (match[3].length > MAX_ENCODED_LENGTH) {
    throw new Error("共有リンクのデータが大きすぎます。");
  }

  const encodedBytes = base64UrlToBytes(match[3]);
  const rawBytes = match[2] === "g" ? await decompress(encodedBytes) : encodedBytes;
  if (rawBytes.length > MAX_DECODED_BYTES) {
    throw new Error("共有リンクのデータが大きすぎます。");
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBytes));
  } catch (error) {
    throw new Error("共有リンクのデータを読み込めませんでした。", { cause: error });
  }

  return validatePayload(payload);
}

export async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy copy path.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  let copied;
  try {
    copied = document.execCommand("copy");
  } catch (error) {
    throw new Error("共有リンクをクリップボードへコピーできませんでした。", { cause: error });
  } finally {
    textarea.remove();
  }

  if (!copied) {
    throw new Error("共有リンクをクリップボードへコピーできませんでした。");
  }
}

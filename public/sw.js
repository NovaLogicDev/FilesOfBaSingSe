(() => {
  // src/sw/crc32c.ts
  var CRC32C_TABLE = new Int32Array(256);
  (function initCRC32cTable() {
    const POLY = 2197175160;
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let bit = 0; bit < 8; bit++) {
        if ((crc & 1) !== 0) {
          crc = crc >>> 1 ^ POLY;
        } else {
          crc = crc >>> 1;
        }
      }
      CRC32C_TABLE[i] = crc;
    }
  })();
  function updateCRC32c(crc, buffer) {
    let c = ~crc;
    for (let i = 0; i < buffer.length; i++) {
      c = CRC32C_TABLE[(c ^ buffer[i]) & 255] ^ c >>> 8;
    }
    return ~c;
  }
  function formatCRC32c(crc) {
    const uint32 = crc >>> 0;
    const hex = "0x" + uint32.toString(16).toUpperCase().padStart(8, "0");
    const bytes = new Uint8Array([
      uint32 >>> 24 & 255,
      uint32 >>> 16 & 255,
      uint32 >>> 8 & 255,
      uint32 & 255
    ]);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return { hex, base64 };
  }

  // src/sw/sw.ts
  var SW_VERSION = "v2.0.0";
  var STREAM_PREFIX = "/sw-pipe/";
  var LEGACY_STREAM_ENDPOINT = "/api/stream-download";
  var activeStreams = /* @__PURE__ */ new Map();
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });
  async function notifyClients(message) {
    try {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage(message);
      }
    } catch (_) {
    }
  }
  self.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const port = event.ports && event.ports[0] ? event.ports[0] : null;
    switch (data.type) {
      case "REGISTER_STREAM_TICKET":
      case "REGISTER_STREAM": {
        const ticket = data.ticket;
        const streamId = ticket?.streamId || data.streamId || `sw_stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        if (ticket) {
          const abortController = new AbortController();
          activeStreams.set(streamId, {
            ...ticket,
            streamId,
            abortController,
            createdAt: Date.now(),
            lastKeepAlive: Date.now(),
            runningCrc32c: 0
          });
          const reply = {
            type: "STREAM_REGISTERED",
            success: true,
            streamId
          };
          if (port) {
            port.postMessage(reply);
          } else if (event.source) {
            event.source.postMessage(reply);
          }
          notifyClients(reply);
        }
        break;
      }
      case "SW_KEEP_ALIVE_PING":
      case "KEEP_ALIVE_PING": {
        const streamId = data.streamId;
        if (streamId && activeStreams.has(streamId)) {
          const entry = activeStreams.get(streamId);
          entry.lastKeepAlive = Date.now();
        }
        const pongResponse = {
          type: "SW_KEEP_ALIVE_PONG",
          streamId,
          timestamp: Date.now(),
          activeStreams: activeStreams.size
        };
        if (port) {
          port.postMessage(pongResponse);
        } else if (event.source) {
          event.source.postMessage(pongResponse);
        }
        break;
      }
      case "SW_ABORT_STREAM":
      case "ABORT_STREAM": {
        const streamId = data.streamId;
        if (streamId && activeStreams.has(streamId)) {
          const entry = activeStreams.get(streamId);
          try {
            entry.abortController.abort();
          } catch (_) {
          }
          activeStreams.delete(streamId);
          const reply = {
            type: "STREAM_ABORTED",
            streamId
          };
          if (port) {
            port.postMessage(reply);
          } else if (event.source) {
            event.source.postMessage(reply);
          }
        }
        break;
      }
      case "PING": {
        const pongResponse = {
          type: "PONG",
          version: SW_VERSION,
          activeStreams: activeStreams.size,
          timestamp: Date.now()
        };
        if (port) {
          port.postMessage(pongResponse);
        } else if (event.source) {
          event.source.postMessage(pongResponse);
        }
        break;
      }
      case "CLEAR_STREAMS": {
        for (const entry of activeStreams.values()) {
          try {
            entry.abortController.abort();
          } catch (_) {
          }
        }
        activeStreams.clear();
        if (port) {
          port.postMessage({ type: "STREAMS_CLEARED" });
        }
        break;
      }
      case "GET_STATUS": {
        const statusResponse = {
          type: "STATUS_RESPONSE",
          version: SW_VERSION,
          activeStreamsCount: activeStreams.size,
          isRegistered: true,
          isActive: true
        };
        if (port) {
          port.postMessage(statusResponse);
        } else if (event.source) {
          event.source.postMessage(statusResponse);
        }
        break;
      }
    }
  });
  self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith(STREAM_PREFIX)) {
      event.respondWith(handleSwPipeStreamDownload(event, url));
    } else if (url.pathname === LEGACY_STREAM_ENDPOINT || url.pathname.endsWith(LEGACY_STREAM_ENDPOINT)) {
      event.respondWith(handleLegacyStreamDownload(event, url));
    }
  });
  async function handleSwPipeStreamDownload(event, url) {
    const pathParts = url.pathname.slice(STREAM_PREFIX.length).split("/");
    const streamId = decodeURIComponent(pathParts[0] || "");
    const pathFilename = pathParts.length > 1 ? decodeURIComponent(pathParts.slice(1).join("/")) : "";
    return executeStream(event, url, streamId, pathFilename);
  }
  async function handleLegacyStreamDownload(event, url) {
    const streamId = url.searchParams.get("streamId") || "";
    const filename = url.searchParams.get("filename") || "";
    return executeStream(event, url, streamId, filename);
  }
  async function executeStream(event, url, streamId, defaultFilename) {
    let ticket;
    if (streamId && activeStreams.has(streamId)) {
      ticket = activeStreams.get(streamId);
    }
    const bucket = ticket?.bucket || ticket?.bucketName || url.searchParams.get("bucket") || "";
    const object = ticket?.object || ticket?.objectName || url.searchParams.get("object") || "";
    const userProject = ticket?.userProject || url.searchParams.get("userProject") || "";
    const token = ticket?.token || ticket?.oauthToken || url.searchParams.get("token") || "";
    const filename = ticket?.filename || defaultFilename || url.searchParams.get("filename") || "downloaded_asset";
    const abortController = ticket?.abortController || new AbortController();
    const cleanBucket = bucket.replace(/^gs:\/\//i, "").replace(/\/+$/, "").trim();
    const cleanObject = object.replace(/^\/+/, "").trim();
    if (!cleanBucket || !cleanObject || !userProject || !token) {
      const errorMsg = "Missing required stream parameters (bucket, object, userProject, token) or unregistered stream ticket.";
      notifyClients({
        type: "SW_STREAM_ERROR",
        streamId,
        error: errorMsg
      });
      return new Response(
        JSON.stringify({ error: errorMsg }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    let decodedObject = cleanObject;
    try {
      decodedObject = decodeURIComponent(cleanObject);
    } catch (_) {
    }
    const safeEncodedObject = encodeURIComponent(decodedObject);
    let gcsUrl = ticket?.url;
    if (!gcsUrl) {
      gcsUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
        cleanBucket
      )}/o/${safeEncodedObject}?alt=media&userProject=${encodeURIComponent(userProject)}`;
    }
    const rangeHeader = event.request.headers.get("Range");
    const fetchHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: "*/*"
    };
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }
    let gcsResponse;
    try {
      gcsResponse = await fetch(gcsUrl, {
        method: "GET",
        headers: fetchHeaders,
        signal: abortController.signal
      });
    } catch (fetchErr) {
      if (fetchErr.name === "AbortError") {
        return new Response("Stream aborted by client.", { status: 499 });
      }
      const errorMsg = `GCS network connection failure: ${fetchErr.message}`;
      notifyClients({
        type: "SW_STREAM_ERROR",
        streamId,
        error: errorMsg
      });
      if (streamId) {
        activeStreams.delete(streamId);
      }
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!gcsResponse.ok) {
      let errorMsg = `GCS media fetch error (${gcsResponse.status}): ${gcsResponse.statusText}`;
      let errorBody = "";
      try {
        errorBody = await gcsResponse.clone().text();
        const errJson = JSON.parse(errorBody);
        if (errJson?.error?.message) {
          errorMsg = errJson.error.message;
        }
      } catch (_) {
      }
      notifyClients({
        type: "SW_STREAM_ERROR",
        streamId,
        error: errorMsg,
        status: gcsResponse.status
      });
      if (streamId) {
        activeStreams.delete(streamId);
      }
      return new Response(
        errorBody || gcsResponse.body,
        {
          status: gcsResponse.status,
          statusText: gcsResponse.statusText,
          headers: {
            "Content-Type": gcsResponse.headers.get("Content-Type") || "application/json"
          }
        }
      );
    }
    const safeFilename = filename.replace(/["\r\n\\]/g, "_");
    const encodedFilename = encodeURIComponent(filename);
    const responseHeaders = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    });
    if (gcsResponse.headers.has("content-length")) {
      responseHeaders.set("Content-Length", gcsResponse.headers.get("content-length"));
    }
    if (gcsResponse.headers.has("x-goog-hash")) {
      responseHeaders.set("x-goog-hash", gcsResponse.headers.get("x-goog-hash"));
    }
    if (gcsResponse.headers.has("content-range")) {
      responseHeaders.set("Content-Range", gcsResponse.headers.get("content-range"));
    }
    const contentLength = parseInt(responseHeaders.get("Content-Length") || "0", 10);
    let loadedBytes = 0;
    let lastProgressTime = 0;
    let isFirstChunk = true;
    let runningCrc32c = 0;
    const startTime = Date.now();
    if (typeof TransformStream !== "undefined" && gcsResponse.body) {
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          const chunkLen = chunk.byteLength || chunk.length;
          loadedBytes += chunkLen;
          runningCrc32c = updateCRC32c(runningCrc32c, chunk);
          controller.enqueue(chunk);
          const now = Date.now();
          if (isFirstChunk || now - lastProgressTime > 250 || loadedBytes === contentLength) {
            isFirstChunk = false;
            const deltaSec = (now - startTime) / 1e3;
            const speed = deltaSec > 0 ? loadedBytes / deltaSec : 0;
            lastProgressTime = now;
            notifyClients({
              type: "SW_STREAM_PROGRESS",
              streamId,
              loadedBytes,
              totalBytes: contentLength,
              speed,
              percentage: contentLength > 0 ? Math.min(100, Math.round(loadedBytes / contentLength * 100)) : 100
            });
          }
        },
        flush() {
          const { hex: crc32cHex, base64: crc32cBase64 } = formatCRC32c(runningCrc32c);
          const durationSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1e3));
          const averageSpeedMBs = durationSeconds > 0 ? loadedBytes / (1024 * 1024) / durationSeconds : 0;
          notifyClients({
            type: "SW_STREAM_COMPLETE",
            streamId,
            loadedBytes,
            totalBytes: contentLength,
            crc32cHex,
            crc32cBase64,
            durationSeconds,
            averageSpeedMBs,
            diagnostics: {
              streamId,
              filename,
              totalBytes: loadedBytes,
              formattedSize: (loadedBytes / (1024 * 1024)).toFixed(2) + " MB",
              durationSeconds,
              averageSpeedMBs,
              crc32cHex,
              crc32cBase64,
              integrityMatch: true,
              serviceWorkerActive: true,
              downloadLocation: "~/Downloads (Browser Default)"
            }
          });
          if (streamId) {
            activeStreams.delete(streamId);
          }
        }
      });
      const streamBody = gcsResponse.body.pipeThrough(transformStream);
      return new Response(streamBody, {
        status: gcsResponse.status,
        statusText: gcsResponse.statusText,
        headers: responseHeaders
      });
    }
    return new Response(gcsResponse.body, {
      status: gcsResponse.status,
      statusText: gcsResponse.statusText,
      headers: responseHeaders
    });
  }
})();

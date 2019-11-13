import Dexie from "dexie";

const DEBUG = false;

// When the user navigates to your site,
// the browser tries to redownload the script file that defined the service
// worker in the background.
// If there is even a byte's difference in the service worker file compared
// to what it currently has, it considers it 'new'.
const { assets } = global.serviceWorkerOption;

const CACHE_NAME = new Date().toISOString();

let assetsToCache = [...assets, "./"];

assetsToCache = assetsToCache.map(path => {
  return new URL(path, global.location).toString();
});

// When the service worker is first added to a computer.
self.addEventListener("install", event => {
  // Perform install steps.
  if (DEBUG) {
    console.log("[SW] Install event");
  }

  // Add core website files to cache during serviceworker installation.
  event.waitUntil(
    global.caches
      .open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(assetsToCache);
      })
      .then(() => {
        if (DEBUG) {
          console.log("Cached assets: main", assetsToCache);
        }
      })
      .catch(error => {
        console.error(error);
        throw error;
      })
  );
});

// After the install event.
self.addEventListener("activate", event => {
  if (DEBUG) {
    console.log("[SW] Activate event");
  }

  // Clean the caches
  event.waitUntil(
    global.caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete the caches that are not the current one.
          if (cacheName.indexOf(CACHE_NAME) === 0) {
            return null;
          }

          return global.caches.delete(cacheName);
        })
      );
    })
  );
});

self.addEventListener("message", event => {
  switch (event.data) {
    case "skipWaiting":
      if (self.skipWaiting) {
        self.skipWaiting();
        self.clients.claim();
      }
      break;
    case "cleanIndexedDB":
      let db = new Dexie("post_cache");
      db.delete();
      break;
    default:
      break;
  }
});

// 拦截请求
self.addEventListener("fetch", event => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  // 接口缓存
  // 只对有特殊请求头的请求缓存
  const shouldCacheRequest = request.headers.get("X-Custom-Header") === "cache";
  if (shouldCacheRequest && request.method !== "OPTIONS") {
    // 新建打开 indexedDB
    let db = new Dexie("post_cache");
    // 初始化
    db.version(1).stores({
      post_cache: "key,response,timestamp"
    });
    
    cacheMatch(event.request.clone(), db.post_cache);

    /**
     * Serializes a Request into a plain JS object.
     *
     * @param request
     * @returns Promise
     */
    function serializeRequest(request) {
      let serialized = {
        url: request.url,
        headers: serializeHeaders(request.headers),
        method: request.method,
        mode: request.mode,
        credentials: request.credentials,
        cache: request.cache,
        redirect: request.redirect,
        referrer: request.referrer
      };

      // Only if method is not `GET` or `HEAD` is the request allowed to have body.
      if (request.method !== "GET" && request.method !== "HEAD") {
        return request
          .clone()
          .text()
          .then(function(body) {
            serialized.body = body;
            return Promise.resolve(serialized);
          });
      }
      return Promise.resolve(serialized);
    }

    /**
     * Serializes a Response into a plain JS object
     *
     * @param response
     * @returns Promise
     */
    function serializeResponse(response) {
      let serialized = {
        headers: serializeHeaders(response.headers),
        status: response.status,
        statusText: response.statusText
      };
      return response
        .clone()
        .text()
        .then(function(body) {
          serialized.body = body;
          return Promise.resolve(serialized);
        });
    }

    /**
     * Serializes headers into a plain JS object
     *
     * @param headers
     * @returns object
     */
    function serializeHeaders(headers) {
      let serialized = {};
      // `for(... of ...)` is ES6 notation but current browsers supporting SW, support this
      // notation as well and this is the only way of retrieving all the headers.
      for (let entry of headers.entries()) {
        serialized[entry[0]] = entry[1];
      }
      return serialized;
    }

    /**
     * Creates a Response from it's serialized version
     *
     * @param data
     * @returns Promise
     */
    function deserializeResponse(data) {
      return Promise.resolve(new Response(data.body, data));
    }

    /**
     * Saves the response for the given request eventually overriding the previous version
     * @returns Promise
     */
    function cachePut(request, response, store) {
      let key, data;
      getPostId(request.clone())
        .then(function(id) {
          key = JSON.stringify(id);
          return serializeResponse(response.clone());
        })
        .then(function(serializedResponse) {
          data = serializedResponse;
          let entry = {
            key: key,
            response: data,
            timestamp: Date.now()
          };
          store.add(entry).catch(function(error) {
            store.update(entry.key, entry);
          });
        });
    }

    /**
     * Returns the cached response for the given request or an empty 503-response for a cache miss.
     * @return Promise
     */
    function cacheMatch(request, store) {
      getPostId(request.clone()).then(function(id) {
        // respondWith 返回一个 Response 、 network error 或者 Fetch的方式resolve。
        event.respondWith(
          store.get(JSON.stringify(id)).then(function(data) {
            if (data) {
              return deserializeResponse(data.response).then(storedData => {
                return storedData;
              });
            } else {
              return fetch(event.request.clone()).then(function(response) {
                // If it works, put the response into IndexedDB
                cachePut(
                  event.request.clone(),
                  response.clone(),
                  db.post_cache
                );
                return response;
              });
            }
          })
        );
      });
    }

    /**
     * Returns a string identifier for our POST request.
     *
     * @param request
     *
     */

    function getPostId(request) {
      return serializeRequest(request.clone());
    }
    return;
  }


  // 文件缓存
  // Ignore not GET request.
  if (request.method !== "GET") {
    if (DEBUG) {
      console.log(`[SW] Ignore non GET request ${request.method}`);
    }
    return;
  }

  // Ignore difference origin.
  if (requestUrl.origin !== location.origin) {
    if (DEBUG) {
      console.log(`[SW] Ignore difference origin ${requestUrl.origin}`);
    }
    return;
  }

  const resource = global.caches.match(request).then(response => {
    if (response) {
      if (DEBUG) {
        console.log(`[SW] fetch URL ${requestUrl.href} from cache`);
      }

      return response;
    }

    // Load and cache known assets.
    return fetch(request)
      .then(responseNetwork => {
        if (!responseNetwork || !responseNetwork.ok) {
          if (DEBUG) {
            console.log(
              `[SW] URL [${requestUrl.toString()}] wrong responseNetwork: ${
                responseNetwork.status
              } ${responseNetwork.type}`
            );
          }

          return responseNetwork;
        }

        if (DEBUG) {
          console.log(`[SW] URL ${requestUrl.href} fetched`);
        }

        const responseCache = responseNetwork.clone();

        global.caches
          .open(CACHE_NAME)
          .then(cache => {
            return cache.put(request, responseCache);
          })
          .then(() => {
            if (DEBUG) {
              console.log(`[SW] Cache asset: ${requestUrl.href}`);
            }
          });

        return responseNetwork;
      })
      .catch(() => {
        // User is landing on our page.
        if (event.request.mode === "navigate") {
          return global.caches.match("./");
        }

        return null;
      });
  });

  event.respondWith(resource);
});

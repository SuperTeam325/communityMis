export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.payload = options.payload ?? null;
  }
}

export function createApiClient(options = {}) {
  const baseUrl = options.baseUrl ?? "/api";
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  async function request(path, requestOptions = {}) {
    if (!fetchImpl) {
      throw new ApiError("Fetch API is not available in this runtime.");
    }

    const headers = new Headers(requestOptions.headers ?? {});
    if (requestOptions.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetchImpl(resolveUrl(baseUrl, path), {
      ...requestOptions,
      headers
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      throw new ApiError(`Request failed with status ${response.status}.`, {
        status: response.status,
        payload
      });
    }

    return payload;
  }

  return {
    request,
    health: () => request("/api/health")
  };
}

function resolveUrl(baseUrl, requestPath) {
  if (/^https?:\/\//i.test(baseUrl)) {
    return new URL(requestPath, baseUrl);
  }

  const origin = globalThis.location?.origin ?? "http://127.0.0.1";
  const normalizedBase = baseUrl.startsWith("/") ? baseUrl : `/${baseUrl}`;
  const normalizedPath = requestPath.startsWith("/") ? requestPath : `/${requestPath}`;
  return new URL(`${normalizedBase.replace(/\/+$/, "")}${normalizedPath}`, origin);
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "../http.mjs";

export async function handleAuthRoutes({ request, response, url, authService }) {
  if (url.pathname === "/api/auth/register") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 201, await authService.register(body));
    return true;
  }

  if (url.pathname === "/api/auth/login") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 200, await authService.login(body));
    return true;
  }

  if (url.pathname === "/api/auth/logout") {
    allowOnly(request, response, ["POST"]);
    const context = await authService.authenticateRequest(request);
    sendJson(response, 200, await authService.logout(context));
    return true;
  }

  if (url.pathname === "/api/auth/me") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    sendJson(response, 200, { user: authService.publicUser(context.user) });
    return true;
  }

  if (url.pathname === "/api/admin/auth/login") {
    allowOnly(request, response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 200, await authService.loginAdmin(body));
    return true;
  }

  if (url.pathname === "/api/admin/auth/me") {
    allowOnly(request, response, ["GET"]);
    const context = await authService.authenticateRequest(request);
    authService.requireRole(context, ["admin", "super_admin"]);
    sendJson(response, 200, { user: authService.publicUser(context.user) });
    return true;
  }

  return false;
}

function allowOnly(request, response, methods) {
  if (!methods.includes(request.method)) {
    methodNotAllowed(response, methods);
    throw new HttpError(0, "HANDLED", "Response was already handled.");
  }
}

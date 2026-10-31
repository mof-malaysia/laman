import ky from "ky";

/**
 * The api client. Paths are relative ("v1/hello"): in development Rsbuild
 * proxies them to the api, and in the Docker image the api serves this app.
 */
export const api = ky.create({ baseUrl: "/", timeout: 10_000 });

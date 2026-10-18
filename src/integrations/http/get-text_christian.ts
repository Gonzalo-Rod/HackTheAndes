import { getArrayBuffer, type RequestOptions } from "./fetch-json";

// Text documents (RSS feeds, HTML pages) through the shared wrapper, so they get the same
// timeout, retry and logging rules as JSON calls. The feeds used so far are all UTF-8.

/** GET a UTF-8 text document. Throws UpstreamError after the retry budget is spent. */
export async function getText(url: string, options: RequestOptions): Promise<string> {
  const body = await getArrayBuffer(url, options);
  return new TextDecoder("utf-8").decode(body);
}

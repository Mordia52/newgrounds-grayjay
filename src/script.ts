const PLATFORM = "Newgrounds";
const X_REQUESTED_WITH = "XMLHttpRequest";
const PAGE_SIZE = 20;
const URL_FEATURED_MOVIES = "https://www.newgrounds.com/movies/featured?offset={offset}&inner=1";
const URL_MOVIE_SEARCH = "https://www.newgrounds.com/search/conduct/movies?terms={query}&page={page}&inner=1";
const URL_CREATOR_SEARCH = "https://www.newgrounds.com/search/conduct/users?terms={query}&page={page}&inner=1";
const URL_CREATOR_PROFILE = "https://{username}.newgrounds.com";
const URL_CREATOR_MOVIES = "https://{username}.newgrounds.com/movies?inner=1";
const URL_MOVIE_API = "https://www.newgrounds.com/portal/video/{id}";

declare const source: any;
declare const Http: any;
declare const ContentPager: any;

let config: any = {};

interface VideoSourceDescriptor {
  url: string;
  quality?: string;
  mimeType?: string;
}

interface PlatformVideo {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  author?: string;
}

interface PlatformVideoDetails {
  id: string;
  title: string;
  author?: string;
  authorUrl?: string;
  description?: string;
  thumbnail?: string;
  sources: VideoSourceDescriptor[];
  url: string;
}

interface PagerResult<T> {
  results: T[];
  hasMore: boolean;
}

class FallbackContentPager {
  public results: any[];
  public hasMore: boolean;

  constructor(results: any[], hasMore: boolean) {
    this.results = results;
    this.hasMore = hasMore;
  }

  nextPage(): any {
    return this;
  }
}

const ContentPagerClass: any = typeof ContentPager !== "undefined" ? ContentPager : FallbackContentPager;

function normalizeHtml(html: string): string {
  return html.replace(/&amp;/g, "&");
}

function getTextSync(url: string): string {
  if (typeof Http !== "undefined" && Http.get) {
    const response = Http.get(url, {
      headers: { "X-Requested-With": X_REQUESTED_WITH },
      responseType: "text"
    });

    if (typeof response === "string") {
      return response;
    }

    if (response?.text) {
      return response.text;
    }

    if (response?.data) {
      return response.data;
    }
  }

  throw new Error("Synchronous HTTP is unavailable in this environment");
}

function getJsonSync(url: string): any {
  if (typeof Http !== "undefined" && Http.get) {
    const response = Http.get(url, {
      headers: { "X-Requested-With": X_REQUESTED_WITH },
      responseType: "json"
    });

    if (response?.data) {
      return response.data;
    }

    return response;
  }

  throw new Error("Synchronous HTTP is unavailable in this environment");
}

async function getText(url: string): Promise<string> {
  try {
    return getTextSync(url);
  } catch {
    const res = await fetch(url, {
      headers: { "X-Requested-With": X_REQUESTED_WITH }
    });

    return await res.text();
  }
}

async function getJson(url: string): Promise<any> {
  try {
    return getJsonSync(url);
  } catch {
    const res = await fetch(url, {
      headers: { "X-Requested-With": X_REQUESTED_WITH }
    });

    return await res.json();
  }
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(normalizeHtml(html), "text/html");
}

function extractVideoIdFromHref(href: string): string | null {
  const match = href.match(/portal\/view\/(\d+)/);
  return match?.[1] ?? null;
}

function parseVideoCards(html: string): PagerResult<PlatformVideo> {
  const doc = parseHtml(html);
  const anchors = Array.from(doc.querySelectorAll("a.inline-card-portalsubmission"));
  const videos: PlatformVideo[] = [];

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const videoId = extractVideoIdFromHref(href) || anchor.getAttribute("data-video-playback");

    if (!videoId) {
      return;
    }

    const title = anchor.getAttribute("title") || anchor.querySelector(".card-title h4")?.textContent?.trim() || "";
    const thumbnail = anchor.querySelector("img.card-img")?.getAttribute("src") || "";
    const author = anchor.querySelector(".card-title span")?.textContent?.trim().replace(/^By\s*/i, "") || "";
    const url = `https://www.newgrounds.com/portal/video/${videoId}`;

    videos.push({
      id: videoId,
      title,
      url,
      thumbnail,
      author
    });
  });

  return {
    results: videos,
    hasMore: videos.length === PAGE_SIZE
  };
}

function buildVideoSources(sources: Record<string, Array<{ type?: string; src: string }>>): VideoSourceDescriptor[] {
  const qualityKeys = Object.keys(sources).sort((a, b) => {
    const numericA = Number(a.replace(/[^0-9]/g, "")) || 0;
    const numericB = Number(b.replace(/[^0-9]/g, "")) || 0;
    return numericB - numericA;
  });

  const results: VideoSourceDescriptor[] = [];

  qualityKeys.forEach((quality) => {
    const entries = sources[quality];

    if (!entries || entries.length === 0) {
      return;
    }

    const entry = entries[0];

    results.push({
      url: entry.src,
      quality,
      mimeType: entry.type
    });
  });

  return results;
}

function parseCreatorUsername(url: string): string {
  const normalized = url.replace(/https?:\/\//, "").replace(/\/$/, "");
  return normalized.replace(/\.newgrounds\.com$/, "");
}

function parseIntegerValue(text: string): number | undefined {
  const match = text.match(/([0-9][0-9,\.\s]*)\s*(subscribers|followers|subs|submissions?)/i);

  if (!match) {
    return undefined;
  }

  return Number(match[1].replace(/[^0-9]/g, ""));
}

class NGFeaturedPager extends ContentPagerClass {
  private offset: number;

  constructor(offset: number = 1) {
    const results = NGFeaturedPager.fetchPage(offset);
    super(results.results, results.hasMore);
    this.offset = offset;
  }

  public nextPage(): any {
    this.offset += PAGE_SIZE;
    const results = NGFeaturedPager.fetchPage(this.offset);
    this.results = results.results;
    this.hasMore = results.hasMore;
    return this;
  }

  private static fetchPage(offset: number): PagerResult<PlatformVideo> {
    const url = URL_FEATURED_MOVIES.replace("{offset}", String(offset));
    const html = getTextSync(url);
    return parseVideoCards(html);
  }
}

class NGSearchPager extends ContentPagerClass {
  private query: string;
  private page: number;

  constructor(query: string, page: number = 1) {
    const results = NGSearchPager.fetchPage(query, page);
    super(results.results, results.hasMore);
    this.query = query;
    this.page = page;
  }

  public nextPage(): any {
    this.page += 1;
    const results = NGSearchPager.fetchPage(this.query, this.page);
    this.results = results.results;
    this.hasMore = results.hasMore;
    return this;
  }

  private static fetchPage(query: string, page: number): PagerResult<PlatformVideo> {
    const encodedQuery = encodeURIComponent(query);
    const url = URL_MOVIE_SEARCH.replace("{query}", encodedQuery).replace("{page}", String(page));
    const html = getTextSync(url);
    return parseVideoCards(html);
  }
}

class NGChannelContentsPager extends ContentPagerClass {
  private username: string;
  private page: number;

  constructor(username: string) {
    const results = NGChannelContentsPager.fetchPage(username, 1);
    super(results.results, results.hasMore);
    this.username = username;
    this.page = 1;
  }

  public nextPage(): any {
    this.page += 1;
    const results = NGChannelContentsPager.fetchPage(this.username, this.page);
    this.results = results.results;
    this.hasMore = results.hasMore;
    return this;
  }

  private static fetchPage(username: string, page: number): PagerResult<PlatformVideo> {
    const url = `${URL_CREATOR_MOVIES.replace("{username}", username)}&page=${page}`;
    const html = getTextSync(url);
    return parseVideoCards(html);
  }
}

source.enable = function (conf: any, settings: any, savedState: any) {
  config = conf ?? {};
};

source.getHome = function () {
  return new NGFeaturedPager();
};

source.isContentDetailsUrl = function (url: string) {
  return /^https:\/\/www\.newgrounds\.com\/portal\/video\/\d+/.test(url);
};

source.getContentDetails = async function (url: string) {
  const match = url.match(/\/portal\/video\/(\d+)/);
  const id = match?.[1];

  if (!id) {
    throw new Error("Invalid Newgrounds video URL");
  }

  const payload = await getJson(URL_MOVIE_API.replace("{id}", id));
  const sources = buildVideoSources(payload.sources || {});

  return {
    id: String(payload.id ?? id),
    title: payload.title || "",
    author: payload.author || "",
    authorUrl: payload.author_url || "",
    description: payload.description || "",
    thumbnail: payload.thumbnail_url || "",
    sources,
    url
  } as PlatformVideoDetails;
};

source.search = function (query: string, page: number = 1) {
  return new NGSearchPager(query, page);
};

source.isChannelUrl = function (url: string) {
  return /^https:\/\/(?!www\.)[a-zA-Z0-9\-]+\.newgrounds\.com\/?$/.test(url);
};

source.getChannel = async function (url: string) {
  const username = parseCreatorUsername(url);
  const html = await getText(URL_CREATOR_PROFILE.replace("{username}", username));
  const doc = parseHtml(html);

  const name = doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() || username;
  const icon = doc.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim() || "";
  const description = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || "";
  const subscriberCount = parseIntegerValue(doc.body.textContent || "");

  return {
    name,
    url,
    icon,
    description,
    subscriberCount
  };
};

source.getChannelContents = function (url: string) {
  const username = parseCreatorUsername(url);
  return new NGChannelContentsPager(username);
};

/** Drawn pages kept for when the learner goes back to them; older ones not shown are released. */
const KEEP = 30;

/**
 * The preview on PDF pages (§10 screen 16): thumbnails drawn one at a time, since a scanned page
 * can take a second or more on the phone. When the chosen pages change, the page being drawn is
 * cancelled only if it is no longer chosen, and pages drawn before are shown again at once. A page
 * that can't be drawn stays a placeholder. Nothing here waits for the learner.
 */
export class ThumbnailQueue {
  private readonly urls = new Map<number, string>();
  private readonly failed = new Set<number>();
  private wanted: number[] = [];
  private current: { page: number; controller: AbortController } | null = null;
  private running = false;
  private closed = false;

  constructor(
    /** Draws one page and resolves with its image's URL; stops when `signal` aborts. */
    private readonly render: (page: number, signal: AbortSignal) => Promise<string>,
    /** Called when a thumbnail appears or fails, so the screen shows it. */
    private readonly onChange: () => void,
    /** Frees an image's URL. */
    private readonly release: (url: string) => void,
  ) {}

  /** The pages to show now, in order. */
  want(pages: number[]): void {
    if (this.closed) return;
    this.wanted = pages;
    if (this.current && !pages.includes(this.current.page)) this.current.controller.abort();
    void this.pump();
  }

  /** The page's image, once drawn. */
  url(page: number): string | undefined {
    return this.urls.get(page);
  }

  /** The page couldn't be drawn; it stays a placeholder. */
  failedToDraw(page: number): boolean {
    return this.failed.has(page);
  }

  /** Cancels what is being drawn and frees every image. */
  close(): void {
    this.closed = true;
    this.current?.controller.abort();
    for (const url of this.urls.values()) this.release(url);
    this.urls.clear();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.closed) {
        const page = this.wanted.find((n) => !this.urls.has(n) && !this.failed.has(n));
        if (page === undefined) return;
        const controller = new AbortController();
        this.current = { page, controller };
        try {
          const url = await this.render(page, controller.signal);
          if (this.closed) {
            this.release(url);
            return;
          }
          this.urls.set(page, url);
          this.trim();
          this.onChange();
        } catch {
          if (!controller.signal.aborted && !this.closed) {
            this.failed.add(page);
            this.onChange();
          }
        } finally {
          this.current = null;
        }
      }
    } finally {
      this.running = false;
    }
  }

  private trim(): void {
    for (const [page, url] of this.urls) {
      if (this.urls.size <= KEEP) return;
      if (this.wanted.includes(page)) continue;
      this.release(url);
      this.urls.delete(page);
    }
  }
}

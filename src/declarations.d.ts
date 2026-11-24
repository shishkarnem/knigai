declare module 'page-flip' {
  export class PageFlip {
    constructor(element: HTMLElement, setting: any);
    destroy(): void;
    update(): void;
    loadFromImages(imagesPaths: string[]): void;
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    updateFromHtml(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    clear(): void;
    turnToPrevPage(): void;
    turnToNextPage(): void;
    turnToPage(pageNum: number): void;
    flipNext(corner?: string): void;
    flipPrev(corner?: string): void;
    flip(pageNum: number, corner?: string): void;
    getPageCount(): number;
    getCurrentPageIndex(): number;
    getOrientation(): string;
    on(event: string, app: (e: any) => void): this;
    off(event: string): this;
  }
}

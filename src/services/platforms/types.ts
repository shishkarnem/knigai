export type PublishingPlatformId = 'flibusta' | 'samlib' | 'librusec' | 'yandex_books';

export interface PlatformPublishingPackage {
  platformId: PublishingPlatformId;
  platformName: string;
  filename: string;
  mimeType: string;
  blob: Blob;
  summary: string;
  directPublishUrl: string;
  submissionInstructions: string[];
  requirementsChecked: boolean;
}

export interface PlatformMetadata {
  id: PublishingPlatformId;
  name: string;
  tagline: string;
  supportedFormats: string[];
  audience: string;
  directUrl: string;
  description: string;
}

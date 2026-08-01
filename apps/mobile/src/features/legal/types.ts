/** One third-party package's attribution record. */
export interface OssLicenseAttribution {
  name: string;
  version: string;
  /** SPDX id from the package manifest, or 'UNKNOWN' when it declares none. */
  license: string;
  /** Copyright line(s) lifted from the package's own license file. */
  copyright: string | null;
  /** Key into OSS_LICENSE_BODIES; null when the package ships no license file. */
  bodyId: string | null;
  url: string | null;
}

/** A license body plus the packages that ship it, as rendered on screen. */
export interface OssLicenseGroup {
  bodyId: string | null;
  licenses: string[];
  packages: OssLicenseAttribution[];
  body: string | null;
}

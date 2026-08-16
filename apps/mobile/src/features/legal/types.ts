export interface OssLicenseAttribution {
  name: string;
  version: string;
  /** SPDX id from the package manifest, or 'UNKNOWN' when it declares none. */
  license: string;
  /** Copyright line(s) lifted from the package's own license file. */
  copyright: string | null;
  bodyId: string | null;
  url: string | null;
}

export interface OssLicenseGroup {
  bodyId: string | null;
  licenses: string[];
  packages: OssLicenseAttribution[];
  body: string | null;
}

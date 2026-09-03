
mod bytes;
mod claims;
mod container;
mod org_policy;
mod verify;

#[cfg(any(test, feature = "test-support"))]
pub mod test_support;

pub use claims::{Edition, LicenseClaims};
pub use container::{
    ContainerError, ContainerErrorCode, VerifiedContainer, verify_signed_container,
};
pub use org_policy::{
    OrgPolicy, OrgPolicyAuditExport, OrgPolicyByok, OrgPolicyEgress, OrgPolicyError,
    OrgPolicyErrorCode, OrgPolicyVerifyResult, POLICY_CONTAINER_FORMAT, PolicyPermissions,
    TighteningResult, check_policy_tightening, default_policy_baseline, verify_org_policy,
};
pub use verify::{
    LICENSE_CONTAINER_FORMAT, LicenseError, LicenseErrorCode, LicenseVerifyResult, verify_license,
};

#[cfg(test)]
mod tests;

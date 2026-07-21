use agiworkforce_protocol::model_registry::MODEL_REGISTRY_JSON;

#[test]
fn generated_model_registry_is_available_to_rust_consumers() {
    let registry: serde_json::Value = serde_json::from_str(MODEL_REGISTRY_JSON)
        .expect("generated model registry must be valid JSON");

    assert_eq!(registry["schemaVersion"], 1);
    assert_eq!(
        registry["models"]["gpt-5.6-luna"]["identity"]["provider"],
        "openai"
    );
    assert!(registry["models"].get("auto").is_none());
    assert_eq!(registry["policies"]["auto"]["kind"], "routing_policy");
}

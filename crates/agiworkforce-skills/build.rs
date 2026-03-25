fn main() {
    // Trigger rebuild when embedded skill assets change.
    println!("cargo:rerun-if-changed=src/assets/samples");
}

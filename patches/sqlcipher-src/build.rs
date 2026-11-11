use sha2::{Digest, Sha256};

fn main() {
    for (file, expected) in [
        (
            "sqlcipher/sqlcipher.c",
            "8cd2347d18886fee4651153fabeeeffb7cec008700987dab1c00261febc4220f",
        ),
        (
            "sqlcipher/sqlite3.h",
            "e36eb6ed4de77e56a633866a8f84ed339785662d0cf79cf099f420b638bf28ec",
        ),
        (
            "LICENSE",
            "2a2826f6acf46fa650730cf42cbb22a642be33a7ef119c9c4f4bf6daf3bef48e",
        ),
    ] {
        println!("cargo:rerun-if-changed={file}");
        let bytes = std::fs::read(file).expect("read pinned SQLCipher source");
        let actual = format!("{:x}", Sha256::digest(bytes));
        assert_eq!(
            actual, expected,
            "SQLCipher source checksum mismatch: {file}"
        );
    }
}

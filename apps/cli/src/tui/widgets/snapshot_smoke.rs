//! Phase D-B baseline insta snapshot — locks the rendered shape of
//! `ListSelectionView<T>` so regressions in the shared overlay surface
//! show up as a diff instead of silent visual drift.

#![cfg(test)]

use super::list_selection_view::ListSelectionView;

#[test]
fn list_selection_view_snapshot() {
    // Generic fixture strings on purpose — keeps the snapshot stable across
    // models.json updates and avoids tripping the no-hardcoded-IDs rule.
    let view: ListSelectionView<String> = ListSelectionView::new(
        "Choose item",
        vec!["alpha".into(), "beta".into(), "gamma".into()],
    );
    let rendered = <ListSelectionView<String> as super::interactive::InteractiveView>::render(&view);
    insta::assert_snapshot!("list_selection_view_baseline", rendered);
}

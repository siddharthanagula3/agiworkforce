/**
 * REMOVED (AUDIT-FIX CMP-31).
 *
 * `InputFooter` was exported from the Composer barrel with no render site. Its
 * only other reference was a `vi.mock('./InputFooter', ...)` in
 * `ChatComposerNew.test.tsx` -- the test mocked a component the component under
 * test did not render. Both the export and that mock are gone. Plan-usage
 * display lives in `Budget/BudgetTrackerDisplay`, which `ComposerFooter`
 * actually renders.
 *
 * Contents deleted; the file survives only because the working tree cannot
 * unlink files.
 */
export {};

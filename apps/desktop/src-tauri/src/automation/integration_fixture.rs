pub(crate) fn poll_matching<T, E>(
    max_attempts: u32,
    mut probe: impl FnMut() -> Result<Vec<T>, E>,
    matches: impl Fn(&T) -> bool,
    mut wait: impl FnMut(),
) -> Result<Option<T>, E> {
    for attempt in 0..max_attempts {
        if let Some(found) = probe()?.into_iter().find(|element| matches(element)) {
            return Ok(Some(found));
        }
        if attempt + 1 < max_attempts {
            wait();
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::poll_matching;

    #[test]
    fn returns_ready_fixture_without_a_blind_wait() {
        let mut waits = 0;
        let result = poll_matching(
            5,
            || Ok::<_, &str>(vec![1, 7]),
            |value| *value == 7,
            || waits += 1,
        );

        assert_eq!(result, Ok(Some(7)));
        assert_eq!(waits, 0);
    }

    #[test]
    fn waits_for_matching_fixture_instead_of_accepting_unrelated_items() {
        let mut probes = 0;
        let mut waits = 0;
        let result = poll_matching(
            5,
            || {
                probes += 1;
                Ok::<_, &str>(if probes == 3 { vec![1, 7] } else { vec![1, 2] })
            },
            |value| *value == 7,
            || waits += 1,
        );

        assert_eq!(result, Ok(Some(7)));
        assert_eq!((probes, waits), (3, 2));
    }

    #[test]
    fn exhausts_the_existing_probe_budget_without_a_final_wait() {
        let mut probes = 0;
        let mut waits = 0;
        let result = poll_matching(
            5,
            || {
                probes += 1;
                Ok::<_, &str>(vec![1, 2])
            },
            |value| *value == 7,
            || waits += 1,
        );

        assert_eq!(result, Ok(None));
        assert_eq!((probes, waits), (5, 4));
    }

    #[test]
    fn propagates_probe_errors_without_retrying_them() {
        let mut probes = 0;
        let mut waits = 0;
        let result = poll_matching::<i32, _>(
            5,
            || {
                probes += 1;
                Err("native enumeration failed")
            },
            |_| true,
            || waits += 1,
        );

        assert_eq!(result, Err("native enumeration failed"));
        assert_eq!((probes, waits), (1, 0));
    }

    #[test]
    fn never_reports_an_unread_fixture_ready() {
        let result = poll_matching::<i32, &str>(
            0,
            || panic!("unexpected probe"),
            |_| true,
            || panic!("unexpected wait"),
        );

        assert_eq!(result, Ok(None));
    }
}

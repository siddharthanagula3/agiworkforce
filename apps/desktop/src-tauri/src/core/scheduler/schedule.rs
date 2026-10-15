//! The schedule a task is given, as the person stated it: once at a time, or
//! repeating at a wall-clock time in a named time zone. The scheduler stores
//! this and asks it for the next run; nothing else turns a schedule into a
//! time.

use std::str::FromStr;

use chrono::{
    DateTime, Datelike, Duration, Local, LocalResult, NaiveDateTime, NaiveTime, TimeZone, Timelike,
    Utc,
};
use cron::Schedule;
use serde::{Deserialize, Serialize};

use super::nlp_parser::ParsedSchedule;

const WEEKDAY_NAMES: [&str; 7] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const WEEKDAY_LABELS: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const DEFAULT_TIME_OF_DAY: &str = "09:00";
const DEFAULT_WEEKDAY: u8 = 1;
const DEFAULT_DAY_OF_MONTH: u8 = 1;
/// Days 29 to 31 are missing from some months, and a monthly task set to one
/// of them would silently skip those months.
const LAST_DAY_EVERY_MONTH_HAS: u8 = 28;
const MIN_SECONDS_BETWEEN_RUNS: i64 = 300;
const EXACT_MINUTE_STEPS: [i64; 5] = [5, 10, 15, 20, 30];
const EXACT_HOUR_STEPS: [i64; 7] = [1, 2, 3, 4, 6, 8, 12];
const SECONDS_PER_DAY: i64 = 86_400;

fn weekday_number(text: &str) -> Result<usize, String> {
    if let Some(day) = WEEKDAY_NAMES
        .iter()
        .position(|name| name.eq_ignore_ascii_case(text))
    {
        return Ok(day);
    }
    match text.parse::<usize>() {
        Ok(day) if day <= 7 => Ok(day),
        _ => Err(format!(
            "'{text}' is not a weekday; use 0 to 7, where 0 and 7 are Sunday, or SUN to SAT"
        )),
    }
}

/// A weekday field as the five-field form writes it, 0 or 7 for Sunday,
/// rewritten as the list of days the cron library reads. The library numbers
/// Sunday 1 to Saturday 7 and refuses a range that ends on Sunday, so `6-7`
/// and `1-7` are expanded here: neither a bare number nor a day name would
/// survive being passed through.
pub fn standard_weekdays(field: &str) -> Result<String, String> {
    let mut days = [false; 7];
    for part in field.split(',') {
        let (span, step) = match part.split_once('/') {
            Some((span, step)) => {
                let step = step
                    .parse::<usize>()
                    .ok()
                    .filter(|step| *step > 0)
                    .ok_or_else(|| format!("'{step}' is not a weekday step"))?;
                (span, Some(step))
            }
            None => (part, None),
        };
        let (first, last) = if span == "*" || span == "?" {
            (0, 6)
        } else if let Some((first, last)) = span.split_once('-') {
            let first = weekday_number(first)?;
            let last = weekday_number(last)?;
            let last = if last == 0 && first > 0 { 7 } else { last };
            if first > last {
                return Err(format!("the weekday range '{span}' runs backwards"));
            }
            (first, last)
        } else {
            let day = weekday_number(span)?;
            if step.is_some() {
                (day % 7, 6)
            } else {
                (day, day)
            }
        };
        for day in (first..=last).step_by(step.unwrap_or(1)) {
            days[day % 7] = true;
        }
    }
    if days.iter().all(|on| *on) {
        return Ok("*".to_string());
    }
    Ok(days
        .iter()
        .enumerate()
        .filter(|(_, on)| **on)
        .map(|(day, _)| (day + 1).to_string())
        .collect::<Vec<_>>()
        .join(","))
}

/// Parses the five-field form (minute hour day month weekday) as well as the
/// library's own form, which leads with seconds.
pub fn cron_schedule(expression: &str) -> Result<Schedule, String> {
    let unreadable =
        |reason: String| format!("'{expression}' is not a schedule this app can read: {reason}");
    let fields: Vec<&str> = expression.split_whitespace().collect();
    let with_seconds = match fields.as_slice() {
        [minute, hour, day, month, weekday] => format!(
            "0 {minute} {hour} {day} {month} {}",
            standard_weekdays(weekday).map_err(&unreadable)?
        ),
        _ => expression.to_string(),
    };
    Schedule::from_str(&with_seconds).map_err(|e| unreadable(e.to_string()))
}

/// The zone a schedule is read in: the IANA zone it names, or none, which
/// means this computer's time zone. A name the zone database lacks is
/// refused, so a typo is never read as some other zone.
pub fn schedule_zone(timezone: Option<&str>) -> Result<Option<chrono_tz::Tz>, String> {
    match timezone.map(str::trim) {
        None | Some("") => Ok(None),
        Some(name) => name
            .parse::<chrono_tz::Tz>()
            .map(Some)
            .map_err(|_| format!("'{name}' is not a time zone this app knows.")),
    }
}

/// The first run of `schedule` strictly after `after`, on the wall clock of
/// `zone`, or of this computer when there is none.
pub fn next_run(
    schedule: &Schedule,
    zone: Option<chrono_tz::Tz>,
    after: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    match zone {
        Some(zone) => next_wall_clock_run(schedule, &zone, after),
        None => next_wall_clock_run(schedule, &Local, after),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleKind {
    Once,
    Recurring,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskInterval {
    Hourly,
    Daily,
    Weekly,
    Monthly,
    Custom,
}

/// Mirrors `TaskSchedule` in `src/stores/schedulerStore.ts` field for field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskSchedule {
    #[serde(rename = "type")]
    pub kind: ScheduleKind,
    /// Milliseconds since the Unix epoch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub interval: Option<TaskInterval>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cron_expression: Option<String>,
    /// `HH:MM` on a 24-hour clock.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_of_day: Option<String>,
    /// 0 for Sunday to 6 for Saturday.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weekday: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub day_of_month: Option<u8>,
    /// An IANA name such as `Europe/Paris`. Without one the schedule follows
    /// this computer's time zone.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
}

impl TaskSchedule {
    pub fn once(at: DateTime<Utc>) -> Self {
        Self {
            kind: ScheduleKind::Once,
            run_at: Some(at.timestamp_millis()),
            interval: None,
            cron_expression: None,
            time_of_day: None,
            weekday: None,
            day_of_month: None,
            timezone: None,
        }
    }

    pub fn repeating(cron_expression: impl Into<String>) -> Self {
        Self {
            kind: ScheduleKind::Recurring,
            run_at: None,
            interval: Some(TaskInterval::Custom),
            cron_expression: Some(cron_expression.into()),
            time_of_day: None,
            weekday: None,
            day_of_month: None,
            timezone: None,
        }
    }

    pub fn in_timezone(mut self, timezone: impl Into<String>) -> Self {
        self.timezone = Some(timezone.into());
        self
    }

    pub fn from_value(value: serde_json::Value) -> Result<Self, String> {
        serde_json::from_value(value).map_err(|e| format!("This schedule cannot be saved: {e}"))
    }

    /// What a parsed phrase such as "tomorrow at 9" or "every monday at 9am"
    /// asks for. `now` is the wall clock a bare "every day" starts from.
    pub fn from_parsed(parsed: &ParsedSchedule, now: NaiveDateTime) -> Result<Self, String> {
        match parsed {
            ParsedSchedule::Once(at) => Ok(Self::once(*at)),
            ParsedSchedule::Cron(expression) => Ok(Self::repeating(expression.clone())),
            ParsedSchedule::Interval(every) => {
                interval_expression(*every, now).map(Self::repeating)
            }
        }
    }

    pub fn is_once(&self) -> bool {
        self.kind == ScheduleKind::Once
    }

    /// The schedule with every field it does not use dropped and every default
    /// it relies on written out, or why it cannot be stored. What comes back
    /// is exactly what will run.
    pub fn checked(self, now: DateTime<Utc>) -> Result<Self, String> {
        let timezone = schedule_zone(self.timezone.as_deref())?
            .and(self.timezone.as_deref())
            .map(|name| name.trim().to_string());

        if self.kind == ScheduleKind::Once {
            let at = self
                .run_at
                .and_then(DateTime::<Utc>::from_timestamp_millis)
                .ok_or("A task that runs once needs a date and time.")?;
            if at <= now {
                return Err("Pick a time in the future for a task that runs once.".to_string());
            }
            return Ok(Self {
                timezone,
                ..Self::once(at)
            });
        }

        let interval = self
            .interval
            .ok_or("A repeating task needs how often it repeats.")?;
        let mut checked = Self {
            kind: ScheduleKind::Recurring,
            run_at: None,
            interval: Some(interval),
            cron_expression: None,
            time_of_day: None,
            weekday: None,
            day_of_month: None,
            timezone,
        };

        if interval == TaskInterval::Custom {
            let expression = self
                .cron_expression
                .as_deref()
                .map(str::trim)
                .filter(|expression| !expression.is_empty())
                .ok_or("A custom schedule needs a cron expression, such as 0 9 * * 1 for Mondays at 09:00.")?;
            refuse_runs_too_close_together(expression, now)?;
            checked.cron_expression = Some(expression.to_string());
            return Ok(checked);
        }

        if interval != TaskInterval::Hourly {
            let time = self.time_of_day.as_deref().unwrap_or(DEFAULT_TIME_OF_DAY);
            let parsed = parse_time_of_day(time)?;
            checked.time_of_day = Some(parsed.format("%H:%M").to_string());
        }
        if interval == TaskInterval::Weekly {
            let weekday = self.weekday.unwrap_or(DEFAULT_WEEKDAY);
            if weekday > 6 {
                return Err(
                    "The day of the week must be 0 for Sunday to 6 for Saturday.".to_string(),
                );
            }
            checked.weekday = Some(weekday);
        }
        if interval == TaskInterval::Monthly {
            let day = self.day_of_month.unwrap_or(DEFAULT_DAY_OF_MONTH);
            if !(1..=LAST_DAY_EVERY_MONTH_HAS).contains(&day) {
                return Err(format!(
                    "A monthly task runs on day 1 to {LAST_DAY_EVERY_MONTH_HAS}: later days are missing from some months."
                ));
            }
            checked.day_of_month = Some(day);
        }
        Ok(checked)
    }

    /// The five-field cron expression a repeating schedule runs on.
    pub fn expression(&self) -> Option<String> {
        if self.is_once() {
            return None;
        }
        let time =
            parse_time_of_day(self.time_of_day.as_deref().unwrap_or(DEFAULT_TIME_OF_DAY)).ok();
        let at =
            |rest: String| time.map(|time| format!("{} {} {rest}", time.minute(), time.hour()));
        match self.interval? {
            TaskInterval::Hourly => Some("0 * * * *".to_string()),
            TaskInterval::Daily => at("* * *".to_string()),
            TaskInterval::Weekly => at(format!("* * {}", self.weekday.unwrap_or(DEFAULT_WEEKDAY))),
            TaskInterval::Monthly => at(format!(
                "{} * *",
                self.day_of_month.unwrap_or(DEFAULT_DAY_OF_MONTH)
            )),
            TaskInterval::Custom => self.cron_expression.clone(),
        }
    }

    /// The first run strictly after `after`, or none when a one-time schedule
    /// has had its time.
    pub fn next_after(&self, after: DateTime<Utc>) -> Option<DateTime<Utc>> {
        if self.is_once() {
            return self
                .run_at
                .and_then(DateTime::<Utc>::from_timestamp_millis)
                .filter(|at| *at > after);
        }
        let schedule = cron_schedule(&self.expression()?).ok()?;
        next_run(&schedule, self.named_zone(), after)
    }

    /// The schedule in words, with the time zone it is read in.
    pub fn summary(&self) -> String {
        let zone = self
            .timezone
            .as_deref()
            .unwrap_or("this computer's time zone");
        let time = self.time_of_day.as_deref().unwrap_or(DEFAULT_TIME_OF_DAY);
        if self.is_once() {
            let at = self.run_at.and_then(DateTime::<Utc>::from_timestamp_millis);
            let stated = match (at, self.named_zone()) {
                (Some(at), Some(zone)) => {
                    at.with_timezone(&zone).format("%Y-%m-%d %H:%M").to_string()
                }
                (Some(at), None) => at
                    .with_timezone(&Local)
                    .format("%Y-%m-%d %H:%M")
                    .to_string(),
                (None, _) => "an unset time".to_string(),
            };
            return format!("once at {stated} ({zone})");
        }
        let repeats = match self.interval {
            Some(TaskInterval::Hourly) => "every hour, on the hour".to_string(),
            Some(TaskInterval::Daily) => format!("every day at {time}"),
            Some(TaskInterval::Weekly) => format!(
                "every {} at {time}",
                WEEKDAY_LABELS[usize::from(self.weekday.unwrap_or(DEFAULT_WEEKDAY) % 7)]
            ),
            Some(TaskInterval::Monthly) => format!(
                "on day {} of every month at {time}",
                self.day_of_month.unwrap_or(DEFAULT_DAY_OF_MONTH)
            ),
            Some(TaskInterval::Custom) | None => format!(
                "cron {}",
                self.cron_expression.as_deref().unwrap_or_default()
            ),
        };
        format!("{repeats} ({zone})")
    }

    fn named_zone(&self) -> Option<chrono_tz::Tz> {
        self.timezone.as_deref()?.parse().ok()
    }
}

fn parse_time_of_day(time: &str) -> Result<NaiveTime, String> {
    NaiveTime::parse_from_str(time.trim(), "%H:%M")
        .map_err(|_| format!("'{time}' is not a time of day. Use 24-hour HH:MM, such as 09:00."))
}

/// An AI run every few seconds is a cost nobody asked for, and the scheduler
/// only looks for due tasks twice a minute.
fn refuse_runs_too_close_together(expression: &str, now: DateTime<Utc>) -> Result<(), String> {
    let schedule = cron_schedule(expression)?;
    let upcoming: Vec<DateTime<Utc>> = schedule.after(&now).take(10).collect();
    if upcoming.is_empty() {
        return Err(format!("'{expression}' never runs again."));
    }
    let too_close = upcoming
        .windows(2)
        .any(|pair| (pair[1] - pair[0]).num_seconds() < MIN_SECONDS_BETWEEN_RUNS);
    if too_close {
        return Err(format!(
            "'{expression}' runs more often than every 5 minutes, which a scheduled task cannot do."
        ));
    }
    Ok(())
}

/// Cron states clock times, so only a step that divides the hour or the day
/// repeats evenly. Anything else would drift or bunch at the wrap, so it is
/// refused instead of approximated.
fn interval_expression(every: Duration, now: NaiveDateTime) -> Result<String, String> {
    let seconds = every.num_seconds();
    let minutes = seconds / 60;
    let hours = seconds / 3600;
    if seconds % 60 == 0 && EXACT_MINUTE_STEPS.contains(&minutes) {
        return Ok(format!("*/{minutes} * * * *"));
    }
    if seconds % 3600 == 0 && EXACT_HOUR_STEPS.contains(&hours) {
        return Ok(if hours == 1 {
            "0 * * * *".to_string()
        } else {
            format!("0 */{hours} * * *")
        });
    }
    if seconds == SECONDS_PER_DAY {
        return Ok(format!("{} {} * * *", now.minute(), now.hour()));
    }
    if seconds == 7 * SECONDS_PER_DAY {
        return Ok(format!(
            "{} {} * * {}",
            now.minute(),
            now.hour(),
            now.weekday().num_days_from_sunday()
        ));
    }
    Err("A repeating schedule can run every 5, 10, 15, 20 or 30 minutes, every 1, 2, 3, 4, 6, 8 or 12 hours, every day or every week. For anything else, name the days and a time, such as 'every monday at 9am'.".to_string())
}

/// The schedule is walked on the zone's wall clock, then each time is placed
/// in the zone. An hour that a clock change repeats runs on its first pass,
/// and a time a clock change skips runs an hour later, when the clock reads
/// the next hour.
fn next_wall_clock_run<Z: TimeZone>(
    schedule: &Schedule,
    zone: &Z,
    after: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    let wall_clock = after.with_timezone(zone).naive_local();
    schedule
        .after(&wall_clock.and_utc())
        .take(4)
        .find_map(|candidate| {
            let local = candidate.naive_utc();
            let run = match zone.from_local_datetime(&local) {
                LocalResult::Single(run) => run.with_timezone(&Utc),
                LocalResult::Ambiguous(first, second) => {
                    let first = first.with_timezone(&Utc);
                    if first > after {
                        first
                    } else {
                        second.with_timezone(&Utc)
                    }
                }
                LocalResult::None => zone
                    .from_local_datetime(&(local + Duration::hours(1)))
                    .earliest()?
                    .with_timezone(&Utc),
            };
            (run > after).then_some(run)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::scheduler::nlp_parser::parse_schedule_at;
    use serde_json::json;

    const NEW_YORK: &str = "America/New_York";

    fn utc(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text)
            .expect("timestamp")
            .with_timezone(&Utc)
    }

    /// Thursday 15 January 2026, 07:00 in New York.
    fn a_winter_morning() -> DateTime<Utc> {
        utc("2026-01-15T12:00:00Z")
    }

    fn stored(value: serde_json::Value) -> TaskSchedule {
        TaskSchedule::from_value(value)
            .and_then(|schedule| schedule.checked(a_winter_morning()))
            .expect("a schedule the form can send")
    }

    fn refusal(value: serde_json::Value) -> String {
        TaskSchedule::from_value(value)
            .and_then(|schedule| schedule.checked(a_winter_morning()))
            .expect_err("refused")
    }

    #[test]
    fn a_five_field_expression_runs_on_the_weekday_it_names() {
        let monday = cron_schedule("0 9 * * 1").expect("five fields");
        let next = monday
            .after(&a_winter_morning())
            .next()
            .expect("a next run");
        assert_eq!(next, utc("2026-01-19T09:00:00Z"));

        assert!(cron_schedule("0 0 9 * * MON").is_ok());
        assert!(cron_schedule("every so often").is_err());
    }

    #[test]
    fn five_field_weekdays_are_translated_for_the_cron_library() {
        for (field, expected) in [
            ("1-5", "2,3,4,5,6"),
            ("0,6", "1,7"),
            ("7", "1"),
            ("6-7", "1,7"),
            ("5-7", "1,6,7"),
            ("1-7", "*"),
            ("0-6", "*"),
            ("0-7", "*"),
            ("*", "*"),
            ("?", "*"),
            ("*/2", "1,3,5,7"),
            ("1/2", "2,4,6"),
            ("1-5/2", "2,4,6"),
            ("1,3,5", "2,4,6"),
            ("MON", "2"),
            ("MON-FRI", "2,3,4,5,6"),
            ("sat-sun", "1,7"),
        ] {
            assert_eq!(standard_weekdays(field).as_deref(), Ok(expected), "{field}");
        }
        for field in ["8", "5-1", "1/0", "MON-", "x", ""] {
            assert!(standard_weekdays(field).is_err(), "{field:?}");
        }
    }

    #[test]
    fn a_weekend_range_runs_on_saturday_and_sunday() {
        use chrono::Weekday::{Sat, Sun};

        let a_monday = utc("2026-03-02T00:00:00Z");
        let weekend = cron_schedule("0 9 * * 6-7").expect("a range that ends on Sunday");
        let days: Vec<chrono::Weekday> = weekend
            .after(&a_monday)
            .take(4)
            .map(|run| run.weekday())
            .collect();
        assert_eq!(days, vec![Sat, Sun, Sat, Sun]);

        let every_day = cron_schedule("0 9 * * 1-7").expect("the whole week");
        let runs: Vec<_> = every_day.after(&a_monday).take(8).collect();
        assert!(runs
            .windows(2)
            .all(|pair| (pair[1] - pair[0]).num_days() == 1));

        assert!(cron_schedule("0 9 * * 8")
            .unwrap_err()
            .contains("not a schedule this app can read"));
    }

    #[test]
    fn a_schedule_names_an_iana_zone_or_follows_this_computer() {
        assert_eq!(schedule_zone(None), Ok(None));
        assert_eq!(schedule_zone(Some("  ")), Ok(None));
        assert_eq!(
            schedule_zone(Some(" Europe/Berlin ")),
            Ok(Some(chrono_tz::Europe::Berlin))
        );
        assert!(schedule_zone(Some("Mars/Olympus"))
            .unwrap_err()
            .contains("not a time zone"));

        let nine = cron_schedule("0 9 * * *").expect("daily at nine");
        assert_eq!(
            next_run(
                &nine,
                Some(chrono_tz::Europe::Berlin),
                utc("2026-01-15T00:00:00Z")
            ),
            Some(utc("2026-01-15T08:00:00Z")),
            "09:00 in Berlin in January is 08:00 UTC"
        );
    }

    #[test]
    fn a_task_set_to_run_once_runs_at_that_time_and_never_again() {
        let at = utc("2026-01-16T14:00:00Z");
        let once = stored(json!({
            "type": "once",
            "runAt": at.timestamp_millis(),
            "interval": "daily",
            "timezone": NEW_YORK
        }));

        assert!(once.is_once());
        assert_eq!(once.interval, None, "a stale repeat is not kept");
        assert_eq!(once.expression(), None);
        assert_eq!(once.next_after(a_winter_morning()), Some(at));
        assert_eq!(once.next_after(at), None);
        assert_eq!(
            once.summary(),
            "once at 2026-01-16 09:00 (America/New_York)"
        );
    }

    #[test]
    fn each_repeat_the_form_offers_runs_on_the_wall_clock_of_its_zone() {
        let hourly =
            stored(json!({ "type": "recurring", "interval": "hourly", "timezone": NEW_YORK }));
        assert_eq!(
            hourly.next_after(utc("2026-01-15T12:10:00Z")),
            Some(utc("2026-01-15T13:00:00Z"))
        );

        let daily = stored(json!({
            "type": "recurring", "interval": "daily", "timeOfDay": "09:00", "timezone": NEW_YORK
        }));
        assert_eq!(daily.expression().as_deref(), Some("0 9 * * *"));
        assert_eq!(
            daily.next_after(a_winter_morning()),
            Some(utc("2026-01-15T14:00:00Z"))
        );
        assert_eq!(
            daily.next_after(utc("2026-01-15T14:00:00Z")),
            Some(utc("2026-01-16T14:00:00Z"))
        );
        assert_eq!(
            daily.next_after(utc("2026-07-01T00:00:00Z")),
            Some(utc("2026-07-01T13:00:00Z")),
            "09:00 stays 09:00 when the clocks change"
        );

        let weekly = stored(json!({
            "type": "recurring", "interval": "weekly", "timeOfDay": "17:30", "weekday": 5,
            "timezone": NEW_YORK
        }));
        assert_eq!(weekly.expression().as_deref(), Some("30 17 * * 5"));
        assert_eq!(
            weekly.next_after(a_winter_morning()),
            Some(utc("2026-01-16T22:30:00Z"))
        );
        assert_eq!(weekly.summary(), "every Friday at 17:30 (America/New_York)");

        let monthly = stored(json!({
            "type": "recurring", "interval": "monthly", "timeOfDay": "08:15", "dayOfMonth": 3,
            "timezone": NEW_YORK
        }));
        assert_eq!(
            monthly.next_after(a_winter_morning()),
            Some(utc("2026-02-03T13:15:00Z"))
        );
    }

    #[test]
    fn a_repeat_with_nothing_else_stated_gets_the_defaults_written_out() {
        let daily = stored(json!({ "type": "recurring", "interval": "daily" }));
        assert_eq!(daily.time_of_day.as_deref(), Some("09:00"));
        assert_eq!(daily.timezone, None);

        let weekly =
            stored(json!({ "type": "recurring", "interval": "weekly", "timezone": NEW_YORK }));
        assert_eq!(weekly.weekday, Some(1));
        assert_eq!(
            weekly.next_after(a_winter_morning()),
            Some(utc("2026-01-19T14:00:00Z")),
            "Monday at 09:00 in New York"
        );

        let monthly = stored(json!({ "type": "recurring", "interval": "monthly" }));
        assert_eq!(monthly.day_of_month, Some(1));
    }

    #[test]
    fn a_custom_schedule_takes_five_fields_or_six() {
        for expression in ["0 9 * * 1", "0 0 9 * * MON"] {
            let custom = stored(json!({
                "type": "recurring", "interval": "custom", "cronExpression": expression,
                "timezone": NEW_YORK
            }));
            assert_eq!(
                custom.next_after(a_winter_morning()),
                Some(utc("2026-01-19T14:00:00Z")),
                "{expression}"
            );
        }
    }

    #[test]
    fn a_clock_change_neither_drops_a_run_nor_repeats_it() {
        let schedule = |time: &str| {
            stored(json!({
                "type": "recurring", "interval": "daily", "timeOfDay": time, "timezone": NEW_YORK
            }))
        };

        assert_eq!(
            schedule("02:30").next_after(utc("2026-03-08T05:00:00Z")),
            Some(utc("2026-03-08T07:30:00Z")),
            "02:30 does not exist the night the clocks go forward, so it runs at 03:30"
        );

        let repeated_hour = schedule("01:30");
        let first_pass = utc("2026-11-01T05:30:00Z");
        assert_eq!(
            repeated_hour.next_after(utc("2026-11-01T04:00:00Z")),
            Some(first_pass)
        );
        assert_eq!(
            repeated_hour.next_after(first_pass + Duration::seconds(5)),
            Some(utc("2026-11-02T06:30:00Z")),
            "the second 01:30 that night is not another run"
        );
    }

    #[test]
    fn a_schedule_that_cannot_be_stored_is_refused_with_the_reason() {
        let past = a_winter_morning() - Duration::hours(1);
        for (schedule, reason) in [
            (json!({ "type": "once" }), "needs a date and time"),
            (
                json!({ "type": "once", "runAt": past.timestamp_millis() }),
                "in the future",
            ),
            (json!({ "type": "recurring" }), "how often"),
            (
                json!({ "type": "recurring", "interval": "custom" }),
                "needs a cron expression",
            ),
            (
                json!({ "type": "recurring", "interval": "custom", "cronExpression": "* * * * *" }),
                "more often than every 5 minutes",
            ),
            (
                json!({ "type": "recurring", "interval": "custom", "cronExpression": "soon" }),
                "not a schedule this app can read",
            ),
            (
                json!({ "type": "recurring", "interval": "daily", "timeOfDay": "9am" }),
                "not a time of day",
            ),
            (
                json!({ "type": "recurring", "interval": "weekly", "weekday": 9 }),
                "day of the week",
            ),
            (
                json!({ "type": "recurring", "interval": "monthly", "dayOfMonth": 31 }),
                "day 1 to 28",
            ),
            (
                json!({ "type": "recurring", "interval": "daily", "timezone": "Mars/Olympus" }),
                "not a time zone",
            ),
            (
                json!({ "type": "recurring", "interval": "fortnightly" }),
                "cannot be saved",
            ),
            (
                json!({ "type": "recurring", "interval": "daily", "every": 2 }),
                "cannot be saved",
            ),
        ] {
            let refused = refusal(schedule.clone());
            assert!(refused.contains(reason), "{schedule}: {refused}");
        }
    }

    #[test]
    fn a_reminder_for_tomorrow_at_nine_fires_at_nine_in_the_zone_it_was_asked_in() {
        let zone: chrono_tz::Tz = NEW_YORK.parse().expect("zone");
        let now = a_winter_morning().with_timezone(&zone);

        let parsed = parse_schedule_at("tomorrow at 9", &now).expect("parsed");
        let reminder = TaskSchedule::from_parsed(&parsed, now.naive_local())
            .and_then(|schedule| schedule.in_timezone(NEW_YORK).checked(a_winter_morning()))
            .expect("stored");

        assert!(reminder.is_once());
        assert_eq!(
            reminder.next_after(a_winter_morning()),
            Some(utc("2026-01-16T14:00:00Z"))
        );
    }

    #[test]
    fn every_monday_at_nine_fires_on_monday_at_nine_in_its_zone() {
        let zone: chrono_tz::Tz = NEW_YORK.parse().expect("zone");
        let now = a_winter_morning().with_timezone(&zone);

        for phrase in ["every Monday 9am", "every monday at 9am"] {
            let parsed = parse_schedule_at(phrase, &now).expect("parsed");
            let weekly = TaskSchedule::from_parsed(&parsed, now.naive_local())
                .and_then(|schedule| schedule.in_timezone(NEW_YORK).checked(a_winter_morning()))
                .expect("stored");

            assert_eq!(
                weekly.expression().as_deref(),
                Some("0 9 * * 1"),
                "{phrase}"
            );
            assert_eq!(
                weekly.next_after(a_winter_morning()),
                Some(utc("2026-01-19T14:00:00Z")),
                "{phrase}"
            );
        }
    }

    #[test]
    fn an_interval_becomes_a_schedule_only_when_the_clock_can_keep_it_exactly() {
        let now = a_winter_morning().naive_utc();
        let every = |seconds: i64| interval_expression(Duration::seconds(seconds), now);

        assert_eq!(every(15 * 60).as_deref(), Ok("*/15 * * * *"));
        assert_eq!(every(3600).as_deref(), Ok("0 * * * *"));
        assert_eq!(every(2 * 3600).as_deref(), Ok("0 */2 * * *"));
        assert_eq!(every(SECONDS_PER_DAY).as_deref(), Ok("0 12 * * *"));
        assert_eq!(every(7 * SECONDS_PER_DAY).as_deref(), Ok("0 12 * * 4"));

        for refused in [1, 60, 45 * 60, 90 * 60, 5 * 3600, 2 * SECONDS_PER_DAY] {
            assert!(every(refused).is_err(), "{refused} seconds");
        }
    }
}

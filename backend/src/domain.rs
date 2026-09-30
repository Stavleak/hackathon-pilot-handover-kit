use chrono::{DateTime, NaiveDate};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Data {
    experiments: Vec<Experiment>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Experiment {
    id: String,
    title: String,
    hypothesis: String,
    scenario: String,
    baseline_method: String,
    limitations: String,
    planned_per_phase: u32,
    minimum_successes: u32,
    limit_seconds: u32,
    stop_rule: String,
    process_owner: String,
    technical_owner: String,
    review_date: String,
    owners_accepted: bool,
    scope_evidence: String,
    scope_accepted_at: String,
    observations: Vec<Observation>,
    decision: Option<Decision>,
    handover: Option<Handover>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Phase { Baseline, Prototype }

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum ObservationStatus { Completed, Failed, NotStarted }

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Observation {
    id: String,
    task_id: String,
    phase: Phase,
    status: ObservationStatus,
    elapsed_seconds: u32,
    stop_triggered: bool,
    observed_at: String,
    evidence: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
enum Outcome { Continue, Stop, Iterate }

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Decision {
    outcome: Outcome,
    rationale: String,
    evidence: String,
    decided_at: String,
    next_action: String,
    deadline: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Handover {
    owner: String,
    accepted_at: String,
    time_limit_minutes: u32,
    evidence: String,
    voluntary: bool,
}

#[derive(Default, Serialize)]
struct Counts { planned: u32, started: u32, completed: u32, failed: u32, not_started: u32 }

fn parse(value: &Value) -> Result<Data, String> {
    serde_json::from_value(value.clone()).map_err(|_| "Проверьте структуру данных: неизвестные поля и неверные типы не принимаются".into())
}

fn text(value: &str, label: &str, maximum: usize) -> Result<(), String> {
    if value.trim().is_empty() || value.chars().count() > maximum || value.chars().any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t')) {
        return Err(format!("{label}: заполните поле (до {maximum} символов)"));
    }
    Ok(())
}

fn identifier(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 64 || !value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')) {
        return Err("ID должен содержать 1–64 латинских букв, цифр, дефисов или подчёркиваний".into());
    }
    Ok(())
}

fn timestamp(value: &str) -> Result<DateTime<chrono::FixedOffset>, String> {
    DateTime::parse_from_rfc3339(value).map_err(|_| "Укажите корректное время с часовым поясом".into())
}

fn date(value: &str) -> Result<NaiveDate, String> {
    if value.len() != 10 { return Err("Укажите дату YYYY-MM-DD".into()); }
    NaiveDate::parse_from_str(value, "%Y-%m-%d").map_err(|_| "Укажите существующую дату YYYY-MM-DD".into())
}

fn counts(experiment: &Experiment, phase: Phase) -> Counts {
    let mut result = Counts { planned: experiment.planned_per_phase, ..Counts::default() };
    for observation in experiment.observations.iter().filter(|o| o.phase == phase) {
        match observation.status {
            ObservationStatus::Completed => { result.started += 1; result.completed += 1; }
            ObservationStatus::Failed => { result.started += 1; result.failed += 1; }
            ObservationStatus::NotStarted => result.not_started += 1,
        }
    }
    result
}

fn stopped(experiment: &Experiment) -> bool {
    experiment.observations.iter().any(|observation| observation.stop_triggered)
}

fn can_continue(experiment: &Experiment) -> bool {
    let baseline = counts(experiment, Phase::Baseline);
    let prototype = counts(experiment, Phase::Prototype);
    experiment.owners_accepted && !stopped(experiment)
        && baseline.started == experiment.planned_per_phase
        && prototype.started == experiment.planned_per_phase
        && prototype.completed >= experiment.minimum_successes
        && prototype.completed >= baseline.completed
}

pub fn default_data() -> Value { json!({"experiments": []}) }

pub fn validate(value: &Value) -> Result<(), String> {
    let data = parse(value)?;
    if data.experiments.len() > 100 { return Err("Не более 100 экспериментов в одном наборе".into()); }
    let mut ids = HashSet::new();
    for experiment in &data.experiments {
        identifier(&experiment.id)?;
        if !ids.insert(&experiment.id) { return Err("ID экспериментов должны быть уникальны".into()); }
        for (label, value, maximum) in [
            ("Название", &experiment.title, 160), ("Гипотеза", &experiment.hypothesis, 2000),
            ("Сценарий", &experiment.scenario, 2000), ("Baseline", &experiment.baseline_method, 2000),
            ("Ограничения", &experiment.limitations, 2000), ("Stop-rule", &experiment.stop_rule, 2000),
            ("Владелец процесса", &experiment.process_owner, 160), ("Технический владелец", &experiment.technical_owner, 160),
        ] { text(value, label, maximum)?; }
        date(&experiment.review_date)?;
        if !(1..=500).contains(&experiment.planned_per_phase)
            || !(1..=experiment.planned_per_phase).contains(&experiment.minimum_successes)
            || !(1..=86400).contains(&experiment.limit_seconds) {
            return Err("План: 1–500 попыток каждой фазы; порог: 1–N; лимит: 1–86400 секунд".into());
        }
        let scope_time = if experiment.owners_accepted {
            text(&experiment.scope_evidence, "Подтверждение добровольного участия владельцев", 2000)?;
            Some(timestamp(&experiment.scope_accepted_at)?)
        } else {
            if !experiment.scope_evidence.is_empty() || !experiment.scope_accepted_at.is_empty() {
                return Err("Непринятый объём не должен содержать запись принятия".into());
            }
            None
        };
        let mut observation_ids = HashSet::new();
        let mut tasks = HashSet::new();
        let mut previous_time = None;
        let mut stop_seen = false;
        for observation in &experiment.observations {
            identifier(&observation.id)?;
            identifier(&observation.task_id)?;
            if !observation_ids.insert(&observation.id) || !tasks.insert((observation.phase as u8, &observation.task_id)) {
                return Err("ID наблюдений и задания внутри каждой фазы должны быть уникальны".into());
            }
            text(&observation.evidence, "Наблюдение и источник", 2000)?;
            let observed_at = timestamp(&observation.observed_at)?;
            if previous_time.is_some_and(|previous| observed_at < previous) { return Err("Наблюдения записываются в хронологическом порядке".into()); }
            previous_time = Some(observed_at);
            if observation.elapsed_seconds > 86400 { return Err("Время попытки не может превышать 86400 секунд".into()); }
            match observation.status {
                ObservationStatus::NotStarted => {
                    if observation.elapsed_seconds != 0 { return Err("Для неначатого задания время равно нулю".into()); }
                }
                ObservationStatus::Completed | ObservationStatus::Failed => {
                    let Some(accepted_at) = scope_time else { return Err("Сначала подтвердите добровольное согласие двух владельцев на объём".into()); };
                    if observed_at < accepted_at || observation.elapsed_seconds == 0 {
                        return Err("Начатая попытка требует времени больше нуля и согласия владельцев до неё".into());
                    }
                    if stop_seen { return Err("После stop-rule новые попытки не начинаются".into()); }
                }
            }
            if observation.status == ObservationStatus::Completed
                && (observation.stop_triggered || observation.elapsed_seconds > experiment.limit_seconds) {
                return Err("Нарушение stop-rule или тайм-аут не являются успешным завершением".into());
            }
            stop_seen |= observation.stop_triggered;
        }
        for phase in [Phase::Baseline, Phase::Prototype] {
            let c = counts(experiment, phase);
            if c.started + c.not_started > experiment.planned_per_phase {
                return Err("Число заданий фазы превышает план; заведите новый эксперимент для новой выборки".into());
            }
        }
        if let Some(decision) = &experiment.decision {
            text(&decision.rationale, "Обоснование решения", 2000)?;
            text(&decision.evidence, "Доказательства решения", 2000)?;
            text(&decision.next_action, "Следующее действие", 2000)?;
            let decided_at = timestamp(&decision.decided_at)?;
            if previous_time.is_some_and(|previous| decided_at < previous)
                || scope_time.is_some_and(|accepted_at| decided_at < accepted_at) {
                return Err("Решение не может предшествовать согласию и наблюдениям".into());
            }
            if date(&decision.deadline)? < decided_at.date_naive() { return Err("Дедлайн следующего действия не может предшествовать решению".into()); }
            if stop_seen && decision.outcome != Outcome::Stop { return Err("Stop-rule имеет приоритет: допустимо только решение stop".into()); }
            if decision.outcome == Outcome::Continue && !can_continue(experiment) {
                return Err("Continue требует полного объёма обеих фаз, порога, результата не хуже baseline и отсутствия stop-rule".into());
            }
        }
        if let Some(handover) = &experiment.handover {
            let Some(decision) = &experiment.decision else { return Err("Принятие следующего действия возможно после закрытого решения".into()); };
            text(&handover.owner, "Владелец следующего действия", 160)?;
            text(&handover.evidence, "Подтверждение принятия", 2000)?;
            if !handover.voluntary || !(1..=10080).contains(&handover.time_limit_minutes) {
                return Err("Нужно явное добровольное согласие на 1–10080 минут работы".into());
            }
            if timestamp(&handover.accepted_at)? < timestamp(&decision.decided_at)? {
                return Err("Принятие следующего действия не может предшествовать решению".into());
            }
        }
    }
    Ok(())
}

fn configuration(experiment: &Experiment) -> Experiment {
    let mut copy = experiment.clone();
    copy.observations.clear();
    copy.decision = None;
    copy.handover = None;
    copy
}

pub fn validate_update(previous: &Value, next: &Value) -> Result<(), String> {
    validate(next)?;
    let previous = parse(previous)?;
    let next = parse(next)?;
    for old in &previous.experiments {
        let Some(new) = next.experiments.iter().find(|experiment| experiment.id == old.id) else {
            return Err("Сохранённые эксперименты нельзя удалять: сохраните историю и создайте новую карточку".into());
        };
        if (old.owners_accepted || !old.observations.is_empty() || old.decision.is_some()) && configuration(old) != configuration(new) {
            return Err("Принятый объём и критерии после первого наблюдения неизменяемы".into());
        }
        if new.observations.len() < old.observations.len()
            || !old.observations.iter().zip(&new.observations).all(|(a, b)| a == b) {
            return Err("Сохранённые наблюдения и доказательства нельзя удалить или переписать".into());
        }
        if old.decision.is_some() && (old.decision != new.decision || old.observations != new.observations) {
            return Err("Закрытое решение и его наблюдения неизменяемы; начните новый эксперимент".into());
        }
        if old.handover.is_some() && old.handover != new.handover {
            return Err("Принятое следующее действие нельзя удалить или переписать".into());
        }
    }
    Ok(())
}

pub fn analyze(value: &Value) -> Value {
    let Ok(data) = parse(value) else { return json!({"experiments": []}); };
    json!({"experiments": data.experiments.iter().map(|experiment| {
        let eligible = can_continue(experiment);
        let stop = stopped(experiment);
        let status = if experiment.handover.is_some() { "accepted" }
            else if experiment.decision.is_some() { "waiting_handover" }
            else if stop { "must_stop" }
            else if eligible { "ready" }
            else if experiment.observations.is_empty() { if experiment.owners_accepted { "planned" } else { "draft" } }
            else { "observing" };
        json!({"id":experiment.id,"baseline":counts(experiment,Phase::Baseline),
            "prototype":counts(experiment,Phase::Prototype),"stop_triggered":stop,
            "can_continue":eligible,"status":status})
    }).collect::<Vec<_>>()})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn experiment() -> Value {
        json!({"id":"E1","title":"Тестовый сценарий","hypothesis":"Без помощи заполнить карточку",
            "scenario":"Синтетическая карточка","baseline_method":"Текстовый шаблон","limitations":"Учебная малая выборка",
            "planned_per_phase":2,"minimum_successes":2,"limit_seconds":120,"stop_rule":"Неверный обязательный маршрут",
            "process_owner":"Координатор","technical_owner":"Разработчик","review_date":"2026-10-07",
            "owners_accepted":true,"scope_evidence":"Обе роли добровольно согласовали одну сессию",
            "scope_accepted_at":"2026-10-07T09:00:00+05:00","observations":[],"decision":null,"handover":null})
    }
    fn observation(id: &str, phase: &str, status: &str, stop: bool) -> Value {
        json!({"id":id,"task_id":id,"phase":phase,"status":status,"elapsed_seconds":if status=="not_started"{0}else{60},
            "stop_triggered":stop,"observed_at":"2026-10-07T10:00:00+05:00","evidence":"Тестовое наблюдение"})
    }
    fn decision(outcome: &str) -> Value {
        json!({"outcome":outcome,"rationale":"Результат по выбранному порогу","evidence":"Строки наблюдений",
            "decided_at":"2026-10-07T11:00:00+05:00","next_action":"Согласовать один следующий этап","deadline":"2026-10-09"})
    }
    fn complete() -> Value {
        let mut e = experiment();
        e["observations"] = json!([observation("B1","baseline","completed",false),observation("B2","baseline","failed",false),
            observation("P1","prototype","completed",false),observation("P2","prototype","completed",false)]);
        json!({"experiments":[e]})
    }

    #[test]
    fn not_started_is_reported_but_excluded_from_denominator() {
        let mut e = experiment();
        e["observations"] = json!([observation("P1","prototype","failed",false),observation("P2","prototype","not_started",false)]);
        let value = json!({"experiments":[e]});
        validate(&value).unwrap();
        let report = analyze(&value);
        assert_eq!(report["experiments"][0]["prototype"]["started"],1);
        assert_eq!(report["experiments"][0]["prototype"]["completed"],0);
        assert_eq!(report["experiments"][0]["prototype"]["not_started"],1);
        assert_eq!(report["experiments"][0]["can_continue"],false);
    }
    #[test]
    fn stop_rule_overrides_continue_and_prevents_new_started_attempts() {
        let mut value = complete();
        value["experiments"][0]["observations"][3]["status"] = json!("failed");
        value["experiments"][0]["observations"][3]["stop_triggered"] = json!(true);
        value["experiments"][0]["decision"] = decision("continue");
        assert!(validate(&value).is_err());
        value["experiments"][0]["decision"] = decision("iterate");
        assert!(validate(&value).is_err());
        value["experiments"][0]["decision"] = decision("stop");
        validate(&value).unwrap();
        value["experiments"][0]["decision"] = Value::Null;
        value["experiments"][0]["planned_per_phase"] = json!(3);
        value["experiments"][0]["observations"].as_array_mut().unwrap().push(observation("P3","prototype","completed",false));
        assert!(validate(&value).is_err());
    }
    #[test]
    fn continue_requires_full_baseline_and_threshold() {
        let mut value = complete();
        value["experiments"][0]["decision"] = decision("continue");
        validate(&value).unwrap();
        value["experiments"][0]["observations"][1] = observation("B2","baseline","not_started",false);
        assert!(validate(&value).is_err());
    }
    #[test]
    fn saved_evidence_criteria_and_decisions_cannot_be_rewritten() {
        let old = complete();
        let mut next = old.clone();
        next["experiments"][0]["observations"][0]["evidence"] = json!("Новая версия прошлого");
        assert!(validate_update(&old,&next).is_err());
        next = old.clone();
        next["experiments"][0]["minimum_successes"] = json!(1);
        assert!(validate_update(&old,&next).is_err());
        let mut closed = old.clone();
        closed["experiments"][0]["decision"] = decision("continue");
        validate_update(&old,&closed).unwrap();
        assert!(validate_update(&closed,&old).is_err());
        assert!(validate_update(&closed,&default_data()).is_err());
    }
    #[test]
    fn accepted_handover_is_voluntary_bounded_and_immutable() {
        let mut old = complete();
        old["experiments"][0]["decision"] = decision("continue");
        let mut next = old.clone();
        next["experiments"][0]["handover"] = json!({"owner":"Координатор","accepted_at":"2026-10-07T12:00:00+05:00",
            "time_limit_minutes":60,"evidence":"Владелец добровольно подтвердил один этап","voluntary":false});
        assert!(validate(&next).is_err());
        next["experiments"][0]["handover"]["voluntary"] = json!(true);
        validate_update(&old,&next).unwrap();
        assert!(validate_update(&next,&old).is_err());
        assert_eq!(analyze(&next)["experiments"][0]["status"],"accepted");
    }
    #[test]
    fn unknown_fields_dates_and_unaccepted_started_attempts_are_rejected() {
        let mut value = complete();
        value["experiments"][0]["observations"][0]["extra"] = json!(true);
        assert!(validate(&value).is_err());
        value = complete();
        value["experiments"][0]["review_date"] = json!("2026-02-30");
        assert!(validate(&value).is_err());
        value = complete();
        value["experiments"][0]["owners_accepted"] = json!(false);
        value["experiments"][0]["scope_evidence"] = json!("");
        value["experiments"][0]["scope_accepted_at"] = json!("");
        assert!(validate(&value).is_err());
    }
}

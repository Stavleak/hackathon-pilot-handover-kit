'use client';

import { useState, type FormEvent } from 'react';
import { AppShell, Button, Field, Panel, Status } from './ui';
import { useWorkbench } from './use-workbench';
import {
  fictionalExample, isoTime, localNow, observationLabels, outcomeLabels, phaseLabels, workflowLabels,
  type Analysis, type Data, type Decision, type Experiment, type ExperimentAnalysis, type Handover,
  type Observation, type ObservationStatus, type Outcome, type Plan,
} from './domain';

function value(form: FormData, key: string): string { return String(form.get(key) ?? '').trim(); }

function PlanForm({ initial, disabled, onSave, onCancel }: {
  initial: Experiment | null; disabled: boolean; onSave: (plan: Plan) => Promise<boolean>; onCancel: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const plan: Plan = {
      title: value(form, 'title'), hypothesis: value(form, 'hypothesis'), scenario: value(form, 'scenario'),
      baseline_method: value(form, 'baseline_method'), limitations: value(form, 'limitations'), stop_rule: value(form, 'stop_rule'),
      process_owner: value(form, 'process_owner'), technical_owner: value(form, 'technical_owner'), review_date: value(form, 'review_date'),
      planned_per_phase: Number(value(form, 'planned_per_phase')), minimum_successes: Number(value(form, 'minimum_successes')),
      limit_seconds: Number(value(form, 'limit_seconds')),
    };
    if (await onSave(plan)) element.reset();
  }
  return <form className="stack" onSubmit={submit}>
    <Field label="Название проекта и проверки" name="title" required maxLength={160} defaultValue={initial?.title} />
    <label className="field"><span>Гипотеза: кто, какое действие и что её опровергнет</span><textarea name="hypothesis" required maxLength={2000} defaultValue={initial?.hypothesis} /></label>
    <div className="form-grid">
      <label className="field"><span>Один сценарий: безопасный вход и корректный выход</span><textarea name="scenario" required maxLength={2000} defaultValue={initial?.scenario} /></label>
      <label className="field"><span>Baseline: прежний способ и сопоставимость заданий</span><textarea name="baseline_method" required maxLength={2000} defaultValue={initial?.baseline_method} /></label>
    </div>
    <label className="field"><span>Границы вывода, данные и ограничения</span><textarea name="limitations" required maxLength={2000} defaultValue={initial?.limitations} /></label>
    <div className="form-grid">
      <Field label="Плановый объём каждой фазы" name="planned_per_phase" type="number" min={1} max={500} required defaultValue={initial?.planned_per_phase ?? 6} hint="Одинаковое N для baseline и прототипа. Неначатые задания не входят в знаменатель." />
      <Field label="Минимум успехов прототипа" name="minimum_successes" type="number" min={1} max={500} required defaultValue={initial?.minimum_successes ?? 5} hint="Порог X из N; также требуется результат не хуже baseline." />
      <Field label="Лимит одной попытки, секунд" name="limit_seconds" type="number" min={1} max={86400} required defaultValue={initial?.limit_seconds ?? 480} />
    </div>
    <label className="field"><span>Stop-rule: наблюдаемый триггер и возврат к прежнему порядку</span><textarea name="stop_rule" required maxLength={2000} defaultValue={initial?.stop_rule} /></label>
    <div className="form-grid">
      <Field label="Владелец процесса: согласующая роль" name="process_owner" required maxLength={160} defaultValue={initial?.process_owner} />
      <Field label="Технический владелец: роль" name="technical_owner" required maxLength={160} defaultValue={initial?.technical_owner} />
      <Field label="Дата разбора" name="review_date" type="date" required defaultValue={initial?.review_date ?? localNow().slice(0, 10)} />
    </div>
    <p className="muted">Успех — корректный выход без помощи до лимита. Ошибки, помощь, тайм-аут и начатая прерванная попытка остаются в знаменателе. До первой попытки нужно добровольное согласие владельцев; после него критерии фиксируются.</p>
    <div className="actions"><Button type="submit" disabled={disabled}>{initial ? 'Сохранить план' : 'Создать эксперимент'}</Button><Button type="button" variant="secondary" onClick={onCancel} disabled={disabled}>Закрыть форму</Button></div>
  </form>;
}

function ScopeForm({ disabled, onSave }: { disabled: boolean; onSave: (evidence: string, at: string) => Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('voluntary') !== 'on') return;
    await onSave(value(form, 'evidence'), isoTime(value(form, 'at')));
  }
  return <form onSubmit={submit} className="stack">
    <p>Уточните согласие обеих ролей на этот сценарий, объём и время. Запись фиксирует вашу договорённость; приложение не подтверждает личность владельца.</p>
    <Field label="Когда владельцы согласовали объём (местное время браузера)" name="at" type="datetime-local" required defaultValue={localNow()} />
    <label className="field"><span>Подтверждение: что согласовали и где это можно проверить</span><textarea name="evidence" required maxLength={2000} /></label>
    <label className="checkbox"><input type="checkbox" name="voluntary" required /><span>Оба владельца добровольно согласились; участники не обязаны продолжать после хакатона</span></label>
    <Button type="submit" disabled={disabled}>Зафиксировать согласие и критерии</Button>
  </form>;
}

function ObservationForm({ experiment, report, disabled, onSave }: {
  experiment: Experiment; report: ExperimentAnalysis; disabled: boolean; onSave: (observation: Observation) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<ObservationStatus>('completed');
  const [seconds, setSeconds] = useState('60');
  const chosenStatus = report.stop_triggered ? 'not_started' : status;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const observation: Observation = {
      id: crypto.randomUUID(), task_id: value(form, 'task_id'), phase: value(form, 'phase') === 'baseline' ? 'baseline' : 'prototype',
      status: chosenStatus, elapsed_seconds: chosenStatus === 'not_started' ? 0 : Number(value(form, 'elapsed_seconds')),
      stop_triggered: form.get('stop_triggered') === 'on', observed_at: isoTime(value(form, 'observed_at')), evidence: value(form, 'evidence'),
    };
    if (await onSave(observation)) element.reset();
  }
  return <form onSubmit={submit} className="stack">
    {report.stop_triggered && <p role="status">Stop-rule сработало. Новые попытки запрещены; можно записать только отмену неначатых заданий и решение stop.</p>}
    <div className="form-grid">
      <Field label="ID задания" name="task_id" required maxLength={64} pattern="[A-Za-z0-9_-]+" hint="Без ID человека. Один ID на фазу; для парных задач повторите его в другой фазе." />
      <label className="field"><span>Фаза</span><select name="phase" defaultValue="baseline"><option value="baseline">Baseline</option><option value="prototype">Прототип</option></select></label>
      <label className="field"><span>Исход попытки</span><select value={chosenStatus} onChange={event => {
        const next = event.target.value;
        setStatus(next === 'failed' || next === 'not_started' ? next : 'completed');
      }} disabled={report.stop_triggered}>
        <option value="completed">Корректно без помощи</option><option value="failed">Ошибка / помощь / тайм-аут</option><option value="not_started">Не начато</option>
      </select></label>
      <Field label="Измеренное время, секунд" name="elapsed_seconds" type="number" required min={chosenStatus === 'not_started' ? 0 : 1} max={chosenStatus === 'completed' ? experiment.limit_seconds : 86400} value={chosenStatus === 'not_started' ? '0' : seconds} onChange={event => setSeconds(event.target.value)} readOnly={chosenStatus === 'not_started'} />
      <Field label="Время наблюдения (местное время браузера)" name="observed_at" type="datetime-local" required defaultValue={localNow()} />
    </div>
    <label className="field"><span>Что наблюдали и источник доказательства</span><textarea name="evidence" required maxLength={2000} placeholder="Фактический выход; помощь или причина отмены; ссылка/ID безопасной закрытой записи. Не вставляйте секреты и рабочие документы." /></label>
    <label className="checkbox"><input type="checkbox" name="stop_triggered" /><span>Сработало заранее выбранное stop-rule</span></label>
    <p className="muted">Сохранённое наблюдение неизменяемо. Неудачную попытку не удаляем; исправления проверяем в новом эксперименте.</p>
    <Button type="submit" disabled={disabled}>Добавить наблюдение</Button>
  </form>;
}

function DecisionForm({ report, disabled, onSave }: { report: ExperimentAnalysis; disabled: boolean; onSave: (decision: Decision) => Promise<boolean> }) {
  const [outcome, setOutcome] = useState<Outcome>('iterate');
  const chosenOutcome = report.stop_triggered ? 'stop' : outcome === 'continue' && !report.can_continue ? 'iterate' : outcome;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!window.confirm('Закрыть этот эксперимент? Решение, критерии и наблюдения останутся неизменяемыми. Следующий шаг принимает владелец отдельно.')) return;
    await onSave({ outcome: chosenOutcome, rationale: value(form, 'rationale'), evidence: value(form, 'evidence'),
      decided_at: isoTime(value(form, 'decided_at')), next_action: value(form, 'next_action'), deadline: value(form, 'deadline') });
  }
  return <form onSubmit={submit} className="stack">
    <label className="field"><span>Решение</span><select value={chosenOutcome} onChange={event => {
      const next = event.target.value;
      setOutcome(next === 'continue' || next === 'stop' ? next : 'iterate');
    }}><option value="continue" disabled={!report.can_continue || report.stop_triggered}>{outcomeLabels.continue}</option>
      <option value="stop">{outcomeLabels.stop}</option><option value="iterate" disabled={report.stop_triggered}>{outcomeLabels.iterate}</option></select></label>
    <p className="muted">Continue требует полного N начатых попыток обеих фаз, порога и результата не хуже baseline. Одно stop-rule имеет приоритет. Неполная выборка не доказывает пользу. Продолжение пока не означает принятие следующего объёма владельцем.</p>
    <label className="field"><span>Обоснование и границы вывода</span><textarea name="rationale" required maxLength={2000} /></label>
    <label className="field"><span>Доказательства решения: ID наблюдений и источник</span><textarea name="evidence" required maxLength={2000} /></label>
    <Field label="Следующее конкретное действие (включая возврат при stop)" name="next_action" required maxLength={2000} />
    <div className="form-grid"><Field label="Когда принято решение (местное время браузера)" name="decided_at" type="datetime-local" required defaultValue={localNow()} />
      <Field label="Дедлайн следующего действия" name="deadline" type="date" required defaultValue={localNow().slice(0, 10)} /></div>
    <Button type="submit" disabled={disabled} variant={chosenOutcome === 'stop' ? 'danger' : 'primary'}>Закрыть эксперимент и сохранить решение</Button>
  </form>;
}

function HandoverForm({ disabled, onSave }: { disabled: boolean; onSave: (handover: Handover) => Promise<boolean> }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave({ owner: value(form, 'owner'), accepted_at: isoTime(value(form, 'accepted_at')),
      time_limit_minutes: Number(value(form, 'time_limit_minutes')), evidence: value(form, 'evidence'), voluntary: form.get('voluntary') === 'on' });
  }
  return <form onSubmit={submit} className="stack">
    <p>Укажите того, кто добровольно принимает сохранённое следующее действие до его дедлайна. При stop это может быть выключение прототипа и возврат. Запись не создаёт договор и не передаёт права.</p>
    <div className="form-grid"><Field label="Согласившийся владелец следующего действия" name="owner" required maxLength={160} />
      <Field label="Когда владелец принял действие (местное время браузера)" name="accepted_at" type="datetime-local" required defaultValue={localNow()} />
      <Field label="Согласованный предел работы, минут" name="time_limit_minutes" type="number" min={1} max={10080} required /></div>
    <label className="field"><span>Подтверждение владельца и согласованный объём</span><textarea name="evidence" required maxLength={2000} /></label>
    <label className="checkbox"><input name="voluntary" type="checkbox" required /><span>Владелец явно и добровольно принял это действие и предел времени</span></label>
    <Button type="submit" disabled={disabled}>Зафиксировать принятие следующего шага</Button>
  </form>;
}

export default function Workbench() {
  const { data, analysis, revision, loading, saving, error, conflict, save, reload } = useWorkbench<Data, Analysis>();
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const selected = data?.experiments.find(experiment => experiment.id === selectedId) ?? data?.experiments[0] ?? null;
  const report = analysis?.experiments.find(result => result.id === selected?.id) ?? null;
  const disabled = saving || conflict || loading;

  async function update(experiment: Experiment): Promise<boolean> {
    if (!data || disabled) return false;
    const success = await save({ experiments: data.experiments.map(current => current.id === experiment.id ? experiment : current) });
    if (success) setNotice('Сохранено в рабочем наборе.');
    return success;
  }
  async function savePlan(plan: Plan): Promise<boolean> {
    if (!data || disabled) return false;
    const experiment: Experiment = editing && selected ? { ...selected, ...plan } : {
      ...plan, id: crypto.randomUUID(), owners_accepted: false, scope_evidence: '', scope_accepted_at: '', observations: [], decision: null, handover: null,
    };
    const success = editing ? await update(experiment) : await save({ experiments: [...data.experiments, experiment] });
    if (success) { setSelectedId(experiment.id); setCreating(false); setEditing(false); setNotice('План сохранён. Согласуйте добровольное участие владельцев до первой попытки.'); }
    return success;
  }
  async function loadExample() {
    if (!data || data.experiments.length || disabled) return;
    if (!window.confirm('Добавить явно вымышленный учебный эксперимент с вымышленными наблюдениями в пустой рабочий набор? Эти числа не являются реальными результатами.')) return;
    const example = fictionalExample();
    if (await save(example)) { setSelectedId(example.experiments[0].id); setNotice('Добавлен ВЫМЫШЛЕННЫЙ пример. Для реальных наблюдений создайте отдельный эксперимент.'); }
  }

  return <AppShell title="От прототипа к проверяемому решению" description="Согласуйте владельцев, сравните один сценарий с baseline, остановите проверку при stop-rule и передайте конкретное следующее действие." loading={loading} error={error}>
    {data && <>
      <div className="actions"><p className="muted">Сохранённая версия: {revision}</p><Button type="button" variant="secondary" disabled={disabled} onClick={() => { setCreating(true); setEditing(false); }}>Новый эксперимент</Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => { if (window.confirm('Загрузить сохранённую версию? Несохранённые поля форм будут потеряны.')) window.location.reload(); }}>Загрузить сохранённую версию</Button></div>
      {notice && <p role="status">{notice}</p>}
      {conflict && <div className="alert" role="alert">Набор изменён в другой вкладке. Скопируйте несохранённый текст, загрузите актуальную версию и повторите действие.<Button type="button" variant="secondary" onClick={() => void reload()}>Получить актуальный набор</Button></div>}
      {!data.experiments.length && <Panel title="Пока нет экспериментов"><p className="empty">Начните с одного наблюдаемого действия и безопасных данных. Рабочий набор пуст; показателей ещё нет.</p><Button type="button" variant="secondary" onClick={() => void loadExample()} disabled={disabled}>Добавить вымышленный учебный пример</Button></Panel>}
      {(creating || editing || !data.experiments.length) && <Panel title={editing ? 'Изменить непринятый план' : 'Новый ограниченный эксперимент'}>
        <PlanForm key={editing && selected ? selected.id : 'new'} initial={editing ? selected : null} disabled={disabled} onSave={savePlan} onCancel={() => { setCreating(false); setEditing(false); }} />
      </Panel>}
      {selected && report && <>
        <Panel title="Выберите эксперимент"><label className="field"><span>Сохранённые карточки</span><select value={selected.id} onChange={event => { setSelectedId(event.target.value); setEditing(false); }}>
          {data.experiments.map(experiment => <option value={experiment.id} key={experiment.id}>{experiment.title}</option>)}
        </select></label></Panel>
        <Panel title={selected.title}>
          <div className="stack"><div className="actions"><Status tone={report.stop_triggered ? 'danger' : report.can_continue ? 'success' : 'neutral'}>{workflowLabels[report.status]}</Status><span className="muted">ID: {selected.id}</span></div>
            <p><strong>Гипотеза:</strong> {selected.hypothesis}</p><p><strong>Сценарий:</strong> {selected.scenario}</p><p><strong>Baseline:</strong> {selected.baseline_method}</p><p><strong>Ограничения:</strong> {selected.limitations}</p>
            <p><strong>Stop-rule и возврат:</strong> {selected.stop_rule}</p><p>Порог: минимум {selected.minimum_successes}/{selected.planned_per_phase}, не хуже baseline; полный объём обеих фаз. Лимит: {selected.limit_seconds} секунд. Разбор: {selected.review_date}.</p>
            <p>Владельцы: {selected.process_owner} · {selected.technical_owner}.</p>
            {!selected.owners_accepted && !selected.observations.length && !selected.decision && <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setEditing(true); setCreating(false); }}>Изменить план до принятия</Button>}
            {selected.owners_accepted && <p><strong>Объём принят:</strong> {selected.scope_accepted_at}. {selected.scope_evidence}</p>}
          </div>
        </Panel>
        {!selected.owners_accepted && !selected.decision && !selected.observations.length && <Panel title="Добровольное согласие на эту проверку"><ScopeForm disabled={disabled} onSave={(evidence, at) => update({ ...selected, owners_accepted: true, scope_evidence: evidence, scope_accepted_at: at })} /></Panel>}
        <Panel title="Наблюдения и честные знаменатели">
          <div className="table-wrap"><table><caption>Счётчики из сохранённых наблюдений</caption><thead><tr><th scope="col">Фаза</th><th scope="col">План</th><th scope="col">Начато</th><th scope="col">Без помощи</th><th scope="col">Неуспех</th><th scope="col">Не начато</th></tr></thead><tbody>
            {(['baseline', 'prototype'] as const).map(phase => <tr key={phase}><th scope="row">{phaseLabels[phase]}</th><td>{report[phase].planned}</td><td>{report[phase].started}</td><td>{report[phase].completed}/{report[phase].started}</td><td>{report[phase].failed}</td><td>{report[phase].not_started}</td></tr>)}
          </tbody></table></div>
          <p className="muted">0/0 означает отсутствие начатых попыток. Знаменатель включает ошибки и помощь. Неначатые задания показаны отдельно. Маленькая выборка не доказывает внедрение или коммерческий эффект.</p>
          {selected.observations.length ? <div className="table-wrap"><table><caption>Сохранённые факты; исправления проверяются в новом эксперименте</caption><thead><tr><th scope="col">ID / задание</th><th scope="col">Фаза и исход</th><th scope="col">Время</th><th scope="col">Наблюдение и доказательство</th></tr></thead><tbody>
            {selected.observations.map(observation => <tr key={observation.id}><td>{observation.id}<br />{observation.task_id}</td><td>{phaseLabels[observation.phase]}<br />{observationLabels[observation.status]}{observation.stop_triggered && <Status tone="danger">Stop-rule</Status>}</td><td>{observation.elapsed_seconds} секунд<br />{observation.observed_at}</td><td>{observation.evidence}</td></tr>)}
          </tbody></table></div> : <p className="empty">Наблюдений ещё нет. Указывайте факты, включая неуспех и отмену.</p>}
        </Panel>
        {!selected.decision && selected.owners_accepted && <Panel title="Добавить наблюдение"><ObservationForm key={selected.id} experiment={selected} report={report} disabled={disabled} onSave={observation => update({ ...selected, observations: [...selected.observations, observation] })} /></Panel>}
        {!selected.decision ? <Panel title="Закрыть проверку решением"><DecisionForm key={selected.id} report={report} disabled={disabled} onSave={decision => update({ ...selected, decision })} /></Panel> : <Panel title="Закрытое решение">
          <div className="stack"><Status tone={selected.decision.outcome === 'stop' ? 'danger' : selected.decision.outcome === 'continue' ? 'success' : 'warning'}>{outcomeLabels[selected.decision.outcome]}</Status>
            <p><strong>Почему:</strong> {selected.decision.rationale}</p><p><strong>Доказательства:</strong> {selected.decision.evidence}</p><p>Решение: {selected.decision.decided_at}.</p>
            <p><strong>Следующее действие:</strong> {selected.decision.next_action}</p><p>Дедлайн: {selected.decision.deadline}.</p>
            <p className="muted">Закрытая запись неизменяема. Новая версия, выборка или критерий получают отдельный эксперимент.</p></div>
        </Panel>}
        {selected.decision && !selected.handover && <Panel title="Кто добровольно принимает следующий шаг"><HandoverForm key={selected.id} disabled={disabled} onSave={handover => update({ ...selected, handover })} /></Panel>}
        {selected.handover && <Panel title="Принятие следующего действия зафиксировано"><p>{selected.handover.owner} добровольно принял действие {selected.handover.accepted_at}; предел работы {selected.handover.time_limit_minutes} минут.</p><p>{selected.handover.evidence}</p><p className="muted">Это неизменяемая запись согласования ограниченного действия. Проверка следующей гипотезы требует новой карточки и согласия на её объём.</p></Panel>}
      </>}
    </>}
  </AppShell>;
}

export type Phase = 'baseline' | 'prototype';
export type ObservationStatus = 'completed' | 'failed' | 'not_started';
export type Outcome = 'continue' | 'stop' | 'iterate';

export interface Observation {
  id: string;
  task_id: string;
  phase: Phase;
  status: ObservationStatus;
  elapsed_seconds: number;
  stop_triggered: boolean;
  observed_at: string;
  evidence: string;
}

export interface Decision {
  outcome: Outcome;
  rationale: string;
  evidence: string;
  decided_at: string;
  next_action: string;
  deadline: string;
}

export interface Handover {
  owner: string;
  accepted_at: string;
  time_limit_minutes: number;
  evidence: string;
  voluntary: boolean;
}

export interface Plan {
  title: string;
  hypothesis: string;
  scenario: string;
  baseline_method: string;
  limitations: string;
  planned_per_phase: number;
  minimum_successes: number;
  limit_seconds: number;
  stop_rule: string;
  process_owner: string;
  technical_owner: string;
  review_date: string;
}

export interface Experiment extends Plan {
  id: string;
  owners_accepted: boolean;
  scope_evidence: string;
  scope_accepted_at: string;
  observations: Observation[];
  decision: Decision | null;
  handover: Handover | null;
}

export interface Data { experiments: Experiment[] }
export interface Counts { planned: number; started: number; completed: number; failed: number; not_started: number }
export type WorkflowStatus = 'draft' | 'planned' | 'observing' | 'ready' | 'must_stop' | 'waiting_handover' | 'accepted';
export interface ExperimentAnalysis {
  id: string;
  baseline: Counts;
  prototype: Counts;
  stop_triggered: boolean;
  can_continue: boolean;
  status: WorkflowStatus;
}
export interface Analysis { experiments: ExperimentAnalysis[] }

export const workflowLabels: Record<WorkflowStatus, string> = {
  draft: 'Нужно согласие владельцев', planned: 'Объём принят, можно наблюдать', observing: 'Наблюдения собираются',
  ready: 'Критерии продолжения выполнены', must_stop: 'Stop-rule: остановить',
  waiting_handover: 'Решение закрыто, следующий шаг не принят', accepted: 'Следующий шаг добровольно принят',
};
export const phaseLabels: Record<Phase, string> = { baseline: 'Baseline', prototype: 'Прототип' };
export const observationLabels: Record<ObservationStatus, string> = {
  completed: 'Без помощи, корректно', failed: 'Ошибка, помощь или тайм-аут', not_started: 'Не начато',
};
export const outcomeLabels: Record<Outcome, string> = {
  continue: 'Continue: следующий ограниченный этап', stop: 'Stop: остановить и вернуть прежний порядок',
  iterate: 'Iterate: исправить план или прототип',
};

export function localNow(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function isoTime(local: string): string {
  const date = new Date(local);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

// This opt-in fixture is explicitly fictional. It never populates the default workspace.
export function fictionalExample(): Data {
  const accepted = new Date(Date.now() - 60 * 60_000).toISOString();
  const observed = new Date(Date.now() - 30 * 60_000).toISOString();
  return { experiments: [{
    id: crypto.randomUUID(), title: 'ВЫМЫШЛЕННЫЙ ПРИМЕР: черновик карточки',
    hypothesis: 'В двух синтетических задачах контрольный список поможет завершить карточку без подсказки.',
    scenario: 'Учебная карточка: описание, ожидаемый результат и ответственная роль. Никаких реальных имён и данных.',
    baseline_method: 'Обычный текстовый шаблон на тех же двух учебных задачах.',
    limitations: 'Все наблюдения вымышлены. Две повторные задачи не доказывают эффективность; возможен эффект обучения.',
    planned_per_phase: 2, minimum_successes: 2, limit_seconds: 120,
    stop_rule: 'Потеря исходной постановки или нарушение обязательного правила.',
    process_owner: 'Вымышленный координатор', technical_owner: 'Вымышленный разработчик',
    review_date: new Date().toISOString().slice(0, 10), owners_accepted: true,
    scope_evidence: 'Учебная запись: обе вымышленные роли согласились на одну сессию.', scope_accepted_at: accepted,
    observations: [
      { id: crypto.randomUUID(), task_id: 'T1', phase: 'baseline', status: 'completed', elapsed_seconds: 80, stop_triggered: false, observed_at: observed, evidence: 'Вымышленно: три поля заполнены без помощи.' },
      { id: crypto.randomUUID(), task_id: 'T2', phase: 'baseline', status: 'failed', elapsed_seconds: 120, stop_triggered: false, observed_at: observed, evidence: 'Вымышленно: понадобилась подсказка об ожидаемом результате.' },
      { id: crypto.randomUUID(), task_id: 'T1', phase: 'prototype', status: 'completed', elapsed_seconds: 60, stop_triggered: false, observed_at: observed, evidence: 'Вымышленно: три поля заполнены без помощи.' },
      { id: crypto.randomUUID(), task_id: 'T2', phase: 'prototype', status: 'completed', elapsed_seconds: 70, stop_triggered: false, observed_at: observed, evidence: 'Вымышленно: три поля заполнены без помощи.' },
    ], decision: null, handover: null,
  }] };
}

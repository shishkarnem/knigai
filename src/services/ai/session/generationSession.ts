export class GenerationAbortedError extends Error {
  public readonly partialCharged: boolean;
  public readonly spentLetters: number;

  constructor(
    message = 'Генерация остановлена пользователем',
    options?: { partialCharged?: boolean; spentLetters?: number }
  ) {
    super(message);
    this.name = 'GenerationAbortedError';
    this.partialCharged = Boolean(options?.partialCharged);
    this.spentLetters = Number(options?.spentLetters || 0);
  }
}

export function isGenerationAbortedError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof GenerationAbortedError) return true;
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'GenerationAbortedError') return true;
    if (/остановлен|aborted/i.test(err.message)) return true;
  }
  return false;
}

export interface GenerationSessionState {
  active: boolean;
  summaryMode: boolean;
  title: string;
  subtitle: string;
  statusText: string;
  startedAt: number;
  endedAt?: number;
  totalSteps: number;
  completedSteps: number;
  estimatedLetters: number;
  spentLetters: number;
  appliedItems: string[];
  stopRequested: boolean;
  stoppedByUser: boolean;
}

export interface GenerationRunContext {
  signal: AbortSignal;
  setStatus: (text: string) => void;
  setProgress: (completed: number, total?: number) => void;
  addApplied: (label: string) => void;
  isCancelled: () => boolean;
}

const INITIAL_STATE: GenerationSessionState = {
  active: false,
  summaryMode: false,
  title: '',
  subtitle: '',
  statusText: '',
  startedAt: 0,
  endedAt: undefined,
  totalSteps: 0,
  completedSteps: 0,
  estimatedLetters: 0,
  spentLetters: 0,
  appliedItems: [],
  stopRequested: false,
  stoppedByUser: false,
};

let currentState: GenerationSessionState = { ...INITIAL_STATE };
let activeAbortController: AbortController | null = null;
let activeStopHook: (() => void) | undefined;
const listeners = new Set<() => void>();

function notify() {
  currentState = { ...currentState };
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  });
}

export function subscribeGenerationSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getGenerationSessionSnapshot(): GenerationSessionState {
  return currentState;
}

export function getActiveGenerationSignal(): AbortSignal | undefined {
  return activeAbortController?.signal;
}

export function isGenerationStopRequested(): boolean {
  return Boolean(currentState.stopRequested || activeAbortController?.signal.aborted);
}

export function updateGenerationStatus(text: string): void {
  if (!currentState.active) return;
  currentState.statusText = text;
  notify();
}

export function updateGenerationProgress(completed: number, total?: number): void {
  if (!currentState.active) return;
  currentState.completedSteps = completed;
  if (typeof total === 'number') {
    currentState.totalSteps = total;
  }
  notify();
}

export function trackSessionSpentLetters(letters: number): void {
  if (!currentState.active) return;
  const val = Math.max(0, Math.round(letters || 0));
  if (val > 0) {
    currentState.spentLetters += val;
    notify();
  }
}

export function recordSessionAppliedItem(label: string): void {
  if (!currentState.active || !label.trim()) return;
  const clean = label.trim();
  if (!currentState.appliedItems.includes(clean)) {
    currentState.appliedItems = [...currentState.appliedItems, clean];
    notify();
  }
}

export function requestStopGeneration(): void {
  if (!currentState.active || currentState.stopRequested) return;
  currentState.stopRequested = true;
  currentState.stoppedByUser = true;
  currentState.statusText =
    'Остановка генерации... Фиксируем фактически списанные буквы и применяем уже полученные данные.';
  notify();

  try {
    activeStopHook?.();
  } catch {
    // ignore
  }

  try {
    activeAbortController?.abort(new GenerationAbortedError('Операция остановлена пользователем'));
  } catch {
    // ignore
  }
}

export function dismissGenerationSummary(): void {
  activeAbortController = null;
  activeStopHook = undefined;
  currentState = { ...INITIAL_STATE };
  notify();
}

export async function runWithGenerationOverlay<T>(
  options: {
    title: string;
    subtitle?: string;
    initialStatus?: string;
    totalSteps?: number;
    estimatedLetters?: number;
    onRequestStop?: () => void;
  },
  task: (ctx: GenerationRunContext) => Promise<T>
): Promise<{ result?: T; stopped: boolean; spentLetters: number; appliedItems: string[] }> {
  // Prevent overlapping orphaned controllers
  const controller = new AbortController();
  activeAbortController = controller;
  activeStopHook = options.onRequestStop;

  currentState = {
    active: true,
    summaryMode: false,
    title: options.title,
    subtitle: options.subtitle || '',
    statusText: options.initialStatus || 'Подготовка запроса и запуск нейросети...',
    startedAt: Date.now(),
    endedAt: undefined,
    totalSteps: options.totalSteps || 0,
    completedSteps: 0,
    estimatedLetters: options.estimatedLetters || 0,
    spentLetters: 0,
    appliedItems: [],
    stopRequested: false,
    stoppedByUser: false,
  };
  notify();

  const ctx: GenerationRunContext = {
    signal: controller.signal,
    setStatus: (text: string) => updateGenerationStatus(text),
    setProgress: (completed: number, total?: number) => updateGenerationProgress(completed, total),
    addApplied: (label: string) => recordSessionAppliedItem(label),
    isCancelled: () => Boolean(currentState.stopRequested || controller.signal.aborted),
  };

  let wasStopped = false;
  try {
    const result = await task(ctx);
    wasStopped = currentState.stopRequested || currentState.stoppedByUser || controller.signal.aborted;

    if (wasStopped) {
      currentState.active = false;
      currentState.summaryMode = true;
      currentState.endedAt = Date.now();
      currentState.statusText =
        'Генерация остановлена. Потраченные буквы не возвращаются; готовые данные применены.';
      notify();
    } else {
      activeAbortController = null;
      activeStopHook = undefined;
      currentState = { ...INITIAL_STATE };
      notify();
    }

    return {
      result,
      stopped: wasStopped,
      spentLetters: currentState.spentLetters,
      appliedItems: [...currentState.appliedItems],
    };
  } catch (err) {
    if (isGenerationAbortedError(err) || currentState.stopRequested || controller.signal.aborted) {
      currentState.active = false;
      currentState.summaryMode = true;
      currentState.stoppedByUser = true;
      currentState.endedAt = Date.now();
      currentState.statusText =
        'Генерация остановлена. С баланса списано ровно за фактически выполненные операции, полученные данные сохранены.';
      notify();
      return {
        stopped: true,
        spentLetters: currentState.spentLetters,
        appliedItems: [...currentState.appliedItems],
      };
    }

    activeAbortController = null;
    activeStopHook = undefined;
    currentState = { ...INITIAL_STATE };
    notify();
    throw err;
  }
}

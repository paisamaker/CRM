import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export type ConfirmTone = 'default' | 'danger' | 'warning';

export type ConfirmOptions = {
  title: string;
  description?: string;
  /** Optional detail line under description (e.g. record name) */
  detail?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** If true, only a single OK button (alert style) */
  alertOnly?: boolean;
};

type Pending = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type ConfirmApi = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: Omit<ConfirmOptions, 'alertOnly' | 'cancelLabel'>) => Promise<void>;
};

const ConfirmContext = createContext<ConfirmApi | null>(null);

let externalApi: ConfirmApi | null = null;

/** Imperative confirm — works outside React components after provider mounts */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!externalApi) {
    // Fallback only before provider mounts (should be rare)
    return Promise.resolve(window.confirm([options.title, options.description].filter(Boolean).join('\n\n')));
  }
  return externalApi.confirm(options);
}

/** Imperative alert pop card */
export function alertDialog(
  options: Omit<ConfirmOptions, 'alertOnly' | 'cancelLabel'>
): Promise<void> {
  if (!externalApi) {
    window.alert([options.title, options.description].filter(Boolean).join('\n\n'));
    return Promise.resolve();
  }
  return externalApi.alert(options);
}

export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const close = useCallback((result: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    current.resolve(result);
    setPending(null);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        tone: 'default',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        ...options,
        resolve,
      });
    });
  }, []);

  const alert = useCallback(
    async (options: Omit<ConfirmOptions, 'alertOnly' | 'cancelLabel'>) => {
      await confirm({
        ...options,
        alertOnly: true,
        confirmLabel: options.confirmLabel || 'OK',
        tone: options.tone || 'default',
      });
    },
    [confirm]
  );

  const api = useMemo(() => ({ confirm, alert }), [confirm, alert]);
  externalApi = api;

  const tone = pending?.tone || 'default';
  const Icon = tone === 'danger' ? Trash2 : tone === 'warning' ? AlertTriangle : Info;

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title || 'Confirm'}
        description={pending?.description}
        size="sm"
        preventDismiss={false}
        overlayClassName="z-[80]"
        className="z-[81]"
        footer={
          pending?.alertOnly ? (
            <Button
              className={cn(
                tone === 'danger' && 'bg-rose-600 hover:bg-rose-700 text-white',
                tone === 'default' && 'bg-teal-700 hover:bg-teal-800 text-white'
              )}
              onClick={() => close(true)}
            >
              {pending.confirmLabel || 'OK'}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                {pending?.cancelLabel || 'Cancel'}
              </Button>
              <Button
                variant={tone === 'danger' ? 'danger' : 'teal'}
                className={cn(tone === 'warning' && 'bg-amber-600 hover:bg-amber-700 text-white')}
                onClick={() => close(true)}
              >
                {pending?.confirmLabel || 'Confirm'}
              </Button>
            </>
          )
        }
      >
        <div className="flex gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
              tone === 'danger' && 'border-rose-200 bg-rose-50 text-rose-700',
              tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
              tone === 'default' && 'border-teal-200 bg-teal-50 text-teal-700'
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            {pending?.detail ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm text-slate-700">
                {pending.detail}
              </div>
            ) : (
              <p className="text-sm text-slate-600">This action needs your confirmation.</p>
            )}
            {tone === 'danger' ? (
              <p className="text-[11px] font-medium text-rose-700/90">This may not be easy to undo.</p>
            ) : null}
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

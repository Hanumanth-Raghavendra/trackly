import { X } from 'lucide-react';
import { Dialog as RDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One dialog component that becomes a bottom sheet on phones (thumb-reachable, feels native
 * in the Android app) and a centred panel on larger screens.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-[#0a1230]/45 backdrop-blur-[2px] data-[state=open]:animate-[rise-fade_150ms_ease-out]" />
        <RDialog.Content
          className={cn(
            'fixed z-50 flex max-h-[92dvh] w-full flex-col bg-surface text-ink shadow-2xl outline-none',
            'inset-x-0 bottom-0 rounded-t-[24px] sm:inset-x-auto sm:bottom-auto sm:top-[8vh] sm:left-1/2 sm:-translate-x-1/2 sm:rounded-[var(--radius-panel)] sm:border sm:border-lane',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
            'data-[state=open]:animate-rise',
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-lane-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
            <div>
              <RDialog.Title className="text-lg font-bold">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-0.5 text-sm text-ink-soft">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{title}</RDialog.Description>
              )}
            </div>
            <RDialog.Close className="-mr-2 rounded-lg p-2 text-ink-faint hover:bg-surface-2 hover:text-ink" aria-label="Close">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
          {footer && (
            <div className="safe-bottom flex items-center justify-end gap-2 border-t border-lane px-5 py-3 sm:px-6">{footer}</div>
          )}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  danger,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <button className="h-10 rounded-[var(--radius-control)] px-4 text-sm font-semibold text-ink-soft hover:bg-surface-2" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            className={cn(
              'h-10 rounded-[var(--radius-control)] px-4 text-sm font-semibold text-white',
              danger ? 'bg-signal' : 'bg-track',
            )}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{body}</p>
    </Dialog>
  );
}

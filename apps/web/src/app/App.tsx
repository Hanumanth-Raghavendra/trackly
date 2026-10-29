import { QueryClientProvider } from '@tanstack/react-query';
import { Tooltip } from 'radix-ui';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { queryClient } from '@/api/hooks';
import { refreshSession } from '@/api/client';
import { useTheme } from '@/lib/theme';
import { initNative } from '@/lib/native';
import { router } from './router';

export function App() {
  const theme = useTheme();

  // Restore the session from the refresh token (cookie on web, secure storage on Android).
  useEffect(() => {
    void refreshSession();
    void initNative();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider>
        <RouterProvider router={router} />
        <Toaster
          position="bottom-center"
          theme={theme === 'system' ? 'system' : theme}
          offset={{ bottom: 96 }}
          mobileOffset={{ bottom: 92 }}
          toastOptions={{
            classNames: {
              toast: '!rounded-[14px] !border-lane !bg-surface !text-ink !font-sans',
              description: '!text-ink-soft',
            },
          }}
        />
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}

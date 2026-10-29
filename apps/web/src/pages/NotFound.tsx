import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center">
      <div>
        <p className="font-display text-[120px] leading-none text-track num">404</p>
        <h1 className="mt-2 text-xl font-bold">Off the track</h1>
        <p className="mt-2 text-ink-soft">This page doesn't exist. It may have moved, or the link is wrong.</p>
        <Button asChild className="mt-6">
          <Link to="/">Back to Trackly</Link>
        </Button>
      </div>
    </main>
  );
}

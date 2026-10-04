import { CircleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api';
import { useVerifyPortalLink } from '@/lib/portal';
import { PortalBrand, usePortalOrg } from './portal-layout';

/**
 * The magic link is consumed here with a POST (not by the GET that opens the page), so email
 * security scanners that pre-fetch links can't burn the token before the client clicks it.
 */
export function PortalVerifyPage() {
  const org = usePortalOrg();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const verify = useVerifyPortalLink(org.slug);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  const token = params.get('token') ?? '';
  const nextParam = params.get('next');
  const next = nextParam?.startsWith(`/portal/${org.slug}/`)
    ? nextParam
    : `/portal/${org.slug}/invoices`;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    verify.mutate(token, {
      onSuccess: () => navigate(next, { replace: true }),
      onError: async () => {
        // A used link is fine if this browser is already signed in (e.g. clicked twice).
        const signedIn = await api(`/portal/${org.slug}/me`).then(
          () => true,
          () => false,
        );
        if (signedIn) navigate(next, { replace: true });
        else setFailed(true);
      },
    });
  }, [token, next, org.slug, navigate, verify]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <PortalBrand org={org} size="lg" />
      <Card className="mt-8 w-full max-w-md">
        <CardContent className="p-8 text-center">
          {failed ? (
            <>
              <CircleAlert className="mx-auto size-10 text-muted-foreground" />
              <h1 className="mt-4 text-xl font-semibold">This link has expired</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign-in links work once and expire after a while. Request a new one below.
              </p>
              <Button className="mt-6" asChild>
                <Link to={`/portal/${org.slug}?next=${encodeURIComponent(next)}`}>
                  Send me a new link
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Spinner className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Signing you in…</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
